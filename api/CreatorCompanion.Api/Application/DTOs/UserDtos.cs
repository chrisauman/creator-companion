using System.ComponentModel.DataAnnotations;
using CreatorCompanion.Api.Application.Validation;

namespace CreatorCompanion.Api.Application.DTOs;

public record UpdateTimezoneRequest(
    [Required, MaxLength(100)] string TimeZoneId
);

public record CompleteOnboardingRequest(
    bool Completed = true
);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MaxLength(100), StrongPassword] string NewPassword
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
    bool ShowMotivation,
    bool ShowActionItems,
    string? ProfileImageUrl
);

// ── Action Items ────────────────────────────────────────────────────────────

public record ActionItemResponse(
    int Id,
    string Text,
    int SortOrder,
    bool IsCompleted,
    DateTime? CompletedAt,
    DateTime CreatedAt
);

public record CreateActionItemRequest(
    [Required, MaxLength(150)] string Text
);

public record UpdateActionItemRequest(
    [Required, MaxLength(150)] string Text
);

public record ReorderActionItemsRequest(
    [Required] List<int> Ids
);

public record AdminUpdateUserRequest(
    [Required, MinLength(3), MaxLength(50)] string Username,
    [Required, EmailAddress, MaxLength(256)] string Email,
    [MaxLength(100), StrongPassword] string? NewPassword,
    [Required] string Tier,
    [Required, MaxLength(100)] string TimeZoneId,
    bool IsAdmin,
    bool IsActive,
    bool OnboardingCompleted,
    DateTime? TrialEndsAt
);
