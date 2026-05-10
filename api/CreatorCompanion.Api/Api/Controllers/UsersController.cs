using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
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
