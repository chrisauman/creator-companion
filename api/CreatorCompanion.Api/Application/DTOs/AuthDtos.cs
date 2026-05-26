using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using CreatorCompanion.Api.Application.Validation;

namespace CreatorCompanion.Api.Application.DTOs;

public record RegisterRequest(
    [Required, MinLength(1), MaxLength(60)] string FirstName,
    [Required, MinLength(1), MaxLength(60)] string LastName,
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(128), StrongPassword] string Password,
    [Required, MaxLength(100)] string TimeZoneId
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password
);

public record RefreshRequest(
    [Required] string RefreshToken
);

// [JsonIgnore] on RefreshToken means the value is set internally by
// AuthService (so the controller can read it to set the HttpOnly
// cookie) but never serialized into the JSON response body. Prior to
// this the value also rode the response body as a localStorage
// fallback; that path was removed from the frontend, but the value
// kept travelling over the wire until this change. Cookie-only is
// the documented posture (CLAUDE.md: "never returned to JS"); this
// change brings the wire format in line with the documented contract.
public record AuthResponse(
    string AccessToken,
    [property: JsonIgnore] string RefreshToken,
    DateTime ExpiresAt,
    UserSummary User
);

public record ForgotPasswordRequest(
    [Required, EmailAddress] string Email
);

public record ResetPasswordRequest(
    [Required] string Token,
    [Required, MaxLength(128), StrongPassword] string NewPassword
);

public record UserSummary(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    string Tier,
    string TimeZoneId,
    bool OnboardingCompleted,
    string? ProfileImageUrl
);
