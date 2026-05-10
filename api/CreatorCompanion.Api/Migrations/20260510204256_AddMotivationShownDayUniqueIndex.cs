using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMotivationShownDayUniqueIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Dedup any existing duplicate rows BEFORE adding the unique
            // constraint, otherwise the index creation fails on any DB
            // that was hit by the pre-fix race condition. These rows
            // are bug artifacts, not user-generated content (just a
            // record of "which motivation was shown on which day"), so
            // collapsing each (UserId, ShownDate) to the earliest row
            // costs the user at most one day of tracking history.
            migrationBuilder.Sql(@"
                DELETE FROM ""UserMotivationShown"" a
                USING ""UserMotivationShown"" b
                WHERE a.""UserId""    = b.""UserId""
                  AND a.""ShownDate"" = b.""ShownDate""
                  AND a.""Id"" > b.""Id"";
            ");

            migrationBuilder.DropIndex(
                name: "IX_UserMotivationShown_UserId_ShownDate",
                table: "UserMotivationShown");

            migrationBuilder.CreateIndex(
                name: "IX_UserMotivationShown_UserId_ShownDate",
                table: "UserMotivationShown",
                columns: new[] { "UserId", "ShownDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_UserMotivationShown_UserId_ShownDate",
                table: "UserMotivationShown");

            migrationBuilder.CreateIndex(
                name: "IX_UserMotivationShown_UserId_ShownDate",
                table: "UserMotivationShown",
                columns: new[] { "UserId", "ShownDate" });
        }
    }
}
