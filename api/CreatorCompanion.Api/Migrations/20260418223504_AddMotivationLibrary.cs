using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMotivationLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ShowMotivation",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "MotivationEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Takeaway = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    FullContent = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MotivationEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserMotivationShown",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MotivationEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShownDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserMotivationShown", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserMotivationShown_MotivationEntries_MotivationEntryId",
                        column: x => x.MotivationEntryId,
                        principalTable: "MotivationEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserMotivationShown_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserMotivationShown_MotivationEntryId",
                table: "UserMotivationShown",
                column: "MotivationEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_UserMotivationShown_UserId_MotivationEntryId",
                table: "UserMotivationShown",
                columns: new[] { "UserId", "MotivationEntryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserMotivationShown_UserId_ShownDate",
                table: "UserMotivationShown",
                columns: new[] { "UserId", "ShownDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserMotivationShown");

            migrationBuilder.DropTable(
                name: "MotivationEntries");

            migrationBuilder.DropColumn(
                name: "ShowMotivation",
                table: "Users");
        }
    }
}
