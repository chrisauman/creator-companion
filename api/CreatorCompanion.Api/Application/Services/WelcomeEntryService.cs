using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Creates the one-time "Hello World" entry on a fresh account so
/// the journal isn't empty on first visit. Pulled out of AuthService
/// to keep registration short and to make this seed step independently
/// testable + skippable when the welcome image asset is missing.
///
/// Storage flow mirrors MediaService:
///   - encrypt bytes (idempotent legacy fallback when key not set)
///   - upload to R2 via IStorageService
///   - persist Entry + EntryMedia row
///
/// The entry's EntryDate is today in the user's profile timezone so
/// it shows up as "today" on the dashboard and counts toward the
/// streak from day one — gives a small dopamine hit on signup.
/// </summary>
public class WelcomeEntryService(
    AppDbContext db,
    IStorageService storage,
    IEntryEncryptor encryptor,
    IWebHostEnvironment env,
    ILogger<WelcomeEntryService> logger) : IWelcomeEntryService
{
    private const string ImageFileName    = "starry-night.jpg";
    private const string ImageContentType = "image/jpeg";

    /// <summary>Brand-voice welcome copy. Single paragraph, ~80 words —
    /// short enough not to overwhelm, long enough to model what an
    /// entry could look like.</summary>
    private const string WelcomeContentHtml =
        "<p>Welcome to your creative practice — we're so glad you're here.</p>" +
        "<p>This is a placeholder entry to show you what a journal entry looks like. " +
        "Feel free to edit it, delete it, or favorite it. Every day, log one small step — a sketch, a sentence, a chord, a thought. " +
        "It doesn't have to be perfect. It just has to be real.</p>" +
        "<p>The image is Van Gogh's <em>Starry Night</em>, painted from memory through an asylum window in 1889. " +
        "Whatever you're working on, you've got this.</p>";

    public async Task SeedAsync(Guid userId, Guid journalId, string timeZoneId, CancellationToken ct = default)
    {
        try
        {
            var imagePath = Path.Combine(env.WebRootPath ?? "", "welcome", ImageFileName);
            if (!File.Exists(imagePath))
            {
                logger.LogWarning(
                    "Welcome-entry seed skipped: image asset missing at {Path}.", imagePath);
                return;
            }

            var plainBytes = await File.ReadAllBytesAsync(imagePath, ct);

            // Encryption is conditional on the key being configured —
            // mirrors MediaService.UploadAsync so the welcome entry's
            // image is wrapped exactly the same way as user uploads.
            var encrypt = encryptor.IsConfigured;
            var bytesToStore = encrypt ? encryptor.EncryptBytes(plainBytes) : plainBytes;

            string storagePath;
            await using (var ms = new MemoryStream(bytesToStore))
            {
                storagePath = await storage.SaveAsync(ms, ImageFileName, ImageContentType);
            }

            // EntryDate in the user's profile TZ so "today" lines up
            // with the dashboard's view of today. Fall back to UTC if
            // the user's TZ id is unknown to the host.
            DateOnly today;
            try
            {
                var tz = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
                today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
            }
            catch (TimeZoneNotFoundException)
            {
                today = DateOnly.FromDateTime(DateTime.UtcNow);
            }

            var entry = new Entry
            {
                UserId      = userId,
                JournalId   = journalId,
                EntryDate   = today,
                Title       = encryptor.EncryptString("Hello World"),
                ContentText = encryptor.EncryptString(WelcomeContentHtml),
                ContentType = "text/html",
                EntrySource = EntrySource.Direct
            };
            db.Entries.Add(entry);

            var media = new EntryMedia
            {
                EntryId       = entry.Id,
                UserId        = userId,
                FileName      = encryptor.EncryptString(ImageFileName),
                ContentType   = ImageContentType,
                FileSizeBytes = plainBytes.Length,
                StoragePath   = storagePath
            };
            db.EntryMedia.Add(media);

            await db.SaveChangesAsync(ct);

            logger.LogInformation(
                "Seeded welcome entry {EntryId} for user {UserId}.", entry.Id, userId);
        }
        catch (Exception ex)
        {
            // Best-effort: a seed failure must not block registration.
            // The user lands on an empty journal, which is the same
            // state as before this feature shipped — no regression.
            logger.LogWarning(ex,
                "Welcome-entry seed failed for user {UserId} — continuing.", userId);
        }
    }
}
