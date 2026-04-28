using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReminderConfigs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DailyUpToDays = table.Column<int>(type: "integer", nullable: false),
                    Every2DaysUpToDays = table.Column<int>(type: "integer", nullable: false),
                    Every3DaysUpToDays = table.Column<int>(type: "integer", nullable: false),
                    MessageActiveStreak = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MessageJustBroke = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MessageShortLapse = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MessageMediumLapse = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MessageLongAbsence = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReminderConfigs", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "ReminderConfigs",
                columns: new[] { "Id", "DailyUpToDays", "Every2DaysUpToDays", "Every3DaysUpToDays", "MessageActiveStreak", "MessageJustBroke", "MessageLongAbsence", "MessageMediumLapse", "MessageShortLapse", "UpdatedAt" },
                values: new object[] { 1, 2, 14, 30, "You're on a streak. Log today's entry and keep it going.", "Your streak ended — but every great streak is rebuilt one day at a time. Start today.", "Still here when you're ready. One entry is all it takes to begin again.", "Your creative practice misses you. Even a short entry gets you back in rhythm.", "It's been a few days. Jump back in — you don't have to catch up, just continue.", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReminderConfigs");
        }
    }
}
