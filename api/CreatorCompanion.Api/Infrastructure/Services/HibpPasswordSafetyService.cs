using System.Security.Cryptography;
using System.Text;
using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// HIBP (Have I Been Pwned) "Pwned Passwords" k-anonymity client.
///
/// Wire format:
///   GET https://api.pwnedpasswords.com/range/{first-5-chars-of-sha1}
///   200 OK, body is a series of lines:
///     SUFFIX:COUNT
///     SUFFIX:COUNT
///     ...
///   (suffix is the remaining 35 chars of the SHA-1 hex hash;
///    count is how many breaches that exact hash has appeared in)
///
/// We hash the password locally, send only the 5-char prefix, and
/// check the 35-char suffix against the response lines. The password
/// itself and the full hash never leave the server.
///
/// Timeout + fail-open: 1-second HttpClient timeout; any exception
/// (timeout, DNS failure, 5xx, malformed body) logs to Sentry via
/// the standard logger and returns "safe" so the user is not blocked.
/// HIBP being down should never lock a real user out of registration.
/// </summary>
public class HibpPasswordSafetyService : IPasswordSafetyService
{
    private readonly HttpClient _http;
    private readonly ILogger<HibpPasswordSafetyService> _logger;

    public HibpPasswordSafetyService(
        HttpClient http,
        ILogger<HibpPasswordSafetyService> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(password)) return;

        // SHA-1 the password. SHA-1 is broken for collision resistance
        // but it's what HIBP uses — and the k-anonymity protocol is
        // safe regardless of SHA-1's collision weakness because we
        // only transmit a prefix and the response is a list, not a
        // single decision. There is no security claim being made by
        // SHA-1 here; it's just the canonical hash function for the
        // HIBP wire format.
        var hashHex = Sha1HexUpper(password);
        var prefix  = hashHex.Substring(0, 5);
        var suffix  = hashHex.Substring(5);

        string body;
        try
        {
            // Add-Padding tells HIBP to return padded responses (all
            // ranges padded to ~800 results) so an observer of the
            // response size can't narrow down which prefix was queried.
            // Documented at https://haveibeenpwned.com/API/v3#PwnedPasswords
            using var req = new HttpRequestMessage(HttpMethod.Get, $"range/{prefix}");
            req.Headers.Add("Add-Padding", "true");

            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "HIBP Pwned Passwords API returned non-success {StatusCode}; failing open.",
                    (int)resp.StatusCode);
                return;
            }

            body = await resp.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex)
        {
            // Sentry will pick this up via the standard logger pipeline.
            // No re-throw — fail open by design.
            _logger.LogWarning(ex,
                "HIBP Pwned Passwords API request failed; failing open for this password check.");
            return;
        }

        // Response is text, lines of "SUFFIX:COUNT\r\n". We look for
        // an exact suffix match (case-insensitive). Any line that
        // matches means this exact password hash has been seen in a
        // public breach — regardless of count. We deliberately don't
        // gate on count threshold; even a single appearance is a
        // signal the password is in some attacker's wordlist now.
        var lines = body.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
            var sep = line.IndexOf(':');
            if (sep <= 0) continue;
            var lineSuffix = line.AsSpan(0, sep).TrimEnd();
            if (lineSuffix.Equals(suffix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    "This password has appeared in a public data breach. " +
                    "Please choose a different one for your safety.");
            }
        }
    }

    private static string Sha1HexUpper(string input)
    {
        var bytes = SHA1.HashData(Encoding.UTF8.GetBytes(input));
        // HIBP API matches case-insensitively but uppercase is the
        // documented convention. Returning uppercase keeps logs
        // (when any) consistent with the API docs and the response.
        var sb = new StringBuilder(bytes.Length * 2);
        foreach (var b in bytes) sb.Append(b.ToString("X2"));
        return sb.ToString();
    }
}
