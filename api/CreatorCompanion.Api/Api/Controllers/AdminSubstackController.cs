using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin-only controller for the daily-spark reminder pipeline. The
/// background worker (SubstackPostingBackgroundService) calls into
/// ISubstackPostingService daily at 07:00 ET to email today's spark
/// to the admin for manual posting to Substack. This controller exposes
/// the on/off toggle, history of past sends, and a "send now" override.
///
/// History — this used to also expose a cookie-paste endpoint (so the
/// admin could keep refreshing the Substack session cookie) and a
/// test-post endpoint (that hit Substack's API directly). Both removed
/// when we pivoted from auto-posting to email reminders.
/// </summary>
[ApiController]
[Route("v1/admin/substack")]
[Authorize(Roles = "Admin")]
public class AdminSubstackController(
    AppDbContext db,
    ISubstackPostingService posting) : ControllerBase
{
    /// <summary>Get current settings (active toggle + health snapshot).</summary>
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// Update settings. Only the active toggle is editable — schedule
    /// + timezone + recipient are now hardcoded server-side (7am ET to
    /// chris@sanctuarymg.com). The cookie field is gone; if the request
    /// still sends one (stale frontend) we ignore it silently.
    /// </summary>
    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSubstackSettingsRequest req, CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        s.Active    = req.Active;
        s.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// Today's plan row, if one exists. Null on no-plan-yet (the worker
    /// creates it lazily — first tick after midnight local).
    /// </summary>
    [HttpGet("today")]
    public async Task<IActionResult> GetToday(CancellationToken ct)
    {
        var today = TodayInScheduleTz();
        var plan = await db.SubstackDailyPlans
            .Include(p => p.Spark)
            .FirstOrDefaultAsync(p => p.Date == today, ct);
        return Ok(plan is null ? null : MapPlan(plan));
    }

    /// <summary>
    /// Manually fire today's reminder right now, bypassing the 07:00
    /// schedule. Creates a plan if today doesn't have one. If today is
    /// already Sent, drops it and picks a fresh spark so the admin can
    /// re-test or re-receive. Returns the outcome so the UI can show
    /// success/failure inline.
    /// </summary>
    [HttpPost("today/fire-now")]
    public async Task<IActionResult> FireNow(CancellationToken ct)
    {
        var result = await posting.FireNowAsync(ct);
        return Ok(new SubstackTestPostResponse(
            result.Success, result.StatusCode, result.NoteId, result.ErrorMessage, result.RawResponse));
    }

    /// <summary>
    /// Manually reroll today's plan (pick a new spark) — only allowed
    /// if today's plan is still Pending. Useful if the admin wants to
    /// swap the picked spark before the 7am send fires.
    /// </summary>
    [HttpPost("today/reroll")]
    public async Task<IActionResult> RerollToday(CancellationToken ct)
    {
        var today = TodayInScheduleTz();
        var plan = await db.SubstackDailyPlans.FirstOrDefaultAsync(p => p.Date == today, ct);
        if (plan is null)
            return BadRequest(new { error = "No plan for today yet. The worker creates it on its next tick." });
        if (plan.Status != SubstackPlanStatus.Pending)
            return BadRequest(new { error = "Today's reminder has already been sent or failed; nothing to reroll." });

        // Drop the existing plan and let the next worker tick recreate
        // it. Simpler than re-implementing the picker logic here, and
        // keeps the random-pick algorithm in exactly one place.
        db.SubstackDailyPlans.Remove(plan);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// History of past plans, newest first. Cap at 60 rows so the
    /// admin UI doesn't have to deal with pagination yet — 60 days
    /// of one-send-per-day is plenty of context.
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(CancellationToken ct)
    {
        var plans = await db.SubstackDailyPlans
            .Include(p => p.Spark)
            .OrderByDescending(p => p.Date)
            .Take(60)
            .ToListAsync(ct);

        return Ok(plans.Select(MapPlan));
    }

    /// <summary>
    /// Count of sparks not yet sent. Powers the "Running low" warning
    /// on the Today tab.
    /// </summary>
    [HttpGet("eligible-count")]
    public async Task<IActionResult> GetEligibleCount(CancellationToken ct)
    {
        var postedIds = await db.SubstackDailyPlans
            .Where(p => p.Status == SubstackPlanStatus.Posted)
            .Select(p => p.SparkId)
            .ToListAsync(ct);

        var count = await db.MotivationEntries
            .Where(s => !postedIds.Contains(s.Id))
            .CountAsync(ct);

        return Ok(new SubstackEligibleSparksResponse(count));
    }

    // ── Helpers ─────────────────────────────────────────────────────

    /// <summary>
    /// "Today" in the schedule's hardcoded timezone (America/New_York).
    /// Kept as a local helper so the controller doesn't need to import
    /// the constant from the posting service.
    /// </summary>
    private static DateOnly TodayInScheduleTz()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); }
        catch (TimeZoneNotFoundException) { tz = TimeZoneInfo.Utc; }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
    }

    private static SubstackPlanResponse MapPlan(SubstackDailyPlan p) => new(
        Id:             p.Id,
        Date:           p.Date,
        ScheduledFor:   p.ScheduledFor,
        Status:         p.Status.ToString(),
        PostedAt:       p.PostedAt,
        SubstackNoteId: p.SubstackNoteId,
        ErrorMessage:   p.ErrorMessage,
        SparkId:        p.SparkId,
        SparkTakeaway:  p.Spark?.Takeaway ?? "(spark missing)"
    );

    private async Task<SubstackSettings> GetOrCreateSettingsAsync(CancellationToken ct)
    {
        var s = await db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;

        s = new SubstackSettings();
        db.SubstackSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    private static SubstackSettingsResponse Map(SubstackSettings s) => new(
        Active:              s.Active,
        LastSuccessAt:       s.LastSuccessAt,
        LastFailureAt:       s.LastFailureAt,
        LastFailureMessage:  s.LastFailureMessage,
        ConsecutiveFailures: s.ConsecutiveFailures,
        UpdatedAt:           s.UpdatedAt
    );
}
