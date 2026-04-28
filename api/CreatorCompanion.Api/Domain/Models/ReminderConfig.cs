namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Singleton config row (Id = 1) that controls reminder frequency throttling
/// and the default context-aware messages sent when a user has no custom message.
/// </summary>
public class ReminderConfig
{
    public int Id { get; set; } = 1;

    // ── Frequency throttle thresholds (days since user's last entry) ─────────
    /// <summary>Send daily while days-since-last-entry is at or below this value.</summary>
    public int DailyUpToDays { get; set; } = 2;

    /// <summary>Send every 2 days while days-since-last-entry is at or below this value.</summary>
    public int Every2DaysUpToDays { get; set; } = 14;

    /// <summary>Send every 3 days while days-since-last-entry is at or below this value.</summary>
    public int Every3DaysUpToDays { get; set; } = 30;

    // Beyond Every3DaysUpToDays: send once a week.

    // ── Context-aware default messages ───────────────────────────────────────
    public string MessageActiveStreak { get; set; } =
        "You're on a streak. Log today's entry and keep it going.";

    public string MessageJustBroke { get; set; } =
        "Your streak ended — but every great streak is rebuilt one day at a time. Start today.";

    public string MessageShortLapse { get; set; } =
        "It's been a few days. Jump back in — you don't have to catch up, just continue.";

    public string MessageMediumLapse { get; set; } =
        "Your creative practice misses you. Even a short entry gets you back in rhythm.";

    public string MessageLongAbsence { get; set; } =
        "Still here when you're ready. One entry is all it takes to begin again.";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
