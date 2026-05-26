namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Verifies a Cloudflare Turnstile challenge response token.
///
/// Used at every public-facing auth surface (registration, login,
/// forgot-password) to confirm the request originated from a real
/// browser session that solved (or was passively cleared by)
/// Cloudflare's bot-detection widget.
///
/// Failure posture: **fail closed**. Unlike HIBP (which we fail-open
/// on transport errors because it's an additional defense layer),
/// Turnstile IS the bot-defense layer — passing requests through on
/// a Cloudflare outage would defeat the whole purpose. Cloudflare's
/// siteverify endpoint runs at 99.99%+ availability so the
/// false-positive lockout risk is very small.
///
/// One exception: in environments where Turnstile is not configured
/// (the Turnstile:SecretKey config is empty), every verification
/// succeeds. This lets dev environments without keys still function,
/// and lets emergency operators flip Turnstile off by blanking the
/// secret without a code deploy. Production deployments without a
/// configured key WILL log a warning every time the verifier runs.
/// </summary>
public interface ITurnstileVerifier
{
    /// <summary>
    /// Returns true if Cloudflare confirms the token is valid for this
    /// site. Returns false on any failure (invalid token, missing
    /// token, Cloudflare API error, network timeout). Caller should
    /// map false to a 403/400 rejection.
    ///
    /// remoteIp is optional but recommended — Cloudflare uses it to
    /// detect token-replay across different clients.
    /// </summary>
    Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken ct = default);
}
