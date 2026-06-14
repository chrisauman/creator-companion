namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// 60s background loop that drives daily AI landing-page generation. Each tick
/// delegates to <see cref="ILandingPageGenerationService.TickAsync"/>, which
/// no-ops until the configured hour (7am ET by default) and dedupes to once per
/// day. Independent of the reminder + social workers. Outer-catch faults go to
/// the logs + Sentry — a generation hiccup must never take the worker down.
/// </summary>
public class LandingPageBackgroundService(IServiceProvider services, ILogger<LandingPageBackgroundService> log)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        log.LogInformation("LandingPageBackgroundService started.");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = services.CreateScope();
                var gen = scope.ServiceProvider.GetRequiredService<ILandingPageGenerationService>();
                // Brief-on-add: fill one queued keyword's brief per tick (cheap,
                // throttled) so briefs appear soon after queueing without a burst.
                await gen.FillNextBriefAsync(stoppingToken);
                // Daily page generation (no-ops until the scheduled hour).
                await gen.TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                log.LogError(ex, "LandingPageBackgroundService tick failed.");
                Sentry.SentrySdk.CaptureException(ex);
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
        log.LogInformation("LandingPageBackgroundService stopping.");
    }
}
