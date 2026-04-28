using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/admin/reminder-config")]
[Authorize(Roles = "Admin")]
public class ReminderConfigController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var config = await GetOrCreateAsync();
        return Ok(Map(config));
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateReminderConfigRequest req)
    {
        if (req.Every2DaysUpToDays <= req.DailyUpToDays)
            return BadRequest(new { error = "Every-2-days threshold must be greater than the daily threshold." });

        if (req.Every3DaysUpToDays <= req.Every2DaysUpToDays)
            return BadRequest(new { error = "Every-3-days threshold must be greater than the every-2-days threshold." });

        var config = await GetOrCreateAsync();

        config.DailyUpToDays       = req.DailyUpToDays;
        config.Every2DaysUpToDays  = req.Every2DaysUpToDays;
        config.Every3DaysUpToDays  = req.Every3DaysUpToDays;
        config.MessageActiveStreak = req.MessageActiveStreak.Trim();
        config.MessageJustBroke    = req.MessageJustBroke.Trim();
        config.MessageShortLapse   = req.MessageShortLapse.Trim();
        config.MessageMediumLapse  = req.MessageMediumLapse.Trim();
        config.MessageLongAbsence  = req.MessageLongAbsence.Trim();
        config.UpdatedAt           = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(Map(config));
    }

    private async Task<ReminderConfig> GetOrCreateAsync()
    {
        var config = await db.ReminderConfigs.FindAsync(1);
        if (config is not null) return config;

        config = new ReminderConfig { Id = 1 };
        db.ReminderConfigs.Add(config);
        await db.SaveChangesAsync();
        return config;
    }

    private static ReminderConfigResponse Map(ReminderConfig c) => new(
        c.DailyUpToDays,
        c.Every2DaysUpToDays,
        c.Every3DaysUpToDays,
        c.MessageActiveStreak,
        c.MessageJustBroke,
        c.MessageShortLapse,
        c.MessageMediumLapse,
        c.MessageLongAbsence,
        c.UpdatedAt
    );
}
