using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface ISocialPostingService
{
    /// <summary>
    /// One worker tick: create today's plans for enabled platforms, fire
    /// any due daily plans, drain due ad-hoc post targets, and email the
    /// daily summary once the day's plans have all resolved.
    /// </summary>
    Task TickAsync(CancellationToken ct);

    /// <summary>
    /// Admin "Post now" for a platform's daily spark — bypasses the
    /// schedule. Creates/replaces today's plan and fires immediately,
    /// returning the outcome so the UI can show it inline.
    /// </summary>
    Task<SocialPublishResult> FireDailyNowAsync(SocialPlatform platform, CancellationToken ct);

    /// <summary>
    /// Drop today's still-Pending plan for a platform so the next tick
    /// re-picks a fresh spark. No-op if already posted/failed.
    /// </summary>
    Task RerollTodayAsync(SocialPlatform platform, CancellationToken ct);

    /// <summary>
    /// Publish an ad-hoc post's Pending targets right now (used by the
    /// admin Compose "post now" path). Returns the per-platform results.
    /// </summary>
    Task<IReadOnlyList<(SocialPlatform Platform, SocialPublishResult Result)>> PublishAdHocNowAsync(
        int socialPostId, CancellationToken ct);
}

/// <summary>
/// The Marketing auto-poster's brain. Generalises the proven Substack
/// daily-spark pipeline across multiple API-backed platforms via
/// <see cref="ISocialPoster"/> adapters.
///
/// Per the admin's choices: each platform picks its OWN never-repeated
/// spark ("independent spark per platform"), posts auto-publish under a
/// global kill switch (no review queue), times are per-platform with
/// jitter, long sparks are truncated to fit (no threading), and a daily
/// summary + immediate failure alerts go to the admin.
///
/// Scoped lifetime — a fresh DbContext per tick / per request. The
/// background worker wraps each tick in its own DI scope.
/// </summary>
public class SocialPostingService(
    AppDbContext db,
    IEnumerable<ISocialPoster> posters,
    IHashtagService hashtags,
    IQuoteCardRenderer quoteCards,
    IEmailService email,
    IStorageService storage,
    ILogger<SocialPostingService> log) : ISocialPostingService
{
    private const string ScheduleTimeZoneId = "America/New_York";
    private const string RecipientEmail = "chris.auman@gmail.com";
    private const int MaxHashtags = 4;
    // A few characters of headroom: platforms count graphemes (emoji,
    // combining marks) where .NET counts UTF-16 units, so we leave slack
    // rather than risk a length rejection on the API.
    private const int SafetyMargin = 5;

    private static readonly Random Rng = new();
    private static readonly object RngLock = new();

    // ── Worker tick ──────────────────────────────────────────────────

    public async Task TickAsync(CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsAsync(ct);
        var tz = ResolveTimeZone();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        // Daily auto-post only runs under the global kill switch.
        if (settings.AutoPostEnabled)
        {
            await EnsureTodayPlansAsync(today, tz, ct);
            await FireDueDailyPlansAsync(settings, ct);
            await MaybeSendDailySummaryAsync(settings, today, ct);
        }

        // Ad-hoc posts fire regardless of the daily kill switch — the
        // admin composed them explicitly.
        await DrainDueAdHocTargetsAsync(ct);
    }

    private async Task EnsureTodayPlansAsync(DateOnly today, TimeZoneInfo tz, CancellationToken ct)
    {
        var accounts = await db.SocialAccounts
            .Where(a => a.Enabled && a.CredentialsEncrypted != null)
            .ToListAsync(ct);

        foreach (var account in accounts)
        {
            // Skip platforms we have no adapter for (e.g. enum member
            // reserved but adapter not shipped yet).
            if (ResolvePoster(account.Platform) is null) continue;

            var exists = await db.SocialDailyPlans
                .AnyAsync(p => p.Date == today && p.Platform == account.Platform, ct);
            if (exists) continue;

            var sparkId = await PickSparkIdAsync(account.Platform, ct);
            if (sparkId is null)
            {
                log.LogWarning("No eligible sparks left for {Platform}; skipping today's plan.", account.Platform);
                continue;
            }

            var plan = new SocialDailyPlan
            {
                Date         = today,
                Platform     = account.Platform,
                SparkId      = sparkId.Value,
                ScheduledFor = ComputeScheduledUtc(today, account, tz),
                Status       = SocialPostStatus.Pending,
                CreatedAt    = DateTime.UtcNow,
            };
            db.SocialDailyPlans.Add(plan);

            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                // Lost a race against another tick (unique (Date,Platform)).
                db.Entry(plan).State = EntityState.Detached;
            }
        }
    }

    private async Task FireDueDailyPlansAsync(SocialSettings settings, CancellationToken ct)
    {
        var due = await db.SocialDailyPlans
            .Include(p => p.Spark)
            .Where(p => p.Status == SocialPostStatus.Pending && p.ScheduledFor <= DateTime.UtcNow)
            .OrderBy(p => p.ScheduledFor)
            .ToListAsync(ct);

        foreach (var plan in due)
        {
            var account = await db.SocialAccounts.FirstOrDefaultAsync(a => a.Platform == plan.Platform, ct);
            if (account is null) continue;
            await FireDailyPlanAsync(settings, account, plan, ct);
        }
    }

    public async Task<SocialPublishResult> FireDailyNowAsync(SocialPlatform platform, CancellationToken ct)
    {
        var account = await db.SocialAccounts.FirstOrDefaultAsync(a => a.Platform == platform, ct);
        if (account is null || string.IsNullOrWhiteSpace(account.CredentialsEncrypted))
            return new SocialPublishResult(false, null, null, $"{platform} is not connected.", null);
        if (ResolvePoster(platform) is null)
            return new SocialPublishResult(false, null, null, $"No adapter for {platform} yet.", null);

        var settings = await GetOrCreateSettingsAsync(ct);
        var tz = ResolveTimeZone();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        // If today already resolved (Posted/Failed), drop it and re-pick a
        // fresh spark so the admin can re-test. Keep a Pending plan as-is.
        var existing = await db.SocialDailyPlans
            .FirstOrDefaultAsync(p => p.Date == today && p.Platform == platform, ct);
        if (existing is not null && existing.Status != SocialPostStatus.Pending)
        {
            db.SocialDailyPlans.Remove(existing);
            await db.SaveChangesAsync(ct);
            existing = null;
        }

        if (existing is null)
        {
            var sparkId = await PickSparkIdAsync(platform, ct);
            if (sparkId is null)
                return new SocialPublishResult(false, null, null, "No eligible sparks remaining. Add more in Content Library.", null);

            existing = new SocialDailyPlan
            {
                Date = today, Platform = platform, SparkId = sparkId.Value,
                ScheduledFor = DateTime.UtcNow, Status = SocialPostStatus.Pending, CreatedAt = DateTime.UtcNow,
            };
            db.SocialDailyPlans.Add(existing);
            await db.SaveChangesAsync(ct);
        }

        var plan = await db.SocialDailyPlans.Include(p => p.Spark)
            .FirstAsync(p => p.Id == existing.Id, ct);
        return await FireDailyPlanAsync(settings, account, plan, ct);
    }

    public async Task RerollTodayAsync(SocialPlatform platform, CancellationToken ct)
    {
        var tz = ResolveTimeZone();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var plan = await db.SocialDailyPlans
            .FirstOrDefaultAsync(p => p.Date == today && p.Platform == platform, ct);
        if (plan is null || plan.Status != SocialPostStatus.Pending) return;

        db.SocialDailyPlans.Remove(plan);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Publishes today's plan + records the outcome. Mirrors SubstackPostingService.FireOnePlanAsync.</summary>
    private async Task<SocialPublishResult> FireDailyPlanAsync(
        SocialSettings settings, SocialAccount account, SocialDailyPlan plan, CancellationToken ct)
    {
        var poster = ResolvePoster(plan.Platform);
        if (poster is null)
            return await RecordDailyFailureAsync(account, plan, $"No adapter for {plan.Platform}.", ct);
        if (plan.Spark is null)
            return await RecordDailyFailureAsync(account, plan, "Plan row had no associated spark.", ct);

        var sparkText = ComposeSparkText(plan.Spark);
        var text = await ComposeFinalTextAsync(poster, sparkText, settings.AutoHashtagsEnabled, ct);

        // Branded quote card from the spark's takeaway (the punchy one-
        // liner) when enabled + supported. The body text still carries the
        // full content + hashtags, so the image is the hook and the caption
        // adds depth. Renderer returns null on any failure → text-only.
        byte[]? card = null;
        if (settings.DailyQuoteCardsEnabled && poster.SupportsImages && quoteCards.IsAvailable)
            card = quoteCards.Render(plan.Spark.Takeaway, "Daily Spark");

        var request = new SocialPublishRequest(
            text, card, card is null ? null : "image/png", card is null ? null : plan.Spark.Takeaway);

        SocialPublishResult result;
        try
        {
            result = await poster.PublishAsync(account, request, ct);
        }
        catch (Exception ex)
        {
            return await RecordDailyFailureAsync(account, plan, ex.Message, ct);
        }

        if (!result.Success)
            return await RecordDailyFailureAsync(account, plan, result.ErrorMessage ?? "Unknown error.", ct);

        plan.Status     = SocialPostStatus.Posted;
        plan.PostedAt   = DateTime.UtcNow;
        plan.PostedText = text;
        plan.PostedUrl  = result.PostedUrl;
        plan.ErrorMessage = null;

        account.LastSuccessAt       = DateTime.UtcNow;
        account.LastFailureMessage  = null;
        account.ConsecutiveFailures = 0;
        account.UpdatedAt           = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        log.LogInformation("Daily spark posted to {Platform}. Url={Url}", plan.Platform, result.PostedUrl);
        return result;
    }

    private async Task<SocialPublishResult> RecordDailyFailureAsync(
        SocialAccount account, SocialDailyPlan plan, string error, CancellationToken ct)
    {
        var truncated = Trim(error, 1500);
        plan.Status       = SocialPostStatus.Failed;
        plan.ErrorMessage = truncated;

        account.LastFailureAt       = DateTime.UtcNow;
        account.LastFailureMessage  = truncated;
        account.ConsecutiveFailures += 1;
        account.UpdatedAt           = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        log.LogWarning("Daily spark post to {Platform} failed: {Error}", plan.Platform, truncated);

        await SafeSendFailureAlertAsync(plan.Platform.ToString(), "daily spark", truncated, ct);
        return new SocialPublishResult(false, null, null, truncated, null);
    }

    // ── Ad-hoc posts ─────────────────────────────────────────────────

    private async Task DrainDueAdHocTargetsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var duePosts = await db.SocialPosts
            .Include(p => p.Targets)
            .Where(p => p.Targets.Any(t => t.Status == SocialPostStatus.Pending)
                     && (p.ScheduledFor == null || p.ScheduledFor <= now))
            .ToListAsync(ct);

        foreach (var post in duePosts)
            await PublishAdHocTargetsAsync(post, ct);
    }

    public async Task<IReadOnlyList<(SocialPlatform, SocialPublishResult)>> PublishAdHocNowAsync(
        int socialPostId, CancellationToken ct)
    {
        var post = await db.SocialPosts.Include(p => p.Targets)
            .FirstOrDefaultAsync(p => p.Id == socialPostId, ct);
        if (post is null) return [];
        return await PublishAdHocTargetsAsync(post, ct);
    }

    private async Task<IReadOnlyList<(SocialPlatform, SocialPublishResult)>> PublishAdHocTargetsAsync(
        SocialPost post, CancellationToken ct)
    {
        var results = new List<(SocialPlatform, SocialPublishResult)>();

        // Load the image once (shared across platforms) if present.
        byte[]? imageBytes = null;
        var imageContentType = post.ImageContentType;
        if (!string.IsNullOrWhiteSpace(post.ImageObjectKey))
        {
            try { imageBytes = await storage.ReadAllBytesAsync(post.ImageObjectKey); }
            catch (Exception ex) { log.LogWarning(ex, "Ad-hoc image fetch failed for post {Id}.", post.Id); }
        }

        // No uploaded image but the admin asked for a quote card → render
        // one from the body text. Uploaded media always wins over a card.
        if (imageBytes is null && post.GenerateQuoteCard && quoteCards.IsAvailable
            && !string.IsNullOrWhiteSpace(post.Body))
        {
            imageBytes = quoteCards.Render(post.Body);
            imageContentType = imageBytes is null ? null : "image/png";
        }

        foreach (var target in post.Targets.Where(t => t.Status == SocialPostStatus.Pending))
        {
            var poster = ResolvePoster(target.Platform);
            var account = await db.SocialAccounts.FirstOrDefaultAsync(a => a.Platform == target.Platform, ct);

            if (poster is null || account is null || string.IsNullOrWhiteSpace(account.CredentialsEncrypted))
            {
                await RecordTargetFailureAsync(target, $"{target.Platform} is not connected.", ct);
                results.Add((target.Platform, new SocialPublishResult(false, null, null, "Not connected.", null)));
                continue;
            }

            var text = await ComposeFinalTextAsync(poster, post.Body, post.IncludeHashtags, ct);
            var useImage = poster.SupportsImages ? imageBytes : null;

            SocialPublishResult result;
            try
            {
                result = await poster.PublishAsync(account,
                    new SocialPublishRequest(text, useImage, imageContentType, null), ct);
            }
            catch (Exception ex)
            {
                await RecordTargetFailureAsync(target, ex.Message, ct);
                results.Add((target.Platform, new SocialPublishResult(false, null, null, ex.Message, null)));
                continue;
            }

            if (result.Success)
            {
                target.Status = SocialPostStatus.Posted;
                target.PostedAt = DateTime.UtcNow;
                target.PostedText = text;
                target.PostedUrl = result.PostedUrl;
                target.ErrorMessage = null;
                account.LastSuccessAt = DateTime.UtcNow;
                account.ConsecutiveFailures = 0;
                account.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            else
            {
                await RecordTargetFailureAsync(target, result.ErrorMessage ?? "Unknown error.", ct);
            }
            results.Add((target.Platform, result));
        }

        return results;
    }

    private async Task RecordTargetFailureAsync(SocialPostTarget target, string error, CancellationToken ct)
    {
        var truncated = Trim(error, 1500);
        target.Status = SocialPostStatus.Failed;
        target.ErrorMessage = truncated;
        await db.SaveChangesAsync(ct);
        log.LogWarning("Ad-hoc post to {Platform} failed: {Error}", target.Platform, truncated);
        await SafeSendFailureAlertAsync(target.Platform.ToString(), "ad-hoc post", truncated, ct);
    }

    // ── Daily summary ────────────────────────────────────────────────

    private async Task MaybeSendDailySummaryAsync(SocialSettings settings, DateOnly today, CancellationToken ct)
    {
        if (settings.LastSummarySentForDate == today) return;

        var plans = await db.SocialDailyPlans
            .Include(p => p.Spark)
            .Where(p => p.Date == today)
            .ToListAsync(ct);

        // Only summarise once the day's plans exist AND none are still
        // pending — i.e. every scheduled platform has fired.
        if (plans.Count == 0 || plans.Any(p => p.Status == SocialPostStatus.Pending)) return;

        var lines = plans.Select(p => new SocialSummaryLine(
            Platform: p.Platform.ToString(),
            Status:   p.Status.ToString(),
            Excerpt:  p.PostedText ?? p.Spark?.Takeaway,
            Url:      p.PostedUrl,
            Error:    p.ErrorMessage
        )).ToList();

        try
        {
            await email.SendSocialDailySummaryAsync(RecipientEmail, today, lines);
            settings.LastSummarySentForDate = today;
            settings.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Don't mark the day summarised if the email failed — retry
            // next tick. Surface to logs/Sentry via the worker's catch.
            log.LogWarning(ex, "Daily Marketing summary email failed; will retry next tick.");
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────

    /// <summary>
    /// Truncate-to-fit text composition: reserve room for hashtags within
    /// the platform's char budget, trim the body with an ellipsis if it
    /// overflows, then append the hashtags. If the tags alone wouldn't
    /// fit, drop them rather than the content.
    /// </summary>
    private async Task<string> ComposeFinalTextAsync(
        ISocialPoster poster, string body, bool includeHashtags, CancellationToken ct)
    {
        body = (body ?? string.Empty).Trim();
        var limit = Math.Max(1, poster.CharacterLimit - SafetyMargin);

        var tagSuffix = string.Empty;
        if (includeHashtags)
        {
            var tags = await hashtags.GenerateAsync(body, MaxHashtags, ct);
            if (tags.Count > 0)
            {
                var candidate = "\n\n" + string.Join(' ', tags);
                if (candidate.Length < limit) tagSuffix = candidate;
            }
        }

        var available = limit - tagSuffix.Length;
        if (body.Length > available)
            body = body[..Math.Max(0, available - 1)].TrimEnd() + "…";

        return body + tagSuffix;
    }

    private static string ComposeSparkText(MotivationEntry spark)
    {
        // Prefer the full content (the substantive advice); fall back to
        // the takeaway one-liner if a spark has no body.
        var content = string.IsNullOrWhiteSpace(spark.FullContent) ? spark.Takeaway : spark.FullContent;
        return (content ?? string.Empty).Trim();
    }

    /// <summary>Picks one spark Id not yet Posted FOR THIS PLATFORM. Independent per-platform rotation.</summary>
    private async Task<Guid?> PickSparkIdAsync(SocialPlatform platform, CancellationToken ct)
    {
        var platformInt = (int)platform;
        if (db.Database.IsRelational())
        {
            var raw = await db.MotivationEntries
                .FromSqlRaw("""
                    SELECT * FROM "MotivationEntries" s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM "SocialDailyPlans" p
                        WHERE p."SparkId" = s."Id" AND p."Platform" = {0} AND p."Status" = 1
                    )
                    ORDER BY random()
                    LIMIT 1
                    """, platformInt)
                .AsNoTracking()
                .FirstOrDefaultAsync(ct);
            return raw?.Id;
        }
        else
        {
            var postedIds = await db.SocialDailyPlans
                .Where(p => p.Platform == platform && p.Status == SocialPostStatus.Posted)
                .Select(p => p.SparkId)
                .ToListAsync(ct);
            var candidates = await db.MotivationEntries
                .Where(s => !postedIds.Contains(s.Id))
                .Select(s => s.Id)
                .ToListAsync(ct);
            if (candidates.Count == 0) return null;
            int idx;
            lock (RngLock) idx = Rng.Next(candidates.Count);
            return candidates[idx];
        }
    }

    /// <summary>Configured local post time +/- random jitter, converted to UTC.</summary>
    private static DateTime ComputeScheduledUtc(DateOnly today, SocialAccount account, TimeZoneInfo tz)
    {
        var local = new DateTime(today.Year, today.Month, today.Day,
            Math.Clamp(account.PostHourLocal, 0, 23), Math.Clamp(account.PostMinuteLocal, 0, 59), 0,
            DateTimeKind.Unspecified);

        if (account.JitterMinutes > 0)
        {
            int offset;
            lock (RngLock) offset = Rng.Next(-account.JitterMinutes, account.JitterMinutes + 1);
            local = local.AddMinutes(offset);
        }

        return TimeZoneInfo.ConvertTimeToUtc(local, tz);
    }

    private ISocialPoster? ResolvePoster(SocialPlatform platform) =>
        posters.FirstOrDefault(p => p.Platform == platform);

    private async Task<SocialSettings> GetOrCreateSettingsAsync(CancellationToken ct)
    {
        var s = await db.SocialSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;
        s = new SocialSettings();
        db.SocialSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    private async Task SafeSendFailureAlertAsync(string platform, string context, string error, CancellationToken ct)
    {
        try { await email.SendSocialFailureAlertAsync(RecipientEmail, platform, context, error); }
        catch (Exception ex) { log.LogWarning(ex, "Failure-alert email itself failed for {Platform}.", platform); }
    }

    private static TimeZoneInfo ResolveTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(ScheduleTimeZoneId); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }

    private static string Trim(string s, int max) => s.Length > max ? s[..max] + "…" : s;
}
