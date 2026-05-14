using System.Security.Cryptography;
using System.Text;

namespace CreatorCompanion.Api.Application.Services;

public interface IMediaUrlSigner
{
    /// <summary>
    /// Build a relative URL pointing at the authenticated media-serve
    /// endpoint, with a short-lived signed token attached as a query
    /// param. The token binds (mediaId, userId, expiry) so a stolen
    /// URL can't be used by another user and stops working after the
    /// expiry. The browser uses this directly in &lt;img src&gt;.
    /// </summary>
    string BuildSignedUrl(Guid mediaId, Guid userId);

    /// <summary>
    /// Validate a token. Returns (true, mediaId, userId) on success,
    /// or (false, _, _) on signature mismatch, parse failure, or
    /// expiry past now. Used by MediaController on every serve.
    /// </summary>
    (bool ok, Guid mediaId, Guid userId) ValidateToken(string token);
}

/// <summary>
/// Signs short-lived URLs for the authenticated image-serve endpoint
/// so &lt;img&gt; tags work without an Authorization header. Tokens
/// are HMAC-SHA256 over (mediaId | userId | expiry) using the master
/// encryption key (already in memory for image en/decryption — no
/// extra secret to provision).
///
/// Token format (url-safe base64 of the payload + signature):
///   v1.{mediaId}.{userId}.{expiryEpochSeconds}.{base64url(hmac)}
///
/// Expiry: 24 hours. Long enough that normal browsing doesn't see
/// broken images mid-session, short enough that a leaked URL has
/// bounded lifetime. Browser image cache + the regeneration on each
/// MediaSummary mean users rarely re-fetch the same URL anyway.
/// </summary>
public class MediaUrlSigner : IMediaUrlSigner
{
    private const string Version = "v1";
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly byte[]? _key;
    private readonly string? _initError;

    public MediaUrlSigner(IConfiguration config)
    {
        // Reuse the entry encryption key — the signing secret lives on
        // the same server with the same trust boundary, no benefit to
        // a separate one and one less env var to manage.
        var b64 = config["Entry:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(b64))
        {
            _initError = "Entry:EncryptionKey is not configured. Media URL signing requires it.";
            return;
        }
        try { _key = Convert.FromBase64String(b64); }
        catch (FormatException) { _initError = "Entry:EncryptionKey is not valid base64."; return; }
        if (_key.Length != 32) { _initError = "Entry:EncryptionKey must be 32 bytes."; _key = null; }
    }

    public string BuildSignedUrl(Guid mediaId, Guid userId)
    {
        var expiry = DateTimeOffset.UtcNow.Add(Ttl).ToUnixTimeSeconds();
        var payload = $"{Version}.{mediaId:N}.{userId:N}.{expiry}";
        var sig = Sign(payload);
        var token = $"{payload}.{sig}";
        return $"/v1/media/{mediaId:N}?t={Uri.EscapeDataString(token)}";
    }

    public (bool ok, Guid mediaId, Guid userId) ValidateToken(string token)
    {
        if (string.IsNullOrEmpty(token)) return (false, Guid.Empty, Guid.Empty);

        var parts = token.Split('.');
        // version.media.user.expiry.signature → 5 parts
        if (parts.Length != 5) return (false, Guid.Empty, Guid.Empty);
        if (parts[0] != Version) return (false, Guid.Empty, Guid.Empty);

        var payload = string.Join('.', parts[..4]);
        var expectedSig = Sign(payload);
        // Constant-time compare to avoid timing leaks on the HMAC.
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedSig),
                Encoding.UTF8.GetBytes(parts[4])))
            return (false, Guid.Empty, Guid.Empty);

        if (!long.TryParse(parts[3], out var exp)) return (false, Guid.Empty, Guid.Empty);
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return (false, Guid.Empty, Guid.Empty);

        if (!Guid.TryParseExact(parts[1], "N", out var mediaId)) return (false, Guid.Empty, Guid.Empty);
        if (!Guid.TryParseExact(parts[2], "N", out var userId)) return (false, Guid.Empty, Guid.Empty);

        return (true, mediaId, userId);
    }

    private string Sign(string payload)
    {
        if (_key is null) throw new InvalidOperationException(_initError);
        using var hmac = new HMACSHA256(_key);
        var sig = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Base64UrlEncode(sig);
    }

    private static string Base64UrlEncode(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
