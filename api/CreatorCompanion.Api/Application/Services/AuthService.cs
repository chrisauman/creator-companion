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

public class AuthService(AppDbContext db, IConfiguration config, IEmailService emailService, IAuditService audit, IStorageService storage) : IAuthService
{
    // Lockout configuration. Per-account counter is persisted on the
    // User row so it survives Railway redeploys and applies globally
    // across replicas (the previous static-Dictionary implementation
    // reset on every restart and counted per-instance — attackers
    // could defeat it by waiting for a redeploy or being routed to a
    // different replica). The IP-tier of throttling lives in
    // AspNetCoreRateLimit; this is the per-account gate.
    private const int MaxFailedAttempts = 10;
    private static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(15);

    // Target work factor for new and rehashed BCrypt hashes. OWASP
    // 2024+ recommends ≥12; legacy hashes at factor 10 are upgraded
    // transparently the next time the user authenticates.
    private const int BCryptWorkFactor = 12;

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var emailExists = await db.Users.AnyAsync(u => u.Email == request.Email.ToLower());
        if (emailExists)
            throw new InvalidOperationException("An account with that email already exists.");

        var user = new User
        {
            FirstName = request.FirstName.Trim(),
            LastName  = request.LastName.Trim(),
            Email = request.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, BCryptWorkFactor),
            TimeZoneId = request.TimeZoneId,
            // 10-day free trial — full access during this window. After
            // expiration, EntitlementService.HasAccess returns false and
            // every write returns HTTP 402 until the user subscribes.
            // No Stripe interaction at signup — that happens only when
            // the user explicitly subscribes via /v1/stripe/checkout.
            TrialEndsAt = DateTime.UtcNow.AddDays(10)
        };

        db.Users.Add(user);
        await audit.LogAsync("user.registered", user.Id, $"email={user.Email}");

        // Create email verification token (best-effort — email may not send until domain is set up).
        // The plain token is mailed; only the SHA-256 hash is persisted.
        var verifyPlain = GenerateSecureToken();
        var verificationToken = new Domain.Models.EmailVerificationToken
        {
            UserId    = user.Id,
            Token     = string.Empty,
            TokenHash = HashToken(verifyPlain),
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

        // Pre-create five reminder slots — all noon, all disabled. The
        // notifications page renders these as five fixed slots; the
        // user toggles individual ones on. When push is first enabled
        // the frontend calls auto-enable-first to flip slot #1 on so
        // they get at least one active reminder out of the box.
        // Sequential CreatedAt offsets give a stable slot ordering.
        var reminderNow = DateTime.UtcNow;
        for (var i = 0; i < 5; i++)
        {
            db.Reminders.Add(new Reminder
            {
                UserId    = user.Id,
                Time      = new TimeOnly(12, 0),
                Message   = null,
                IsEnabled = false,
                IsDefault = false,
                CreatedAt = reminderNow.AddMilliseconds(i),
                UpdatedAt = reminderNow.AddMilliseconds(i)
            });
        }

        await db.SaveChangesAsync();

        var result = await IssueTokensAsync(user);

        // Send verification email (best-effort)
        try
        {
            var appBaseUrl  = config["App:BaseUrl"] ?? "https://creator-companion-web.vercel.app";
            var verifyLink  = $"{appBaseUrl}/verify-email?token={System.Web.HttpUtility.UrlEncode(verifyPlain)}";
            await emailService.SendVerificationEmailAsync(user.Email, verifyLink);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WARN] Failed to send verification email to {user.Email}: {ex.Message}");
        }

        // Send welcome email (best-effort)
        try { await emailService.SendWelcomeAsync(user.Email, user.FirstName); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Failed to send welcome email to {user.Email}: {ex.Message}"); }

        return result;
    }

    // Constant-time dummy BCrypt hash used to equalize the timing of
    // "user does not exist" vs "wrong password". Hashed once at static
    // init at the current work factor so verify-against-dummy takes
    // the same ~time as verify-against-real on a brand-new account.
    private static readonly string DummyHash =
        BCrypt.Net.BCrypt.HashPassword("\0timing-equalization-dummy\0", BCryptWorkFactor);

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var identifier = request.Email.ToLower();

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email == identifier);

        // Per-account lockout check. Uses the same "Invalid credentials"
        // message as wrong-password so a distinct lockout response
        // can't be used to confirm an email exists (an attacker who
        // deliberately locks the target would otherwise read the
        // distinct message and learn membership).
        if (user is not null && user.LockedUntil.HasValue && user.LockedUntil > DateTime.UtcNow)
        {
            // Still run BCrypt against the dummy so total time matches
            // the wrong-password path. Otherwise lockout returns
            // measurably faster than a normal failure.
            _ = BCrypt.Net.BCrypt.Verify(request.Password, DummyHash);
            await audit.LogAsync("login.locked_out", user.Id);
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        // Always run BCrypt.Verify even when the user doesn't exist so
        // the unknown-email path can't be distinguished from the
        // wrong-password path by timing.
        bool passwordOk = user is not null
            ? BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash)
            : BCrypt.Net.BCrypt.Verify(request.Password, DummyHash) && false;

        if (user is null || !passwordOk)
        {
            if (user is not null)
            {
                user.FailedLoginCount += 1;
                if (user.FailedLoginCount >= MaxFailedAttempts)
                    user.LockedUntil = DateTime.UtcNow.Add(LockoutWindow);
                await db.SaveChangesAsync();
            }
            await audit.LogAsync("login.failed", user?.Id, $"email={identifier}");
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        if (!user.IsActive)
            throw new UnauthorizedAccessException("Invalid credentials.");

        // Successful login — reset the lockout counter and (if the
        // stored hash uses a weaker work factor than current policy)
        // transparently rehash the password at the new factor so old
        // accounts catch up without forcing a reset flow.
        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        if (NeedsRehash(user.PasswordHash))
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, BCryptWorkFactor);
            user.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();

        await audit.LogAsync("login.success", user.Id);
        return await IssueTokensAsync(user);
    }

    /// <summary>
    /// True when the stored hash's BCrypt work factor is below the
    /// current policy. Used to opportunistically rehash on successful
    /// login. BCrypt hashes look like `$2a$10$saltsaltsaltsalt…`; the
    /// number after the second `$` is the work factor (base-2 cost).
    /// </summary>
    private static bool NeedsRehash(string hash)
    {
        if (string.IsNullOrEmpty(hash) || hash.Length < 7 || hash[0] != '$') return false;
        var parts = hash.Split('$', 4);
        if (parts.Length < 4) return false;
        return int.TryParse(parts[2], out var cost) && cost < BCryptWorkFactor;
    }

    public async Task<AuthResponse> RefreshAsync(string refreshToken)
    {
        // Hash-lookup first (new tokens are stored hash-only); fall back
        // to the legacy plain-Token column for tokens issued before the
        // at-rest-hash rollout. The fallback can be removed once the
        // refresh-token TTL (30 days) has elapsed since rollout.
        var hash = HashToken(refreshToken);
        var token = await db.RefreshTokens
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.TokenHash == hash)
            ?? await db.RefreshTokens
                .Include(r => r.User)
                .FirstOrDefaultAsync(r => r.Token == refreshToken);

        if (token is null || !token.IsActive)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Also reject if the user has been admin-deactivated since the
        // token was issued. Otherwise an attacker-controlled refresh
        // token continues working for up to 30 days after IsActive=false.
        if (!token.User.IsActive)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Atomic rotate: only ONE concurrent caller wins. Without this,
        // two simultaneous /v1/auth/refresh calls (two tabs racing on
        // session expiry, or token-theft replay) both pass the IsActive
        // check, both issue new refresh tokens, and we end up with two
        // active sessions per stolen token. ExecuteUpdateAsync compiles
        // to a single UPDATE ... WHERE RevokedAt IS NULL, returning the
        // affected-rows count — only one caller sees 1 and proceeds.
        var now = DateTime.UtcNow;
        var revoked = await db.RefreshTokens
            .Where(r => r.Id == token.Id && r.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, now));

        if (revoked == 0)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        return await IssueTokensAsync(token.User);
    }

    public async Task RevokeAsync(string refreshToken, string? requestingUserId = null)
    {
        var hash = HashToken(refreshToken);
        var token = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash)
            ?? await db.RefreshTokens.FirstOrDefaultAsync(r => r.Token == refreshToken);
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

        // Timing equalization: an attacker observing response latency
        // can otherwise distinguish "email registered" (1 DB lookup +
        // 1 DELETE + 1 INSERT + 1 SaveChanges + Resend HTTP call) from
        // "email not registered" (1 DB lookup, return immediately). We
        // do dummy work for the unknown path so the latency profile is
        // similar. Not a substitute for proper rate limiting (already
        // enforced via AspNetCoreRateLimit on /v1/auth/forgot-password)
        // but defense in depth.
        if (user is null)
        {
            // Mirror the cost of the real path with the equivalent
            // crypto + DB read time. We can't perfectly match the
            // network-bound Resend call, but generating a token and
            // hashing it is the main per-request cost on our side.
            _ = HashToken(GenerateSecureToken());
            await db.Users.AnyAsync(u => u.Id == Guid.Empty);
            return string.Empty;
        }

        // Invalidate any existing unused tokens for this user
        var existing = await db.PasswordResetTokens
            .Where(t => t.UserId == user.Id && t.UsedAt == null)
            .ToListAsync();
        db.PasswordResetTokens.RemoveRange(existing);

        // Plain token is mailed to the user; only the hash is persisted.
        var resetPlain = GenerateSecureToken();
        var resetToken = new Domain.Models.PasswordResetToken
        {
            UserId    = user.Id,
            Token     = string.Empty,
            TokenHash = HashToken(resetPlain),
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        };
        db.PasswordResetTokens.Add(resetToken);
        await db.SaveChangesAsync();

        var appBaseUrl = config["App:BaseUrl"] ?? "https://creator-companion-web.vercel.app";
        var resetLink  = $"{appBaseUrl}/reset-password?token={HttpUtility.UrlEncode(resetPlain)}";
        try
        {
            await emailService.SendPasswordResetAsync(user.Email, resetLink);
        }
        catch (Exception ex)
        {
            // Log but don't fail — email sending is best-effort until a domain is verified
            Console.WriteLine($"[WARN] Failed to send password reset email to {user.Email}: {ex.Message}");
        }

        // Return the plain token so the Development handler can surface
        // it back to the dev (controller already gates on env); never
        // store the plain value past this point.
        return resetPlain;
    }

    public async Task<bool> VerifyEmailAsync(string token)
    {
        var hash = HashToken(token);
        var record = await db.EmailVerificationTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash)
            ?? await db.EmailVerificationTokens
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
        var hash = HashToken(token);
        var resetToken = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash)
            ?? await db.PasswordResetTokens
                .Include(t => t.User)
                .FirstOrDefaultAsync(t => t.Token == token);

        if (resetToken is null || !resetToken.IsValid)
            throw new InvalidOperationException("Reset link is invalid or has expired.");

        resetToken.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, BCryptWorkFactor);
        resetToken.User.UpdatedAt = DateTime.UtcNow;
        // Reset password is the canonical "I've recovered my account"
        // signal — clear any lingering lockout so the user can sign in
        // immediately on the next request.
        resetToken.User.FailedLoginCount = 0;
        resetToken.User.LockedUntil = null;

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

        try { await emailService.SendPasswordChangedAsync(resetToken.User.Email); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Failed to send password changed email: {ex.Message}"); }
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
        var refreshPlain = GenerateSecureToken();
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            // New tokens are stored as SHA-256 digest only — the raw
            // value is returned to the client (cookie + JSON) but never
            // persisted. Plain `Token` stays empty for new rows.
            Token = string.Empty,
            TokenHash = HashToken(refreshPlain),
            ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
        };
        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync();

        return new AuthResponse(
            accessToken,
            refreshPlain,
            expiresAt,
            new UserSummary(
                user.Id,
                user.FirstName,
                user.LastName,
                user.Email,
                user.Tier.ToString(),
                user.TimeZoneId,
                user.OnboardingCompleted,
                string.IsNullOrEmpty(user.ProfileImagePath) ? null : storage.GetUrl(user.ProfileImagePath)));
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
            new Claim("firstName", user.FirstName),
            new Claim("lastName", user.LastName),
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

    /// <summary>
    /// SHA-256 hex digest of a token. Tokens are 64 random bytes
    /// (high entropy), so a plain digest is sufficient — no HMAC
    /// secret needed, no rainbow-table risk. Used for the at-rest
    /// hash columns on RefreshToken / PasswordResetToken /
    /// EmailVerificationToken.
    /// </summary>
    internal static string HashToken(string raw)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(raw);
        var digest = SHA256.HashData(bytes);
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}
