using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class UserMotivationShownConfiguration : IEntityTypeConfiguration<UserMotivationShown>
{
    public void Configure(EntityTypeBuilder<UserMotivationShown> builder)
    {
        builder.HasKey(s => s.Id);

        // Each user sees each entry at most once before the library resets
        builder.HasIndex(s => new { s.UserId, s.MotivationEntryId }).IsUnique();

        // Fast lookup for "what did this user see today?"
        builder.HasIndex(s => new { s.UserId, s.ShownDate });

        builder.HasOne(s => s.User)
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.Entry)
            .WithMany(e => e.ShownRecords)
            .HasForeignKey(s => s.MotivationEntryId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
