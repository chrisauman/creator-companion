using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin API for the landing-page builder: the directory, the per-section
/// editor, the keyword queue, and settings. Admin-only.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("v1/admin/landing")]
public class AdminLandingController(
    ILandingPageService svc,
    ILandingPageGenerationService generation,
    ILandingImageService images) : ControllerBase
{
    // ── Images (Pexels) ───────────────────────────────────────────────
    /// <summary>Search free stock (Pexels) for the editor's image picker.</summary>
    [HttpGet("images/search")]
    public async Task<IActionResult> SearchImages([FromQuery] string q, CancellationToken ct)
        => Ok(await images.SearchAsync(q, 24, ct));

    /// <summary>Download a chosen photo + return a same-origin lp-img/{id} URL to assign to a slot.</summary>
    [HttpPost("images/use")]
    public async Task<IActionResult> UseImage([FromBody] UseImageBody body, CancellationToken ct)
    {
        var url = await images.StoreFromUrlAsync(body.Url, ct);
        return url is null ? BadRequest(new { error = "Could not store that image." }) : Ok(new { url });
    }

    public record UseImageBody(string Url);

    /// <summary>Generate one page from the next queued keyword right now (for testing without waiting for 7am).</summary>
    [HttpPost("generate-now")]
    public async Task<IActionResult> GenerateNow(CancellationToken ct)
    {
        var (ok, message) = await generation.GenerateNextAsync(ct);
        return Ok(new { ok, message });
    }

    // ── Pages ─────────────────────────────────────────────────────────
    [HttpGet("pages")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? status,
        [FromQuery] string? sort, [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
        => Ok(await svc.ListAsync(search, status, sort, skip, take, ct));

    [HttpGet("pages/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
        => await svc.GetAsync(id, ct) is { } d ? Ok(d) : NotFound();

    [HttpPost("pages")]
    public async Task<IActionResult> Create([FromBody] LpUpsertRequest req, CancellationToken ct)
    {
        var (page, error) = await svc.CreateAsync(req, generatedByAi: false, qualityScore: null, ct);
        return error is not null ? BadRequest(new { error }) : Ok(page);
    }

    [HttpPut("pages/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] LpUpsertRequest req, CancellationToken ct)
    {
        var (page, error) = await svc.UpdateAsync(id, req, ct);
        if (error is not null) return BadRequest(new { error });
        return page is null ? NotFound() : Ok(page);
    }

    [HttpPost("pages/{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] SetStatusBody body, CancellationToken ct)
    {
        if (!Enum.TryParse<LandingPageStatus>(body.Status, true, out var st))
            return BadRequest(new { error = "Invalid status. Use Draft, Published, or Archived." });
        return await svc.SetStatusAsync(id, st, ct) ? NoContent() : NotFound();
    }

    [HttpDelete("pages/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        => await svc.SoftDeleteAsync(id, ct) ? NoContent() : NotFound();

    [HttpPost("pages/{id:guid}/revert")]
    public async Task<IActionResult> Revert(Guid id, CancellationToken ct)
        => await svc.RevertAsync(id, ct) is { } d ? Ok(d) : NotFound();

    /// <summary>Renders the page exactly as it will appear (for the editor's preview pane).</summary>
    [HttpGet("pages/{id:guid}/preview")]
    public async Task<IActionResult> Preview(Guid id, CancellationToken ct)
        => await svc.RenderPreviewAsync(id, ct) is { } html ? Content(html, "text/html; charset=utf-8") : NotFound();

    // ── Keyword queue ─────────────────────────────────────────────────
    [HttpGet("keywords")]
    public async Task<IActionResult> Keywords(CancellationToken ct) => Ok(await svc.ListKeywordsAsync(ct));

    [HttpPost("keywords")]
    public async Task<IActionResult> CreateKeyword([FromBody] LpKeywordUpsert req, CancellationToken ct)
        => Ok(await svc.CreateKeywordAsync(req, ct));

    /// <summary>Bulk-import keywords from an uploaded CSV (columns: keyword, brief).</summary>
    [HttpPost("keywords/import")]
    public async Task<IActionResult> ImportKeywords(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "No file uploaded." });
        using var reader = new StreamReader(file.OpenReadStream());
        var csv = await reader.ReadToEndAsync(ct);
        return Ok(new { imported = await svc.ImportKeywordsAsync(csv, ct) });
    }

    [HttpPut("keywords/{id:guid}")]
    public async Task<IActionResult> UpdateKeyword(Guid id, [FromBody] LpKeywordUpsert req, CancellationToken ct)
        => await svc.UpdateKeywordAsync(id, req, ct) is { } k ? Ok(k) : NotFound();

    [HttpDelete("keywords/{id:guid}")]
    public async Task<IActionResult> DeleteKeyword(Guid id, CancellationToken ct)
        => await svc.DeleteKeywordAsync(id, ct) ? NoContent() : NotFound();

    // ── Settings ──────────────────────────────────────────────────────
    [HttpGet("settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) => Ok(await svc.GetSettingsAsync(ct));

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] LpSettingsUpdate req, CancellationToken ct)
        => Ok(await svc.UpdateSettingsAsync(req, ct));

    public record SetStatusBody(string Status);
}
