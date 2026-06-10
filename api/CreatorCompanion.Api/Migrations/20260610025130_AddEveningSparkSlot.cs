using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEveningSparkSlot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded raw SQL (IF EXISTS) so a re-run or a prod index whose
            // name drifted can't fail the deploy mid-migration (per CLAUDE.md).
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_SocialDailyPlans_Date_Platform\";");

            migrationBuilder.AddColumn<int>(
                name: "Slot",
                table: "SocialDailyPlans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "EveningEnabled",
                table: "SocialAccounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "EveningPostHourLocal",
                table: "SocialAccounts",
                type: "integer",
                nullable: false,
                defaultValue: 18);   // 6pm for any pre-existing rows (evening is off by default anyway)

            migrationBuilder.AddColumn<int>(
                name: "EveningPostMinuteLocal",
                table: "SocialAccounts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_SocialDailyPlans_Date_Platform_Slot\" " +
                "ON \"SocialDailyPlans\" (\"Date\", \"Platform\", \"Slot\");");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_SocialDailyPlans_Date_Platform_Slot\";");

            migrationBuilder.DropColumn(
                name: "Slot",
                table: "SocialDailyPlans");

            migrationBuilder.DropColumn(
                name: "EveningEnabled",
                table: "SocialAccounts");

            migrationBuilder.DropColumn(
                name: "EveningPostHourLocal",
                table: "SocialAccounts");

            migrationBuilder.DropColumn(
                name: "EveningPostMinuteLocal",
                table: "SocialAccounts");

            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_SocialDailyPlans_Date_Platform\" " +
                "ON \"SocialDailyPlans\" (\"Date\", \"Platform\");");
        }
    }
}
