using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class AnalyticsEventConfiguration : IEntityTypeConfiguration<AnalyticsEvent>
{
    public void Configure(EntityTypeBuilder<AnalyticsEvent> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.EventType).HasConversion<string>().HasMaxLength(50);
        builder.Property(a => a.Metadata).HasColumnType("text").IsRequired();

        builder.HasIndex(a => a.UserId);
        builder.HasIndex(a => new { a.UserId, a.EventType });
        builder.HasIndex(a => a.OccurredAt);

        // No FK — analytics survive user deletion for aggregate reporting
    }
}
