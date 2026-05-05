using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public AccountTier Tier { get; set; } = AccountTier.Free;
    public string TimeZoneId { get; set; } = "UTC";
    public bool OnboardingCompleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? TrialEndsAt { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsAdmin { get; set; } = false;
    public bool EmailVerified { get; set; } = false;

    /// <summary>Whether the Daily Motivation card is shown on the dashboard (paid users only).</summary>
    public bool ShowMotivation { get; set; } = true;

    /// <summary>Whether the Daily Reminders (action items) card is shown on the dashboard (paid users only).</summary>
    public bool ShowActionItems { get; set; } = true;

    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }

    /// <summary>
    /// Storage path / URL for the user's profile picture. Null when the
    /// user hasn't uploaded one (the UI falls back to a generated
    /// initial-letter circle in that case). Stored as a relative key
    /// returned by IStorageService.SaveAsync; convert to a public URL
    /// via IStorageService.GetUrl().
    /// </summary>
    public string? ProfileImagePath { get; set; }

    public ICollection<Journal> Journals { get; set; } = new List<Journal>();
    public ICollection<Entry> Entries { get; set; } = new List<Entry>();
    public ICollection<Draft> Drafts { get; set; } = new List<Draft>();
    public ICollection<Pause> Pauses { get; set; } = new List<Pause>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
