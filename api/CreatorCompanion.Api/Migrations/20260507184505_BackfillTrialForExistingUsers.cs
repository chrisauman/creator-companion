using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class BackfillTrialForExistingUsers : Migration
    {
        /// <summary>
        /// Gives every existing user without a TrialEndsAt and without
        /// an active Stripe subscription a fresh 10-day trial starting
        /// at migration time. Without this, the trial-only model would
        /// instantly lock out everyone who signed up before the change
        /// shipped.
        ///
        /// Users WITH a Stripe subscription on record are left alone —
        /// their access is granted via HasActiveSubscription, not the
        /// trial window.
        ///
        /// Idempotent: WHERE TrialEndsAt IS NULL means re-running this
        /// won't reset anyone's trial.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                @"UPDATE ""Users""
                  SET ""TrialEndsAt"" = NOW() + INTERVAL '10 days'
                  WHERE ""TrialEndsAt"" IS NULL
                    AND ""StripeSubscriptionId"" IS NULL;"
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op. Reversing the backfill would mean clearing
            // TrialEndsAt for rows that match a specific timestamp
            // window, which is fragile. Leaving it in place is safe
            // and prevents lockouts on rollback.
        }
    }
}
