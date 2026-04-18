using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record TagResponse(
    Guid Id,
    string Name,
    string? Color,
    int UsageCount
);

public record CreateTagRequest(
    [Required, MaxLength(50)] string Name
);

public record RenameTagRequest(
    [Required, MaxLength(50)] string Name
);
