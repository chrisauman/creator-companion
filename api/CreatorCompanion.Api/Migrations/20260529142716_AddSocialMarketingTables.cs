using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSocialMarketingTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SocialAccounts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Platform = table.Column<int>(type: "integer", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Handle = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Endpoint = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CredentialsEncrypted = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    PostHourLocal = table.Column<int>(type: "integer", nullable: false),
                    PostMinuteLocal = table.Column<int>(type: "integer", nullable: false),
                    JitterMinutes = table.Column<int>(type: "integer", nullable: false),
                    LastSuccessAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastFailureAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastFailureMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ConsecutiveFailures = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialAccounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SocialDailyPlans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Platform = table.Column<int>(type: "integer", nullable: false),
                    SparkId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduledFor = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PostedText = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    PostedUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialDailyPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SocialDailyPlans_MotivationEntries_SparkId",
                        column: x => x.SparkId,
                        principalTable: "MotivationEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SocialPosts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    IncludeHashtags = table.Column<bool>(type: "boolean", nullable: false),
                    ImageObjectKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ImageContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ScheduledFor = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialPosts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SocialSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AutoPostEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AutoHashtagsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LastSummarySentForDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SocialPostTargets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SocialPostId = table.Column<int>(type: "integer", nullable: false),
                    Platform = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PostedText = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    PostedUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialPostTargets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SocialPostTargets_SocialPosts_SocialPostId",
                        column: x => x.SocialPostId,
                        principalTable: "SocialPosts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SocialAccounts_Platform",
                table: "SocialAccounts",
                column: "Platform",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SocialDailyPlans_Date_Platform",
                table: "SocialDailyPlans",
                columns: new[] { "Date", "Platform" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SocialDailyPlans_SparkId",
                table: "SocialDailyPlans",
                column: "SparkId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialDailyPlans_Status_ScheduledFor",
                table: "SocialDailyPlans",
                columns: new[] { "Status", "ScheduledFor" });

            migrationBuilder.CreateIndex(
                name: "IX_SocialPostTargets_SocialPostId",
                table: "SocialPostTargets",
                column: "SocialPostId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialPostTargets_Status",
                table: "SocialPostTargets",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SocialAccounts");

            migrationBuilder.DropTable(
                name: "SocialDailyPlans");

            migrationBuilder.DropTable(
                name: "SocialPostTargets");

            migrationBuilder.DropTable(
                name: "SocialSettings");

            migrationBuilder.DropTable(
                name: "SocialPosts");
        }
    }
}
