using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/drafts")]
[Authorize]
public class DraftsController(IDraftService draftService) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpPut]
    public async Task<IActionResult> Upsert([FromBody] UpsertDraftRequest request)
    {
        try
        {
            var draft = await draftService.UpsertAsync(UserId, request);
            return Ok(draft);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] Guid journalId, [FromQuery] DateOnly entryDate)
    {
        var draft = await draftService.GetAsync(UserId, journalId, entryDate);
        return draft is null ? NoContent() : Ok(draft);
    }

    [HttpDelete]
    public async Task<IActionResult> Discard([FromQuery] Guid journalId, [FromQuery] DateOnly entryDate)
    {
        await draftService.DiscardAsync(UserId, journalId, entryDate);
        return NoContent();
    }
}
