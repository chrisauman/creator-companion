using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
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
        [FromServices] CreatorCompanion.Api.Application.Interfaces.IEntitlementService entitlements)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();

        var limits = entitlements.GetLimits(user);
        return Ok(limits);
    }
}
