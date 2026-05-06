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
    /// <summary>How many reminder slots every user is normalised to.</summary>
    private const int SlotCount = 5;

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    private bool IsPaid => User.HasClaim("tier", "Paid");

    // ── GET /v1/reminders ────────────────────────────────────────────────────
    // Reminders are now a fixed set of five slots per user. This endpoint
    // lazy-creates disabled noon slots up to that count whenever the user's
    // total is short — idempotent, only adds, never removes. Existing
    // default + custom reminders count toward the five and are returned
    // alongside any new ones. Sorted by CreatedAt so "slot #1" is stable.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var existingCount = await db.Reminders
            .Where(r => r.UserId == UserId)
            .CountAsync();

        if (existingCount < SlotCount)
        {
            var now = DateTime.UtcNow;
            for (var i = existingCount; i < SlotCount; i++)
            {
                db.Reminders.Add(new Reminder
                {
                    UserId    = UserId,
                    Time      = new TimeOnly(12, 0),
                    Message   = null,
                    IsEnabled = false,
                    IsDefault = false,
                    CreatedAt = now.AddMilliseconds(i),
                    UpdatedAt = now.AddMilliseconds(i)
                });
            }
            await db.SaveChangesAsync();
        }

        var reminders = await db.Reminders
            .Where(r => r.UserId == UserId)
            .OrderBy(r => r.CreatedAt)
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
    // Update a slot — all five behave identically. Anyone can edit time,
    // message, and on/off state on any reminder they own. Tier-gating
    // and the default/custom split removed; the previous SyncDefault
    // side-effect is gone so toggling one slot never silently flips
    // another. Slots are conceptually independent now.
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateReminderRequest request)
    {
        var reminder = await db.Reminders.FirstOrDefaultAsync(r => r.Id == id && r.UserId == UserId);
        if (reminder is null) return NotFound();

        if (!TimeOnly.TryParseExact(request.Time, "HH:mm", out var time))
            return BadRequest(new { error = "Invalid time format. Use HH:mm (e.g. '08:30')." });

        // Clear LastSentAt whenever the slot is edited. The worker uses
        // LastSentAt to enforce "fire at most once per day," but if the
        // user changes the time (typically to set up an immediate test),
        // that guard would silently block the *new* schedule for the
        // rest of the day. Treat any edit as "fresh schedule, reset the
        // dedupe clock" — natural user expectation, no spam risk
        // (the time-passed match still fires only once per day).
        var timeChanged = reminder.Time != time;

        reminder.Time      = time;
        reminder.Message   = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        reminder.IsEnabled = request.IsEnabled;
        reminder.UpdatedAt = DateTime.UtcNow;
        if (timeChanged) reminder.LastSentAt = null;
        await db.SaveChangesAsync();

        return Ok(new ReminderResponse(
            reminder.Id,
            reminder.Time.ToString("HH:mm"),
            reminder.Message,
            reminder.IsEnabled,
            reminder.IsDefault,
            reminder.CreatedAt));
    }

    // ── POST /v1/reminders/auto-enable-first ─────────────────────────────────
    // Called once when the user first enables push notifications and no
    // reminders are currently on. Flips slot #1 (the oldest by CreatedAt)
    // to enabled so they immediately have one active reminder. No-op if
    // any reminder is already enabled, so it's safe to call repeatedly
    // and safe across re-enables.
    [HttpPost("auto-enable-first")]
    public async Task<IActionResult> AutoEnableFirst()
    {
        var anyEnabled = await db.Reminders.AnyAsync(r => r.UserId == UserId && r.IsEnabled);
        if (anyEnabled) return NoContent();

        var first = await db.Reminders
            .Where(r => r.UserId == UserId)
            .OrderBy(r => r.CreatedAt)
            .FirstOrDefaultAsync();

        if (first is null) return NoContent();

        first.IsEnabled = true;
        first.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── POST /v1/reminders/reset ────────────────────────────────────────────
    // Wipes every reminder for the current user and recreates exactly five
    // disabled noon slots. User-initiated only — there's a Reset button on
    // the notifications page that hits this endpoint after a confirmation
    // prompt. Useful for clearing legacy state (e.g. an account ending up
    // with 6 reminders after migration drift) and for testing the
    // push-enable auto-flip flow from a clean baseline.
    [HttpPost("reset")]
    public async Task<IActionResult> Reset()
    {
        var existing = await db.Reminders
            .Where(r => r.UserId == UserId)
            .ToListAsync();
        db.Reminders.RemoveRange(existing);

        var now = DateTime.UtcNow;
        for (var i = 0; i < SlotCount; i++)
        {
            db.Reminders.Add(new Reminder
            {
                UserId    = UserId,
                Time      = new TimeOnly(12, 0),
                Message   = null,
                IsEnabled = false,
                IsDefault = false,
                CreatedAt = now.AddMilliseconds(i),
                UpdatedAt = now.AddMilliseconds(i)
            });
        }
        await db.SaveChangesAsync();

        var reminders = await db.Reminders
            .Where(r => r.UserId == UserId)
            .OrderBy(r => r.CreatedAt)
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
