using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// A keyword/topic in the generation queue. The admin maintains this list; the
/// daily 7am worker draws the highest-priority <see cref="LandingPageKeywordStatus.Pending"/>
/// entry and generates a page from it. <see cref="Brief"/> lets the admin steer
/// the angle/intent for a given term.
/// </summary>
public class LandingPageKeyword
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The target search term, e.g. "private journaling app".</summary>
    public string Keyword { get; set; } = string.Empty;

    /// <summary>Optional steering notes for generation (angle, audience, must-haves).</summary>
    public string? Brief { get; set; }

    /// <summary>Higher = generated sooner. Ties broken by CreatedAt.</summary>
    public int Priority { get; set; } = 0;

    public LandingPageKeywordStatus Status { get; set; } = LandingPageKeywordStatus.Pending;

    /// <summary>Whether this keyword builds a landing Page or a blog Post. Admin-set.</summary>
    public LandingPageContentType ContentType { get; set; } = LandingPageContentType.Page;

    /// <summary>The landing page produced from this keyword (when ContentType=Page).</summary>
    public Guid? GeneratedPageId { get; set; }

    /// <summary>The blog post produced from this keyword (when ContentType=Post).</summary>
    public Guid? GeneratedPostId { get; set; }

    /// <summary>Last generation error (retained for the admin to see/retry).</summary>
    public string? LastError { get; set; }

    // ── Research metadata (drives the coverage matrix + smarter dedup) ──────
    /// <summary>Free-text angle this came from, e.g. "Musicians — practice consistency".</summary>
    public string? Theme { get; set; }

    /// <summary>Controlled-vocab discipline (e.g. "Musicians"). Null = cross-discipline.</summary>
    public string? Discipline { get; set; }

    /// <summary>Controlled-vocab pain-point (e.g. "Consistency"). Null = unset.</summary>
    public string? PainPoint { get; set; }

    /// <summary>Search intent: informational | commercial | method | navigational.</summary>
    public string? Intent { get; set; }

    /// <summary>
    /// Normalized token signature for fast near-duplicate detection: keyword
    /// lowercased, filler words dropped, remaining tokens sorted + space-joined.
    /// "best morning pages app" and "app for morning pages" share a signature.
    /// Computed by <see cref="Application.Services.KeywordDedup"/> on write.
    /// </summary>
    public string? Signature { get; set; }

    /// <summary>The research batch that surfaced this keyword, if any.</summary>
    public Guid? BatchId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
