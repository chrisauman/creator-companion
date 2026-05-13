using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Background worker for the admin-only Substack Notes auto-poster.
/// One post per calendar day (in the admin's local timezone), fired
/// at a random time inside the 06:00–22:00 window for that day. Each
/// post draws from the spark library, and a spark is never posted
/// twice (enforced by anti-joining the Posted plan rows at pick time).
///
/// The worker is its own hosted service, deliberately separate from
/// ReminderBackgroundService — a failure here (e.g. Cloudflare blocking
/// our request) shouldn't bleed into reminder push delivery.
///
/// Tick cadence: 60 s. The unique index on SubstackDailyPlan.Date is
/// the primary idempotence guard — even if the worker double-fires
/// across redeploys mid-second, only one row per day can be inserted.
///
/// Failure handling: on any non-2xx, the worker:
///   - increments ConsecutiveFailures and stores the error
///   - emails the admin on the FIRST failure of a streak and every
///     5 consecutive failures after (avoids spam during long outages)
///   - on HTTP 401 specifically, flips Active=false so we stop replaying
///     a known-dead cookie until the admin re-pastes
/// </summary>
public class SubstackPostingBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<SubstackPostingBackgroundService> logger) : BackgroundService
{
    /// <summary>Earliest local hour (inclusive) we'll roll for the daily post.</summary>
    private const int WindowStartHourLocal = 6;
    /// <summary>Latest local hour (exclusive) we'll roll for the daily post.</summary>
    private const int WindowEndHourLocal = 22;

    /// <summary>
    /// Process-static so we don't reseed every tick. Random isn't
    /// thread-safe, so we lock on it for the rare race when the loop's
    /// running and admin ticks fire in parallel (not currently a thing,
    /// but cheap insurance).
    /// </summary>
    private static readonly Random Rng = new();
    private static readonly object RngLock = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Substack auto-poster background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await TickAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Substack auto-poster tick failed."); }

            try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db        = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<ISubstackCookieProtector>();
        var poster    = scope.ServiceProvider.GetRequiredService<ISubstackPoster>();
        var email     = scope.ServiceProvider.GetRequiredService<IEmailService>();

        // Load the singleton settings row. Worker is a no-op until the
        // admin has visited /admin/substack at least once (which creates
        // the row on first GET).
        var settings = await db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (settings is null || !settings.Active || string.IsNullOrWhiteSpace(settings.CookieEncrypted))
            return;

        // Resolve "today" in the admin's configured timezone. We compute
        // the date here once and use it for both plan lookup and the
        // window calculation, so a tick that straddles midnight UTC
        // can't pick the wrong day.
        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            logger.LogWarning("Substack settings has unknown TimeZoneId {Tz}; falling back to UTC.", settings.TimeZoneId);
            tz = TimeZoneInfo.Utc;
        }

        var nowUtc   = DateTime.UtcNow;
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, tz);
        var today    = DateOnly.FromDateTime(nowLocal);

        // Ensure today's plan exists. Wrap in a try so a unique-violation
        // race (two ticks creating simultaneously) is swallowed — both
        // continue to the post step and the unique index ensures only
        // one of them actually inserted.
        await EnsureTodayPlanAsync(db, today, tz, ct);

        // Now look for any due-and-pending plan. Normally this is just
        // today's, but if a redeploy caught us mid-fire the previous
        // tick may have left an older plan still pending — we don't
        // want to silently skip it.
        var due = await db.SubstackDailyPlans
            .Include(p => p.Spark)
            .Where(p => p.Status == SubstackPlanStatus.Pending && p.ScheduledFor <= nowUtc)
            .OrderBy(p => p.ScheduledFor)
            .ToListAsync(ct);

        foreach (var plan in due)
        {
            if (plan.Spark is null)
            {
                // FK shouldn't allow this, but defensively skip a broken row.
                plan.Status = SubstackPlanStatus.Failed;
                plan.ErrorMessage = "Plan row had no associated spark.";
                await db.SaveChangesAsync(ct);
                continue;
            }

            string cookie;
            try { cookie = protector.Unprotect(settings.CookieEncrypted); }
            catch (Exception ex)
            {
                // Decryption failures usually mean the Substack:EncryptionKey
                // was rotated without re-pasting the cookie. Surface as a
                // single failure event, don't loop.
                await RecordFailureAsync(db, email, settings, plan, null,
                    $"Could not decrypt stored cookie: {ex.Message}", null, isCookieExpired: true, ct);
                continue;
            }

            var body = BuildPostBody(plan.Spark);
            var result = await poster.PostNoteAsync(cookie, body, ct);

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

                await db.SaveChangesAsync(ct);
                logger.LogInformation("Substack post succeeded for plan {PlanId} (note {NoteId}).", plan.Id, result.NoteId);
            }
            else
            {
                var isCookieExpired = result.StatusCode is 401 or 403;
                await RecordFailureAsync(db, email, settings, plan,
                    result.StatusCode,
                    result.ErrorMessage ?? "Unknown failure.",
                    result.RawResponse,
                    isCookieExpired,
                    ct);
            }
        }
    }

    /// <summary>
    /// Build the spark text to post. Format: takeaway as the lead line,
    /// then the full content if it's short enough to fit naturally in a
    /// Note (Notes have a soft cap around ~280 chars before they get
    /// truncated/teased; we use 240 to leave room for any
    /// auto-appended attribution Substack may add). If the spark is
    /// longer we just post the takeaway.
    /// </summary>
    private static string BuildPostBody(MotivationEntry spark)
    {
        var takeaway = (spark.Takeaway ?? "").Trim();
        var full     = (spark.FullContent ?? "").Trim();

        if (string.IsNullOrEmpty(takeaway))
            return string.IsNullOrEmpty(full) ? "(empty spark)" : Truncate(full, 240);

        if (string.IsNullOrEmpty(full)) return takeaway;

        var combined = $"{takeaway}\n\n{full}";
        return combined.Length <= 240 ? combined : takeaway;
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max].TrimEnd() + "…";

    /// <summary>
    /// Idempotent — relies on the unique index over Date for the safety
    /// net. Picks the spark and rolls the random time only when no row
    /// exists for the given date yet.
    /// </summary>
    private static async Task EnsureTodayPlanAsync(AppDbContext db, DateOnly today, TimeZoneInfo tz, CancellationToken ct)
    {
        var existing = await db.SubstackDailyPlans.AnyAsync(p => p.Date == today, ct);
        if (existing) return;

        // Pick a random spark that has never been Posted in any plan
        // anywhere in history. ORDER BY random() works on Postgres; the
        // anti-join via NOT EXISTS keeps the picker excluding sparks
        // even from old plan rows that were rerolled.
        Guid? sparkId = null;
        if (db.Database.IsRelational())
        {
            var raw = await db.MotivationEntries
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
            sparkId = raw?.Id;
        }
        else
        {
            // In-memory fallback (tests) — load all unposted, pick one.
            var postedIds = await db.SubstackDailyPlans
                .Where(p => p.Status == SubstackPlanStatus.Posted)
                .Select(p => p.SparkId)
                .ToListAsync(ct);
            var candidates = await db.MotivationEntries
                .Where(s => !postedIds.Contains(s.Id))
                .Select(s => s.Id)
                .ToListAsync(ct);
            if (candidates.Count > 0)
            {
                int idx;
                lock (RngLock) idx = Rng.Next(candidates.Count);
                sparkId = candidates[idx];
            }
        }

        if (sparkId is null)
        {
            // No eligible sparks left. Don't create a plan row — the
            // worker will simply do nothing today. (Phase 4 could
            // alert on this; for now we just leave it quiet.)
            return;
        }

        // Roll a uniformly-random minute within [06:00, 22:00) local
        // for today, then convert to UTC for storage.
        int minute;
        lock (RngLock) minute = Rng.Next((WindowEndHourLocal - WindowStartHourLocal) * 60);
        var localFire = new DateTime(today.Year, today.Month, today.Day,
                                     WindowStartHourLocal, 0, 0, DateTimeKind.Unspecified)
                        .AddMinutes(minute);
        var utcFire = TimeZoneInfo.ConvertTimeToUtc(localFire, tz);

        var plan = new SubstackDailyPlan
        {
            Date         = today,
            SparkId      = sparkId.Value,
            ScheduledFor = utcFire,
            Status       = SubstackPlanStatus.Pending,
            CreatedAt    = DateTime.UtcNow
        };
        db.SubstackDailyPlans.Add(plan);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost the race to a parallel tick — the other one inserted.
            // Swallow and proceed; the caller will pick up whichever row exists.
            db.Entry(plan).State = EntityState.Detached;
        }
    }

    /// <summary>
    /// Persist failure on the plan + settings, and email the admin per
    /// the throttling rule (first of a streak; then every 5th).
    /// </summary>
    private static async Task RecordFailureAsync(
        AppDbContext db,
        IEmailService email,
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

        // 401 / 403 → cookie is dead. Flip Active off so we don't keep
        // hammering. Admin will re-paste a fresh cookie via the UI; the
        // save resets ConsecutiveFailures, so the next plan attempt is
        // a clean slate.
        if (isCookieExpired)
            settings.Active = false;

        await db.SaveChangesAsync(ct);

        // Email throttling: send on the first failure (count goes to 1)
        // and on every 5th after (5, 10, 15...). This gets the admin's
        // attention without spamming during a prolonged outage.
        var shouldEmail = settings.ConsecutiveFailures == 1 ||
                          settings.ConsecutiveFailures % 5 == 0;
        if (!shouldEmail) return;

        var adminEmail = await db.Users
            .Where(u => u.IsAdmin && u.IsActive)
            .OrderBy(u => u.CreatedAt)
            .Select(u => u.Email)
            .FirstOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(adminEmail)) return;

        try
        {
            await email.SendSubstackPostFailedAsync(
                adminEmail,
                statusCode,
                truncated,
                rawBody,
                isCookieExpired);
        }
        catch (Exception)
        {
            // Don't let an email failure cascade into the worker crashing
            // — we already persisted the failure on the plan; the admin
            // can see it in the History tab even without email.
        }
    }
}
