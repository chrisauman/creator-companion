using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class MotivationEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Heading shown on the expanded card.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Short one-liner shown collapsed on the dashboard.</summary>
    public string Takeaway { get; set; } = string.Empty;

    /// <summary>Full content revealed when the card is expanded.</summary>
    public string FullContent { get; set; } = string.Empty;

    public MotivationCategory Category { get; set; } = MotivationCategory.Encouragement;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<UserMotivationShown> ShownRecords { get; set; } = new List<UserMotivationShown>();
    public ICollection<UserFavoritedMotivation> FavoriteRecords { get; set; } = new List<UserFavoritedMotivation>();
}
