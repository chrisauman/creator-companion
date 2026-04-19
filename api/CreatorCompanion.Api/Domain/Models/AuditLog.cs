namespace CreatorCompanion.Api.Domain.Models;

public class AuditLog
{
    public long Id { get; set; }
    public Guid? UserId { get; set; }
    public string Event { get; set; } = string.Empty;       // e.g. "login.success"
    public string? Detail { get; set; }                     // extra context
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
