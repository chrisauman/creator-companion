using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Tag CRUD on top of encrypted Tag.Name. Lookup-by-name is done
/// against the deterministic NameHash column (not the encrypted
/// blob, which has random nonces and can't be uniqued). Display
/// always goes through DecryptString. Legacy plaintext Name rows
/// from before the May 2026 migration are decrypted transparently
/// (DecryptString returns as-is when not prefixed).
/// </summary>
public class TagService(AppDbContext db, IEntryEncryptor encryptor) : ITagService
{
    // Domain string for the per-purpose deterministic hash so a tag
    // name and an entry title that happen to be the same plaintext
    // produce different hashes.
    private const string HashDomain = "tag:name";

    public async Task<List<TagResponse>> GetUserTagsAsync(Guid userId)
    {
        var rows = await db.Tags
            .Where(t => t.UserId == userId)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Color,
                UsageCount = t.EntryTags.Count
            })
            .ToListAsync();

        // Decrypt + sort by plaintext name in-memory. Sort can't run
        // server-side on an encrypted column, but tag counts per user
        // are tiny (<50 typical) so this is fine.
        return rows
            .Select(t => new TagResponse(
                t.Id,
                encryptor.DecryptString(t.Name),
                t.Color,
                t.UsageCount))
            .OrderBy(t => t.Name, StringComparer.Ordinal)
            .ToList();
    }

    public async Task<TagResponse> CreateAsync(Guid userId, string name)
    {
        var normalized = Normalize(name);
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("Tag name cannot be empty.");

        var hash = encryptor.DeterministicHash(normalized, HashDomain);
        var exists = await db.Tags.AnyAsync(t => t.UserId == userId && t.NameHash == hash);
        if (exists)
            throw new InvalidOperationException($"You already have a tag named \"{normalized}\".");

        var tag = new Tag
        {
            UserId = userId,
            Name = encryptor.EncryptString(normalized),
            NameHash = hash
        };
        db.Tags.Add(tag);
        await db.SaveChangesAsync();

        return new TagResponse(tag.Id, normalized, tag.Color, 0);
    }

    public async Task<TagResponse> RenameAsync(Guid userId, Guid tagId, string newName)
    {
        var tag = await db.Tags
            .FirstOrDefaultAsync(t => t.Id == tagId && t.UserId == userId)
            ?? throw new InvalidOperationException("Tag not found.");

        var normalized = Normalize(newName);
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("Tag name cannot be empty.");

        var newHash = encryptor.DeterministicHash(normalized, HashDomain);
        var conflict = await db.Tags
            .AnyAsync(t => t.UserId == userId && t.NameHash == newHash && t.Id != tagId);
        if (conflict)
            throw new InvalidOperationException($"You already have a tag named \"{normalized}\".");

        tag.Name = encryptor.EncryptString(normalized);
        tag.NameHash = newHash;
        await db.SaveChangesAsync();

        var usageCount = await db.EntryTags.CountAsync(et => et.TagId == tagId);
        return new TagResponse(tag.Id, normalized, tag.Color, usageCount);
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
        var normalized = tagNames
            .Select(Normalize)
            .Where(n => !string.IsNullOrEmpty(n))
            .Distinct()
            .ToList();

        if (normalized.Count > maxTags)
            throw new InvalidOperationException(
                $"You can add up to {maxTags} tags per entry on your current plan.");

        // Hash each plaintext to find existing tags. Hash lookup is
        // server-side and fast (unique index on (UserId, NameHash)).
        var hashes = normalized
            .Select(n => encryptor.DeterministicHash(n, HashDomain))
            .ToList();

        var existingTags = await db.Tags
            .Where(t => t.UserId == userId && hashes.Contains(t.NameHash))
            .ToListAsync();
        var existingHashSet = existingTags.Select(t => t.NameHash).ToHashSet();

        // Create new tags for any plaintext that doesn't have a
        // matching hash row yet.
        for (var i = 0; i < normalized.Count; i++)
        {
            if (existingHashSet.Contains(hashes[i])) continue;
            var newTag = new Tag
            {
                UserId = userId,
                Name = encryptor.EncryptString(normalized[i]),
                NameHash = hashes[i]
            };
            db.Tags.Add(newTag);
            existingTags.Add(newTag);
        }

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
        // Pull encrypted names from DB, decrypt + sort client-side.
        var encryptedNames = await db.EntryTags
            .Where(et => et.EntryId == entryId)
            .Select(et => et.Tag.Name)
            .ToListAsync();

        return encryptedNames
            .Select(n => encryptor.DecryptString(n))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Lowercase, strip spaces.</summary>
    private static string Normalize(string name) =>
        name.Trim().ToLowerInvariant().Replace(" ", "");
}
