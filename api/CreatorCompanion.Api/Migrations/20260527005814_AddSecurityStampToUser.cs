using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSecurityStampToUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add the column with an empty default so the NOT NULL
            // constraint passes on existing rows during the schema change.
            migrationBuilder.AddColumn<string>(
                name: "SecurityStamp",
                table: "Users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            // Immediately backfill every existing user with a unique
            // random stamp. If we left them all as "", every user would
            // share a stamp until they next logged in — meaning a
            // stamp-bump on one user could collide with the empty-stamp
            // group, and the audit trail of "this user's stamp changed"
            // would be impossible to read. gen_random_uuid() is built
            // into Postgres 13+; cast to text so it fits the varchar(64)
            // column. The "::text" cast yields the 36-char dashed
            // form — well under the 64-char cap, and visually
            // distinguishable from the dashless form
            // (Guid.NewGuid().ToString("N")) that AuthService emits for
            // new users post-migration. Either form is valid as a stamp
            // value; we only ever compare for equality, never parse.
            migrationBuilder.Sql(
                "UPDATE \"Users\" SET \"SecurityStamp\" = gen_random_uuid()::text WHERE \"SecurityStamp\" = '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SecurityStamp",
                table: "Users");
        }
    }
}
