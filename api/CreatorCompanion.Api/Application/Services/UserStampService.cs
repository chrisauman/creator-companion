using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Cache-backed SecurityStamp lookup. One DB hit per user per cache
/// window (2 min by default); cache invalidates explicitly on stamp
/// bumps so demotion / password-change take effect immediately.
///
/// Scoped lifetime so the DbContext injection is request-bound.
/// IMemoryCache is singleton under the hood — entries persist across
/// requests, as intended.
/// </summary>
public sealed class UserStampService : IUserStampService
{
    private readonly IMemoryCache _cache;
    private readonly AppDbContext _db;

    // 2 minutes is a compromise: short enough that an admin demotion
    // takes effect almost-immediately for an attacker who's already
    // demoted-but-still-holding-a-token (worst case 2 min of stale
    // access), long enough that the cache absorbs the vast majority
    // of authenticated traffic without a per-request DB hit. The
    // immediate-invalidate path (Invalidate()) is what makes the
    // *normal* admin-action flow feel instant; this TTL is the
    // fallback for paths that don't call Invalidate (e.g., a manual
    // SQL UPDATE someone runs on the prod DB).
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

    private static string CacheKey(Guid userId) => $"user-stamp:{userId:N}";

    public UserStampService(IMemoryCache cache, AppDbContext db)
    {
        _cache = cache;
        _db    = db;
    }

    public async Task<string?> GetCurrentStampAsync(Guid userId, CancellationToken ct = default)
    {
        var key = CacheKey(userId);
        if (_cache.TryGetValue(key, out string? cached))
        {
            // A previously-cached null means the user row didn't exist
            // a moment ago. We still cache the negative result for the
            // window because a JWT for a deleted user shouldn't be
            // re-checking the DB on every request — it's going to fail
            // either way.
            return cached;
        }

        var stamp = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.SecurityStamp)
            .FirstOrDefaultAsync(ct);

        // Cache the value (or absence of one) for the full window. The
        // negative-caching of null is intentional — see comment above.
        _cache.Set(key, stamp, CacheTtl);
        return stamp;
    }

    public void Invalidate(Guid userId)
        => _cache.Remove(CacheKey(userId));
}
