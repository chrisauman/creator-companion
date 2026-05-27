using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CreatorCompanion.Api.Common;

/// <summary>
/// Risk #6 closure (2026-05-27): blocks every authenticated request
/// from a user whose email is not verified, with a small allowlist
/// for the endpoints the verify-email screen itself needs.
///
/// The new policy:
/// - Trial starts at email verification, not at registration.
/// - Until the user clicks the verification link, every gated
///   endpoint returns 402 with <c>code: "email_unverified"</c> so the
///   frontend can show the "check your inbox" takeover screen.
/// - Unauthenticated endpoints are unaffected — the middleware
///   only acts when there's a logged-in user identity.
///
/// **Allowlist** (paths still reachable for an unverified signed-in
/// user) — keep tight; if a new endpoint is added that the verify-
/// email screen needs to call, add it here too:
/// - <c>GET /v1/users/me</c> — needed to render "we sent a link to X"
/// - <c>GET /v1/users/me/capabilities</c> — needed for state check
/// - <c>POST /v1/auth/resend-verification</c> — needed for the resend
///   button on the verify screen
/// - <c>DELETE /v1/users/me</c> — account self-delete must stay open
///   (same principle as the trial-expired lockout — a user must
///   always be able to leave with their data)
/// - All <c>/v1/auth/*</c> paths (login, refresh, etc.) and other
///   <c>[AllowAnonymous]</c> endpoints don't carry an authenticated
///   identity at this layer, so they're implicitly excluded by the
///   "is the user signed in?" gate.
///
/// **Legacy-token grace.** JWTs issued before the rollout don't
/// carry a "verified" claim. For those, we do a cached DB lookup
/// on <c>User.EmailVerified</c> and grant access if true. The cache
/// (~2 min TTL) keeps the hot path cheap; the lookup naturally
/// drains away as legacy JWTs expire (~60 min after deploy).
/// Without this grace, every grandfathered user would be locked
/// out for ~60 min after deploy.
///
/// **Pipeline placement.** Runs AFTER <c>UseAuthentication</c> +
/// <c>UseAuthorization</c> (so we have a User identity) and BEFORE
/// <c>MapControllers</c> (so we can short-circuit before any action).
/// </summary>
public sealed class EmailVerificationGuardMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    // Paths that an unverified signed-in user must still be able to
    // call. Compared with StartsWith / exact match against the request
    // path — be conservative when adding entries. Casing follows the
    // ASP.NET routing convention (lower-case path comparison).
    private static readonly (string Method, string Path)[] AllowlistExact =
    {
        ("GET",    "/v1/users/me"),
        ("GET",    "/v1/users/me/capabilities"),
        ("POST",   "/v1/auth/resend-verification"),
        ("DELETE", "/v1/users/me"),
    };

    public EmailVerificationGuardMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext db, IMemoryCache cache)
    {
        // No authenticated identity → not our concern. Anonymous
        // endpoints (login, register, verify-email link click,
        // forgot-password, resend-verification, the Stripe webhook,
        // public FAQ, etc.) all flow through here.
        if (context.User?.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        // Anything with a verified=true claim is good. Fast path —
        // no DB lookup.
        var verifiedClaim = context.User.FindFirst("verified")?.Value;
        if (string.Equals(verifiedClaim, "true", StringComparison.Ordinal))
        {
            await _next(context);
            return;
        }

        // Path matches an allowlisted exact (method, path) pair? Let
        // it through regardless of verification state — these are the
        // endpoints the verify-email screen needs to function.
        var method = context.Request.Method;
        var path   = context.Request.Path.Value ?? string.Empty;
        foreach (var (m, p) in AllowlistExact)
        {
            if (string.Equals(m, method, StringComparison.OrdinalIgnoreCase)
             && string.Equals(p, path,   StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }
        }

        // Legacy-token grace: claim missing AND DB says verified=true.
        // Cached so a noisy user with a pre-rollout JWT doesn't add
        // a per-request DB hit during the ~60 min transition window.
        if (verifiedClaim is null)
        {
            var subStr = context.User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
                      ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(subStr, out var userId))
            {
                var key = $"email-verified:{userId:N}";
                if (!cache.TryGetValue(key, out bool verified))
                {
                    verified = await db.Users
                        .Where(u => u.Id == userId)
                        .Select(u => u.EmailVerified)
                        .FirstOrDefaultAsync(context.RequestAborted);
                    cache.Set(key, verified, CacheTtl);
                }
                if (verified)
                {
                    await _next(context);
                    return;
                }
            }
        }

        // Block. Mirrors the 402 + code pattern that the trial-expired
        // path uses in Program.cs's global exception handler so the
        // frontend's auth interceptor can dispatch on the code.
        context.Response.StatusCode  = StatusCodes.Status402PaymentRequired;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Please verify your email to start your trial.",
            code  = "email_unverified"
        });
    }
}

/// <summary>
/// Extension helper so Program.cs can register the middleware with
/// the familiar <c>app.UseEmailVerificationGuard()</c> pattern.
/// </summary>
public static class EmailVerificationGuardExtensions
{
    public static IApplicationBuilder UseEmailVerificationGuard(this IApplicationBuilder app)
        => app.UseMiddleware<EmailVerificationGuardMiddleware>();
}
