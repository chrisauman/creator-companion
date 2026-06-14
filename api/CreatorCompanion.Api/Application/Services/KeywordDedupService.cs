using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>Which bucket a candidate falls into when checked against the master index.</summary>
public enum DedupBucket { New, NearDuplicate, Duplicate }

/// <summary>
/// The verdict for one candidate keyword: its bucket, plus (for dup/near-dup)
/// the existing term it collided with and the page slug if that term is already
/// a live page — so the admin sees exactly what it overlaps.
/// </summary>
public record DedupVerdict(DedupBucket Bucket, string? MatchedKeyword, string? MatchedSlug);

/// <summary>
/// Pure text-normalisation for keyword dedup. Two cheap tiers, no API:
///   1. <see cref="Normalize"/> — exact-match key (lowercase, punctuation→space,
///      collapsed). Catches "Morning Pages App" == "morning pages  app".
///   2. <see cref="Signature"/> — order-insensitive token signature with filler
///      words dropped. Catches "best morning pages app" ≈ "app for morning pages"
///      ≈ "morning pages app" — the qualifier/reorder dupes exact-match misses.
/// Deliberately NO stemming: merging "journal"/"journaling" or "page"/"pages"
/// risks collapsing distinct fixed terms ("morning pages"). The future AI overlap
/// pass catches paraphrases these two tiers can't.
/// </summary>
public static class KeywordDedup
{
    // Filler that doesn't change search intent — dropped from the signature so
    // qualifier-only variations collapse together. Intentionally conservative.
    private static readonly HashSet<string> Filler = new(StringComparer.OrdinalIgnoreCase)
    {
        "app", "apps", "the", "a", "an", "for", "to", "of", "and", "or", "best",
        "top", "free", "how", "what", "why", "when", "your", "my", "with", "in",
        "on", "vs", "is", "are", "do", "does", "i", "you", "that", "this",
        "online", "software", "tool", "tools", "website", "site", "guide",
    };

    public static string Normalize(string? keyword)
    {
        var s = (keyword ?? "").Trim().ToLowerInvariant();
        var chars = s.Select(c => char.IsLetterOrDigit(c) ? c : ' ').ToArray();
        return string.Join(' ', new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    public static string Signature(string? keyword)
    {
        var tokens = Normalize(keyword).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var kept = tokens.Where(t => !Filler.Contains(t)).OrderBy(t => t, StringComparer.Ordinal).ToArray();
        // If everything was filler (e.g. "best app"), fall back to the normalized
        // form so we don't sign every filler-only phrase identically.
        return kept.Length == 0 ? Normalize(keyword) : string.Join(' ', kept);
    }
}

/// <summary>
/// An in-memory snapshot of every keyword that already exists anywhere — the
/// "master index" dedup checks against. Built from the keyword queue (every
/// status EXCEPT Rejected — a rejected term should be re-surfaceable) UNIONED
/// with every live page's target keyword. Classify a candidate (or a whole batch)
/// against it; add accepted candidates back in so a batch can't dup itself.
/// </summary>
public class MasterKeywordIndex
{
    private record Entry(string Keyword, string? Slug);

    private readonly Dictionary<string, Entry> _byNormalized = new();
    private readonly Dictionary<string, Entry> _bySignature = new();

    public void Add(string keyword, string? slug)
    {
        if (string.IsNullOrWhiteSpace(keyword)) return;
        var e = new Entry(keyword.Trim(), slug);
        var n = KeywordDedup.Normalize(keyword);
        var sig = KeywordDedup.Signature(keyword);
        // First writer wins — prefer keeping a built-page entry (it carries a slug)
        // over a bare queue entry when both normalize the same.
        if (!_byNormalized.ContainsKey(n) || (slug is not null && _byNormalized[n].Slug is null)) _byNormalized[n] = e;
        if (!_bySignature.ContainsKey(sig) || (slug is not null && _bySignature[sig].Slug is null)) _bySignature[sig] = e;
    }

    public DedupVerdict Classify(string candidate)
    {
        var n = KeywordDedup.Normalize(candidate);
        if (_byNormalized.TryGetValue(n, out var exact))
            return new DedupVerdict(DedupBucket.Duplicate, exact.Keyword, exact.Slug);
        var sig = KeywordDedup.Signature(candidate);
        if (_bySignature.TryGetValue(sig, out var near))
            return new DedupVerdict(DedupBucket.NearDuplicate, near.Keyword, near.Slug);
        return new DedupVerdict(DedupBucket.New, null, null);
    }
}

public interface IKeywordDedupService
{
    /// <summary>Load the current master index (queue ∪ live pages, minus Rejected).</summary>
    Task<MasterKeywordIndex> BuildIndexAsync(CancellationToken ct);
}

public class KeywordDedupService(AppDbContext db) : IKeywordDedupService
{
    public async Task<MasterKeywordIndex> BuildIndexAsync(CancellationToken ct)
    {
        var index = new MasterKeywordIndex();

        // Live pages first (they carry a slug to show the admin where it's built).
        var pages = await db.LandingPages.AsNoTracking()
            .Where(p => p.DeletedAt == null)
            .Select(p => new { p.TargetKeyword, p.Slug })
            .ToListAsync(ct);
        foreach (var p in pages) index.Add(p.TargetKeyword, p.Slug);

        // Every queued/idea/generated keyword except Rejected (rejected = fair game
        // to resurface). Generated ones may already be covered by a page above.
        var keywords = await db.LandingPageKeywords.AsNoTracking()
            .Where(k => k.Status != LandingPageKeywordStatus.Rejected)
            .Select(k => k.Keyword)
            .ToListAsync(ct);
        foreach (var k in keywords) index.Add(k, null);

        return index;
    }
}
