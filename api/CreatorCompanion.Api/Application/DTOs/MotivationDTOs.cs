using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record MotivationEntryResponse(
    Guid   Id,
    string Title,
    string Takeaway,
    string FullContent,
    string Category,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool   IsFavorited
);

public record CreateMotivationRequest(
    [Required, MaxLength(500)]  string Takeaway,
    [Required]                  string FullContent,
    [Required]                  string Category     // "Encouragement" | "BestPractice" | "Quote"
);

public record UpdateMotivationRequest(
    [Required, MaxLength(500)]  string Takeaway,
    [Required]                  string FullContent,
    [Required]                  string Category
);

public record UpdateMotivationPreferenceRequest(
    bool Show
);

/// <summary>
/// Unified Favorites view item. Returned by GET /v1/favorites,
/// merging favorited Sparks (motivations) and favorited Entries
/// into one list sorted by FavoritedAt DESC. Exactly one of
/// `Spark` or `Entry` is populated based on `Type`.
/// </summary>
public record FavoriteItem(
    string                  Type,           // "spark" | "entry"
    DateTime                FavoritedAt,
    MotivationEntryResponse? Spark,
    EntryListItem?           Entry
);

/// <summary>
/// Pagination wrapper for the unified Favorites endpoint.
/// </summary>
public record FavoritesPage(
    List<FavoriteItem> Items,
    bool               HasMore
);
