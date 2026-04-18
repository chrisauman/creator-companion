namespace CreatorCompanion.Api.Domain.Models;

public class Reminder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>Time of day to send, stored as HH:mm (e.g. "12:00").</summary>
    public TimeOnly Time { get; set; }

    /// <summary>Optional custom message. Null = use the default message.</summary>
    public string? Message { get; set; }

    public bool IsEnabled { get; set; } = true;

    /// <summary>True for the system-created default noon reminder. False for user-created custom reminders.</summary>
    public bool IsDefault { get; set; } = false;

    /// <summary>Last time this reminder was successfully sent (UTC). Used to prevent duplicate sends.</summary>
    public DateTime? LastSentAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}
