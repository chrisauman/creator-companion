namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// A quote-card image staged at a PUBLIC, unauthenticated URL so Meta's
/// APIs can fetch it. Threads + Instagram only accept an `image_url`
/// (no binary upload), so before posting to them we store the rendered
/// card via IStorageService and expose it at
/// <c>/v1/public/social-card/{Id}.png</c> via SocialPublicCardController.
///
/// The Id is an unguessable GUID; the row maps it to the storage key so
/// the public endpoint can only ever serve a real card (not an arbitrary
/// storage path). Rows are short-lived — purged by the worker after a day
/// (Meta fetches the URL within seconds of the publish call).
/// </summary>
public class SocialCardAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Storage key (R2 in prod, local FS in dev) of the image bytes.</summary>
    public string StorageKey { get; set; } = string.Empty;

    public string ContentType { get; set; } = "image/png";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
