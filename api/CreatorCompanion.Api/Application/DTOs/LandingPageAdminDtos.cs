namespace CreatorCompanion.Api.Application.DTOs;

// ── Directory + editor ───────────────────────────────────────────────
public record LpListItem(
    Guid Id, string Slug, string Status, string TargetKeyword, string MetaTitle,
    bool NoIndex, int? QualityScore, bool GeneratedByAi, DateTime UpdatedAt, DateTime? PublishedAt);

public record LpListResponse(IReadOnlyList<LpListItem> Items, int Total);

public record LpDetail(
    Guid Id, string Slug, string Status, string TargetKeyword, string MetaTitle, string MetaDescription,
    bool NoIndex, int? QualityScore, bool GeneratedByAi, LpContent Content, bool HasOriginal,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? PublishedAt);

/// <summary>Create/update payload — page SEO fields + the full section content.</summary>
public record LpUpsertRequest(
    string Slug, string TargetKeyword, string MetaTitle, string MetaDescription, bool NoIndex, LpContent Content);

// ── Keyword queue ────────────────────────────────────────────────────
public record LpKeywordDto(
    Guid Id, string Keyword, string? Brief, int Priority, string Status, Guid? GeneratedPageId,
    string? LastError, DateTime CreatedAt);

public record LpKeywordUpsert(string Keyword, string? Brief, int Priority, string? Status);

// ── Settings ─────────────────────────────────────────────────────────
public record LpSettingsDto(
    bool AutoGenerateEnabled, bool AutoPublishEnabled, int QualityThreshold, int GenerateHourLocalEt,
    string? LastGeneratedDate, bool Ga4Configured, bool PexelsConfigured, bool AnthropicConfigured);

public record LpSettingsUpdate(bool AutoGenerateEnabled, bool AutoPublishEnabled, int QualityThreshold, int GenerateHourLocalEt);
