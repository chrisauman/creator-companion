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

public class AuthService(
    AppDbContext db,
    IConfiguration config,
    IEmailService emailService,
    IAuditService audit,
    IStorageService storage,
    IWelcomeEntryService welcomeEntry,
    IPasswordSafetyService passwordSafety,
    IUserStampService stampService,
    ILogger<AuthService> logger) : IAuthService
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
        // HIBP compromised-password check. Runs before the email-exists
        // check so a leaked credential rejection wins over "email is
        // taken" — the user benefits from learning their password is
        // compromised even if they're trying to re-register an existing
        // account. Fail-open path (HIBP unreachable) silently allows
        // the password through; see HibpPasswordSafetyService for
        // rationale. Throws InvalidOperationException with a user-
        // facing message that surfaces as the controller's BadRequest
        // body via the existing catch in AuthController.Register.
        await passwordSafety.EnsurePasswordSafeAsync(request.Password);

        // First-pass exists check — fast common path. The unique index
        // on User.Email (configured in UserConfiguration) is the real
        // authority; the check below + the catch-on-SaveChanges below
        // close the race where two concurrent registrations for the
        // same email both pass this check.
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
            // Trial is NOT granted at registration anymore (Risk #6
            // closure, 2026-05-27). VerifyEmailAsync grants TrialEndsAt
            // when the user proves ownership of their email. Until
            // then the unverified-email guard middleware in Program.cs
            // returns 402 with code: "email_unverified" on any
            // non-allowlisted endpoint, and the frontend's verify-email
            // takeover screen handles the UX. Leaving TrialEndsAt null
            // also keeps the trial-lifecycle email worker from firing
            // any of the 3d / 1d / ended reminders (their queries all
            // require TrialEndsAt IS NOT NULL).
            TrialEndsAt = null
        };

        db.Users.Add(user);
        await audit.LogAsync("user.registered", user.Id, $"email={user.Email}");

        // Create email verification token (best-effort — email may not send until domain is set up).
        // The plain token is mailed; only the SHA-256 hash is persisted.
        // We mirror the hash into the legacy `Token` column too — it
        // pre-exists with a UNIQUE index from before the at-rest-hash
        // rollout, so writing empty strings here would collide on the
        // second insert (the unique-constraint outage of May 2026).
        // The hash is cryptographically unique so the constraint is
        // satisfied, and storing a hash (not a plain token) preserves
        // the at-rest security guarantee.
        var verifyPlain = GenerateSecureToken();
        var verifyHash  = HashToken(verifyPlain);
        var verificationToken = new Domain.Models.EmailVerificationToken
        {
            UserId    = user.Id,
            Token     = verifyHash,
            TokenHash = verifyHash,
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

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex, "Email"))
        {
            // Two concurrent registrations for the same email both
            // passed the AnyAsync check; the unique index on Email
            // (UserConfiguration) catches the loser. Translate the
            // raw 23505 into a friendly conflict instead of leaking
            // a DB error to the caller.
            throw new InvalidOperationException("An account with that email already exists.");
        }

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

        // Seed the brand-new account with a "Hello World" entry so the
        // journal isn't empty on first visit. Service swallows its own
        // failures — registration succeeds either way.
        await welcomeEntry.SeedAsync(user.Id, journal.Id, user.TimeZoneId);

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

        if (token is null)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Reuse detection: an ALREADY-REVOKED token being presented means a
        // rotated (dead) token was replayed — the classic token-theft signal.
        // Revoke the entire session family so neither the attacker's nor the
        // victim's chain survives; the legitimate user simply logs in again.
        // Legacy rows (FamilyId == Guid.Empty, pre-migration) are exempt — they
        // fall through to plain rejection so one old replay can't nuke them all.
        if (token.IsRevoked && token.FamilyId != Guid.Empty)
        {
            if (db.Database.IsRelational())
                await db.RefreshTokens
                    .Where(r => r.FamilyId == token.FamilyId && r.RevokedAt == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow));
            else
            {
                var fam = await db.RefreshTokens.Where(r => r.FamilyId == token.FamilyId && r.RevokedAt == null).ToListAsync();
                foreach (var t in fam) t.RevokedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            Sentry.SentrySdk.CaptureMessage($"Refresh-token reuse detected (family {token.FamilyId}); session revoked.");
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");
        }

        if (!token.IsActive)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Also reject if the user has been admin-deactivated since the
        // token was issued. Otherwise an attacker-controlled refresh
        // token continues working for up to 30 days after IsActive=false.
        if (!token.User.IsActive)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Absolute session cap: force re-login once a session has lived longer
        // than the hard limit, regardless of how often it's been refreshed —
        // bounds the lifetime of a silently-stolen token that's never replayed.
        var absoluteDays = config.GetValue<int>("Jwt:AbsoluteSessionDays", 60);
        if (token.FamilyId != Guid.Empty && DateTime.UtcNow - token.SessionStartedAt > TimeSpan.FromDays(absoluteDays))
            throw new UnauthorizedAccessException("Session expired. Please sign in again.");

        // Atomic rotate: only ONE concurrent caller wins. Without this,
        // two simultaneous /v1/auth/refresh calls (two tabs racing on
        // session expiry, or token-theft replay) both pass the IsActive
        // check, both issue new refresh tokens, and we end up with two
        // active sessions per stolen token. ExecuteUpdateAsync compiles
        // to a single UPDATE ... WHERE RevokedAt IS NULL, returning the
        // affected-rows count — only one caller sees 1 and proceeds.
        //
        // InMemoryDatabase doesn't implement ExecuteUpdateAsync; tests
        // fall back to read-modify-write (sufficient for single-threaded
        // test scenarios, the race protection is real-DB-only).
        var now = DateTime.UtcNow;
        int revoked;
        if (db.Database.IsRelational())
        {
            revoked = await db.RefreshTokens
                .Where(r => r.Id == token.Id && r.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, now));
        }
        else
        {
            if (token.RevokedAt is not null)
                revoked = 0;
            else
            {
                token.RevokedAt = now;
                await db.SaveChangesAsync();
                revoked = 1;
            }
        }

        if (revoked == 0)
            throw new UnauthorizedAccessException("Invalid or expired refresh token.");

        // Rotation: the new token inherits this token's family + session start.
        return await IssueTokensAsync(token.User, rotatingFrom: token);
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
        // Token column mirrors TokenHash — see EmailVerificationToken
        // comment for why (legacy UNIQUE index requires unique value).
        var resetPlain = GenerateSecureToken();
        var resetHash  = HashToken(resetPlain);
        var resetToken = new Domain.Models.PasswordResetToken
        {
            UserId    = user.Id,
            Token     = resetHash,
            TokenHash = resetHash,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        };
        db.PasswordResetTokens.Add(resetToken);
        await db.SaveChangesAsync();

        var appBaseUrl = config["App:BaseUrl"] ?? "https://creator-companion-web.vercel.app";
        var resetLink  = $"{appBaseUrl}/reset-password?token={HttpUtility.UrlEncode(resetPlain)}";
        try
        {
            await emailService.SendPasswordResetAsync(user.Email, resetLink);
            logger.LogInformation("Sent password reset email to {Email}", user.Email);
        }
        catch (Exception ex)
        {
            // Log structured warning so Railway logs surface the real
            // cause (Resend auth failure / domain unverified / network).
            // Previously this was Console.WriteLine which got buried in
            // the firehose and was effectively silent — the May 2026
            // "no reset email ever arrived" incident burned 15 days
            // before we noticed.
            logger.LogWarning(ex,
                "Failed to send password reset email to {Email}. " +
                "Check Resend dashboard, Resend__ApiKey and Resend__FromEmail config.",
                user.Email);
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

        // Grant the 10-day free trial on first verification. The TRIAL
        // STARTS NOW, not at registration — closes Risk #6 (sign up
        // with any email, get 10 days of access without ever proving
        // ownership of it). The `is null` guard prevents a re-verify
        // race or a second registered email link from resetting the
        // clock on an already-running trial.
        if (record.User.TrialEndsAt is null)
        {
            record.User.TrialEndsAt = DateTime.UtcNow.AddDays(10);
        }

        // Bump SecurityStamp so any open session with a pre-verification
        // JWT (verified=false claim) is force-refreshed on the next API
        // call. The refresh issues a new JWT with verified=true, and the
        // unverified-guard middleware then lets the user through. Pairs
        // with the OnTokenValidated handler in Program.cs.
        record.User.SecurityStamp = Guid.NewGuid().ToString("N");

        db.EmailVerificationTokens.Remove(record);
        await audit.LogAsync("email.verified", record.UserId);
        await db.SaveChangesAsync();
        stampService.Invalidate(record.UserId);
        return true;
    }

    /// <summary>
    /// Re-sends a verification email. Used by the in-app "didn't get the
    /// link?" button on the post-registration verify-email screen.
    ///
    /// Privacy: the response is identical regardless of whether the
    /// email is registered (the controller surfaces only a generic
    /// "if that email exists, we sent a new link" message). We DO
    /// short-circuit when the user is already verified — there's
    /// nothing to send and no enumeration value in distinguishing
    /// because the verify-email screen is only ever shown to
    /// signed-in users who already know their own state.
    /// </summary>
    public async Task ResendVerificationAsync(string email)
    {
        // Lowercase to match RegisterAsync's storage convention.
        var normalized = (email ?? string.Empty).Trim().ToLowerInvariant();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalized);
        if (user is null) return;
        if (user.EmailVerified)  return;

        // Invalidate any outstanding (un-expired) verification tokens
        // for this user — issuing multiple live links is fine, but
        // dropping the old ones reduces the surface area in the
        // (unlikely) event one is intercepted.
        // Used tokens are hard-deleted by VerifyEmailAsync, so "live"
        // tokens are simply those whose ExpiresAt is still in the
        // future. Drop them to keep one live token at a time.
        var stale = await db.EmailVerificationTokens
            .Where(t => t.UserId == user.Id && t.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        db.EmailVerificationTokens.RemoveRange(stale);

        var plain = GenerateSecureToken();
        var hash  = HashToken(plain);
        db.EmailVerificationTokens.Add(new EmailVerificationToken
        {
            UserId    = user.Id,
            Token     = hash, // mirror into legacy column for unique-constraint compat
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        });

        await db.SaveChangesAsync();

        var webBaseUrl = config["Web:BaseUrl"] ?? "https://app.creatorcompanionapp.com";
        var link = $"{webBaseUrl.TrimEnd('/')}/verify-email?token={HttpUtility.UrlEncode(plain)}";
        try { await emailService.SendVerificationEmailAsync(user.Email, link); }
        catch (Exception ex) { logger.LogWarning(ex, "ResendVerification email send failed for {UserId}", user.Id); }
        await audit.LogAsync("email.verification_resent", user.Id);
    }

    public async Task ResetPasswordAsync(string token, string newPassword)
    {
        // HIBP compromised-password check runs FIRST so a bad new
        // password is rejected before we commit any state changes.
        // Token validation runs after — a malicious caller who guesses
        // a reset token still has to also submit a non-compromised
        // password, but legitimate users who submit a compromised
        // password get the clear "choose a different one" message
        // without their valid reset token being consumed.
        await passwordSafety.EnsurePasswordSafeAsync(newPassword);

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
        // Bump SecurityStamp so every outstanding access token for this
        // user fails the OnTokenValidated stamp check on its next request.
        // Refresh-token revocation (just below) closes the session-renewal
        // path; the stamp bump closes the "attacker already minted a
        // JWT and is using it now" path within the cache TTL (~2 min,
        // typically much less because the next bullet calls Invalidate).
        resetToken.User.SecurityStamp = Guid.NewGuid().ToString("N");

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
        // Drop the cached stamp so the new value is visible to the
        // very next request (don't wait the 2-min TTL).
        stampService.Invalidate(resetToken.UserId);

        try { await emailService.SendPasswordChangedAsync(resetToken.User.Email); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Failed to send password changed email: {ex.Message}"); }
    }

    private async Task<AuthResponse> IssueTokensAsync(User user, RefreshToken? rotatingFrom = null)
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

        var refreshDays  = config.GetValue<int>("Jwt:RefreshExpiryDays", 30);
        var refreshPlain = GenerateSecureToken();
        var refreshHash  = HashToken(refreshPlain);
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            // New tokens are stored as SHA-256 digest only — the raw
            // refresh value goes to the client (cookie + JSON) and is
            // NEVER persisted. We mirror the hash into the legacy
            // `Token` column because that column predates the at-rest
            // hash rollout and still has a UNIQUE index on it; writing
            // empty strings here collides on the SECOND login (the
            // unique-constraint outage of May 2026 that took down
            // login project-wide). Hash values are cryptographically
            // unique so the constraint is satisfied, and storing a
            // hash (not a plain token) preserves the at-rest security
            // guarantee. The legacy-plain-Token fallback in
            // RefreshAsync still works for OLD rows written before
            // this rollout; once those age out (30 days), the Token
            // column can be dropped entirely.
            Token = refreshHash,
            TokenHash = refreshHash,
            // Rotation inherits the family + original session start. A fresh
            // login/register — OR a rotation off a legacy pre-migration token
            // (FamilyId == Guid.Empty) — begins a new protected session, so old
            // sessions upgrade into reuse-detection + the absolute cap on their
            // next refresh rather than staying exempt forever.
            FamilyId = rotatingFrom is { } rf && rf.FamilyId != Guid.Empty ? rf.FamilyId : Guid.NewGuid(),
            SessionStartedAt = rotatingFrom is { } rs && rs.FamilyId != Guid.Empty ? rs.SessionStartedAt : DateTime.UtcNow,
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

        // JWT carries only what's strictly needed to authorize the
        // request: subject (user id), role, and a unique JTI. Audited
        // 2026-05-25 — the prior `email`, `firstName`, `lastName`, and
        // `tier` claims rode every request in the Authorization header
        // (so visible to any TLS-inspecting proxy: corporate firewall,
        // browser extension with broad perms, debug tooling, screen
        // share of dev tools, etc.) but were not actually read by the
        // frontend (which calls /v1/users/me when it needs profile
        // detail). Removing them eliminates a continuous PII broadcast
        // for zero functional cost.
        var claimsList = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            // Per-user SecurityStamp. Validated on every request by the
            // JwtBearer OnTokenValidated handler in Program.cs against
            // the current row value (cached ~2 min). Bumping the row's
            // SecurityStamp therefore invalidates every outstanding
            // JWT for the user within the cache TTL — closes the
            // admin-demotion window and tightens password-change /
            // reset / deactivate revocation. See IUserStampService
            // for the lookup model and ALL call sites that bump.
            new Claim("stamp", user.SecurityStamp)
        };
        // Present-when-true only. The middleware (and entitlement
        // checks) treat a missing claim as "unverified" — except for
        // the legacy-grace path (pre-rollout JWTs with no claim at
        // all), where a DB lookup confirms the user's actual state.
        // Verifying the email bumps SecurityStamp so any open session
        // gets force-refreshed and the new JWT carries verified=true.
        if (user.EmailVerified)
            claimsList.Add(new Claim("verified", "true"));
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
    /// Detects whether a DbUpdateException is a Postgres unique-index
    /// violation (SQLSTATE 23505) on the named column. Used to
    /// translate concurrent-insert losers into clean conflict errors
    /// instead of leaking a raw DB exception to the caller.
    /// </summary>
    private static bool IsUniqueViolation(DbUpdateException ex, string columnHint)
    {
        // Npgsql sets InnerException to PostgresException with SqlState 23505.
        if (ex.InnerException is Npgsql.PostgresException pg &&
            pg.SqlState == "23505")
        {
            // ConstraintName / Detail typically contain the column name.
            var detail = (pg.Detail ?? string.Empty) + " " + (pg.ConstraintName ?? string.Empty);
            return detail.Contains(columnHint, StringComparison.OrdinalIgnoreCase);
        }
        return false;
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
