using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Resend;

namespace CreatorCompanion.Api.Infrastructure.Services;

public class ResendEmailService(IResend resend, IConfiguration config, AppDbContext db) : IEmailService
{
    private static readonly string DefaultWelcomeSubject = "Welcome to Creator Companion — let's get started";

    private static readonly string DefaultWelcomeContent = """
        <h2 style="margin:0 0 .5rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">Welcome, {displayName}!</h2>
        <p style="color:#555;line-height:1.6;margin:.5rem 0">You've taken the first step. Creator Companion is your private space to show up, write, and build a creative practice that sticks.</p>
        <h3 style="margin:1.5rem 0 .5rem;font-size:1rem;font-weight:700;color:#0c0e13">A few things to try first:</h3>
        <ul style="color:#555;line-height:1.8;padding:0 0 0 18px;margin:.25rem 0 1rem">
          <li><strong>Write your first entry</strong> — head to the dashboard and start today's entry</li>
          <li><strong>Set a daily reminder</strong> — a nudge at the right time makes all the difference</li>
          <li><strong>Check your Daily Spark</strong> — a fresh creative insight every day to fuel your work</li>
        </ul>
        <p style="color:#555;line-height:1.6;margin:.5rem 0">Consistency is the skill. See you tomorrow.</p>
        """;

    public async Task SendVerificationEmailAsync(string toEmail, string verifyLink)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.375rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13;text-align:center">
              Verify your email
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0 1.25rem;text-align:center">
              Tap the button below to confirm your email and activate your account.
              This link expires in <strong style="color:#0c0e13">24 hours</strong>.
            </p>

            <!-- Account info card (Auth0-style) — shows the address the link
                 is bound to so the user can sanity-check they're verifying
                 the right account before clicking. -->
            <div style="border:1px dashed #d4cbb5;border-radius:10px;padding:14px 16px;margin:1rem 0 1.5rem;background:#fcfaf5">
              <p style="margin:0;color:#555;font-size:.875rem">
                <span style="color:#888">Verifying:</span>
                <a href="mailto:{toEmail}" style="color:#0c0e13;font-weight:600;text-decoration:none">{toEmail}</a>
              </p>
            </div>

            {PrimaryCtaButton("Verify email", verifyLink)}

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.25rem 0 0;text-align:center">
              If you didn't create an account, you can safely ignore this email.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Verify your {appName} email address",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPasswordResetAsync(string toEmail, string resetLink)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.375rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13;text-align:center">
              Reset your password
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0 1.25rem;text-align:center">
              Tap the button below to choose a new password.
              This link expires in <strong style="color:#0c0e13">1 hour</strong>.
            </p>

            <!-- Account info card — confirms which account the reset applies
                 to. Same shape as the verification email so the visual
                 vocabulary stays consistent across the auth-flow family. -->
            <div style="border:1px dashed #d4cbb5;border-radius:10px;padding:14px 16px;margin:1rem 0 1.5rem;background:#fcfaf5">
              <p style="margin:0;color:#555;font-size:.875rem">
                <span style="color:#888">Account:</span>
                <a href="mailto:{toEmail}" style="color:#0c0e13;font-weight:600;text-decoration:none">{toEmail}</a>
              </p>
            </div>

            {PrimaryCtaButton("Reset password", resetLink)}

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.25rem 0 0;text-align:center">
              If you didn't request this, you can safely ignore this email — your
              password won't be changed.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Reset your {appName} password",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPaymentReceiptAsync(string toEmail, string displayName)
    {
        var fromEmail  = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName    = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        var body = $"""
            <h2 style="margin:0 0 .5rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
              Welcome to the full experience, {displayName}!
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0">
              Your subscription is active. All paid features are now unlocked:
            </p>
            <ul style="color:#555;line-height:1.8;padding:0 0 0 18px;margin:.5rem 0 1.25rem">
              <li>Up to 5 entries per day, 2,500 words each</li>
              <li>Multiple journals</li>
              <li>Image uploads, mood tracking, favorites</li>
              <li>Streak pause, backfill, and entry recovery</li>
              <li>Custom reminder times and messages</li>
              <li>Daily Spark — curated creative insights</li>
            </ul>
            <p style="color:#555;line-height:1.6;margin:.5rem 0 1.5rem">
              Keep showing up. That's all it takes.
            </p>

            {PrimaryCtaButton("Go to dashboard", $"{appBaseUrl}/dashboard")}

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.25rem 0 0;text-align:center">
              Manage your subscription anytime from Account settings.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"You're on the {appName} Paid plan!",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendPasswordChangedAsync(string toEmail)
    {
        var fromEmail  = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName    = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.375rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13;text-align:center">
              Password changed
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0">
              Your password was successfully updated. All existing sessions
              have been signed out as a security precaution.
            </p>
            <p style="color:#555;line-height:1.6;margin:.5rem 0">
              If you didn't make this change, please
              <a href="{appBaseUrl}/forgot-password" style="color:#12C4E3;font-weight:600">reset your password immediately</a>
              and contact support.
            </p>
            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.5rem 0 0">
              This is an automated security notification from {appName}.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} password was changed",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendWelcomeAsync(string toEmail, string displayName)
    {
        var fromEmail  = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName    = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == "welcome");

        // Treat empty/whitespace as "not customised" — without this guard
        // an admin who saved Subject but forgot to fill the body would
        // send an empty-bodied welcome email.
        var subject    = string.IsNullOrWhiteSpace(template?.Subject)     ? DefaultWelcomeSubject : template!.Subject;
        var rawContent = string.IsNullOrWhiteSpace(template?.HtmlContent) ? DefaultWelcomeContent : template!.HtmlContent;

        // Accept both {displayName} (default content) and {username}
        // (what the admin help text told users to type).
        var content = rawContent
            .Replace("{displayName}", displayName)
            .Replace("{username}",    displayName);

        // Normalize admin-authored HTML for email rendering.
        content = NormalizeEmailHtml(content);

        var body = $"""
            {content}

            <div style="margin-top:1.5rem">
              {PrimaryCtaButton("Go to dashboard", $"{appBaseUrl}/dashboard")}
            </div>

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.5rem 0 0">
              You're receiving this because you created a {appName} account.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = subject,
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendTrialEndingSoonAsync(string toEmail, string displayName, int daysRemaining)
    {
        var fromEmail  = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName    = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        // Two cadence points:
        //   3 days remaining → "heads up, you have a few days left"
        //   1 day remaining  → "tomorrow your trial ends"
        // Subject + opener change with urgency; rest of the body is shared.
        var subject = daysRemaining == 1
            ? $"Your {appName} trial ends tomorrow"
            : $"{daysRemaining} days left in your {appName} trial";

        var lead = daysRemaining == 1
            ? "Your trial ends tomorrow."
            : $"You have <strong style=\"color:#0c0e13\">{daysRemaining} days</strong> left in your trial.";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
              Hi {displayName},
            </h2>
            <p style="color:#555;font-size:1.0625rem;line-height:1.55;margin:.5rem 0">{lead}</p>
            <p style="color:#555;line-height:1.6;margin:.75rem 0 1.5rem">
              Subscribe now to keep your streak alive, your entries safe, and your
              daily creative practice on track. Cancel anytime — your existing
              entries stay yours either way.
            </p>

            {PrimaryCtaButton("Subscribe — $5.99/month or $49.99/year", $"{appBaseUrl}/dashboard")}

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.25rem 0 0">
              You're receiving this because your {appName} trial is approaching its end.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = subject,
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendTrialEndedAsync(string toEmail, string displayName)
    {
        var fromEmail  = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName    = config["App:Name"] ?? "Creator Companion";
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
              Hi {displayName},
            </h2>
            <p style="color:#555;font-size:1.0625rem;line-height:1.55;margin:.5rem 0">
              Your free trial has ended. We hope it sparked some good momentum.
            </p>
            <p style="color:#555;line-height:1.6;margin:.75rem 0">
              Your existing entries are still safe and viewable — but writing new
              ones is paused until you subscribe. Cancel anytime; your data stays
              yours either way.
            </p>

            <div style="margin:1.5rem 0">
              {PrimaryCtaButton("Subscribe — $5.99/month or $49.99/year", $"{appBaseUrl}/dashboard")}
            </div>

            <p style="color:#555;line-height:1.6;margin:.75rem 0">
              Not ready? That's OK. Sign back in any time — your account
              will be waiting.
            </p>
            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.25rem 0 0">
              You're receiving this because your {appName} trial expired today.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} trial has ended",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task SendAccountDeletionConfirmationAsync(string toEmail, string displayName)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        var body = $"""
            <h2 style="margin:0 0 .75rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
              Account deleted
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0">
              Hi {displayName}, your {appName} account and all associated data
              have been permanently deleted as requested.
            </p>
            <p style="color:#555;line-height:1.6;margin:.75rem 0">The following data has been removed:</p>
            <ul style="color:#555;line-height:1.8;padding:0 0 0 18px;margin:.25rem 0 1rem">
              <li>All journal entries and drafts</li>
              <li>All tags, reminders, and preferences</li>
              <li>All uploaded images and media</li>
              <li>Your account credentials and profile</li>
            </ul>
            <p style="color:#555;line-height:1.6;margin:.75rem 0">
              If you had an active subscription, it has been cancelled and
              you will not be charged again. Billing records are retained by Stripe as required
              by financial regulations.
            </p>
            <p style="color:#555;line-height:1.6;margin:.75rem 0">
              We're sorry to see you go. If you ever want to start fresh,
              you're always welcome back.
            </p>
            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1.5rem 0 0">
              If you did not request this deletion, please contact us immediately at
              <a href="mailto:support@creatorcompanionapp.com" style="color:#12C4E3">support&#64;creatorcompanionapp.com</a>.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = $"Your {appName} account has been deleted",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        await resend.EmailSendAsync(message);
    }

    public async Task<Guid?> SendDailySparkReminderAsync(
        string toEmail,
        string takeaway,
        string? fullContent)
    {
        var fromEmail = config["Resend:FromEmail"] ?? "noreply@creatorcompanion.app";
        var appName   = config["App:Name"] ?? "Creator Companion";

        // Encode + preserve newlines so the spark renders the way it would
        // in the app: takeaway on top (bold hook), full content underneath.
        // HtmlEncode prevents any inadvertent HTML in admin-authored spark
        // text from breaking out of the copy block.
        var takeawayHtml = System.Net.WebUtility.HtmlEncode((takeaway ?? "").Trim())
            .Replace("\n", "<br>");
        var fullHtml = string.IsNullOrWhiteSpace(fullContent)
            ? ""
            : System.Net.WebUtility.HtmlEncode(fullContent.Trim()).Replace("\n", "<br>");

        var body = $"""
            <h2 style="margin:0 0 .5rem;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
              Today's Daily Spark
            </h2>
            <p style="color:#555;line-height:1.6;margin:.5rem 0 1.25rem">
              Hi Chris — here's today's spark, ready to share. Copy the block below
              and paste straight into Substack Notes (or wherever you're posting today).
            </p>

            <!-- Copy-friendly block. Background + border helps the admin
                 see exactly what to highlight. Cream surface matches the
                 in-app Spark card styling. -->
            <div style="background:#fdfaf2;border:1px solid #e5e0d0;border-radius:10px;padding:1.25rem;margin:1.25rem 0;line-height:1.6;color:#1a1d24">
              <p style="margin:0;font-weight:600;font-size:1.0625rem">{takeawayHtml}</p>
              {(string.IsNullOrEmpty(fullHtml)
                 ? ""
                 : $"<p style=\"margin:.75rem 0 0;color:#444\">{fullHtml}</p>")}
            </div>

            <p style="color:#9aa0aa;font-size:.8125rem;line-height:1.5;margin:1rem 0 0">
              Once you've posted, no further action needed —
              {appName} has already marked this spark as used so you won't see it again.
            </p>
            """;

        var message = new EmailMessage
        {
            From    = $"{appName} <{fromEmail}>",
            To      = { toEmail },
            Subject = "Today's Daily Spark — ready to post",
            HtmlBody = WrapInBrandedShell(body, appName)
        };

        // Capture the response so we can return the Resend message id
        // (Guid) to the caller. With ThrowExceptions=true set in
        // Program.cs, API failures throw before reaching this line —
        // so by the time we get here, success is real (HTTP 200/202
        // from Resend's API) and we can safely log + return the id.
        var resp = await resend.EmailSendAsync(message);
        var resendId = resp?.Content;
        // Log at Info so the message id shows up in Railway logs for
        // every successful daily-spark send. Easy correlation with the
        // Resend dashboard: `Daily-spark email sent ... ResendMessageId={Guid}`.
        // Without this, debugging delivery problems required guessing
        // which Resend row corresponded to our send.
        return resendId == default ? null : resendId;
    }

    // ── Branded shell + CTA helpers ─────────────────────────────────
    /// <summary>
    /// Wraps an email body in the shared branded shell: logo header,
    /// rounded card container, footer with reply-to hint. All customer-
    /// facing emails route through this so the brand is consistent and
    /// future style changes (e.g. dark mode tweaks, footer copy) happen
    /// in exactly one place.
    ///
    /// Design constraints from common email-client gotchas:
    ///  - Outer wrapper has its own background colour so the card has
    ///    breathing room against grey app chrome (Gmail's web client).
    ///  - All sizing in px (rem is unreliable in Outlook).
    ///  - Logo served from app.creatorcompanionapp.com via App:BaseUrl
    ///    config — same domain the email links go to, so corporate
    ///    proxies that whitelist destination domains don't block the
    ///    image alone.
    ///  - Card max-width 520px — sweet spot for desktop preview panes
    ///    and mobile screens. Wider feels like a newsletter, narrower
    ///    feels cramped.
    ///  - System font stack ahead of "Inter" because email clients
    ///    don't load web fonts; the system fallback inherits the OS
    ///    UI font (San Francisco on Apple, Segoe UI on Windows).
    /// </summary>
    private string WrapInBrandedShell(string innerHtml, string appName)
    {
        var appBaseUrl = config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com";

        return $"""
            <div style="background:#f5f5f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
              <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e0d0;border-radius:14px;overflow:hidden">

                <!-- Logo header — uses the cyan square brand mark + plain
                     text wordmark so the email never depends on a font
                     file the client may not render. The wordmark is text
                     so dark-mode mail clients can recolour it correctly. -->
                <div style="padding:28px 24px 20px;text-align:center;border-bottom:1px solid #f0ebde">
                  <a href="{appBaseUrl}" style="display:inline-block;text-decoration:none">
                    <img src="{appBaseUrl}/logo-icon.png"
                         alt="{appName}"
                         width="48" height="48"
                         style="display:block;width:48px;height:48px;border-radius:10px;margin:0 auto" />
                  </a>
                  <div style="margin-top:10px;font-size:.9375rem;font-weight:700;letter-spacing:-.01em;color:#0c0e13">
                    {appName}
                  </div>
                </div>

                <!-- Body slot — each email's per-message content goes here.
                     32px top/bottom + 28px left/right is the comfortable
                     reading inset; lower would feel cramped against the
                     card edge. -->
                <div style="padding:32px 28px;color:#1a1d24">
                  {innerHtml}
                </div>

                <!-- Footer — reply-to hint + brand line. Muted grey so it
                     recedes; the actual content of the email should be
                     what the user reads. -->
                <div style="padding:18px 28px 24px;border-top:1px solid #f0ebde;text-align:center;color:#9aa0aa;font-size:.8125rem;line-height:1.5">
                  Questions? Just reply to this email and we'll help.<br>
                  <a href="{appBaseUrl}" style="color:#9aa0aa;text-decoration:underline">{appName}</a>
                </div>

              </div>
            </div>
            """;
    }

    /// <summary>
    /// Renders the canonical primary CTA button — black ink background,
    /// white text, rounded, full-width on mobile. Used by every email
    /// that has a single primary action so the visual rhythm matches
    /// the in-app primary-button treatment (black default, cyan on
    /// hover — though email clients don't render :hover, so we just
    /// ship the default state).
    ///
    /// The wrapping table is a deliberate Outlook hack: Outlook on
    /// Windows ignores padding on &lt;a&gt; tags inside &lt;div&gt;,
    /// rendering the button as a tiny link instead of the intended
    /// block. Wrapping in a single-cell table forces Outlook to honour
    /// the padding. Other clients render it identically either way.
    /// </summary>
    private static string PrimaryCtaButton(string label, string url) => $"""
        <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto">
          <tr>
            <td style="border-radius:10px;background:#0c0e13">
              <a href="{url}"
                 style="display:inline-block;padding:14px 28px;font-size:.9375rem;font-weight:600;
                        color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-.01em">
                {label}
              </a>
            </td>
          </tr>
        </table>
        """;

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
