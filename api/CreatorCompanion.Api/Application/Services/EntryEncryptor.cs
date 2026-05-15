using System.Security.Cryptography;
using System.Text;

namespace CreatorCompanion.Api.Application.Services;

public interface IEntryEncryptor
{
    /// <summary>
    /// Encrypts a UTF-8 string and returns the canonical wrapped form
    /// (versioned + base64). Idempotent: if input is already wrapped
    /// (begins with the "enc:v1:" prefix) it's returned untouched, so
    /// double-encryption is impossible from accidental application
    /// in two layers. A null/empty input is returned as-is.
    /// </summary>
    string EncryptString(string? plaintext);

    /// <summary>
    /// Decrypts a previously wrapped value. If input is null/empty
    /// or does NOT begin with the "enc:v1:" prefix (legacy plaintext
    /// row from before the May 2026 migration), it's returned as-is.
    /// This transparent fall-through is what makes the lazy migration
    /// from plaintext → ciphertext safe: read paths never break.
    /// </summary>
    string DecryptString(string? value);

    /// <summary>
    /// Binary variant for image bytes and other non-string payloads.
    /// Same on-disk shape as the string variant but no base64 wrapper:
    /// nonce(12) || ciphertext(N) || tag(16). Magic byte 0x01 prepended
    /// so the caller can tell encrypted blobs from legacy plaintext.
    /// </summary>
    byte[] EncryptBytes(byte[] plaintext);

    /// <summary>
    /// Decrypts a previously wrapped binary blob. If the magic byte
    /// is not present at index 0, treats the input as legacy plaintext
    /// and returns it untouched.
    /// </summary>
    byte[] DecryptBytes(byte[] value);

    /// <summary>
    /// Deterministic SHA-256 hash for unique-lookup of values that
    /// need to be encrypted but also queried by exact match (e.g.
    /// tag names — same plaintext must always hash the same way so
    /// the unique constraint on (UserId, NameHash) works).
    /// Lowercased + trimmed before hashing for case-insensitive
    /// equality. Hashes are domain-separated by the optional
    /// `purpose` argument so a tag-name hash can't collide with a
    /// future entry-title-hash without an attacker also choosing the
    /// purpose string.
    /// </summary>
    string DeterministicHash(string input, string purpose);

    /// <summary>True if input begins with the canonical encrypted prefix.</summary>
    bool IsEncrypted(string? value);

    /// <summary>True if the binary blob begins with the encrypted magic byte.</summary>
    bool IsEncryptedBytes(byte[]? value);

    /// <summary>
    /// True if Entry:EncryptionKey is configured and valid. Callers
    /// that build dependent infrastructure (e.g. signed media URLs)
    /// check this to fall back to a legacy code path when the key
    /// isn't set yet — avoids hard failures during the rollout
    /// window between deploying the encryption code and setting the
    /// env var.
    /// </summary>
    bool IsConfigured { get; }
}

/// <summary>
/// Server-side AES-256-GCM encryption for at-rest user content.
///
/// Threat model covered:
///   - Database leak: backups / dumps / compromised read replica.
///     Ciphertext only without the env-var key.
///   - Curious admin reading the DB directly: same as above.
///
/// Threat model NOT covered (this is not E2EE):
///   - Server compromise: attacker with both DB and env vars can
///     decrypt everything. For that we'd need user-password-derived
///     keys (Phase C; deferred — see CLAUDE.md).
///
/// Format (string):
///   enc:v1:&lt;base64(nonce || ciphertext || tag)&gt;
///
/// Format (binary):
///   0x01 || nonce(12) || ciphertext(N) || tag(16)
///
/// Key sourced from Entry:EncryptionKey config (Entry__EncryptionKey
/// on Railway). Generated once via `openssl rand -base64 32`. The
/// service is lazy on init — startup doesn't fail if the key is
/// missing, but every encrypt/decrypt call surfaces a clear error.
/// This matches the SubstackCookieProtector pattern already in use.
///
/// Rotating the key is currently a destructive operation — all
/// existing ciphertext becomes unreadable. A future key-rotation
/// design would use a key-id prefix in the wrapped form so multiple
/// keys can coexist during rotation. We don't need that yet.
/// </summary>
public class EntryEncryptor : IEntryEncryptor
{
    private const string Prefix = "enc:v1:";
    private const byte MagicByte = 0x01;
    private const int NonceLen = 12;
    private const int TagLen = 16;

    private readonly byte[]? _key;
    private readonly string? _initError;
    private readonly ILogger<EntryEncryptor> _log;

    public EntryEncryptor(IConfiguration config, ILogger<EntryEncryptor> log)
    {
        _log = log;
        var b64 = config["Entry:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(b64))
        {
            _initError = "Entry:EncryptionKey is not configured. Generate a 32-byte " +
                         "base64 key (`openssl rand -base64 32`) and set it as the " +
                         "`Entry__EncryptionKey` env var on Railway. Until set, all " +
                         "encrypt/decrypt calls will throw.";
            _log.LogWarning("Entry:EncryptionKey is missing. User-content encryption is disabled.");
            return;
        }

        try
        {
            _key = Convert.FromBase64String(b64);
        }
        catch (FormatException)
        {
            _initError = "Entry:EncryptionKey is not valid base64.";
            return;
        }

        if (_key.Length != 32)
        {
            _initError = $"Entry:EncryptionKey must be a 32-byte (256-bit) key. " +
                         $"Got {_key.Length} bytes.";
            _key = null;
            return;
        }

        _log.LogInformation("Entry encryption key loaded (256-bit AES-GCM).");
    }

    public bool IsEncrypted(string? value) =>
        !string.IsNullOrEmpty(value) && value.StartsWith(Prefix, StringComparison.Ordinal);

    public bool IsEncryptedBytes(byte[]? value) =>
        value is { Length: > NonceLen + TagLen } && value[0] == MagicByte;

    public bool IsConfigured => _key is not null;

    public string EncryptString(string? plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return plaintext ?? string.Empty;
        if (IsEncrypted(plaintext)) return plaintext; // idempotent — already wrapped

        // Legacy fallback: when Entry:EncryptionKey isn't set, write paths
        // store plaintext (same on-disk shape as before the May 2026
        // encryption rollout). The ContentEncryptionMigrator picks these
        // rows up on the next startup after a key is configured and
        // re-writes them as ciphertext. Throwing here instead would break
        // every write the moment the encryption code deploys before the
        // env var lands — exactly the rollout gap we hit.
        if (_key is null) return plaintext;

        var nonce = RandomNumberGenerator.GetBytes(NonceLen);
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipher = new byte[plainBytes.Length];
        var tag = new byte[TagLen];

        using var gcm = new AesGcm(_key, TagLen);
        gcm.Encrypt(nonce, plainBytes, cipher, tag);

        var packed = new byte[nonce.Length + cipher.Length + tag.Length];
        Buffer.BlockCopy(nonce, 0, packed, 0, nonce.Length);
        Buffer.BlockCopy(cipher, 0, packed, nonce.Length, cipher.Length);
        Buffer.BlockCopy(tag, 0, packed, nonce.Length + cipher.Length, tag.Length);

        return Prefix + Convert.ToBase64String(packed);
    }

    public string DecryptString(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value ?? string.Empty;
        if (!IsEncrypted(value)) return value; // legacy plaintext — return as-is

        var key = RequireKey();
        var packed = Convert.FromBase64String(value[Prefix.Length..]);

        if (packed.Length < NonceLen + TagLen)
            throw new CryptographicException("Encrypted entry blob is truncated.");

        var cipherLen = packed.Length - NonceLen - TagLen;
        var nonce = new byte[NonceLen];
        var cipher = new byte[cipherLen];
        var tag = new byte[TagLen];
        Buffer.BlockCopy(packed, 0, nonce, 0, NonceLen);
        Buffer.BlockCopy(packed, NonceLen, cipher, 0, cipherLen);
        Buffer.BlockCopy(packed, NonceLen + cipherLen, tag, 0, TagLen);

        var plain = new byte[cipherLen];
        using var gcm = new AesGcm(key, TagLen);
        gcm.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }

    public byte[] EncryptBytes(byte[] plaintext)
    {
        if (plaintext.Length == 0) return plaintext;
        if (IsEncryptedBytes(plaintext)) return plaintext;

        // Same legacy fallback as EncryptString: when the key isn't
        // set, store raw bytes. ContentEncryptionMigrator backfills
        // ciphertext after the key is configured.
        if (_key is null) return plaintext;

        var nonce = RandomNumberGenerator.GetBytes(NonceLen);
        var cipher = new byte[plaintext.Length];
        var tag = new byte[TagLen];

        using var gcm = new AesGcm(_key, TagLen);
        gcm.Encrypt(nonce, plaintext, cipher, tag);

        // 0x01 magic + nonce + cipher + tag
        var packed = new byte[1 + nonce.Length + cipher.Length + tag.Length];
        packed[0] = MagicByte;
        Buffer.BlockCopy(nonce, 0, packed, 1, nonce.Length);
        Buffer.BlockCopy(cipher, 0, packed, 1 + nonce.Length, cipher.Length);
        Buffer.BlockCopy(tag, 0, packed, 1 + nonce.Length + cipher.Length, tag.Length);
        return packed;
    }

    public byte[] DecryptBytes(byte[] value)
    {
        if (!IsEncryptedBytes(value)) return value; // legacy plaintext bytes

        var key = RequireKey();
        if (value.Length < 1 + NonceLen + TagLen)
            throw new CryptographicException("Encrypted blob is truncated.");

        var cipherLen = value.Length - 1 - NonceLen - TagLen;
        var nonce = new byte[NonceLen];
        var cipher = new byte[cipherLen];
        var tag = new byte[TagLen];
        Buffer.BlockCopy(value, 1, nonce, 0, NonceLen);
        Buffer.BlockCopy(value, 1 + NonceLen, cipher, 0, cipherLen);
        Buffer.BlockCopy(value, 1 + NonceLen + cipherLen, tag, 0, TagLen);

        var plain = new byte[cipherLen];
        using var gcm = new AesGcm(key, TagLen);
        gcm.Decrypt(nonce, cipher, tag, plain);
        return plain;
    }

    public string DeterministicHash(string input, string purpose)
    {
        // Salted with the master key so an attacker with the DB alone
        // cannot brute-force common inputs against the hash. The purpose
        // string is concatenated in so the same plaintext used in two
        // contexts (tag name + entry title, say) produces different
        // hashes. Without server access an attacker has only opaque
        // base64; with server access they have everything anyway.
        //
        // Legacy fallback: when the key isn't configured we fall back
        // to a plain SHA-256 over the same material so the column stays
        // stable, bounded, and uniqueness still works. The
        // ContentEncryptionMigrator re-hashes everything with HMAC once
        // the key is set, so the legacy-mode hashes are transient.
        var normalised = input.Trim().ToLowerInvariant();
        var material = Encoding.UTF8.GetBytes(purpose + ":" + normalised);

        if (_key is null)
        {
            using var sha = SHA256.Create();
            return Convert.ToBase64String(sha.ComputeHash(material));
        }

        using var hmac = new HMACSHA256(_key);
        var hash = hmac.ComputeHash(material);
        return Convert.ToBase64String(hash);
    }

    private byte[] RequireKey()
    {
        if (_key is null) throw new InvalidOperationException(_initError);
        return _key;
    }
}
