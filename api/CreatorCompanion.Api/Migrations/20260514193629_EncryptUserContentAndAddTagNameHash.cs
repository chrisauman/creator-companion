using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// May 2026 privacy pass: at-rest encryption of all user content.
    /// Schema-only change here — Tag.Name is widened (now stores an
    /// encrypted blob instead of plaintext) and a new NameHash column
    /// is added for deterministic-hash unique lookup. The previous
    /// (UserId, Name) unique index is dropped because Name will become
    /// ciphertext (random nonce per encryption → no equality match).
    ///
    /// IMPORTANT: the new (UserId, NameHash) index is created as a
    /// regular index (not unique) here because legacy rows all have
    /// NameHash = "" until the startup ContentEncryptionMigrator
    /// service populates them. A follow-up migration in a future
    /// release will tighten this to UNIQUE once all rows are
    /// guaranteed populated. In the meantime, TagService.CreateAsync
    /// performs an application-level uniqueness check before insert,
    /// so duplicates are still prevented.
    ///
    /// Entry.Title, Entry.ContentText, and Draft.ContentText keep
    /// their existing column types — encryption is per-row content,
    /// not a schema change. The ContentEncryptionMigrator walks the
    /// existing rows and overwrites with encrypted values on first
    /// run.
    /// </summary>
    public partial class EncryptUserContentAndAddTagNameHash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tags_UserId_Name",
                table: "Tags");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Tags",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<string>(
                name: "NameHash",
                table: "Tags",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            // Non-unique lookup index — see class-level comment for why
            // this isn't UNIQUE yet.
            migrationBuilder.CreateIndex(
                name: "IX_Tags_UserId_NameHash",
                table: "Tags",
                columns: new[] { "UserId", "NameHash" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tags_UserId_NameHash",
                table: "Tags");

            migrationBuilder.DropColumn(
                name: "NameHash",
                table: "Tags");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Tags",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.CreateIndex(
                name: "IX_Tags_UserId_Name",
                table: "Tags",
                columns: new[] { "UserId", "Name" },
                unique: true);
        }
    }
}
