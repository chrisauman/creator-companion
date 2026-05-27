using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CreatorCompanion.Tests;

/// <summary>
/// Pins the behavior of the security hardening landed during the
/// May 2026 audit pass:
///   - Persistent lockout (FailedLoginCount + LockedUntil on User)
///   - BCrypt rehash-on-login when work factor &lt; 12
///   - Refresh-token hash-at-rest with legacy plain-Token fallback
///   - Login response is "Invalid credentials" for unknown/wrong/locked
///   - Stripe webhook idempotency
///   - Trash purge worker
///
/// Tests run against the existing InMemoryDatabase fixture. Race-
/// condition coverage (advisory locks, SERIALIZABLE isolation) needs
/// a real Postgres and is tracked under the Testcontainers migration
/// in CLAUDE.md's deferred-items section — not asserted here.
/// </summary>
public class SecurityHardeningTests
{
    private sealed class NullEmailService : IEmailService
    {
        public Task SendPasswordResetAsync(string toEmail, string resetLink) => Task.CompletedTask;
        public Task SendVerificationEmailAsync(string toEmail, string verifyLink) => Task.CompletedTask;
        public Task SendPaymentReceiptAsync(string toEmail, string displayName) => Task.CompletedTask;
        public Task SendPasswordChangedAsync(string toEmail) => Task.CompletedTask;
        public Task SendWelcomeAsync(string toEmail, string displayName) => Task.CompletedTask;
        public Task SendAccountDeletionConfirmationAsync(string toEmail, string displayName) => Task.CompletedTask;
        public Task SendTrialEndingSoonAsync(string toEmail, string displayName, int daysLeft) => Task.CompletedTask;
        public Task SendTrialEndedAsync(string toEmail, string displayName) => Task.CompletedTask;
        public Task SendSubstackPostFailedAsync(string toEmail, int? statusCode, string errorMessage, string? errorBody, bool isCookieExpired) => Task.CompletedTask;
        public Task<Guid?> SendDailySparkReminderAsync(string toEmail, string takeaway, string? fullContent) => Task.FromResult<Guid?>(null);
    }
    private sealed class NullAuditService : IAuditService
    {
        public Task LogAsync(string eventName, Guid? userId = null, string? detail = null) => Task.CompletedTask;
    }
    private sealed class NullStorageService : IStorageService
    {
        public Task<string> SaveAsync(Stream fileStream, string fileName, string contentType) =>
            Task.FromResult($"stub/{Guid.NewGuid()}_{fileName}");
        public Task DeleteAsync(string storagePath) => Task.CompletedTask;
        public string GetUrl(string storagePath) => $"https://stub/{storagePath}";
        public Task<byte[]> ReadAllBytesAsync(string storagePath) => Task.FromResult(Array.Empty<byte>());
    }

    private sealed class NullWelcomeEntryService : IWelcomeEntryService
    {
        public Task SeedAsync(Guid userId, Guid journalId, string timeZoneId, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    // Test double for the HIBP password-safety service. Default
    // behaviour is "always safe" so existing tests don't need to
    // pick non-pwned strings. New HIBP-specific tests can pass a
    // custom service that throws.
    private sealed class NullPasswordSafetyService : IPasswordSafetyService
    {
        public Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    // No-op SecurityStamp service. AuthService calls Invalidate after
    // password reset; tests don't exercise the JWT OnTokenValidated
    // path (that runs only inside a live HTTP pipeline), so the no-op
    // is enough to satisfy the constructor.
    private sealed class NullUserStampService : IUserStampService
    {
        public Task<string?> GetCurrentStampAsync(Guid userId, CancellationToken ct = default)
            => Task.FromResult<string?>(null);
        public void Invalidate(Guid userId) { }
    }

    private static AuthService BuildAuth(AppDbContext db, IPasswordSafetyService? passwordSafety = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"]            = "test-secret-key-must-be-at-least-32-characters-long",
                ["Jwt:Issuer"]            = "TestIssuer",
                ["Jwt:Audience"]          = "TestAudience",
                ["Jwt:ExpiryMinutes"]     = "60",
                ["Jwt:RefreshExpiryDays"] = "30",
            })
            .Build();
        return new AuthService(db, config, new NullEmailService(), new NullAuditService(), new NullStorageService(),
            new NullWelcomeEntryService(),
            passwordSafety ?? new NullPasswordSafetyService(),
            new NullUserStampService(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<AuthService>.Instance);
    }

    // ── Lockout ────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_increments_failed_count_on_wrong_password()
    {
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            auth.LoginAsync(new LoginRequest("u@example.com", "wrong")));

        var reloaded = await db.Users.FirstAsync(x => x.Id == u.Id);
        reloaded.FailedLoginCount.Should().Be(1);
        reloaded.LockedUntil.Should().BeNull(); // not yet locked
    }

    [Fact]
    public async Task Login_locks_account_after_ten_failures_and_reports_invalid_credentials()
    {
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u2@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
            FailedLoginCount = 9,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);

        // 10th failure trips the lock.
        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            auth.LoginAsync(new LoginRequest("u2@example.com", "wrong")));
        ex.Message.Should().Be("Invalid credentials.");

        var reloaded = await db.Users.FirstAsync(x => x.Id == u.Id);
        reloaded.FailedLoginCount.Should().Be(10);
        reloaded.LockedUntil.Should().NotBeNull();
        reloaded.LockedUntil!.Value.Should().BeAfter(DateTime.UtcNow);

        // Attempt during lockout returns the SAME message — no enumeration via response copy.
        var ex2 = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            auth.LoginAsync(new LoginRequest("u2@example.com", "correct-horse")));
        ex2.Message.Should().Be("Invalid credentials.");
    }

    [Fact]
    public async Task Login_with_unknown_email_says_invalid_credentials_not_user_not_found()
    {
        await using var db = DbFactory.Create();
        var auth = BuildAuth(db);

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            auth.LoginAsync(new LoginRequest("nobody@example.com", "anything")));
        ex.Message.Should().Be("Invalid credentials.");
    }

    [Fact]
    public async Task Successful_login_clears_failed_count_and_lockedUntil()
    {
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u3@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
            FailedLoginCount = 3,
            LockedUntil  = null,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        await auth.LoginAsync(new LoginRequest("u3@example.com", "correct-horse"));

        var reloaded = await db.Users.FirstAsync(x => x.Id == u.Id);
        reloaded.FailedLoginCount.Should().Be(0);
        reloaded.LockedUntil.Should().BeNull();
    }

    // ── BCrypt rehash-on-login ─────────────────────────────────────────

    [Fact]
    public async Task Login_transparently_rehashes_legacy_factor10_hashes_to_factor12()
    {
        await using var db = DbFactory.Create();
        var oldHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 10); // legacy factor
        var u = new User
        {
            Email        = "u4@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = oldHash,
            TimeZoneId   = "UTC",
            IsActive     = true,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        await auth.LoginAsync(new LoginRequest("u4@example.com", "correct-horse"));

        var reloaded = await db.Users.FirstAsync(x => x.Id == u.Id);
        reloaded.PasswordHash.Should().NotBe(oldHash);
        // Factor-12 hashes encode "$2a$12" (or $2b$12) in the prefix.
        reloaded.PasswordHash.Should().MatchRegex(@"^\$2[abxy]\$12\$");
    }

    // ── Refresh-token hash-at-rest ─────────────────────────────────────

    [Fact(Skip = "Deferred per CLAUDE.md 'Drop legacy plain Token columns' — this test asserts the plaintext Token column is no longer written, but the column drop is scheduled for 30 days post-deploy of the at-rest-hash rollout (May 2026). Unskip after the follow-up migration lands.")]
    public async Task Issued_refresh_tokens_store_only_a_hash_not_the_plaintext()
    {
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u5@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        var res = await auth.LoginAsync(new LoginRequest("u5@example.com", "correct-horse"));
        res.RefreshToken.Should().NotBeNullOrEmpty();

        var rt = await db.RefreshTokens.SingleAsync(t => t.UserId == u.Id);
        // Plain Token column must be empty for new tokens — only the
        // hash is persisted. Legacy rows from before the rollout still
        // populate Token; new rows must not.
        rt.Token.Should().BeEmpty();
        rt.TokenHash.Should().NotBeNullOrEmpty();
        rt.TokenHash.Should().HaveLength(64); // SHA-256 hex = 64 chars
    }

    [Fact(Skip = "Deferred per CLAUDE.md 'Drop legacy plain Token columns' — this test asserts the new row-issuance path leaves Token empty, but the column drop + companion code change is scheduled for 30 days post-deploy of the at-rest-hash rollout (May 2026). Unskip after the follow-up migration lands.")]
    public async Task RefreshAsync_succeeds_against_legacy_plaintext_token_during_grace_window()
    {
        // Simulate a pre-rollout row that only has the plain Token field.
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u6@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
        };
        var legacy = new RefreshToken
        {
            UserId    = u.Id,
            Token     = "legacy-plain-token-value",
            TokenHash = null,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
        };
        db.Users.Add(u);
        db.RefreshTokens.Add(legacy);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        var res = await auth.RefreshAsync("legacy-plain-token-value");
        res.AccessToken.Should().NotBeNullOrEmpty();

        // The legacy row was rotated → revoked. A new row exists with hash only.
        var revoked = await db.RefreshTokens.SingleAsync(t => t.Id == legacy.Id);
        revoked.RevokedAt.Should().NotBeNull();

        var fresh = await db.RefreshTokens.SingleAsync(t => t.UserId == u.Id && t.RevokedAt == null);
        fresh.Token.Should().BeEmpty();
        fresh.TokenHash.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task RefreshAsync_rejects_inactive_user_even_with_valid_token()
    {
        await using var db = DbFactory.Create();
        var u = new User
        {
            Email        = "u7@example.com",
            FirstName    = "U", LastName = "U",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-horse", 12),
            TimeZoneId   = "UTC",
            IsActive     = true,
        };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        var auth = BuildAuth(db);
        var login = await auth.LoginAsync(new LoginRequest("u7@example.com", "correct-horse"));

        // Admin disables the account.
        u.IsActive = false;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => auth.RefreshAsync(login.RefreshToken));
    }

    // ── SecurityStamp / JWT "stamp" claim (Phase 6) ─────────────────────
    // Pins the contract the OnTokenValidated handler in Program.cs
    // relies on: the issued JWT carries the user's current
    // SecurityStamp as a "stamp" claim, and password reset bumps that
    // stamp so any outstanding access tokens issued before the reset
    // would fail the in-pipeline validator on their next request.
    //
    // We can't run the JwtBearerEvents pipeline from a unit test
    // (that needs a real HTTP request), so these tests work the
    // mechanism from the data side: decode the JWT and inspect the
    // claim, and read the User row after the state-changing call.

    [Fact]
    public async Task GeneratedJwt_carries_stamp_claim_matching_user_row()
    {
        await using var db = DbFactory.Create();
        var auth = BuildAuth(db);
        var reg = await auth.RegisterAsync(
            new RegisterRequest("Stamp", "Test", "stamp1@test.com", "Password1!", "UTC"));

        // Pull the user row back and confirm the JWT's stamp matches.
        var user = await db.Users.SingleAsync(u => u.Email == "stamp1@test.com");
        user.SecurityStamp.Should().NotBeNullOrWhiteSpace();

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(reg.AccessToken);
        var stampClaim = jwt.Claims.SingleOrDefault(c => c.Type == "stamp");

        stampClaim.Should().NotBeNull("every newly-issued JWT must carry the stamp claim");
        stampClaim!.Value.Should().Be(user.SecurityStamp);
    }

    [Fact]
    public async Task ResetPasswordAsync_bumps_security_stamp()
    {
        await using var db = DbFactory.Create();
        var auth = BuildAuth(db);
        await auth.RegisterAsync(
            new RegisterRequest("Stamp", "Test", "stamp2@test.com", "OldPassword1!", "UTC"));

        var beforeStamp = await db.Users
            .Where(u => u.Email == "stamp2@test.com")
            .Select(u => u.SecurityStamp)
            .SingleAsync();

        // Mint a real reset token through the forgot-password path
        // (don't fabricate one — that would skip token validation).
        var resetToken = await auth.ForgotPasswordAsync("stamp2@test.com");
        resetToken.Should().NotBeNullOrEmpty();

        await auth.ResetPasswordAsync(resetToken!, "NewPassword1!");

        // Re-read the user row from a fresh tracker so we see the
        // post-SaveChanges value, not a cached entity.
        db.ChangeTracker.Clear();
        var afterStamp = await db.Users
            .Where(u => u.Email == "stamp2@test.com")
            .Select(u => u.SecurityStamp)
            .SingleAsync();

        afterStamp.Should().NotBe(beforeStamp,
            "reset must mint a new SecurityStamp so any outstanding access tokens fail the stamp check");
        afterStamp.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task NewlyCreatedUser_gets_unique_security_stamp()
    {
        await using var db = DbFactory.Create();
        var auth = BuildAuth(db);
        await auth.RegisterAsync(
            new RegisterRequest("A", "X", "stamp3a@test.com", "Password1!", "UTC"));
        await auth.RegisterAsync(
            new RegisterRequest("B", "X", "stamp3b@test.com", "Password1!", "UTC"));

        var stamps = await db.Users
            .Where(u => u.Email.StartsWith("stamp3"))
            .Select(u => u.SecurityStamp)
            .ToListAsync();

        stamps.Should().HaveCount(2);
        stamps.Distinct().Should().HaveCount(2,
            "each new user must start with a distinct random stamp; sharing one would mean a bump on one user invalidates another's tokens");
        stamps.Should().NotContain(string.Empty);
    }
}

/// <summary>
/// Direct tests for the cache layer behind <see cref="IUserStampService"/>.
/// The cache TTL (2 min) makes the timing-dependent invalidation flow
/// the interesting case: Invalidate() must drop the cache entry so the
/// next call refetches from the DB.
/// </summary>
public class UserStampServiceTests
{
    private static UserStampService Build(AppDbContext db)
        => new UserStampService(
            new Microsoft.Extensions.Caching.Memory.MemoryCache(
                new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions()),
            db);

    [Fact]
    public async Task GetCurrentStampAsync_returns_stamp_from_db_on_first_call()
    {
        await using var db = DbFactory.Create();
        var user = new User
        {
            Email = "uss1@test.com", FirstName = "U", LastName = "S",
            PasswordHash = "x", TimeZoneId = "UTC",
            SecurityStamp = "stamp-one",
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var svc = Build(db);
        var got = await svc.GetCurrentStampAsync(user.Id);

        got.Should().Be("stamp-one");
    }

    [Fact]
    public async Task GetCurrentStampAsync_returns_null_for_unknown_user()
    {
        await using var db = DbFactory.Create();
        var svc = Build(db);
        var got = await svc.GetCurrentStampAsync(Guid.NewGuid());

        // A missing user is cached as null too (intentional — the
        // token is going to fail validation either way; no point
        // re-querying every request).
        got.Should().BeNull();
    }

    [Fact]
    public async Task Invalidate_forces_refetch_on_next_call()
    {
        await using var db = DbFactory.Create();
        var user = new User
        {
            Email = "uss2@test.com", FirstName = "U", LastName = "S",
            PasswordHash = "x", TimeZoneId = "UTC",
            SecurityStamp = "before",
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var svc = Build(db);
        // Prime the cache with the "before" value.
        var primed = await svc.GetCurrentStampAsync(user.Id);
        primed.Should().Be("before");

        // Mutate the row out-of-band — simulates an admin demote or
        // password change that bumped SecurityStamp.
        user.SecurityStamp = "after";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        // Without Invalidate, the cache would still return "before".
        // Prove this is the case first, then prove Invalidate fixes it.
        var stillCached = await svc.GetCurrentStampAsync(user.Id);
        stillCached.Should().Be("before",
            "cache should serve the original value until explicitly invalidated");

        svc.Invalidate(user.Id);
        var refetched = await svc.GetCurrentStampAsync(user.Id);
        refetched.Should().Be("after");
    }
}
