using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLandingPages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LandingPageKeywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Keyword = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Brief = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Priority = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    GeneratedPageId = table.Column<Guid>(type: "uuid", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LandingPageKeywords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LandingPages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    TargetKeyword = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    MetaTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    MetaDescription = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    NoIndex = table.Column<bool>(type: "boolean", nullable: false),
                    ContentJson = table.Column<string>(type: "jsonb", nullable: false),
                    OriginalContentJson = table.Column<string>(type: "jsonb", nullable: true),
                    OgImageKey = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    QualityScore = table.Column<int>(type: "integer", nullable: true),
                    GeneratedByAi = table.Column<bool>(type: "boolean", nullable: false),
                    OldSlugsJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LandingPages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LandingPageSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AutoGenerateEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AutoPublishEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    QualityThreshold = table.Column<int>(type: "integer", nullable: false),
                    GenerateHourLocalEt = table.Column<int>(type: "integer", nullable: false),
                    LastGeneratedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LandingPageSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LandingPageKeywords_Status_Priority",
                table: "LandingPageKeywords",
                columns: new[] { "Status", "Priority" });

            migrationBuilder.CreateIndex(
                name: "IX_LandingPages_Slug",
                table: "LandingPages",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LandingPages_Status_UpdatedAt",
                table: "LandingPages",
                columns: new[] { "Status", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LandingPageKeywords");

            migrationBuilder.DropTable(
                name: "LandingPages");

            migrationBuilder.DropTable(
                name: "LandingPageSettings");
        }
    }
}
