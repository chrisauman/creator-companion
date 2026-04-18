namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Tracks which motivation entries have been shown to each user,
/// and on what date (in the user's local timezone) they were first shown.
/// Used for rotation: once all entries are seen, history resets.
/// </summary>
public class UserMotivationShown
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid MotivationEntryId { get; set; }

    /// <summary>The user's local date (yyyy-MM-dd) when this entry was first shown.</summary>
    public DateOnly ShownDate { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public MotivationEntry Entry { get; set; } = null!;
}
