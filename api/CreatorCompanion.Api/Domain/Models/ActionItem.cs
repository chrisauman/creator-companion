namespace CreatorCompanion.Api.Domain.Models;

public class ActionItem
{
    public int Id { get; set; }
    public Guid UserId { get; set; }

    /// <summary>The to-do text. Max 150 characters.</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>Position in the active list. Lower = higher up.</summary>
    public int SortOrder { get; set; }

    public bool IsCompleted { get; set; } = false;
    public DateTime? CompletedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}
