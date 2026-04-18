using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class MotivationEntryConfiguration : IEntityTypeConfiguration<MotivationEntry>
{
    public void Configure(EntityTypeBuilder<MotivationEntry> builder)
    {
        builder.HasKey(m => m.Id);
        builder.Property(m => m.Title).HasMaxLength(200).IsRequired();
        builder.Property(m => m.Takeaway).HasMaxLength(500).IsRequired();
        builder.Property(m => m.FullContent).IsRequired();
        builder.Property(m => m.Category).HasConversion<string>().HasMaxLength(50);
    }
}
