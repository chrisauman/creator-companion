using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface ILandingPageGenerationService
{
    /// <summary>Worker entrypoint: generate the day's page if it's past the scheduled hour and not yet done today.</summary>
    Task TickAsync(CancellationToken ct);

    /// <summary>Generate one page from the next pending keyword right now (manual trigger or scheduled run).</summary>
    Task<(bool ok, string message)> GenerateNextAsync(CancellationToken ct);
}

/// <summary>
/// Orchestrates daily AI page generation: pick the next queued keyword, generate
/// the page, run the quality gate, create it (auto-publishing if it clears the
/// bar — otherwise held as a draft), email the review notice, and mark the
/// keyword done. Auto-publish is gated on quality so it can't quietly ship a
/// thin page. Scoped lifetime; the worker wraps each tick in its own DI scope.
/// </summary>
public class LandingPageGenerationService(
    AppDbContext db,
    ILandingPageGenerator generator,
    ILandingPageService pages,
    IEmailService email,
    IConfiguration config,
    ILogger<LandingPageGenerationService> log) : ILandingPageGenerationService
{
    private const string ScheduleTimeZoneId = "America/New_York";
    private const string Recipient = "chris.auman@gmail.com";

    public async Task TickAsync(CancellationToken ct)
    {
        var settings = await GetSettingsAsync(ct);
        if (!settings.AutoGenerateEnabled) return;

        var tz = ResolveTz();
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var today = DateOnly.FromDateTime(nowLocal);

        // Fire once per day, after the configured hour. Time-passed match (not
        // exact-minute) so a redeploy landing mid-hour still runs today.
        if (settings.LastGeneratedDate == today) return;
        if (nowLocal.Hour < Math.Clamp(settings.GenerateHourLocalEt, 0, 23)) return;

        settings.LastGeneratedDate = today;     // claim the slot before the slow call to avoid double-runs
        settings.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var (ok, msg) = await GenerateNextAsync(ct);
        log.LogInformation("Daily landing-page generation: {Ok} — {Msg}", ok, msg);
    }

    public async Task<(bool, string)> GenerateNextAsync(CancellationToken ct)
    {
        if (!generator.IsConfigured) return (false, "Anthropic API key not configured.");

        var keyword = await db.LandingPageKeywords
            .Where(k => k.Status == LandingPageKeywordStatus.Pending)
            .OrderByDescending(k => k.Priority).ThenBy(k => k.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (keyword is null) return (false, "No pending keywords in the queue.");

        var existingTitles = await db.LandingPages.AsNoTracking().Where(p => p.DeletedAt == null)
            .Select(p => p.MetaTitle).ToListAsync(ct);
        var existingKeywords = await db.LandingPages.AsNoTracking().Where(p => p.DeletedAt == null)
            .Select(p => p.TargetKeyword).ToListAsync(ct);

        var gen = await generator.GenerateAsync(keyword.Keyword, keyword.Brief, existingTitles, ct);
        if (gen is null)
        {
            keyword.Status = LandingPageKeywordStatus.Failed;
            keyword.LastError = "Generation returned nothing (API error or unparseable output).";
            keyword.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (false, $"Generation failed for '{keyword.Keyword}'.");
        }

        var score = await generator.ScoreQualityAsync(gen, existingKeywords, ct);
        var slug = await UniqueSlugAsync(gen.Slug, gen.MetaTitle, ct);

        var (detail, error) = await pages.CreateAsync(
            new LpUpsertRequest(slug, keyword.Keyword, gen.MetaTitle, gen.MetaDescription, NoIndex: false, gen.Content),
            generatedByAi: true, qualityScore: score, ct);
        if (detail is null)
        {
            keyword.Status = LandingPageKeywordStatus.Failed;
            keyword.LastError = error ?? "Could not save the generated page.";
            keyword.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (false, error ?? "Save failed.");
        }

        var settings = await GetSettingsAsync(ct);
        var publish = settings.AutoPublishEnabled && score >= settings.QualityThreshold;
        var status = "Draft";
        if (publish && await pages.SetStatusAsync(Guid.Parse(detail.Id.ToString()), LandingPageStatus.Published, ct))
            status = "Published";

        keyword.Status = LandingPageKeywordStatus.Generated;
        keyword.GeneratedPageId = detail.Id;
        keyword.LastError = null;
        keyword.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await SafeEmailAsync(detail.MetaTitle, detail.Slug, status, score, ct);
        return (true, $"Generated '{detail.MetaTitle}' (score {score}, {status}).");
    }

    private async Task<string> UniqueSlugAsync(string preferred, string fallback, CancellationToken ct)
    {
        var baseSlug = pages.Slugify(string.IsNullOrWhiteSpace(preferred) ? fallback : preferred);
        if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "page";
        var slug = baseSlug;
        for (var i = 2; await pages.SlugTakenAsync(slug, null, ct); i++) slug = $"{baseSlug}-{i}";
        return slug;
    }

    private async Task SafeEmailAsync(string title, string slug, string status, int score, CancellationToken ct)
    {
        try
        {
            var marketingBase = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
            var adminUrl = (config["App:WebUrl"] ?? "https://app.creatorcompanionapp.com").TrimEnd('/') + "/admin/landing";
            await email.SendLandingPageReviewAsync(Recipient, title, slug, status, score, $"{marketingBase}/{slug}", adminUrl);
        }
        catch (Exception ex) { log.LogWarning(ex, "Landing-page review email failed."); }
    }

    private async Task<Domain.Models.LandingPageSettings> GetSettingsAsync(CancellationToken ct)
    {
        var s = await db.LandingPageSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;
        s = new Domain.Models.LandingPageSettings();
        db.LandingPageSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    private static TimeZoneInfo ResolveTz()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(ScheduleTimeZoneId); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }
}
