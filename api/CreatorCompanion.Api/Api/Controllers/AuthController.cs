using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/auth")]
public class AuthController(
    IAuthService authService,
    IWebHostEnvironment env,
    IConfiguration config,
    ITurnstileVerifier turnstile) : ControllerBase
{
    // Verifies the supplied Turnstile token against Cloudflare's
    // siteverify endpoint. Returns an IActionResult to 403 when
    // verification fails so the caller can `return await CheckTurnstile(...)
    // ?? next-step` without nested if-blocks. Token check runs before any
    // business logic (don't even hash a password if the request hasn't
    // proven it's a human). remoteIp is read from RemoteIpAddress which
    // ForwardedHeaders middleware has already resolved to the real
    // client (not the Railway proxy).
    private async Task<IActionResult?> RequireHumanAsync(string? token)
    {
        var remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ok = await turnstile.VerifyAsync(token, remoteIp);
        if (!ok)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Human verification failed. Please refresh the page and try again.",
                code  = "turnstile_failed"
            });
        }
        return null;
    }

    // ── Cookie helpers ───────────────────────────────────────────────────────

    // The refresh cookie is intentionally domain-scoped to the parent
    // registrable domain (e.g. .creatorcompanionapp.com), not the
    // api.* host that sets it. Reason: the SPA lives on app.* while
    // the API lives on api.* — without Domain set, the cookie is
    // scoped to ONLY api.* and mobile Chrome's tracking-protection
    // logic treats cross-subdomain requests from app.* as
    // third-party-cookie-attached and blocks them, even though both
    // share the same eTLD+1. Setting Domain promotes the cookie to a
    // "first-party domain cookie" that browsers send unimpeded across
    // subdomains. (Desktop Chrome was permissive enough that this
    // worked silently without Domain; mobile Chrome is not.)
    //
    // Reads the parent domain from Auth:CookieDomain so localhost,
    // staging, and prod stay configurable. If unset, falls back to
    // not setting Domain at all — preserving the old host-scoped
    // behaviour for any environment that doesn't have it configured.
    private string? CookieDomain =>
        env.IsDevelopment() ? null : config["Auth:CookieDomain"];

    private void SetRefreshCookie(string token, DateTime expiresAt)
    {
        Response.Cookies.Append("cc_refresh_token", token, new CookieOptions
        {
            HttpOnly  = true,
            Secure    = !env.IsDevelopment(),
            SameSite  = env.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None,
            Domain    = CookieDomain,
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
            // Must match the SetRefreshCookie Domain — otherwise the
            // browser stores it as a separate cookie and the original
            // never gets deleted on logout.
            Domain   = CookieDomain,
            Path     = "/"
        });
    }

    private string? GetRefreshCookie() =>
        Request.Cookies.TryGetValue("cc_refresh_token", out var t) ? t : null;

    // ── Endpoints ────────────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        // Turnstile gate FIRST — before any DB query, password hash, or
        // HIBP call. Cheap up-front filter against bot signups; also
        // prevents using these endpoints as a free oracle for any later
        // checks (email enumeration, etc.) by bot traffic.
        var turnstileFail = await RequireHumanAsync(request.CfTurnstileResponse);
        if (turnstileFail is not null) return turnstileFail;

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
        // Turnstile gate before the per-account lockout check, so a
        // credential-stuffing bot never gets to increment FailedLoginCount
        // on real user accounts. Without this, an attacker who knew real
        // emails could lock those accounts out by pummeling /login.
        var turnstileFail = await RequireHumanAsync(request.CfTurnstileResponse);
        if (turnstileFail is not null) return turnstileFail;

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
        return Ok(new { message = "Email verified! Your 10-day free trial has started." });
    }

    /// <summary>
    /// Resends the email-verification link. Open to authenticated AND
    /// unauthenticated callers — a user who's already logged in but
    /// hasn't verified is sitting on the verify-email screen, and an
    /// unauthenticated caller might be retrying immediately after
    /// signup. The response copy is generic enough that it doesn't
    /// leak existence either way.
    ///
    /// The rate-limit rule for this endpoint lives in Program.cs's
    /// AspNetCoreRateLimit config; without the limit, the endpoint
    /// becomes an email-flood weapon against arbitrary inboxes.
    /// </summary>
    [HttpPost("resend-verification")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest request)
    {
        await authService.ResendVerificationAsync(request.Email);
        // Same generic-response pattern as ForgotPassword. Don't
        // surface whether the email is registered OR whether the
        // user is already verified — both would be enumeration
        // signals to an unauthenticated caller.
        return Ok(new { message = "If that email is registered and unverified, a new link has been sent." });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        // Turnstile gate first. Without it, bots can use this endpoint
        // to harvest registered email addresses (the timing-equalization
        // we already have makes that hard, but the reset email itself
        // still goes out to real recipients on bot-triggered POSTs —
        // turning every CC user's inbox into a notification target).
        var turnstileFail = await RequireHumanAsync(request.CfTurnstileResponse);
        if (turnstileFail is not null) return turnstileFail;

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
