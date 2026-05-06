using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Reminders are now a fixed set of <see cref="SlotCount"/> slots
/// per user. Created at signup, never added or deleted — the user
/// only updates time, message, and on/off state on the slots they
/// already have. The legacy IsDefault flag is no longer used; all
/// slots render identically in the UI.
/// </summary>
[ApiController]
[Route("v1/reminders")]
[Authorize]
public class RemindersController(AppDbContext db) : ControllerBase
{
    /// <summary>How many reminder slots every user gets.</summary>
    public const int SlotCount = 5;

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    // ── GET /v1/reminders ────────────────────────────────────────────────────
    // Lazy-creates the five slots if they don't exist yet (handles legacy
    // accounts that pre-date the fixed-slots refactor).
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var existing = await db.Reminders
            .Where(r => r.UserId == UserId)
            .CountAsync();

        if (existing < SlotCount)
        {
            var now = DateTime.UtcNow;
            for (var i = existing; i < SlotCount; i++)
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

    // ── PUT /v1/reminders/{id} ───────────────────────────────────────────────
    // Update an existing slot — all five behave identically. No tier
    // gating: every user can edit time, message, and on/off state on
    // every slot they own.
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateReminderRequest request)
    {
        var reminder = await db.Reminders.FirstOrDefaultAsync(r => r.Id == id && r.UserId == UserId);
        if (reminder is null) return NotFound();

        if (!TimeOnly.TryParseExact(request.Time, "HH:mm", out var time))
            return BadRequest(new { error = "Invalid time format. Use HH:mm (e.g. '08:30')." });

        reminder.Time      = time;
        reminder.Message   = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        reminder.IsEnabled = request.IsEnabled;
        reminder.UpdatedAt = DateTime.UtcNow;
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
    // Called once when a user enables push notifications and no reminders
    // are currently on. Flips slot #1 (the first by CreatedAt) to enabled
    // so they get at least one active reminder out of the box. No-op if
    // any reminder is already enabled.
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
}
