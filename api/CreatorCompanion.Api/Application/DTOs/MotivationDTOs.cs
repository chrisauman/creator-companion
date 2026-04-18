using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record MotivationEntryResponse(
    Guid   Id,
    string Title,
    string Takeaway,
    string FullContent,
    string Category,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateMotivationRequest(
    [Required, MaxLength(200)]  string Title,
    [Required, MaxLength(500)]  string Takeaway,
    [Required]                  string FullContent,
    [Required]                  string Category     // "Encouragement" | "BestPractice" | "Quote"
);

public record UpdateMotivationRequest(
    [Required, MaxLength(200)]  string Title,
    [Required, MaxLength(500)]  string Takeaway,
    [Required]                  string FullContent,
    [Required]                  string Category
);

public record UpdateMotivationPreferenceRequest(
    bool Show
);
