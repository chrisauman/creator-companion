using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record DailyPromptResponse(
    Guid     Id,
    string   Text,
    int      SortOrder,
    bool     IsPublished,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateDailyPromptRequest(
    [Required, MaxLength(500)] string Text,
    bool IsPublished = true
);

public record UpdateDailyPromptRequest(
    [Required, MaxLength(500)] string Text,
    bool IsPublished = true
);

public record ReorderDailyPromptsRequest(
    [Required] List<Guid> Ids
);
