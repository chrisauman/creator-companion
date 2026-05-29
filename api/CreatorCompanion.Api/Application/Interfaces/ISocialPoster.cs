using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// What to publish. Text is already truncated-to-fit + hashtag-appended
/// by the posting service — adapters publish it verbatim. ImageBytes is
/// the decrypted raw image (null for text-only); adapters that don't
/// support images ignore it.
/// </summary>
public record SocialPublishRequest(
    string  Text,
    byte[]? ImageBytes,
    string? ImageContentType,
    string? ImageAltText
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
