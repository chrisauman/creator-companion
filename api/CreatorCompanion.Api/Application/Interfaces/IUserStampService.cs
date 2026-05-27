namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Looks up a user's current SecurityStamp via a short-lived in-memory
/// cache, and invalidates the cache entry on demand.
///
/// The stamp is included as the "stamp" claim on every issued JWT.
/// On each authenticated request, the JwtBearer <c>OnTokenValidated</c>
/// handler (wired in <c>Program.cs</c>) compares the claim against the
/// current row value via this service. A mismatch fails the request
/// with 401 — which lets us immediately invalidate every outstanding
/// access token for a user just by bumping the row stamp.
///
/// **Why a cache.** Without one, every authenticated request adds a
/// DB hit to read a 32-char string. With a ~2 min TTL the cache
/// absorbs the vast majority of traffic; the worst-case staleness is
/// "demotion takes effect within ~2 min" which is plenty fast for
/// human-paced incident response.
///
/// **Why an explicit invalidate.** When a service bumps the stamp
/// (admin demote, password change, etc.) we want the change to take
/// effect immediately, not after the cache expires. The bumping code
/// path calls <see cref="Invalidate"/> right after SaveChanges so the
/// next request goes back to the DB.
///
/// **Legacy-token grace.** JWTs issued before the SecurityStamp
/// rollout carry no "stamp" claim at all. The <c>OnTokenValidated</c>
/// handler treats a missing claim as valid (the token will still die
/// of natural ~60 min expiry); only present-but-mismatched stamps
/// fail validation. That keeps the deploy from forcing every active
/// user to re-login.
/// </summary>
public interface IUserStampService
{
    /// <summary>
    /// Returns the user's current SecurityStamp value, or <c>null</c>
    /// if the user row no longer exists. Cached for ~2 min per user.
    /// </summary>
    Task<string?> GetCurrentStampAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Drops the cached stamp for a user. Call this immediately after
    /// any code path that mutates <c>User.SecurityStamp</c>, so the
    /// next authenticated request sees the new value without waiting
    /// for the cache TTL to elapse.
    /// </summary>
    void Invalidate(Guid userId);
}
