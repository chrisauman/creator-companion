namespace CreatorCompanion.Api.Domain.Models;

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>
    /// Plain token. Populated for tokens issued before the
    /// at-rest-hash rollout; new tokens leave this empty and store
    /// the SHA-256 hash in <see cref="TokenHash"/> instead. Drop
    /// this column in a follow-up migration once the refresh-token
    /// TTL (30 days) has elapsed since the at-rest-hash rollout.
    /// </summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// SHA-256 hex digest (64 chars) of the token the client holds.
    /// We never need the raw value back — verification is "does the
    /// presented token's hash match an active row?" — so the database
    /// stores only the digest. A read-only DB compromise no longer
    /// hands an attacker every active session.
    /// </summary>
    public string? TokenHash { get; set; }

    /// <summary>
    /// Session-family id. A fresh login/register starts a new family; each
    /// rotation on /auth/refresh inherits it. If an ALREADY-REVOKED token from a
    /// family is presented again (replay of a rotated token = theft signal), the
    /// whole family is revoked at once — severing both the attacker's and the
    /// victim's chain. Legacy rows (pre-migration) carry Guid.Empty and are exempt
    /// from family-revoke (they fall back to plain rejection).
    /// </summary>
    public Guid FamilyId { get; set; } = Guid.NewGuid();

    /// <summary>
    /// When this session (family) first began — inherited across rotations. Bounds
    /// absolute session age: the session is force-expired this long after login
    /// regardless of how often it's refreshed, so a silently-stolen token can't be
    /// rotated forever.
    /// </summary>
    public DateTime SessionStartedAt { get; set; } = DateTime.UtcNow;

    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt.HasValue;
    public bool IsActive => !IsRevoked && !IsExpired;

    public User User { get; set; } = null!;
}
