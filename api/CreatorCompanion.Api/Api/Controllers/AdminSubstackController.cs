using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin-only controller for the Substack auto-poster's settings and
/// the one-shot "send a test post" round-trip. The actual scheduled
/// posting lives in a separate background worker (added in phase 3).
/// </summary>
[ApiController]
[Route("v1/admin/substack")]
[Authorize(Roles = "Admin")]
public class AdminSubstackController(
    AppDbContext db,
    ISubstackCookieProtector protector,
    ISubstackPoster poster) : ControllerBase
{
    /// <summary>Get current settings (cookie never returned).</summary>
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// Update settings. Cookie is optional — only overwritten if a non-
    /// empty value is supplied. Setting the cookie resets the failure
    /// counter on the assumption that the admin is intervening to fix
    /// whatever broke.
    /// </summary>
    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSubstackSettingsRequest req, CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);

        s.Active     = req.Active;
        s.TimeZoneId = req.TimeZoneId.Trim();

        if (!string.IsNullOrWhiteSpace(req.Cookie))
        {
            try
            {
                s.CookieEncrypted = protector.Protect(req.Cookie.Trim());
            }
            catch (InvalidOperationException ex)
            {
                // Most common case: Substack:EncryptionKey not configured.
                // Surface the exact message from the protector so the admin
                // can act on it without grepping logs.
                return StatusCode(503, new { error = ex.Message });
            }
            s.ConsecutiveFailures = 0;
            s.LastFailureMessage = null;
        }

        s.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(s));
    }

    /// <summary>
    /// One-shot smoke test. Decrypts the stored cookie, sends a
    /// hardcoded test note to Substack, and returns the full outcome so
    /// the admin can verify auth before turning on Active. Does NOT
    /// touch settings on failure — the test is read-only against
    /// state, the only side effect is whatever Substack records.
    /// </summary>
    [HttpPost("test-post")]
    public async Task<IActionResult> TestPost(CancellationToken ct)
    {
        var s = await GetOrCreateSettingsAsync(ct);
        if (string.IsNullOrWhiteSpace(s.CookieEncrypted))
            return BadRequest(new { error = "No Substack cookie has been saved yet. Paste one in Settings first." });

        string cookie;
        try
        {
            cookie = protector.Unprotect(s.CookieEncrypted);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Stored cookie could not be decrypted ({ex.Message}). Re-paste it in Settings." });
        }

        var body = $"Test post from Creator Companion — {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}Z. " +
                   $"If you see this on your Substack Notes feed, auth is working. " +
                   $"If you don't, the request shape needs updating in phase 2.";

        var result = await poster.PostNoteAsync(cookie, body, ct);

        return Ok(new SubstackTestPostResponse(
            result.Success,
            result.StatusCode,
            result.NoteId,
            result.ErrorMessage,
            result.RawResponse
        ));
    }

    private async Task<SubstackSettings> GetOrCreateSettingsAsync(CancellationToken ct)
    {
        var s = await db.SubstackSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;

        s = new SubstackSettings();
        db.SubstackSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    private static SubstackSettingsResponse Map(SubstackSettings s) => new(
        Active:              s.Active,
        TimeZoneId:          s.TimeZoneId,
        CookieIsSet:         !string.IsNullOrEmpty(s.CookieEncrypted),
        LastSuccessAt:       s.LastSuccessAt,
        LastFailureAt:       s.LastFailureAt,
        LastFailureMessage:  s.LastFailureMessage,
        ConsecutiveFailures: s.ConsecutiveFailures,
        UpdatedAt:           s.UpdatedAt
    );
}
