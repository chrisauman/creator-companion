using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class PasswordResetTokenConfiguration : IEntityTypeConfiguration<PasswordResetToken>
{
    public void Configure(EntityTypeBuilder<PasswordResetToken> b)
    {
        b.HasKey(t => t.Id);

        // New rows look up by SHA-256 hex digest (`TokenHash`); legacy
        // rows (issued before the at-rest-hash rollout) look up by the
        // plain `Token` column. Partial-unique on the hash so that the
        // lookup is O(log n) and a duplicate (which would be a SHA-256
        // collision — astronomically unlikely) is rejected at the DB.
        b.HasIndex(t => t.TokenHash)
         .IsUnique()
         .HasFilter("\"TokenHash\" IS NOT NULL");

        // Legacy plain-token index — non-unique partial. Existing rows
        // have arbitrary non-empty strings here; new rows write empty
        // string, so we exclude empties from the index to keep it lean.
        b.HasIndex(t => t.Token)
         .HasFilter("\"Token\" <> ''");

        b.HasOne(t => t.User)
         .WithMany()
         .HasForeignKey(t => t.UserId)
         .OnDelete(DeleteBehavior.Cascade);
    }
}
