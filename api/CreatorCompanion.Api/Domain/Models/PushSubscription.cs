namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Stores a device's push subscription. Supports Web Push now;
/// Platform field is ready for "fcm" and "apns" tokens when Capacitor is added.
/// </summary>
public class PushSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>"web" | "fcm" | "apns" — future platforms slot in here.</summary>
    public string Platform { get; set; } = "web";

    /// <summary>Web Push: the subscription endpoint URL. FCM/APNs: the device token.</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Web Push only: P256DH public key.</summary>
    public string? P256dh { get; set; }

    /// <summary>Web Push only: auth secret.</summary>
    public string? Auth { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}
