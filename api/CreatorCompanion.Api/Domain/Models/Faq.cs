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
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
