using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class EntryConfiguration : IEntityTypeConfiguration<Entry>
{
    public void Configure(EntityTypeBuilder<Entry> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ContentText).IsRequired();
        builder.Property(e => e.ContentType).HasMaxLength(50).IsRequired();
        builder.Property(e => e.EntrySource).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.Visibility).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.Metadata).HasColumnType("nvarchar(max)").IsRequired();

        // Critical indexes for streak computation and queries
        builder.HasIndex(e => e.UserId);
        builder.HasIndex(e => new { e.UserId, e.EntryDate });
        builder.HasIndex(e => new { e.UserId, e.DeletedAt });
        builder.HasIndex(e => e.JournalId);
        builder.HasIndex(e => e.CreatedAt);

        builder.HasOne(e => e.User)
            .WithMany(u => u.Entries)
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Journal)
            .WithMany(j => j.Entries)
            .HasForeignKey(e => e.JournalId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
