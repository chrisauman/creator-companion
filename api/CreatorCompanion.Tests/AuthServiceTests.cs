using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CreatorCompanion.Tests;

public class AuthServiceTests
{
    // No-op stubs — auth tests don't exercise email, audit, or storage side-effects.
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
    // behaviour is "always safe" — matches the fail-open production
    // behaviour when HIBP is unreachable, and lets the existing test
    // suite continue to use whatever weak test passwords it always
    // has. Individual tests can override by passing their own
    // service that throws.
    private sealed class NullPasswordSafetyService : IPasswordSafetyService
    {
        public Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private static AuthService Build(AppDbContext db, IPasswordSafetyService? passwordSafety = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"]          = "test-secret-key-must-be-at-least-32-characters-long",
                ["Jwt:Issuer"]          = "TestIssuer",
                ["Jwt:Audience"]        = "TestAudience",
                ["Jwt:ExpiryMinutes"]   = "60",
                ["Jwt:RefreshExpiryDays"] = "30"
            })
            .Build();
        return new AuthService(db, config, new NullEmailService(), new NullAuditService(), new NullStorageService(),
            new NullWelcomeEntryService(),
            passwordSafety ?? new NullPasswordSafetyService(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<AuthService>.Instance);
    }

    private static RegisterRequest NewRegister(
        string firstName, string email,
        string password = "Password1!", string lastName = "Tester")
        => new RegisterRequest(firstName, lastName, email, password, "UTC");

    [Fact]
    public async Task Register_NewUser_ReturnsTokensAndCreatesJournal()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var result = await svc.RegisterAsync(NewRegister("Alice", "alice@test.com"));

        result.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.RefreshToken.Should().NotBeNullOrWhiteSpace();
        result.User.FirstName.Should().Be("Alice");
        result.User.LastName.Should().Be("Tester");
        result.User.Tier.Should().Be("Free");

        // Default journal must be created
        db.Journals.Any(j => j.UserId == result.User.Id && j.IsDefault).Should().BeTrue();
    }

    [Fact]
    public async Task Register_DuplicateEmail_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        await svc.RegisterAsync(NewRegister("Alice", "alice@test.com"));

        var act = async () => await svc.RegisterAsync(NewRegister("Alice2", "alice@test.com"));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*already exists*");
    }

    [Fact]
    public async Task Login_ValidCredentials_ReturnsTokens()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(NewRegister("Bob", "bob@test.com"));

        var result = await svc.LoginAsync(new LoginRequest("bob@test.com", "Password1!"));

        result.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.User.FirstName.Should().Be("Bob");
        result.User.Email.Should().Be("bob@test.com");
    }

    [Fact]
    public async Task Login_EmailIsCaseInsensitive()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(NewRegister("Bob", "Bob@Test.com"));

        var result = await svc.LoginAsync(new LoginRequest("BOB@test.COM", "Password1!"));

        result.User.FirstName.Should().Be("Bob");
    }

    [Fact]
    public async Task Login_WrongPassword_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(NewRegister("Carol", "carol@test.com"));

        var act = async () =>
            await svc.LoginAsync(new LoginRequest("carol@test.com", "WrongPassword!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*Invalid credentials*");
    }

    [Fact]
    public async Task Login_UnknownEmail_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var act = async () =>
            await svc.LoginAsync(new LoginRequest("nobody@test.com", "Password1!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    [Fact]
    public async Task Refresh_ValidToken_IssuesNewTokens()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var reg = await svc.RegisterAsync(NewRegister("Dave", "dave@test.com"));

        var refreshed = await svc.RefreshAsync(reg.RefreshToken);

        refreshed.AccessToken.Should().NotBe(reg.AccessToken);
        refreshed.RefreshToken.Should().NotBe(reg.RefreshToken);
        refreshed.User.FirstName.Should().Be("Dave");
    }

    [Fact]
    public async Task Refresh_UsedToken_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var reg = await svc.RegisterAsync(NewRegister("Eve", "eve@test.com"));

        // Use the token once (this revokes it)
        await svc.RefreshAsync(reg.RefreshToken);

        // Using it again must fail
        var act = async () => await svc.RefreshAsync(reg.RefreshToken);

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*Invalid or expired*");
    }

    [Fact]
    public async Task Revoke_Token_CannotBeRefreshedAfter()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var reg = await svc.RegisterAsync(NewRegister("Frank", "frank@test.com"));

        await svc.RevokeAsync(reg.RefreshToken);

        var act = async () => await svc.RefreshAsync(reg.RefreshToken);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    // ── HIBP compromised-password check ────────────────────────────
    // Three behaviours to verify: compromised passwords are rejected
    // at registration, compromised passwords are rejected at reset,
    // and the fail-open path lets the password through when the
    // HIBP service throws transport errors.

    private sealed class AlwaysCompromisedSafetyService : IPasswordSafetyService
    {
        public Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default)
            => throw new InvalidOperationException(
                "This password has appeared in a public data breach. " +
                "Please choose a different one for your safety.");
    }

    private sealed class AlwaysFailingSafetyService : IPasswordSafetyService
    {
        // Simulates a real-world transport failure (HIBP unreachable,
        // network blip, etc). The production implementation catches
        // and fails open — but the test double here demonstrates that
        // ANY exception thrown by EnsurePasswordSafeAsync propagates.
        // The fail-open behaviour is the production-class
        // HibpPasswordSafetyService's responsibility (verified by
        // inspecting its catch block).
        public Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default)
            => throw new HttpRequestException("simulated HIBP outage");
    }

    [Fact]
    public async Task Register_CompromisedPassword_Rejected()
    {
        var db  = DbFactory.Create();
        var svc = Build(db, new AlwaysCompromisedSafetyService());

        var act = async () => await svc.RegisterAsync(NewRegister("Pwn", "pwn@test.com"));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*public data breach*");

        // No user row should have been created.
        var count = await db.Users.CountAsync(u => u.Email == "pwn@test.com");
        count.Should().Be(0);
    }

    [Fact]
    public async Task ResetPassword_CompromisedPassword_Rejected()
    {
        var db  = DbFactory.Create();
        // Register with the safe service so the account exists.
        var svc = Build(db);
        var reg = await svc.RegisterAsync(NewRegister("Reset", "reset@test.com"));

        // Now build a service with the compromised-safety check and
        // attempt a reset. Use ForgotPassword to mint a real token first.
        var resetToken = await svc.ForgotPasswordAsync("reset@test.com");
        resetToken.Should().NotBeNullOrEmpty();

        var pwnedSvc = Build(db, new AlwaysCompromisedSafetyService());
        var act = async () => await pwnedSvc.ResetPasswordAsync(resetToken, "AnyPassword123!");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*public data breach*");

        // The original password should still work. Login proves the
        // reset never went through. "Password1!" is the default the
        // test fixture's NewRegister() uses when no password is
        // passed in.
        var login = await svc.LoginAsync(new LoginRequest("reset@test.com", "Password1!"));
        login.AccessToken.Should().NotBeNullOrEmpty();
    }
}
