namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Checks proposed passwords against the Have I Been Pwned (HIBP)
/// "Pwned Passwords" database via the k-anonymity API.
///
/// Used at three password-creation sites — registration, password
/// change, password reset — to reject credentials that have appeared
/// in known public breaches. Defends against credential stuffing
/// (the modern dominant brute-force vector: attackers replay
/// breach lists rather than guessing).
///
/// Privacy posture: the API NEVER receives the password or the
/// full hash. The client SHA-1 hashes locally and sends only the
/// first 5 characters of the hex hash; HIBP responds with ~500
/// candidate suffixes and we check locally. This is the standard
/// pattern used by 1Password, Bitwarden, Chrome, Edge, etc.
///
/// Operational posture: **fails open** on transport errors. If
/// HIBP is unreachable, slow, or returns a 5xx, we log to Sentry
/// and let the password through. HIBP being down should never
/// block a legitimate user from creating an account or changing
/// their password.
/// </summary>
public interface IPasswordSafetyService
{
    /// <summary>
    /// Throws <see cref="System.InvalidOperationException"/> if the
    /// password has appeared in a known breach. No-op (silent
    /// success) otherwise — including the fail-open path on
    /// HIBP transport errors.
    ///
    /// Caller should map the exception to a friendly 400-class
    /// response. The exception Message is already user-facing.
    /// </summary>
    Task EnsurePasswordSafeAsync(string password, CancellationToken ct = default);
}
