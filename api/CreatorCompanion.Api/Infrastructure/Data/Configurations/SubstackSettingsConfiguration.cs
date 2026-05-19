using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SubstackSettingsConfiguration : IEntityTypeConfiguration<SubstackSettings>
{
    public void Configure(EntityTypeBuilder<SubstackSettings> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.LastFailureMessage).HasMaxLength(2000);
        // CookieEncrypted + TimeZoneId mappings removed alongside the
        // properties — see DropSubstackCookieAndTimeZone migration for
        // the column drops.
    }
}
