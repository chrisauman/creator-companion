using System.ComponentModel.DataAnnotations;
using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Application.DTOs;

public record CreateEntryRequest(
    [Required] Guid JournalId,
    [Required] DateOnly EntryDate,
    [MaxLength(150)] string? Title,
    [Required, MinLength(1)] string ContentText,
    string? Metadata,
    string? Mood = null,
    List<string>? Tags = null
);

public record UpdateEntryRequest(
    [MaxLength(150)] string? Title,
    [Required, MinLength(1)] string ContentText,
    string? Metadata,
    string? Mood = null,
    List<string>? Tags = null
);

public record EntryResponse(
    Guid Id,
    Guid JournalId,
    DateOnly EntryDate,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string Title,
    string ContentText,
    string? Mood,
    bool IsFavorited,
    EntrySource EntrySource,
    Visibility Visibility,
    string Metadata,
    List<MediaSummary> Media,
    List<string> Tags
);

public record MediaSummary(
    Guid Id,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    DateTime? TakenAt,
    string Url
);

public record EntryListItem(
    Guid Id,
    Guid JournalId,
    DateOnly EntryDate,
    DateTime CreatedAt,
    string Title,
    string ContentPreview,
    EntrySource EntrySource,
    int MediaCount,
    string? FirstImageUrl,
    DateTime? DeletedAt,
    string? Mood,
    List<string> Tags,
    bool IsFavorited
);

public record StreakResponse(
    int CurrentStreak,
    int LongestStreak,
    int TotalEntries,
    int TotalMediaCount,
    int TotalActiveDays,
    DateOnly? LastEntryDate,
    bool IsPaused,
    Guid? ActivePauseId,
    DateOnly? PauseStart,
    DateOnly? PauseEnd,
    int PauseDaysUsedThisMonth
);
