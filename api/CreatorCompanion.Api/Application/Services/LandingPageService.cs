using System.Text.Json;
using System.Text.RegularExpressions;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface ILandingPageService
{
    Task<LpListResponse> ListAsync(string? search, string? status, string? sort, int skip, int take, CancellationToken ct);
    Task<LpDetail?> GetAsync(Guid id, CancellationToken ct);
    Task<(LpDetail? page, string? error)> CreateAsync(LpUpsertRequest req, bool generatedByAi, int? qualityScore, CancellationToken ct);
    Task<(LpDetail? page, string? error)> UpdateAsync(Guid id, LpUpsertRequest req, CancellationToken ct);
    Task<bool> SetStatusAsync(Guid id, LandingPageStatus status, CancellationToken ct);
    Task<bool> SoftDeleteAsync(Guid id, CancellationToken ct);
    Task<LpDetail?> RevertAsync(Guid id, CancellationToken ct);
    Task<string?> RenderPreviewAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<LpKeywordDto>> ListKeywordsAsync(CancellationToken ct);
    Task<LpKeywordDto> CreateKeywordAsync(LpKeywordUpsert req, CancellationToken ct);
    Task<LpKeywordDto?> UpdateKeywordAsync(Guid id, LpKeywordUpsert req, CancellationToken ct);
    Task<bool> DeleteKeywordAsync(Guid id, CancellationToken ct);

    Task<LpSettingsDto> GetSettingsAsync(CancellationToken ct);
    Task<LpSettingsDto> UpdateSettingsAsync(LpSettingsUpdate req, CancellationToken ct);

    /// <summary>Slugify a string into a clean URL slug (lowercase, hyphenated).</summary>
    string Slugify(string input);
    /// <summary>True if the slug is reserved or already taken by another page.</summary>
    Task<bool> SlugTakenAsync(string slug, Guid? exceptId, CancellationToken ct);
}

/// <summary>
/// Business logic for the landing-page admin (directory, editor, keyword queue,
/// settings) — also the shared create/update path the AI generator uses.
/// Centralises slug rules + the 301-history (old slugs) so renames never break SEO.
/// </summary>
public class LandingPageService(AppDbContext db, ILandingPageRenderer renderer, IConfiguration config) : ILandingPageService
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static readonly HashSet<string> ReservedSlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "index", "privacy", "terms", "signup", "favicon", "robots", "sitemap",
        "logo-icon", "logo-full", "og-image", "manifest", "resources", "hub", "v1", "api",
    };

    // ── Directory + editor ───────────────────────────────────────────
    public async Task<LpListResponse> ListAsync(string? search, string? status, string? sort, int skip, int take, CancellationToken ct)
    {
        var q = db.LandingPages.AsNoTracking().Where(p => p.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(p => p.Slug.Contains(s) || p.TargetKeyword.Contains(s) || p.MetaTitle.Contains(s));
        }
        if (Enum.TryParse<LandingPageStatus>(status, true, out var st)) q = q.Where(p => p.Status == st);

        q = sort switch
        {
            "created"     => q.OrderByDescending(p => p.CreatedAt),
            "published"   => q.OrderByDescending(p => p.PublishedAt),
            "title"       => q.OrderBy(p => p.MetaTitle),
            "status"      => q.OrderBy(p => p.Status).ThenByDescending(p => p.UpdatedAt),
            _             => q.OrderByDescending(p => p.UpdatedAt),
        };

        var total = await q.CountAsync(ct);
        var items = await q.Skip(Math.Max(0, skip)).Take(Math.Clamp(take, 1, 100))
            .Select(p => new LpListItem(p.Id, p.Slug, p.Status.ToString(), p.TargetKeyword, p.MetaTitle,
                p.NoIndex, p.QualityScore, p.GeneratedByAi, p.UpdatedAt, p.PublishedAt))
            .ToListAsync(ct);
        return new LpListResponse(items, total);
    }

    public async Task<LpDetail?> GetAsync(Guid id, CancellationToken ct)
    {
        var p = await db.LandingPages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        return p is null ? null : ToDetail(p);
    }

    public async Task<(LpDetail?, string?)> CreateAsync(LpUpsertRequest req, bool generatedByAi, int? qualityScore, CancellationToken ct)
    {
        var slug = NormalizeSlug(req.Slug, req.TargetKeyword);
        if (await SlugTakenAsync(slug, null, ct)) return (null, $"Slug '{slug}' is reserved or already in use.");

        var json = JsonSerializer.Serialize(req.Content ?? new());
        var now = DateTime.UtcNow;
        var page = new LandingPage
        {
            Slug = slug, Status = LandingPageStatus.Draft, TargetKeyword = req.TargetKeyword?.Trim() ?? "",
            MetaTitle = Trim(req.MetaTitle, 180), MetaDescription = Trim(req.MetaDescription, 360),
            NoIndex = req.NoIndex, ContentJson = json, OriginalContentJson = json,
            GeneratedByAi = generatedByAi, QualityScore = qualityScore, CreatedAt = now, UpdatedAt = now,
        };
        db.LandingPages.Add(page);
        await db.SaveChangesAsync(ct);
        return (ToDetail(page), null);
    }

    public async Task<(LpDetail?, string?)> UpdateAsync(Guid id, LpUpsertRequest req, CancellationToken ct)
    {
        var page = await db.LandingPages.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (page is null) return (null, null);

        var newSlug = NormalizeSlug(req.Slug, req.TargetKeyword);
        if (!string.Equals(newSlug, page.Slug, StringComparison.OrdinalIgnoreCase))
        {
            if (await SlugTakenAsync(newSlug, id, ct)) return (null, $"Slug '{newSlug}' is reserved or already in use.");
            // Keep the old slug so it 301s to the new one — never an SEO dead-end.
            var olds = DeserializeStrings(page.OldSlugsJson);
            if (!olds.Contains(page.Slug)) olds.Add(page.Slug);
            page.OldSlugsJson = JsonSerializer.Serialize(olds);
            page.Slug = newSlug;
        }

        page.TargetKeyword = req.TargetKeyword?.Trim() ?? page.TargetKeyword;
        page.MetaTitle = Trim(req.MetaTitle, 180);
        page.MetaDescription = Trim(req.MetaDescription, 360);
        page.NoIndex = req.NoIndex;
        page.ContentJson = JsonSerializer.Serialize(req.Content ?? new());
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return (ToDetail(page), null);
    }

    public async Task<bool> SetStatusAsync(Guid id, LandingPageStatus status, CancellationToken ct)
    {
        var page = await db.LandingPages.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (page is null) return false;
        page.Status = status;
        if (status == LandingPageStatus.Published && page.PublishedAt is null) page.PublishedAt = DateTime.UtcNow;
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> SoftDeleteAsync(Guid id, CancellationToken ct)
    {
        var page = await db.LandingPages.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (page is null) return false;
        page.DeletedAt = DateTime.UtcNow;
        page.Status = LandingPageStatus.Archived;
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<LpDetail?> RevertAsync(Guid id, CancellationToken ct)
    {
        var page = await db.LandingPages.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (page is null || page.OriginalContentJson is null) return null;
        page.ContentJson = page.OriginalContentJson;
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDetail(page);
    }

    public async Task<string?> RenderPreviewAsync(Guid id, CancellationToken ct)
    {
        var page = await db.LandingPages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (page is null) return null;
        var related = await db.LandingPages.AsNoTracking()
            .Where(p => p.Id != id && p.Status == LandingPageStatus.Published && p.DeletedAt == null && !p.NoIndex)
            .OrderByDescending(p => p.PublishedAt).Take(6).ToListAsync(ct);
        var html = renderer.Render(page, related);
        // Preview is opened on the APP domain (not marketing), so inject a <base>
        // pointing at the marketing site — relative styles.css/images/video then
        // resolve. (In-page #anchors are slightly off in preview only; fine.)
        var baseUrl = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
        return html.Replace("<head>", $"<head><base href=\"{baseUrl}/\">");
    }

    // ── Keyword queue ────────────────────────────────────────────────
    public async Task<IReadOnlyList<LpKeywordDto>> ListKeywordsAsync(CancellationToken ct) =>
        await db.LandingPageKeywords.AsNoTracking()
            .OrderBy(k => k.Status).ThenByDescending(k => k.Priority).ThenBy(k => k.CreatedAt)
            .Select(k => new LpKeywordDto(k.Id, k.Keyword, k.Brief, k.Priority, k.Status.ToString(), k.GeneratedPageId, k.LastError, k.CreatedAt))
            .ToListAsync(ct);

    public async Task<LpKeywordDto> CreateKeywordAsync(LpKeywordUpsert req, CancellationToken ct)
    {
        var k = new LandingPageKeyword { Keyword = req.Keyword.Trim(), Brief = req.Brief?.Trim(), Priority = req.Priority };
        db.LandingPageKeywords.Add(k);
        await db.SaveChangesAsync(ct);
        return new LpKeywordDto(k.Id, k.Keyword, k.Brief, k.Priority, k.Status.ToString(), null, null, k.CreatedAt);
    }

    public async Task<LpKeywordDto?> UpdateKeywordAsync(Guid id, LpKeywordUpsert req, CancellationToken ct)
    {
        var k = await db.LandingPageKeywords.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (k is null) return null;
        k.Keyword = req.Keyword.Trim();
        k.Brief = req.Brief?.Trim();
        k.Priority = req.Priority;
        if (Enum.TryParse<LandingPageKeywordStatus>(req.Status, true, out var st)) k.Status = st;
        k.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return new LpKeywordDto(k.Id, k.Keyword, k.Brief, k.Priority, k.Status.ToString(), k.GeneratedPageId, k.LastError, k.CreatedAt);
    }

    public async Task<bool> DeleteKeywordAsync(Guid id, CancellationToken ct)
    {
        var k = await db.LandingPageKeywords.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (k is null) return false;
        db.LandingPageKeywords.Remove(k);
        await db.SaveChangesAsync(ct);
        return true;
    }

    // ── Settings ─────────────────────────────────────────────────────
    public async Task<LpSettingsDto> GetSettingsAsync(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        return new LpSettingsDto(s.AutoGenerateEnabled, s.AutoPublishEnabled, s.QualityThreshold, s.GenerateHourLocalEt,
            s.LastGeneratedDate?.ToString("yyyy-MM-dd"),
            !string.IsNullOrWhiteSpace(config["Ga4:MeasurementId"]),
            !string.IsNullOrWhiteSpace(config["Pexels:ApiKey"]),
            !string.IsNullOrWhiteSpace(config["Anthropic:ApiKey"]));
    }

    public async Task<LpSettingsDto> UpdateSettingsAsync(LpSettingsUpdate req, CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        s.AutoGenerateEnabled = req.AutoGenerateEnabled;
        s.AutoPublishEnabled = req.AutoPublishEnabled;
        s.QualityThreshold = Math.Clamp(req.QualityThreshold, 0, 100);
        s.GenerateHourLocalEt = Math.Clamp(req.GenerateHourLocalEt, 0, 23);
        s.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetSettingsAsync(ct);
    }

    private async Task<LandingPageSettings> GetOrCreateSettingsAsync(CancellationToken ct)
    {
        var s = await db.LandingPageSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;
        s = new LandingPageSettings();
        db.LandingPageSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    // ── helpers ──────────────────────────────────────────────────────
    public string Slugify(string input)
    {
        var s = (input ?? "").Trim().ToLowerInvariant();
        s = Regex.Replace(s, @"[^a-z0-9]+", "-").Trim('-');
        return Regex.Replace(s, "-{2,}", "-");
    }

    private string NormalizeSlug(string? slug, string? fallback)
    {
        var s = Slugify(string.IsNullOrWhiteSpace(slug) ? (fallback ?? "") : slug);
        return string.IsNullOrWhiteSpace(s) ? "page-" + Guid.NewGuid().ToString("N")[..8] : s;
    }

    public async Task<bool> SlugTakenAsync(string slug, Guid? exceptId, CancellationToken ct)
    {
        if (ReservedSlugs.Contains(slug)) return true;
        return await db.LandingPages.AnyAsync(p => p.Slug == slug && (exceptId == null || p.Id != exceptId), ct);
    }

    private static LpContent ParseContent(string json)
    {
        try { return JsonSerializer.Deserialize<LpContent>(json, Json) ?? new(); } catch { return new(); }
    }

    private static List<string> DeserializeStrings(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); } catch { return new(); }
    }

    private static string Trim(string? s, int max)
    {
        s = (s ?? "").Trim();
        return s.Length > max ? s[..max] : s;
    }

    private static LpDetail ToDetail(LandingPage p) => new(
        p.Id, p.Slug, p.Status.ToString(), p.TargetKeyword, p.MetaTitle, p.MetaDescription, p.NoIndex,
        p.QualityScore, p.GeneratedByAi, ParseContent(p.ContentJson), p.OriginalContentJson is not null,
        p.CreatedAt, p.UpdatedAt, p.PublishedAt);
}
