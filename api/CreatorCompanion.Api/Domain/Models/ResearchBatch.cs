namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// One chunk of keyword research — a themed session that produced a set of
/// candidate keywords. This is the "research log" layer: it records WHAT angle
/// you explored, HOW, and WHEN, so months later you can see every angle already
/// mined (and the gaps) instead of re-researching the same ground. Each
/// <see cref="LandingPageKeyword"/> a batch surfaced points back via BatchId.
/// </summary>
public class ResearchBatch
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The angle explored, e.g. "Musicians — practice consistency".</summary>
    public string Theme { get; set; } = string.Empty;

    /// <summary>How candidates were sourced: "ai" | "paste" | "csv".</summary>
    public string Method { get; set; } = "ai";

    /// <summary>Controlled-vocab discipline this batch targeted (optional).</summary>
    public string? Discipline { get; set; }

    /// <summary>Controlled-vocab pain-point this batch targeted (optional).</summary>
    public string? PainPoint { get; set; }

    /// <summary>Free-text notes the admin left about this session.</summary>
    public string? Notes { get; set; }

    /// <summary>How many candidates the session surfaced (before dedup).</summary>
    public int CandidateCount { get; set; }

    /// <summary>How many candidates were committed to the queue or kept as ideas.</summary>
    public int AddedCount { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A controlled-but-extendable vocabulary value for research dimensions. Keeping
/// disciplines + pain-points as a managed list (rather than free text) is what
/// keeps the coverage matrix coherent — "musicians" and "musician" don't split
/// into two buckets. The admin can add/retire values; <see cref="Active"/>
/// hides a value from new research without losing history.
/// </summary>
public class ResearchVocabulary
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>"discipline" | "painpoint".</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>The display value, e.g. "Musicians" or "Creative block".</summary>
    public string Value { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;

    public bool Active { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
