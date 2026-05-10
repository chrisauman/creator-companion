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

    // ── Access state ──────────────────────────────────────────────────

    /// <summary>
    /// True iff the user has access right now: active subscription OR
    /// inside their 10-day trial. The single source of truth — every
    /// entitlement check + the global write-block filter routes here.
    /// </summary>
    public bool HasAccess(User user) =>
        HasActiveSubscription(user) || IsInTrial(user);

    /// <summary>
    /// Subscription is "active" iff there's a Stripe sub on record AND
    /// the tier flag has been flipped to Paid by a webhook. We check
    /// both rather than just the flag because the flag without an ID
    /// would mean an admin set it manually for testing — still treat
    /// that as access (admin override) — but the Stripe ID alone with
    /// Tier still Free shouldn't grant access (a webhook never landed).
    /// </summary>
    public bool HasActiveSubscription(User user) =>
        user.Tier == AccountTier.Paid;

    /// <summary>
    /// True iff TrialEndsAt is set and still in the future. Existing
    /// users who pre-date the trial-only model get a fresh 10-day
    /// window via the AddTrialBackfill migration; new signups get
    /// it set in AuthService.RegisterAsync.
    /// </summary>
    public bool IsInTrial(User user) =>
        user.TrialEndsAt.HasValue && user.TrialEndsAt.Value > DateTime.UtcNow;

    /// <summary>
    /// Throws when the user no longer has access. Catches the case
    /// where a user's trial expired mid-session and they still try to
    /// write. The thrown exception bubbles up to a global filter that
    /// translates to HTTP 402 Payment Required.
    /// </summary>
    public void EnforceAccess(User user)
    {
        if (!HasAccess(user))
            throw new NoAccessException(
                "Your trial has ended. Subscribe to continue using Creator Companion.");
    }

    // ── Limits ────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the user's effective limits. With the trial-only model,
    /// every user with access gets the Paid limits — Free limits exist
    /// only as a defensive fallback for users without access (most call
    /// sites EnforceAccess first, so the Free path is functionally
    /// unreachable but safe to leave in for belt-and-suspenders).
    /// </summary>
    public TierLimits GetLimits(User user) =>
        HasAccess(user) ? _limits.Paid : _limits.Free;

    public void EnforceWordLimit(User user, string content)
    {
        EnforceAccess(user);
        var limits = GetLimits(user);
        var wordCount = CountWords(content);
        if (wordCount < 10)
            throw new InvalidOperationException("Entry must be at least 10 words.");
        if (wordCount > limits.MaxWordsPerEntry)
            throw new InvalidOperationException(
                $"Entry exceeds the {limits.MaxWordsPerEntry}-word limit.");
    }

    public async Task EnforceImageLimitAsync(User user, Guid entryId)
    {
        EnforceAccess(user);
        var limits = GetLimits(user);
        var count = await db.EntryMedia
            .CountAsync(m => m.EntryId == entryId && m.DeletedAt == null);
        if (count >= limits.MaxImagesPerEntry)
            throw new InvalidOperationException(
                $"This entry already has the maximum of {limits.MaxImagesPerEntry} image(s).");
    }

    public void EnforceBackfill(User user, DateOnly entryDate, DateOnly today)
    {
        if (entryDate == today) return; // not a backfill — caller's
                                         // own write path enforces access
                                         // separately.
        EnforceAccess(user);
        var daysBack = today.DayNumber - entryDate.DayNumber;
        if (daysBack < 1 || daysBack > 2)
            throw new InvalidOperationException("You can only backfill entries for the previous 2 days.");
    }

    public void EnforcePause(User user)
    {
        EnforceAccess(user);
    }

    public async Task EnforceJournalLimitAsync(User user)
    {
        EnforceAccess(user);
        var limits = GetLimits(user);
        if (limits.MaxDiaries == -1) return; // unlimited

        var count = await db.Journals
            .CountAsync(j => j.UserId == user.Id && j.DeletedAt == null);
        if (count >= limits.MaxDiaries)
            throw new InvalidOperationException(
                $"You can have a maximum of {limits.MaxDiaries} journal(s).");
    }

    // Whitespace-aware split. The previous Split(' ', …) only recognized
    // the single ASCII space character, so a user pasting tab- or
    // newline-separated text under-counted words and could exceed
    // MaxWordsPerEntry. Regex `\s+` collapses any run of whitespace
    // (space, tab, newline, em-space, NBSP via \s in .NET) and the
    // RemoveEmptyEntries flag drops leading/trailing splits.
    private static readonly System.Text.RegularExpressions.Regex WordSplit =
        new(@"\s+", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static int CountWords(string text) =>
        string.IsNullOrWhiteSpace(text)
            ? 0
            : WordSplit.Split(text.Trim()).Count(w => w.Length > 0);
}

/// <summary>
/// Thrown by EnforceAccess when a user's trial has expired and they
/// have no active subscription. The global ApiException filter
/// translates this to HTTP 402 Payment Required so the frontend can
/// show the paywall takeover.
/// </summary>
public class NoAccessException : Exception
{
    public NoAccessException(string message) : base(message) { }
}
