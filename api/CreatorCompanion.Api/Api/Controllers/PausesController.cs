using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/pauses")]
[Authorize]
public class PausesController(IPauseService pauseService) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    /// <summary>Returns the caller's current active pause, or 204 if none.</summary>
    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var pause = await pauseService.GetActivePauseAsync(UserId);
        if (pause is null) return NoContent();
        return Ok(pause);
    }

    /// <summary>Creates a new streak pause.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePauseRequest request)
    {
        try
        {
            var pause = await pauseService.CreatePauseAsync(UserId, request);
            return CreatedAtAction(nameof(GetActive), pause);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Cancels an active pause.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        try
        {
            await pauseService.CancelPauseAsync(UserId, id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
