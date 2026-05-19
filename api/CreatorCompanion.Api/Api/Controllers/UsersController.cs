using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/users")]
[Authorize]
public class UsersController(AppDbContext db, IStorageService storage, IImageProcessor imageProcessor) : ControllerBase
{
    // HEIC/HEIF allowed because iPhone defaults to it. ImageSharp can't
    // decode HEIC natively, but UploadProfileImage runs through
    // imageProcessor.ProcessAsync which would reject — so iPhone users
    // got a silent "this format isn't supported" loop. The entry-media
    // path already accepts these and falls back to storing the original;
    // mirror that here. (Server still re-encodes via JPEG for the
    // formats ImageSharp does decode.)
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    };
    private const long MaxProfileImageBytes = 5 * 1024 * 1024; // 5 MB raw upload — server downscales to 512px²
    private const int  ProfileImageMaxSidePx = 512;

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        return Ok(new UserProfileResponse(
            user.Id, user.FirstName, user.LastName, user.Email,
            user.Tier.ToString(), user.TimeZoneId,
            user.OnboardingCompleted, user.CreatedAt, user.TrialEndsAt,
            user.ShowMotivation, user.ShowActionItems,
            string.IsNullOrEmpty(user.ProfileImagePath) ? null : storage.GetUrl(user.ProfileImagePath)));
    }

    [HttpPatch("me/name")]
    public async Task<IActionResult> UpdateName([FromBody] UpdateNameRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        user.FirstName = request.FirstName.Trim();
        user.LastName  = request.LastName.Trim();
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { firstName = user.FirstName, lastName = user.LastName });
    }

    [HttpPatch("me/timezone")]
    public async Task<IActionResult> UpdateTimezone([FromBody] UpdateTimezoneRequest request)
    {
        try
        {
            // Validate that the timezone ID is known
            TimeZoneInfo.FindSystemTimeZoneById(request.TimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return BadRequest(new { error = "Unknown timezone ID." });
        }

        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        user.TimeZoneId = request.TimeZoneId;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { timeZoneId = user.TimeZoneId });
    }

    [HttpPatch("me/onboarding")]
    public async Task<IActionResult> CompleteOnboarding([FromBody] CompleteOnboardingRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        user.OnboardingCompleted = request.Completed;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { onboardingCompleted = user.OnboardingCompleted });
    }

    [HttpPatch("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            return BadRequest(new { error = "Current password is incorrect." });

        if (request.NewPassword == request.CurrentPassword)
            return BadRequest(new { error = "New password must be different from your current password." });

        // OWASP-2024 work factor (12). Logging in afterwards rehashes
        // legacy hashes transparently; new hashes start at the target.
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, 12);
        user.UpdatedAt = DateTime.UtcNow;

        // Revoke every other active refresh token for this user. A
        // password change is a security signal — typically "I think
        // someone got into my account" — so other devices' refresh
        // tokens shouldn't keep working. ResetPasswordAsync already
        // does this; ChangePasswordAsync was an inconsistent gap.
        var now = DateTime.UtcNow;
        await db.RefreshTokens
            .Where(rt => rt.UserId == UserId && rt.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, now));

        await db.SaveChangesAsync();

        return Ok(new { message = "Password updated successfully." });
    }

    [HttpGet("me/capabilities")]
    public async Task<IActionResult> GetCapabilities(
        [FromServices] IEntitlementService entitlements)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        var limits = entitlements.GetLimits(user);
        // Frontend needs to know access state to render the trial
        // countdown banner OR the paywall takeover. Returning these
        // alongside the limits keeps the cap fetch unified.
        return Ok(new
        {
            limits.MaxWordsPerEntry,
            limits.MaxImagesPerEntry,
            limits.MaxRemindersPerDay,
            limits.CanUsePause,
            limits.CanBackfill,
            limits.CanRecoverDeleted,
            limits.CanTrackMood,
            limits.CanFavorite,
            limits.CanFormatText,
            limits.MaxEntriesPerDay,
            limits.MaxTagsPerEntry,
            limits.MaxDiaries,
            HasAccess            = entitlements.HasAccess(user),
            IsInTrial            = entitlements.IsInTrial(user),
            HasActiveSubscription = entitlements.HasActiveSubscription(user),
            TrialEndsAt          = user.TrialEndsAt
        });
    }

    [HttpPatch("me/action-items-preference")]
    public async Task<IActionResult> UpdateActionItemsPreference([FromBody] UpdateActionItemsPreferenceRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        user.ShowActionItems = request.Show;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { showActionItems = user.ShowActionItems });
    }

    [HttpPost("me/profile-image")]
    [RequestSizeLimit(MaxProfileImageBytes)]
    public async Task<IActionResult> UploadProfileImage(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded." });

        if (!AllowedImageTypes.Contains(file.ContentType))
            return BadRequest(new { error = "Only JPEG, PNG, WebP, or HEIC images are allowed." });

        if (file.Length > MaxProfileImageBytes)
            return BadRequest(new { error = "Image must be 5 MB or smaller." });

        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        // Downscale + recompress through ImageSharp so we never store
        // multi-megabyte phone-camera originals as someone's avatar.
        // 512px on the longest side keeps the ~30 KB after JPEG re-encode.
        // HEIC/HEIF can't be decoded by ImageSharp (no native codec
        // ships with it) — fall back to storing the original; the
        // browser handles display. Same pattern as the entry-media path.
        string newPath;
        await using (var source = file.OpenReadStream())
        {
            if (imageProcessor.CanProcess(file.ContentType))
            {
                var (processed, processedType) =
                    await imageProcessor.ProcessAsync(source, ProfileImageMaxSidePx);
                await using (processed)
                {
                    var fileName = Path.ChangeExtension($"avatar_{file.FileName}", ".jpg");
                    newPath = await storage.SaveAsync(processed, fileName, processedType);
                }
            }
            else
            {
                var fileName = $"avatar_{file.FileName}";
                newPath = await storage.SaveAsync(source, fileName, file.ContentType);
            }
        }

        var oldPath = user.ProfileImagePath;
        user.ProfileImagePath = newPath;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Best-effort delete of the previous avatar to keep storage tidy.
        if (!string.IsNullOrEmpty(oldPath))
        {
            try { await storage.DeleteAsync(oldPath); }
            catch { /* logged elsewhere — never fail the request over cleanup */ }
        }

        return Ok(new { profileImageUrl = storage.GetUrl(newPath) });
    }

    [HttpDelete("me/profile-image")]
    public async Task<IActionResult> DeleteProfileImage()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        var oldPath = user.ProfileImagePath;
        user.ProfileImagePath = null;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (!string.IsNullOrEmpty(oldPath))
        {
            try { await storage.DeleteAsync(oldPath); }
            catch { /* swallow — file may already be gone */ }
        }

        return NoContent();
    }

    /// <summary>
    /// Streams a complete archive of the user's data as a single ZIP:
    /// <c>export.json</c> at the root (full structured data — journals,
    /// entries, tags, media metadata + per-file manifest) plus
    /// <c>images/&lt;date&gt;_&lt;entry-id&gt;/&lt;filename&gt;</c> for every
    /// attached photo. Lets a user walk away with everything they put in,
    /// including the photo binaries — the existing /export-as-json path only
    /// emits media counts, leaving R2-hosted images unreachable after
    /// signed URLs expire.
    ///
    /// Streaming-write pattern: the ZIP is written directly to
    /// <c>Response.Body</c> via <c>ZipArchive</c>, with each image fetched
    /// from R2 and dropped into the zip one at a time. Memory stays
    /// bounded regardless of total archive size (heavy users could have
    /// hundreds of MB of images).
    ///
    /// Encryption: image bytes and filenames in R2 / the DB are encrypted
    /// when <c>Entry__EncryptionKey</c> is set. <c>DecryptBytes</c> and
    /// <c>DecryptString</c> are both no-ops on unencrypted legacy values,
    /// so the same code handles both rollout modes.
    ///
    /// Failure mode: per-file errors (R2 unreachable, decrypt failure)
    /// don't abort the whole export. The file is skipped and added to a
    /// <c>missingImages</c> array in <c>export.json</c> so the user can
    /// see what wasn't recovered.
    /// </summary>
    [HttpGet("me/export")]
    public async Task ExportArchive([FromServices] IEntryEncryptor encryptor)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var journals = await db.Journals
            .Where(j => j.UserId == UserId && j.DeletedAt == null)
            .OrderBy(j => j.CreatedAt)
            .ToListAsync();

        // Pull entries with their media + tags eager-loaded. DeletedAt
        // filter excludes soft-deleted entries — they're in trash and
        // about to be hard-deleted by the 48h purge anyway; including
        // them in an export of "your data" would be confusing.
        var entries = await db.Entries
            .Include(e => e.Media.Where(m => m.DeletedAt == null))
            .Include(e => e.EntryTags).ThenInclude(et => et.Tag)
            .Where(e => e.UserId == UserId && e.DeletedAt == null)
            .OrderBy(e => e.EntryDate).ThenBy(e => e.CreatedAt)
            .ToListAsync();

        var allTags = await db.Tags
            .Where(t => t.UserId == UserId)
            .Select(t => new { t.Id, EncryptedName = t.Name, t.CreatedAt })
            .ToListAsync();

        // Build the JSON shape. Decrypts every field that needs it.
        var exportJson = new
        {
            exportedAt   = DateTime.UtcNow,
            user         = new {
                user.Id, user.FirstName, user.LastName, user.Email,
                tier      = user.Tier.ToString(),
                user.CreatedAt, user.TrialEndsAt, user.TimeZoneId
            },
            journals     = journals.Select(j => new { j.Id, j.Name, j.IsDefault, j.CreatedAt }),
            tags         = allTags.Select(t => new {
                t.Id,
                name = encryptor.DecryptString(t.EncryptedName),
                t.CreatedAt
            }),
            entries      = entries.Select(e => new {
                e.Id,
                journal   = journals.FirstOrDefault(j => j.Id == e.JournalId)?.Name ?? "Unknown",
                date      = e.EntryDate,
                e.CreatedAt, e.UpdatedAt,
                title     = encryptor.DecryptString(e.Title),
                content   = encryptor.DecryptString(e.ContentText),
                e.Mood, e.IsFavorited,
                source    = e.EntrySource.ToString(),
                tags      = e.EntryTags.Select(et => encryptor.DecryptString(et.Tag.Name)).OrderBy(n => n),
                media     = e.Media.Select(m => new {
                    m.Id,
                    filename     = encryptor.DecryptString(m.FileName),
                    m.ContentType,
                    m.FileSizeBytes,
                    m.TakenAt,
                    // Where to find this file inside the ZIP:
                    archivePath  = BuildArchivePath(e, m, encryptor)
                })
            }),
            // Populated as we stream — each image we fail to fetch lands here.
            missingImages = new List<object>()
        };

        // We need a mutable list for missingImages, so capture it first.
        var missingImages = (List<object>)exportJson.GetType().GetProperty("missingImages")!.GetValue(exportJson)!;

        // Build the ZIP in a MemoryStream first, then copy the complete,
        // valid archive to Response.Body. The earlier version wrote
        // directly to Response.Body, but ASP.NET's response stream isn't
        // seekable — and ZipArchive in Create mode against a non-seekable
        // stream emits data descriptors that macOS Archive Utility (and
        // a handful of older Windows tools) reject as "bad message"
        // (Error 94). Building in memory gives ZipArchive a seekable
        // target so it can write a fully-formed central directory at the
        // end of the file, which every extractor understands.
        //
        // Memory cost: bounded by the user's total image size. For a
        // typical journaling account (<200 MB of photos) this is fine.
        // If we ever hit users with multi-GB archives we'd switch to a
        // temp file as the intermediate.
        await using var buffer = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(
            buffer,
            System.IO.Compression.ZipArchiveMode.Create,
            leaveOpen: true))
        {
            // Add each image first so we know exactly what's missing before
            // we serialize the JSON manifest. Sequential reads keep R2
            // happy (parallel would be faster but risks rate-limiting on
            // heavy accounts; revisit if exports get slow for users
            // with 500+ photos).
            foreach (var entry in entries)
            {
                foreach (var media in entry.Media)
                {
                    var archivePath = BuildArchivePath(entry, media, encryptor);
                    try
                    {
                        var rawBytes  = await storage.ReadAllBytesAsync(media.StoragePath);
                        var plainBytes = encryptor.DecryptBytes(rawBytes);
                        var zipEntry  = zip.CreateEntry(
                            archivePath,
                            System.IO.Compression.CompressionLevel.NoCompression); // jpegs are already compressed
                        await using var es = zipEntry.Open();
                        await es.WriteAsync(plainBytes);
                    }
                    catch (Exception ex)
                    {
                        missingImages.Add(new {
                            mediaId   = media.Id,
                            entryId   = entry.Id,
                            archivePath,
                            reason    = ex.GetType().Name
                        });
                    }
                }
            }

            // Now write the JSON manifest. The missingImages list reflects
            // whatever we just failed to fetch, so the user knows exactly
            // which files (if any) weren't included.
            var jsonEntry = zip.CreateEntry(
                "export.json",
                System.IO.Compression.CompressionLevel.Optimal);
            await using (var es = jsonEntry.Open())
            {
                var json = System.Text.Json.JsonSerializer.Serialize(
                    exportJson,
                    new System.Text.Json.JsonSerializerOptions
                    {
                        WriteIndented = true,
                        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
                    });
                await es.WriteAsync(System.Text.Encoding.UTF8.GetBytes(json));
            }

            // Plain-text README so a non-technical user opening the zip
            // understands what they have.
            var readmeEntry = zip.CreateEntry(
                "README.txt",
                System.IO.Compression.CompressionLevel.Optimal);
            await using (var es = readmeEntry.Open())
            {
                var readme = $"""
                    CREATOR COMPANION — DATA EXPORT
                    Exported: {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC

                    This archive contains everything you put into Creator Companion:
                      export.json   — All journals, entries, tags, and media metadata
                      images/       — Every photo you attached, organized by entry date

                    Image folder names are <entry-date>_<entry-id> so you can match
                    each photo back to its journal entry. The export.json file's
                    "media" arrays include the exact archivePath inside this zip
                    where each photo lives.

                    If any photos couldn't be fetched at export time (network
                    glitch, encryption mismatch), they'll be listed in the
                    "missingImages" array at the bottom of export.json.

                    Your data is yours. Take it wherever you want.
                    """;
                await es.WriteAsync(System.Text.Encoding.UTF8.GetBytes(readme));
            }
        }
        // ↑ Disposing the ZipArchive here finalizes the central directory
        // into `buffer`. Now copy the finished bytes to the response.

        Response.ContentType = "application/zip";
        Response.Headers.ContentDisposition =
            $"attachment; filename=\"creator-companion-export-{DateOnly.FromDateTime(DateTime.UtcNow):yyyy-MM-dd}.zip\"";
        Response.ContentLength = buffer.Length;

        buffer.Position = 0;
        await buffer.CopyToAsync(Response.Body);
    }

    /// <summary>Builds the in-zip path for an entry's media file.
    /// Format: <c>images/yyyy-MM-dd_&lt;entry-id-no-dashes&gt;/&lt;filename&gt;</c>.</summary>
    private static string BuildArchivePath(
        CreatorCompanion.Api.Domain.Models.Entry entry,
        CreatorCompanion.Api.Domain.Models.EntryMedia media,
        IEntryEncryptor encryptor)
    {
        var safeFile = SanitizeForZipPath(encryptor.DecryptString(media.FileName));
        return $"images/{entry.EntryDate:yyyy-MM-dd}_{entry.Id:N}/{safeFile}";
    }

    /// <summary>Strips characters that would break ZIP entry paths or
    /// confuse extraction tools. ZIP itself permits most chars, but
    /// some Windows extractors choke on colons / slashes / null bytes
    /// in entry names. We normalize to a safe subset and fall back to
    /// "image.jpg" if the decrypted filename ends up empty.</summary>
    private static string SanitizeForZipPath(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "image.jpg";
        var cleaned = new string(name.Select(c =>
            char.IsLetterOrDigit(c) || c == '.' || c == '-' || c == '_' ? c : '_'
        ).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "image.jpg" : cleaned;
    }

    [HttpDelete("me")]
    public async Task<IActionResult> DeleteAccount(
        [FromBody] DeleteAccountRequest request,
        [FromServices] IStripeService stripe,
        [FromServices] IEmailService email)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        // Verify password before deleting anything
        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return BadRequest(new { error = "Incorrect password." });

        // Cancel active Stripe subscription so the user isn't billed again.
        // Do this before deleting the user record so we still have the IDs.
        if (!string.IsNullOrEmpty(user.StripeSubscriptionId))
        {
            try { await stripe.CancelSubscriptionAsync(user.StripeSubscriptionId); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not cancel Stripe subscription for user {user.Id}: {ex.Message}"); }
        }

        // Send confirmation email before deleting (we still have the address)
        try { await email.SendAccountDeletionConfirmationAsync(user.Email, user.FirstName); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Could not send deletion email to {user.Email}: {ex.Message}"); }

        // Collect every R2 media path the user owns BEFORE we cascade
        // the rows away. ImageSharp/R2 cleanup is best-effort — leaving
        // a row with a missing blob would be worse than a stray blob.
        var mediaPaths = await db.EntryMedia
            .Where(m => m.UserId == UserId)
            .Select(m => m.StoragePath)
            .ToListAsync();

        // Delete entries explicitly (cascade handles EntryTags + EntryMedia)
        var entries = await db.Entries.Where(e => e.UserId == UserId).ToListAsync();
        db.Entries.RemoveRange(entries);
        await db.SaveChangesAsync();

        // R2 cleanup pass — entry media + the profile avatar. The user's
        // confirmation email promised this; failing silently would be
        // a privacy regression.
        foreach (var path in mediaPaths)
        {
            try { await storage.DeleteAsync(path); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not delete media {path}: {ex.Message}"); }
        }
        if (!string.IsNullOrEmpty(user.ProfileImagePath))
        {
            try { await storage.DeleteAsync(user.ProfileImagePath); }
            catch (Exception ex) { Console.WriteLine($"[WARN] Could not delete avatar for user {user.Id}: {ex.Message}"); }
        }

        // Delete tokens and subscriptions not covered by cascade
        var resetTokens = await db.PasswordResetTokens.Where(t => t.UserId == UserId).ToListAsync();
        db.PasswordResetTokens.RemoveRange(resetTokens);

        var verifyTokens = await db.EmailVerificationTokens.Where(t => t.UserId == UserId).ToListAsync();
        db.EmailVerificationTokens.RemoveRange(verifyTokens);

        var pushSubs = await db.PushSubscriptions.Where(s => s.UserId == UserId).ToListAsync();
        db.PushSubscriptions.RemoveRange(pushSubs);

        var reminders = await db.Reminders.Where(r => r.UserId == UserId).ToListAsync();
        db.Reminders.RemoveRange(reminders);

        await db.SaveChangesAsync();

        // Delete user — Drafts, Pauses, RefreshTokens, Journals, Tags all cascade
        db.Users.Remove(user);
        await db.SaveChangesAsync();

        // Clear the refresh token cookie
        Response.Cookies.Delete("cc_refresh_token");

        return NoContent();
    }
}

public record DeleteAccountRequest(string Password);
public record UpdateActionItemsPreferenceRequest(bool Show);
