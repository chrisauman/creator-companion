using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record FaqResponse(
    Guid     Id,
    string   Question,
    string   Answer,
    string   Category,
    int      SortOrder,
    bool     IsPublished,
    bool     IsFeaturedOnHomepage,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateFaqRequest(
    [Required, MaxLength(500)] string Question,
    [Required]                 string Answer,
    [MaxLength(80)] string Category = "General",
    bool IsPublished = true,
    bool IsFeaturedOnHomepage = false
);

public record UpdateFaqRequest(
    [Required, MaxLength(500)] string Question,
    [Required]                 string Answer,
    [MaxLength(80)] string Category = "General",
    bool IsPublished = true,
    bool IsFeaturedOnHomepage = false
);

public record ReorderFaqRequest(
    [Required] List<Guid> Ids
);
