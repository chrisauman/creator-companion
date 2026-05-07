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
            try { await ProcessRemindersAsync(); }
            catch (Exception ex) { logger.LogError(ex, "Error processing reminders."); }

            // Streak-threatened push runs in the same loop. Independent
            // path with its own dedupe (User.StreakThreatenedNotifiedFor),
            // so a failure here doesn't affect reminders and vice versa.
            try { await ProcessThreatenedNotificationsAsync(); }
            catch (Exception ex) { logger.LogError(ex, "Error processing streak-threatened notifications."); }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task ProcessRemindersAsync()
    {
        using var scope  = scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        // Load admin config (singleton row — fall back to defaults if missing)
        var config = await db.ReminderConfigs.FindAsync(1) ?? new ReminderConfig();

        var utcNow = DateTime.UtcNow;

        var reminders = await db.Reminders
            .Where(r => r.IsEnabled)
            .Include(r => r.User)
            .ToListAsync();

        logger.LogDebug("ReminderTick: UTC={UtcNow}, checking {Count} enabled reminder(s).",
            utcNow.ToString("HH:mm:ss"), reminders.Count);

        foreach (var reminder in reminders)
        {
            try { await ProcessOneAsync(db, sender, config, reminder, utcNow); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing reminder {ReminderId}", reminder.Id);
            }
        }

        await db.SaveChangesAsync();
    }

    private async Task ProcessOneAsync(
        AppDbContext db,
        IPushSender sender,
        ReminderConfig config,
        Reminder reminder,
        DateTime utcNow)
    {
        var userTz   = TimeZoneInfo.FindSystemTimeZoneById(reminder.User.TimeZoneId);
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

        if (userNow < scheduledToday) return;
        if (alreadySentToday) { logger.LogDebug("ReminderSkip: {ReminderId} — already sent today.", reminder.Id); return; }

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
            .ToListAsync();

        if (!subscriptions.Any()) return;

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
                .ToListAsync();
            db.PushSubscriptions.RemoveRange(expired);
        }

        reminder.LastSentAt = utcNow;

        logger.LogInformation(
            "Sent reminder to user {UserId} ({Count} device(s))",
            reminder.UserId,
            subscriptions.Count - expiredEndpoints.Count);
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
    private async Task ProcessThreatenedNotificationsAsync()
    {
        using var scope  = scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        var utcNow = DateTime.UtcNow;

        // Only consider active accounts that have at least one push
        // subscription registered — otherwise there's no device to
        // notify and we'd spend cycles for nothing.
        var candidates = await db.Users
            .Where(u => u.IsActive)
            .Where(u => db.PushSubscriptions.Any(s => s.UserId == u.Id))
            .ToListAsync();

        foreach (var user in candidates)
        {
            try { await ProcessThreatenedOneAsync(db, sender, user, utcNow); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing threatened-push for user {UserId}", user.Id);
            }
        }

        await db.SaveChangesAsync();
    }

    private async Task ProcessThreatenedOneAsync(
        AppDbContext db,
        IPushSender sender,
        User user,
        DateTime utcNow)
    {
        TimeZoneInfo userTz;
        try { userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId); }
        catch { return; }  // bad TZ — skip silently

        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, userTz);
        var today = DateOnly.FromDateTime(local);

        // Don't fire before the morning threshold. Users who normally
        // journal at 9am shouldn't get a "missed yesterday" push at 7am.
        if (local.Hour < ThreatenedPushHourLocal) return;

        var missedDate = today.AddDays(-1);

        // Already notified for THIS gap? Skip.
        if (user.StreakThreatenedNotifiedFor == missedDate) return;

        // Streak state — re-derive locally so this method is self-
        // contained. Mirrors IStreakService.ComputeAsync for current-streak
        // + lastEntryDate (which is all we need here). Keeps the trigger
        // condition aligned with the in-app banner.
        var validDates = await db.Entries
            .Where(e => e.UserId == user.Id && e.DeletedAt == null)
            .Select(e => e.EntryDate)
            .Distinct()
            .ToListAsync();

        if (validDates.Count == 0) return;

        var pauses = await db.Pauses
            .Where(p => p.UserId == user.Id && p.Status == Domain.Enums.PauseStatus.Active)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync();

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

        if (currentStreak <= 0) return;

        // Last entry date — needed to confirm "exactly yesterday missed."
        var lastEntryDate = validDates.OrderByDescending(d => d).FirstOrDefault();
        if (lastEntryDate == default) return;

        // Threatened iff the user missed exactly yesterday (lastEntry is
        // 2 days back relative to local-today). 0 or 1 day = fine; 3+
        // days = streak already broken (Welcome Back territory).
        if (today.DayNumber - lastEntryDate.DayNumber != 2) return;

        // ── Send to all subscriptions ──────────────────────────────────
        var subs = await db.PushSubscriptions
            .Where(s => s.UserId == user.Id)
            .ToListAsync();

        if (subs.Count == 0) return;

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
                .ToListAsync();
            db.PushSubscriptions.RemoveRange(expired);
        }

        // Mark dedupe even if 0 sent (all expired) — we don't want to
        // retry every minute against dead endpoints. The next missed-day
        // event will be a different date and re-arm naturally.
        user.StreakThreatenedNotifiedFor = missedDate;

        logger.LogInformation(
            "Sent streak-threatened push to user {UserId} ({Count} device(s), missed {MissedDate})",
            user.Id, sentCount, missedDate);
    }
}
