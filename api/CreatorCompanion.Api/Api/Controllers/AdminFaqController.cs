using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/faq")]
[Authorize(Roles = "Admin")]
public class AdminFaqController(AppDbContext db) : ControllerBase
{
    private static FaqResponse Map(Faq f) =>
        new(f.Id, f.Question, f.Answer, f.SortOrder, f.IsPublished, f.CreatedAt, f.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var faqs = await db.Faqs
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();

        return Ok(faqs.Select(Map));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFaqRequest request)
    {
        var maxOrder = await db.Faqs.AnyAsync()
            ? await db.Faqs.MaxAsync(f => f.SortOrder)
            : -1;

        var faq = new Faq
        {
            Question    = request.Question.Trim(),
            Answer      = request.Answer.Trim(),
            IsPublished = request.IsPublished,
            SortOrder   = maxOrder + 1
        };

        db.Faqs.Add(faq);
        await db.SaveChangesAsync();

        return Ok(Map(faq));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFaqRequest request)
    {
        var faq = await db.Faqs.FindAsync(id);
        if (faq is null) return NotFound();

        faq.Question    = request.Question.Trim();
        faq.Answer      = request.Answer.Trim();
        faq.IsPublished = request.IsPublished;
        faq.UpdatedAt   = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(Map(faq));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var faq = await db.Faqs.FindAsync(id);
        if (faq is null) return NotFound();

        db.Faqs.Remove(faq);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderFaqRequest request)
    {
        var faqs = await db.Faqs.ToListAsync();
        var index = 0;

        foreach (var id in request.Ids)
        {
            var faq = faqs.FirstOrDefault(f => f.Id == id);
            if (faq is not null)
            {
                faq.SortOrder = index++;
                faq.UpdatedAt = DateTime.UtcNow;
            }
        }

        await db.SaveChangesAsync();
        return NoContent();
    }
}
