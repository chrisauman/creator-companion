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
using System.Web;

namespace CreatorCompanion.Api.Application.Services;

public class AuthService(AppDbContext db, IConfiguration config, IEmailService emailService, IAuditService audit) : IAuthService
{
    // In-memory lockout tracker: identifier → (failCount, windowStart)
    private static readonly Dictionary<string, (int Count, DateTime WindowStart)> _failedAttempts = new();
    private static readonly Lock _lock = new();
    private const int MaxFailedAttempts = 10;
    private static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(15);

    private static bool IsLockedOut(string identifier)
    {
        lock (_lock)
        {
            if (!_failedAttempts.TryGetValue(identifier, out var entry)) return false;
            if (DateTime.UtcNow - entry.WindowStart > LockoutWindow)
            {
                _failedAttempts.Remove(identifier);
                return false;
            }
            return entry.Count >= MaxFailedAttempts;
        }
    }

    private static void RecordFailure(string identifier)
    {
        lock (_lock)
        {
            if (_failedAttempts.TryGetValue(identifier, out var entry) &&
                DateTime.UtcNow - entry.WindowStart <= LockoutWindow)
                _failedAttempts[identifier] = (entry.Count + 1, entry.WindowStart);
            else
                _failedAttempts[identifier] = (1, DateTime.UtcNow);
        }
    }

    private static void ClearFailures(string identifier)
    {
        lock (_lock) { _failedAttempts.Remove(identifier); }
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var emailExists = await db.Users.AnyAsync(u => u.Email == request.Email.ToLower());
        var usernameExists = await db.Users.AnyAsync(u => u.Username == request.Username.ToLower());
        if (emailExists || usernameExists)
            throw new InvalidOperationException("An account with those details already exists.");

        var user = new User
        {
            Username = request.Username.ToLower(),
            Email = request.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            TimeZoneId = request.TimeZoneId
        };

        db.Users.Add(user);
        await audit.LogAsync("user.registered", user.Id, $"username={user.Username}");

        // Create email verification token (best-effort — email may not send until domain is set up)
        var verificationToken = new Domain.Models.EmailVerificationToken
        {
            UserId    = user.Id,
            Token     = GenerateSecureToken(),
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        };
        db.EmailVerificationTokens.Add(verificationToken);

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

        var result = await IssueTokensAsync(user);

        // Send verification email (best-effort)
        try
        {
            var appBaseUrl  = config["App:BaseUrl"] ?? "https://creator-companion-web.vercel.app";
            var verifyLink  = $"{appBaseUrl}/verify-email?token={System.Web.HttpUtility.UrlEncode(verificationToken.Token)}";
            await emailService.SendVerificationEmailAsync(user.Email, verifyLink);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WARN] Failed to send verification email to {user.Email}: {ex.Message}");
        }

        return result;
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var identifier = request.EmailOrUsername.ToLower();

        if (IsLockedOut(identifier))
            throw new UnauthorizedAccessException("Too many failed attempts. Please try again in 15 minutes.");

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email == identifier || u.Username == identifier);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            RecordFailure(identifier);
            await audit.LogAsync("login.failed", null, $"identifier={identifier}");
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        if (!user.IsActive)
            throw new UnauthorizedAccessException("Account is inactive.");

        ClearFailures(identifier);
        await audit.LogAsync("login.success", user.Id);
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

    public async Task RevokeAsync(string refreshToken, string? requestingUserId = null)
    {
        var token = await db.RefreshTokens.FirstOrDefaultAsync(r => r.Token == refreshToken);
        if (token is null || !token.IsActive) return;

        // If a userId was provided, ensure the token belongs to that user
        if (requestingUserId is not null &&
            !token.UserId.ToString().Equals(requestingUserId, StringComparison.OrdinalIgnoreCase))
            return; // silently ignore — don't reveal whether the token exists

        token.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
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

        var appBaseUrl = config["App:BaseUrl"] ?? "https://creator-companion-web.vercel.app";
        var resetLink  = $"{appBaseUrl}/reset-password?token={HttpUtility.UrlEncode(resetToken.Token)}";
        try
        {
            await emailService.SendPasswordResetAsync(user.Email, resetLink);
        }
        catch (Exception ex)
        {
            // Log but don't fail — email sending is best-effort until a domain is verified
            Console.WriteLine($"[WARN] Failed to send password reset email to {user.Email}: {ex.Message}");
        }

        return resetToken.Token;
    }

    public async Task<bool> VerifyEmailAsync(string token)
    {
        var record = await db.EmailVerificationTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == token);

        if (record is null || !record.IsValid) return false;

        record.User.EmailVerified = true;
        record.User.UpdatedAt     = DateTime.UtcNow;
        db.EmailVerificationTokens.Remove(record);
        await audit.LogAsync("email.verified", record.UserId);
        await db.SaveChangesAsync();
        return true;
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

        await audit.LogAsync("password.reset", resetToken.UserId);

        // Delete the used token rather than just marking it
        db.PasswordResetTokens.Remove(resetToken);

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

        // Enforce max 5 active refresh tokens per user — revoke oldest first
        const int maxActiveTokens = 5;
        var activeTokens = await db.RefreshTokens
            .Where(t => t.UserId == user.Id && t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();

        if (activeTokens.Count >= maxActiveTokens)
        {
            var toRevoke = activeTokens.Take(activeTokens.Count - maxActiveTokens + 1);
            foreach (var old in toRevoke)
                old.RevokedAt = DateTime.UtcNow;
        }

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
