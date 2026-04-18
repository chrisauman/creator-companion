using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace CreatorCompanion.Api.Application.Services;

public class AuthService(AppDbContext db, IConfiguration config) : IAuthService
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var emailExists = await db.Users.AnyAsync(u => u.Email == request.Email.ToLower());
        if (emailExists)
            throw new InvalidOperationException("Email is already registered.");

        var usernameExists = await db.Users.AnyAsync(u => u.Username == request.Username.ToLower());
        if (usernameExists)
            throw new InvalidOperationException("Username is already taken.");

        var user = new User
        {
            Username = request.Username.ToLower(),
            Email = request.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            TimeZoneId = request.TimeZoneId
        };

        db.Users.Add(user);

        // Create default journal
        var journal = new Journal
        {
            UserId = user.Id,
            Name = "My Journal",
            IsDefault = true
        };
        db.Journals.Add(journal);

        // Create default noon reminder for all users
        var defaultReminder = new Reminder
        {
            UserId    = user.Id,
            Time      = new TimeOnly(12, 0),
            Message   = null,   // null = use the system default message
            IsEnabled = true,
            IsDefault = true
        };
        db.Reminders.Add(defaultReminder);

        await db.SaveChangesAsync();

        return await IssueTokensAsync(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var identifier = request.EmailOrUsername.ToLower();
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email == identifier || u.Username == identifier);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        if (!user.IsActive)
            throw new UnauthorizedAccessException("Account is inactive.");

        return await IssueTokensAsync(user);
    }

    public async Task<AuthResponse> RefreshAsync(string refreshToken)
    {
        var token = await db.RefreshTokens
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.Token == refreshToken);

        if (token is null || !token.IsActive)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Rotate: revoke old, issue new
        token.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return await IssueTokensAsync(token.User);
    }

    public async Task RevokeAsync(string refreshToken)
    {
        var token = await db.RefreshTokens.FirstOrDefaultAsync(r => r.Token == refreshToken);
        if (token is not null && token.IsActive)
        {
            token.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    public async Task<string> ForgotPasswordAsync(string email)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLower());
        // Always return success to prevent user enumeration
        if (user is null) return string.Empty;

        // Invalidate any existing unused tokens for this user
        var existing = await db.PasswordResetTokens
            .Where(t => t.UserId == user.Id && t.UsedAt == null)
            .ToListAsync();
        db.PasswordResetTokens.RemoveRange(existing);

        var resetToken = new Domain.Models.PasswordResetToken
        {
            UserId = user.Id,
            Token = GenerateSecureToken(),
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        };
        db.PasswordResetTokens.Add(resetToken);
        await db.SaveChangesAsync();

        return resetToken.Token;
    }

    public async Task ResetPasswordAsync(string token, string newPassword)
    {
        var resetToken = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == token);

        if (resetToken is null || !resetToken.IsValid)
            throw new InvalidOperationException("Reset link is invalid or has expired.");

        resetToken.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        resetToken.User.UpdatedAt = DateTime.UtcNow;
        resetToken.UsedAt = DateTime.UtcNow;

        // Revoke all refresh tokens so existing sessions are invalidated
        var refreshTokens = await db.RefreshTokens
            .Where(rt => rt.UserId == resetToken.UserId && rt.RevokedAt == null)
            .ToListAsync();
        foreach (var rt in refreshTokens)
            rt.RevokedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    private async Task<AuthResponse> IssueTokensAsync(User user)
    {
        var expiryMinutes = config.GetValue<int>("Jwt:ExpiryMinutes", 60);
        var expiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);
        var accessToken = GenerateJwt(user, expiresAt);

        var refreshDays = config.GetValue<int>("Jwt:RefreshExpiryDays", 30);
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = GenerateSecureToken(),
            ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
        };
        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync();

        return new AuthResponse(
            accessToken,
            refreshToken.Token,
            expiresAt,
            new UserSummary(
                user.Id,
                user.Username,
                user.Email,
                user.Tier.ToString(),
                user.TimeZoneId,
                user.OnboardingCompleted));
    }

    private string GenerateJwt(User user, DateTime expiresAt)
    {
        var secret = config["Jwt:Secret"]!;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claimsList = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("username", user.Username),
            new Claim("tier", user.Tier.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        if (user.IsAdmin)
            claimsList.Add(new Claim(ClaimTypes.Role, "Admin"));
        var claims = claimsList.ToArray();

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateSecureToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }
}
