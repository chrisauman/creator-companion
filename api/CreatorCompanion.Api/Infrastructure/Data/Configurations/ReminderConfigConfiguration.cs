using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class ReminderConfigConfiguration : IEntityTypeConfiguration<ReminderConfig>
{
    public void Configure(EntityTypeBuilder<ReminderConfig> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.MessageActiveStreak).HasMaxLength(300).IsRequired();
        builder.Property(r => r.MessageJustBroke).HasMaxLength(300).IsRequired();
        builder.Property(r => r.MessageShortLapse).HasMaxLength(300).IsRequired();
        builder.Property(r => r.MessageMediumLapse).HasMaxLength(300).IsRequired();
        builder.Property(r => r.MessageLongAbsence).HasMaxLength(300).IsRequired();

        // Seed the singleton row with defaults
        builder.HasData(new ReminderConfig
        {
            Id                  = 1,
            DailyUpToDays       = 2,
            Every2DaysUpToDays  = 14,
            Every3DaysUpToDays  = 30,
            MessageActiveStreak = "You're on a streak. Log today's entry and keep it going.",
            MessageJustBroke    = "Your streak ended — but every great streak is rebuilt one day at a time. Start today.",
            MessageShortLapse   = "It's been a few days. Jump back in — you don't have to catch up, just continue.",
            MessageMediumLapse  = "Your creative practice misses you. Even a short entry gets you back in rhythm.",
            MessageLongAbsence  = "Still here when you're ready. One entry is all it takes to begin again.",
            UpdatedAt           = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
        });
    }
}
