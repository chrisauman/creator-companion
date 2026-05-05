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
}
