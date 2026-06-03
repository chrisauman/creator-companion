namespace CreatorCompanion.Api.Application.DTOs;

/// <summary>
/// One line in the daily Marketing summary email — the outcome of a
/// single platform's daily-spark post. Kept platform-agnostic (string
/// names, no entity refs) so the email layer never depends on Domain.
/// </summary>
public record SocialSummaryLine(
    string  Platform,
    string  Status,     // "Posted" | "Failed"
    string? Excerpt,    // what was published (or the spark takeaway)
    string? Url,        // permalink on success
    string? Error       // message on failure
);

// ── Admin Marketing API shapes ──────────────────────────────────────

/// <summary>One connected (or connectable) platform's config + health.</summary>
public record SocialAccountResponse(
    string    Platform,
    bool      Enabled,
    string?   Handle,
    string?   Endpoint,
    bool      HasCredentials,
    int       PostHourLocal,
    int       PostMinuteLocal,
    int       JitterMinutes,
    int       CharacterLimit,
    bool      SupportsImages,
    DateTime? LastSuccessAt,
    DateTime? LastFailureAt,
    string?   LastFailureMessage,
    int       ConsecutiveFailures
);

public record SocialSettingsResponse(
    bool AutoPostEnabled,
    bool AutoHashtagsEnabled,
    bool DailyQuoteCardsEnabled,
    bool HashtagsAvailable,
    bool QuoteCardsAvailable,
    IReadOnlyList<SocialAccountResponse> Accounts
);

public record UpdateSocialSettingsRequest(
    bool AutoPostEnabled,
    bool AutoHashtagsEnabled,
    bool DailyQuoteCardsEnabled
);

/// <summary>
/// Connect/update one platform. Credential fields are optional: a
/// blank/absent value LEAVES the stored credential untouched (so the
/// admin can edit the schedule without re-pasting secrets). Send the
/// relevant field per platform — AppPassword for Bluesky, AccessToken
/// for Mastodon.
/// </summary>
public record UpdateSocialAccountRequest(
    bool    Enabled,
    string? Handle,
    string? Endpoint,
    string? AppPassword,
    string? AccessToken,
    int     PostHourLocal,
    int     PostMinuteLocal,
    int     JitterMinutes,
    // YouTube only: OAuth client + long-lived refresh token. Blank = keep
    // the stored credential (same convention as AppPassword/AccessToken).
    string? ClientId = null,
    string? ClientSecret = null,
    string? RefreshToken = null
);

public record SocialPlanResponse(
    int       Id,
    DateOnly  Date,
    string    Platform,
    DateTime  ScheduledFor,
    string    Status,
    DateTime? PostedAt,
    string?   PostedText,
    string?   PostedUrl,
    string?   ErrorMessage,
    Guid      SparkId,
    string    SparkTakeaway
);

public record SocialEligibleCount(string Platform, int Count);

public record FireNowResponse(
    string  Platform,
    bool    Success,
    string? Url,
    string? ExternalId,
    string? Error
);

public record AdHocTargetResponse(
    string    Platform,
    string    Status,
    string?   PostedUrl,
    string?   ErrorMessage,
    DateTime? PostedAt
);

public record AdHocPostResponse(
    int       Id,
    string    Body,
    bool      IncludeHashtags,
    string?   ImageUrl,
    DateTime? ScheduledFor,
    DateTime  CreatedAt,
    IReadOnlyList<AdHocTargetResponse> Targets
);

/// <summary>
/// Multipart form for composing an ad-hoc post. Class (not record) for
/// reliable <c>[FromForm]</c> binding with an IFormFile. Platforms is the
/// set of target platform names; empty = no targets (rejected).
/// </summary>
public class CreateAdHocPostForm
{
    public string Body { get; set; } = string.Empty;
    public bool IncludeHashtags { get; set; } = true;
    /// <summary>When true and no Image is uploaded, render a branded quote card from Body.</summary>
    public bool GenerateQuoteCard { get; set; } = false;
    public List<string> Platforms { get; set; } = new();
    /// <summary>Null/absent = publish now; future UTC = scheduled.</summary>
    public DateTime? ScheduledFor { get; set; }
    public IFormFile? Image { get; set; }
}
