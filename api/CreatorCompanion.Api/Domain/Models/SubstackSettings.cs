namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Singleton-ish settings row for the daily-spark reminder pipeline.
/// Only one row is ever expected (Id=1 by convention). Holds the
/// active toggle and the last-known health state for the background
/// worker.
///
/// History — this used to store the AES-GCM-encrypted Substack session
/// cookie + admin's local timezone for the random 6am–10pm posting
/// window. That cookie-stealing path was abandoned (cookies expired
/// weekly and there's no real Substack posting API). The reminder now
/// runs at a hardcoded 7am America/New_York; the TimeZoneId and
/// CookieEncrypted columns are scheduled for removal in the next
/// migration. Plan history (SubstackDailyPlans) is preserved untouched
/// — those rows still represent "this spark was sent."
/// </summary>
public class SubstackSettings
{
    public int Id { get; set; }

    /// <summary>
    /// Master toggle. False until the admin explicitly enables. When
    /// true, the worker fires one reminder email per day at 07:00
    /// America/New_York. The historical "auto-flip to false on 401"
    /// path is gone — email sends don't have an auth-expired failure
    /// mode equivalent to a stale cookie.
    /// </summary>
    public bool Active { get; set; } = false;

    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public string? LastFailureMessage { get; set; }

    /// <summary>
    /// Resets to 0 on each successful send. Used to surface "this is on
    /// fire" in the admin UI without grepping logs.
    /// </summary>
    public int ConsecutiveFailures { get; set; } = 0;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
