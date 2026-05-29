namespace CreatorCompanion.Api.Domain.Enums;

/// <summary>
/// Lifecycle of a single platform post attempt — shared by the daily
/// plan rows (<see cref="Models.SocialDailyPlan"/>) and ad-hoc post
/// targets (<see cref="Models.SocialPostTarget"/>). Stored as int so
/// renames don't break existing rows.
/// </summary>
public enum SocialPostStatus
{
    Pending = 0,
    Posted  = 1,
    Failed  = 2,
}
