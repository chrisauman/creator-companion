using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

/// <summary>
/// Settings shape returned to the admin UI. CookieIsSet is a boolean
/// stand-in — the real value never leaves the server, so the UI can
/// only see "we have one" / "we don't" and let the admin overwrite.
/// </summary>
public record SubstackSettingsResponse(
    bool      Active,
    string    TimeZoneId,
    bool      CookieIsSet,
    DateTime? LastSuccessAt,
    DateTime? LastFailureAt,
    string?   LastFailureMessage,
    int       ConsecutiveFailures,
    DateTime  UpdatedAt
);

/// <summary>
/// Update payload. Cookie is optional — sending null/empty leaves the
/// existing stored value untouched (so the admin can change timezone
/// or active without re-pasting). Sending a non-empty value overwrites
/// the encrypted cookie and resets ConsecutiveFailures.
/// </summary>
public record UpdateSubstackSettingsRequest(
    bool   Active,
    [Required, MaxLength(80)] string TimeZoneId,
    string? Cookie
);

/// <summary>
/// Outcome of POST /v1/admin/substack/test-post. Mirrors
/// SubstackPostResult but with admin-friendly framing.
/// </summary>
public record SubstackTestPostResponse(
    bool    Success,
    int?    StatusCode,
    string? NoteId,
    string? ErrorMessage,
    string? RawResponse
);
