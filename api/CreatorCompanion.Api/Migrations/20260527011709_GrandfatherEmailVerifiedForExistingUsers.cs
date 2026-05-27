using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <summary>
    /// Risk #6 closure (2026-05-27): the new policy is that the 10-day
    /// trial starts at email-verification, and all access is blocked
    /// for unverified accounts. Applying that rule retroactively would
    /// lock out legitimate longtime users who never bothered to click
    /// their original verify link (the prior code didn't enforce
    /// verification anywhere). This migration grandfathers EVERY user
    /// who existed at deploy time into the verified state.
    ///
    /// After the migration completes, the new rule applies only to
    /// users who register POST-deploy — exactly the abuse vector
    /// Risk #6 was about (sign up with a fake email, get 10 days of
    /// access without proving ownership).
    /// </summary>
    public partial class GrandfatherEmailVerifiedForExistingUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Use a bare UPDATE with no time-cutoff predicate. The
            // migration runs at deploy startup BEFORE any post-deploy
            // registration can happen, so "every row that exists now"
            // is exactly "every pre-rollout user."
            migrationBuilder.Sql(
                "UPDATE \"Users\" SET \"EmailVerified\" = TRUE WHERE \"EmailVerified\" = FALSE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op down: we can't tell which users were originally
            // unverified vs newly-grandfathered, and we wouldn't want
            // to retroactively lock anyone out by guessing.
        }
    }
}
