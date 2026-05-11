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
    }

    private static AuthService BuildAuth(AppDbContext db)
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
        return new AuthService(db, config, new NullEmailService(), new NullAuditService(), new NullStorageService());
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

    [Fact]
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

    [Fact]
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
}
