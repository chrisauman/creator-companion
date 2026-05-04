using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/daily-prompts")]
[Authorize]
public class DailyPromptsController(AppDbContext db) : ControllerBase
{
    private static DailyPromptResponse Map(DailyPrompt p) =>
        new(p.Id, p.Text, p.SortOrder, p.IsPublished, p.CreatedAt, p.UpdatedAt);

    /// <summary>
    /// Returns all currently published prompts. The dashboard's Today
    /// panel fetches this list once on mount and shuffles client-side
    /// so the shuffle button feels instant.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetPublished()
    {
        var prompts = await db.DailyPrompts
            .Where(p => p.IsPublished)
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.CreatedAt)
            .ToListAsync();

        return Ok(prompts.Select(Map));
    }
}
