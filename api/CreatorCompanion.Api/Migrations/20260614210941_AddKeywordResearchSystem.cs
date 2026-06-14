using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddKeywordResearchSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PreviousContentJson",
                table: "LandingPages",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Brief",
                table: "LandingPageKeywords",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                table: "LandingPageKeywords",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Discipline",
                table: "LandingPageKeywords",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Intent",
                table: "LandingPageKeywords",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PainPoint",
                table: "LandingPageKeywords",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Signature",
                table: "LandingPageKeywords",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Theme",
                table: "LandingPageKeywords",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ResearchBatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Theme = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Method = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Discipline = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    PainPoint = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CandidateCount = table.Column<int>(type: "integer", nullable: false),
                    AddedCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResearchBatches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ResearchVocabulary",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Value = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResearchVocabulary", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LandingPageKeywords_Signature",
                table: "LandingPageKeywords",
                column: "Signature");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchBatches_CreatedAt",
                table: "ResearchBatches",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchVocabulary_Kind_Value",
                table: "ResearchVocabulary",
                columns: new[] { "Kind", "Value" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ResearchBatches");

            migrationBuilder.DropTable(
                name: "ResearchVocabulary");

            migrationBuilder.DropIndex(
                name: "IX_LandingPageKeywords_Signature",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "PreviousContentJson",
                table: "LandingPages");

            migrationBuilder.DropColumn(
                name: "BatchId",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "Discipline",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "Intent",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "PainPoint",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "Signature",
                table: "LandingPageKeywords");

            migrationBuilder.DropColumn(
                name: "Theme",
                table: "LandingPageKeywords");

            migrationBuilder.AlterColumn<string>(
                name: "Brief",
                table: "LandingPageKeywords",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(8000)",
                oldMaxLength: 8000,
                oldNullable: true);
        }
    }
}
