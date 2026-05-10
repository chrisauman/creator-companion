using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class ProcessedStripeEventConfiguration : IEntityTypeConfiguration<ProcessedStripeEvent>
{
    public void Configure(EntityTypeBuilder<ProcessedStripeEvent> b)
    {
        b.HasKey(e => e.Id);
        b.Property(e => e.Id).HasMaxLength(64);
        b.Property(e => e.EventType).HasMaxLength(64);
        b.Property(e => e.ProcessedAt);
    }
}
