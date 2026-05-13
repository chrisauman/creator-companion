using System.Security.Cryptography;
using System.Text;

namespace CreatorCompanion.Api.Application.Services;

public interface ISubstackCookieProtector
{
    /// <summary>Encrypts a Substack session cookie for at-rest storage.</summary>
    string Protect(string plaintext);

    /// <summary>Decrypts a previously protected cookie. Throws on tamper.</summary>
    string Unprotect(string ciphertext);
}

/// <summary>
/// AES-GCM-based encryption for the Substack session cookie. Uses a
/// single 256-bit key supplied via configuration (Substack:EncryptionKey,
/// base64-encoded). Each Protect() produces a fresh random 12-byte
/// nonce, so encrypting the same plaintext twice yields different
/// ciphertext (no leakage of cookie equality).
///
/// On-disk format (base64): nonce(12) || ciphertext(N) || tag(16)
///
/// Key rotation: change the env var. Existing ciphertext becomes
/// unreadable and the admin re-pastes the cookie. Acceptable for a
/// single-user tool — we're not trying to be Vault.
///
/// We deliberately avoid ASP.NET Core's IDataProtectionProvider because
/// it defaults to file-based key storage that doesn't survive Railway
/// container restarts; persisting keys to Postgres would require an
/// extra package and migration just for one secret. AES-GCM + one env
/// var is simpler and sufficient.
/// </summary>
public class SubstackCookieProtector : ISubstackCookieProtector
{
    /// <summary>
    /// Lazy-loaded — kept null when the env var is missing so the
    /// constructor doesn't throw at DI resolution time. Instead, the
    /// missing-config error surfaces on first Protect/Unprotect call,
    /// letting the admin still load the settings page and see WHICH
    /// env var to set.
    /// </summary>
    private readonly byte[]? _key;
    private readonly string? _initError;

    public SubstackCookieProtector(IConfiguration config)
    {
        var b64 = config["Substack:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(b64))
        {
            _initError = "Substack:EncryptionKey is not configured. Generate a " +
                         "32-byte base64 key (`openssl rand -base64 32`) and set " +
                         "it as the `Substack__EncryptionKey` env var on Railway.";
            return;
        }

        try
        {
            _key = Convert.FromBase64String(b64);
        }
        catch (FormatException)
        {
            _initError = "Substack:EncryptionKey is not valid base64.";
            return;
        }

        if (_key.Length != 32)
        {
            _initError = $"Substack:EncryptionKey must be a 32-byte (256-bit) " +
                         $"key. Got {_key.Length} bytes.";
            _key = null;
        }
    }

    private byte[] RequireKey()
    {
        if (_key is null) throw new InvalidOperationException(_initError);
        return _key;
    }

    public string Protect(string plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize); // 12
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[AesGcm.TagByteSizes.MaxSize]; // 16

        using var gcm = new AesGcm(RequireKey(), AesGcm.TagByteSizes.MaxSize);
        gcm.Encrypt(nonce, plainBytes, cipherBytes, tag);

        // Pack nonce || cipher || tag for a self-contained blob.
        var blob = new byte[nonce.Length + cipherBytes.Length + tag.Length];
        Buffer.BlockCopy(nonce, 0, blob, 0, nonce.Length);
        Buffer.BlockCopy(cipherBytes, 0, blob, nonce.Length, cipherBytes.Length);
        Buffer.BlockCopy(tag, 0, blob, nonce.Length + cipherBytes.Length, tag.Length);
        return Convert.ToBase64String(blob);
    }

    public string Unprotect(string ciphertext)
    {
        var blob = Convert.FromBase64String(ciphertext);
        const int nonceLen = 12;
        const int tagLen = 16;
        if (blob.Length < nonceLen + tagLen)
            throw new CryptographicException("Substack cookie blob is truncated.");

        var cipherLen = blob.Length - nonceLen - tagLen;
        var nonce = new byte[nonceLen];
        var cipher = new byte[cipherLen];
        var tag = new byte[tagLen];
        Buffer.BlockCopy(blob, 0, nonce, 0, nonceLen);
        Buffer.BlockCopy(blob, nonceLen, cipher, 0, cipherLen);
        Buffer.BlockCopy(blob, nonceLen + cipherLen, tag, 0, tagLen);

        var plain = new byte[cipherLen];
        using var gcm = new AesGcm(RequireKey(), AesGcm.TagByteSizes.MaxSize);
        gcm.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }
}
