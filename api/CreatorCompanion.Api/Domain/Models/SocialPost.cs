using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// An ad-hoc post the admin composes by hand (not the daily spark).
/// Fans out to one or more platforms; each fan-out leg is a
/// <see cref="SocialPostTarget"/> child with its own independent status,
/// because one platform can succeed while another fails. The parent row
/// holds the shared content; targets hold per-platform outcomes.
///
/// Scheduling: <see cref="ScheduledFor"/> null = publish on the next
/// worker tick (i.e. "now"); a future UTC value = publish at/after that
/// time. The same worker that drives the daily spark drains due ad-hoc
/// targets, so the firing path is shared.
/// </summary>
public class SocialPost
{
    public int Id { get; set; }

    /// <summary>The body text the admin wrote. Required.</summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>
    /// Append auto-generated hashtags to this post's body at publish
    /// time (per-platform char budget permitting). Per-post so the admin
    /// can opt a specific post out.
    /// </summary>
    public bool IncludeHashtags { get; set; } = true;

    /// <summary>
    /// When true AND no image is attached, render a branded quote card
    /// from <see cref="Body"/> and post that as the image. Ignored when an
    /// image was uploaded (the admin's own media wins).
    /// </summary>
    public bool GenerateQuoteCard { get; set; } = false;

    /// <summary>
    /// Storage object key for an optional attached image (R2 in prod,
    /// local FS in dev). Null = text-only post. Video is out of scope for
    /// v1 (text + image only). The image is uploaded through the existing
    /// MediaService/IStorageService path and re-fetched at publish time
    /// for each platform's media-upload endpoint.
    /// </summary>
    public string? ImageObjectKey { get; set; }

    /// <summary>MIME type of the attached image, e.g. "image/jpeg". Null when no image.</summary>
    public string? ImageContentType { get; set; }

    /// <summary>
    /// Null = publish ASAP (next worker tick). Future UTC = scheduled.
    /// </summary>
    public DateTime? ScheduledFor { get; set; }

    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<SocialPostTarget> Targets { get; set; } = new List<SocialPostTarget>();
}

/// <summary>
/// One platform leg of an ad-hoc <see cref="SocialPost"/>. Carries the
/// independent publish status + outcome for that platform so a partial
/// failure (e.g. Mastodon posted, Bluesky 5xx'd) is represented exactly.
/// </summary>
public class SocialPostTarget
{
    public int Id { get; set; }

    public int SocialPostId { get; set; }
    public SocialPost? SocialPost { get; set; }

    public SocialPlatform Platform { get; set; }

    public SocialPostStatus Status { get; set; } = SocialPostStatus.Pending;

    public DateTime? PostedAt { get; set; }
    public string? PostedText { get; set; }
    public string? PostedUrl { get; set; }
    public string? ErrorMessage { get; set; }
}
