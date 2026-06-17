using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// One blog post. Mirrors the landing-page model's lifecycle (slug + 301 history,
/// soft-delete, JSONB content, AI-original/previous snapshots, quality score) but
/// carries blog-specific, card-queryable columns: category, featured image,
/// dates, reading time, pinning. The long-form body lives in <see cref="ContentJson"/>
/// (<see cref="Application.DTOs.BlogContent"/>) as sanitized rich-text HTML.
///
/// Public URL is NESTED: /blog/{category-slug}/{slug}; uncategorized posts use the
/// explicit /blog/uncategorized/{slug}. Slug is unique across the whole blog.
/// </summary>
public class BlogPost
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>URL slug — unique across the whole blog (not per-category).</summary>
    public string Slug { get; set; } = string.Empty;

    public LandingPageStatus Status { get; set; } = LandingPageStatus.Draft;

    /// <summary>Category this post belongs to (exactly one; defaults to Uncategorized).</summary>
    public Guid CategoryId { get; set; }

    /// <summary>The search term/topic this post targets (drives the directory + dedup).</summary>
    public string TargetKeyword { get; set; } = string.Empty;

    /// <summary>The post's own H1 / display title (distinct from MetaTitle).</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Optional standfirst / subtitle shown under the title.</summary>
    public string? Dek { get; set; }

    /// <summary>&lt;title&gt; — defaults to Title if blank.</summary>
    public string MetaTitle { get; set; } = string.Empty;

    public string MetaDescription { get; set; } = string.Empty;

    /// <summary>Per-post canonical override; usually null (auto-computed).</summary>
    public string? CanonicalUrl { get; set; }

    public bool NoIndex { get; set; } = false;

    /// <summary>Required featured image (card + hero + OG). Same-origin lp-img/{id} or absolute.</summary>
    public string? FeaturedImageUrl { get; set; }
    public string? FeaturedImageAlt { get; set; }

    /// <summary>Auto-snippet for cards/meta — first ~140 chars of body if not set explicitly.</summary>
    public string? Snippet { get; set; }

    /// <summary>ceil(word_count / 200); recomputed on save.</summary>
    public int ReadingTimeMinutes { get; set; }

    /// <summary>JSONB blog content (sanitized body HTML, optional FAQ, CTA).</summary>
    public string ContentJson { get; set; } = "{}";
    public string? OriginalContentJson { get; set; }
    public string? PreviousContentJson { get; set; }

    public string? OgImageKey { get; set; }
    public int? QualityScore { get; set; }
    public bool GeneratedByAi { get; set; } = false;

    // Pinning — pinned posts sort above the date order on index/category lists.
    public bool Pinned { get; set; } = false;
    public int? PinnedPosition { get; set; }

    /// <summary>Primary sort key for listings (set when first published).</summary>
    public DateTime? PublishDate { get; set; }

    /// <summary>Most recent meaningful content edit (drives "last updated" + dateModified).</summary>
    public DateTime LastUpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>If set + in the future, the worker auto-publishes the post at this time.</summary>
    public DateTime? ScheduledFor { get; set; }

    /// <summary>JSON array of prior slugs (and category-qualified paths) → each 301s here.</summary>
    public string OldSlugsJson { get; set; } = "[]";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// A blog category (one per post; no tags/multi-category in v1). Public-facing
/// taxonomy, separate from the internal research discipline/pain-point vocab.
/// "Uncategorized" is a permanent system category. Slug renames keep the old
/// slug for 301s (in <see cref="OldSlugsJson"/>) so category URLs never break.
/// </summary>
public class BlogCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>URL slug — unique across the blog.</summary>
    public string Slug { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description shown on the category listing hero.</summary>
    public string? Description { get; set; }

    /// <summary>Sort order in lists (lower = first).</summary>
    public int Position { get; set; } = 0;

    /// <summary>True for "Uncategorized" — cannot be renamed or deleted.</summary>
    public bool IsSystem { get; set; } = false;

    public string OldSlugsJson { get; set; } = "[]";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
