using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// First name shown next to the avatar in the UI and used in
    /// greetings on outgoing emails ("Hi {FirstName}, …"). Required
    /// at registration; existing rows are backfilled from the legacy
    /// Username column when the AddNameFields migration runs.
    /// </summary>
    public string FirstName { get; set; } = string.Empty;

    /// <summary>
    /// Last name. Required at registration. Empty for grandfathered
    /// users whose legacy username didn't have a clean split — they
    /// can fill it in from the Account page.
    /// </summary>
    public string LastName { get; set; } = string.Empty;

    // The legacy Username column was dropped in migration
    // RemoveUsernameUseFirstLastName. If you need to look up users by
    // a string handle, query Email directly.

    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public AccountTier Tier { get; set; } = AccountTier.Free;
    public string TimeZoneId { get; set; } = "UTC";
    public bool OnboardingCompleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? TrialEndsAt { get; set; }

    /// <summary>
    /// When the "3 days left in your trial" reminder email was sent.
    /// Null until the worker fires it. Dedupe field — exactly one
    /// such email per user per trial. (If a user re-subscribes after
    /// canceling, they don't get a fresh trial, so this never resets.)
    /// </summary>
    public DateTime? TrialReminder3dSentAt { get; set; }

    /// <summary>
    /// When the "1 day left in your trial" reminder email was sent.
    /// Same dedupe pattern as TrialReminder3dSentAt — one per user
    /// per trial.
    /// </summary>
    public DateTime? TrialReminder1dSentAt { get; set; }

    /// <summary>
    /// When the "your trial has ended" email was sent. Fires the
    /// moment the worker first detects an expired trial with no
    /// active subscription. One per user per trial.
    /// </summary>
    public DateTime? TrialEndedEmailSentAt { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsAdmin { get; set; } = false;
    public bool EmailVerified { get; set; } = false;

    /// <summary>
    /// Number of consecutive failed login attempts since the last
    /// successful login (or last lockout-window reset). Persisted so
    /// the limit survives a Railway redeploy and applies globally
    /// across replicas — the previous in-memory dictionary reset on
    /// every restart and counted per-instance, so brute-force could
    /// defeat the limit by waiting for a redeploy or rotating replicas.
    /// </summary>
    public int FailedLoginCount { get; set; } = 0;

    /// <summary>
    /// Timestamp at which the account becomes unlockable. Set on the
    /// Nth failed attempt; cleared on a successful login. UTC.
    /// </summary>
    public DateTime? LockedUntil { get; set; }

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

    /// <summary>
    /// Dedupe field for the streak-threatened push notification. Holds the
    /// missed-day date (= yesterday relative to user-local "now") for which
    /// we've already sent the "Yesterday slipped by — but you've got this"
    /// push. The notifier only fires when this value differs from the
    /// current missed-day, so each gap triggers at most one push. Cleared
    /// implicitly when the user's lastEntryDate advances (because the
    /// next missed-day, if any, will be a different date).
    /// </summary>
    public DateOnly? StreakThreatenedNotifiedFor { get; set; }

    public ICollection<Journal> Journals { get; set; } = new List<Journal>();
    public ICollection<Entry> Entries { get; set; } = new List<Entry>();
    public ICollection<Draft> Drafts { get; set; } = new List<Draft>();
    public ICollection<Pause> Pauses { get; set; } = new List<Pause>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
