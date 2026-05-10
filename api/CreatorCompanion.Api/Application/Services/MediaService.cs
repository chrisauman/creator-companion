using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class MediaService(
    AppDbContext db,
    IStorageService storage,
    IEntitlementService entitlements,
    IImageProcessor imageProcessor) : IMediaService
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    };

    /// <summary>Upload cap (raw, before compression). 15 MB covers
    /// just about any phone camera; ImageSharp downscales and
    /// re-encodes everything we can decode, so the bytes that
    /// actually hit storage are typically far smaller.</summary>
    private const long MaxFileSizeBytes = 15 * 1024 * 1024;

    /// <summary>Longest dimension photos are resized to. 2048px is
    /// plenty for a journaling app's photo gallery and keeps stored
    /// files in the 200–800 KB range after JPEG re-encoding.</summary>
    private const int  MaxLongestSidePx  = 2048;

    public async Task<MediaSummary> UploadAsync(Guid userId, Guid entryId, IFormFile file)
    {
        if (!AllowedTypes.Contains(file.ContentType))
            throw new InvalidOperationException(
                "File type not allowed. Accepted: JPEG, PNG, WEBP, HEIC.");

        if (file.Length > MaxFileSizeBytes)
            throw new InvalidOperationException("File exceeds the 15 MB size limit.");

        var entry = await db.Entries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt == null)
            ?? throw new InvalidOperationException("Entry not found.");

        var user = await db.Users.FindAsync(userId)!;

        // Per-entry advisory lock so two concurrent uploads to the
        // same entry can't both pass EnforceImageLimitAsync's COUNT
        // and exceed the per-entry image cap. The xact lock is released
        // automatically when the transaction commits/rolls back below.
        await using var tx = await db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable);

        var lockKey = unchecked((long)entryId.GetHashCode()) ^ 0x6D656469610000L; // "media"
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock({lockKey})");

        await entitlements.EnforceImageLimitAsync(user!, entryId);

        string storagePath;
        long   storedBytes;
        string storedContentType = file.ContentType;
        string storedFileName    = file.FileName;

        if (imageProcessor.CanProcess(file.ContentType))
        {
            // Decode → auto-orient → resize → re-encode as JPEG. This
            // keeps stored files small no matter what the camera
            // produced. HEIC inputs skip this branch and go through
            // as-is (browsers usually send JPEG anyway).
            await using var source = file.OpenReadStream();
            var (processed, processedType) =
                await imageProcessor.ProcessAsync(source, MaxLongestSidePx);
            await using (processed)
            {
                storedContentType = processedType;
                storedFileName    = Path.ChangeExtension(file.FileName, ".jpg");
                storedBytes       = processed.Length;
                storagePath       = await storage.SaveAsync(processed, storedFileName, processedType);
            }
        }
        else
        {
            await using var stream = file.OpenReadStream();
            storagePath = await storage.SaveAsync(stream, file.FileName, file.ContentType);
            storedBytes = file.Length;
        }

        var media = new EntryMedia
        {
            EntryId       = entryId,
            UserId        = userId,
            FileName      = storedFileName,
            ContentType   = storedContentType,
            FileSizeBytes = storedBytes,
            StoragePath   = storagePath
        };

        db.EntryMedia.Add(media);
        await db.SaveChangesAsync();
        await tx.CommitAsync();

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
