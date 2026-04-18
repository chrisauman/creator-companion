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

        // Load all valid entry dates (not deleted, submitted only — no drafts)
        var validDates = await db.Entries
            .Where(e => e.UserId == userId && e.DeletedAt == null)
            .Select(e => e.EntryDate)
            .Distinct()
            .OrderByDescending(d => d)
            .ToListAsync();

        // Load active pause ranges (for streak bridging)
        var pauses = await db.Pauses
            .Where(p => p.UserId == userId && p.Status == PauseStatus.Active)
            .Select(p => new { p.Id, p.StartDate, p.EndDate })
            .ToListAsync();

        // Count ALL pause days used this calendar month (active + cancelled)
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var monthEnd = new DateOnly(today.Year, today.Month,
            DateTime.DaysInMonth(today.Year, today.Month));

        var allMonthPauses = await db.Pauses
            .Where(p => p.UserId == userId && p.StartDate <= monthEnd && p.EndDate >= monthStart)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync();

        int pauseDaysUsedThisMonth = allMonthPauses.Sum(p =>
        {
            var overlapStart = p.StartDate > monthStart ? p.StartDate : monthStart;
            var overlapEnd   = p.EndDate   < monthEnd   ? p.EndDate   : monthEnd;
            return overlapEnd >= overlapStart
                ? overlapEnd.DayNumber - overlapStart.DayNumber + 1
                : 0;
        });

        var totalEntries = await db.Entries
            .CountAsync(e => e.UserId == userId && e.DeletedAt == null);

        var totalMedia = await db.EntryMedia
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
