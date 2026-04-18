using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class PauseConfiguration : IEntityTypeConfiguration<Pause>
{
    public void Configure(EntityTypeBuilder<Pause> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.Reason).HasMaxLength(500);

        builder.HasIndex(p => new { p.UserId, p.Status });

        builder.HasOne(p => p.User)
            .WithMany(u => u.Pauses)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
