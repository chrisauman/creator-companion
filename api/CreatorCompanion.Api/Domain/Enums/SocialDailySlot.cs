namespace CreatorCompanion.Api.Domain.Enums;

/// <summary>
/// Which of the day's two scheduled card posts a <see cref="Models.SocialDailyPlan"/>
/// is. Stored as the int value; append-only (never reorder/reuse).
///
/// Morning = the original daytime cream card. Evening = a later post that
/// draws its OWN (different) spark and renders the dark "Blue Wash" card,
/// so a platform can post twice a day without repeating itself. Evening is
/// opt-in per platform (<see cref="Models.SocialAccount.EveningEnabled"/>).
/// </summary>
public enum SocialDailySlot
{
    Morning = 0,
    Evening = 1,
}
