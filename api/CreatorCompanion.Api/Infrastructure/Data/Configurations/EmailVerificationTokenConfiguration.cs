using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class EmailVerificationTokenConfiguration : IEntityTypeConfiguration<EmailVerificationToken>
{
    public void Configure(EntityTypeBuilder<EmailVerificationToken> b)
    {
        b.HasKey(t => t.Id);

        // See PasswordResetTokenConfiguration for the dual-lookup rationale.
        b.HasIndex(t => t.TokenHash)
         .IsUnique()
         .HasFilter("\"TokenHash\" IS NOT NULL");

        b.HasIndex(t => t.Token)
         .HasFilter("\"Token\" <> ''");

        b.HasOne(t => t.User)
         .WithMany()
         .HasForeignKey(t => t.UserId)
         .OnDelete(DeleteBehavior.Cascade);
    }
}
