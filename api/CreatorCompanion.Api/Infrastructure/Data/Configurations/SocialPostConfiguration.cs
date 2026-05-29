using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SocialPostConfiguration : IEntityTypeConfiguration<SocialPost>
{
    public void Configure(EntityTypeBuilder<SocialPost> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Body).HasMaxLength(4000);
        builder.Property(p => p.ImageObjectKey).HasMaxLength(500);
        builder.Property(p => p.ImageContentType).HasMaxLength(100);

        builder.HasMany(p => p.Targets)
            .WithOne(t => t.SocialPost!)
            .HasForeignKey(t => t.SocialPostId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class SocialPostTargetConfiguration : IEntityTypeConfiguration<SocialPostTarget>
{
    public void Configure(EntityTypeBuilder<SocialPostTarget> builder)
    {
        builder.HasKey(t => t.Id);

        // Worker drains due ad-hoc legs by status; index the filter.
        builder.HasIndex(t => t.Status);

        builder.Property(t => t.PostedText).HasMaxLength(2000);
        builder.Property(t => t.PostedUrl).HasMaxLength(1000);
        builder.Property(t => t.ErrorMessage).HasMaxLength(2000);
    }
}
