using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// One row per (calendar date, platform) the daily auto-poster runs.
/// Directly modelled on the proven SubstackDailyPlan, generalised with a
/// <see cref="Platform"/> column so per-platform never-repeat tracking
/// falls out for free: the picker anti-joins Posted rows of THIS table
/// filtered to the same platform, so each platform draws independently
/// from the spark pool (the admin's chosen "independent spark per
/// platform" model).
///
/// Idempotence comes from the unique index on (Date, Platform) — even if
/// two worker ticks race across a redeploy, only one row per
/// (day, platform) can be inserted. Lifecycle: created Pending with a
/// jittered ScheduledFor; worker fires when now >= ScheduledFor and
/// flips to Posted (with PostedUrl) or Failed (with ErrorMessage).
/// </summary>
public class SocialDailyPlan
{
    public int Id { get; set; }

    /// <summary>Calendar date in the schedule's timezone (America/New_York).</summary>
    public DateOnly Date { get; set; }

    public SocialPlatform Platform { get; set; }

    /// <summary>
    /// The spark chosen for this (day, platform). Never chosen twice for
    /// the same platform (enforced by the picker anti-join, not the
    /// schema — same approach as the Substack pipeline).
    /// </summary>
    public Guid SparkId { get; set; }
    public MotivationEntry? Spark { get; set; }

    /// <summary>
    /// UTC time the worker should fire. Set at plan creation to the
    /// platform's configured local post time +/- a random jitter offset.
    /// </summary>
    public DateTime ScheduledFor { get; set; }

    public SocialPostStatus Status { get; set; } = SocialPostStatus.Pending;

    public DateTime? PostedAt { get; set; }

    /// <summary>
    /// The exact text published (spark, truncated-to-fit, plus appended
    /// hashtags). Persisted so the daily summary email and the History
    /// tab can show precisely what went out without recomputing.
    /// </summary>
    public string? PostedText { get; set; }

    /// <summary>Permalink to the published post, when the platform returns one.</summary>
    public string? PostedUrl { get; set; }

    /// <summary>Last error; cleared on retry. Survives in-row so admin reads it without logs.</summary>
    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
