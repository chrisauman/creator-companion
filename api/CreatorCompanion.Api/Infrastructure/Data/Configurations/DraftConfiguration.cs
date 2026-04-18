using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class DraftConfiguration : IEntityTypeConfiguration<Draft>
{
    public void Configure(EntityTypeBuilder<Draft> builder)
    {
        builder.HasKey(d => d.Id);
        builder.Property(d => d.ContentText).IsRequired();
        builder.Property(d => d.Metadata).HasColumnType("nvarchar(max)").IsRequired();

        // One draft per user per journal per date
        builder.HasIndex(d => new { d.UserId, d.JournalId, d.EntryDate }).IsUnique();

        builder.HasOne(d => d.User)
            .WithMany(u => u.Drafts)
            .HasForeignKey(d => d.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(d => d.Journal)
            .WithMany()
            .HasForeignKey(d => d.JournalId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
