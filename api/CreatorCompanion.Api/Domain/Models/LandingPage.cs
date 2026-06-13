using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// One SEO landing page. Queryable/SEO fields are real columns (so the admin
/// directory can search/sort and the renderer can set head tags precisely);
/// the section CONTENT is a single JSONB blob (<see cref="ContentJson"/>) so the
/// page template can evolve without a DB migration every time. The server-side
/// renderer turns the content blob into HTML against the agreed template.
///
/// Never hard-deleted: <see cref="DeletedAt"/> soft-deletes, and prior slugs are
/// retained in <see cref="OldSlugsJson"/> so a renamed/removed page 301/410s
/// instead of becoming an SEO dead-end.
/// </summary>
public class LandingPage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>URL path segment (flat, e.g. "morning-pages-app"). Unique.</summary>
    public string Slug { get; set; } = string.Empty;

    public LandingPageStatus Status { get; set; } = LandingPageStatus.Draft;

    /// <summary>The search term this page targets (drives generation + the directory).</summary>
    public string TargetKeyword { get; set; } = string.Empty;

    /// <summary>&lt;title&gt; — keep ≤ ~60 chars.</summary>
    public string MetaTitle { get; set; } = string.Empty;

    /// <summary>meta description — keep ≤ ~155 chars.</summary>
    public string MetaDescription { get; set; } = string.Empty;

    /// <summary>Per-page override to keep a page out of the index (and the sitemap).</summary>
    public bool NoIndex { get; set; } = false;

    /// <summary>
    /// JSONB blob of the section content (hero, cards, faq, etc.) matching the
    /// template schema. Schema-flexible on purpose — layout changes are renderer
    /// changes, not migrations.
    /// </summary>
    public string ContentJson { get; set; } = "{}";

    /// <summary>The AI's original content, kept so the admin can revert manual edits.</summary>
    public string? OriginalContentJson { get; set; }

    /// <summary>R2 storage key of the auto-generated 1200×630 OG/share image.</summary>
    public string? OgImageKey { get; set; }

    /// <summary>0–100 quality-gate score; ≥ threshold auto-publishes, else held as draft.</summary>
    public int? QualityScore { get; set; }

    public bool GeneratedByAi { get; set; } = false;

    /// <summary>JSON array of prior slugs → each 301s to the current slug.</summary>
    public string OldSlugsJson { get; set; } = "[]";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }

    /// <summary>Soft-delete marker. Deleted slugs serve 410 (and stay reserved).</summary>
    public DateTime? DeletedAt { get; set; }
}
