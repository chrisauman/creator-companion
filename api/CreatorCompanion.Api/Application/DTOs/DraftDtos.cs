using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record UpsertDraftRequest(
    [Required] Guid JournalId,
    [Required] DateOnly EntryDate,
    [Required] string ContentText,
    string? Metadata
);

public record DraftResponse(
    Guid Id,
    Guid JournalId,
    DateOnly EntryDate,
    string ContentText,
    string Metadata,
    DateTime UpdatedAt
);
