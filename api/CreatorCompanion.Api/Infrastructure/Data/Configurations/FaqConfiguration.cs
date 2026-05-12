using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class FaqConfiguration : IEntityTypeConfiguration<Faq>
{
    public void Configure(EntityTypeBuilder<Faq> builder)
    {
        builder.HasKey(f => f.Id);
        builder.Property(f => f.Question).HasMaxLength(500).IsRequired();
        builder.Property(f => f.Answer).IsRequired();
        builder.Property(f => f.Category).HasMaxLength(80).HasDefaultValue("General");
        builder.HasIndex(f => f.SortOrder);
        builder.HasIndex(f => f.Category);
    }
}
