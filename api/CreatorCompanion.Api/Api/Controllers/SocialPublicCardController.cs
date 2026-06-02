using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// PUBLIC, unauthenticated endpoint that serves a staged quote-card image
/// by its GUID. Exists solely so Meta's APIs (Threads + Instagram) can
/// fetch the card via `image_url` — they don't accept binary uploads.
///
/// Only serves images registered in SocialCardAssets (GUID → storage key),
/// so it can't be used to read arbitrary storage paths. No PII: a quote
/// card is public-by-design marketing content.
/// </summary>
[ApiController]
[Route("v1/public/social-card")]
[AllowAnonymous]
public class SocialPublicCardController(AppDbContext db, IStorageService storage) : ControllerBase
{
    // Complex segment "{id}.png" so the URL looks like an image file to any
    // platform that sniffs the extension. GUIDs contain no dots, so the
    // split is unambiguous.
    [HttpGet("{id}.png")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var asset = await db.SocialCardAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (asset is null) return NotFound();

        byte[] bytes;
        try { bytes = await storage.ReadAllBytesAsync(asset.StorageKey); }
        catch { return NotFound(); }

        Response.Headers.CacheControl = "public, max-age=86400";
        return File(bytes, asset.ContentType);
    }
}
