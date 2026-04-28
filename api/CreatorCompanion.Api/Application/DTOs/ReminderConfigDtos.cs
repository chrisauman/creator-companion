using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record ReminderConfigResponse(
    int DailyUpToDays,
    int Every2DaysUpToDays,
    int Every3DaysUpToDays,
    string MessageActiveStreak,
    string MessageJustBroke,
    string MessageShortLapse,
    string MessageMediumLapse,
    string MessageLongAbsence,
    DateTime UpdatedAt
);

public record UpdateReminderConfigRequest(
    [Range(1, 30)]  int DailyUpToDays,
    [Range(2, 60)]  int Every2DaysUpToDays,
    [Range(3, 180)] int Every3DaysUpToDays,
    [Required, MaxLength(300)] string MessageActiveStreak,
    [Required, MaxLength(300)] string MessageJustBroke,
    [Required, MaxLength(300)] string MessageShortLapse,
    [Required, MaxLength(300)] string MessageMediumLapse,
    [Required, MaxLength(300)] string MessageLongAbsence
);
