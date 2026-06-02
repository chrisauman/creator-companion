using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SocialCardAssetConfiguration : IEntityTypeConfiguration<SocialCardAsset>
{
    public void Configure(EntityTypeBuilder<SocialCardAsset> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.StorageKey).HasMaxLength(500);
        builder.Property(a => a.ContentType).HasMaxLength(100);
        // Worker purges old rows; index the timestamp for the sweep.
        builder.HasIndex(a => a.CreatedAt);
    }
}
