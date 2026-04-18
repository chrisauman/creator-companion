using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace CreatorCompanion.Tests;

public class EntryServiceTests
{
    private static readonly string ValidContent =
        "Today I worked on my project and made significant progress on the feature I have been building.";

    private static EntryService BuildService(AppDbContext db)
    {
        var limitsOptions = Options.Create(new EntryLimitsConfig
        {
            Free = new TierLimits
            {
                MaxWordsPerEntry = 100, MaxImagesPerEntry = 1,
                CanBackfill = false, CanRecoverDeleted = false,
                CanUsePause = false, MaxDiaries = 1, MaxRemindersPerDay = 1,
                MaxEntriesPerDay = 1, MaxTagsPerEntry = 3
            },
            Paid = new TierLimits
            {
                MaxWordsPerEntry = 2500, MaxImagesPerEntry = 20,
                CanBackfill = true, CanRecoverDeleted = true,
                CanUsePause = true, MaxDiaries = -1, MaxRemindersPerDay = 5,
                MaxEntriesPerDay = 5, MaxTagsPerEntry = 20
            }
        });
        var entitlements = new EntitlementService(db, limitsOptions);
        var streak       = new StreakService(db);
        var storage      = new NullStorageService();
        var tagSvc       = new TagService(db);
        return new EntryService(db, entitlements, streak, storage, tagSvc);
    }

    // Stub that satisfies IStorageService without any real I/O
    private sealed class NullStorageService : IStorageService
    {
        public Task<string> SaveAsync(Stream fileStream, string fileName, string contentType)
            => Task.FromResult(fileName);
        public Task DeleteAsync(string storagePath) => Task.CompletedTask;
        public string GetUrl(string storagePath) => $"/v1/media/file/{storagePath}";
    }

    // ── Create ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateEntry_ValidData_Succeeds()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var result = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        result.Should().NotBeNull();
        result.EntryDate.Should().Be(today);
        result.EntrySource.Should().Be(EntrySource.Direct);
    }

    [Fact]
    public async Task CreateEntry_DuplicateDate_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await svc.CreateAsync(user.Id, new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        var act = async () =>
            await svc.CreateAsync(user.Id, new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*already logged an entry*");
    }

    [Fact]
    public async Task CreateEntry_TooFewWords_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var act = async () =>
            await svc.CreateAsync(user.Id, new CreateEntryRequest(journal.Id, today, "Test Title", "Too short.", null));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*at least 10 words*");
    }

    // ── Backfill ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateEntry_Backfill_FreeUser_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Free);
        var svc       = BuildService(db);
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);

        var act = async () =>
            await svc.CreateAsync(user.Id,
                new CreateEntryRequest(journal.Id, yesterday, "Test Title", ValidContent, null));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*paid plan*");
    }

    [Fact]
    public async Task CreateEntry_Backfill_PaidUser_MarkedAsBackfill()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc       = BuildService(db);
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);

        var result = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, yesterday, "Test Title", ValidContent, null));

        result.EntrySource.Should().Be(EntrySource.Backfill);
        result.EntryDate.Should().Be(yesterday);
    }

    [Fact]
    public async Task CreateEntry_Backfill_3DaysAgo_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc        = BuildService(db);
        var threeDaysAgo = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);

        var act = async () =>
            await svc.CreateAsync(user.Id,
                new CreateEntryRequest(journal.Id, threeDaysAgo, "Test Title", ValidContent, null));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*previous 2 days*");
    }

    // ── Edit ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateEntry_ChangesContent_NotDate()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var created = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        var newContent = "Updated content with enough words to pass the minimum word count requirement now.";
        var updated = await svc.UpdateAsync(user.Id, created.Id,
            new UpdateEntryRequest("Test Title", newContent, null));

        updated.ContentText.Should().Be(newContent);
        updated.EntryDate.Should().Be(today);
        updated.UpdatedAt.Should().BeAfter(updated.CreatedAt);
    }

    // ── Soft delete ──────────────────────────────────────────────────────────

    [Fact]
    public async Task SoftDelete_EntryNoLongerInList()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var entry = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        await svc.SoftDeleteAsync(user.Id, entry.Id);
        var list = await svc.GetListAsync(user.Id, null);

        list.Should().NotContain(e => e.Id == entry.Id);
    }

    [Fact]
    public async Task SoftDelete_BreaksStreakImmediately()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var entry = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        var beforeDelete = await svc.GetStreakAsync(user.Id);
        beforeDelete.CurrentStreak.Should().Be(1);

        await svc.SoftDeleteAsync(user.Id, entry.Id);
        var afterDelete = await svc.GetStreakAsync(user.Id);

        afterDelete.CurrentStreak.Should().Be(0);
    }

    // ── Recovery ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task RecoverEntry_FreeUser_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Free);
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var entry = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));
        await svc.SoftDeleteAsync(user.Id, entry.Id);

        var act = async () => await svc.RecoverAsync(user.Id, entry.Id);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*paid plan*");
    }

    [Fact]
    public async Task RecoverEntry_PaidUser_WithinWindow_RestoresStreak()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var entry = await svc.CreateAsync(user.Id,
            new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));
        await svc.SoftDeleteAsync(user.Id, entry.Id);

        var streakAfterDelete = await svc.GetStreakAsync(user.Id);
        streakAfterDelete.CurrentStreak.Should().Be(0);

        await svc.RecoverAsync(user.Id, entry.Id);
        var streakAfterRecover = await svc.GetStreakAsync(user.Id);

        streakAfterRecover.CurrentStreak.Should().Be(1);
    }

    [Fact]
    public async Task RecoverEntry_PastWindow_Throws()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync(tier: AccountTier.Paid);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Directly insert an entry already deleted 49 hours ago (outside window)
        var entry = DbFactory.MakeEntry(user.Id, journal.Id, today.AddDays(-2),
            deletedAt: DateTime.UtcNow.AddHours(-49));
        db.Entries.Add(entry);
        await db.SaveChangesAsync();

        var svc = BuildService(db);
        var act = async () => await svc.RecoverAsync(user.Id, entry.Id);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Recovery window*");
    }

    // ── Draft cleared on submit ───────────────────────────────────────────────

    [Fact]
    public async Task SubmittingEntry_ClearsDraftForSameDate()
    {
        var (db, user, journal) = await DbFactory.WithUserAndJournalAsync();
        var svc   = BuildService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Create a draft
        var draftSvc = new DraftService(db);
        await draftSvc.UpsertAsync(user.Id,
            new UpsertDraftRequest(journal.Id, today, "Draft content in progress here.", null));

        var draftBefore = await draftSvc.GetAsync(user.Id, journal.Id, today);
        draftBefore.Should().NotBeNull();

        // Submit entry
        await svc.CreateAsync(user.Id, new CreateEntryRequest(journal.Id, today, "Test Title", ValidContent, null));

        var draftAfter = await draftSvc.GetAsync(user.Id, journal.Id, today);
        draftAfter.Should().BeNull();
    }
}
