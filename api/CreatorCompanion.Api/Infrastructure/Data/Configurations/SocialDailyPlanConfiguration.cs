using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SocialDailyPlanConfiguration : IEntityTypeConfiguration<SocialDailyPlan>
{
    public void Configure(EntityTypeBuilder<SocialDailyPlan> builder)
    {
        builder.HasKey(p => p.Id);

        // (Date, Platform) unique — at most one plan per platform per day.
        // This is the worker's idempotence guard: a double-firing tick
        // can't insert two rows for the same platform/day.
        builder.HasIndex(p => new { p.Date, p.Platform }).IsUnique();

        // Worker's hot lookup: pending plans whose ScheduledFor has passed.
        builder.HasIndex(p => new { p.Status, p.ScheduledFor });

        builder.HasOne(p => p.Spark)
            .WithMany()
            .HasForeignKey(p => p.SparkId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(p => p.PostedText).HasMaxLength(2000);
        builder.Property(p => p.PostedUrl).HasMaxLength(1000);
        builder.Property(p => p.ErrorMessage).HasMaxLength(2000);
    }
}
