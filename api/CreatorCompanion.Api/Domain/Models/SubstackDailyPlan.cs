namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Status of a SubstackDailyPlan row through its lifecycle. Stored as
/// the int value in Postgres so renames don't break existing rows.
/// </summary>
public enum SubstackPlanStatus
{
    Pending = 0,
    Posted  = 1,
    Failed  = 2,
}

/// <summary>
/// One row per calendar date (in the admin's configured timezone) that
/// the auto-poster runs. Created lazily at the start of each day by
/// the worker: pick a never-posted spark, roll a random ScheduledFor
/// within the 06:00–22:00 local window, persist with status=Pending.
/// Worker then fires when now >= ScheduledFor.
///
/// Idempotence comes from the unique index on Date — even if two
/// worker ticks race, only one row per date can be inserted.
/// "Never-posted" is enforced at selection time by anti-joining the
/// Posted rows of this same table; we don't add a flag on the spark.
/// </summary>
public class SubstackDailyPlan
{
    public int Id { get; set; }

    /// <summary>
    /// Calendar date in the admin's local timezone. Unique — at most
    /// one plan row per day.
    /// </summary>
    public DateOnly Date { get; set; }

    /// <summary>
    /// The spark (motivation entry) chosen for this day. FK; never
    /// chosen twice across the whole table (enforced by the picker, not
    /// the schema).
    /// </summary>
    public Guid SparkId { get; set; }
    public MotivationEntry? Spark { get; set; }

    /// <summary>
    /// UTC timestamp at which the worker should fire the post. Rolled
    /// at plan creation as a uniform random within the user-local
    /// 06:00–22:00 window for the given Date.
    /// </summary>
    public DateTime ScheduledFor { get; set; }

    public SubstackPlanStatus Status { get; set; } = SubstackPlanStatus.Pending;

    public DateTime? PostedAt { get; set; }

    /// <summary>
    /// The note id Substack returns from the create-note endpoint, on
    /// success. Useful for building a "view note" link in the admin UI.
    /// </summary>
    public string? SubstackNoteId { get; set; }

    /// <summary>
    /// Last error encountered; cleared on retry. Survives in the row so
    /// the admin can read it without going to logs.
    /// </summary>
    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
