namespace CreatorCompanion.Api.Domain.Models;

public class Faq
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    /// <summary>
    /// Topical bucket — drives the category filter on the support page
    /// and the marketing /faq route. Free-form string rather than an enum
    /// so admins can add new buckets without a schema change. Existing
    /// rows default to "General" if unset.
    /// </summary>
    public string Category { get; set; } = "General";
    public int SortOrder { get; set; } = 0;
    public bool IsPublished { get; set; } = true;
    /// <summary>
    /// Per-entry flag for surfacing on the public marketing homepage
    /// (preview.html / index.html FAQ accordion). Admin curates which
    /// FAQs are visitor-facing vs. signed-in-only via this bool. The
    /// public /v1/faq/public endpoint returns all published rows
    /// including this field; the marketing JS filters client-side.
    /// </summary>
    public bool IsFeaturedOnHomepage { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
