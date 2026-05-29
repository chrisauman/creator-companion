using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SocialAccountConfiguration : IEntityTypeConfiguration<SocialAccount>
{
    public void Configure(EntityTypeBuilder<SocialAccount> builder)
    {
        builder.HasKey(a => a.Id);

        // At most one row per platform — the account set is keyed by
        // platform, not by user (Marketing is admin-global).
        builder.HasIndex(a => a.Platform).IsUnique();

        builder.Property(a => a.Handle).HasMaxLength(300);
        builder.Property(a => a.Endpoint).HasMaxLength(500);
        // Encrypted JSON blob — enc:v1:<base64> wrapper, comfortably
        // bounded but give generous headroom for future per-platform
        // credential shapes.
        builder.Property(a => a.CredentialsEncrypted).HasMaxLength(4000);
        builder.Property(a => a.LastFailureMessage).HasMaxLength(2000);
    }
}
