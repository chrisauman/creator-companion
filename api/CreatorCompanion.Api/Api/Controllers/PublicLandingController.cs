using System.Net;
using System.Text;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Serves published landing pages as full HTML on the marketing domain.
///
/// ROUTING: the marketing site's vercel.json rewrites a flat top-level slug
/// (creatorcompanionapp.com/{slug}) to GET /v1/lp/{slug} here — but ONLY for
/// paths Vercel's filesystem didn't already serve (styles.css, images/, *.html
/// are static files and win first). So this controller only ever sees real
/// slugs + the occasional unknown path, which it 404s. A <see cref="Reserved"/>
/// blocklist hard-404s names that must always be static, belt-and-suspenders.
///
/// Status semantics (SEO-correct): published → 200 HTML (cached); draft/archived
/// → 404 (not public); soft-deleted → 410 Gone; a slug that a live page has
/// since renamed away from → 301 to the current slug; unknown → 404.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("v1/lp")]
public class PublicLandingController(AppDbContext db, ILandingPageRenderer renderer, IConfiguration config) : ControllerBase
{
    private readonly string _base = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');

    private const string CacheHeader = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

    // Names that must always resolve to a static file / dedicated route, never
    // a landing page — so we never shadow the real marketing site.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "", "index", "privacy", "terms", "signup", "favicon", "favicon.ico",
        "robots.txt", "sitemap", "logo-icon", "logo-full", "og-image",
        "manifest", "404", "500", "v1", "resources", "hub",
    };

    /// <summary>
    /// Dynamic sitemap: the key static pages + every published, indexable
    /// landing page, with lastmod. Replaces the static sitemap.xml (the
    /// marketing vercel.json rewrites /sitemap.xml here). This literal route
    /// out-ranks the {slug} catch-all below.
    /// </summary>
    [HttpGet("sitemap.xml")]
    public async Task<IActionResult> Sitemap(CancellationToken ct)
    {
        var pages = await db.LandingPages.AsNoTracking()
            .Where(p => p.Status == LandingPageStatus.Published && p.DeletedAt == null && !p.NoIndex)
            .Select(p => new { p.Slug, p.UpdatedAt })
            .ToListAsync(ct);

        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        void Url(string loc, DateTime mod, string freq, string pri) => sb
            .Append("<url><loc>").Append(WebUtility.HtmlEncode(loc)).Append("</loc>")
            .Append("<lastmod>").Append(mod.ToString("yyyy-MM-dd")).Append("</lastmod>")
            .Append("<changefreq>").Append(freq).Append("</changefreq>")
            .Append("<priority>").Append(pri).Append("</priority></url>");

        Url($"{_base}/", DateTime.UtcNow, "weekly", "1.0");
        Url($"{_base}/resources", DateTime.UtcNow, "weekly", "0.6");
        Url($"{_base}/signup.html", DateTime.UtcNow, "monthly", "0.7");
        foreach (var p in pages) Url($"{_base}/{p.Slug}", p.UpdatedAt, "monthly", "0.8");
        sb.Append("</urlset>");

        Response.Headers.CacheControl = CacheHeader;
        return Content(sb.ToString(), "application/xml; charset=utf-8");
    }

    /// <summary>
    /// The /resources hub (rewritten here): an on-brand index of every
    /// published page — crawl discovery + an internal-linking surface.
    /// </summary>
    [HttpGet("hub")]
    public async Task<IActionResult> Hub(CancellationToken ct)
    {
        var pages = await db.LandingPages.AsNoTracking()
            .Where(p => p.Status == LandingPageStatus.Published && p.DeletedAt == null && !p.NoIndex)
            .OrderByDescending(p => p.PublishedAt)
            .ToListAsync(ct);
        Response.Headers.CacheControl = CacheHeader;
        return Content(renderer.RenderHub(pages), "text/html; charset=utf-8");
    }

    [HttpGet("{slug}")]
    public async Task<IActionResult> Get(string slug, [FromQuery(Name = "lp_preview")] string? preview, CancellationToken ct)
    {
        slug = (slug ?? string.Empty).Trim().ToLowerInvariant();

        // Anything with a dot is a would-be static asset (it only reached us
        // because no such file exists) — and reserved names are off-limits.
        if (slug.Contains('.') || Reserved.Contains(slug))
            return NotFound();

        var page = await db.LandingPages.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug, ct);
        if (page is not null)
        {
            if (page.DeletedAt is not null)
                return StatusCode(StatusCodes.Status410Gone);     // removed → tell crawlers it's gone

            // Drafts are private UNLESS a valid signed preview token is presented
            // (the admin "Preview" opens this on the marketing domain so all
            // assets resolve, unlike a cross-origin blob on the app domain).
            var isPreview = !string.IsNullOrEmpty(preview) && string.Equals(
                preview, LandingPageService.ComputePreviewToken(page.Id, config["Entry:EncryptionKey"]), StringComparison.Ordinal);
            if (page.Status != LandingPageStatus.Published && !isPreview)
                return NotFound();

            var related = await db.LandingPages.AsNoTracking()
                .Where(p => p.Id != page.Id && p.Status == LandingPageStatus.Published
                    && p.DeletedAt == null && !p.NoIndex)
                .OrderByDescending(p => p.PublishedAt)
                .Take(6)
                .ToListAsync(ct);

            var html = renderer.Render(page, related);
            if (page.Status != LandingPageStatus.Published)
            {
                // Draft preview: never index, never cache.
                if (!html.Contains("name=\"robots\"", StringComparison.OrdinalIgnoreCase))
                    html = html.Replace("<head>", "<head><meta name=\"robots\" content=\"noindex, nofollow\">");
                Response.Headers.CacheControl = "no-store";
            }
            else
            {
                // Static-fast via CDN, but editable: short browser cache, longer
                // CDN cache, serve-stale-while-revalidating so edits propagate.
                Response.Headers.CacheControl = CacheHeader;
            }
            return Content(html, "text/html; charset=utf-8");
        }

        // A previously-used slug that a live page has since renamed away from → 301.
        var moved = await db.LandingPages.AsNoTracking().FirstOrDefaultAsync(
            p => p.DeletedAt == null && p.Status == LandingPageStatus.Published
                 && p.OldSlugsJson.Contains("\"" + slug + "\""), ct);
        if (moved is not null)
            return RedirectPermanent("/" + moved.Slug);

        return NotFound();
    }
}
