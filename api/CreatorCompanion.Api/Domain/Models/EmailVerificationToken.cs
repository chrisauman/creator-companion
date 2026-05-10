namespace CreatorCompanion.Api.Domain.Models;

public class EmailVerificationToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>Legacy plain token (pre at-rest-hash rollout).</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>SHA-256 hex digest of the token mailed to the user.</summary>
    public string? TokenHash { get; set; }

    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;

    public bool IsValid => ExpiresAt > DateTime.UtcNow;
}
