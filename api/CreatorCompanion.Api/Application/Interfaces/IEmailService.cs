namespace CreatorCompanion.Api.Application.Interfaces;

public interface IEmailService
{
    Task SendPasswordResetAsync(string toEmail, string resetLink);
    Task SendVerificationEmailAsync(string toEmail, string verifyLink);
    Task SendPaymentReceiptAsync(string toEmail, string username);
    Task SendPasswordChangedAsync(string toEmail);
    Task SendWelcomeAsync(string toEmail, string username);
    Task SendAccountDeletionConfirmationAsync(string toEmail, string username);
}
