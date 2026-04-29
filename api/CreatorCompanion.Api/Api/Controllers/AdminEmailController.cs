using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/email-templates")]
[Authorize(Policy = "AdminOnly")]
public class AdminEmailController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await db.EmailTemplates
            .OrderBy(t => t.Key)
            .Select(t => new { t.Id, t.Key, t.Subject, t.UpdatedAt })
            .ToListAsync();

        return Ok(templates);
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var template = await db.EmailTemplates.FirstOrDefaultAsync(t => t.Key == key);
        if (template is null) return NotFound();
        return Ok(new { template.Id, template.Key, template.Subject, template.HtmlContent, template.UpdatedAt });
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
}

public record UpsertEmailTemplateRequest(string Subject, string? HtmlContent);
