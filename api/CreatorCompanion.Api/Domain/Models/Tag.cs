namespace CreatorCompanion.Api.Domain.Models;

public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>
    /// Encrypted at rest with the master key. May 2026 privacy pass —
    /// the plaintext form of this used to be stored directly and was
    /// readable by anyone with DB access. Now wrapped via
    /// IEntryEncryptor.EncryptString and unwrapped at read time.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Deterministic per-domain hash of the normalised lowercase
    /// plaintext tag name. Needed because unique-name lookup ("does
    /// this user already have a tag called 'writing'?") can't be
    /// answered against AES-GCM ciphertext — random nonces make the
    /// same plaintext encrypt to different bytes each time. The
    /// (UserId, NameHash) unique index uses this for fast lookup +
    /// duplicate prevention; the displayed name is decrypted from
    /// `Name` on read.
    /// </summary>
    public string NameHash { get; set; } = string.Empty;

    /// <summary>Hex color string (e.g. "#9ecae1"). UI for this is not yet built.</summary>
    public string? Color { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public ICollection<EntryTag> EntryTags { get; set; } = new List<EntryTag>();
}
