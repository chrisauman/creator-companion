using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class JournalConfiguration : IEntityTypeConfiguration<Journal>
{
    public void Configure(EntityTypeBuilder<Journal> builder)
    {
        builder.HasKey(j => j.Id);
        builder.Property(j => j.Name).HasMaxLength(100).IsRequired();
        builder.Property(j => j.Description).HasMaxLength(500);

        builder.HasIndex(j => j.UserId);
        builder.HasIndex(j => new { j.UserId, j.DeletedAt });

        builder.HasOne(j => j.User)
            .WithMany(u => u.Journals)
            .HasForeignKey(j => j.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
