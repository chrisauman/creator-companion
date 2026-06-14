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
    ILandingImageService images,
    IResearchService research) : ControllerBase
{
    // ── Research: vocabulary ──────────────────────────────────────────
    [HttpGet("research/vocab")]
    public async Task<IActionResult> Vocab(CancellationToken ct) => Ok(await research.GetVocabAsync(ct));

    [HttpPost("research/vocab")]
    public async Task<IActionResult> AddVocab([FromBody] VocabAddRequest req, CancellationToken ct)
        => await research.AddVocabAsync(req, ct) is { } v ? Ok(v) : BadRequest(new { error = "Invalid kind or value." });

    [HttpDelete("research/vocab/{id:guid}")]
    public async Task<IActionResult> DeleteVocab(Guid id, CancellationToken ct)
        => await research.DeleteVocabAsync(id, ct) ? NoContent() : NotFound();

    // ── Research: brainstorm → commit ─────────────────────────────────
    /// <summary>Brainstorm candidates for an angle, each classified New/NearDuplicate/Duplicate. Saves nothing.</summary>
    [HttpPost("research/brainstorm")]
    public async Task<IActionResult> Brainstorm([FromBody] BrainstormRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Theme)) return BadRequest(new { error = "A theme/angle is required." });
        return Ok(await research.BrainstormAsync(req, ct));
    }

    /// <summary>Persist the chosen candidates (queue/idea), logging the batch; true-duplicates are dropped.</summary>
    [HttpPost("research/commit")]
    public async Task<IActionResult> Commit([FromBody] CommitRequest req, CancellationToken ct)
        => Ok(await research.CommitAsync(req, ct));

    [HttpGet("research/batches")]
    public async Task<IActionResult> Batches(CancellationToken ct) => Ok(await research.ListBatchesAsync(ct));

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

    /// <summary>Undo the most recent content edit (one step). 404 if there's nothing to undo.</summary>
    [HttpPost("pages/{id:guid}/undo")]
    public async Task<IActionResult> Undo(Guid id, CancellationToken ct)
        => await svc.UndoAsync(id, ct) is { } d ? Ok(d) : NotFound();

    /// <summary>Propose an AI edit from a natural-language instruction (NOT saved — accept = a normal PUT).</summary>
    [HttpPost("pages/{id:guid}/ai-edit")]
    public async Task<IActionResult> AiEdit(Guid id, [FromBody] AiEditRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Instruction)) return BadRequest(new { error = "Describe the change you want." });
        return await svc.AiEditAsync(id, req.Instruction, ct) is { } p
            ? Ok(p)
            : BadRequest(new { error = "Couldn't generate that edit. Try rephrasing, or check the Anthropic key." });
    }

    /// <summary>Returns a marketing-domain preview URL (signed token) — renders the page, drafts included, where all assets resolve.</summary>
    [HttpGet("pages/{id:guid}/preview")]
    public async Task<IActionResult> Preview(Guid id, CancellationToken ct)
        => await svc.PreviewUrlAsync(id, ct) is { } url ? Ok(new { url }) : NotFound();

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
