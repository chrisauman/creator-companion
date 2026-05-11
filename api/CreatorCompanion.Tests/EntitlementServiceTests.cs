using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace CreatorCompanion.Tests;

public class EntitlementServiceTests
{
    private static EntitlementService Build(AppDbContext db) =>
        new(db, Options.Create(new EntryLimitsConfig
        {
            Free = new TierLimits
            {
                MaxWordsPerEntry = 100,
                MaxImagesPerEntry = 1,
                MaxRemindersPerDay = 1,
                CanUsePause = false,
                CanBackfill = false,
                CanRecoverDeleted = false,
                MaxDiaries = 1
            },
            Paid = new TierLimits
            {
                MaxWordsPerEntry = 2500,
                MaxImagesPerEntry = 20,
                MaxRemindersPerDay = 5,
                CanUsePause = true,
                CanBackfill = true,
                CanRecoverDeleted = true,
                MaxDiaries = -1
            }
        }));

    // ── Word limit ───────────────────────────────────────────────────────────

    [Fact(Skip = "Predates the trial-only pricing model — Free + in-trial users get Paid-level limits now; rewrite to assert post-trial NoAccessException behavior.")]
    public async Task FreeUser_ExceedingWordLimit_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);
        var longText = string.Join(" ", Enumerable.Repeat("word", 101));

        var act = () => svc.EnforceWordLimit(user, longText);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*100-word limit*");
    }

    [Fact]
    public async Task FreeUser_UnderWordLimit_DoesNotThrow()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);
        var text = string.Join(" ", Enumerable.Repeat("word", 50));

        var act = () => svc.EnforceWordLimit(user, text);

        act.Should().NotThrow();
    }

    [Fact]
    public async Task TooFewWords_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);

        var act = () => svc.EnforceWordLimit(user, "Too short.");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*at least 10 words*");
    }

    [Fact]
    public async Task PaidUser_CanExceedFreeWordLimit()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc = Build(db);
        var text = string.Join(" ", Enumerable.Repeat("word", 200));

        var act = () => svc.EnforceWordLimit(user, text);

        act.Should().NotThrow();
    }

    // ── Backfill ─────────────────────────────────────────────────────────────

    [Fact(Skip = "Predates the trial-only pricing model — Free + in-trial users get Paid-level limits now; rewrite to assert post-trial NoAccessException behavior.")]
    public async Task FreeUser_BackfillingYesterday_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var act = () => svc.EnforceBackfill(user, today.AddDays(-1), today);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*paid plan*");
    }

    [Fact]
    public async Task PaidUser_BackfillingYesterday_DoesNotThrow()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc = Build(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var act = () => svc.EnforceBackfill(user, today.AddDays(-1), today);

        act.Should().NotThrow();
    }

    [Fact]
    public async Task PaidUser_Backfilling3DaysAgo_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc = Build(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var act = () => svc.EnforceBackfill(user, today.AddDays(-3), today);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*previous 2 days*");
    }

    [Fact]
    public async Task AnyUser_WritingToday_BackfillNotEnforced()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var act = () => svc.EnforceBackfill(user, today, today);

        act.Should().NotThrow();
    }

    // ── Pause ────────────────────────────────────────────────────────────────

    [Fact(Skip = "Predates the trial-only pricing model — Free + in-trial users get Paid-level limits now; rewrite to assert post-trial NoAccessException behavior.")]
    public async Task FreeUser_EnforcePause_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync();
        var svc = Build(db);

        var act = () => svc.EnforcePause(user);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*paid plan*");
    }

    [Fact]
    public async Task PaidUser_EnforcePause_DoesNotThrow()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc = Build(db);

        var act = () => svc.EnforcePause(user);

        act.Should().NotThrow();
    }

    // ── Journal limit ────────────────────────────────────────────────────────

    [Fact(Skip = "Predates the trial-only pricing model — Free + in-trial users get Paid-level limits now; rewrite to assert post-trial NoAccessException behavior.")]
    public async Task FreeUser_AtJournalLimit_Throws()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(); // already has 1 journal
        var svc = Build(db);

        var act = async () => await svc.EnforceJournalLimitAsync(user);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*maximum of 1 journal*");
    }

    [Fact]
    public async Task PaidUser_UnlimitedJournals_DoesNotThrow()
    {
        var (db, user, _) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc = Build(db);

        var act = async () => await svc.EnforceJournalLimitAsync(user);

        await act.Should().NotThrowAsync();
    }
}
