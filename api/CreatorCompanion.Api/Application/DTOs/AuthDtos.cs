using System.ComponentModel.DataAnnotations;
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

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
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
