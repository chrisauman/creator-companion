using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using WebPushLib = WebPush;

namespace CreatorCompanion.Api.Application.Services;

public class ReminderBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<ReminderBackgroundService> logger) : BackgroundService
{
    /// <summary>
    /// User-local hour-of-day after which we'll fire the streak-threatened
    /// push. Set conservatively so users who are early risers but plan to
    /// journal mid-day aren't pinged at 6am with "you missed yesterday."
    /// 10am is "morning's almost over, let's give them a friendly nudge."
    /// </summary>
    private const int ThreatenedPushHourLocal = 10;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Reminder background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ProcessRemindersAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Error processing reminders."); }

            // Streak-threatened push runs in the same loop. Independent
            // path with its own dedupe (User.StreakThreatenedNotifiedFor),
            // so a failure here doesn't affect reminders and vice versa.
            try { await ProcessThreatenedNotificationsAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Error processing streak-threatened notifications."); }

            // Trial lifecycle emails (3-day reminder, 1-day reminder,
            // expired notification). Each has its own dedupe column so
            // a single user gets at most one email per cadence. Run
            // every minute is overkill but cheap — one query per tick.
            try { await ProcessTrialEmailsAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Error processing trial-lifecycle emails."); }

            // 48-hour trash purge — CLAUDE.md promises this; without
            // it, soft-deleted entries (and their R2 media) live
            // forever. PurgeExpiredTrashAsync batches to 200/tick so
            // a large backlog spreads across ticks.
            try
            {
                using var purgeScope = scopeFactory.CreateScope();
                var entryService = purgeScope.ServiceProvider.GetRequiredService<IEntryService>();
                var purged = await entryService.PurgeExpiredTrashAsync(stoppingToken);
                if (purged > 0) logger.LogInformation("Purged {Count} expired trash entries.", purged);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Error purging expired trash."); }

            try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task ProcessRemindersAsync(CancellationToken ct)
    {
        using var scope  = scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        // Load admin config (singleton row — fall back to defaults if missing)
        var config = await db.ReminderConfigs.FindAsync([1], ct) ?? new ReminderConfig();

        var utcNow = DateTime.UtcNow;

        var reminders = await db.Reminders
            .Where(r => r.IsEnabled)
            .Include(r => r.User)
            .ToListAsync(ct);

        logger.LogDebug("ReminderTick: UTC={UtcNow}, checking {Count} enabled reminder(s).",
            utcNow.ToString("HH:mm:ss"), reminders.Count);

        // Persist LastSentAt PER reminder rather than once at the end of
        // the loop. A Railway redeploy mid-tick used to wipe the entire
        // batch's dedupe state, causing duplicate pushes on next boot.
        foreach (var reminder in reminders)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var sent = await ProcessOneAsync(db, sender, config, reminder, utcNow, ct);
                if (sent) await db.SaveChangesAsync(ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing reminder {ReminderId}", reminder.Id);
            }
        }
    }

    private async Task<bool> ProcessOneAsync(
        AppDbContext db,
        IPushSender sender,
        ReminderConfig config,
        Reminder reminder,
        DateTime utcNow,
        CancellationToken ct)
    {
        // Bad/legacy TZ IDs would 500 the entire tick; fall through to
        // UTC and continue. ThreatenedOneAsync already does this; the
        // main reminder path used to crash here.
        TimeZoneInfo userTz;
        try { userTz = TimeZoneInfo.FindSystemTimeZoneById(reminder.User.TimeZoneId); }
        catch
        {
            logger.LogWarning("Skipping reminder {ReminderId}: unknown TimeZoneId '{Tz}'.",
                reminder.Id, reminder.User.TimeZoneId);
            return false;
        }
        var userNow  = TimeZoneInfo.ConvertTimeFromUtc(utcNow, userTz);
        var userTime = TimeOnly.FromDateTime(userNow);
        var today    = DateOnly.FromDateTime(userNow);

        // ── Time match ───────────────────────────────────────────────────────
        // Fire when the scheduled time has arrived today AND we haven't already
        // sent today. The earlier exact-minute match (`Hour == X && Minute == Y`)
        // was fragile: the worker loop is `processWork + Task.Delay(60s)`, so it
        // drifts a few seconds each iteration, and Railway redeploys/restarts
        // routinely land mid-minute. Either case meant the target minute was
        // skipped and the reminder simply never fired that day.
        //
        // The "already sent today" guard is enforced below via reminder.LastSentAt
        // so a single tick after the scheduled time triggers exactly one send.
        var scheduledToday = today.ToDateTime(reminder.Time);
        var alreadySentToday = reminder.LastSentAt.HasValue &&
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(reminder.LastSentAt.Value, userTz)) == today;

        logger.LogDebug(
            "ReminderCheck: reminder={ReminderId} set={Set} userNow={UserNow} tz={Tz} due={Due} sent={Sent}",
            reminder.Id, reminder.Time.ToString("HH:mm"), userTime.ToString("HH:mm"),
            reminder.User.TimeZoneId, userNow >= scheduledToday, alreadySentToday);

        if (userNow < scheduledToday) return false;
        if (alreadySentToday) { logger.LogDebug("ReminderSkip: {ReminderId} — already sent today.", reminder.Id); return false; }

        // No entry-based gating — reminders are general-purpose. People
        // set them for any cue they care about (post a thought, walk the
        // dog, hydrate). Skipping when the user already journaled, or
        // when their streak is paused, broke that contract: a 4pm "drink
        // water" reminder shouldn't disappear just because they wrote
        // an entry at noon. The dedupe guard at the top of this method
        // (alreadySentToday) prevents double-fires; that's enough.

        // ── Select message ───────────────────────────────────────────────────
        // User-supplied message takes priority. Fall back to the generic
        // active-streak copy as a sensible default — the previous tiered
        // selection (just-broke / short-lapse / long-absence) was
        // entry-based and no longer applies.
        var body = reminder.Message ?? config.MessageActiveStreak;

        // ── Send to all subscriptions ────────────────────────────────────────
        var subscriptions = await db.PushSubscriptions
            .Where(s => s.UserId == reminder.UserId)
            .ToListAsync(ct);

        if (!subscriptions.Any()) return false;

        var expiredEndpoints = new List<string>();

        foreach (var sub in subscriptions)
        {
            try
            {
                await sender.SendAsync(sub, "Creator Companion", body);
            }
            catch (WebPushLib.WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
            {
                expiredEndpoints.Add(sub.Endpoint);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send to subscription {Id}", sub.Id);
            }
        }

        if (expiredEndpoints.Any())
        {
            var expired = await db.PushSubscriptions
                .Where(s => expiredEndpoints.Contains(s.Endpoint))
                .ToListAsync(ct);
            db.PushSubscriptions.RemoveRange(expired);
        }

        reminder.LastSentAt = utcNow;

        logger.LogInformation(
            "Sent reminder to user {UserId} ({Count} device(s))",
            reminder.UserId,
            subscriptions.Count - expiredEndpoints.Count);

        // Tell the caller to flush so this dedupe survives a mid-tick restart.
        return true;
    }

    // ── Streak-threatened push ────────────────────────────────────────
    /// <summary>
    /// Mirrors the in-app threatened-banner logic: when a user with an
    /// active streak misses yesterday but is still inside the 48h backlog
    /// grace, fire one push with the same copy as the banner. Designed to
    /// catch users who haven't opened the app today — which is exactly
    /// when the in-app banner can't help them.
    ///
    /// Constraints:
    ///  - Only fires after <see cref="ThreatenedPushHourLocal"/> in the
    ///    user's local timezone (no 6am surprise pings).
    ///  - Deduped via <c>User.StreakThreatenedNotifiedFor</c> — exactly
    ///    one push per missed-day-event, ever.
    ///  - Skips users with no enabled reminders at all (treated as
    ///    "user opted out of nudges entirely"). A future setting could
    ///    let users opt in/out of this specific push independently.
    /// </summary>
    private async Task ProcessThreatenedNotificationsAsync(CancellationToken ct)
    {
        using var scope  = scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        var utcNow = DateTime.UtcNow;

        // Only consider active accounts that have at least one push
        // subscription registered — otherwise there's no device to
        // notify and we'd spend cycles for nothing.
        // Tracked so we can mutate StreakThreatenedNotifiedFor below.
        // (AsNoTracking would require re-attaching, which is more code
        // for negligible win — the list is bounded by total active
        // users with push subs.)
        var candidates = await db.Users
            .Where(u => u.IsActive)
            .Where(u => db.PushSubscriptions.Any(s => s.UserId == u.Id))
            .ToListAsync(ct);

        // Per-user SaveChanges so a mid-tick restart doesn't lose
        // dedupe state for users we already notified this tick.
        foreach (var user in candidates)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var sent = await ProcessThreatenedOneAsync(db, sender, user, utcNow, ct);
                if (sent) await db.SaveChangesAsync(ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing threatened-push for user {UserId}", user.Id);
            }
        }
    }

    private async Task<bool> ProcessThreatenedOneAsync(
        AppDbContext db,
        IPushSender sender,
        User user,
        DateTime utcNow,
        CancellationToken ct)
    {
        TimeZoneInfo userTz;
        try { userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId); }
        catch { return false; }  // bad TZ — skip silently

        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, userTz);
        var today = DateOnly.FromDateTime(local);

        // Don't fire before the morning threshold. Users who normally
        // journal at 9am shouldn't get a "missed yesterday" push at 7am.
        if (local.Hour < ThreatenedPushHourLocal) return false;

        var missedDate = today.AddDays(-1);

        // Already notified for THIS gap? Skip.
        if (user.StreakThreatenedNotifiedFor == missedDate) return false;

        // Streak state — re-derive locally so this method is self-
        // contained. Mirrors IStreakService.ComputeAsync for current-streak
        // + lastEntryDate (which is all we need here). Keeps the trigger
        // condition aligned with the in-app banner.
        var validDates = await db.Entries
            .AsNoTracking()
            .Where(e => e.UserId == user.Id && e.DeletedAt == null)
            .Select(e => e.EntryDate)
            .Distinct()
            .ToListAsync(ct);

        if (validDates.Count == 0) return false;

        var pauses = await db.Pauses
            .AsNoTracking()
            .Where(p => p.UserId == user.Id && p.Status == Domain.Enums.PauseStatus.Active)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync(ct);

        var pausedDates = new HashSet<DateOnly>();
        foreach (var pause in pauses)
            for (var d = pause.StartDate; d <= pause.EndDate; d = d.AddDays(1))
                pausedDates.Add(d);

        // Current streak alive? Walk back from today (or yesterday if
        // today is empty) counting consecutive entry-or-paused days.
        var entryDateSet = new HashSet<DateOnly>(validDates);
        var cursor = today;
        if (!entryDateSet.Contains(cursor) && !pausedDates.Contains(cursor))
            cursor = cursor.AddDays(-1);

        var currentStreak = 0;
        while (entryDateSet.Contains(cursor) || pausedDates.Contains(cursor))
        {
            if (entryDateSet.Contains(cursor)) currentStreak++;
            cursor = cursor.AddDays(-1);
        }

        if (currentStreak <= 0) return false;

        // Last entry date — needed to confirm "exactly yesterday missed."
        var lastEntryDate = validDates.OrderByDescending(d => d).FirstOrDefault();
        if (lastEntryDate == default) return false;

        // Threatened iff the user missed exactly yesterday (lastEntry is
        // 2 days back relative to local-today). 0 or 1 day = fine; 3+
        // days = streak already broken (Welcome Back territory).
        if (today.DayNumber - lastEntryDate.DayNumber != 2) return false;

        // ── Send to all subscriptions ──────────────────────────────────
        var subs = await db.PushSubscriptions
            .Where(s => s.UserId == user.Id)
            .ToListAsync(ct);

        if (subs.Count == 0) return false;

        const string Title = "Creator Companion";
        const string Body  = "2 days have slipped by — but you've got this. Log recent progress.";

        var expiredEndpoints = new List<string>();
        var sentCount = 0;
        foreach (var sub in subs)
        {
            try
            {
                await sender.SendAsync(sub, Title, Body);
                sentCount++;
            }
            catch (WebPushLib.WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
            {
                expiredEndpoints.Add(sub.Endpoint);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send threatened-push to subscription {Id}", sub.Id);
            }
        }

        if (expiredEndpoints.Count > 0)
        {
            var expired = await db.PushSubscriptions
                .Where(s => expiredEndpoints.Contains(s.Endpoint))
                .ToListAsync(ct);
            db.PushSubscriptions.RemoveRange(expired);
        }

        // Mark dedupe even if 0 sent (all expired) — we don't want to
        // retry every minute against dead endpoints. The next missed-day
        // event will be a different date and re-arm naturally.
        user.StreakThreatenedNotifiedFor = missedDate;

        logger.LogInformation(
            "Sent streak-threatened push to user {UserId} ({Count} device(s), missed {MissedDate})",
            user.Id, sentCount, missedDate);

        return true;
    }

    // ── Trial lifecycle emails ─────────────────────────────────────────
    /// <summary>
    /// Fires the three trial-lifecycle emails:
    ///   - 3-day reminder when TrialEndsAt is between 2 and 3 days out
    ///   - 1-day reminder when TrialEndsAt is between 0 and 1 day out
    ///   - Trial-ended when TrialEndsAt is in the past
    ///
    /// Each gated by its own dedupe column (TrialReminder3dSentAt,
    /// TrialReminder1dSentAt, TrialEndedEmailSentAt) so a user gets
    /// at most one of each. Users with an active subscription
    /// (StripeSubscriptionId != null) are excluded — they don't need
    /// trial nags. The 60s loop fires this method on every tick;
    /// the dedupe flags + tight WHERE clauses keep DB cost trivial.
    /// </summary>
    private async Task ProcessTrialEmailsAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var now    = DateTime.UtcNow;
        var in3d   = now.AddDays(3);
        var in1d   = now.AddDays(1);

        // ── 3-day reminder ──────────────────────────────────────────────
        // TrialEndsAt is between now+1d and now+3d (the 1-day reminder
        // owns the 0-1d window). Hasn't been sent the 3-day reminder yet.
        // No active subscription. Active account.
        var threeDayCandidates = await db.Users
            .Where(u => u.IsActive
                     && u.StripeSubscriptionId == null
                     && u.TrialEndsAt != null
                     && u.TrialEndsAt > in1d
                     && u.TrialEndsAt <= in3d
                     && u.TrialReminder3dSentAt == null)
            .ToListAsync(ct);

        foreach (var user in threeDayCandidates)
        {
            try
            {
                var daysLeft = (int)Math.Ceiling((user.TrialEndsAt!.Value - now).TotalDays);
                await email.SendTrialEndingSoonAsync(user.Email, user.FirstName, daysLeft);
                user.TrialReminder3dSentAt = now;
                logger.LogInformation("Sent trial-3d reminder to {Email}", user.Email);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send trial-3d reminder to {Email}", user.Email);
            }
        }

        // ── 1-day reminder ──────────────────────────────────────────────
        // TrialEndsAt is between now and now+1d.
        var oneDayCandidates = await db.Users
            .Where(u => u.IsActive
                     && u.StripeSubscriptionId == null
                     && u.TrialEndsAt != null
                     && u.TrialEndsAt > now
                     && u.TrialEndsAt <= in1d
                     && u.TrialReminder1dSentAt == null)
            .ToListAsync(ct);

        foreach (var user in oneDayCandidates)
        {
            try
            {
                await email.SendTrialEndingSoonAsync(user.Email, user.FirstName, 1);
                user.TrialReminder1dSentAt = now;
                logger.LogInformation("Sent trial-1d reminder to {Email}", user.Email);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send trial-1d reminder to {Email}", user.Email);
            }
        }

        // ── Trial-ended notification ────────────────────────────────────
        // TrialEndsAt has passed (any time in the past). One per user
        // ever — TrialEndedEmailSentAt being null is the gate.
        var endedCandidates = await db.Users
            .Where(u => u.IsActive
                     && u.StripeSubscriptionId == null
                     && u.TrialEndsAt != null
                     && u.TrialEndsAt < now
                     && u.TrialEndedEmailSentAt == null)
            .ToListAsync(ct);

        foreach (var user in endedCandidates)
        {
            try
            {
                await email.SendTrialEndedAsync(user.Email, user.FirstName);
                user.TrialEndedEmailSentAt = now;
                logger.LogInformation("Sent trial-ended notification to {Email}", user.Email);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send trial-ended notification to {Email}", user.Email);
            }
        }

        if (threeDayCandidates.Count + oneDayCandidates.Count + endedCandidates.Count > 0)
            await db.SaveChangesAsync(ct);
    }
}
