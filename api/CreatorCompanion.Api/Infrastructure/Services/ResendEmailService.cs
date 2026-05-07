using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Resend;

namespace CreatorCompanion.Api.Infrastructure.Services;

public class ResendEmailService(IResend resend, IConfiguration config, AppDbContext db) : IEmailService
{
    private static readonly string DefaultWelcomeSubject = "Welcome to Creator Companion — let's get started";

    private static readonly string DefaultWelcomeContent = """
        <h2 style="margin-bottom:.5rem">Welcome, {displayName}!</h2>
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

    public async Task SendPaymentReceiptAsync(string toEmail, string displayName)
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
                  <h2 style="margin-bottom:.5rem">Welcome to the full experience, {displayName}!</h2>
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

    public async Task SendWelcomeAsync(string toEmail, string displayName)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == "welcome");
        var subject  = template?.Subject ?? DefaultWelcomeSubject;
        var content  = (template?.HtmlContent ?? DefaultWelcomeContent)
                           .Replace("{displayName}", displayName);

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

    public async Task SendTrialEndingSoonAsync(string toEmail, string displayName, int daysRemaining)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        // Two cadence points:
        //   3 days remaining → "heads up, you have a few days left"
        //   1 day remaining  → "tomorrow your trial ends"
        // Subject + opener change with urgency; rest of the body is shared.
        var subject = daysRemaining == 1
            ? $"Your {appName} trial ends tomorrow"
            : $"{daysRemaining} days left in your {appName} trial";

        var lead = daysRemaining == 1
            ? "Your trial ends tomorrow."
            : $"You have <strong>{daysRemaining} days</strong> left in your trial.";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = subject,
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Hi {displayName},</h2>
                  <p style="color:#555;font-size:1.05rem;line-height:1.5">{lead}</p>
                  <p style="color:#555;line-height:1.6">
                    Subscribe now to keep your streak alive, your entries safe, and your
                    daily creative practice on track. Cancel anytime — your existing
                    entries stay yours either way.
                  </p>
                  <div style="margin:1.75rem 0">
                    <a href="https://app.creatorcompanionapp.com/dashboard"
                       style="display:inline-block;padding:.75rem 1.5rem;
                              background:#0c0e13;color:#fff;border-radius:8px;
                              text-decoration:none;font-weight:600">
                      Subscribe — $5/month or $50/year
                    </a>
                  </div>
                  <p style="color:#999;font-size:.85rem">
                    You're receiving this because your {appName} trial is approaching its end.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendTrialEndedAsync(string toEmail, string displayName)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} trial has ended",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Hi {displayName},</h2>
                  <p style="color:#555;font-size:1.05rem;line-height:1.5">
                    Your free trial has ended. We hope it sparked some good momentum.
                  </p>
                  <p style="color:#555;line-height:1.6">
                    Your existing entries are still safe and viewable — but writing new
                    ones is paused until you subscribe. Cancel anytime; your data stays
                    yours either way.
                  </p>
                  <div style="margin:1.75rem 0">
                    <a href="https://app.creatorcompanionapp.com/dashboard"
                       style="display:inline-block;padding:.75rem 1.5rem;
                              background:#0c0e13;color:#fff;border-radius:8px;
                              text-decoration:none;font-weight:600">
                      Subscribe — $5/month or $50/year
                    </a>
                  </div>
                  <p style="color:#555;line-height:1.6">
                    Not ready? That's OK. Sign back in any time — your account
                    will be waiting.
                  </p>
                  <p style="color:#999;font-size:.85rem">
                    You're receiving this because your {appName} trial expired today.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendAccountDeletionConfirmationAsync(string toEmail, string displayName)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} account has been deleted",
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Account deleted</h2>
                  <p style="color:#555">Hi {displayName}, your Creator Companion account and all associated data
                     have been permanently deleted as requested.</p>
                  <p style="color:#555">The following data has been removed:</p>
                  <ul style="color:#555;line-height:2">
                    <li>All journal entries and drafts</li>
                    <li>All tags, reminders, and preferences</li>
                    <li>All uploaded images and media</li>
                    <li>Your account credentials and profile</li>
                  </ul>
                  <p style="color:#555">If you had an active subscription, it has been cancelled and
                     you will not be charged again. Billing records are retained by Stripe as required
                     by financial regulations.</p>
                  <p style="color:#555">We're sorry to see you go. If you ever want to start fresh,
                     you're always welcome back.</p>
                  <p style="color:#999;font-size:.85rem;margin-top:2rem">
                    If you did not request this deletion, please contact us immediately at
                    support@creatorcompanionapp.com.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }
}
