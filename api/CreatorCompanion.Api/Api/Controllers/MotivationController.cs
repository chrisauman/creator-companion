using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/motivation")]
[Authorize]
public class MotivationController(AppDbContext db) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// Returns today's motivation entry for the current paid user.
    /// - Same entry is returned all day (keyed on the user's local date).
    /// - Rotates through all entries with no repeats; resets when exhausted.
    /// - Returns 204 if the user is free-tier or has disabled motivation cards.
    /// </summary>
    [HttpGet("today")]
    public async Task<IActionResult> GetToday()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        // Only paid users with the feature enabled
        if (user.Tier != AccountTier.Paid || !user.ShowMotivation)
            return NoContent();

        // Total entries in library
        var totalEntries = await db.MotivationEntries.CountAsync();
        if (totalEntries == 0) return NoContent();

        // Today in the user's timezone
        var userTz    = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today     = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));

        // Already assigned an entry for today?
        var todayRecord = await db.UserMotivationShown
            .Include(s => s.Entry)
            .FirstOrDefaultAsync(s => s.UserId == UserId && s.ShownDate == today);

        if (todayRecord is not null)
            return Ok(MapEntry(todayRecord.Entry));

        // Find unseen entries for this user
        var seenIds = await db.UserMotivationShown
            .Where(s => s.UserId == UserId)
            .Select(s => s.MotivationEntryId)
            .ToListAsync();

        // If all have been seen, reset history and start over
        if (seenIds.Count >= totalEntries)
        {
            var history = await db.UserMotivationShown
                .Where(s => s.UserId == UserId)
                .ToListAsync();
            db.UserMotivationShown.RemoveRange(history);
            await db.SaveChangesAsync();
            seenIds = [];
        }

        // Pick a random unseen entry
        var candidate = await db.MotivationEntries
            .Where(e => !seenIds.Contains(e.Id))
            .OrderBy(_ => Guid.NewGuid())   // random via EF
            .FirstAsync();

        // Record it as shown today
        db.UserMotivationShown.Add(new UserMotivationShown
        {
            UserId            = UserId,
            MotivationEntryId = candidate.Id,
            ShownDate         = today
        });
        await db.SaveChangesAsync();

        return Ok(MapEntry(candidate));
    }

    /// <summary>Toggle daily motivation cards on/off for the current user.</summary>
    [HttpPatch("preference")]
    public async Task<IActionResult> UpdatePreference([FromBody] UpdateMotivationPreferenceRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        user.ShowMotivation = request.Show;
        user.UpdatedAt      = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { showMotivation = user.ShowMotivation });
    }

    private static MotivationEntryResponse MapEntry(MotivationEntry e) =>
        new(e.Id, e.Title, e.Takeaway, e.FullContent, e.Category.ToString(), e.CreatedAt, e.UpdatedAt);
}
