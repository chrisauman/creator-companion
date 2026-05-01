using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>Public (authenticated) FAQ endpoint — returns published FAQs in priority order.</summary>
[ApiController]
[Route("v1/faq")]
[Authorize]
public class FaqController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetPublished()
    {
        var faqs = await db.Faqs
            .Where(f => f.IsPublished)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .Select(f => new FaqResponse(
                f.Id, f.Question, f.Answer,
                f.SortOrder, f.IsPublished,
                f.CreatedAt, f.UpdatedAt))
            .ToListAsync();

        return Ok(faqs);
    }
}
