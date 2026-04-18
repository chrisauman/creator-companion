using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record RegisterRequest(
    [Required, MinLength(3), MaxLength(50)] string Username,
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MinLength(8), MaxLength(128)] string Password,
    [Required, MaxLength(100)] string TimeZoneId
);

public record LoginRequest(
    [Required] string EmailOrUsername,
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
    [Required, MinLength(8), MaxLength(128)] string NewPassword
);

public record UserSummary(
    Guid Id,
    string Username,
    string Email,
    string Tier,
    string TimeZoneId,
    bool OnboardingCompleted
);
