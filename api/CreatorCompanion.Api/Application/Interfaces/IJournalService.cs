using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IJournalService
{
    Task<List<JournalResponse>> GetAllAsync(Guid userId);
    Task<JournalResponse> GetByIdAsync(Guid userId, Guid journalId);
    Task<JournalResponse> CreateAsync(Guid userId, CreateJournalRequest request);
    Task<JournalResponse> UpdateAsync(Guid userId, Guid journalId, UpdateJournalRequest request);
    Task DeleteAsync(Guid userId, Guid journalId);
}
