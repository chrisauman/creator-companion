using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class PushSubscriptionConfiguration : IEntityTypeConfiguration<PushSubscription>
{
    public void Configure(EntityTypeBuilder<PushSubscription> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Platform).HasMaxLength(10).IsRequired();
        builder.Property(p => p.Endpoint).HasMaxLength(1024).IsRequired();
        builder.Property(p => p.P256dh).HasMaxLength(256);
        builder.Property(p => p.Auth).HasMaxLength(128);

        // One subscription per endpoint (prevents duplicates when re-subscribing)
        builder.HasIndex(p => p.Endpoint).IsUnique();
        builder.HasIndex(p => p.UserId);

        builder.HasOne(p => p.User)
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
