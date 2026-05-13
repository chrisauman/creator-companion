using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SubstackSettingsConfiguration : IEntityTypeConfiguration<SubstackSettings>
{
    public void Configure(EntityTypeBuilder<SubstackSettings> builder)
    {
        builder.HasKey(s => s.Id);
        // Stored as base64 ciphertext — bounded but generous. Substack
        // session cookies are well under 2k chars in practice.
        builder.Property(s => s.CookieEncrypted).HasMaxLength(4000);
        builder.Property(s => s.TimeZoneId).HasMaxLength(80).IsRequired();
        builder.Property(s => s.LastFailureMessage).HasMaxLength(2000);
    }
}
