namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Background worker for the Marketing auto-poster. Timer harness only —
/// all logic lives in ISocialPostingService so the admin "Post now"
/// endpoints share the exact same code path.
///
/// Independent of ReminderBackgroundService and SubstackPostingBackgroundService
/// so a social-platform outage can't bleed into push delivery, trial
/// emails, or the Substack daily reminder.
///
/// Tick cadence: 60s. Idempotence comes from the unique (Date, Platform)
/// index on SocialDailyPlan — a double-firing tick across a redeploy
/// can't insert duplicate plans.
/// </summary>
public class SocialPostingBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<SocialPostingBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Marketing auto-poster background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var poster = scope.ServiceProvider.GetRequiredService<ISocialPostingService>();
                await poster.TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Marketing auto-poster tick failed.");
                Sentry.SentrySdk.CaptureException(ex);
            }

            try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
