namespace CreatorCompanion.Api.Application.Interfaces;

public interface IStreakService
{
    Task<StreakResult> ComputeAsync(Guid userId);
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
