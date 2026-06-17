using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface ILandingPageGenerationService
{
    /// <summary>Worker entrypoint: generate the day's page if it's past the scheduled hour and not yet done today.</summary>
    Task TickAsync(CancellationToken ct);

    /// <summary>Generate one page from the next pending keyword right now (manual trigger or scheduled run).</summary>
    Task<(bool ok, string message)> GenerateNextAsync(CancellationToken ct);

    /// <summary>
    /// Generate the descriptive brief for ONE queued keyword that doesn't have one
    /// yet (the brief-on-add step). Returns true if it filled one — the worker
    /// calls this once per tick so briefs appear shortly after a keyword is queued,
    /// without a burst of API calls. Runs regardless of the auto-generate switch.
    /// </summary>
    Task<bool> FillNextBriefAsync(CancellationToken ct);

    /// <summary>Publish any scheduled posts whose time has arrived (worker, each tick). Returns count published.</summary>
    Task<int> PublishDueScheduledPostsAsync(CancellationToken ct);
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
    IBlogService blog,
    ILandingImageService images,
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

        // Route blog-type keywords to the post generator; pages fall through.
        if (keyword.ContentType == LandingPageContentType.Post)
            return await GeneratePostAsync(keyword, ct);

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

        await EnrichImagesAsync(gen, keyword.Keyword, ct);
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

        await SafeEmailAsync(detail.MetaTitle, detail.Slug, status, score, $"/{detail.Slug}", "/admin/landing", ct);
        return (true, $"Generated '{detail.MetaTitle}' (score {score}, {status}).");
    }

    public async Task<bool> FillNextBriefAsync(CancellationToken ct)
    {
        if (!generator.IsConfigured) return false;

        // Oldest queued keyword still missing its brief. Idea-status rows wait
        // until promoted to Pending — no point briefing something not committed.
        var k = await db.LandingPageKeywords
            .Where(x => x.Status == LandingPageKeywordStatus.Pending && (x.Brief == null || x.Brief == ""))
            .OrderBy(x => x.UpdatedAt)
            .FirstOrDefaultAsync(ct);
        if (k is null) return false;

        var relatedTitles = await db.LandingPages.AsNoTracking()
            .Where(p => p.DeletedAt == null && p.Status == LandingPageStatus.Published)
            .OrderByDescending(p => p.PublishedAt).Select(p => p.MetaTitle).Take(30).ToListAsync(ct);

        var brief = await generator.GenerateBriefAsync(k.Keyword, k.Theme, k.Discipline, k.PainPoint, k.Intent, relatedTitles, ct);
        if (string.IsNullOrWhiteSpace(brief)) return false;   // try again next tick

        k.Brief = brief;
        k.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        log.LogInformation("Generated brief for queued keyword '{Keyword}'.", k.Keyword);
        return true;
    }

    /// <summary>Generate a blog POST from a keyword: generate → featured image → score → create → publish-if-passes → email.</summary>
    private async Task<(bool, string)> GeneratePostAsync(LandingPageKeyword keyword, CancellationToken ct)
    {
        var categories = await db.BlogCategories.AsNoTracking().OrderBy(c => c.Position).ToListAsync(ct);
        var categoryNames = categories.Select(c => c.Name).ToList();
        var existingTitles = await db.BlogPosts.AsNoTracking().Where(p => p.DeletedAt == null).Select(p => p.Title).ToListAsync(ct);
        var existingKeywords = await db.BlogPosts.AsNoTracking().Where(p => p.DeletedAt == null).Select(p => p.TargetKeyword).ToListAsync(ct);

        var gen = await generator.GenerateBlogPostAsync(keyword.Keyword, keyword.Brief, categoryNames, existingTitles, ct);
        if (gen is null)
        {
            keyword.Status = LandingPageKeywordStatus.Failed;
            keyword.LastError = "Post generation returned nothing (API error or unparseable output).";
            keyword.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (false, $"Post generation failed for '{keyword.Keyword}'.");
        }

        // Featured image (blog cards/hero/OG). Best-effort via Pexels.
        string? featuredUrl = null;
        if (images.IsConfigured)
        {
            try { featuredUrl = await images.SourceForAsync(string.IsNullOrWhiteSpace(gen.FeaturedImageAlt) ? keyword.Keyword : gen.FeaturedImageAlt!, ct); }
            catch (Exception ex) { log.LogWarning(ex, "Featured image fetch failed for '{Keyword}'.", keyword.Keyword); }
        }

        var score = await generator.ScoreBlogQualityAsync(gen, existingKeywords, ct);
        var categoryId = MatchCategory(categories, gen.SuggestedCategory);

        var content = new BlogContent { BodyHtml = gen.BodyHtml, Faq = gen.Faq };
        var (detail, error) = await blog.CreateAsync(new BlogUpsertRequest(
            gen.Slug, categoryId, keyword.Keyword, gen.Title, gen.Dek, gen.MetaTitle, gen.MetaDescription,
            CanonicalUrl: null, NoIndex: false, FeaturedImageUrl: featuredUrl, FeaturedImageAlt: gen.FeaturedImageAlt,
            Snippet: null, Pinned: false, PinnedPosition: null, ScheduledFor: null, content), generatedByAi: true, qualityScore: score, ct);
        if (detail is null)
        {
            keyword.Status = LandingPageKeywordStatus.Failed;
            keyword.LastError = error ?? "Could not save the generated post.";
            keyword.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (false, error ?? "Save failed.");
        }

        var settings = await GetSettingsAsync(ct);
        var publish = settings.AutoPublishEnabled && score >= settings.QualityThreshold;
        var status = "Draft";
        if (publish && await blog.SetStatusAsync(detail.Id, LandingPageStatus.Published, ct)) status = "Published";

        keyword.Status = LandingPageKeywordStatus.Generated;
        keyword.GeneratedPostId = detail.Id;
        keyword.LastError = null;
        keyword.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await SafeEmailAsync($"[Blog] {detail.Title}", $"{detail.CategorySlug}/{detail.Slug}", status, score,
            $"/blog/{detail.CategorySlug}/{detail.Slug}", "/admin/blog", ct);
        return (true, $"Generated post '{detail.Title}' (score {score}, {status}).");
    }

    /// <summary>
    /// Publish any scheduled posts whose time has arrived. Runs each tick from the
    /// worker — no static rebuild needed since the blog renders dynamically.
    /// Returns the number published.
    /// </summary>
    public async Task<int> PublishDueScheduledPostsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var due = await db.BlogPosts
            .Where(p => p.DeletedAt == null && p.Status != LandingPageStatus.Published
                        && p.ScheduledFor != null && p.ScheduledFor <= now)
            .Select(p => p.Id).ToListAsync(ct);
        var n = 0;
        foreach (var id in due)
            if (await blog.SetStatusAsync(id, LandingPageStatus.Published, ct)) n++;
        if (n > 0) log.LogInformation("Published {N} scheduled blog post(s).", n);
        return n;
    }

    private static Guid MatchCategory(List<Domain.Models.BlogCategory> categories, string? suggested)
    {
        if (!string.IsNullOrWhiteSpace(suggested))
        {
            var match = categories.FirstOrDefault(c => string.Equals(c.Name, suggested.Trim(), StringComparison.OrdinalIgnoreCase))
                     ?? categories.FirstOrDefault(c => c.Name.Contains(suggested.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match.Id;
        }
        var uncategorized = categories.FirstOrDefault(c => c.IsSystem);
        return uncategorized?.Id ?? (categories.Count > 0 ? categories[0].Id : Guid.Empty);
    }

    /// <summary>
    /// Fill the photographic image slots the generator left empty (explainer,
    /// band, and the non-screenshot feature row) with sourced stock photos.
    /// No-op when Pexels isn't configured — the page still renders without them.
    /// </summary>
    private async Task EnrichImagesAsync(GeneratedPage gen, string keyword, CancellationToken ct)
    {
        if (!images.IsConfigured) return;
        var c = gen.Content;
        try
        {
            if (c.Explainer is not null && string.IsNullOrWhiteSpace(c.Explainer.ImageUrl))
                c.Explainer.ImageUrl = await images.SourceForAsync(Query(c.Explainer.ImageAlt, keyword), ct);
            if (c.Band is not null && string.IsNullOrWhiteSpace(c.Band.ImageUrl))
                c.Band.ImageUrl = await images.SourceForAsync($"{keyword} calm atmospheric", ct);
            foreach (var r in c.FeatureRows.Where(r => !r.Phone && string.IsNullOrWhiteSpace(r.MediaUrl)))
                r.MediaUrl = await images.SourceForAsync(Query(r.MediaAlt, keyword), ct);
        }
        catch (Exception ex) { log.LogWarning(ex, "Image enrichment partly failed for '{Keyword}'.", keyword); }

        static string Query(string? alt, string fallback) => string.IsNullOrWhiteSpace(alt) ? fallback : alt!;
    }

    private async Task<string> UniqueSlugAsync(string preferred, string fallback, CancellationToken ct)
    {
        var baseSlug = pages.Slugify(string.IsNullOrWhiteSpace(preferred) ? fallback : preferred);
        if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "page";
        var slug = baseSlug;
        for (var i = 2; await pages.SlugTakenAsync(slug, null, ct); i++) slug = $"{baseSlug}-{i}";
        return slug;
    }

    private async Task SafeEmailAsync(string title, string slug, string status, int score, string pagePath, string adminPath, CancellationToken ct)
    {
        try
        {
            var marketingBase = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
            var adminUrl = (config["App:WebUrl"] ?? "https://app.creatorcompanionapp.com").TrimEnd('/') + adminPath;
            await email.SendLandingPageReviewAsync(Recipient, title, slug, status, score, $"{marketingBase}{pagePath}", adminUrl);
        }
        catch (Exception ex) { log.LogWarning(ex, "Generation review email failed."); }
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
