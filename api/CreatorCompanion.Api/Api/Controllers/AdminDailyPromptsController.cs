using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/daily-prompts")]
[Authorize(Roles = "Admin")]
public class AdminDailyPromptsController(AppDbContext db) : ControllerBase
{
    private static DailyPromptResponse Map(DailyPrompt p) =>
        new(p.Id, p.Text, p.SortOrder, p.IsPublished, p.CreatedAt, p.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var prompts = await db.DailyPrompts
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.CreatedAt)
            .ToListAsync();

        return Ok(prompts.Select(Map));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDailyPromptRequest request)
    {
        var maxOrder = await db.DailyPrompts.AnyAsync()
            ? await db.DailyPrompts.MaxAsync(p => p.SortOrder)
            : -1;

        var prompt = new DailyPrompt
        {
            Text        = request.Text.Trim(),
            IsPublished = request.IsPublished,
            SortOrder   = maxOrder + 1
        };

        db.DailyPrompts.Add(prompt);
        await db.SaveChangesAsync();

        return Ok(Map(prompt));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDailyPromptRequest request)
    {
        var prompt = await db.DailyPrompts.FindAsync(id);
        if (prompt is null) return NotFound();

        prompt.Text        = request.Text.Trim();
        prompt.IsPublished = request.IsPublished;
        prompt.UpdatedAt   = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(Map(prompt));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var prompt = await db.DailyPrompts.FindAsync(id);
        if (prompt is null) return NotFound();

        db.DailyPrompts.Remove(prompt);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderDailyPromptsRequest request)
    {
        var prompts = await db.DailyPrompts.ToListAsync();
        var index = 0;

        foreach (var id in request.Ids)
        {
            var prompt = prompts.FirstOrDefault(p => p.Id == id);
            if (prompt is not null)
            {
                prompt.SortOrder = index++;
                prompt.UpdatedAt = DateTime.UtcNow;
            }
        }

        await db.SaveChangesAsync();
        return NoContent();
    }
}
