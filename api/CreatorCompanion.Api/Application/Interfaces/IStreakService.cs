namespace CreatorCompanion.Api.Application.Interfaces;

public interface IStreakService
{
    Task<StreakResult> ComputeAsync(Guid userId);

    /// <summary>
    /// Returns every COMPLETED past streak for the user, most recent first,
    /// with the longest one flagged as the personal best. Excludes the
    /// currently-ongoing streak (if any) — that's already exposed via
    /// <see cref="ComputeAsync"/>.
    ///
    /// "Streak" here matches the same definition used by ComputeLongestStreak:
    /// a maximal run of distinct entry dates where consecutive entries are
    /// 1 calendar day apart, OR the gap is fully covered by an active pause.
    /// </summary>
    Task<List<StreakHistoryItem>> GetHistoryAsync(Guid userId);
}

public record StreakResult(
    int CurrentStreak,
    int LongestStreak,
    int TotalEntries,
    int TotalMediaCount,
    int TotalActiveDays,
    DateOnly? LastEntryDate,
    bool IsPaused,
    Guid? ActivePauseId,
    DateOnly? PauseStart,
    DateOnly? PauseEnd,
    int PauseDaysUsedThisMonth
);

public record StreakHistoryItem(
    DateOnly StartDate,
    DateOnly EndDate,
    int Days,
    int EntryCount,
    bool IsPersonalBest
);
