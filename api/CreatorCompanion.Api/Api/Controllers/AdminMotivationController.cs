using System.Text;
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

    /// <summary>
    /// Exports every spark as a CSV for offline editing (e.g. drafting
    /// shorter, social-length versions in a spreadsheet + AI, then
    /// re-importing). The <c>Id</c> column is the stable match key for
    /// re-import — leave it untouched. The trailing <c>ShortText</c> column
    /// is intentionally blank: that's the one to fill in.
    ///
    /// Bearer-auth (admin) like the rest of this controller, so the download
    /// is triggered from the authenticated app, not a raw browser link.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv()
    {
        var entries = await db.MotivationEntries
            .OrderBy(e => e.Category)
            .ThenBy(e => e.CreatedAt)
            .Select(e => new { e.Id, e.Category, e.Title, e.Takeaway, e.FullContent })
            .ToListAsync();

        var sb = new StringBuilder();
        sb.Append('\uFEFF'); // UTF-8 BOM so Excel/Sheets render accents + curly quotes correctly
        sb.Append("Id,Category,Title,Takeaway,FullContent,ShortText\r\n");
        foreach (var e in entries)
        {
            sb.Append(string.Join(',',
                Csv(e.Id.ToString()), Csv(e.Category.ToString()), Csv(e.Title),
                Csv(e.Takeaway), Csv(e.FullContent), Csv("")));
            sb.Append("\r\n");
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv", "creator-companion-sparks.csv");

        // RFC-4180 field: always quote, double any embedded quotes. This makes
        // commas, newlines, and quotes inside the spark text safe.
        static string Csv(string? s) => "\"" + (s ?? string.Empty).Replace("\"", "\"\"") + "\"";
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
