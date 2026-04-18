namespace CreatorCompanion.Api.Domain.Models;

/// <summary>Junction table linking entries to tags.</summary>
public class EntryTag
{
    public Guid EntryId { get; set; }
    public Guid TagId { get; set; }

    public Entry Entry { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}
