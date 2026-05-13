using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin-only controller for the Substack auto-poster's settings and
/// the one-shot "send a test post" round-trip. The actual scheduled
/// posting lives in a separate background worker (added in phase 3).
/// </summary>
[ApiController]
[Route("v1/admin/substack")]
[Authorize(Roles = "Admin")]
public class AdminSubstackController(
    AppDbContext db,
    ISubstackCookieProtector protector,
    ISubstackPoster poster,
    ISubstackPostingService posting) : ControllerBase
{
    /// <summary>Get current settings (cookie never returned).</summary>
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// Update settings. Cookie is optional — only overwritten if a non-
    /// empty value is supplied. Setting the cookie resets the failure
    /// counter on the assumption that the admin is intervening to fix
    /// whatever broke.
    /// </summary>
    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSubstackSettingsRequest req, CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);

        s.Active     = req.Active;
        s.TimeZoneId = req.TimeZoneId.Trim();

        if (!string.IsNullOrWhiteSpace(req.Cookie))
        {
            try
            {
                s.CookieEncrypted = protector.Protect(req.Cookie.Trim());
            }
            catch (InvalidOperationException ex)
            {
                // Most common case: Substack:EncryptionKey not configured.
                // Surface the exact message from the protector so the admin
                // can act on it without grepping logs.
                return StatusCode(503, new { error = ex.Message });
            }
            s.ConsecutiveFailures = 0;
            s.LastFailureMessage = null;
        }

        s.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// One-shot smoke test. Decrypts the stored cookie, sends a
    /// hardcoded test note to Substack, and returns the full outcome so
    /// the admin can verify auth before turning on Active. Does NOT
    /// touch settings on failure — the test is read-only against
    /// state, the only side effect is whatever Substack records.
    /// </summary>
    [HttpPost("test-post")]
    public async Task<IActionResult> TestPost(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        if (string.IsNullOrWhiteSpace(s.CookieEncrypted))
            return BadRequest(new { error = "No Substack cookie has been saved yet. Paste one in Settings first." });

        string cookie;
        try
        {
            cookie = protector.Unprotect(s.CookieEncrypted);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Stored cookie could not be decrypted ({ex.Message}). Re-paste it in Settings." });
        }

        var body = $"Test post from Creator Companion — {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}Z. " +
                   $"If you see this on your Substack Notes feed, auth is working. " +
                   $"If you don't, the request shape needs updating in phase 2.";

        var result = await poster.PostNoteAsync(cookie, body, ct);

        return Ok(new SubstackTestPostResponse(
            result.Success,
            result.StatusCode,
            result.NoteId,
            result.ErrorMessage,
            result.RawResponse
        ));
    }

    /// <summary>
    /// Today's plan row, if one exists. Null on no-plan-yet (the worker
    /// creates it lazily — first tick after midnight local).
    /// </summary>
    [HttpGet("today")]
    public async Task<IActionResult> GetToday(CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsAsync(ct);
        var today = TodayInTz(settings.TimeZoneId);

        var plan = await db.SubstackDailyPlans
            .Include(p => p.Spark)
            .FirstOrDefaultAsync(p => p.Date == today, ct);

        return Ok(plan is null ? null : MapPlan(plan));
    }

    /// <summary>
    /// Manually fire today's post right now, bypassing the random
    /// schedule. If today's plan doesn't exist yet, creates one (with
    /// ScheduledFor=now) and fires it. If today is already Posted,
    /// returns an error rather than double-posting. Returns the full
    /// outcome so the UI can show the same success/failure panel as
    /// the test-post button.
    /// </summary>
    [HttpPost("today/fire-now")]
    public async Task<IActionResult> FireNow(CancellationToken ct)
    {
        var result = await posting.FireNowAsync(ct);
        return Ok(new SubstackTestPostResponse(
            result.Success, result.StatusCode, result.NoteId, result.ErrorMessage, result.RawResponse));
    }

    /// <summary>
    /// Manually reroll today's plan (pick a new spark and a new random
    /// fire time) — only allowed if today's plan is still Pending.
    /// Useful if the admin wants to swap the picked spark or shift the
    /// time before it fires.
    /// </summary>
    [HttpPost("today/reroll")]
    public async Task<IActionResult> RerollToday(CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsAsync(ct);
        var today = TodayInTz(settings.TimeZoneId);

        var plan = await db.SubstackDailyPlans.FirstOrDefaultAsync(p => p.Date == today, ct);
        if (plan is null)
            return BadRequest(new { error = "No plan for today yet. The worker creates it on its next tick." });
        if (plan.Status != SubstackPlanStatus.Pending)
            return BadRequest(new { error = "Today's post has already been posted or failed; nothing to reroll." });

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
    /// of one-post-per-day is plenty of context.
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
    /// Count of sparks not yet posted to Substack. Powers the
    /// "Running low" warning on the Today tab.
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

    private static DateOnly TodayInTz(string tzId)
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(tzId); }
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
        TimeZoneId:          s.TimeZoneId,
        CookieIsSet:         !string.IsNullOrEmpty(s.CookieEncrypted),
        LastSuccessAt:       s.LastSuccessAt,
        LastFailureAt:       s.LastFailureAt,
        LastFailureMessage:  s.LastFailureMessage,
        ConsecutiveFailures: s.ConsecutiveFailures,
        UpdatedAt:           s.UpdatedAt
    );
}
