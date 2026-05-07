using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class Entry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid JournalId { get; set; }

    // The calendar date the entry belongs to (drives streak logic)
    public DateOnly EntryDate { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public string Title { get; set; } = string.Empty;
    public string ContentText { get; set; } = string.Empty;
    public string? Mood { get; set; }
    public bool IsFavorited { get; set; } = false;

    /// <summary>
    /// When the user last favorited this entry. Null when not currently
    /// favorited. Used by the unified Favorites view to sort entries
    /// alongside favorited Sparks (which have their own CreatedAt on
    /// the join row) by "when I favorited this." Set whenever
    /// IsFavorited flips true; cleared when it flips back to false.
    /// </summary>
    public DateTime? FavoritedAt { get; set; }
    public string ContentType { get; set; } = "text/plain";
    public EntrySource EntrySource { get; set; } = EntrySource.Direct;
    public Visibility Visibility { get; set; } = Visibility.Private;

    // JSON: tags, mood, location, AI context, etc.
    public string Metadata { get; set; } = "{}";

    public User User { get; set; } = null!;
    public Journal Journal { get; set; } = null!;
    public ICollection<EntryMedia> Media { get; set; } = new List<EntryMedia>();
    public ICollection<EntryTag> EntryTags { get; set; } = new List<EntryTag>();
}
