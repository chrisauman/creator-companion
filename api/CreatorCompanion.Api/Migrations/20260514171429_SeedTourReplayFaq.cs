using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class SeedTourReplayFaq : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Move the "Can I watch the onboarding tour again?" entry
            // out of the hardcoded pinned section on the support page
            // and into the regular FAQ list so the admin can manage it
            // alongside everything else. Answer contains an anchor tag
            // — see support.component.ts + marketing/faq.html for the
            // matching innerHTML render path. SortOrder of 5 puts it
            // near the top of "Getting started" (other questions start
            // at 10) without leapfrogging the existing first entry.
            //
            // Idempotent via WHERE NOT EXISTS so re-running on a DB
            // where the row already exists is a no-op.
            var question = "Can I watch the onboarding tour again?";
            var answer = "Yes — <a href=\"/onboarding?replay=1\">click this link to begin</a>. " +
                         "You'll see the welcome cards, followed by tooltips that point out " +
                         "each major feature on your dashboard.";
            var category = "Getting started";
            var sortOrder = 5;

            // Same escaping pattern as the AddFaqCategory seed migration —
            // single-quote doubling for Postgres, no parameters because
            // the content is fixed and written by us.
            var qEsc = question.Replace("'", "''");
            var aEsc = answer.Replace("'", "''");
            var cEsc = category.Replace("'", "''");
            migrationBuilder.Sql($@"
                INSERT INTO ""Faqs"" (""Id"", ""Question"", ""Answer"", ""Category"", ""SortOrder"", ""IsPublished"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), '{qEsc}', '{aEsc}', '{cEsc}', {sortOrder}, TRUE, NOW(), NOW()
                WHERE NOT EXISTS (SELECT 1 FROM ""Faqs"" WHERE ""Question"" = '{qEsc}');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Don't auto-delete the seeded row on rollback — the admin
            // may have edited it and rolling back would discard their
            // changes. Manual cleanup if truly needed.
        }
    }
}
