namespace CreatorCompanion.Api.Domain.Models;

public class Draft
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid JournalId { get; set; }

    // The intended entry date (user's local date)
    public DateOnly EntryDate { get; set; }

    public string ContentText { get; set; } = string.Empty;
    public string Metadata { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Journal Journal { get; set; } = null!;
}
