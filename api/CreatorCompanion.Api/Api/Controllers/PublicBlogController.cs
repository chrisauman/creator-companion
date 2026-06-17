using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using CreatorCompanion.Api.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Serves the public blog on the marketing domain (proxied): the index +
/// category listings (paginated), individual posts, and the RSS feed. Nested
/// URLs (/blog/{category}/{slug}); slug/category changes 301 to the current
/// path; soft-deleted posts 410; drafts are private unless a signed preview
/// token is supplied. Published, indexable posts also appear in sitemap.xml
/// (served by the landing controller, which queries blog posts too).
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("v1/blog")]
public class PublicBlogController(AppDbContext db, IBlogRenderer renderer, IConfiguration config) : ControllerBase
{
    private const int PageSize = 9;
    private const string CacheHeader = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
    private readonly string _base = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');

    // Single-segment paths under /blog that are NOT categories.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase) { "page", "rss.xml", "rss", "feed", "search" };

    // ── Index ─────────────────────────────────────────────────────────
    [HttpGet("")]
    public Task<IActionResult> Index(CancellationToken ct) => Listing(null, 1, ct);

    [HttpGet("page/{page:int}")]
    public Task<IActionResult> IndexPaged(int page, CancellationToken ct) => Listing(null, page, ct);

    [HttpGet("rss.xml")]
    public async Task<IActionResult> Rss(CancellationToken ct)
    {
        var posts = await PublishedQuery().OrderByDescending(p => p.PublishDate).Take(30)
            .Select(p => new { p.Slug, p.Title, p.MetaDescription, p.Snippet, p.PublishDate, p.PublishedAt, p.CreatedAt, p.CategoryId }).ToListAsync(ct);
        var cats = await CategoryMapAsync(ct);
        var items = posts.Select(p => new BlogRssItem(p.Title,
            $"{_base}/blog/{CatSlug(cats, p.CategoryId)}/{p.Slug}",
            string.IsNullOrWhiteSpace(p.MetaDescription) ? p.Snippet : p.MetaDescription,
            p.PublishDate ?? p.PublishedAt ?? p.CreatedAt)).ToList();
        Response.Headers.CacheControl = CacheHeader;
        return Content(renderer.Rss(items), "application/rss+xml; charset=utf-8");
    }

    // ── Category listing OR (single segment) ──────────────────────────
    [HttpGet("{category}")]
    public async Task<IActionResult> Category(string category, CancellationToken ct)
    {
        category = Norm(category);
        if (Reserved.Contains(category) || category.Contains('.')) return NotFound();
        return await Listing(category, 1, ct);
    }

    [HttpGet("{category}/page/{page:int}")]
    public Task<IActionResult> CategoryPaged(string category, int page, CancellationToken ct) => Listing(Norm(category), page, ct);

    // ── Post ──────────────────────────────────────────────────────────
    [HttpGet("{category}/{slug}")]
    public async Task<IActionResult> Post(string category, string slug,
        [FromQuery(Name = "lp_preview")] string? preview, CancellationToken ct)
    {
        category = Norm(category);
        slug = Norm(slug);
        if (slug.Contains('.') || Reserved.Contains(slug)) return NotFound();

        var post = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug, ct);
        if (post is not null)
        {
            if (post.DeletedAt is not null) return StatusCode(StatusCodes.Status410Gone);

            var isPreview = !string.IsNullOrEmpty(preview) && string.Equals(
                preview, LandingPageService.ComputePreviewToken(post.Id, config["Entry:EncryptionKey"]), StringComparison.Ordinal);
            if (post.Status != LandingPageStatus.Published && !isPreview) return NotFound();

            var cat = await db.BlogCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == post.CategoryId, ct)
                      ?? await db.BlogCategories.AsNoTracking().FirstAsync(c => c.Slug == BlogService.UncategorizedSlug, ct);

            // Canonicalize the category segment — wrong/old category path 301s to current.
            if (!string.Equals(cat.Slug, category, StringComparison.OrdinalIgnoreCase) && !isPreview)
                return RedirectPermanent($"/blog/{cat.Slug}/{post.Slug}");

            var url = $"{_base}/blog/{cat.Slug}/{post.Slug}";
            var content = ParseContent(post.ContentJson);
            var html = renderer.RenderPost(post, cat.Slug, cat.Name, content, url, Array.Empty<BlogCardView>());

            if (post.Status != LandingPageStatus.Published)
            {
                if (!html.Contains("name=\"robots\"", StringComparison.OrdinalIgnoreCase))
                    html = html.Replace("<head>", "<head><meta name=\"robots\" content=\"noindex, nofollow\">");
                Response.Headers.CacheControl = "no-store";
            }
            else Response.Headers.CacheControl = CacheHeader;
            return Content(html, "text/html; charset=utf-8");
        }

        // 301 from an old path (slug rename or category move).
        var oldPath = $"{category}/{slug}";
        var moved = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(p =>
            p.DeletedAt == null && p.Status == LandingPageStatus.Published &&
            (p.OldSlugsJson.Contains("\"" + oldPath + "\"") || p.OldSlugsJson.Contains("\"" + slug + "\"")), ct);
        if (moved is not null)
        {
            var cat = await db.BlogCategories.AsNoTracking().Where(c => c.Id == moved.CategoryId).Select(c => c.Slug).FirstOrDefaultAsync(ct);
            return RedirectPermanent($"/blog/{cat ?? BlogService.UncategorizedSlug}/{moved.Slug}");
        }
        return NotFound();
    }

    // ── shared listing logic ──────────────────────────────────────────
    private async Task<IActionResult> Listing(string? categorySlug, int page, CancellationToken ct)
    {
        page = Math.Max(1, page);
        BlogCategory? category = null;
        if (categorySlug is not null)
        {
            category = await db.BlogCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Slug == categorySlug, ct);
            if (category is null)
            {
                // Old category slug → 301 to current.
                var moved = await db.BlogCategories.AsNoTracking()
                    .FirstOrDefaultAsync(c => c.OldSlugsJson.Contains("\"" + categorySlug + "\""), ct);
                return moved is not null ? RedirectPermanent($"/blog/{moved.Slug}") : NotFound();
            }
        }

        var q = PublishedQuery();
        if (category is not null) q = q.Where(p => p.CategoryId == category.Id);
        var total = await q.CountAsync(ct);
        var totalPages = Math.Max(1, (int)Math.Ceiling(total / (double)PageSize));
        if (page > totalPages) page = totalPages;

        var posts = await q
            .OrderByDescending(p => p.Pinned).ThenBy(p => p.PinnedPosition ?? int.MaxValue).ThenByDescending(p => p.PublishDate)
            .Skip((page - 1) * PageSize).Take(PageSize)
            .Select(p => new { p.Slug, p.Title, p.Snippet, p.MetaDescription, p.FeaturedImageUrl, p.FeaturedImageAlt, p.PublishDate, p.PublishedAt, p.CreatedAt, p.ReadingTimeMinutes, p.CategoryId })
            .ToListAsync(ct);

        var cats = await CategoryMapAsync(ct);
        var cards = posts.Select(p => new BlogCardView(p.Title,
            $"/blog/{CatSlug(cats, p.CategoryId)}/{p.Slug}",
            string.IsNullOrWhiteSpace(p.Snippet) ? p.MetaDescription : p.Snippet,
            p.FeaturedImageUrl, p.FeaturedImageAlt, CatName(cats, p.CategoryId),
            p.PublishDate ?? p.PublishedAt ?? p.CreatedAt, p.ReadingTimeMinutes)).ToList();

        var basePath = category is null ? $"{_base}/blog" : $"{_base}/blog/{category.Slug}";
        var canonical = page <= 1 ? basePath : $"{basePath}/page/{page}";
        var breadcrumbs = category is null
            ? Array.Empty<(string, string)>()
            : new[] { ("Blog", $"{_base}/blog"), (category.Name, basePath) };

        var view = new BlogListingView(
            category?.Name ?? "The blog",
            category?.Description ?? "Ideas, methods, and gentle encouragement for showing up to your creative work — one day at a time.",
            category?.Slug is null ? null : category.Name,
            canonical, cards, page, totalPages, basePath, breadcrumbs);

        Response.Headers.CacheControl = CacheHeader;
        return Content(renderer.RenderListing(view), "text/html; charset=utf-8");
    }

    private IQueryable<BlogPost> PublishedQuery() =>
        db.BlogPosts.AsNoTracking().Where(p => p.DeletedAt == null && p.Status == LandingPageStatus.Published);

    private async Task<Dictionary<Guid, (string Slug, string Name)>> CategoryMapAsync(CancellationToken ct) =>
        await db.BlogCategories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => (c.Slug, c.Name), ct);

    private static string CatSlug(Dictionary<Guid, (string Slug, string Name)> m, Guid id) => m.TryGetValue(id, out var v) ? v.Slug : BlogService.UncategorizedSlug;
    private static string CatName(Dictionary<Guid, (string Slug, string Name)> m, Guid id) => m.TryGetValue(id, out var v) ? v.Name : "Uncategorized";

    private static BlogContent ParseContent(string json)
    {
        try { return System.Text.Json.JsonSerializer.Deserialize<BlogContent>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new(); }
        catch { return new(); }
    }

    private static string Norm(string? s) => (s ?? string.Empty).Trim().ToLowerInvariant();
}
