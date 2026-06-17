namespace CreatorCompanion.Api.Application.DTOs;

// ── Blog post content (the JSONB body blob) ───────────────────────────
/// <summary>
/// The schema-flexible content of a blog post. The body is sanitized rich-text
/// HTML (H2/H3, paragraphs, lists, blockquotes, inline images with alt, safe-
/// listed YouTube/Vimeo embeds) — the post title is the single H1, never in the
/// body. Optional FAQ powers FAQPage schema; the CTA is the app sign-up nudge.
/// </summary>
public class BlogContent
{
    /// <summary>Sanitized rich-text HTML. The renderer outputs this verbatim (already cleaned on save).</summary>
    public string BodyHtml { get; set; } = string.Empty;

    public List<LpQa> Faq { get; set; } = new();

    public string? CtaHeading { get; set; }
    public string? CtaLabel { get; set; }
}

// ── Admin: posts ──────────────────────────────────────────────────────
public record BlogListItem(
    Guid Id, string Slug, string Status, string Title, string TargetKeyword, string CategorySlug,
    string CategoryName, bool Pinned, bool NoIndex, int? QualityScore, bool GeneratedByAi,
    int ReadingTimeMinutes, DateTime? PublishDate, DateTime? ScheduledFor, DateTime UpdatedAt);

public record BlogListResponse(IReadOnlyList<BlogListItem> Items, int Total);

public record BlogDetail(
    Guid Id, string Slug, string Status, Guid CategoryId, string CategorySlug, string TargetKeyword,
    string Title, string? Dek, string MetaTitle, string MetaDescription, string? CanonicalUrl, bool NoIndex,
    string? FeaturedImageUrl, string? FeaturedImageAlt, string? Snippet, int ReadingTimeMinutes,
    bool Pinned, int? PinnedPosition, BlogContent Content, bool HasOriginal, bool HasPrevious,
    int? QualityScore, bool GeneratedByAi, DateTime? PublishDate, DateTime? ScheduledFor,
    DateTime LastUpdatedAt, DateTime CreatedAt, DateTime UpdatedAt, DateTime? PublishedAt);

/// <summary>Create/update payload for a post (SEO + card fields + the body content).</summary>
public record BlogUpsertRequest(
    string Slug, Guid CategoryId, string TargetKeyword, string Title, string? Dek, string MetaTitle,
    string MetaDescription, string? CanonicalUrl, bool NoIndex, string? FeaturedImageUrl, string? FeaturedImageAlt,
    string? Snippet, bool Pinned, int? PinnedPosition, DateTime? ScheduledFor, BlogContent Content);

public record BlogAiEditRequest(string Instruction);
public record BlogAiEditProposal(BlogContent Content, IReadOnlyList<string> Changes);

// ── Admin: categories ─────────────────────────────────────────────────
public record BlogCategoryDto(
    Guid Id, string Slug, string Name, string? Description, int Position, bool IsSystem, int PostCount);

public record BlogCategoryUpsert(string Name, string? Slug, string? Description, int Position);
