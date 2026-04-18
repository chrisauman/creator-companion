using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class EntryMediaConfiguration : IEntityTypeConfiguration<EntryMedia>
{
    public void Configure(EntityTypeBuilder<EntryMedia> builder)
    {
        builder.HasKey(m => m.Id);
        builder.Property(m => m.FileName).HasMaxLength(512).IsRequired();
        builder.Property(m => m.ContentType).HasMaxLength(100).IsRequired();
        builder.Property(m => m.StoragePath).HasMaxLength(1024).IsRequired();

        builder.HasIndex(m => m.EntryId);
        builder.HasIndex(m => new { m.EntryId, m.DeletedAt });

        builder.HasOne(m => m.Entry)
            .WithMany(e => e.Media)
            .HasForeignKey(m => m.EntryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
