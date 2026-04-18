using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CreatorCompanion.Api.Application.Services;

public class EntitlementService(AppDbContext db, IOptions<EntryLimitsConfig> limitsOptions) : IEntitlementService
{
    private readonly EntryLimitsConfig _limits = limitsOptions.Value;

    public TierLimits GetLimits(User user) =>
        user.Tier == AccountTier.Paid ? _limits.Paid : _limits.Free;

    public void EnforceWordLimit(User user, string content)
    {
        var limits = GetLimits(user);
        var wordCount = CountWords(content);
        if (wordCount < 10)
            throw new InvalidOperationException("Entry must be at least 10 words.");
        if (wordCount > limits.MaxWordsPerEntry)
            throw new InvalidOperationException(
                $"Entry exceeds the {limits.MaxWordsPerEntry}-word limit for your plan.");
    }

    public async Task EnforceImageLimitAsync(User user, Guid entryId)
    {
        var limits = GetLimits(user);
        var count = await db.EntryMedia
            .CountAsync(m => m.EntryId == entryId && m.DeletedAt == null);
        if (count >= limits.MaxImagesPerEntry)
            throw new InvalidOperationException(
                $"This entry already has the maximum of {limits.MaxImagesPerEntry} image(s) for your plan.");
    }

    public void EnforceBackfill(User user, DateOnly entryDate, DateOnly today)
    {
        if (entryDate == today) return; // not a backfill

        var limits = GetLimits(user);
        if (!limits.CanBackfill)
            throw new InvalidOperationException("Backfilling entries requires a paid plan.");

        var daysBack = today.DayNumber - entryDate.DayNumber;
        if (daysBack < 1 || daysBack > 2)
            throw new InvalidOperationException("You can only backfill entries for the previous 2 days.");
    }

    public void EnforcePause(User user)
    {
        var limits = GetLimits(user);
        if (!limits.CanUsePause)
            throw new InvalidOperationException("Pausing requires a paid plan.");
    }

    public async Task EnforceJournalLimitAsync(User user)
    {
        var limits = GetLimits(user);
        if (limits.MaxDiaries == -1) return; // unlimited

        var count = await db.Journals
            .CountAsync(j => j.UserId == user.Id && j.DeletedAt == null);
        if (count >= limits.MaxDiaries)
            throw new InvalidOperationException(
                $"Your plan allows a maximum of {limits.MaxDiaries} journal(s).");
    }

    private static int CountWords(string text) =>
        string.IsNullOrWhiteSpace(text)
            ? 0
            : text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
}
