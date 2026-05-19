using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Outcome of a "send today's spark" attempt — emailed or (historically)
/// posted. NoteId + RawResponse linger from the cookie-poster era; they
/// stay nullable so old admin-history rows that DO have a real Substack
/// note id keep deserialising cleanly, but new sends never populate
/// them (no platform-side artefact when the action is just an email).
/// </summary>
public record SubstackPostResult(
    bool    Success,
    int?    StatusCode,
    string? NoteId,
    string? ErrorMessage,
    string? RawResponse
);

public interface ISubstackPostingService
{
    /// <summary>
    /// One worker tick: ensure today's plan exists, then fire any
    /// pending plan whose ScheduledFor has passed. Called from the
    /// background service every 60 s.
    /// </summary>
    Task TickAsync(CancellationToken ct);

    /// <summary>
    /// Manually fire today's reminder right now — bypasses the daily
    /// schedule. Used by the "Send now" button in the admin UI.
    /// Behaviour by today's plan state:
    ///   - No plan: pick a spark, create a plan with ScheduledFor=now, fire.
    ///   - Pending: fire today's plan immediately.
    ///   - Sent:    drop the existing plan, pick a fresh spark, fire.
    ///              (Use case: admin wants a re-send because they lost
    ///              the email or want a different spark.)
    ///   - Failed:  drop and retry (same as Sent path).
    /// Returns the outcome so the UI can surface it inline.
    /// </summary>
    Task<SubstackPostResult> FireNowAsync(CancellationToken ct);
}

/// <summary>
/// Single source of truth for the daily-spark reminder pipeline.
///
/// History — this used to actually POST notes to Substack via a
/// stolen browser session cookie. That broke roughly weekly when
/// Substack rotated the cookie, leaving every retry to fail with 401.
/// Substack has no public posting API, so cookie-stealing was the
/// only option and it wasn't sustainable.
///
/// Current behaviour — instead of posting, we EMAIL the admin
/// (chris@sanctuarymg.com) one spark per day so they can paste it
/// into Substack Notes themselves. The plan-tracking + never-repeat
/// picker + admin UI all stay intact: the only thing that changed is
/// the action taken when the schedule fires (HTTP post → email send).
///
/// Class + table names are still "Substack*" because Substack is the
/// only platform using this pipeline today. When we add a real API-
/// based platform (Bluesky, Mastodon, Threads) the natural next step
/// is to extract IPlatformPoster and rename. YAGNI until then —
/// renaming for an abstraction with one concrete user is busywork.
///
/// Schedule — fires once daily at 07:00 America/New_York (auto-handles
/// EST/EDT). The previous random 06:00–22:00 window made sense when
/// the audience was Substack readers (human-looking cadence); for an
/// email to yourself, predictable beats random.
///
/// Scoped DI lifetime — gets a fresh DbContext per worker tick (or
/// per HTTP request). The worker creates its own scope around each
/// tick via IServiceScopeFactory.
/// </summary>
public class SubstackPostingService : ISubstackPostingService
{
    // Fixed daily send time. America/New_York handles DST automatically
    // (EST in winter, EDT in summer) so the user always gets the email
    // at "7am their time" without us having to do anything when the
    // clocks change.
    private const string ScheduleTimeZoneId = "America/New_York";
    private const int    ScheduleHourLocal  = 7;

    // Hardcoded recipient. The user is the sole admin and the email is
    // a fully personal "post this to Substack today" reminder, so DB-
    // driven recipient lookup is overkill. If/when more admins exist,
    // swap to a Users query (IsAdmin && IsActive).
    private const string RecipientEmail = "chris@sanctuarymg.com";

    private static readonly Random Rng = new();
    private static readonly object RngLock = new();

    private readonly AppDbContext _db;
    private readonly IEmailService _email;
    private readonly ILogger<SubstackPostingService> _log;

    public SubstackPostingService(
        AppDbContext db,
        IEmailService email,
        ILogger<SubstackPostingService> log)
    {
        _db    = db;
        _email = email;
        _log   = log;
    }

    public async Task TickAsync(CancellationToken ct)
    {
        var settings = await _db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (settings is null || !settings.Active)
            return;

        var tz = ResolveTimeZone(ScheduleTimeZoneId);
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

        // Active=false no longer blocks fire-now. The admin clicking
        // "Send now" wants the email regardless of the daily-cadence
        // toggle.
        var tz = ResolveTimeZone(ScheduleTimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        // If today already has a Posted or Failed plan, drop it so we
        // can create a fresh one with the picker. The previously-sent
        // spark becomes eligible again, but with hundreds of unposted
        // sparks in the pool it almost certainly won't be picked twice.
        // Don't drop a Pending plan — admin probably wants to fire that
        // exact plan rather than swap the spark.
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

        return await FireOnePlanAsync(settings, plan, ct);
    }

    // ── Internal helpers ────────────────────────────────────────────

    private async Task EnsureTodayPlanAsync(DateOnly today, TimeZoneInfo tz, bool fireNow, CancellationToken ct)
    {
        var existing = await _db.SubstackDailyPlans.AnyAsync(p => p.Date == today, ct);
        if (existing) return;

        var sparkId = await PickSparkIdAsync(ct);
        if (sparkId is null) return; // pool dry — caller handles

        // For the daily-cadence path, schedule for 07:00 local. For
        // force-fire (admin "Send now" button), schedule for now so
        // the very next tick of the firing loop picks it up.
        DateTime utcFire;
        if (fireNow)
        {
            utcFire = DateTime.UtcNow;
        }
        else
        {
            var localFire = new DateTime(today.Year, today.Month, today.Day,
                                         ScheduleHourLocal, 0, 0, DateTimeKind.Unspecified);
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
    /// (Status name kept as "Posted" for backwards compatibility with
    /// existing rows — semantically now means "sent in a reminder email
    /// to the admin so won't be picked again." Renaming the enum
    /// would force a destructive migration on a column that has
    /// hundreds of existing values; not worth it.)
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
    /// Emails today's plan to the admin recipient and persists the
    /// outcome. Returns a structured result so the caller (worker or
    /// controller) can surface it the same way the old HTTP-post path
    /// did. NoteId is always null now (no platform-side artefact when
    /// sending an email — keep the field nullable for back-compat with
    /// existing rows that have real Substack note IDs from the old
    /// auto-poster era).
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

        try
        {
            await _email.SendDailySparkReminderAsync(
                RecipientEmail,
                plan.Spark.Takeaway ?? "(no takeaway)",
                plan.Spark.FullContent);
        }
        catch (Exception ex)
        {
            await RecordFailureAsync(settings, plan, ex.Message, ct);
            return new SubstackPostResult(false, null, null, ex.Message, null);
        }

        plan.Status         = SubstackPlanStatus.Posted;
        plan.PostedAt       = DateTime.UtcNow;
        plan.SubstackNoteId = null;
        plan.ErrorMessage   = null;

        settings.LastSuccessAt       = DateTime.UtcNow;
        settings.LastFailureMessage  = null;
        settings.ConsecutiveFailures = 0;
        settings.UpdatedAt           = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        _log.LogInformation("Daily-spark reminder emailed for plan {PlanId}.", plan.Id);

        return new SubstackPostResult(true, 200, null, null, null);
    }

    private async Task RecordFailureAsync(
        SubstackSettings settings,
        SubstackDailyPlan plan,
        string errorMessage,
        CancellationToken ct)
    {
        var truncated = errorMessage.Length > 1500 ? errorMessage[..1500] + "…" : errorMessage;

        plan.Status       = SubstackPlanStatus.Failed;
        plan.ErrorMessage = truncated;

        settings.LastFailureAt       = DateTime.UtcNow;
        settings.LastFailureMessage  = truncated;
        settings.ConsecutiveFailures += 1;
        settings.UpdatedAt           = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        _log.LogWarning("Daily-spark email send failed for plan {PlanId}: {Error}", plan.Id, truncated);

        // No admin-alert email on failure — the failure IS an email
        // failure, so we can't reliably send another one to report it.
        // The admin UI surfaces LastFailureMessage on the Settings tab
        // and ErrorMessage on the History tab; that's enough.
    }

    private static TimeZoneInfo ResolveTimeZone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }
}
