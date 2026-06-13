using CreatorCompanion.Api.Application.Interfaces;
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
public class PublicLandingController(AppDbContext db, ILandingPageRenderer renderer) : ControllerBase
{
    // Names that must always resolve to a static file / dedicated route, never
    // a landing page — so we never shadow the real marketing site.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "", "index", "privacy", "terms", "signup", "favicon", "favicon.ico",
        "robots.txt", "sitemap", "logo-icon", "logo-full", "og-image",
        "manifest", "404", "500", "v1", "resources",
    };

    [HttpGet("{slug}")]
    public async Task<IActionResult> Get(string slug, CancellationToken ct)
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
            if (page.Status != LandingPageStatus.Published)
                return NotFound();                                  // drafts aren't public

            var related = await db.LandingPages.AsNoTracking()
                .Where(p => p.Id != page.Id && p.Status == LandingPageStatus.Published
                    && p.DeletedAt == null && !p.NoIndex)
                .OrderByDescending(p => p.PublishedAt)
                .Take(6)
                .ToListAsync(ct);

            var html = renderer.Render(page, related);
            // Static-fast via CDN, but editable: short browser cache, longer CDN
            // cache, and serve-stale-while-revalidating so edits propagate within
            // minutes without ever blocking a request.
            Response.Headers.CacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
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
