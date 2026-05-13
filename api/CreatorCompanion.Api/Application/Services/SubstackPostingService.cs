using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface ISubstackPostingService
{
    /// <summary>
    /// One worker tick: ensure today's plan exists, then fire any
    /// pending plan whose ScheduledFor has passed. Called from the
    /// background service every 60 s.
    /// </summary>
    Task TickAsync(CancellationToken ct);

    /// <summary>
    /// Manually fire today's post right now — bypasses the random
    /// fire-time roll. Used by the "Post now" button in the admin UI.
    /// Behaviour by today's plan state:
    ///   - No plan: pick a spark, create a plan with ScheduledFor=now, fire.
    ///   - Pending: fire today's plan immediately.
    ///   - Posted:  drop the existing plan (the spark becomes eligible
    ///              again, but the picker will almost certainly choose
    ///              a different one from the remaining pool), then
    ///              create a new plan and fire. This is the "test
    ///              again" path — admins explicitly clicking the button
    ///              after a successful post want a fresh post, not a
    ///              refusal.
    ///   - Failed:  drop and retry (same as Posted path).
    /// Returns the outcome so the UI can surface it inline.
    /// </summary>
    Task<SubstackPostResult> FireNowAsync(CancellationToken ct);
}

/// <summary>
/// Single source of truth for the Substack post-firing pipeline.
/// Both the background worker (SubstackPostingBackgroundService) and
/// the admin "Post now" endpoint delegate here so the picker, plan
/// creation, post envelope, and failure handling are defined in
/// exactly one place.
///
/// Scoped DI lifetime — gets a fresh DbContext per worker tick (or
/// per HTTP request). The worker creates its own scope around each
/// tick via IServiceScopeFactory.
/// </summary>
public class SubstackPostingService : ISubstackPostingService
{
    private const int WindowStartHourLocal = 6;
    private const int WindowEndHourLocal   = 22;

    private static readonly Random Rng = new();
    private static readonly object RngLock = new();

    private readonly AppDbContext _db;
    private readonly ISubstackCookieProtector _protector;
    private readonly ISubstackPoster _poster;
    private readonly IEmailService _email;
    private readonly ILogger<SubstackPostingService> _log;

    public SubstackPostingService(
        AppDbContext db,
        ISubstackCookieProtector protector,
        ISubstackPoster poster,
        IEmailService email,
        ILogger<SubstackPostingService> log)
    {
        _db        = db;
        _protector = protector;
        _poster    = poster;
        _email     = email;
        _log       = log;
    }

    public async Task TickAsync(CancellationToken ct)
    {
        var settings = await _db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (settings is null || !settings.Active || string.IsNullOrWhiteSpace(settings.CookieEncrypted))
            return;

        var tz = ResolveTimeZone(settings.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        await EnsureTodayPlanAsync(today, tz, fireNow: false, ct);

        var due = await _db.SubstackDailyPlans
            .Include(p => p.Spark)
            .Where(p => p.Status == SubstackPlanStatus.Pending && p.ScheduledFor <= DateTime.UtcNow)
            .OrderBy(p => p.ScheduledFor)
            .ToListAsync(ct);

        foreach (var plan in due)
        {
            await FireOnePlanAsync(settings, plan, ct);
        }
    }

    public async Task<SubstackPostResult> FireNowAsync(CancellationToken ct)
    {
        var settings = await _db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (settings is null)
            return new SubstackPostResult(false, null, null, "No settings row — visit Settings tab first.", null);
        if (string.IsNullOrWhiteSpace(settings.CookieEncrypted))
            return new SubstackPostResult(false, null, null, "No cookie saved — paste a cookie header on the Settings tab first.", null);
        // Note: we deliberately do NOT require Active=true here. The
        // admin should be able to test-fire from this button without
        // committing to the daily cadence. The worker still respects
        // Active for its own ticks.

        var tz = ResolveTimeZone(settings.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        // If today already has a Posted or Failed plan, drop it so we
        // can create a fresh one with the new picker. The previously-
        // posted spark becomes eligible again, but with ~290 unposted
        // sparks in the pool it almost certainly won't be picked twice.
        // We don't drop a Pending plan — the admin probably wants to
        // fire that exact plan rather than swap the spark.
        var existing = await _db.SubstackDailyPlans
            .FirstOrDefaultAsync(p => p.Date == today, ct);
        if (existing is not null && existing.Status != SubstackPlanStatus.Pending)
        {
            _db.SubstackDailyPlans.Remove(existing);
            await _db.SaveChangesAsync(ct);
        }

        // Now ensure a plan exists (creates one if we just dropped, or
        // if none existed in the first place).
        await EnsureTodayPlanAsync(today, tz, fireNow: true, ct);

        var plan = await _db.SubstackDailyPlans
            .Include(p => p.Spark)
            .FirstOrDefaultAsync(p => p.Date == today, ct);

        if (plan is null)
            return new SubstackPostResult(false, null, null, "No eligible sparks remaining in the pool. Add more in Content Library.", null);

        // Defensive: if a Pending plan somehow exists from a prior tick,
        // fire it as-is. Otherwise (our fresh one) fire it too. Either
        // way we're firing.
        return await FireOnePlanAsync(settings, plan, ct);
    }

    // ── Internal helpers ────────────────────────────────────────────

    private async Task EnsureTodayPlanAsync(DateOnly today, TimeZoneInfo tz, bool fireNow, CancellationToken ct)
    {
        var existing = await _db.SubstackDailyPlans.AnyAsync(p => p.Date == today, ct);
        if (existing) return;

        var sparkId = await PickSparkIdAsync(ct);
        if (sparkId is null) return; // pool dry — caller handles

        // For the daily-cadence path, roll a random minute inside the
        // 06:00–22:00 local window. For force-fire, schedule for now
        // so the very next firing pass picks it up.
        DateTime utcFire;
        if (fireNow)
        {
            utcFire = DateTime.UtcNow;
        }
        else
        {
            int minute;
            lock (RngLock) minute = Rng.Next((WindowEndHourLocal - WindowStartHourLocal) * 60);
            var localFire = new DateTime(today.Year, today.Month, today.Day,
                                         WindowStartHourLocal, 0, 0, DateTimeKind.Unspecified)
                            .AddMinutes(minute);
            utcFire = TimeZoneInfo.ConvertTimeToUtc(localFire, tz);
        }

        var plan = new SubstackDailyPlan
        {
            Date         = today,
            SparkId      = sparkId.Value,
            ScheduledFor = utcFire,
            Status       = SubstackPlanStatus.Pending,
            CreatedAt    = DateTime.UtcNow
        };
        _db.SubstackDailyPlans.Add(plan);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            // Lost a race against another tick; detach our duplicate
            // and proceed (the caller queries fresh anyway).
            _db.Entry(plan).State = EntityState.Detached;
        }
    }

    /// <summary>
    /// Picks one spark Id not yet referenced by a Posted plan row.
    /// Uses Postgres random() in production; falls back to client-side
    /// pick on in-memory provider (tests).
    /// </summary>
    private async Task<Guid?> PickSparkIdAsync(CancellationToken ct)
    {
        if (_db.Database.IsRelational())
        {
            var raw = await _db.MotivationEntries
                .FromSqlRaw("""
                    SELECT * FROM "MotivationEntries" s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM "SubstackDailyPlans" p
                        WHERE p."SparkId" = s."Id" AND p."Status" = 1
                    )
                    ORDER BY random()
                    LIMIT 1
                    """)
                .AsNoTracking()
                .FirstOrDefaultAsync(ct);
            return raw?.Id;
        }
        else
        {
            var postedIds = await _db.SubstackDailyPlans
                .Where(p => p.Status == SubstackPlanStatus.Posted)
                .Select(p => p.SparkId)
                .ToListAsync(ct);
            var candidates = await _db.MotivationEntries
                .Where(s => !postedIds.Contains(s.Id))
                .Select(s => s.Id)
                .ToListAsync(ct);
            if (candidates.Count == 0) return null;
            int idx;
            lock (RngLock) idx = Rng.Next(candidates.Count);
            return candidates[idx];
        }
    }

    /// <summary>
    /// Sends one plan to Substack and persists the outcome. Returns
    /// the raw poster result so the caller (worker or controller) can
    /// surface it.
    /// </summary>
    private async Task<SubstackPostResult> FireOnePlanAsync(
        SubstackSettings settings,
        SubstackDailyPlan plan,
        CancellationToken ct)
    {
        if (plan.Spark is null)
        {
            const string err = "Plan row had no associated spark.";
            plan.Status = SubstackPlanStatus.Failed;
            plan.ErrorMessage = err;
            await _db.SaveChangesAsync(ct);
            return new SubstackPostResult(false, null, null, err, null);
        }

        string cookie;
        try { cookie = _protector.Unprotect(settings.CookieEncrypted!); }
        catch (Exception ex)
        {
            await RecordFailureAsync(settings, plan, null,
                $"Could not decrypt stored cookie: {ex.Message}", null, isCookieExpired: true, ct);
            return new SubstackPostResult(false, null, null, "Could not decrypt stored cookie. Re-paste it.", null);
        }

        var body = BuildPostBody(plan.Spark);
        var result = await _poster.PostNoteAsync(cookie, body, ct);

        if (result.Success)
        {
            plan.Status         = SubstackPlanStatus.Posted;
            plan.PostedAt       = DateTime.UtcNow;
            plan.SubstackNoteId = result.NoteId;
            plan.ErrorMessage   = null;

            settings.LastSuccessAt       = DateTime.UtcNow;
            settings.LastFailureMessage  = null;
            settings.ConsecutiveFailures = 0;
            settings.UpdatedAt           = DateTime.UtcNow;

            await _db.SaveChangesAsync(ct);
            _log.LogInformation("Substack post succeeded for plan {PlanId} (note {NoteId}).", plan.Id, result.NoteId);
        }
        else
        {
            var isCookieExpired = result.StatusCode is 401 or 403;
            await RecordFailureAsync(settings, plan,
                result.StatusCode,
                result.ErrorMessage ?? "Unknown failure.",
                result.RawResponse,
                isCookieExpired,
                ct);
        }

        return result;
    }

    private async Task RecordFailureAsync(
        SubstackSettings settings,
        SubstackDailyPlan plan,
        int? statusCode,
        string errorMessage,
        string? rawBody,
        bool isCookieExpired,
        CancellationToken ct)
    {
        var truncated = errorMessage.Length > 1500 ? errorMessage[..1500] + "…" : errorMessage;

        plan.Status       = SubstackPlanStatus.Failed;
        plan.ErrorMessage = truncated;

        settings.LastFailureAt       = DateTime.UtcNow;
        settings.LastFailureMessage  = truncated;
        settings.ConsecutiveFailures += 1;
        settings.UpdatedAt           = DateTime.UtcNow;

        if (isCookieExpired) settings.Active = false;

        await _db.SaveChangesAsync(ct);

        var shouldEmail = settings.ConsecutiveFailures == 1 ||
                          settings.ConsecutiveFailures % 5 == 0;
        if (!shouldEmail) return;

        var adminEmail = await _db.Users
            .Where(u => u.IsAdmin && u.IsActive)
            .OrderBy(u => u.CreatedAt)
            .Select(u => u.Email)
            .FirstOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(adminEmail)) return;

        try
        {
            await _email.SendSubstackPostFailedAsync(adminEmail, statusCode, truncated, rawBody, isCookieExpired);
        }
        catch
        {
            // Don't let an email failure cascade — the persisted plan
            // row already carries the error message.
        }
    }

    /// <summary>
    /// Format a spark for posting. Always sends takeaway + full content
    /// together (separated by a blank line), per project intent: the
    /// takeaway is the hook and the full content is the explanation —
    /// they belong together. Substack Notes accept long-form text so
    /// we no longer truncate. If one of the two is missing we just
    /// post whichever is present.
    /// </summary>
    private static string BuildPostBody(MotivationEntry spark)
    {
        var takeaway = (spark.Takeaway ?? "").Trim();
        var full     = (spark.FullContent ?? "").Trim();

        if (string.IsNullOrEmpty(takeaway) && string.IsNullOrEmpty(full))
            return "(empty spark)";
        if (string.IsNullOrEmpty(takeaway)) return full;
        if (string.IsNullOrEmpty(full))     return takeaway;

        return $"{takeaway}\n\n{full}";
    }

    private static TimeZoneInfo ResolveTimeZone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }
}
