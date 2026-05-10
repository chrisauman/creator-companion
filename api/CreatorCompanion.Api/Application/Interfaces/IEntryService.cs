using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IEntryService
{
    Task<EntryResponse> CreateAsync(Guid userId, CreateEntryRequest request);
    Task<EntryResponse> UpdateAsync(Guid userId, Guid entryId, UpdateEntryRequest request);
    Task<EntryResponse> GetByIdAsync(Guid userId, Guid entryId);
    Task<List<EntryListItem>> GetListAsync(Guid userId, Guid? journalId, bool includeDeleted = false, string? tagName = null, int? skip = null, int? take = null);
    Task SoftDeleteAsync(Guid userId, Guid entryId);
    Task RecoverAsync(Guid userId, Guid entryId);
    Task<bool> ToggleFavoriteAsync(Guid userId, Guid entryId);
    Task<StreakResponse> GetStreakAsync(Guid userId);
    Task HardDeleteAsync(Guid userId, Guid entryId);

    /// <summary>
    /// Hard-deletes every soft-deleted entry older than the 48h
    /// recovery window, removing media from storage in the process.
    /// Called by ReminderBackgroundService on every tick.
    /// </summary>
    Task<int> PurgeExpiredTrashAsync(CancellationToken ct = default);
}
