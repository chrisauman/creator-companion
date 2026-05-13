using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SubstackDailyPlanConfiguration : IEntityTypeConfiguration<SubstackDailyPlan>
{
    public void Configure(EntityTypeBuilder<SubstackDailyPlan> builder)
    {
        builder.HasKey(p => p.Id);

        // Unique Date guarantees at most one plan per calendar day —
        // this is the primary idempotence guard for the worker; a
        // double-firing background tick can't insert two rows.
        builder.HasIndex(p => p.Date).IsUnique();

        // ScheduledFor is queried each tick ("plans due to fire"),
        // and Status is filtered to Pending. Composite index covers
        // the worker's main lookup.
        builder.HasIndex(p => new { p.Status, p.ScheduledFor });

        builder.HasOne(p => p.Spark)
            .WithMany()
            .HasForeignKey(p => p.SparkId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(p => p.SubstackNoteId).HasMaxLength(200);
        builder.Property(p => p.ErrorMessage).HasMaxLength(2000);
    }
}
