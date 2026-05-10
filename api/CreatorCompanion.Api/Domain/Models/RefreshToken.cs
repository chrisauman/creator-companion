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

    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt.HasValue;
    public bool IsActive => !IsRevoked && !IsExpired;

    public User User { get; set; } = null!;
}
