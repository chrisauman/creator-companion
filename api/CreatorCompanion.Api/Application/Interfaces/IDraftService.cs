using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IDraftService
{
    Task<DraftResponse> UpsertAsync(Guid userId, UpsertDraftRequest request);
    Task<DraftResponse?> GetAsync(Guid userId, Guid journalId, DateOnly entryDate);
    Task DiscardAsync(Guid userId, Guid journalId, DateOnly entryDate);
}
