using System.Security.Claims;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/media")]
[Authorize]
public class MediaController(
    IMediaService mediaService,
    IWebHostEnvironment env,
    AppDbContext db,
    IStorageService storage,
    IEntryEncryptor encryptor,
    IMediaUrlSigner urlSigner) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpPost("entries/{entryId:guid}")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<IActionResult> Upload(Guid entryId, IFormFile file)
    {
        try
        {
            var media = await mediaService.UploadAsync(UserId, entryId, file);
            return Ok(media);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{mediaId:guid}")]
    public async Task<IActionResult> Delete(Guid mediaId)
    {
        try
        {
            await mediaService.DeleteAsync(UserId, mediaId);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Serve a decrypted image to the browser. The URL carries a
    /// short-lived HMAC token (?t=...) in lieu of a JWT bearer header,
    /// since &lt;img src&gt; requests don't include Authorization.
    /// The token binds (mediaId, userId, expiry) — see MediaUrlSigner.
    /// We fetch the ciphertext from storage, decrypt with the master
    /// key, and stream the plaintext bytes back. Legacy plaintext
    /// uploads from before the May 2026 encryption migration are
    /// passed through unchanged (the magic-byte check on the blob
    /// disambiguates encrypted from legacy).
    /// </summary>
    [HttpGet("{mediaId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Serve(Guid mediaId, [FromQuery(Name = "t")] string? token)
    {
        if (string.IsNullOrEmpty(token)) return Unauthorized();

        var (ok, signedMediaId, signedUserId) = urlSigner.ValidateToken(token);
        if (!ok || signedMediaId != mediaId) return Unauthorized();

        var media = await db.EntryMedia
            .Where(m => m.Id == mediaId && m.UserId == signedUserId && m.DeletedAt == null)
            .Select(m => new { m.StoragePath, m.ContentType, m.FileName })
            .FirstOrDefaultAsync();

        if (media is null) return NotFound();

        byte[] bytes;
        try
        {
            var raw = await storage.ReadAllBytesAsync(media.StoragePath);
            bytes = encryptor.DecryptBytes(raw); // transparent for legacy plaintext blobs
        }
        catch (Exception)
        {
            return NotFound();
        }

        // Decrypt the filename for the Content-Disposition header so
        // a "Save image as…" preserves the original name. Browsers
        // also use this for thumbnail tooltips on some platforms.
        var plainFileName = encryptor.DecryptString(media.FileName);

        Response.Headers.CacheControl = "private, max-age=86400"; // browser caches 24h
        return File(bytes, media.ContentType, plainFileName);
    }

    // Serve local files in dev — replaced by CDN/Blob URLs in production.
    // GUARDED on env.IsDevelopment(): if storage config ever flips to
    // LocalStorageService in production (mis-configured DI), an
    // [AllowAnonymous] route serving user uploads is the most
    // exposed surface in the app. Returning 404 in non-dev makes the
    // route effectively non-existent.
    [HttpGet("file/{fileName}")]
    [AllowAnonymous]
    public IActionResult ServeFile(string fileName)
    {
        if (!env.IsDevelopment()) return NotFound();

        var uploadsPath = Path.Combine(env.ContentRootPath, "uploads");
        var safeName = Path.GetFileName(fileName); // prevent path traversal
        var fullPath = Path.Combine(uploadsPath, safeName);

        if (!System.IO.File.Exists(fullPath))
            return NotFound();

        var contentType = Path.GetExtension(safeName).ToLower() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".heic" or ".heif" => "image/heic",
            _ => "application/octet-stream"
        };

        return PhysicalFile(fullPath, contentType);
    }
}
