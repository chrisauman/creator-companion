using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record FaqResponse(
    Guid     Id,
    string   Question,
    string   Answer,
    int      SortOrder,
    bool     IsPublished,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateFaqRequest(
    [Required, MaxLength(500)] string Question,
    [Required]                 string Answer,
    bool IsPublished = true
);

public record UpdateFaqRequest(
    [Required, MaxLength(500)] string Question,
    [Required]                 string Answer,
    bool IsPublished = true
);

public record ReorderFaqRequest(
    [Required] List<Guid> Ids
);
