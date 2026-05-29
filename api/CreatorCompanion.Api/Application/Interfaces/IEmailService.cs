using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IEmailService
{
    Task SendPasswordResetAsync(string toEmail, string resetLink);
    Task SendVerificationEmailAsync(string toEmail, string verifyLink);
    /// <summary>
    /// Greeting parameter is the recipient's first name (or full
    /// display name) used inline in the email body, e.g. "Hi {name}, …".
    /// </summary>
    Task SendPaymentReceiptAsync(string toEmail, string displayName);
    Task SendPasswordChangedAsync(string toEmail);
    Task SendWelcomeAsync(string toEmail, string displayName);
    Task SendAccountDeletionConfirmationAsync(string toEmail, string displayName);

    /// <summary>
    /// Trial reminder. Sent on Day 7 (3 days remaining) and Day 9
    /// (1 day remaining) of the 10-day trial. Different `daysRemaining`
    /// values change the urgency in the copy.
    /// </summary>
    Task SendTrialEndingSoonAsync(string toEmail, string displayName, int daysRemaining);

    /// <summary>
    /// Trial-ended notification. Sent the moment the user's trial
    /// expires AND they don't have an active subscription. Includes
    /// the subscribe CTA. Single send per user (idempotent via the
    /// User.TrialEndedEmailSentAt flag).
    /// </summary>
    Task SendTrialEndedAsync(string toEmail, string displayName);

    /// <summary>
    /// Daily-spark reminder for manual posting to Substack (or any
    /// platform without an API). Sends one spark per day to the admin
    /// recipient, picked by the SubstackPostingService never-repeat
    /// rotation. The email contains the spark text in a copy-friendly
    /// block so the admin can paste it straight into the target
    /// platform. Replaces the older auto-poster + cookie path, which
    /// broke whenever Substack rotated its session cookie.
    /// </summary>
    /// <summary>
    /// Returns the Resend message id (Guid) on success, or null if
    /// the SDK doesn't surface one. Caller can persist this so admin
    /// UI / debugging can cross-reference the Resend dashboard with
    /// our own send records. Throws on Resend API failure now that
    /// ThrowExceptions=true is set on the ResendClient (see Program.cs).
    /// </summary>
    Task<Guid?> SendDailySparkReminderAsync(
        string toEmail,
        string takeaway,
        string? fullContent);

    /// <summary>
    /// End-of-run summary for the Marketing auto-poster: one line per
    /// platform the daily spark was posted to, with success permalink or
    /// failure reason. Sent once per day after the day's scheduled posts
    /// have all fired (deduped via SocialSettings.LastSummarySentForDate).
    /// </summary>
    Task SendSocialDailySummaryAsync(
        string toEmail,
        DateOnly date,
        IReadOnlyList<SocialSummaryLine> lines);

    /// <summary>
    /// Immediate alert when a single post (daily or ad-hoc) fails, so the
    /// admin learns about a broken token / API outage right away rather
    /// than waiting for the daily summary. Fired per failure event.
    /// </summary>
    Task SendSocialFailureAlertAsync(
        string toEmail,
        string platform,
        string context,
        string error);
}
