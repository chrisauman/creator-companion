using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.FirstName).HasMaxLength(60).IsRequired();
        builder.Property(u => u.LastName).HasMaxLength(60).IsRequired();
        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.Property(u => u.PasswordHash).IsRequired();
        builder.Property(u => u.TimeZoneId).HasMaxLength(100).IsRequired();
        builder.Property(u => u.Tier).HasConversion<string>().HasMaxLength(20);
        builder.Property(u => u.ShowMotivation).HasDefaultValue(true);
        builder.Property(u => u.ShowActionItems).HasDefaultValue(true);
        builder.Property(u => u.StripeCustomerId).HasMaxLength(255);
        builder.Property(u => u.StripeSubscriptionId).HasMaxLength(255);
        builder.Property(u => u.ProfileImagePath).HasMaxLength(500);

        builder.HasIndex(u => u.Email).IsUnique();

        // Partial index covering all three trial-lifecycle email
        // queries (3-day reminder / 1-day reminder / trial-ended).
        // The worker runs each cohort query every 60s; filtering on
        // StripeSubscriptionId IS NULL excludes the paying users the
        // worker doesn't care about, and the index sorts by
        // TrialEndsAt so the range predicates each query uses are
        // ordered scans. The trial-sent-at predicate is applied as a
        // residual filter on the index pages — still much faster than
        // a full table scan. Three separate indexes would be more
        // selective per query but cost 3× the write amplification on
        // every user update; one index is the right tradeoff for the
        // current scale.
        builder.HasIndex(u => u.TrialEndsAt)
            .HasDatabaseName("IX_Users_TrialEmail_Pending")
            .HasFilter("\"StripeSubscriptionId\" IS NULL AND \"TrialEndsAt\" IS NOT NULL AND (\"TrialReminder3dSentAt\" IS NULL OR \"TrialReminder1dSentAt\" IS NULL OR \"TrialEndedEmailSentAt\" IS NULL)");
    }
}
