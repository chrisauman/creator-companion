using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin API for the blog: the post directory + editor, categories, AI editing,
/// content history, and preview. Admin-only. Daily generation + the keyword
/// queue are shared with the landing-page pipeline (a keyword's ContentType
/// routes it to a post vs a page).
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("v1/admin/blog")]
public class AdminBlogController(IBlogService svc) : ControllerBase
{
    // ── Categories ────────────────────────────────────────────────────
    [HttpGet("categories")]
    public async Task<IActionResult> Categories(CancellationToken ct) => Ok(await svc.ListCategoriesAsync(ct));

    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] BlogCategoryUpsert req, CancellationToken ct)
    {
        var (cat, error) = await svc.CreateCategoryAsync(req, ct);
        return error is not null ? BadRequest(new { error }) : Ok(cat);
    }

    [HttpPut("categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] BlogCategoryUpsert req, CancellationToken ct)
    {
        var (cat, error) = await svc.UpdateCategoryAsync(id, req, ct);
        if (error is not null) return BadRequest(new { error });
        return cat is null ? NotFound() : Ok(cat);
    }

    [HttpDelete("categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken ct)
    {
        var (ok, error) = await svc.DeleteCategoryAsync(id, ct);
        return error is not null ? BadRequest(new { error }) : ok ? NoContent() : NotFound();
    }

    // ── Posts ─────────────────────────────────────────────────────────
    [HttpGet("posts")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? category,
        [FromQuery] string? sort, [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
        => Ok(await svc.ListAsync(search, status, category, sort, skip, take, ct));

    [HttpGet("posts/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
        => await svc.GetAsync(id, ct) is { } d ? Ok(d) : NotFound();

    [HttpPost("posts")]
    public async Task<IActionResult> Create([FromBody] BlogUpsertRequest req, CancellationToken ct)
    {
        var (post, error) = await svc.CreateAsync(req, generatedByAi: false, qualityScore: null, ct);
        return error is not null ? BadRequest(new { error }) : Ok(post);
    }

    [HttpPut("posts/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] BlogUpsertRequest req, CancellationToken ct)
    {
        var (post, error) = await svc.UpdateAsync(id, req, ct);
        if (error is not null) return BadRequest(new { error });
        return post is null ? NotFound() : Ok(post);
    }

    [HttpPost("posts/{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] SetStatusBody body, CancellationToken ct)
    {
        if (!Enum.TryParse<LandingPageStatus>(body.Status, true, out var st))
            return BadRequest(new { error = "Invalid status. Use Draft, Published, or Archived." });
        return await svc.SetStatusAsync(id, st, ct) ? NoContent() : NotFound();
    }

    [HttpDelete("posts/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        => await svc.SoftDeleteAsync(id, ct) ? NoContent() : NotFound();

    [HttpPost("posts/{id:guid}/revert")]
    public async Task<IActionResult> Revert(Guid id, CancellationToken ct)
        => await svc.RevertAsync(id, ct) is { } d ? Ok(d) : NotFound();

    [HttpPost("posts/{id:guid}/undo")]
    public async Task<IActionResult> Undo(Guid id, CancellationToken ct)
        => await svc.UndoAsync(id, ct) is { } d ? Ok(d) : NotFound();

    [HttpPost("posts/{id:guid}/ai-edit")]
    public async Task<IActionResult> AiEdit(Guid id, [FromBody] BlogAiEditRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Instruction)) return BadRequest(new { error = "Describe the change you want." });
        return await svc.AiEditAsync(id, req.Instruction, ct) is { } p
            ? Ok(p)
            : BadRequest(new { error = "Couldn't generate that edit. Try rephrasing, or check the Anthropic key." });
    }

    [HttpGet("posts/{id:guid}/preview")]
    public async Task<IActionResult> Preview(Guid id, CancellationToken ct)
        => await svc.PreviewUrlAsync(id, ct) is { } url ? Ok(new { url }) : NotFound();

    public record SetStatusBody(string Status);
}
