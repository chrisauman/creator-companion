using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/tags")]
[Authorize]
public class TagsController(ITagService tagService) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await tagService.GetUserTagsAsync(UserId);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTagRequest request)
    {
        try
        {
            var result = await tagService.CreateAsync(UserId, request.Name);
            return CreatedAtAction(nameof(GetAll), result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Rename(Guid id, [FromBody] RenameTagRequest request)
    {
        try
        {
            var result = await tagService.RenameAsync(UserId, id, request.Name);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await tagService.DeleteAsync(UserId, id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }
}
