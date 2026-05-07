using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Unified Favorites view. Merges favorited Sparks (motivation entries
/// joined via UserFavoritedMotivations) and favorited Journal entries
/// (Entry rows where IsFavorited = true) into one chronologically sorted
/// list. Used by the /favorites surface in the app, replacing the
/// previous Spark-only Favorite Sparks page.
///
/// Each item has a `type` discriminator and exactly one of `spark` or
/// `entry` populated. Server-side merge + sort guarantees correct
/// pagination across both sources.
///
/// Note: the legacy <c>/v1/motivation/favorites</c> endpoint still
/// exists alongside this one — kept for backwards compatibility with
/// any other surface that fetches just the spark list. The frontend's
/// Favorites page uses this new endpoint exclusively.
/// </summary>
[ApiController]
[Route("v1/favorites")]
[Authorize]
public class FavoritesController(
    AppDbContext db,
    IStorageService storage) : ControllerBase
{
    private const int DefaultTake = 25;
    private const int MaxTake     = 100;

    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// GET /v1/favorites?skip=0&amp;take=25
    /// Returns the user's favorites (sparks + entries) sorted by
    /// FavoritedAt DESC. Paid users only — entry favoriting is paid-
    /// gated and Spark favoriting is too. Includes a `hasMore` flag so
    /// the client can show a "Load more" button only when needed.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int skip = 0,
        [FromQuery] int take = DefaultTake)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user is null) return NotFound();
        if (user.Tier != AccountTier.Paid) return Forbid();

        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxTake);

        // Fetch both lists pre-sorted by FavoritedAt DESC. We pull
        // everything from each table because cross-source pagination
        // can't be done correctly with a per-table Skip/Take — the
        // merge order depends on timestamps from both. For a typical
        // user with <100 favorites this is fine; if someone hits
        // thousands we can revisit (e.g. a precomputed merged view).

        // Sparks (favorited motivations).
        var sparkRows = await db.UserFavoritedMotivations
            .Where(f => f.UserId == UserId)
            .Include(f => f.Entry)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new
            {
                Type        = "spark",
                FavoritedAt = f.CreatedAt,
                // Cast to nullable so the anonymous type matches the
                // entry side's shape and Concat doesn't complain.
                Spark       = (Domain.Models.MotivationEntry?)f.Entry,
                EntryId     = (Guid?)null,
            })
            .ToListAsync();

        // Entries with IsFavorited = true. Soft-deleted entries are
        // excluded — we don't want to surface trashed-but-favorited
        // items in the gallery.
        var entryRows = await db.Entries
            .Where(e => e.UserId == UserId && e.IsFavorited && e.DeletedAt == null)
            .OrderByDescending(e => e.FavoritedAt ?? e.UpdatedAt)
            .Select(e => new
            {
                Type        = "entry",
                FavoritedAt = e.FavoritedAt ?? e.UpdatedAt,
                Spark       = (Domain.Models.MotivationEntry?)null,
                EntryId     = (Guid?)e.Id,
            })
            .ToListAsync();

        // Merge + sort in memory. Same FavoritedAt → tie-break by
        // type so order is deterministic (sparks before entries).
        var merged = sparkRows.Concat(entryRows)
            .OrderByDescending(x => x.FavoritedAt)
            .ThenBy(x => x.Type)
            .ToList();

        var totalCount = merged.Count;
        var pageRows   = merged.Skip(skip).Take(take + 1).ToList();
        var hasMore    = pageRows.Count > take;
        if (hasMore) pageRows = pageRows.Take(take).ToList();

        // Build the EntryListItem payloads in a second pass (one
        // batched query for all entry IDs in the page) — same shape
        // the column-2 journal list uses, so the favorites cards can
        // be rendered with the same template.
        var entryIds = pageRows.Where(r => r.EntryId.HasValue)
                               .Select(r => r.EntryId!.Value)
                               .ToList();

        var entryItems = entryIds.Count == 0
            ? new Dictionary<Guid, EntryListItem>()
            : await BuildEntryListItemsAsync(entryIds);

        var items = pageRows.Select(r =>
        {
            if (r.Type == "spark")
            {
                var s = r.Spark!;
                var sparkResp = new MotivationEntryResponse(
                    s.Id, s.Title, s.Takeaway, s.FullContent,
                    s.Category.ToString(), s.CreatedAt, s.UpdatedAt,
                    /* IsFavorited */ true);
                return new FavoriteItem("spark", r.FavoritedAt, sparkResp, null);
            }
            else
            {
                entryItems.TryGetValue(r.EntryId!.Value, out var entry);
                return new FavoriteItem("entry", r.FavoritedAt, null, entry);
            }
        })
        // Drop any entry that didn't resolve (e.g. race condition
        // where the entry got deleted between the two queries).
        .Where(it => it.Type != "entry" || it.Entry is not null)
        .ToList();

        return Ok(new FavoritesPage(items, hasMore));
    }

    /// <summary>
    /// Loads EntryListItem rows for a set of entry IDs. Mirrors the
    /// shape produced by <see cref="EntryService.GetListAsync"/> so
    /// the Favorites cards can use the exact same column-2 list-item
    /// template (title, content preview, mood, tags, first-image URL).
    /// One query for all entries + one for tags; storage URLs are
    /// resolved per-row.
    /// </summary>
    private async Task<Dictionary<Guid, EntryListItem>> BuildEntryListItemsAsync(List<Guid> entryIds)
    {
        var raw = await db.Entries
            .Where(e => entryIds.Contains(e.Id))
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

        var tagData = await db.EntryTags
            .Where(et => entryIds.Contains(et.EntryId))
            .Select(et => new { et.EntryId, et.Tag.Name })
            .ToListAsync();

        var tagMap = tagData
            .GroupBy(t => t.EntryId)
            .ToDictionary(g => g.Key, g => g.Select(t => t.Name).OrderBy(n => n).ToList());

        return raw.ToDictionary(e => e.Id, e =>
        {
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
                tagMap.TryGetValue(e.Id, out var t) ? t : new List<string>(),
                e.IsFavorited
            );
        });
    }

    /// <summary>
    /// Local copy of EntryService.StripMarkdown so this controller
    /// stays self-contained. Trades a few duplicated lines for not
    /// pulling EntryService's full surface area (entitlement checks,
    /// streak service, draft service, media handling) into the
    /// favorites path. If the markdown rules ever drift, sync both.
    /// </summary>
    private static string StripMarkdown(string? text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        // Strip common markdown leading tokens + collapse whitespace.
        var stripped = System.Text.RegularExpressions.Regex.Replace(
            text,
            @"[#*_`>~\-\[\]\(\)!]",
            " ");
        stripped = System.Text.RegularExpressions.Regex.Replace(stripped, @"\s+", " ").Trim();
        return stripped;
    }
}
