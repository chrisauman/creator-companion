using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Resend;

namespace CreatorCompanion.Api.Infrastructure.Services;

public class ResendEmailService(IResend resend, IConfiguration config, AppDbContext db) : IEmailService
{
    private static readonly string DefaultWelcomeSubject = "Welcome to Creator Companion — let's get started";

    private static readonly string DefaultWelcomeContent = """
        <h2 style="margin-bottom:.5rem">Welcome, {username}!</h2>
        <p style="color:#555">You've taken the first step. Creator Companion is your private space to show up, write, and build a creative practice that sticks.</p>
        <h3 style="margin-top:1.5rem;margin-bottom:.5rem">A few things to try first:</h3>
        <ul style="color:#555;line-height:2">
          <li><strong>Write your first entry</strong> — head to the dashboard and start today's entry</li>
          <li><strong>Set a daily reminder</strong> — a nudge at the right time makes all the difference</li>
          <li><strong>Check your Daily Spark</strong> — a fresh creative insight every day to fuel your work</li>
        </ul>
        <p style="color:#555">Consistency is the skill. See you tomorrow.</p>
        """;

    public async Task SendVerificationEmailAsync(string toEmail, string verifyLink)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Verify your {appName} email address",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Confirm your email</h2>
                  <p style="color:#555">Click below to verify your email address and activate your account.
                     This link expires in <strong>24 hours</strong>.</p>
                  <a href="{verifyLink}"
                     style="display:inline-block;margin:1.5rem 0;padding:.75rem 1.5rem;
                            background:#6c63ff;color:#fff;border-radius:8px;
                            text-decoration:none;font-weight:600">
                    Verify email
                  </a>
                  <p style="color:#999;font-size:.85rem">
                    If you didn't create an account, you can safely ignore this email.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPasswordResetAsync(string toEmail, string resetLink)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Reset your {appName} password",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Reset your password</h2>
                  <p style="color:#555">Click the button below to choose a new password.
                     This link expires in <strong>1 hour</strong>.</p>
                  <a href="{resetLink}"
                     style="display:inline-block;margin:1.5rem 0;padding:.75rem 1.5rem;
                            background:#6c63ff;color:#fff;border-radius:8px;
                            text-decoration:none;font-weight:600">
                    Reset password
                  </a>
                  <p style="color:#999;font-size:.85rem">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPaymentReceiptAsync(string toEmail, string username)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"You're on the {appName} Paid plan!",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Welcome to the full experience, {username}!</h2>
                  <p style="color:#555">Your subscription is active. All paid features are now unlocked:</p>
                  <ul style="color:#555;line-height:2">
                    <li>Up to 5 entries per day, 2,500 words each</li>
                    <li>Multiple journals</li>
                    <li>Image uploads, mood tracking, favorites</li>
                    <li>Streak pause, backfill, and entry recovery</li>
                    <li>Custom reminder times and messages</li>
                    <li>Daily Spark — curated creative insights</li>
                  </ul>
                  <p style="color:#555">Keep showing up. That's all it takes.</p>
                  <a href="https://app.creatorcompanionapp.com/dashboard"
                     style="display:inline-block;margin:1.5rem 0;padding:.75rem 1.5rem;
                            background:#6c63ff;color:#fff;border-radius:8px;
                            text-decoration:none;font-weight:600">
                    Go to dashboard
                  </a>
                  <p style="color:#999;font-size:.85rem">
                    Manage your subscription anytime from Account settings.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPasswordChangedAsync(string toEmail)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} password was changed",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Password changed</h2>
                  <p style="color:#555">Your password was successfully updated. All existing sessions
                     have been signed out as a security precaution.</p>
                  <p style="color:#555">If you didn't make this change, please
                     <a href="https://app.creatorcompanionapp.com/forgot-password"
                        style="color:#6c63ff">reset your password immediately</a>
                     and contact support.</p>
                  <p style="color:#999;font-size:.85rem;margin-top:2rem">
                    This is an automated security notification from {appName}.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendWelcomeAsync(string toEmail, string username)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == "welcome");
        var subject  = template?.Subject ?? DefaultWelcomeSubject;
        var content  = (template?.HtmlContent ?? DefaultWelcomeContent)
                           .Replace("{username}", username);

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = subject,
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem">
                  {content}
                  <div style="margin-top:2rem">
                    <a href="https://app.creatorcompanionapp.com/dashboard"
                       style="display:inline-block;padding:.75rem 1.5rem;
                              background:#6c63ff;color:#fff;border-radius:8px;
                              text-decoration:none;font-weight:600">
                      Go to dashboard
                    </a>
                  </div>
                  <p style="color:#999;font-size:.85rem;margin-top:2rem">
                    You're receiving this because you created a {appName} account.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }
}
