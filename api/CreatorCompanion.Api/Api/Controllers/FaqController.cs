using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>FAQ endpoint — returns published FAQs in priority order.
/// The /v1/faq endpoint is the in-app version (authenticated). The
/// /v1/faq/public endpoint is the marketing-site version (anonymous)
/// and serves the same content — the FAQ has no per-user data, just
/// product information, so there's no PII risk in exposing it.</summary>
[ApiController]
[Route("v1/faq")]
public class FaqController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    [Authorize]
    public Task<IActionResult> GetPublished() => GetPublishedInternal();

    [HttpGet("public")]
    [AllowAnonymous]
    public Task<IActionResult> GetPublic() => GetPublishedInternal();

    private async Task<IActionResult> GetPublishedInternal()
    {
        var faqs = await db.Faqs
            .Where(f => f.IsPublished)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .Select(f => new FaqResponse(
                f.Id, f.Question, f.Answer, f.Category,
                f.SortOrder, f.IsPublished,
                f.CreatedAt, f.UpdatedAt))
            .ToListAsync();

        return Ok(faqs);
    }
}
