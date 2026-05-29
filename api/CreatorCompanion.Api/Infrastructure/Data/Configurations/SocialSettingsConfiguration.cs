using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class SocialSettingsConfiguration : IEntityTypeConfiguration<SocialSettings>
{
    public void Configure(EntityTypeBuilder<SocialSettings> builder)
    {
        builder.HasKey(s => s.Id);
    }
}
