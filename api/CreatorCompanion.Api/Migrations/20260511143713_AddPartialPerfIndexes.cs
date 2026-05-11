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
            // IX_Users_TrialEnded_Pending was a phantom from a local dev
            // environment — no prior migration ever created it, but EF
            // picked it up from a snapshot when this migration was
            // generated and emitted a DropIndex. In production the
            // index doesn't exist, so DropIndex threw and crashed the
            // app at startup before /health could respond, taking
            // Railway healthchecks down for days. Raw SQL with
            // IF EXISTS makes the drop idempotent regardless of prior
            // state. Postgres-only; tests use InMemory (no migrations).
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Users_TrialEnded_Pending\";");

            migrationBuilder.CreateIndex(
                name: "IX_Users_TrialEmail_Pending",
                table: "Users",
                column: "TrialEndsAt",
                filter: "\"StripeSubscriptionId\" IS NULL AND \"TrialEndsAt\" IS NOT NULL AND (\"TrialReminder3dSentAt\" IS NULL OR \"TrialReminder1dSentAt\" IS NULL OR \"TrialEndedEmailSentAt\" IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Users_TrialEmail_Pending\";");

            // Recreate the (phantom) original index for rollback safety.
            // IF NOT EXISTS mirrors the Up guard — never assume any
            // particular state in either direction.
            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ""IX_Users_TrialEnded_Pending""
                ON ""Users"" (""TrialEndsAt"")
                WHERE ""TrialEndedEmailSentAt"" IS NULL AND ""StripeSubscriptionId"" IS NULL AND ""TrialEndsAt"" IS NOT NULL;
            ");
        }
    }
}
