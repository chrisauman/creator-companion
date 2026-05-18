using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/daily-prompts")]
[Authorize]
public class DailyPromptsController(AppDbContext db, IEntitlementService entitlements) : ControllerBase
{
    private static DailyPromptResponse Map(DailyPrompt p) =>
        new(p.Id, p.Text, p.SortOrder, p.IsPublished, p.CreatedAt, p.UpdatedAt);

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// Returns all currently published prompts. The dashboard's Today
    /// panel fetches this list once on mount and shuffles client-side
    /// so the shuffle button feels instant.
    ///
    /// Gated on entitlements: trial-expired users with no active
    /// subscription get 204 No Content rather than the prompt list.
    /// Daily-rotation content (this + the Daily Spark) is gated server-
    /// side to match the product promise that "subscribe to unlock daily
    /// inspiration" actually means the API stops handing it out, not
    /// just that the frontend stops rendering it.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetPublished()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NoContent();
        if (!entitlements.HasAccess(user)) return NoContent();

        var prompts = await db.DailyPrompts
            .Where(p => p.IsPublished)
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.CreatedAt)
            .ToListAsync();

        return Ok(prompts.Select(Map));
    }
}
