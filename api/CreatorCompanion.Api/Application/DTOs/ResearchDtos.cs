namespace CreatorCompanion.Api.Application.DTOs;

// ── Controlled vocabulary (research dimensions) ───────────────────────
public record VocabDto(Guid Id, string Kind, string Value, int SortOrder);
public record VocabAddRequest(string Kind, string Value);
/// <summary>Active disciplines + pain-points for the research form's dropdowns.</summary>
public record VocabListDto(IReadOnlyList<VocabDto> Disciplines, IReadOnlyList<VocabDto> PainPoints);

// ── Research intake (brainstorm → dedup → commit) ─────────────────────
public record BrainstormRequest(string Theme, string? Discipline, string? PainPoint, string? Hints);

/// <summary>One classified candidate: term, inferred intent, and dedup verdict.</summary>
public record CandidateResult(string Keyword, string? Intent, string Bucket, string? MatchedKeyword, string? MatchedSlug);

public record BrainstormResponse(IReadOnlyList<CandidateResult> Candidates, int NewCount, int NearCount, int DupCount);

/// <summary>What the admin chose for one candidate: action ("queue" | "idea") + type ("page" | "post").</summary>
public record CommitItem(string Keyword, string? Intent, string Action, string? ContentType);

public record CommitRequest(
    string Theme, string Method, string? Discipline, string? PainPoint, string? Notes, IReadOnlyList<CommitItem> Items);

public record CommitResponse(Guid BatchId, int Queued, int Ideas, int SkippedAsDup);

public record BatchDto(
    Guid Id, string Theme, string Method, string? Discipline, string? PainPoint,
    int CandidateCount, int AddedCount, DateTime CreatedAt);

// ── AI page editing ───────────────────────────────────────────────────
public record AiEditRequest(string Instruction);
/// <summary>A proposed edit (not yet saved): the new content + a change summary.</summary>
public record AiEditProposal(LpContent Content, IReadOnlyList<string> Changes);
