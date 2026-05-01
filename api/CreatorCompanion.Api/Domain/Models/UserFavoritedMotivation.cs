namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Records which motivation entries a user has hearted/favorited.
/// One row per (user, entry) pair — toggle by insert/delete.
/// </summary>
public class UserFavoritedMotivation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid MotivationEntryId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public MotivationEntry Entry { get; set; } = null!;
}
