using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/motivation")]
[Authorize(Roles = "Admin")]
public class AdminMotivationController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var entries = await db.MotivationEntries
            .OrderBy(e => e.Category)
            .ThenBy(e => e.CreatedAt)
            .Select(e => new MotivationEntryResponse(
                e.Id, e.Title, e.Takeaway, e.FullContent,
                e.Category.ToString(), e.CreatedAt, e.UpdatedAt, false))
            .ToListAsync();

        return Ok(entries);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateMotivationRequest request)
    {
        if (!Enum.TryParse<MotivationCategory>(request.Category, out var category))
            return BadRequest(new { error = "Invalid category. Use Encouragement, BestPractice, or Quote." });

        var takeaway = request.Takeaway.Trim();
        var entry = new MotivationEntry
        {
            Title       = takeaway.Length > 200 ? takeaway[..200] : takeaway,
            Takeaway    = takeaway,
            FullContent = request.FullContent.Trim(),
            Category    = category
        };

        db.MotivationEntries.Add(entry);
        await db.SaveChangesAsync();

        return Ok(new MotivationEntryResponse(
            entry.Id, entry.Title, entry.Takeaway, entry.FullContent,
            entry.Category.ToString(), entry.CreatedAt, entry.UpdatedAt, false));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMotivationRequest request)
    {
        var entry = await db.MotivationEntries.FindAsync(id);
        if (entry is null) return NotFound();

        if (!Enum.TryParse<MotivationCategory>(request.Category, out var category))
            return BadRequest(new { error = "Invalid category. Use Encouragement, BestPractice, or Quote." });

        var updatedTakeaway = request.Takeaway.Trim();
        entry.Title       = updatedTakeaway.Length > 200 ? updatedTakeaway[..200] : updatedTakeaway;
        entry.Takeaway    = updatedTakeaway;
        entry.FullContent = request.FullContent.Trim();
        entry.Category    = category;
        entry.UpdatedAt   = DateTime.UtcNow;

        await db.SaveChangesAsync();

        return Ok(new MotivationEntryResponse(
            entry.Id, entry.Title, entry.Takeaway, entry.FullContent,
            entry.Category.ToString(), entry.CreatedAt, entry.UpdatedAt, false));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var entry = await db.MotivationEntries.FindAsync(id);
        if (entry is null) return NotFound();

        db.MotivationEntries.Remove(entry);
        await db.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var total      = await db.MotivationEntries.CountAsync();
        var byCategory = await db.MotivationEntries
            .GroupBy(e => e.Category)
            .Select(g => new { category = g.Key.ToString(), count = g.Count() })
            .ToListAsync();

        return Ok(new { total, byCategory });
    }
}
