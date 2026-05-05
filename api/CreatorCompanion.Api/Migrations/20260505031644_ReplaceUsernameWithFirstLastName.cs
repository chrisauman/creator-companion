using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceUsernameWithFirstLastName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add the new columns. Default to empty string so the NOT NULL
            //    constraint is satisfied for existing rows; we'll backfill in
            //    step 2 before the legacy Username column is dropped.
            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "Users",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                table: "Users",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            // 2. Backfill FirstName / LastName from the legacy Username column.
            //    Best-effort split on space / dot / dash / underscore. If the
            //    username doesn't have a separator, the whole value goes into
            //    FirstName (capitalised) and LastName stays empty — those
            //    grandfathered users can fill in their last name from the
            //    Account page.
            //
            //    PostgreSQL — uses INITCAP and SPLIT_PART. Idempotent: only
            //    rows where the new columns are still empty are touched.
            migrationBuilder.Sql("""
                UPDATE "Users"
                SET
                  "FirstName" = CASE
                    WHEN POSITION(' '  IN "Username") > 0 THEN INITCAP(SPLIT_PART("Username", ' ',  1))
                    WHEN POSITION('.'  IN "Username") > 0 THEN INITCAP(SPLIT_PART("Username", '.',  1))
                    WHEN POSITION('-'  IN "Username") > 0 THEN INITCAP(SPLIT_PART("Username", '-',  1))
                    WHEN POSITION('_'  IN "Username") > 0 THEN INITCAP(SPLIT_PART("Username", '_',  1))
                    ELSE INITCAP("Username")
                  END,
                  "LastName" = CASE
                    WHEN POSITION(' '  IN "Username") > 0 THEN INITCAP(SUBSTRING("Username" FROM POSITION(' '  IN "Username") + 1))
                    WHEN POSITION('.'  IN "Username") > 0 THEN INITCAP(SUBSTRING("Username" FROM POSITION('.'  IN "Username") + 1))
                    WHEN POSITION('-'  IN "Username") > 0 THEN INITCAP(SUBSTRING("Username" FROM POSITION('-'  IN "Username") + 1))
                    WHEN POSITION('_'  IN "Username") > 0 THEN INITCAP(SUBSTRING("Username" FROM POSITION('_'  IN "Username") + 1))
                    ELSE ''
                  END
                WHERE "Username" IS NOT NULL AND "FirstName" = '';
            """);

            // 3. Drop the unique index and the Username column itself.
            migrationBuilder.DropIndex(
                name: "IX_Users_Username",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Users");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Re-add the Username column and its index. We can't perfectly
            // reconstruct the original handles, so we synthesize them from
            // the email's local-part. Existing rows get a placeholder.
            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE "Users"
                SET "Username" = LOWER(SUBSTRING("Email" FROM 1 FOR POSITION('@' IN "Email") - 1))
                WHERE "Email" LIKE '%@%';
            """);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LastName",
                table: "Users");
        }
    }
}
