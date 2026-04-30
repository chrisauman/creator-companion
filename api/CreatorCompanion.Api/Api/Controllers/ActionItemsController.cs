using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/action-items")]
[Authorize]
public class ActionItemsController(AppDbContext db) : ControllerBase
{
    private const int MaxActiveItems = 20;

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    // ── GET /v1/action-items ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        if (user.Tier != AccountTier.Paid) return Forbid();

        var items = await db.ActionItems
            .Where(a => a.UserId == UserId)
            .OrderBy(a => a.IsCompleted)       // active first
            .ThenBy(a => a.SortOrder)
            .ThenBy(a => a.CompletedAt)         // completed: oldest first
            .Select(a => new ActionItemResponse(
                a.Id, a.Text, a.SortOrder,
                a.IsCompleted, a.CompletedAt, a.CreatedAt))
            .ToListAsync();

        return Ok(items);
    }

    // ── POST /v1/action-items ────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateActionItemRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        if (user.Tier != AccountTier.Paid) return Forbid();

        var activeCount = await db.ActionItems
            .CountAsync(a => a.UserId == UserId && !a.IsCompleted);

        if (activeCount >= MaxActiveItems)
            return BadRequest(new { error = $"You can have at most {MaxActiveItems} active items." });

        // New item goes at the end of the active list
        var maxOrder = await db.ActionItems
            .Where(a => a.UserId == UserId && !a.IsCompleted)
            .Select(a => (int?)a.SortOrder)
            .MaxAsync() ?? -1;

        var item = new ActionItem
        {
            UserId = UserId,
            Text = request.Text.Trim(),
            SortOrder = maxOrder + 1
        };

        db.ActionItems.Add(item);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new ActionItemResponse(
            item.Id, item.Text, item.SortOrder,
            item.IsCompleted, item.CompletedAt, item.CreatedAt));
    }

    // ── PUT /v1/action-items/{id} ────────────────────────────────────────────
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateActionItemRequest request)
    {
        var item = await db.ActionItems
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == UserId);

        if (item is null) return NotFound();

        item.Text = request.Text.Trim();
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new ActionItemResponse(
            item.Id, item.Text, item.SortOrder,
            item.IsCompleted, item.CompletedAt, item.CreatedAt));
    }

    // ── POST /v1/action-items/{id}/toggle ────────────────────────────────────
    [HttpPost("{id:int}/toggle")]
    public async Task<IActionResult> Toggle(int id)
    {
        var item = await db.ActionItems
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == UserId);

        if (item is null) return NotFound();

        item.IsCompleted = !item.IsCompleted;
        item.CompletedAt = item.IsCompleted ? DateTime.UtcNow : null;
        item.UpdatedAt = DateTime.UtcNow;

        if (item.IsCompleted)
        {
            // Remove from active sort order — compact remaining active items
            var activeItemsBelow = await db.ActionItems
                .Where(a => a.UserId == UserId && !a.IsCompleted && a.SortOrder > item.SortOrder)
                .ToListAsync();
            foreach (var a in activeItemsBelow) a.SortOrder--;
            item.SortOrder = 0; // sort order irrelevant for completed items
        }
        else
        {
            // Restore to end of active list
            var maxOrder = await db.ActionItems
                .Where(a => a.UserId == UserId && !a.IsCompleted)
                .Select(a => (int?)a.SortOrder)
                .MaxAsync() ?? -1;
            item.SortOrder = maxOrder + 1;
        }

        await db.SaveChangesAsync();

        return Ok(new ActionItemResponse(
            item.Id, item.Text, item.SortOrder,
            item.IsCompleted, item.CompletedAt, item.CreatedAt));
    }

    // ── PUT /v1/action-items/reorder ─────────────────────────────────────────
    [HttpPut("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderActionItemsRequest request)
    {
        var items = await db.ActionItems
            .Where(a => a.UserId == UserId && !a.IsCompleted)
            .ToListAsync();

        var itemMap = items.ToDictionary(a => a.Id);

        for (int i = 0; i < request.Ids.Count; i++)
        {
            if (!itemMap.TryGetValue(request.Ids[i], out var item))
                return BadRequest(new { error = $"Item {request.Ids[i]} not found." });
            item.SortOrder = i;
            item.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── DELETE /v1/action-items/{id} ─────────────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await db.ActionItems
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == UserId);

        if (item is null) return NotFound();

        // Compact sort order for remaining active items
        if (!item.IsCompleted)
        {
            var activeItemsBelow = await db.ActionItems
                .Where(a => a.UserId == UserId && !a.IsCompleted && a.SortOrder > item.SortOrder)
                .ToListAsync();
            foreach (var a in activeItemsBelow) a.SortOrder--;
        }

        db.ActionItems.Remove(item);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── DELETE /v1/action-items/completed ────────────────────────────────────
    [HttpDelete("completed")]
    public async Task<IActionResult> ClearCompleted()
    {
        var completed = await db.ActionItems
            .Where(a => a.UserId == UserId && a.IsCompleted)
            .ToListAsync();

        db.ActionItems.RemoveRange(completed);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
