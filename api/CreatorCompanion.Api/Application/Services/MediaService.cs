using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class MediaService(
    AppDbContext db,
    IStorageService storage,
    IEntitlementService entitlements) : IMediaService
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    };

    private const long MaxFileSizeBytes = 20 * 1024 * 1024; // 20 MB

    public async Task<MediaSummary> UploadAsync(Guid userId, Guid entryId, IFormFile file)
    {
        if (!AllowedTypes.Contains(file.ContentType))
            throw new InvalidOperationException(
                "File type not allowed. Accepted: JPEG, PNG, WEBP, HEIC.");

        if (file.Length > MaxFileSizeBytes)
            throw new InvalidOperationException("File exceeds the 20 MB size limit.");

        var entry = await db.Entries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt == null)
            ?? throw new InvalidOperationException("Entry not found.");

        var user = await db.Users.FindAsync(userId)!;
        await entitlements.EnforceImageLimitAsync(user!, entryId);

        string storagePath;
        await using (var stream = file.OpenReadStream())
            storagePath = await storage.SaveAsync(stream, file.FileName, file.ContentType);

        var media = new EntryMedia
        {
            EntryId = entryId,
            UserId = userId,
            FileName = file.FileName,
            ContentType = file.ContentType,
            FileSizeBytes = file.Length,
            StoragePath = storagePath
        };

        db.EntryMedia.Add(media);
        await db.SaveChangesAsync();

        return new MediaSummary(media.Id, media.FileName, media.ContentType,
            media.FileSizeBytes, media.TakenAt, storage.GetUrl(media.StoragePath));
    }

    public async Task DeleteAsync(Guid userId, Guid mediaId)
    {
        var media = await db.EntryMedia
            .FirstOrDefaultAsync(m => m.Id == mediaId && m.UserId == userId && m.DeletedAt == null)
            ?? throw new InvalidOperationException("Media not found.");

        media.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Best-effort storage cleanup — don't fail if file is already gone
        try { await storage.DeleteAsync(media.StoragePath); }
        catch { /* logged by caller */ }
    }
}
