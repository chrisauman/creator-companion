using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record CreateJournalRequest(
    [Required, MinLength(1), MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

public record UpdateJournalRequest(
    [Required, MinLength(1), MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

public record JournalResponse(
    Guid Id,
    string Name,
    string? Description,
    bool IsDefault,
    DateTime CreatedAt,
    int EntryCount
);
