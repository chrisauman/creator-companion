using System.Security.Claims;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/media")]
[Authorize]
public class MediaController(IMediaService mediaService, IWebHostEnvironment env) : ControllerBase
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
