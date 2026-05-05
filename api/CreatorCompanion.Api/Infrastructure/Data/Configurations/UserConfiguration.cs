using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Username).HasMaxLength(50).IsRequired();
        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.Property(u => u.PasswordHash).IsRequired();
        builder.Property(u => u.TimeZoneId).HasMaxLength(100).IsRequired();
        builder.Property(u => u.Tier).HasConversion<string>().HasMaxLength(20);
        builder.Property(u => u.ShowMotivation).HasDefaultValue(true);
        builder.Property(u => u.ShowActionItems).HasDefaultValue(true);
        builder.Property(u => u.StripeCustomerId).HasMaxLength(255);
        builder.Property(u => u.StripeSubscriptionId).HasMaxLength(255);
        builder.Property(u => u.ProfileImagePath).HasMaxLength(500);

        builder.HasIndex(u => u.Email).IsUnique();
        builder.HasIndex(u => u.Username).IsUnique();
    }
}
