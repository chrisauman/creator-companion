namespace CreatorCompanion.Api.Domain.Models;

public class EntryMedia
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EntryId { get; set; }
    public Guid UserId { get; set; }

    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }

    // Path/key in blob storage (local filesystem path in dev)
    public string StoragePath { get; set; } = string.Empty;

    // EXIF date if available, otherwise upload time
    public DateTime? TakenAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public Entry Entry { get; set; } = null!;
    public User User { get; set; } = null!;
}
