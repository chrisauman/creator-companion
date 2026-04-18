using System.ComponentModel.DataAnnotations;
using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Application.DTOs;

public record CreatePauseRequest(
    [Required] DateOnly StartDate,
    DateOnly? EndDate,
    [MaxLength(200)] string? Reason
);

public record PauseResponse(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    PauseStatus Status,
    string? Reason,
    DateTime CreatedAt
);
