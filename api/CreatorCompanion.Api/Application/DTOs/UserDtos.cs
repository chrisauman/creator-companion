using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record UpdateTimezoneRequest(
    [Required, MaxLength(100)] string TimeZoneId
);

public record CompleteOnboardingRequest(
    bool Completed = true
);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(100)] string NewPassword
);

public record UserProfileResponse(
    Guid Id,
    string Username,
    string Email,
    string Tier,
    string TimeZoneId,
    bool OnboardingCompleted,
    DateTime CreatedAt,
    DateTime? TrialEndsAt,
    bool ShowMotivation
);

public record AdminUpdateUserRequest(
    [Required, MinLength(3), MaxLength(50)] string Username,
    [Required, EmailAddress, MaxLength(256)] string Email,
    [MinLength(8), MaxLength(100)] string? NewPassword,
    [Required] string Tier,
    [Required, MaxLength(100)] string TimeZoneId,
    bool IsAdmin,
    bool IsActive,
    bool OnboardingCompleted,
    DateTime? TrialEndsAt
);
