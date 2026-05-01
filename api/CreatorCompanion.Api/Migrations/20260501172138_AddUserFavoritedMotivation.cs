using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserFavoritedMotivation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserFavoritedMotivations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MotivationEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserFavoritedMotivations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserFavoritedMotivations_MotivationEntries_MotivationEntryId",
                        column: x => x.MotivationEntryId,
                        principalTable: "MotivationEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserFavoritedMotivations_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserFavoritedMotivations_MotivationEntryId",
                table: "UserFavoritedMotivations",
                column: "MotivationEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_UserFavoritedMotivations_UserId",
                table: "UserFavoritedMotivations",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserFavoritedMotivations_UserId_MotivationEntryId",
                table: "UserFavoritedMotivations",
                columns: new[] { "UserId", "MotivationEntryId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserFavoritedMotivations");
        }
    }
}
