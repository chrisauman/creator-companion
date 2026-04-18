using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using WebPushLib = WebPush;

namespace CreatorCompanion.Api.Application.Services;

public class ReminderBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<ReminderBackgroundService> logger) : BackgroundService
{
    private const string DefaultMessage = "Remember to log an entry to keep your streak alive.";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Reminder background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessRemindersAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing reminders.");
            }

            // Run every minute
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task ProcessRemindersAsync()
    {
        using var scope = scopeFactory.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        var utcNow = DateTime.UtcNow;

        // Load all enabled reminders with their user's timezone and subscriptions
        var reminders = await db.Reminders
            .Where(r => r.IsEnabled)
            .Include(r => r.User)
            .ToListAsync();

        foreach (var reminder in reminders)
        {
            try
            {
                var userTz  = TimeZoneInfo.FindSystemTimeZoneById(reminder.User.TimeZoneId);
                var userNow = TimeZoneInfo.ConvertTimeFromUtc(utcNow, userTz);
                var userTime = TimeOnly.FromDateTime(userNow);

                // Check if the reminder is due this minute
                if (userTime.Hour != reminder.Time.Hour || userTime.Minute != reminder.Time.Minute)
                    continue;

                // Check if already sent today in the user's timezone
                if (reminder.LastSentAt.HasValue)
                {
                    var lastSentLocal = TimeZoneInfo.ConvertTimeFromUtc(reminder.LastSentAt.Value, userTz);
                    if (lastSentLocal.Date == userNow.Date)
                        continue;
                }

                // Skip if user is on an active streak pause
                var today = DateOnly.FromDateTime(userNow);
                var isPaused = await db.Pauses.AnyAsync(p =>
                    p.UserId == reminder.UserId &&
                    p.Status == Domain.Enums.PauseStatus.Active &&
                    p.StartDate <= today &&
                    p.EndDate >= today);
                if (isPaused) continue;

                // Smart: skip if user already logged an entry today
                var alreadyLogged = await db.Entries.AnyAsync(e =>
                    e.UserId == reminder.UserId &&
                    e.EntryDate == today &&
                    e.DeletedAt == null);
                if (alreadyLogged) continue;

                // Get all push subscriptions for this user
                var subscriptions = await db.PushSubscriptions
                    .Where(s => s.UserId == reminder.UserId)
                    .ToListAsync();

                if (!subscriptions.Any()) continue;

                var title = "Creator Companion";
                var body  = reminder.Message ?? DefaultMessage;

                var expiredEndpoints = new List<string>();

                foreach (var sub in subscriptions)
                {
                    try
                    {
                        await sender.SendAsync(sub, title, body);
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

                // Clean up expired subscriptions
                if (expiredEndpoints.Any())
                {
                    var expired = await db.PushSubscriptions
                        .Where(s => expiredEndpoints.Contains(s.Endpoint))
                        .ToListAsync();
                    db.PushSubscriptions.RemoveRange(expired);
                }

                // Mark reminder as sent
                reminder.LastSentAt = utcNow;
                await db.SaveChangesAsync();

                logger.LogInformation(
                    "Sent reminder to user {UserId} ({Count} device(s))",
                    reminder.UserId, subscriptions.Count - expiredEndpoints.Count);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing reminder {ReminderId}", reminder.Id);
            }
        }
    }
}
