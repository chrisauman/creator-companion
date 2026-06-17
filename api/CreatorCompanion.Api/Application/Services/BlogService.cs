using System.Text.Json;
using System.Text.RegularExpressions;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface IBlogService
{
    // Posts
    Task<BlogListResponse> ListAsync(string? search, string? status, string? category, string? sort, int skip, int take, CancellationToken ct);
    Task<BlogDetail?> GetAsync(Guid id, CancellationToken ct);
    Task<(BlogDetail? post, string? error)> CreateAsync(BlogUpsertRequest req, bool generatedByAi, int? qualityScore, CancellationToken ct);
    Task<(BlogDetail? post, string? error)> UpdateAsync(Guid id, BlogUpsertRequest req, CancellationToken ct);
    Task<bool> SetStatusAsync(Guid id, LandingPageStatus status, CancellationToken ct);
    Task<bool> SoftDeleteAsync(Guid id, CancellationToken ct);
    Task<BlogDetail?> RevertAsync(Guid id, CancellationToken ct);
    Task<BlogDetail?> UndoAsync(Guid id, CancellationToken ct);
    Task<BlogAiEditProposal?> AiEditAsync(Guid id, string instruction, CancellationToken ct);
    Task<string?> PreviewUrlAsync(Guid id, CancellationToken ct);

    // Categories
    Task<IReadOnlyList<BlogCategoryDto>> ListCategoriesAsync(CancellationToken ct);
    Task<(BlogCategoryDto? cat, string? error)> CreateCategoryAsync(BlogCategoryUpsert req, CancellationToken ct);
    Task<(BlogCategoryDto? cat, string? error)> UpdateCategoryAsync(Guid id, BlogCategoryUpsert req, CancellationToken ct);
    Task<(bool ok, string? error)> DeleteCategoryAsync(Guid id, CancellationToken ct);
    Task<Guid> EnsureUncategorizedAsync(CancellationToken ct);

    string Slugify(string input);
}

/// <summary>
/// Business logic for the blog: posts + categories. Mirrors LandingPageService's
/// slug/301-history discipline (renames + category moves never break a URL) and
/// adds blog rules — sanitised body, derived reading time + snippet, the
/// Uncategorized system category, and the publish lifecycle the worker relies on.
/// </summary>
public class BlogService(AppDbContext db, ILandingPageGenerator generator, IConfiguration config) : IBlogService
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    public const string UncategorizedSlug = "uncategorized";

    // Slugs a category/post may never take (they're routes under /blog).
    private static readonly HashSet<string> ReservedSlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "page", "rss.xml", "rss", "feed", "search", "sitemap.xml",
    };

    // ── Posts ─────────────────────────────────────────────────────────
    public async Task<BlogListResponse> ListAsync(string? search, string? status, string? category, string? sort, int skip, int take, CancellationToken ct)
    {
        var q = from p in db.BlogPosts.AsNoTracking()
                join c in db.BlogCategories.AsNoTracking() on p.CategoryId equals c.Id
                where p.DeletedAt == null
                select new { p, c };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(x => x.p.Slug.Contains(s) || x.p.TargetKeyword.Contains(s) || x.p.Title.Contains(s));
        }
        if (Enum.TryParse<LandingPageStatus>(status, true, out var st)) q = q.Where(x => x.p.Status == st);
        if (!string.IsNullOrWhiteSpace(category)) q = q.Where(x => x.c.Slug == category);

        q = sort switch
        {
            "created"   => q.OrderByDescending(x => x.p.CreatedAt),
            "published" => q.OrderByDescending(x => x.p.PublishDate),
            "title"     => q.OrderBy(x => x.p.Title),
            "status"    => q.OrderBy(x => x.p.Status).ThenByDescending(x => x.p.UpdatedAt),
            _           => q.OrderByDescending(x => x.p.UpdatedAt),
        };

        var total = await q.CountAsync(ct);
        var items = await q.Skip(Math.Max(0, skip)).Take(Math.Clamp(take, 1, 100))
            .Select(x => new BlogListItem(x.p.Id, x.p.Slug, x.p.Status.ToString(), x.p.Title, x.p.TargetKeyword,
                x.c.Slug, x.c.Name, x.p.Pinned, x.p.NoIndex, x.p.QualityScore, x.p.GeneratedByAi,
                x.p.ReadingTimeMinutes, x.p.PublishDate, x.p.ScheduledFor, x.p.UpdatedAt))
            .ToListAsync(ct);
        return new BlogListResponse(items, total);
    }

    public async Task<BlogDetail?> GetAsync(Guid id, CancellationToken ct)
    {
        var p = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (p is null) return null;
        var catSlug = await db.BlogCategories.AsNoTracking().Where(c => c.Id == p.CategoryId).Select(c => c.Slug).FirstOrDefaultAsync(ct);
        return ToDetail(p, catSlug ?? UncategorizedSlug);
    }

    public async Task<(BlogDetail?, string?)> CreateAsync(BlogUpsertRequest req, bool generatedByAi, int? qualityScore, CancellationToken ct)
    {
        var slug = NormalizeSlug(req.Slug, req.Title, req.TargetKeyword);
        if (await SlugTakenAsync(slug, null, ct)) return (null, $"Slug '{slug}' is reserved or already in use.");

        var categoryId = await ResolveCategoryAsync(req.CategoryId, ct);
        var content = SanitizeContent(req.Content);
        var json = JsonSerializer.Serialize(content);
        var now = DateTime.UtcNow;
        var post = new BlogPost
        {
            Slug = slug, Status = LandingPageStatus.Draft, CategoryId = categoryId,
            TargetKeyword = req.TargetKeyword?.Trim() ?? "", Title = Trim(req.Title, 280),
            Dek = Clean(req.Dek), MetaTitle = Trim(string.IsNullOrWhiteSpace(req.MetaTitle) ? req.Title : req.MetaTitle, 190),
            MetaDescription = Trim(req.MetaDescription, 380), CanonicalUrl = Clean(req.CanonicalUrl), NoIndex = req.NoIndex,
            FeaturedImageUrl = Clean(req.FeaturedImageUrl), FeaturedImageAlt = Clean(req.FeaturedImageAlt),
            Snippet = string.IsNullOrWhiteSpace(req.Snippet) ? BlogHtml.Snippet(content.BodyHtml) : Trim(req.Snippet, 380),
            ReadingTimeMinutes = BlogHtml.ReadingTimeMinutes(content.BodyHtml),
            Pinned = req.Pinned, PinnedPosition = req.PinnedPosition, ScheduledFor = req.ScheduledFor,
            ContentJson = json, OriginalContentJson = json, GeneratedByAi = generatedByAi, QualityScore = qualityScore,
            CreatedAt = now, UpdatedAt = now, LastUpdatedAt = now,
        };
        db.BlogPosts.Add(post);
        await db.SaveChangesAsync(ct);
        return (await GetAsync(post.Id, ct), null);
    }

    public async Task<(BlogDetail?, string?)> UpdateAsync(Guid id, BlogUpsertRequest req, CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null) return (null, null);

        var oldCatSlug = await db.BlogCategories.Where(c => c.Id == post.CategoryId).Select(c => c.Slug).FirstAsync(ct);
        var newCategoryId = await ResolveCategoryAsync(req.CategoryId, ct);
        var newSlug = NormalizeSlug(req.Slug, req.Title, req.TargetKeyword);
        var newCatSlug = await db.BlogCategories.Where(c => c.Id == newCategoryId).Select(c => c.Slug).FirstAsync(ct);

        if (!string.Equals(newSlug, post.Slug, StringComparison.OrdinalIgnoreCase))
            if (await SlugTakenAsync(newSlug, id, ct)) return (null, $"Slug '{newSlug}' is reserved or already in use.");

        // Record the old path for a 301 if the slug OR category changed.
        if (!string.Equals(newSlug, post.Slug, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(newCatSlug, oldCatSlug, StringComparison.OrdinalIgnoreCase))
        {
            var olds = DeserializeStrings(post.OldSlugsJson);
            var oldPath = $"{oldCatSlug}/{post.Slug}";
            if (!olds.Contains(oldPath)) olds.Add(oldPath);
            post.OldSlugsJson = JsonSerializer.Serialize(olds);
        }

        post.Slug = newSlug;
        post.CategoryId = newCategoryId;
        post.TargetKeyword = req.TargetKeyword?.Trim() ?? post.TargetKeyword;
        post.Title = Trim(req.Title, 280);
        post.Dek = Clean(req.Dek);
        post.MetaTitle = Trim(string.IsNullOrWhiteSpace(req.MetaTitle) ? req.Title : req.MetaTitle, 190);
        post.MetaDescription = Trim(req.MetaDescription, 380);
        post.CanonicalUrl = Clean(req.CanonicalUrl);
        post.NoIndex = req.NoIndex;
        post.FeaturedImageUrl = Clean(req.FeaturedImageUrl);
        post.FeaturedImageAlt = Clean(req.FeaturedImageAlt);
        post.Pinned = req.Pinned;
        post.PinnedPosition = req.PinnedPosition;
        post.ScheduledFor = req.ScheduledFor;

        var content = SanitizeContent(req.Content);
        var newJson = JsonSerializer.Serialize(content);
        var contentChanged = !string.Equals(newJson, post.ContentJson, StringComparison.Ordinal);
        if (contentChanged) post.PreviousContentJson = post.ContentJson;   // one-step undo
        post.ContentJson = newJson;
        post.Snippet = string.IsNullOrWhiteSpace(req.Snippet) ? BlogHtml.Snippet(content.BodyHtml) : Trim(req.Snippet, 380);
        post.ReadingTimeMinutes = BlogHtml.ReadingTimeMinutes(content.BodyHtml);

        var now = DateTime.UtcNow;
        post.UpdatedAt = now;
        // last-updated tracks meaningful content edits only (not pin/schedule tweaks)
        if (contentChanged || post.Title != req.Title) post.LastUpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return (await GetAsync(post.Id, ct), null);
    }

    public async Task<bool> SetStatusAsync(Guid id, LandingPageStatus status, CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null) return false;
        post.Status = status;
        if (status == LandingPageStatus.Published)
        {
            post.PublishedAt ??= DateTime.UtcNow;
            post.PublishDate ??= DateTime.UtcNow;
            post.ScheduledFor = null;   // publishing now clears any pending schedule
        }
        post.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> SoftDeleteAsync(Guid id, CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null) return false;
        post.DeletedAt = DateTime.UtcNow;
        post.Status = LandingPageStatus.Archived;
        post.UpdatedAt = DateTime.UtcNow;

        var src = await db.LandingPageKeywords.FirstOrDefaultAsync(k => k.GeneratedPostId == id, ct);
        if (src is not null) { src.Status = LandingPageKeywordStatus.Pending; src.GeneratedPostId = null; src.UpdatedAt = DateTime.UtcNow; }

        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<BlogDetail?> RevertAsync(Guid id, CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null || post.OriginalContentJson is null) return null;
        post.PreviousContentJson = post.ContentJson;
        post.ContentJson = post.OriginalContentJson;
        RecomputeFromBody(post);
        post.UpdatedAt = post.LastUpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<BlogDetail?> UndoAsync(Guid id, CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null || post.PreviousContentJson is null) return null;
        (post.ContentJson, post.PreviousContentJson) = (post.PreviousContentJson, post.ContentJson);
        RecomputeFromBody(post);
        post.UpdatedAt = post.LastUpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<BlogAiEditProposal?> AiEditAsync(Guid id, string instruction, CancellationToken ct)
    {
        var post = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, ct);
        if (post is null) return null;
        var current = ParseContent(post.ContentJson);
        var result = await generator.EditBlogContentAsync(current, instruction, ct);
        if (result is null) return null;
        // Sanitize the proposed body before it ever reaches the client/preview.
        result.Content.BodyHtml = BlogHtml.Sanitize(result.Content.BodyHtml);
        return new BlogAiEditProposal(result.Content, result.Changes);
    }

    public async Task<string?> PreviewUrlAsync(Guid id, CancellationToken ct)
    {
        var detail = await GetAsync(id, ct);
        if (detail is null) return null;
        var b = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
        return $"{b}/blog/{detail.CategorySlug}/{detail.Slug}?lp_preview={LandingPageService.ComputePreviewToken(id, config["Entry:EncryptionKey"])}";
    }

    // ── Categories ────────────────────────────────────────────────────
    public async Task<IReadOnlyList<BlogCategoryDto>> ListCategoriesAsync(CancellationToken ct)
    {
        await EnsureUncategorizedAsync(ct);
        var cats = await db.BlogCategories.AsNoTracking().OrderBy(c => c.Position).ThenBy(c => c.Name).ToListAsync(ct);
        var counts = await db.BlogPosts.AsNoTracking().Where(p => p.DeletedAt == null)
            .GroupBy(p => p.CategoryId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return cats.Select(c => new BlogCategoryDto(c.Id, c.Slug, c.Name, c.Description, c.Position, c.IsSystem,
            counts.GetValueOrDefault(c.Id))).ToList();
    }

    public async Task<(BlogCategoryDto?, string?)> CreateCategoryAsync(BlogCategoryUpsert req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name)) return (null, "Name is required.");
        var slug = NormalizeCategorySlug(req.Slug, req.Name);
        if (await db.BlogCategories.AnyAsync(c => c.Slug == slug, ct) || ReservedSlugs.Contains(slug))
            return (null, $"Category slug '{slug}' is reserved or already in use.");
        var c = new BlogCategory { Slug = slug, Name = req.Name.Trim(), Description = Clean(req.Description), Position = req.Position };
        db.BlogCategories.Add(c);
        await db.SaveChangesAsync(ct);
        return (new BlogCategoryDto(c.Id, c.Slug, c.Name, c.Description, c.Position, c.IsSystem, 0), null);
    }

    public async Task<(BlogCategoryDto?, string?)> UpdateCategoryAsync(Guid id, BlogCategoryUpsert req, CancellationToken ct)
    {
        var c = await db.BlogCategories.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return (null, null);
        if (c.IsSystem) return (null, "The Uncategorized category can't be edited.");
        if (string.IsNullOrWhiteSpace(req.Name)) return (null, "Name is required.");

        var newSlug = NormalizeCategorySlug(req.Slug, req.Name);
        if (!string.Equals(newSlug, c.Slug, StringComparison.OrdinalIgnoreCase))
        {
            if (await db.BlogCategories.AnyAsync(x => x.Slug == newSlug && x.Id != id, ct) || ReservedSlugs.Contains(newSlug))
                return (null, $"Category slug '{newSlug}' is reserved or already in use.");
            // Record every affected post's old path so each 301s to the new category path.
            var olds = DeserializeStrings(c.OldSlugsJson);
            if (!olds.Contains(c.Slug)) olds.Add(c.Slug);
            c.OldSlugsJson = JsonSerializer.Serialize(olds);
            var affected = await db.BlogPosts.Where(p => p.CategoryId == id && p.DeletedAt == null).ToListAsync(ct);
            foreach (var p in affected)
            {
                var paths = DeserializeStrings(p.OldSlugsJson);
                var oldPath = $"{c.Slug}/{p.Slug}";
                if (!paths.Contains(oldPath)) paths.Add(oldPath);
                p.OldSlugsJson = JsonSerializer.Serialize(paths);
            }
            c.Slug = newSlug;
        }
        c.Name = req.Name.Trim();
        c.Description = Clean(req.Description);
        c.Position = req.Position;
        c.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        var count = await db.BlogPosts.CountAsync(p => p.CategoryId == id && p.DeletedAt == null, ct);
        return (new BlogCategoryDto(c.Id, c.Slug, c.Name, c.Description, c.Position, c.IsSystem, count), null);
    }

    public async Task<(bool, string?)> DeleteCategoryAsync(Guid id, CancellationToken ct)
    {
        var c = await db.BlogCategories.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return (false, null);
        if (c.IsSystem) return (false, "The Uncategorized category can't be deleted.");

        var uncategorized = await EnsureUncategorizedAsync(ct);
        var posts = await db.BlogPosts.Where(p => p.CategoryId == id && p.DeletedAt == null).ToListAsync(ct);
        foreach (var p in posts)
        {
            // Reassign to Uncategorized; record the old path for a 301.
            var paths = DeserializeStrings(p.OldSlugsJson);
            var oldPath = $"{c.Slug}/{p.Slug}";
            if (!paths.Contains(oldPath)) paths.Add(oldPath);
            p.OldSlugsJson = JsonSerializer.Serialize(paths);
            p.CategoryId = uncategorized;
            p.UpdatedAt = DateTime.UtcNow;
        }
        db.BlogCategories.Remove(c);
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<Guid> EnsureUncategorizedAsync(CancellationToken ct)
    {
        var existing = await db.BlogCategories.FirstOrDefaultAsync(c => c.Slug == UncategorizedSlug, ct);
        if (existing is not null) return existing.Id;
        var c = new BlogCategory { Slug = UncategorizedSlug, Name = "Uncategorized", IsSystem = true, Position = 999 };
        db.BlogCategories.Add(c);
        await db.SaveChangesAsync(ct);
        return c.Id;
    }

    // ── helpers ───────────────────────────────────────────────────────
    private async Task<Guid> ResolveCategoryAsync(Guid categoryId, CancellationToken ct)
    {
        if (categoryId != Guid.Empty && await db.BlogCategories.AnyAsync(c => c.Id == categoryId, ct)) return categoryId;
        return await EnsureUncategorizedAsync(ct);
    }

    private static BlogContent SanitizeContent(BlogContent? c)
    {
        c ??= new();
        c.BodyHtml = BlogHtml.Sanitize(c.BodyHtml);
        c.Faq ??= new();
        return c;
    }

    private static void RecomputeFromBody(BlogPost post)
    {
        var content = ParseContent(post.ContentJson);
        post.ReadingTimeMinutes = BlogHtml.ReadingTimeMinutes(content.BodyHtml);
        if (string.IsNullOrWhiteSpace(post.Snippet)) post.Snippet = BlogHtml.Snippet(content.BodyHtml);
    }

    public string Slugify(string input)
    {
        var s = (input ?? "").Trim().ToLowerInvariant();
        s = Regex.Replace(s, @"[^a-z0-9]+", "-").Trim('-');
        return Regex.Replace(s, "-{2,}", "-");
    }

    private string NormalizeSlug(string? slug, string? title, string? keyword)
    {
        var s = Slugify(!string.IsNullOrWhiteSpace(slug) ? slug : !string.IsNullOrWhiteSpace(title) ? title : keyword ?? "");
        return string.IsNullOrWhiteSpace(s) ? "post-" + Guid.NewGuid().ToString("N")[..8] : s;
    }

    private string NormalizeCategorySlug(string? slug, string name)
    {
        var s = Slugify(!string.IsNullOrWhiteSpace(slug) ? slug : name);
        return string.IsNullOrWhiteSpace(s) ? "category-" + Guid.NewGuid().ToString("N")[..8] : s;
    }

    private async Task<bool> SlugTakenAsync(string slug, Guid? exceptId, CancellationToken ct)
    {
        if (ReservedSlugs.Contains(slug)) return true;
        return await db.BlogPosts.AnyAsync(p => p.Slug == slug && (exceptId == null || p.Id != exceptId), ct);
    }

    private static BlogContent ParseContent(string json)
    {
        try { return JsonSerializer.Deserialize<BlogContent>(json, Json) ?? new(); } catch { return new(); }
    }

    private static List<string> DeserializeStrings(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); } catch { return new(); }
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static string Trim(string? s, int max) { s = (s ?? "").Trim(); return s.Length > max ? s[..max] : s; }

    private static BlogDetail ToDetail(BlogPost p, string categorySlug) => new(
        p.Id, p.Slug, p.Status.ToString(), p.CategoryId, categorySlug, p.TargetKeyword, p.Title, p.Dek,
        p.MetaTitle, p.MetaDescription, p.CanonicalUrl, p.NoIndex, p.FeaturedImageUrl, p.FeaturedImageAlt,
        p.Snippet, p.ReadingTimeMinutes, p.Pinned, p.PinnedPosition, ParseContent(p.ContentJson),
        p.OriginalContentJson is not null, p.PreviousContentJson is not null, p.QualityScore, p.GeneratedByAi,
        p.PublishDate, p.ScheduledFor, p.LastUpdatedAt, p.CreatedAt, p.UpdatedAt, p.PublishedAt);
}
