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
        <ul style="color:#555;line-height:2;padding-left:1.25rem;margin:.25rem 0 1rem">
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
                            background:#0c0e13;color:#fff;border-radius:8px;
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
                            background:#0c0e13;color:#fff;border-radius:8px;
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
                            background:#0c0e13;color:#fff;border-radius:8px;
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
                        style="color:#12C4E3">reset your password immediately</a>
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

        // Treat empty/whitespace as "not customised" — without this guard
        // an admin who saved Subject but forgot to fill the body would
        // send an empty-bodied welcome email. The `??` alone wouldn't
        // catch this because an empty string is not null.
        var subject     = string.IsNullOrWhiteSpace(template?.Subject)     ? DefaultWelcomeSubject : template!.Subject;
        var rawContent  = string.IsNullOrWhiteSpace(template?.HtmlContent) ? DefaultWelcomeContent : template!.HtmlContent;

        // Accept both {displayName} (legacy / default content) and
        // {username} (what the admin help text told users to type).
        // The admin UI label says {username}; the code historically
        // used {displayName}. Sub both so neither author gets surprised.
        var content = rawContent
            .Replace("{displayName}", displayName)
            .Replace("{username}",    displayName);

        // Normalize admin-authored HTML for email rendering.
        content = NormalizeEmailHtml(content);

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
                              background:#0c0e13;color:#fff;border-radius:8px;
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

    public async Task SendSubstackPostFailedAsync(
        string toEmail,
        int?   statusCode,
        string errorMessage,
        string? errorBody,
        bool   isCookieExpired)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        var subject = isCookieExpired
            ? "Substack auto-poster: cookie expired (re-paste needed)"
            : "Substack auto-poster: post failed";

        // Recovery walkthrough is embedded inline — the admin is most
        // likely on mobile checking email and won't want to dig through
        // docs. Same steps as the in-app callout, just self-contained.
        var recoverySteps = """
            <ol style="color:#444;line-height:1.8;padding-left:1.25rem">
              <li>Open <strong>substack.com</strong> in Chrome, log in to your posting account.</li>
              <li>Press <strong>F12</strong> → <strong>Network</strong> tab.</li>
              <li>Click any request to substack.com → <strong>Headers</strong> →
                  <strong>Request Headers</strong>.</li>
              <li>Find the <code>Cookie:</code> line and copy its full value.</li>
              <li>Open <a href="{baseUrl}/admin/substack">{baseUrl}/admin/substack</a>
                  → paste into the cookie field → <strong>Save settings</strong>.</li>
              <li>Click <strong>Send a test post now</strong> to verify before the worker resumes.</li>
            </ol>
            """.Replace("{baseUrl}", appBaseUrl);

        var bodyDetailHtml = string.IsNullOrWhiteSpace(errorBody)
            ? ""
            : $"""
                <details style="margin-top:1rem">
                  <summary style="cursor:pointer;color:#888;font-size:.85rem">Raw error body</summary>
                  <pre style="background:#f5f5f5;padding:.75rem;border-radius:4px;font-size:.75rem;
                              white-space:pre-wrap;word-break:break-all;max-height:300px;overflow:auto">{System.Net.WebUtility.HtmlEncode(errorBody)}</pre>
                </details>
                """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = subject,
            HtmlBody = $"""
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
                  <h2 style="margin-bottom:.5rem">Substack auto-poster failed</h2>
                  <p style="color:#555">
                    {(isCookieExpired
                      ? "Your Substack cookie appears to have expired or been rejected. The poster has been paused until you re-paste a fresh one."
                      : "The Substack auto-poster hit an error trying to publish today's spark.")}
                  </p>

                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:1.25rem 0">
                    <p style="margin:.25rem 0;color:#666">
                      <strong>Status:</strong> {(statusCode.HasValue ? $"HTTP {statusCode}" : "transport error")}
                    </p>
                    <p style="margin:.25rem 0;color:#666">
                      <strong>Error:</strong> {System.Net.WebUtility.HtmlEncode(errorMessage)}
                    </p>
                  </div>

                  <h3 style="margin-top:1.5rem;margin-bottom:.5rem;font-size:1rem">How to fix</h3>
                  {recoverySteps}

                  {bodyDetailHtml}

                  <p style="color:#999;font-size:.8rem;margin-top:2rem">
                    Sent automatically by the Substack auto-poster background worker.
                  </p>
                </div>
                """
        };

        await resend.EmailSendAsync(message);
    }

    // ── HTML normalisation for admin-authored templates ──────────────
    /// <summary>
    /// Patches admin-authored HTML so it renders consistently in email
    /// clients. The admin's contenteditable editor produces raw tags
    /// from toolbar buttons (e.g. &lt;ul&gt; from "List"), and email
    /// clients then apply their own defaults — most notably ~40px of
    /// padding-left or margin-left on lists, which makes bullets look
    /// deeply indented compared to the surrounding body text.
    ///
    /// Strategy: force-rewrite the opening tag with our own style
    /// attribute on every &lt;ul&gt;/&lt;ol&gt;. The admin editor
    /// doesn't produce custom inline styles, so we don't lose anything
    /// by overwriting — and force-replace beats inject-when-missing
    /// because browsers' execCommand sometimes silently adds a style
    /// attribute (margin-left: 40px) that would block a lookahead-
    /// gated injector. Use px units (rem support is inconsistent across
    /// email clients — Outlook treats the root as undefined). The
    /// !important flag is honoured on inline styles in every major
    /// email client (it's the &lt;style&gt; block that's iffy).
    ///
    /// For &lt;p&gt; we still inject only when no style attribute
    /// exists — paragraphs rarely come with surprise styles, and we
    /// want to preserve any deliberate custom-coloured paragraph.
    /// </summary>
    private static string NormalizeEmailHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return html;

        const string ListStyle =
            "padding:0 0 0 18px !important;margin:8px 0 !important;" +
            "line-height:1.6;color:#555;list-style-position:outside";

        // Force-replace the opening tag (with or without an existing
        // style attribute). Captures the tag name (ul|ol) and any
        // existing attributes other than style, then re-emits with
        // our style appended.
        html = System.Text.RegularExpressions.Regex.Replace(
            html,
            @"<(ul|ol)\b[^>]*>",
            m =>
            {
                var tag = m.Groups[1].Value.ToLowerInvariant();
                return $"<{tag} style=\"{ListStyle}\">";
            },
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        // Inject paragraph styles only when missing — admin may
        // intentionally style a paragraph differently in the future.
        html = System.Text.RegularExpressions.Regex.Replace(
            html,
            @"<p(?![^>]*\bstyle=)>",
            "<p style=\"color:#555;line-height:1.6;margin:.5rem 0\">",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        return html;
    }
}
