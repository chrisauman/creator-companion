using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CreatorCompanion.Tests;

public class AuthServiceTests
{
    // No-op stubs — auth tests don't exercise email or audit side-effects
    private sealed class NullEmailService : IEmailService
    {
        public Task SendPasswordResetAsync(string toEmail, string resetLink) => Task.CompletedTask;
        public Task SendVerificationEmailAsync(string toEmail, string verifyLink) => Task.CompletedTask;
    }

    private sealed class NullAuditService : IAuditService
    {
        public Task LogAsync(string eventName, Guid? userId = null, string? detail = null) => Task.CompletedTask;
    }

    private static AuthService Build(AppDbContext db)
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
        return new AuthService(db, config, new NullEmailService(), new NullAuditService());
    }

    [Fact]
    public async Task Register_NewUser_ReturnsTokensAndCreatesJournal()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var result = await svc.RegisterAsync(
            new RegisterRequest("alice", "alice@test.com", "Password1!", "UTC"));

        result.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.RefreshToken.Should().NotBeNullOrWhiteSpace();
        result.User.Username.Should().Be("alice");
        result.User.Tier.Should().Be("Free");

        // Default journal must be created
        db.Journals.Any(j => j.UserId == result.User.Id && j.IsDefault).Should().BeTrue();
    }

    [Fact]
    public async Task Register_DuplicateEmail_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        await svc.RegisterAsync(new RegisterRequest("alice", "alice@test.com", "Password1!", "UTC"));

        var act = async () =>
            await svc.RegisterAsync(new RegisterRequest("alice2", "alice@test.com", "Password1!", "UTC"));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*already exists*");
    }

    [Fact]
    public async Task Register_DuplicateUsername_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        await svc.RegisterAsync(new RegisterRequest("alice", "alice@test.com", "Password1!", "UTC"));

        var act = async () =>
            await svc.RegisterAsync(new RegisterRequest("alice", "other@test.com", "Password1!", "UTC"));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*already exists*");
    }

    [Fact]
    public async Task Login_ValidCredentials_ReturnsTokens()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(new RegisterRequest("bob", "bob@test.com", "Password1!", "UTC"));

        var result = await svc.LoginAsync(new LoginRequest("bob@test.com", "Password1!"));

        result.AccessToken.Should().NotBeNullOrWhiteSpace();
        result.User.Username.Should().Be("bob");
    }

    [Fact]
    public async Task Login_ByUsername_Succeeds()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(new RegisterRequest("bob", "bob@test.com", "Password1!", "UTC"));

        var result = await svc.LoginAsync(new LoginRequest("bob", "Password1!"));

        result.User.Username.Should().Be("bob");
    }

    [Fact]
    public async Task Login_WrongPassword_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);
        await svc.RegisterAsync(new RegisterRequest("carol", "carol@test.com", "Password1!", "UTC"));

        var act = async () =>
            await svc.LoginAsync(new LoginRequest("carol@test.com", "WrongPassword!"));

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*Invalid credentials*");
    }

    [Fact]
    public async Task Login_UnknownUser_Throws()
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

        var reg = await svc.RegisterAsync(
            new RegisterRequest("dave", "dave@test.com", "Password1!", "UTC"));

        var refreshed = await svc.RefreshAsync(reg.RefreshToken);

        refreshed.AccessToken.Should().NotBe(reg.AccessToken);
        refreshed.RefreshToken.Should().NotBe(reg.RefreshToken);
        refreshed.User.Username.Should().Be("dave");
    }

    [Fact]
    public async Task Refresh_UsedToken_Throws()
    {
        var db  = DbFactory.Create();
        var svc = Build(db);

        var reg = await svc.RegisterAsync(
            new RegisterRequest("eve", "eve@test.com", "Password1!", "UTC"));

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

        var reg = await svc.RegisterAsync(
            new RegisterRequest("frank", "frank@test.com", "Password1!", "UTC"));

        await svc.RevokeAsync(reg.RefreshToken);

        var act = async () => await svc.RefreshAsync(reg.RefreshToken);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }
}
