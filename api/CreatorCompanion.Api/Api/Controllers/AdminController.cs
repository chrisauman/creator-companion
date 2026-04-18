using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController(AppDbContext db) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var totalUsers = await db.Users.CountAsync();
        var freeUsers = await db.Users.CountAsync(u => u.Tier == AccountTier.Free);
        var paidUsers = await db.Users.CountAsync(u => u.Tier == AccountTier.Paid);
        var activeUsers = await db.Users.CountAsync(u => u.IsActive);
        var totalEntries = await db.Entries.CountAsync(e => e.DeletedAt == null);
        var totalJournals = await db.Journals.CountAsync();

        var last30Days = DateTime.UtcNow.AddDays(-30);
        var newUsersLast30Days = await db.Users.CountAsync(u => u.CreatedAt >= last30Days);
        var entriesLast30Days = await db.Entries.CountAsync(e => e.DeletedAt == null && e.CreatedAt >= last30Days);

        var totalMediaCount = await db.EntryMedia.CountAsync(m => m.DeletedAt == null);
        var totalMediaBytes = await db.EntryMedia
            .Where(m => m.DeletedAt == null)
            .SumAsync(m => (long?)m.FileSizeBytes) ?? 0L;

        return Ok(new
        {
            totalUsers,
            freeUsers,
            paidUsers,
            activeUsers,
            totalEntries,
            totalJournals,
            newUsersLast30Days,
            entriesLast30Days,
            totalMediaCount,
            totalMediaBytes
        });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 25, [FromQuery] string? search = null)
    {
        var query = db.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(u => u.Email.Contains(s) || u.Username.Contains(s));
        }

        var total = await query.CountAsync();
        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                Tier = u.Tier.ToString(),
                u.IsActive,
                u.IsAdmin,
                u.OnboardingCompleted,
                u.CreatedAt,
                u.TrialEndsAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, users });
    }

    [HttpGet("users/{id:guid}")]
    public async Task<IActionResult> GetUser(Guid id)
    {
        var user = await db.Users
            .Where(u => u.Id == id)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                Tier = u.Tier.ToString(),
                u.IsActive,
                u.IsAdmin,
                u.OnboardingCompleted,
                u.TimeZoneId,
                u.CreatedAt,
                u.UpdatedAt,
                u.TrialEndsAt,
                EntryCount = u.Entries.Count(e => e.DeletedAt == null),
                JournalCount = u.Journals.Count()
            })
            .FirstOrDefaultAsync();

        if (user is null) return NotFound();

        // Pause info
        var activePause = await db.Pauses
            .Where(p => p.UserId == id && p.Status == Domain.Enums.PauseStatus.Active)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new { p.Id, p.StartDate, p.EndDate, p.Reason })
            .FirstOrDefaultAsync();

        var userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var monthEnd = new DateOnly(today.Year, today.Month, DateTime.DaysInMonth(today.Year, today.Month));

        var monthPauses = await db.Pauses
            .Where(p => p.UserId == id && p.StartDate <= monthEnd && p.EndDate >= monthStart)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync();

        int pauseDaysUsedThisMonth = monthPauses.Sum(p =>
        {
            var s = p.StartDate > monthStart ? p.StartDate : monthStart;
            var e = p.EndDate   < monthEnd   ? p.EndDate   : monthEnd;
            return e >= s ? e.DayNumber - s.DayNumber + 1 : 0;
        });

        return Ok(new
        {
            user.Id, user.Username, user.Email, user.Tier, user.IsActive, user.IsAdmin,
            user.OnboardingCompleted, user.TimeZoneId, user.CreatedAt, user.UpdatedAt,
            user.TrialEndsAt, user.EntryCount, user.JournalCount,
            ActivePause = activePause,
            PauseDaysUsedThisMonth = pauseDaysUsedThisMonth
        });
    }

    [HttpDelete("users/{id:guid}/pause")]
    public async Task<IActionResult> CancelUserPause(Guid id)
    {
        var pause = await db.Pauses
            .FirstOrDefaultAsync(p => p.UserId == id && p.Status == Domain.Enums.PauseStatus.Active);

        if (pause is null) return NotFound(new { error = "No active pause found for this user." });

        pause.Status = Domain.Enums.PauseStatus.Cancelled;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("users/{id:guid}/pauses/all")]
    public async Task<IActionResult> ClearAllPauses(Guid id)
    {
        var pauses = await db.Pauses.Where(p => p.UserId == id).ToListAsync();
        db.Pauses.RemoveRange(pauses);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] AdminUpdateUserRequest request)
    {
        if (!Enum.TryParse<AccountTier>(request.Tier, ignoreCase: true, out var tier))
            return BadRequest(new { error = "Invalid tier. Use 'Free' or 'Paid'." });

        try { TimeZoneInfo.FindSystemTimeZoneById(request.TimeZoneId); }
        catch (TimeZoneNotFoundException) { return BadRequest(new { error = "Unknown timezone ID." }); }

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        // Check uniqueness for username/email if they changed
        if (!string.Equals(user.Username, request.Username, StringComparison.OrdinalIgnoreCase))
        {
            if (await db.Users.AnyAsync(u => u.Id != id && u.Username == request.Username))
                return Conflict(new { error = "Username is already taken." });
        }
        if (!string.Equals(user.Email, request.Email, StringComparison.OrdinalIgnoreCase))
        {
            if (await db.Users.AnyAsync(u => u.Id != id && u.Email == request.Email))
                return Conflict(new { error = "Email is already in use." });
        }

        user.Username            = request.Username;
        user.Email               = request.Email;
        user.Tier                = tier;
        user.TimeZoneId          = request.TimeZoneId;
        user.IsAdmin             = request.IsAdmin;
        user.IsActive            = request.IsActive;
        user.OnboardingCompleted = request.OnboardingCompleted;
        user.TrialEndsAt         = request.TrialEndsAt;
        user.UpdatedAt           = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);

        await db.SaveChangesAsync();

        return Ok(new
        {
            user.Id, user.Username, user.Email,
            Tier = user.Tier.ToString(),
            user.TimeZoneId, user.IsAdmin, user.IsActive,
            user.OnboardingCompleted, user.TrialEndsAt, user.UpdatedAt
        });
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        // Delete entries first (cascades EntryTags and EntryMedia)
        var entries = await db.Entries.Where(e => e.UserId == id).ToListAsync();
        db.Entries.RemoveRange(entries);
        await db.SaveChangesAsync();

        // Delete any password reset tokens (no cascade configured)
        var resetTokens = await db.PasswordResetTokens.Where(t => t.UserId == id).ToListAsync();
        db.PasswordResetTokens.RemoveRange(resetTokens);
        await db.SaveChangesAsync();

        // Delete user — Drafts, Pauses, RefreshTokens, Journals, Tags all cascade
        db.Users.Remove(user);
        await db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPatch("users/{id:guid}/tier")]
    public async Task<IActionResult> SetTier(Guid id, [FromBody] SetTierRequest request)
    {
        if (!Enum.TryParse<AccountTier>(request.Tier, ignoreCase: true, out var tier))
            return BadRequest(new { error = "Invalid tier. Use 'Free' or 'Paid'." });

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.Tier = tier;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { id = user.Id, tier = user.Tier.ToString() });
    }

    [HttpPatch("users/{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetActiveRequest request)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { id = user.Id, isActive = user.IsActive });
    }

    [HttpGet("users/{id:guid}/entries")]
    public async Task<IActionResult> GetUserEntries(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var userExists = await db.Users.AnyAsync(u => u.Id == id);
        if (!userExists) return NotFound();

        var total = await db.Entries.CountAsync(e => e.UserId == id && e.DeletedAt == null);
        var entries = await db.Entries
            .Where(e => e.UserId == id && e.DeletedAt == null)
            .OrderByDescending(e => e.EntryDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new
            {
                e.Id,
                e.EntryDate,
                e.CreatedAt,
                e.ContentText,
                Source = e.EntrySource.ToString()
            })
            .ToListAsync();

        var mapped = entries.Select(e => new
        {
            e.Id,
            e.EntryDate,
            e.CreatedAt,
            Preview = e.ContentText.Length > 120 ? e.ContentText.Substring(0, 120) + "…" : e.ContentText,
            WordCount = e.ContentText.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length,
            e.Source
        }).ToList();

        return Ok(new { total, page, pageSize, entries = mapped });
    }
}

public record SetTierRequest(string Tier);
public record SetActiveRequest(bool IsActive);
