using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPartialPerfIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_TrialEnded_Pending",
                table: "Users");

            migrationBuilder.CreateIndex(
                name: "IX_Users_TrialEmail_Pending",
                table: "Users",
                column: "TrialEndsAt",
                filter: "\"StripeSubscriptionId\" IS NULL AND \"TrialEndsAt\" IS NOT NULL AND (\"TrialReminder3dSentAt\" IS NULL OR \"TrialReminder1dSentAt\" IS NULL OR \"TrialEndedEmailSentAt\" IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_TrialEmail_Pending",
                table: "Users");

            migrationBuilder.CreateIndex(
                name: "IX_Users_TrialEnded_Pending",
                table: "Users",
                column: "TrialEndsAt",
                filter: "\"TrialEndedEmailSentAt\" IS NULL AND \"StripeSubscriptionId\" IS NULL AND \"TrialEndsAt\" IS NOT NULL");
        }
    }
}
