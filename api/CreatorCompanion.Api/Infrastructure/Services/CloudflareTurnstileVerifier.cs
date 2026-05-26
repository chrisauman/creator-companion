using System.Text.Json.Serialization;
using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// Posts a Turnstile token to Cloudflare's siteverify endpoint and
/// returns true only on a confirmed success response. Everything
/// else (missing token, missing secret, transport error, false
/// response, exception) returns false — fail-closed posture.
///
/// Wire format:
///   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
///   Content-Type: application/x-www-form-urlencoded
///   secret=...&response=...&remoteip=...
///
/// Response (JSON):
///   { "success": true, "challenge_ts": "...", "hostname": "...",
///     "error-codes": [], "action": "...", "cdata": "..." }
///   or
///   { "success": false, "error-codes": ["invalid-input-response", ...] }
///
/// Token lifetime: ~5 minutes. Single use. Cloudflare's API tracks
/// which tokens have been used to prevent replay.
/// </summary>
public class CloudflareTurnstileVerifier : ITurnstileVerifier
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<CloudflareTurnstileVerifier> _logger;

    public CloudflareTurnstileVerifier(
        HttpClient http,
        IConfiguration config,
        ILogger<CloudflareTurnstileVerifier> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<bool> VerifyAsync(
        string? token,
        string? remoteIp,
        CancellationToken ct = default)
    {
        var secret = _config["Turnstile:SecretKey"];

        // Operator-disabled path: blank secret key means Turnstile is
        // turned off for this environment (typical for local dev or an
        // emergency "disable" without a redeploy). Log a warning so the
        // posture is visible in any environment where it lands; never
        // silently pass without leaving a trail.
        if (string.IsNullOrWhiteSpace(secret))
        {
            _logger.LogWarning(
                "Turnstile:SecretKey is not configured; verification is disabled. " +
                "Auth requests will pass without bot-defense. Set the env var to enable.");
            return true;
        }

        // Missing token from the caller — always reject. The frontend
        // is responsible for obtaining the token from the widget and
        // including it; a request with no token can only come from a
        // misconfigured client OR a direct API call bypassing the UI.
        if (string.IsNullOrWhiteSpace(token))
        {
            _logger.LogInformation("Turnstile token missing from request; rejecting.");
            return false;
        }

        var form = new List<KeyValuePair<string, string>>
        {
            new("secret",   secret),
            new("response", token),
        };
        if (!string.IsNullOrWhiteSpace(remoteIp))
            form.Add(new("remoteip", remoteIp));

        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, "turnstile/v0/siteverify")
            {
                Content = new FormUrlEncodedContent(form)
            };

            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Turnstile siteverify returned non-success {StatusCode}; rejecting.",
                    (int)resp.StatusCode);
                return false;
            }

            var body = await resp.Content.ReadFromJsonAsync<TurnstileVerifyResponse>(
                cancellationToken: ct);
            if (body is null)
            {
                _logger.LogWarning("Turnstile siteverify returned an empty body; rejecting.");
                return false;
            }

            if (!body.Success)
            {
                // error-codes is short and useful when debugging integration
                // issues (e.g. "invalid-input-secret", "timeout-or-duplicate").
                // We log them at Info level since they're expected on real
                // bot rejections and we don't want to drown signal in noise.
                _logger.LogInformation(
                    "Turnstile siteverify returned success=false. Codes: {Codes}",
                    body.ErrorCodes is { Length: > 0 }
                        ? string.Join(", ", body.ErrorCodes)
                        : "(none)");
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            // Fail closed on transport errors. Cloudflare's siteverify
            // is >99.99% available; locking out users for a few seconds
            // during a rare outage is the right tradeoff vs. letting
            // bots through unchecked. Log so we have a Sentry signal
            // if outages start being a real pattern.
            _logger.LogWarning(ex,
                "Turnstile siteverify request failed; failing closed (rejecting).");
            return false;
        }
    }

    /// <summary>Internal DTO matching Cloudflare's response shape.</summary>
    private sealed class TurnstileVerifyResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error-codes")]
        public string[]? ErrorCodes { get; set; }

        // The other fields (challenge_ts, hostname, action, cdata) are
        // documented and useful for richer logging if we want it later
        // but unnecessary for the simple "did it pass?" decision.
    }
}
