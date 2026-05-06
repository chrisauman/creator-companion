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
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Reminder background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ProcessRemindersAsync(); }
            catch (Exception ex) { logger.LogError(ex, "Error processing reminders."); }

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
}
