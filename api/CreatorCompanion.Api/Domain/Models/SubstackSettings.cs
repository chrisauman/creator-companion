namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Singleton-ish settings row for the automated Substack Notes poster.
/// Only one row is ever expected (Id=1 by convention). Holds the
/// encrypted session cookie, scheduling window, and last-known health
/// state for the background worker. The Active toggle gates the whole
/// pipeline — flipped to false automatically on a 401 from Substack so
/// we stop hammering until the admin re-pastes a fresh cookie.
/// </summary>
public class SubstackSettings
{
    public int Id { get; set; }

    /// <summary>
    /// AES-GCM-encrypted Substack session cookie value (the substack.sid
    /// cookie copied out of the admin's browser DevTools). Stored as
    /// base64 of the ciphertext+nonce+tag bundle. Null until the admin
    /// pastes one in.
    /// </summary>
    public string? CookieEncrypted { get; set; }

    /// <summary>
    /// IANA tz id (e.g. "America/Los_Angeles") used to compute the local
    /// 06:00–22:00 posting window. Defaults to UTC.
    /// </summary>
    public string TimeZoneId { get; set; } = "UTC";

    /// <summary>
    /// Master kill-switch. False until the admin pastes a cookie and
    /// explicitly enables. Auto-flipped to false by the worker on 401
    /// so failed-auth doesn't loop indefinitely.
    /// </summary>
    public bool Active { get; set; } = false;

    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public string? LastFailureMessage { get; set; }

    /// <summary>
    /// Resets to 0 on each successful post. Used to surface "this is on
    /// fire" in the admin UI without grepping logs.
    /// </summary>
    public int ConsecutiveFailures { get; set; } = 0;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
