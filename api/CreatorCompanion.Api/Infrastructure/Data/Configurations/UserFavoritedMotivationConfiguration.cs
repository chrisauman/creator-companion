using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class UserFavoritedMotivationConfiguration : IEntityTypeConfiguration<UserFavoritedMotivation>
{
    public void Configure(EntityTypeBuilder<UserFavoritedMotivation> builder)
    {
        builder.HasKey(f => f.Id);

        // Each user can favorite each entry at most once
        builder.HasIndex(f => new { f.UserId, f.MotivationEntryId }).IsUnique();

        // Fast lookup: "what has this user favorited?"
        builder.HasIndex(f => f.UserId);

        builder.HasOne(f => f.User)
            .WithMany()
            .HasForeignKey(f => f.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(f => f.Entry)
            .WithMany(e => e.FavoriteRecords)
            .HasForeignKey(f => f.MotivationEntryId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
