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
    /// Admin alert: the Substack auto-poster failed. Sent on the FIRST
    /// failure of a streak (consecutive-failure count goes 0 → 1), and
    /// again every 5 consecutive failures after that so a persistent
    /// outage gets surfaced without spamming. statusCode/errorBody are
    /// pasted into the email so the admin can diagnose without logs.
    /// </summary>
    Task SendSubstackPostFailedAsync(
        string toEmail,
        int?   statusCode,
        string errorMessage,
        string? errorBody,
        bool   isCookieExpired);
}
