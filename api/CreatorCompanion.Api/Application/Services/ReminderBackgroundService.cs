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

        logger.LogDebug(
            "ReminderCheck: reminder={ReminderId} set={Set} userNow={UserNow} tz={Tz} match={Match}",
            reminder.Id, reminder.Time.ToString("HH:mm"), userTime.ToString("HH:mm"),
            reminder.User.TimeZoneId, userTime.Hour == reminder.Time.Hour && userTime.Minute == reminder.Time.Minute);

        // ── Time match ───────────────────────────────────────────────────────
        if (userTime.Hour != reminder.Time.Hour || userTime.Minute != reminder.Time.Minute)
            return;

        // ── Skip if streak is paused ─────────────────────────────────────────
        var isPaused = await db.Pauses.AnyAsync(p =>
            p.UserId == reminder.UserId &&
            p.Status == Domain.Enums.PauseStatus.Active &&
            p.StartDate <= today &&
            p.EndDate >= today);
        if (isPaused) { logger.LogDebug("ReminderSkip: {ReminderId} — streak paused.", reminder.Id); return; }

        // ── Skip if user already logged today ────────────────────────────────
        var alreadyLogged = await db.Entries.AnyAsync(e =>
            e.UserId == reminder.UserId &&
            e.EntryDate == today &&
            e.DeletedAt == null);
        if (alreadyLogged) { logger.LogDebug("ReminderSkip: {ReminderId} — already logged today.", reminder.Id); return; }

        // ── Days since last entry ────────────────────────────────────────────
        var lastEntryDate = await db.Entries
            .Where(e => e.UserId == reminder.UserId && e.DeletedAt == null)
            .OrderByDescending(e => e.EntryDate)
            .Select(e => (DateOnly?)e.EntryDate)
            .FirstOrDefaultAsync();

        var daysSinceLastEntry = lastEntryDate.HasValue
            ? today.DayNumber - lastEntryDate.Value.DayNumber
            : int.MaxValue;

        // ── Frequency throttling (default reminders only) ────────────────────
        // Custom (non-default) reminders always fire on their set schedule.
        if (reminder.IsDefault)
        {
            var requiredInterval = daysSinceLastEntry <= config.DailyUpToDays      ? 1
                                 : daysSinceLastEntry <= config.Every2DaysUpToDays ? 2
                                 : daysSinceLastEntry <= config.Every3DaysUpToDays ? 3
                                 : 7;

            if (reminder.LastSentAt.HasValue)
            {
                var lastSentLocal    = TimeZoneInfo.ConvertTimeFromUtc(reminder.LastSentAt.Value, userTz);
                var daysSinceLastSent = today.DayNumber - DateOnly.FromDateTime(lastSentLocal).DayNumber;
                if (daysSinceLastSent < requiredInterval)
                {
                    logger.LogDebug("ReminderSkip: {ReminderId} — throttled (lastSent={Days}d ago, required={Req}d).", reminder.Id, daysSinceLastSent, requiredInterval);
                    return;
                }
            }
        }
        else
        {
            // Custom reminder: still prevent duplicate sends on the same day
            if (reminder.LastSentAt.HasValue)
            {
                var lastSentLocal = TimeZoneInfo.ConvertTimeFromUtc(reminder.LastSentAt.Value, userTz);
                if (DateOnly.FromDateTime(lastSentLocal) == today)
                {
                    logger.LogDebug("ReminderSkip: {ReminderId} — already sent today.", reminder.Id);
                    return;
                }
            }
        }

        // ── Select message ───────────────────────────────────────────────────
        var body = reminder.Message ?? SelectMessage(config, daysSinceLastEntry);

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
            "Sent reminder to user {UserId} ({Count} device(s), interval={Interval}d, daysSinceLast={Days})",
            reminder.UserId,
            subscriptions.Count - expiredEndpoints.Count,
            reminder.IsDefault ? "throttled" : "1",
            daysSinceLastEntry == int.MaxValue ? "∞" : daysSinceLastEntry.ToString());
    }

    private static string SelectMessage(ReminderConfig config, int daysSinceLastEntry) =>
        daysSinceLastEntry <= 1                          ? config.MessageActiveStreak
        : daysSinceLastEntry <= 2                        ? config.MessageJustBroke
        : daysSinceLastEntry <= config.Every2DaysUpToDays ? config.MessageShortLapse
        : daysSinceLastEntry <= config.Every3DaysUpToDays ? config.MessageMediumLapse
        : config.MessageLongAbsence;
}
