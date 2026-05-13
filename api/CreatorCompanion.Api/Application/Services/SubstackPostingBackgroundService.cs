namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Background worker for the Substack Notes auto-poster. Just the
/// timer harness — all real logic (picker, plan creation, posting,
/// failure handling) lives in ISubstackPostingService so the admin
/// "Post now" endpoint can use the same code path.
///
/// Independent of ReminderBackgroundService so a Substack outage
/// can't bleed into push delivery or trial emails.
///
/// Tick cadence: 60 s. Idempotence comes from the unique index on
/// SubstackDailyPlan.Date — even if the worker double-fires across
/// redeploys mid-second, only one row per day can be inserted.
/// </summary>
public class SubstackPostingBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<SubstackPostingBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Substack auto-poster background service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var poster = scope.ServiceProvider.GetRequiredService<ISubstackPostingService>();
                await poster.TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Substack auto-poster tick failed."); }

            try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
