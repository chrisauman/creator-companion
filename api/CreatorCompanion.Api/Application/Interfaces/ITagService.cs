using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface ITagService
{
    /// <summary>Returns all tags for the user, ordered by name, with usage counts.</summary>
    Task<List<TagResponse>> GetUserTagsAsync(Guid userId);

    /// <summary>Creates a standalone tag in the user's library (no entry association).</summary>
    Task<TagResponse> CreateAsync(Guid userId, string name);

    /// <summary>Renames a tag (updates all entries that use it automatically).</summary>
    Task<TagResponse> RenameAsync(Guid userId, Guid tagId, string newName);

    /// <summary>Deletes a tag and removes it from all entries.</summary>
    Task DeleteAsync(Guid userId, Guid tagId);

    /// <summary>
    /// Replaces the full tag set on an entry. Creates missing tags, enforces the per-entry limit.
    /// Returns the normalized tag names that were applied.
    /// </summary>
    Task<List<string>> SetEntryTagsAsync(Guid userId, Guid entryId, List<string> tagNames, int maxTags);

    /// <summary>Returns the normalized tag names currently on an entry.</summary>
    Task<List<string>> GetEntryTagNamesAsync(Guid entryId);
}
