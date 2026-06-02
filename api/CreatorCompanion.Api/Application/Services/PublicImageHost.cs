using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Stages an image at a publicly reachable URL so Meta's APIs (Threads +
/// Instagram) can fetch it — they only accept an `image_url`, never a
/// binary upload. Stores the bytes via IStorageService and maps an
/// unguessable GUID to the storage key (SocialCardAsset), then returns the
/// public `/v1/public/social-card/{id}.png` URL served by
/// SocialPublicCardController.
/// </summary>
public interface IPublicImageHost
{
    /// <summary>
    /// Stores the image and returns a public https URL Meta can fetch, or
    /// null if hosting failed (caller then skips URL-only platforms).
    /// </summary>
    Task<string?> PublishAsync(byte[] bytes, string contentType, CancellationToken ct);
}

public class PublicImageHost(
    IStorageService storage,
    AppDbContext db,
    IConfiguration config,
    ILogger<PublicImageHost> log) : IPublicImageHost
{
    // The app domain proxies /v1/* to the Railway API and has a valid TLS
    // cert, so it's the most reliable public base for an external fetcher.
    private readonly string _baseUrl =
        (config["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com").TrimEnd('/');

    public async Task<string?> PublishAsync(byte[] bytes, string contentType, CancellationToken ct)
    {
        if (bytes is null || bytes.Length == 0) return null;
        try
        {
            var ext = contentType.Contains("png", StringComparison.OrdinalIgnoreCase) ? "png"
                    : contentType.Contains("jpeg", StringComparison.OrdinalIgnoreCase) ? "jpg"
                    : "img";
            using var ms = new MemoryStream(bytes);
            var key = await storage.SaveAsync(ms, $"social-card.{ext}", contentType);

            var asset = new SocialCardAsset { StorageKey = key, ContentType = contentType };
            db.SocialCardAssets.Add(asset);
            await db.SaveChangesAsync(ct);

            // Always end in .png so platform validators that sniff the URL
            // extension are satisfied; the controller serves the real type.
            return $"{_baseUrl}/v1/public/social-card/{asset.Id}.png";
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Failed to stage public card image.");
            return null;
        }
    }
}
