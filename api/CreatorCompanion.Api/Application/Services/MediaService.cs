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

        // Magic-byte sniff. The Content-Type header is client-supplied
        // and can be spoofed; a malicious upload could declare
        // image/jpeg while actually containing HTML, SVG with embedded
        // JS, or an executable. ImageSharp rejects non-image bytes for
        // formats we can process, but HEIC/HEIF go through the
        // "store as-is" branch and would otherwise be served back with
        // the (still-spoofed) Content-Type from R2 — a stored-XSS
        // vector when another tab opens the URL.
        //
        // SniffActualType inspects the leading bytes against known image
        // signatures and returns the real MIME type or null if it doesn't
        // recognize the format. We require the sniffed type to be one of
        // the AllowedTypes (matches the header allowlist).
        await using (var probe = file.OpenReadStream())
        {
            var sniffed = await SniffActualTypeAsync(probe);
            if (sniffed is null || !AllowedTypes.Contains(sniffed))
                throw new InvalidOperationException(
                    "File contents don't match an allowed image format.");
            // Trust the sniffed type from here on. Mismatch with the
            // header is suspicious but not fatal — we override with the
            // real type rather than 400ing so legitimate clients that
            // mis-set Content-Type still work.
            if (!string.Equals(file.ContentType, sniffed, StringComparison.OrdinalIgnoreCase))
                file = new FormFileWithOverriddenType(file, sniffed);
        }

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

    /// <summary>
    /// Reads the first 12 bytes of the stream and returns the MIME
    /// type that matches the file's actual magic bytes, or null if
    /// none of the supported signatures match. Resets the stream
    /// position before returning so the caller can re-read it.
    /// </summary>
    private static async Task<string?> SniffActualTypeAsync(Stream s)
    {
        if (!s.CanSeek) return null; // form-file streams are seekable in ASP.NET
        var startPos = s.Position;
        var header = new byte[12];
        var read = await s.ReadAsync(header.AsMemory(0, 12));
        s.Position = startPos;
        if (read < 4) return null;

        // JPEG: FF D8 FF
        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF) return "image/jpeg";
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (read >= 8 &&
            header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47 &&
            header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A)
            return "image/png";
        // WebP: RIFF ... WEBP at offset 8
        if (read >= 12 &&
            header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46 &&
            header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50)
            return "image/webp";
        // HEIC/HEIF: variable ftyp brand, but begins with size bytes + 'ftyp' at offset 4.
        // We accept the family on any ftyp box and verify brand string contains heic/heix/heif/mif1.
        if (read >= 12 &&
            header[4] == 0x66 && header[5] == 0x74 && header[6] == 0x79 && header[7] == 0x70)
        {
            var brand = System.Text.Encoding.ASCII.GetString(header, 8, 4).ToLowerInvariant();
            if (brand is "heic" or "heix" or "heif" or "mif1" or "msf1" or "hevc" or "hevx")
                return brand.StartsWith("heif") || brand == "mif1" ? "image/heif" : "image/heic";
        }
        return null;
    }

    /// <summary>Wraps an IFormFile and overrides the ContentType so the
    /// stored MIME matches the sniffed magic-byte type rather than the
    /// caller-supplied header.</summary>
    private sealed class FormFileWithOverriddenType(IFormFile inner, string contentType) : IFormFile
    {
        public string ContentType => contentType;
        public string ContentDisposition => inner.ContentDisposition;
        public IHeaderDictionary Headers => inner.Headers;
        public long Length => inner.Length;
        public string Name => inner.Name;
        public string FileName => inner.FileName;
        public Stream OpenReadStream() => inner.OpenReadStream();
        public void CopyTo(Stream target) => inner.CopyTo(target);
        public Task CopyToAsync(Stream target, CancellationToken ct = default) => inner.CopyToAsync(target, ct);
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
