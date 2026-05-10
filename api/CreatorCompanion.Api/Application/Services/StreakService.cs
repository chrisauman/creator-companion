using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class StreakService(AppDbContext db) : IStreakService
{
    public async Task<StreakResult> ComputeAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        var userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));

        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var monthEnd = new DateOnly(today.Year, today.Month,
            DateTime.DaysInMonth(today.Year, today.Month));

        // Load all valid entry dates (not deleted, submitted only — no drafts).
        // AsNoTracking everywhere — this is a read-only compute path called
        // on every dashboard load.
        var validDates = await db.Entries
            .AsNoTracking()
            .Where(e => e.UserId == userId && e.DeletedAt == null)
            .Select(e => e.EntryDate)
            .Distinct()
            .OrderByDescending(d => d)
            .ToListAsync();

        // Single Pauses fetch covering BOTH needs: streak bridging
        // (active pauses) AND month-usage accounting (any status, any
        // overlap with this calendar month). Was two queries; the union
        // is small (one row per pause), filter in memory.
        var pauseRows = await db.Pauses
            .AsNoTracking()
            .Where(p => p.UserId == userId &&
                       (p.Status == PauseStatus.Active ||
                        (p.StartDate <= monthEnd && p.EndDate >= monthStart)))
            .Select(p => new { p.Id, p.StartDate, p.EndDate, p.Status })
            .ToListAsync();

        var pauses = pauseRows
            .Where(p => p.Status == PauseStatus.Active)
            .Select(p => new { p.Id, p.StartDate, p.EndDate })
            .ToList();

        int pauseDaysUsedThisMonth = pauseRows
            .Where(p => p.StartDate <= monthEnd && p.EndDate >= monthStart)
            .Sum(p =>
            {
                var overlapStart = p.StartDate > monthStart ? p.StartDate : monthStart;
                var overlapEnd   = p.EndDate   < monthEnd   ? p.EndDate   : monthEnd;
                return overlapEnd >= overlapStart
                    ? overlapEnd.DayNumber - overlapStart.DayNumber + 1
                    : 0;
            });

        var totalEntries = await db.Entries
            .AsNoTracking()
            .CountAsync(e => e.UserId == userId && e.DeletedAt == null);

        var totalMedia = await db.EntryMedia
            .AsNoTracking()
            .CountAsync(m => m.UserId == userId && m.DeletedAt == null);

        var activeDays = validDates.Count;
        var lastEntryDate = validDates.FirstOrDefault();

        // Build a set of all paused dates for O(1) lookup
        var pausedDates = new HashSet<DateOnly>();
        foreach (var pause in pauses)
        {
            for (var d = pause.StartDate; d <= pause.EndDate; d = d.AddDays(1))
                pausedDates.Add(d);
        }

        var entryDateSet = new HashSet<DateOnly>(validDates);

        int currentStreak = ComputeCurrentStreak(today, entryDateSet, pausedDates);
        int longestStreak = ComputeLongestStreak(entryDateSet, pausedDates);

        // Determine active pause (most recent start date wins if somehow multiple exist)
        var activePause = pauses.OrderByDescending(p => p.StartDate).FirstOrDefault();

        return new StreakResult(
            currentStreak,
            longestStreak,
            totalEntries,
            totalMedia,
            activeDays,
            lastEntryDate == default ? null : lastEntryDate,
            IsPaused: activePause is not null,
            ActivePauseId: activePause?.Id,
            PauseStart: activePause?.StartDate,
            PauseEnd: activePause?.EndDate,
            PauseDaysUsedThisMonth: pauseDaysUsedThisMonth);
    }

    private static int ComputeCurrentStreak(
        DateOnly today,
        HashSet<DateOnly> entryDates,
        HashSet<DateOnly> pausedDates)
    {
        // Start from today (or yesterday if today has no entry and is not paused)
        // A streak is alive if today has an entry or today is paused
        var cursor = today;
        int streak = 0;

        // If today has no entry and is not paused, the streak may already be broken
        // Still count from yesterday back to allow for today not yet written
        if (!entryDates.Contains(cursor) && !pausedDates.Contains(cursor))
            cursor = cursor.AddDays(-1);

        while (entryDates.Contains(cursor) || pausedDates.Contains(cursor))
        {
            if (entryDates.Contains(cursor))
                streak++;
            // Paused days: don't increment, but don't break
            cursor = cursor.AddDays(-1);
        }

        return streak;
    }

    /// <summary>
    /// Max chapters returned by GetHistoryAsync. Keeps the response
    /// bounded for users with years of daily entries — the in-memory
    /// computation walks every date but the wire payload stays small.
    /// The streak-history UI renders all returned chapters; if you need
    /// more, add explicit pagination.
    /// </summary>
    private const int MaxHistoryChapters = 100;

    public async Task<List<StreakHistoryItem>> GetHistoryAsync(Guid userId)
    {
        // Mirrors the data-prep + grouping logic of ComputeLongestStreak,
        // but instead of returning a single max it returns every completed
        // streak with start/end/days/entryCount, and excludes the
        // currently-ongoing streak so users don't see their live streak
        // in the "past chapters" list.

        var user = await db.Users.FindAsync(userId);
        if (user is null) return [];

        var userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today  = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));

        // Distinct entry dates (multiple entries on the same calendar day
        // count as one day in the streak).
        var validDates = await db.Entries
            .AsNoTracking()
            .Where(e => e.UserId == userId && e.DeletedAt == null)
            .Select(e => e.EntryDate)
            .Distinct()
            .ToListAsync();

        if (validDates.Count == 0) return [];

        // Per-day entry counts so each streak card can show "n entries"
        // (distinct from "n days" — useful when the user wrote multiple
        // entries on a single day during a chapter).
        var entriesPerDay = await db.Entries
            .AsNoTracking()
            .Where(e => e.UserId == userId && e.DeletedAt == null)
            .GroupBy(e => e.EntryDate)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync();
        var entryCountByDate = entriesPerDay.ToDictionary(x => x.Date, x => x.Count);

        var pauses = await db.Pauses
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.Status == PauseStatus.Active)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync();

        var pausedDates = new HashSet<DateOnly>();
        foreach (var pause in pauses)
            for (var d = pause.StartDate; d <= pause.EndDate; d = d.AddDays(1))
                pausedDates.Add(d);

        var entryDateSet = new HashSet<DateOnly>(validDates);
        var sortedDates  = validDates.OrderBy(d => d).ToList();

        // Walk forward, slicing into streak ranges. A new streak starts
        // whenever the gap from the previous entry can't be bridged by
        // active-pause days.
        var ranges = new List<(DateOnly Start, DateOnly End, int Days, int Entries)>();
        DateOnly? streakStart = null;
        DateOnly? prev        = null;
        var days    = 0;
        var entries = 0;

        foreach (var date in sortedDates)
        {
            if (prev is null)
            {
                streakStart = date;
                days        = 1;
                entries     = entryCountByDate[date];
            }
            else
            {
                var gap = date.DayNumber - prev.Value.DayNumber;
                var bridged = true;
                for (var i = 1; i < gap; i++)
                {
                    var between = prev.Value.AddDays(i);
                    if (!pausedDates.Contains(between)) { bridged = false; break; }
                }

                if (gap == 1 || bridged)
                {
                    days++;
                    entries += entryCountByDate[date];
                }
                else
                {
                    // Previous streak just ended — record it.
                    ranges.Add((streakStart!.Value, prev.Value, days, entries));
                    streakStart = date;
                    days        = 1;
                    entries     = entryCountByDate[date];
                }
            }
            prev = date;
        }
        // Final accumulator (always non-null since we returned early on empty).
        ranges.Add((streakStart!.Value, prev!.Value, days, entries));

        // If the current streak is alive, the last range IS that ongoing
        // streak — drop it so history only shows completed chapters.
        var currentStreak = ComputeCurrentStreak(today, entryDateSet, pausedDates);
        if (currentStreak > 0 && ranges.Count > 0)
            ranges.RemoveAt(ranges.Count - 1);

        if (ranges.Count == 0) return [];

        // Personal-best flag: longest completed streak. Tie-break by
        // recency (the most recent best wins) so users see their latest
        // peak highlighted, not an older equivalent run.
        var maxDays = ranges.Max(r => r.Days);

        var result = ranges
            .OrderByDescending(r => r.End)  // most recent chapter first
            .Take(MaxHistoryChapters)
            .Select((r, idx) => new StreakHistoryItem(
                r.Start,
                r.End,
                r.Days,
                r.Entries,
                IsPersonalBest: false))
            .ToList();

        // Mark only the *first* (most recent) tied longest as best so the
        // UI doesn't show two "personal best" badges side by side.
        var bestIdx = result.FindIndex(r => r.Days == maxDays);
        if (bestIdx >= 0)
            result[bestIdx] = result[bestIdx] with { IsPersonalBest = true };

        return result;
    }

    private static int ComputeLongestStreak(
        HashSet<DateOnly> entryDates,
        HashSet<DateOnly> pausedDates)
    {
        if (entryDates.Count == 0) return 0;

        var allDates = entryDates.OrderBy(d => d).ToList();
        int longest = 0;
        int current = 0;
        DateOnly? prev = null;

        foreach (var date in allDates)
        {
            if (prev is null)
            {
                current = 1;
            }
            else
            {
                // Walk from prev+1 to date, counting only paused days as bridges
                var gap = date.DayNumber - prev.Value.DayNumber;
                bool bridged = true;
                for (int i = 1; i < gap; i++)
                {
                    var between = prev.Value.AddDays(i);
                    if (!pausedDates.Contains(between))
                    {
                        bridged = false;
                        break;
                    }
                }

                if (gap == 1 || bridged)
                    current++;
                else
                    current = 1;
            }

            longest = Math.Max(longest, current);
            prev = date;
        }

        return longest;
    }
}
