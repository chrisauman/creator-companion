using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class ReminderConfiguration : IEntityTypeConfiguration<Reminder>
{
    public void Configure(EntityTypeBuilder<Reminder> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Message).HasMaxLength(200);
        // Store TimeOnly as HH:mm string
        builder.Property(r => r.Time)
            .HasConversion(
                t => t.ToString("HH:mm"),
                s => TimeOnly.ParseExact(s, "HH:mm"))
            .HasMaxLength(5)
            .IsRequired();

        builder.HasIndex(r => r.UserId);

        // Partial index on enabled reminders. The background worker
        // queries `WHERE IsEnabled = true` every 60 seconds; without
        // this index it scans the full Reminders table. Filtering on
        // IsEnabled = true keeps the index small (most rows are slots
        // the user hasn't turned on yet).
        builder.HasIndex(r => r.IsEnabled)
            .HasFilter("\"IsEnabled\" = true");

        builder.HasOne(r => r.User)
            .WithMany()
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
