using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController(AppDbContext db, IAuditService audit) : ControllerBase
{
    private Guid AdminId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

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
            query = query.Where(u =>
                u.Email.Contains(s) ||
                u.FirstName.ToLower().Contains(s) ||
                u.LastName.ToLower().Contains(s));
        }

        var total = await query.CountAsync();
        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id,
                u.FirstName,
                u.LastName,
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
                u.FirstName,
                u.LastName,
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
            user.Id, user.FirstName, user.LastName, user.Email, user.Tier, user.IsActive, user.IsAdmin,
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
        await audit.LogAsync("admin.user_pause_cancelled", AdminId, $"target={id}");
        return NoContent();
    }

    [HttpDelete("users/{id:guid}/pauses/all")]
    public async Task<IActionResult> ClearAllPauses(Guid id)
    {
        var pauses = await db.Pauses.Where(p => p.UserId == id).ToListAsync();
        db.Pauses.RemoveRange(pauses);
        await db.SaveChangesAsync();
        await audit.LogAsync("admin.user_pauses_cleared", AdminId, $"target={id} count={pauses.Count}");
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

        // Check email uniqueness if it changed
        if (!string.Equals(user.Email, request.Email, StringComparison.OrdinalIgnoreCase))
        {
            if (await db.Users.AnyAsync(u => u.Id != id && u.Email == request.Email))
                return Conflict(new { error = "Email is already in use." });
        }

        // Snapshot security-relevant fields before mutation so the audit
        // log records the actual delta — promotion to admin and tier
        // changes are the things you most need a trail of.
        var wasAdmin           = user.IsAdmin;
        var wasActive          = user.IsActive;
        var oldTier            = user.Tier;
        var passwordChanged    = !string.IsNullOrWhiteSpace(request.NewPassword);

        user.FirstName           = request.FirstName.Trim();
        user.LastName            = request.LastName.Trim();
        user.Email               = request.Email;
        user.Tier                = tier;
        user.TimeZoneId          = request.TimeZoneId;
        user.IsAdmin             = request.IsAdmin;
        user.IsActive            = request.IsActive;
        user.OnboardingCompleted = request.OnboardingCompleted;
        user.TrialEndsAt         = request.TrialEndsAt;
        user.UpdatedAt           = DateTime.UtcNow;

        if (passwordChanged)
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, 12);

        await db.SaveChangesAsync();

        // Emit fine-grained audit entries for every security-relevant
        // change so a compromised admin can be retraced.
        if (wasAdmin != user.IsAdmin)
            await audit.LogAsync(user.IsAdmin ? "admin.promoted_user" : "admin.demoted_user",
                AdminId, $"target={id}");
        if (wasActive != user.IsActive)
            await audit.LogAsync(user.IsActive ? "admin.reactivated_user" : "admin.deactivated_user",
                AdminId, $"target={id}");
        if (oldTier != user.Tier)
            await audit.LogAsync("admin.tier_changed",
                AdminId, $"target={id} from={oldTier} to={user.Tier}");
        if (passwordChanged)
            await audit.LogAsync("admin.password_reset", AdminId, $"target={id}");

        return Ok(new
        {
            user.Id, user.FirstName, user.LastName, user.Email,
            Tier = user.Tier.ToString(),
            user.TimeZoneId, user.IsAdmin, user.IsActive,
            user.OnboardingCompleted, user.TrialEndsAt, user.UpdatedAt
        });
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(
        Guid id,
        [FromServices] IStorageService storage,
        [FromServices] IStripeService stripe)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        // Cancel an active Stripe subscription so the platform stops
        // charging a deleted user. Mirrors the self-delete path.
        if (!string.IsNullOrEmpty(user.StripeSubscriptionId))
        {
            try { await stripe.CancelSubscriptionAsync(user.StripeSubscriptionId); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not cancel Stripe subscription for user {id}: {ex.Message}"); }
        }

        // Collect media paths before cascade so we can clean R2 after.
        var mediaPaths = await db.EntryMedia
            .Where(m => m.UserId == id)
            .Select(m => m.StoragePath)
            .ToListAsync();

        // Delete entries first (cascades EntryTags and EntryMedia)
        var entries = await db.Entries.Where(e => e.UserId == id).ToListAsync();
        db.Entries.RemoveRange(entries);
        await db.SaveChangesAsync();

        // R2 cleanup
        foreach (var path in mediaPaths)
        {
            try { await storage.DeleteAsync(path); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not delete media {path}: {ex.Message}"); }
        }
        if (!string.IsNullOrEmpty(user.ProfileImagePath))
        {
            try { await storage.DeleteAsync(user.ProfileImagePath); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not delete avatar for user {id}: {ex.Message}"); }
        }

        // Delete tokens / push subs / reminders / verification tokens
        // explicitly (mirrors self-delete path; some have no cascade FK).
        var resetTokens = await db.PasswordResetTokens.Where(t => t.UserId == id).ToListAsync();
        db.PasswordResetTokens.RemoveRange(resetTokens);

        var verifyTokens = await db.EmailVerificationTokens.Where(t => t.UserId == id).ToListAsync();
        db.EmailVerificationTokens.RemoveRange(verifyTokens);

        var pushSubs = await db.PushSubscriptions.Where(s => s.UserId == id).ToListAsync();
        db.PushSubscriptions.RemoveRange(pushSubs);

        var reminders = await db.Reminders.Where(r => r.UserId == id).ToListAsync();
        db.Reminders.RemoveRange(reminders);

        await db.SaveChangesAsync();

        // Delete user — Drafts, Pauses, RefreshTokens, Journals, Tags all cascade
        db.Users.Remove(user);
        await db.SaveChangesAsync();
        await audit.LogAsync("admin.deleted_user", AdminId, $"target={id} email={user.Email}");

        return NoContent();
    }

    [HttpPatch("users/{id:guid}/tier")]
    public async Task<IActionResult> SetTier(Guid id, [FromBody] SetTierRequest request)
    {
        if (!Enum.TryParse<AccountTier>(request.Tier, ignoreCase: true, out var tier))
            return BadRequest(new { error = "Invalid tier. Use 'Free' or 'Paid'." });

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var oldTier = user.Tier;
        user.Tier = tier;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        if (oldTier != user.Tier)
            await audit.LogAsync("admin.tier_changed", AdminId, $"target={id} from={oldTier} to={user.Tier}");

        return Ok(new { id = user.Id, tier = user.Tier.ToString() });
    }

    [HttpPatch("users/{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetActiveRequest request)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var wasActive = user.IsActive;
        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;

        // If we're deactivating, revoke every active refresh token now
        // rather than waiting for the next RefreshAsync to notice the
        // flipped IsActive. Otherwise a malicious session can keep
        // refreshing access tokens for up to 30 days.
        if (wasActive && !user.IsActive)
        {
            var now = DateTime.UtcNow;
            await db.RefreshTokens
                .Where(rt => rt.UserId == id && rt.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, now));
        }

        await db.SaveChangesAsync();
        if (wasActive != user.IsActive)
            await audit.LogAsync(user.IsActive ? "admin.reactivated_user" : "admin.deactivated_user",
                AdminId, $"target={id}");

        return Ok(new { id = user.Id, isActive = user.IsActive });
    }

    [HttpGet("users/{id:guid}/push-subscriptions")]
    public async Task<IActionResult> GetPushSubscriptions(Guid id)
    {
        var subs = await db.PushSubscriptions
            .Where(s => s.UserId == id)
            .OrderByDescending(s => s.LastSeenAt)
            .Select(s => new
            {
                s.Id,
                s.Platform,
                EndpointPreview = s.Endpoint.Length > 60 ? s.Endpoint.Substring(0, 60) + "…" : s.Endpoint,
                s.CreatedAt,
                s.LastSeenAt
            })
            .ToListAsync();

        return Ok(subs);
    }

    [HttpPost("users/{id:guid}/test-notification")]
    public async Task<IActionResult> SendTestNotification(Guid id, [FromServices] IPushSender sender)
    {
        var subs = await db.PushSubscriptions
            .Where(s => s.UserId == id)
            .ToListAsync();

        if (!subs.Any())
            return Ok(new { sent = 0, failed = 0, message = "No push subscriptions found for this user." });

        int sent = 0, failed = 0;
        var expiredIds = new List<Guid>();

        foreach (var sub in subs)
        {
            try
            {
                // Plain copy — no emoji (per project style; the in-app
                // notifications use SVG icons consistently).
                await sender.SendAsync(sub, "Creator Companion", "Test notification — your push is working.");
                sent++;
            }
            catch (WebPush.WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
            {
                expiredIds.Add(sub.Id);
                failed++;
            }
            catch
            {
                failed++;
            }
        }

        if (expiredIds.Any())
        {
            var expired = await db.PushSubscriptions.Where(s => expiredIds.Contains(s.Id)).ToListAsync();
            db.PushSubscriptions.RemoveRange(expired);
            await db.SaveChangesAsync();
        }

        return Ok(new { sent, failed, message = $"Sent to {sent} device(s). {failed} failed/expired." });
    }

    /// <summary>
    /// Admin view of a user's entries: METADATA ONLY. We do NOT return
    /// any of the user's writing — not title, not content, not preview,
    /// not tags, not mood. Admin tooling sees only the dates, sources,
    /// and counts needed to support account management (e.g. "they
    /// have 47 entries since Jan 1"). Per the privacy promise: site
    /// admins cannot view your entry content. This endpoint enforces
    /// that promise at the API layer — there is no admin code path
    /// that returns entry content fields. The May 2026 privacy pass
    /// removed Preview + WordCount (both leaked plaintext of the
    /// underlying content text).
    /// </summary>
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
                Source = e.EntrySource.ToString(),
                MediaCount = e.Media.Count(m => m.DeletedAt == null)
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, entries });
    }
}

public record SetTierRequest(string Tier);
public record SetActiveRequest(bool IsActive);
