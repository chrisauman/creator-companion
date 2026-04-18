namespace CreatorCompanion.Api.Domain.Models;

public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>Normalized: lowercase, no spaces.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Hex color string (e.g. "#9ecae1"). UI for this is not yet built.</summary>
    public string? Color { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public ICollection<EntryTag> EntryTags { get; set; } = new List<EntryTag>();
}
