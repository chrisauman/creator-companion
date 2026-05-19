using System.Security.Claims;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/email-templates")]
[Authorize(Policy = "AdminOnly")]
public class AdminEmailController(AppDbContext db, IEmailService emailService) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await db.EmailTemplates
            .OrderBy(t => t.Key)
            .Select(t => new { t.Id, t.Key, t.Subject, t.UpdatedAt })
            .ToListAsync();

        return Ok(templates);
    }

    // ── GET /v1/admin/email-templates/{key} ───────────────────────────
    // Returns the saved template if it exists; otherwise returns the
    // built-in default content for the matching email type so the admin
    // can see/edit what's actually being sent today. Without this fallback
    // the admin form rendered empty for any template that had never been
    // customised, which made it look like the welcome email was broken
    // when really it was just using the hard-coded default.
    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == key);
        if (template is not null)
        {
            return Ok(new
            {
                template.Id,
                template.Key,
                template.Subject,
                template.HtmlContent,
                template.UpdatedAt,
                isCustom = true
            });
        }

        var (defaultSubject, defaultHtml) = EmailDefaults.GetDefault(key);
        if (defaultSubject is null)
            return NotFound();

        // Return shape mirrors the saved-template response so the
        // frontend has a single code path. isCustom=false tells the
        // UI this is the built-in default (could surface "currently
        // using default" hint, etc.).
        return Ok(new
        {
            Id = (int?)null,
            Key = key,
            Subject = defaultSubject,
            HtmlContent = defaultHtml,
            UpdatedAt = (DateTime?)null,
            isCustom = false
        });
    }

    [HttpPut("{key}")]
    public async Task<IActionResult> Upsert(string key, [FromBody] UpsertEmailTemplateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Subject))
            return BadRequest(new { error = "Subject is required." });

        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == key);

        if (template is null)
        {
            template = new EmailTemplate { Key = key };
            db.EmailTemplates.Add(template);
        }

        template.Subject     = request.Subject.Trim();
        template.HtmlContent = request.HtmlContent ?? string.Empty;
        template.UpdatedAt   = DateTime.UtcNow;

        await db.SaveChangesAsync();

        return Ok(new { template.Id, template.Key, template.Subject, template.HtmlContent, template.UpdatedAt });
    }

    // ── POST /v1/admin/email-templates/{key}/send-test ────────────────
    // Sends the CURRENT SAVED template to the calling admin's own email
    // address. Used to verify both the template renders correctly AND
    // that Resend is configured and delivering (any silent failures in
    // the registration-time best-effort send path will surface here).
    //
    // Only sends to the admin themselves — not to an arbitrary email —
    // so this can't be used to spam other addresses even with admin
    // creds.
    [HttpPost("{key}/send-test")]
    public async Task<IActionResult> SendTest(string key)
    {
        var admin = await db.Users.FindAsync(UserId);
        if (admin is null) return NotFound();

        try
        {
            switch (key)
            {
                case "welcome":
                    await emailService.SendWelcomeAsync(admin.Email, admin.FirstName);
                    break;
                default:
                    return BadRequest(new { error = $"No test-send handler for template '{key}'." });
            }
            return Ok(new { sent = true, to = admin.Email });
        }
        catch (Exception ex)
        {
            // Surface the real error to the admin UI — this is the
            // whole point of a test-send: if Resend rejected the send
            // (bad API key, unverified domain, etc.) the admin needs
            // to see it, not have it swallowed like the registration-
            // time best-effort send does.
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

public record UpsertEmailTemplateRequest(string Subject, string? HtmlContent);

/// <summary>
/// Mirror of the hard-coded default templates in ResendEmailService.
/// Kept in sync so the admin GET can return the live default content
/// when no custom row exists. If you change a default in
/// ResendEmailService, update the matching entry here too.
/// </summary>
internal static class EmailDefaults
{
    public static (string? subject, string? html) GetDefault(string key) => key switch
    {
        "welcome" => (
            "Welcome to Creator Companion — let's get started",
            """
            <h2 style="margin-bottom:.5rem">Welcome, {displayName}!</h2>
            <p style="color:#555">You've taken the first step. Creator Companion is your private space to show up, write, and build a creative practice that sticks.</p>
            <h3 style="margin-top:1.5rem;margin-bottom:.5rem">A few things to try first:</h3>
            <ul style="color:#555;line-height:2">
              <li><strong>Write your first entry</strong> — head to the dashboard and start today's entry</li>
              <li><strong>Set a daily reminder</strong> — a nudge at the right time makes all the difference</li>
              <li><strong>Check your Daily Spark</strong> — a fresh creative insight every day to fuel your work</li>
            </ul>
            <p style="color:#555">Consistency is the skill. See you tomorrow.</p>
            """
        ),
        _ => (null, null)
    };
}
