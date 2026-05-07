using System.Text.RegularExpressions;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Ganss.Xss;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class EntryService(
    AppDbContext db,
    IEntitlementService entitlements,
    IStreakService streak,
    IStorageService storage,
    ITagService tags) : IEntryService
{
    private static readonly HtmlSanitizer Sanitizer = new();

    private static string SanitizeContent(string? content)
    {
        if (string.IsNullOrEmpty(content)) return string.Empty;
        return Sanitizer.Sanitize(content);
    }

    public async Task<EntryResponse> CreateAsync(Guid userId, CreateEntryRequest request)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        var journal = await db.Journals
            .FirstOrDefaultAsync(j => j.Id == request.JournalId && j.UserId == userId && j.DeletedAt == null)
            ?? throw new InvalidOperationException("Journal not found.");

        var userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));

        var limits = entitlements.GetLimits(user);
        entitlements.EnforceBackfill(user, request.EntryDate, today);
        entitlements.EnforceWordLimit(user, request.ContentText);

        var existingCount = await db.Entries
            .CountAsync(e =>
                e.UserId == userId &&
                e.JournalId == request.JournalId &&
                e.EntryDate == request.EntryDate &&
                e.DeletedAt == null);

        if (existingCount >= limits.MaxEntriesPerDay)
        {
            var message = limits.MaxEntriesPerDay == 1
                ? "You've already logged an entry for this date. Multiple entries per day are available on the paid plan."
                : $"You've reached the limit of {limits.MaxEntriesPerDay} entries for this date.";
            throw new InvalidOperationException(message);
        }

        var isBackfill = request.EntryDate < today;
        var entry = new Entry
        {
            UserId = userId,
            JournalId = request.JournalId,
            EntryDate = request.EntryDate,
            Title = string.IsNullOrWhiteSpace(request.Title)
                ? GenerateTitle(request.ContentText)
                : request.Title.Trim(),
            ContentText = SanitizeContent(request.ContentText),
            Mood = request.Mood,
            EntrySource = isBackfill ? EntrySource.Backfill : EntrySource.Direct,
            Metadata = request.Metadata ?? "{}"
        };

        db.Entries.Add(entry);

        var draft = await db.Drafts
            .FirstOrDefaultAsync(d =>
                d.UserId == userId &&
                d.JournalId == request.JournalId &&
                d.EntryDate == request.EntryDate);
        if (draft is not null)
            db.Drafts.Remove(draft);

        await db.SaveChangesAsync();

        // Apply tags after entry is persisted (so the ID exists)
        List<string> tagNames = [];
        if (request.Tags is { Count: > 0 })
            tagNames = await tags.SetEntryTagsAsync(userId, entry.Id, request.Tags, limits.MaxTagsPerEntry);

        await TrackAnalyticsAsync(userId, AnalyticsEventType.EntryCreated, entry.EntryDate);

        return await MapToResponseAsync(entry, tagNames);
    }

    public async Task<EntryResponse> UpdateAsync(Guid userId, Guid entryId, UpdateEntryRequest request)
    {
        var entry = await db.Entries
            .Include(e => e.Media)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt == null)
            ?? throw new InvalidOperationException("Entry not found.");

        var user = await db.Users.FindAsync(userId)!;
        entitlements.EnforceWordLimit(user!, request.ContentText);

        entry.Title = string.IsNullOrWhiteSpace(request.Title)
            ? GenerateTitle(request.ContentText)
            : request.Title.Trim();
        entry.ContentText = SanitizeContent(request.ContentText);
        if (request.Mood != null) entry.Mood = request.Mood;
        entry.Metadata = request.Metadata ?? entry.Metadata;
        entry.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        // Update tags if provided
        List<string> tagNames;
        if (request.Tags != null)
        {
            var limits = entitlements.GetLimits(user!);
            tagNames = await tags.SetEntryTagsAsync(userId, entryId, request.Tags, limits.MaxTagsPerEntry);
        }
        else
        {
            tagNames = await tags.GetEntryTagNamesAsync(entryId);
        }

        return await MapToResponseAsync(entry, tagNames);
    }

    public async Task<EntryResponse> GetByIdAsync(Guid userId, Guid entryId)
    {
        var entry = await db.Entries
            .Include(e => e.Media.Where(m => m.DeletedAt == null))
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId)
            ?? throw new InvalidOperationException("Entry not found.");

        var tagNames = await tags.GetEntryTagNamesAsync(entryId);
        return await MapToResponseAsync(entry, tagNames);
    }

    public async Task<List<EntryListItem>> GetListAsync(
        Guid userId, Guid? journalId, bool includeDeleted = false, string? tagName = null,
        int? skip = null, int? take = null)
    {
        var query = db.Entries.Where(e => e.UserId == userId);

        if (journalId.HasValue)
            query = query.Where(e => e.JournalId == journalId.Value);

        if (!includeDeleted)
            query = query.Where(e => e.DeletedAt == null);
        else
            query = query.Where(e => e.DeletedAt != null);

        if (tagName != null)
            query = query.Where(e => e.EntryTags.Any(et => et.Tag.Name == tagName));

        var orderedQuery = query
            .OrderByDescending(e => e.EntryDate)
            .ThenByDescending(e => e.CreatedAt);

        var pagedQuery = skip.HasValue ? orderedQuery.Skip(skip.Value) : orderedQuery;
        // Fetch one extra so the frontend can detect whether more entries exist
        var pagedQueryWithTake = take.HasValue ? pagedQuery.Take(take.Value + 1) : pagedQuery;

        var raw = await pagedQueryWithTake
            .Select(e => new
            {
                e.Id,
                e.JournalId,
                e.EntryDate,
                e.CreatedAt,
                e.Title,
                e.ContentText,
                e.EntrySource,
                e.DeletedAt,
                e.Mood,
                e.IsFavorited,
                MediaCount = e.Media.Count(m => m.DeletedAt == null),
                FirstImagePath = e.Media
                    .Where(m => m.DeletedAt == null)
                    .OrderBy(m => m.CreatedAt)
                    .Select(m => m.StoragePath)
                    .FirstOrDefault()
            })
            .ToListAsync();

        // Load all tags for these entries in one query
        var entryIds = raw.Select(e => e.Id).ToList();
        var entryTagData = await db.EntryTags
            .Where(et => entryIds.Contains(et.EntryId))
            .Select(et => new { et.EntryId, et.Tag.Name })
            .ToListAsync();

        var tagMap = entryTagData
            .GroupBy(t => t.EntryId)
            .ToDictionary(g => g.Key, g => g.Select(t => t.Name).OrderBy(n => n).ToList());

        return raw.Select(e => {
            var preview = StripMarkdown(e.ContentText);
            preview = preview.Length > 120 ? preview.Substring(0, 120) + "…" : preview;
            return new EntryListItem(
            e.Id,
            e.JournalId,
            e.EntryDate,
            e.CreatedAt,
            e.Title,
            preview,
            e.EntrySource,
            e.MediaCount,
            e.FirstImagePath != null ? storage.GetUrl(e.FirstImagePath) : null,
            e.DeletedAt,
            e.Mood,
            tagMap.TryGetValue(e.Id, out var t) ? t : [],
            e.IsFavorited
        );
        }).ToList();
    }

    /// <summary>
    /// Generates a title from content when none is provided.
    /// Strips HTML/markdown, takes up to 60 chars at the nearest word boundary, appends "…".
    /// </summary>
    private static string GenerateTitle(string? contentText)
    {
        if (string.IsNullOrWhiteSpace(contentText)) return "Untitled";

        // Strip HTML tags
        var plain = Regex.Replace(contentText, @"<[^>]+>", " ");
        // Collapse whitespace
        plain = Regex.Replace(plain, @"\s+", " ").Trim();
        // Strip markdown
        plain = StripMarkdown(plain);

        if (plain.Length <= 60) return plain;

        // Cut at the nearest word boundary before 60 chars
        var cut = plain.LastIndexOf(' ', 59);
        return cut > 0
            ? plain.Substring(0, cut) + "…"
            : plain.Substring(0, 60) + "…";
    }

    private static string StripMarkdown(string text)
    {
        // Headings: ## Heading → Heading
        text = Regex.Replace(text, @"^#{1,6}\s+", string.Empty, RegexOptions.Multiline);
        // Bold: **word** → word
        text = Regex.Replace(text, @"\*\*(.+?)\*\*", "$1");
        // Italic: *word* → word
        text = Regex.Replace(text, @"\*(.+?)\*", "$1");
        // Bullet list markers: - item → item
        text = Regex.Replace(text, @"^\s*[-*+]\s+", string.Empty, RegexOptions.Multiline);
        // Numbered list markers: 1. item → item
        text = Regex.Replace(text, @"^\s*\d+\.\s+", string.Empty, RegexOptions.Multiline);
        return text.Trim();
    }

    public async Task<bool> ToggleFavoriteAsync(Guid userId, Guid entryId)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        var limits = entitlements.GetLimits(user);
        if (!limits.CanFavorite)
            throw new InvalidOperationException("Favoriting entries requires a paid plan.");

        var entry = await db.Entries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt == null)
            ?? throw new InvalidOperationException("Entry not found.");

        entry.IsFavorited = !entry.IsFavorited;
        // Track when the favorite was set so the unified Favorites view
        // can sort entries alongside Sparks by "when I favorited this".
        entry.FavoritedAt = entry.IsFavorited ? DateTime.UtcNow : null;
        await db.SaveChangesAsync();

        return entry.IsFavorited;
    }

    public async Task HardDeleteAsync(Guid userId, Guid entryId)
    {
        var entry = await db.Entries
            .Include(e => e.Media)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt != null)
            ?? throw new InvalidOperationException("Deleted entry not found.");

        db.EntryMedia.RemoveRange(entry.Media);
        db.Entries.Remove(entry);
        await db.SaveChangesAsync();
    }

    public async Task SoftDeleteAsync(Guid userId, Guid entryId)
    {
        var entry = await db.Entries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt == null)
            ?? throw new InvalidOperationException("Entry not found.");

        entry.DeletedAt = DateTime.UtcNow;

        var media = await db.EntryMedia
            .Where(m => m.EntryId == entryId && m.DeletedAt == null)
            .ToListAsync();
        foreach (var m in media)
            m.DeletedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    public async Task RecoverAsync(Guid userId, Guid entryId)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        var limits = entitlements.GetLimits(user);
        if (!limits.CanRecoverDeleted)
            throw new InvalidOperationException("Recovering deleted entries requires a paid plan.");

        var entry = await db.Entries
            .Include(e => e.Media)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == userId && e.DeletedAt != null)
            ?? throw new InvalidOperationException("Deleted entry not found.");

        if (entry.DeletedAt < DateTime.UtcNow.AddHours(-48))
            throw new InvalidOperationException("Recovery window has expired (48 hours).");

        entry.DeletedAt = null;
        entry.UpdatedAt = DateTime.UtcNow;

        foreach (var m in entry.Media.Where(m => m.DeletedAt != null))
            m.DeletedAt = null;

        await db.SaveChangesAsync();
    }

    public async Task<StreakResponse> GetStreakAsync(Guid userId)
    {
        var result = await streak.ComputeAsync(userId);
        return new StreakResponse(
            result.CurrentStreak,
            result.LongestStreak,
            result.TotalEntries,
            result.TotalMediaCount,
            result.TotalActiveDays,
            result.LastEntryDate,
            result.IsPaused,
            result.ActivePauseId,
            result.PauseStart,
            result.PauseEnd,
            result.PauseDaysUsedThisMonth);
    }

    private async Task<EntryResponse> MapToResponseAsync(Entry entry, List<string> tagNames)
    {
        var media = await db.EntryMedia
            .Where(m => m.EntryId == entry.Id && m.DeletedAt == null)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new { m.Id, m.FileName, m.ContentType, m.FileSizeBytes, m.TakenAt, m.StoragePath })
            .ToListAsync();

        return new EntryResponse(
            entry.Id,
            entry.JournalId,
            entry.EntryDate,
            entry.CreatedAt,
            entry.UpdatedAt,
            entry.Title,
            entry.ContentText,
            entry.Mood,
            entry.IsFavorited,
            entry.EntrySource,
            entry.Visibility,
            entry.Metadata,
            media.Select(m => new MediaSummary(
                m.Id, m.FileName, m.ContentType, m.FileSizeBytes, m.TakenAt,
                storage.GetUrl(m.StoragePath)
            )).ToList(),
            tagNames);
    }

    private async Task TrackAnalyticsAsync(Guid userId, AnalyticsEventType eventType, DateOnly entryDate)
    {
        db.AnalyticsEvents.Add(new AnalyticsEvent
        {
            UserId = userId,
            EventType = eventType,
            Metadata = $"{{\"entry_date\":\"{entryDate}\"}}"
        });
        await db.SaveChangesAsync();
    }
}
