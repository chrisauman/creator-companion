namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Singleton-ish settings row for the Marketing auto-poster (Id=1 by
/// convention). Holds the GLOBAL kill switch and last-run metadata for
/// the daily summary email. Per-platform enable flags + health live on
/// <see cref="SocialAccount"/>; this row is the one master switch and
/// the place the worker records "I sent today's summary already."
/// </summary>
public class SocialSettings
{
    public int Id { get; set; }

    /// <summary>
    /// Global master switch for the whole daily auto-poster. False keeps
    /// the entire pipeline dark regardless of per-platform Enabled flags
    /// — the "kill switch" the admin chose over a review queue. Default
    /// false so nothing posts until the admin deliberately turns it on.
    /// </summary>
    public bool AutoPostEnabled { get; set; } = false;

    /// <summary>
    /// Append LLM-generated hashtags to daily auto-posts. Independent of
    /// the per-ad-hoc-post toggle. Default true — the feature's whole
    /// point is auto-hashtagging — but degrades gracefully to no hashtags
    /// when the Anthropic key is unset (see HashtagService).
    /// </summary>
    public bool AutoHashtagsEnabled { get; set; } = true;

    /// <summary>
    /// Attach an auto-generated branded quote card (image of the spark)
    /// to each daily post on platforms that support images. Default true —
    /// image posts get more reach. Degrades to text-only if the renderer
    /// is unavailable (fonts missing) or the platform is text-only.
    /// </summary>
    public bool DailyQuoteCardsEnabled { get; set; } = true;

    /// <summary>
    /// Date (in the schedule timezone) the daily summary email was last
    /// sent. Dedupes the once-per-day summary so a worker that ticks
    /// every 60s doesn't email a summary on every tick after the day's
    /// posts complete.
    /// </summary>
    public DateOnly? LastSummarySentForDate { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
