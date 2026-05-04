using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDailyPrompts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyPrompts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyPrompts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailyPrompts_IsPublished",
                table: "DailyPrompts",
                column: "IsPublished");

            migrationBuilder.CreateIndex(
                name: "IX_DailyPrompts_SortOrder",
                table: "DailyPrompts",
                column: "SortOrder");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyPrompts");
        }
    }
}
