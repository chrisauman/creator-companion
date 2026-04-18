using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class TagService(AppDbContext db) : ITagService
{
    public async Task<List<TagResponse>> GetUserTagsAsync(Guid userId)
    {
        return await db.Tags
            .Where(t => t.UserId == userId)
            .OrderBy(t => t.Name)
            .Select(t => new TagResponse(
                t.Id,
                t.Name,
                t.Color,
                t.EntryTags.Count))
            .ToListAsync();
    }

    public async Task<TagResponse> CreateAsync(Guid userId, string name)
    {
        var normalized = Normalize(name);
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("Tag name cannot be empty.");

        var exists = await db.Tags
            .AnyAsync(t => t.UserId == userId && t.Name == normalized);
        if (exists)
            throw new InvalidOperationException($"You already have a tag named \"{normalized}\".");

        var tag = new Tag { UserId = userId, Name = normalized };
        db.Tags.Add(tag);
        await db.SaveChangesAsync();

        return new TagResponse(tag.Id, tag.Name, tag.Color, 0);
    }

    public async Task<TagResponse> RenameAsync(Guid userId, Guid tagId, string newName)
    {
        var tag = await db.Tags
            .FirstOrDefaultAsync(t => t.Id == tagId && t.UserId == userId)
            ?? throw new InvalidOperationException("Tag not found.");

        var normalized = Normalize(newName);
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("Tag name cannot be empty.");

        var conflict = await db.Tags
            .AnyAsync(t => t.UserId == userId && t.Name == normalized && t.Id != tagId);
        if (conflict)
            throw new InvalidOperationException($"You already have a tag named \"{normalized}\".");

        tag.Name = normalized;
        await db.SaveChangesAsync();

        var usageCount = await db.EntryTags.CountAsync(et => et.TagId == tagId);
        return new TagResponse(tag.Id, tag.Name, tag.Color, usageCount);
    }

    public async Task DeleteAsync(Guid userId, Guid tagId)
    {
        var tag = await db.Tags
            .FirstOrDefaultAsync(t => t.Id == tagId && t.UserId == userId)
            ?? throw new InvalidOperationException("Tag not found.");

        // EntryTags cascade-delete via FK configuration
        db.Tags.Remove(tag);
        await db.SaveChangesAsync();
    }

    public async Task<List<string>> SetEntryTagsAsync(
        Guid userId, Guid entryId, List<string> tagNames, int maxTags)
    {
        // Normalize and deduplicate
        var normalized = tagNames
            .Select(Normalize)
            .Where(n => !string.IsNullOrEmpty(n))
            .Distinct()
            .ToList();

        if (normalized.Count > maxTags)
            throw new InvalidOperationException(
                $"You can add up to {maxTags} tags per entry on your current plan.");

        // Get or create Tag records for each name
        var existingTags = await db.Tags
            .Where(t => t.UserId == userId && normalized.Contains(t.Name))
            .ToListAsync();

        var existingNames = existingTags.Select(t => t.Name).ToHashSet();

        foreach (var name in normalized.Where(n => !existingNames.Contains(n)))
        {
            var newTag = new Tag { UserId = userId, Name = name };
            db.Tags.Add(newTag);
            existingTags.Add(newTag);
        }

        // Replace all EntryTags for this entry
        var current = await db.EntryTags
            .Where(et => et.EntryId == entryId)
            .ToListAsync();
        db.EntryTags.RemoveRange(current);

        foreach (var tag in existingTags)
            db.EntryTags.Add(new EntryTag { EntryId = entryId, TagId = tag.Id });

        await db.SaveChangesAsync();
        return normalized;
    }

    public async Task<List<string>> GetEntryTagNamesAsync(Guid entryId)
    {
        return await db.EntryTags
            .Where(et => et.EntryId == entryId)
            .OrderBy(et => et.Tag.Name)
            .Select(et => et.Tag.Name)
            .ToListAsync();
    }

    /// <summary>Lowercase, strip spaces.</summary>
    private static string Normalize(string name) =>
        name.Trim().ToLowerInvariant().Replace(" ", "");
}
