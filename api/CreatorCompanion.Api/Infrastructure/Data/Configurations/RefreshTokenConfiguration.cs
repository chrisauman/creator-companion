using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Token).HasMaxLength(512).IsRequired();

        builder.HasIndex(r => r.Token).IsUnique();
        builder.HasIndex(r => r.UserId);

        builder.HasOne(r => r.User)
            .WithMany(u => u.RefreshTokens)
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Computed columns are not mapped — IsExpired/IsActive/IsRevoked are C# only
        builder.Ignore(r => r.IsExpired);
        builder.Ignore(r => r.IsRevoked);
        builder.Ignore(r => r.IsActive);
    }
}
