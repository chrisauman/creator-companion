using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <summary>
    /// Drops SubstackSettings.CookieEncrypted and SubstackSettings.TimeZoneId
    /// after the pivot from auto-posting via stolen browser cookie to
    /// emailing the daily spark for manual posting. Neither column has a
    /// remaining caller in code; SubstackDailyPlans (the never-repeat
    /// tracking table) is left untouched.
    ///
    /// IF EXISTS / IF NOT EXISTS guards per the CLAUDE.md "Things NOT
    /// to do" rule — raw migrations against indexes/columns that may
    /// not exist on production must be guarded.
    /// </summary>
    public partial class DropSubstackCookieAndTimeZone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "SubstackSettings" DROP COLUMN IF EXISTS "CookieEncrypted";
                ALTER TABLE "SubstackSettings" DROP COLUMN IF EXISTS "TimeZoneId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rollback re-adds the columns at their previous shape so EF
            // can match the snapshot. Data inside is permanently lost —
            // explicit choice (the cookie was always going to expire,
            // the TZ was always going to be wrong post-pivot).
            migrationBuilder.Sql("""
                ALTER TABLE "SubstackSettings" ADD COLUMN IF NOT EXISTS "CookieEncrypted" character varying(4000) NULL;
                ALTER TABLE "SubstackSettings" ADD COLUMN IF NOT EXISTS "TimeZoneId" character varying(80) NOT NULL DEFAULT 'UTC';
                """);
        }
    }
}
