using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

/// <summary>
/// Settings shape returned to the admin UI. Shrunk after the cookie-
/// poster pivot: schedule + timezone + cookie are gone (all hardcoded
/// server-side now). Only the on/off toggle and health snapshot remain.
/// </summary>
public record SubstackSettingsResponse(
    bool      Active,
    DateTime? LastSuccessAt,
    DateTime? LastFailureAt,
    string?   LastFailureMessage,
    int       ConsecutiveFailures,
    DateTime  UpdatedAt
);

/// <summary>
/// Update payload — just the on/off toggle. Schedule + recipient are
/// no longer admin-configurable.
/// </summary>
public record UpdateSubstackSettingsRequest(
    bool Active
);

/// <summary>
/// Outcome of POST /v1/admin/substack/today/fire-now. Mirrors
/// SubstackPostResult but with admin-friendly framing. Kept as
/// "TestPostResponse" for backwards-compat with the existing
/// frontend; rename when we touch the admin UI for the next batch.
/// </summary>
public record SubstackTestPostResponse(
    bool    Success,
    int?    StatusCode,
    string? NoteId,
    string? ErrorMessage,
    string? RawResponse
);

/// <summary>
/// One row in the History tab. Compact projection of SubstackDailyPlan
/// + the spark's takeaway snippet so the admin can scan the table
/// without expanding rows.
/// </summary>
public record SubstackPlanResponse(
    int       Id,
    DateOnly  Date,
    DateTime  ScheduledFor,
    string    Status,              // "Pending" | "Posted" | "Failed"
    DateTime? PostedAt,
    string?   SubstackNoteId,
    string?   ErrorMessage,
    Guid      SparkId,
    string    SparkTakeaway
);

/// <summary>
/// Count of sparks still eligible to be sent. Used by the Today tab
/// to warn the admin when the pool is running low — they need to add
/// new sparks before the picker runs dry.
/// </summary>
public record SubstackEligibleSparksResponse(int Count);
