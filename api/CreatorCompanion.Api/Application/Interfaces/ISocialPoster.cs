using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// What to publish. Text is already truncated-to-fit + hashtag-appended
/// by the posting service — adapters publish it verbatim.
///
/// The image is provided two ways so each adapter uses what its API wants:
///   - <see cref="ImageBytes"/>: raw bytes for direct/multipart upload
///     (Bluesky, Mastodon, Facebook).
///   - <see cref="ImageUrl"/>: a publicly reachable URL of the same image
///     (REQUIRED by Threads + Instagram, which don't accept binary upload).
/// Both are null for a text-only post; adapters that don't support images
/// ignore them.
/// </summary>
public record SocialPublishRequest(
    string  Text,
    byte[]? ImageBytes,
    string? ImageContentType,
    string? ImageAltText,
    string? ImageUrl = null,
    // Video platforms (YouTube) carry the rendered MP4 here instead of an
    // image. The posting service renders the daily themed Short and supplies
    // the bytes + a short title; image fields are null for these posts.
    byte[]? VideoBytes = null,
    string? VideoContentType = null,
    string? VideoTitle = null
);

/// <summary>
/// Outcome of one publish attempt. PostedUrl is the public permalink
/// when the platform returns/derives one (for the summary email +
/// History). ExternalId is the platform's own id (at-uri rkey, status
/// id) for debugging. On failure, ErrorMessage is admin-readable.
/// </summary>
public record SocialPublishResult(
    bool    Success,
    string? PostedUrl,
    string? ExternalId,
    string? ErrorMessage,
    int?    StatusCode
);

/// <summary>
/// One social platform's publishing adapter. Implementations are
/// registered as <c>ISocialPoster</c> (one per platform); the posting
/// service resolves the right one via <see cref="Platform"/>. Each
/// adapter owns its auth, character limit, media support, and permalink
/// shape so adding a platform is purely "write a new adapter + append
/// the enum member" with no churn to the core pipeline.
/// </summary>
public interface ISocialPoster
{
    SocialPlatform Platform { get; }

    /// <summary>
    /// Hard character budget the posting service truncates text to
    /// (reserving room for hashtags). Approximated as .NET string length;
    /// platforms that count graphemes differently are close enough that
    /// a small safety margin in the service covers the gap.
    /// </summary>
    int CharacterLimit { get; }

    bool SupportsImages { get; }

    /// <summary>
    /// True if this platform needs the image as a public URL
    /// (<see cref="SocialPublishRequest.ImageUrl"/>) rather than raw bytes —
    /// Threads + Instagram. The posting service stages the card publicly only
    /// when at least one target needs it. Defaults to false (Bluesky/Mastodon
    /// upload bytes directly).
    /// </summary>
    bool RequiresImageUrl => false;

    /// <summary>
    /// True for video platforms (YouTube): the posting service renders the
    /// daily themed Short and passes it as <see cref="SocialPublishRequest.VideoBytes"/>
    /// instead of rendering a quote-card image. Defaults to false.
    /// </summary>
    bool IsVideo => false;

    /// <summary>
    /// Publishes one post for the given (already-connected) account.
    /// Never throws for an expected API failure — returns Success=false
    /// with a populated ErrorMessage so the caller records it on the plan
    /// row. May throw only on genuinely unexpected faults, which the
    /// caller's try/catch converts to a Failed status.
    /// </summary>
    Task<SocialPublishResult> PublishAsync(
        SocialAccount account,
        SocialPublishRequest request,
        CancellationToken ct);
}
