using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/reminders")]
[Authorize]
public class RemindersController(AppDbContext db) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    private bool IsPaid => User.HasClaim("tier", "Paid");

    // ── GET /v1/reminders ────────────────────────────────────────────────────
    // Lazy-creates the default noon reminder if it doesn't exist yet (handles
    // accounts created before this feature shipped).
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // Ensure every account has a default reminder
        var hasDefault = await db.Reminders.AnyAsync(r => r.UserId == UserId && r.IsDefault);
        if (!hasDefault)
        {
            db.Reminders.Add(new Reminder
            {
                UserId    = UserId,
                Time      = new TimeOnly(12, 0),
                Message   = null,
                IsEnabled = true,
                IsDefault = true
            });
            await db.SaveChangesAsync();
        }

        var reminders = await db.Reminders
            .Where(r => r.UserId == UserId)
            .OrderByDescending(r => r.IsDefault)   // default reminder first
            .ThenBy(r => r.Time)
            .Select(r => new ReminderResponse(
                r.Id,
                r.Time.ToString("HH:mm"),
                r.Message,
                r.IsEnabled,
                r.IsDefault,
                r.CreatedAt))
            .ToListAsync();

        return Ok(reminders);
    }

    // ── POST /v1/reminders ───────────────────────────────────────────────────
    // Paid users only. Creates a CUSTOM (non-default) reminder.
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReminderRequest request)
    {
        if (!IsPaid)
            return BadRequest(new { error = "Custom reminders are available on the Paid plan." });

        if (!TimeOnly.TryParseExact(request.Time, "HH:mm", out var time))
            return BadRequest(new { error = "Invalid time format. Use HH:mm (e.g. '08:30')." });

        var customCount = await db.Reminders.CountAsync(r => r.UserId == UserId && !r.IsDefault);
        if (customCount >= 5)
            return BadRequest(new { error = "You can have up to 5 custom reminders." });

        var reminder = new Reminder
        {
            UserId    = UserId,
            Time      = time,
            Message   = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim(),
            IsDefault = false,
            IsEnabled = true
        };

        db.Reminders.Add(reminder);
        await db.SaveChangesAsync();

        // Sync default: off when any enabled custom reminder exists
        await SyncDefaultReminderAsync();

        return Ok(new ReminderResponse(
            reminder.Id,
            reminder.Time.ToString("HH:mm"),
            reminder.Message,
            reminder.IsEnabled,
            reminder.IsDefault,
            reminder.CreatedAt));
    }

    // ── PUT /v1/reminders/{id} ───────────────────────────────────────────────
    // All users: can update IsEnabled on any of their reminders.
    // Paid users: can also update Time and Message on any reminder (incl. default).
    // Free users: time/message are ignored (they can only toggle the default on/off).
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateReminderRequest request)
    {
        var reminder = await db.Reminders.FirstOrDefaultAsync(r => r.Id == id && r.UserId == UserId);
        if (reminder is null) return NotFound();

        if (IsPaid && !reminder.IsDefault)
        {
            // Custom reminder: paid users can update time and message
            if (!TimeOnly.TryParseExact(request.Time, "HH:mm", out var time))
                return BadRequest(new { error = "Invalid time format. Use HH:mm (e.g. '08:30')." });

            reminder.Time    = time;
            reminder.Message = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        }
        else if (IsPaid && reminder.IsDefault)
        {
            // Default reminder for paid users: allow time and message edits
            if (!TimeOnly.TryParseExact(request.Time, "HH:mm", out var time))
                return BadRequest(new { error = "Invalid time format. Use HH:mm (e.g. '08:30')." });

            reminder.Time    = time;
            reminder.Message = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        }

        reminder.IsEnabled = request.IsEnabled;
        reminder.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // When a CUSTOM reminder's enabled state changes, sync the default
        if (!reminder.IsDefault)
            await SyncDefaultReminderAsync();

        // Re-read the reminder so the response reflects any sync changes
        var updated = await db.Reminders.FindAsync(id);
        return Ok(new ReminderResponse(
            updated!.Id,
            updated.Time.ToString("HH:mm"),
            updated.Message,
            updated.IsEnabled,
            updated.IsDefault,
            updated.CreatedAt));
    }

    // ── DELETE /v1/reminders/{id} ────────────────────────────────────────────
    // The default reminder cannot be deleted — users turn it off via the toggle.
    // Custom reminders (paid users only) can be deleted.
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var reminder = await db.Reminders.FirstOrDefaultAsync(r => r.Id == id && r.UserId == UserId);
        if (reminder is null) return NotFound();

        if (reminder.IsDefault)
            return BadRequest(new { error = "The default reminder cannot be deleted. Use the toggle to turn it off." });

        db.Reminders.Remove(reminder);
        await db.SaveChangesAsync();

        // Sync default: re-enable if no enabled custom reminders remain
        await SyncDefaultReminderAsync();

        return NoContent();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Keeps the default reminder in sync with custom reminder activity.
    /// Rule: default is ON when no enabled custom reminders exist; OFF otherwise.
    /// </summary>
    private async Task SyncDefaultReminderAsync()
    {
        var hasActiveCustom = await db.Reminders
            .AnyAsync(r => r.UserId == UserId && !r.IsDefault && r.IsEnabled);

        var defaultReminder = await db.Reminders
            .FirstOrDefaultAsync(r => r.UserId == UserId && r.IsDefault);

        if (defaultReminder is null) return;

        var shouldBeEnabled = !hasActiveCustom;
        if (defaultReminder.IsEnabled != shouldBeEnabled)
        {
            defaultReminder.IsEnabled = shouldBeEnabled;
            defaultReminder.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }
}
