namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// A short journaling prompt shown to users on the dashboard's Today
/// panel. The "small prompt" card cycles through these via a shuffle
/// button. Admin-managed.
/// </summary>
public class DailyPrompt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Text { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
    public bool IsPublished { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
