using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class DailyPromptConfiguration : IEntityTypeConfiguration<DailyPrompt>
{
    public void Configure(EntityTypeBuilder<DailyPrompt> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Text).HasMaxLength(500).IsRequired();
        builder.HasIndex(p => p.SortOrder);
        builder.HasIndex(p => p.IsPublished);
    }
}
