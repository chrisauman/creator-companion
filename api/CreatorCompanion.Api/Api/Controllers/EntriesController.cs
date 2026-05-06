using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/entries")]
[Authorize]
public class EntriesController(IEntryService entryService, IStreakService streakService) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet("streak")]
    public async Task<IActionResult> GetStreak()
    {
        var result = await entryService.GetStreakAsync(UserId);
        return Ok(result);
    }

    /// <summary>
    /// Past completed streaks (chapters), most recent first. Powers the
    /// Streak History view in column 3 of the dashboard. Excludes the
    /// currently-ongoing streak — that's already on /streak.
    /// </summary>
    [HttpGet("streak/history")]
    public async Task<IActionResult> GetStreakHistory()
    {
        var result = await streakService.GetHistoryAsync(UserId);
        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetList(
        [FromQuery] Guid? journalId,
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? tagName = null,
        [FromQuery] int? skip = null,
        [FromQuery] int? take = null)
    {
        var entries = await entryService.GetListAsync(UserId, journalId, includeDeleted, tagName, skip, take);
        return Ok(entries);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var entry = await entryService.GetByIdAsync(UserId, id);
            return Ok(entry);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEntryRequest request)
    {
        try
        {
            var entry = await entryService.CreateAsync(UserId, request);
            return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEntryRequest request)
    {
        try
        {
            var entry = await entryService.UpdateAsync(UserId, id, request);
            return Ok(entry);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        try
        {
            await entryService.SoftDeleteAsync(UserId, id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/recover")]
    public async Task<IActionResult> Recover(Guid id)
    {
        try
        {
            await entryService.RecoverAsync(UserId, id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/favorite")]
    public async Task<IActionResult> ToggleFavorite(Guid id)
    {
        try
        {
            var isFavorited = await entryService.ToggleFavoriteAsync(UserId, id);
            return Ok(new { isFavorited });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}/permanent")]
    public async Task<IActionResult> HardDelete(Guid id)
    {
        try
        {
            await entryService.HardDeleteAsync(UserId, id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }
}
