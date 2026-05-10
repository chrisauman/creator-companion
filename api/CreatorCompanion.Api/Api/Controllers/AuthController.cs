using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/auth")]
public class AuthController(IAuthService authService, IWebHostEnvironment env) : ControllerBase
{
    // ── Cookie helpers ───────────────────────────────────────────────────────

    private void SetRefreshCookie(string token, DateTime expiresAt)
    {
        Response.Cookies.Append("cc_refresh_token", token, new CookieOptions
        {
            HttpOnly  = true,
            Secure    = !env.IsDevelopment(),
            SameSite  = env.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None,
            Expires   = expiresAt,
            Path      = "/"
        });
    }

    private void ClearRefreshCookie()
    {
        Response.Cookies.Delete("cc_refresh_token", new CookieOptions
        {
            HttpOnly = true,
            Secure   = !env.IsDevelopment(),
            SameSite = env.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None,
            Path     = "/"
        });
    }

    private string? GetRefreshCookie() =>
        Request.Cookies.TryGetValue("cc_refresh_token", out var t) ? t : null;

    // ── Endpoints ────────────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            var result = await authService.RegisterAsync(request);
            // Set HttpOnly cookie (works when cookies aren't blocked) and
            // also return the token in the body so the client can store it
            // in localStorage as a cross-origin fallback.
            SetRefreshCookie(result.RefreshToken, DateTime.UtcNow.AddDays(90));
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var result = await authService.LoginAsync(request);
            SetRefreshCookie(result.RefreshToken, DateTime.UtcNow.AddDays(90));
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        // Cookie-only. Previously also accepted the token from the request
        // body as a "localStorage fallback for Safari ITP" — that opened a
        // cross-site CSRF path (any allow-listed origin with a malicious
        // page could mint refreshes via cookie OR a stolen body token).
        // Modern Safari handles SameSite=None; Secure cookies correctly;
        // browsers that don't can re-login. The frontend no longer stores
        // a refresh-token mirror in localStorage either.
        var refreshToken = GetRefreshCookie();

        if (string.IsNullOrEmpty(refreshToken))
            return Unauthorized(new { error = "No refresh token." });

        try
        {
            var result = await authService.RefreshAsync(refreshToken);
            SetRefreshCookie(result.RefreshToken, DateTime.UtcNow.AddDays(90));
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            ClearRefreshCookie();
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpPost("revoke")]
    public async Task<IActionResult> Revoke()
    {
        // Cookie-only (mirrors the refresh endpoint). Body fallback removed.
        var refreshToken = GetRefreshCookie();
        if (!string.IsNullOrEmpty(refreshToken))
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? User.FindFirstValue("sub");
            await authService.RevokeAsync(refreshToken, userId);
        }
        ClearRefreshCookie();
        return NoContent();
    }

    [HttpGet("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromQuery] string token)
    {
        var success = await authService.VerifyEmailAsync(token);
        if (!success) return BadRequest(new { error = "Verification link is invalid or has expired." });
        return Ok(new { message = "Email verified successfully. You can now sign in." });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var token = await authService.ForgotPasswordAsync(request.Email);
        if (env.IsDevelopment())
            return Ok(new { message = "If that email is registered, a reset link has been sent.", resetToken = token });
        return Ok(new { message = "If that email is registered, a reset link has been sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        try
        {
            await authService.ResetPasswordAsync(request.Token, request.NewPassword);
            ClearRefreshCookie();
            return Ok(new { message = "Password updated successfully. Please sign in." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

// RefreshRequest / RevokeRequest records previously held a body
// RefreshToken fallback; removed when refresh/revoke went cookie-only.
