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
public class UsersController(AppDbContext db) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        return Ok(new UserProfileResponse(
            user.Id, user.Username, user.Email,
            user.Tier.ToString(), user.TimeZoneId,
            user.OnboardingCompleted, user.CreatedAt, user.TrialEndsAt,
            user.ShowMotivation));
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

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
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
        return Ok(limits);
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
        try { await email.SendAccountDeletionConfirmationAsync(user.Email, user.Username); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Could not send deletion email to {user.Email}: {ex.Message}"); }

        // Delete entries explicitly (cascade handles EntryTags + EntryMedia)
        var entries = await db.Entries.Where(e => e.UserId == UserId).ToListAsync();
        db.Entries.RemoveRange(entries);
        await db.SaveChangesAsync();

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
