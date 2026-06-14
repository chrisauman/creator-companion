using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public interface IResearchService
{
    Task<VocabListDto> GetVocabAsync(CancellationToken ct);
    Task<VocabDto?> AddVocabAsync(VocabAddRequest req, CancellationToken ct);
    Task<bool> DeleteVocabAsync(Guid id, CancellationToken ct);

    /// <summary>Brainstorm candidates for an angle and classify each against the master index. Saves nothing.</summary>
    Task<BrainstormResponse> BrainstormAsync(BrainstormRequest req, CancellationToken ct);

    /// <summary>Persist the admin's chosen candidates (queue/idea), logging the batch. Re-checks dedup to dodge races.</summary>
    Task<CommitResponse> CommitAsync(CommitRequest req, CancellationToken ct);

    Task<IReadOnlyList<BatchDto>> ListBatchesAsync(CancellationToken ct);
}

/// <summary>
/// Drives the research → dedup → queue pipeline and the coverage vocabulary.
/// Brainstorming and committing are deliberately separate calls: the admin
/// reviews the bucketed candidates (kept entirely in the client between the two)
/// and only the accepted ones are persisted, so nothing pollutes the master
/// index until a human says so.
/// </summary>
public class ResearchService(AppDbContext db, ILandingPageGenerator generator, IKeywordDedupService dedup)
    : IResearchService
{
    private const string KindDiscipline = "discipline";
    private const string KindPainPoint = "painpoint";

    // ── Vocabulary ───────────────────────────────────────────────────
    public async Task<VocabListDto> GetVocabAsync(CancellationToken ct)
    {
        var all = await db.ResearchVocabulary.AsNoTracking().Where(v => v.Active)
            .OrderBy(v => v.SortOrder).ThenBy(v => v.Value).ToListAsync(ct);
        VocabDto Map(ResearchVocabulary v) => new(v.Id, v.Kind, v.Value, v.SortOrder);
        return new VocabListDto(
            all.Where(v => v.Kind == KindDiscipline).Select(Map).ToList(),
            all.Where(v => v.Kind == KindPainPoint).Select(Map).ToList());
    }

    public async Task<VocabDto?> AddVocabAsync(VocabAddRequest req, CancellationToken ct)
    {
        var kind = req.Kind?.Trim().ToLowerInvariant();
        var value = req.Value?.Trim();
        if (string.IsNullOrWhiteSpace(value) || (kind != KindDiscipline && kind != KindPainPoint)) return null;
        // Reactivate a retired value rather than colliding on the unique index.
        var existing = await db.ResearchVocabulary.FirstOrDefaultAsync(v => v.Kind == kind && v.Value == value, ct);
        if (existing is not null) { existing.Active = true; await db.SaveChangesAsync(ct); return new VocabDto(existing.Id, existing.Kind, existing.Value, existing.SortOrder); }
        var v = new ResearchVocabulary { Kind = kind!, Value = value!, SortOrder = 100 };
        db.ResearchVocabulary.Add(v);
        await db.SaveChangesAsync(ct);
        return new VocabDto(v.Id, v.Kind, v.Value, v.SortOrder);
    }

    public async Task<bool> DeleteVocabAsync(Guid id, CancellationToken ct)
    {
        var v = await db.ResearchVocabulary.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (v is null) return false;
        // Soft-retire: keyword rows store the value as plain text, so hiding it
        // here never orphans history.
        v.Active = false;
        await db.SaveChangesAsync(ct);
        return true;
    }

    // ── Brainstorm + classify ────────────────────────────────────────
    public async Task<BrainstormResponse> BrainstormAsync(BrainstormRequest req, CancellationToken ct)
    {
        // Give the model the existing terms so it doesn't waste slots re-suggesting
        // them (dedup still catches any that slip through).
        var avoid = await db.LandingPageKeywords.AsNoTracking()
            .Where(k => k.Status != LandingPageKeywordStatus.Rejected)
            .OrderByDescending(k => k.CreatedAt).Select(k => k.Keyword).Take(120).ToListAsync(ct);

        var candidates = await generator.BrainstormAsync(req.Theme, req.Discipline, req.PainPoint, req.Hints, avoid, ct);

        var index = await dedup.BuildIndexAsync(ct);
        var results = new List<CandidateResult>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);  // collapse exact repeats within the batch
        foreach (var c in candidates)
        {
            var norm = KeywordDedup.Normalize(c.Keyword);
            if (norm.Length == 0 || !seen.Add(norm)) continue;
            var verdict = index.Classify(c.Keyword);
            results.Add(new CandidateResult(c.Keyword, c.Intent, verdict.Bucket.ToString(), verdict.MatchedKeyword, verdict.MatchedSlug));
            // Fold each NEW candidate into the index so a later near-identical
            // candidate in the SAME batch is flagged near-dup, not New.
            if (verdict.Bucket == DedupBucket.New) index.Add(c.Keyword, null);
        }

        return new BrainstormResponse(results,
            results.Count(r => r.Bucket == nameof(DedupBucket.New)),
            results.Count(r => r.Bucket == nameof(DedupBucket.NearDuplicate)),
            results.Count(r => r.Bucket == nameof(DedupBucket.Duplicate)));
    }

    // ── Commit ───────────────────────────────────────────────────────
    public async Task<CommitResponse> CommitAsync(CommitRequest req, CancellationToken ct)
    {
        var batch = new ResearchBatch
        {
            Theme = (req.Theme ?? "").Trim(),
            Method = string.IsNullOrWhiteSpace(req.Method) ? "ai" : req.Method.Trim().ToLowerInvariant(),
            Discipline = Clean(req.Discipline), PainPoint = Clean(req.PainPoint), Notes = Clean(req.Notes),
            CandidateCount = req.Items.Count,
        };

        // Re-check against a fresh index (the queue may have changed since brainstorm),
        // and dedup within this commit so two accepted rephrasings don't both land.
        var index = await dedup.BuildIndexAsync(ct);
        int queued = 0, ideas = 0, skipped = 0;
        var toAdd = new List<LandingPageKeyword>();
        foreach (var item in req.Items)
        {
            var action = item.Action?.Trim().ToLowerInvariant();
            if (action != "queue" && action != "idea") continue;
            if (string.IsNullOrWhiteSpace(item.Keyword)) continue;
            // Only hard true-duplicates are dropped; a kept near-dup is the admin's call.
            if (index.Classify(item.Keyword).Bucket == DedupBucket.Duplicate) { skipped++; continue; }

            var queue = action == "queue";
            toAdd.Add(new LandingPageKeyword
            {
                Keyword = item.Keyword.Trim(),
                Status = queue ? LandingPageKeywordStatus.Pending : LandingPageKeywordStatus.Idea,
                Theme = batch.Theme, Discipline = batch.Discipline, PainPoint = batch.PainPoint,
                Intent = Clean(item.Intent), Signature = KeywordDedup.Signature(item.Keyword), BatchId = batch.Id,
            });
            index.Add(item.Keyword, null);
            if (queue) queued++; else ideas++;
        }

        batch.AddedCount = queued + ideas;
        db.ResearchBatches.Add(batch);
        db.LandingPageKeywords.AddRange(toAdd);
        await db.SaveChangesAsync(ct);
        return new CommitResponse(batch.Id, queued, ideas, skipped);
    }

    public async Task<IReadOnlyList<BatchDto>> ListBatchesAsync(CancellationToken ct) =>
        await db.ResearchBatches.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(100)
            .Select(b => new BatchDto(b.Id, b.Theme, b.Method, b.Discipline, b.PainPoint, b.CandidateCount, b.AddedCount, b.CreatedAt))
            .ToListAsync(ct);

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
