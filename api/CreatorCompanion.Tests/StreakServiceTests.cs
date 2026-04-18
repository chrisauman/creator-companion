using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;

namespace CreatorCompanion.Tests;

public class StreakServiceTests
{
    private static async Task<StreakService> BuildAsync(
        AppDbContext db, User user, Journal journal,
        IEnumerable<DateOnly> entryDates,
        IEnumerable<(DateOnly start, DateOnly end)>? pauses = null)
    {
        foreach (var date in entryDates)
            db.Entries.Add(DbFactory.MakeEntry(user.Id, journal.Id, date));

        if (pauses != null)
        {
            foreach (var (start, end) in pauses)
                db.Pauses.Add(new Pause
                {
                    UserId = user.Id,
                    StartDate = start,
                    EndDate = end,
                    Status = PauseStatus.Active
                });
        }

        await db.SaveChangesAsync();
        return new StreakService(db);
    }

    [Fact]
    public async Task NoEntries_ReturnsZeroStreak()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync("UTC");
        var svc = new StreakService(db);

        var result = await svc.ComputeAsync(user.Id);

        result.CurrentStreak.Should().Be(0);
        result.LongestStreak.Should().Be(0);
        result.TotalEntries.Should().Be(0);
    }

    [Fact]
    public async Task SingleEntryToday_CurrentStreakIsOne()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var svc = await BuildAsync(db, user, journal, [today]);

        var result = await svc.ComputeAsync(user.Id);

        result.CurrentStreak.Should().Be(1);
        result.LongestStreak.Should().Be(1);
    }

    [Fact]
    public async Task FiveConsecutiveDaysEndingToday_StreakIsFive()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var dates = Enumerable.Range(0, 5).Select(i => today.AddDays(-i));
        var svc = await BuildAsync(db, user, journal, dates);

        var result = await svc.ComputeAsync(user.Id);

        result.CurrentStreak.Should().Be(5);
        result.LongestStreak.Should().Be(5);
    }

    [Fact]
    public async Task GapInDates_BreaksCurrentStreak()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // Days: today, yesterday, and 3 days ago (gap on day -2)
        var dates = new[] { today, today.AddDays(-1), today.AddDays(-3) };
        var svc = await BuildAsync(db, user, journal, dates);

        var result = await svc.ComputeAsync(user.Id);

        result.CurrentStreak.Should().Be(2);
        result.LongestStreak.Should().Be(2); // two runs: 2 days and 1 day
    }

    [Fact]
    public async Task DeletedEntries_DoNotCountTowardStreak()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        db.Entries.Add(DbFactory.MakeEntry(user.Id, journal.Id, today,
            deletedAt: DateTime.UtcNow));
        await db.SaveChangesAsync();
        var svc = new StreakService(db);

        var result = await svc.ComputeAsync(user.Id);

        result.CurrentStreak.Should().Be(0);
        result.TotalEntries.Should().Be(0);
    }

    [Fact]
    public async Task PauseRange_PreservesStreakWithoutIncreasing()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Entry today and 4 days ago; days -1, -2, -3 are paused
        var dates = new[] { today, today.AddDays(-4) };
        var pauses = new[] { (today.AddDays(-3), today.AddDays(-1)) };
        var svc = await BuildAsync(db, user, journal, dates, pauses);

        var result = await svc.ComputeAsync(user.Id);

        // Streak should bridge through the pause: today + 3 paused days + day -4 = 2 entry-days
        result.CurrentStreak.Should().Be(2);
    }

    [Fact]
    public async Task LongestStreakIsMaxAcrossMultipleRuns()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Run 1: 3 days (days -10, -9, -8), Run 2: 2 days (yesterday, today)
        var dates = new[]
        {
            today.AddDays(-10), today.AddDays(-9), today.AddDays(-8),
            today.AddDays(-1), today
        };
        var svc = await BuildAsync(db, user, journal, dates);

        var result = await svc.ComputeAsync(user.Id);

        result.LongestStreak.Should().Be(3);
        result.CurrentStreak.Should().Be(2);
    }

    [Fact]
    public async Task TotalEntries_CountsOnlyNonDeleted()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        db.Entries.Add(DbFactory.MakeEntry(user.Id, journal.Id, today));
        db.Entries.Add(DbFactory.MakeEntry(user.Id, journal.Id, today.AddDays(-1),
            deletedAt: DateTime.UtcNow));
        await db.SaveChangesAsync();
        var svc = new StreakService(db);

        var result = await svc.ComputeAsync(user.Id);

        result.TotalEntries.Should().Be(1);
        result.TotalActiveDays.Should().Be(1);
    }

    [Fact]
    public async Task OnlyYesterdayEntry_CurrentStreakIsOne()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync("UTC");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var svc = await BuildAsync(db, user, journal, [today.AddDays(-1)]);

        var result = await svc.ComputeAsync(user.Id);

        // Yesterday counts — today hasn't been written yet
        result.CurrentStreak.Should().Be(1);
    }
}
