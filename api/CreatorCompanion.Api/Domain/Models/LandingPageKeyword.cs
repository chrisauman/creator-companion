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

    /// <summary>The page produced from this keyword, once generated.</summary>
    public Guid? GeneratedPageId { get; set; }

    /// <summary>Last generation error (retained for the admin to see/retry).</summary>
    public string? LastError { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
