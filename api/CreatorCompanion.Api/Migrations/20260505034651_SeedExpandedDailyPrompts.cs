using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <summary>
    /// Adds 70 user-supplied journaling prompts to the DailyPrompts
    /// library. Idempotent: each row is inserted only when no row
    /// with the same Text already exists, so re-running this
    /// migration in development won't create duplicates.
    ///
    /// Sort orders start at 100 to avoid clashing with the original
    /// seeded set (0-19) — admins can drag-reorder afterwards in
    /// /admin/prompts.
    /// </summary>
    public partial class SeedExpandedDailyPrompts : Migration
    {
        private static readonly string[] Prompts =
        {
            "What felt easiest for you in your process today?",
            "What felt heavier than it should have in your process today?",
            "Where did you slow down in your process today, and why?",
            "What did you rush through in your process that might have deserved more of your time?",
            "What might happen if you kept going in your work for another 10 minutes?",
            "What did repeating something in your process today teach you?",
            "Where did you feel the most focused in your work today?",
            "Where did your process break down today?",
            "What did you learn about how you work best in your process today?",
            "What’s one small change you could make to your routine tomorrow?",
            "What did you notice about your energy in your work today?",
            "When did you feel most present in your process today?",
            "When did your mind drift during your work, and where did it go?",
            "What detail did you notice in your work today that most people might miss?",
            "What pulled you out of your process today?",
            "What helped you come back into your work?",
            "What felt different in your process today compared to yesterday?",
            "What did you ignore in your work today that might be worth revisiting?",
            "What are you starting to see more clearly in your work right now?",
            "What are you avoiding looking at closely in your work?",
            "What emotion showed up most for you in your process today?",
            "What feeling stayed with you after you stopped your work?",
            "What felt frustrating in your process, and what do you think was underneath that?",
            "What gave you a sense of relief in your work today?",
            "What felt uncertain in your process today?",
            "What felt honest in your work today?",
            "What did you feel resistance toward in your process, and what might it be protecting?",
            "What did you enjoy in your work more than you expected?",
            "What are you carrying from your process today into tomorrow?",
            "What would it feel like to approach your work with less pressure?",
            "What kind of creator did you feel like in your work today?",
            "When did you feel most like yourself in your process?",
            "When did you feel like you were imitating something or someone else in your work?",
            "What are you trying to prove in your work, if anything?",
            "What would your work look like if no one ever saw it?",
            "What are you becoming more confident in within your work?",
            "What still feels unclear about your voice in your work?",
            "What are you starting to recognize as yours in your process?",
            "What would you keep doing in your work even if it never improved?",
            "What does good work mean to you right now?",
            "What feels like it’s building in your work right now?",
            "What feels stuck in your process?",
            "What did you move forward in your work today, even a little?",
            "What feels unfinished but important in your work?",
            "What’s one thread in your work you want to follow next?",
            "What are you close to understanding in your process?",
            "What would progress look like for you in your work tomorrow?",
            "What are you overthinking in your work right now?",
            "What might happen if you simplified your process?",
            "What deserves more of your attention in your work this week?",
            "How did your environment affect your work today?",
            "What helped you begin your process today?",
            "What made it harder for you to start your work?",
            "What distractions showed up during your process?",
            "What conditions made your work easier today?",
            "What would an ideal creative day in your work look like right now?",
            "What could you remove from your environment to make more space for your work?",
            "What could you add to your environment to better support your focus?",
            "Where did you feel most comfortable working today?",
            "Where did you feel resistance to being in your creative space?",
            "What would your work today look like from the outside?",
            "What are you making your work mean about yourself?",
            "What might you be overcomplicating in your process?",
            "What is actually working in your work that you might be overlooking?",
            "What feels more important to you in your work now than it did before?",
            "What are you learning from your process that has nothing to do with the work itself?",
            "What would you do differently in your work if you trusted yourself more?",
            "What is enough for you in your work today?",
            "What would just showing up to your work look like for you tomorrow?",
            "What are you grateful for in your practice right now?",
        };

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            const int sortStart = 100;

            for (var i = 0; i < Prompts.Length; i++)
            {
                // Double single quotes to escape any straight ASCII
                // apostrophes. The user's prompts use curly ’
                // so this is mostly defence in depth.
                var escaped = Prompts[i].Replace("'", "''");
                var sortOrder = sortStart + i;

                migrationBuilder.Sql($"""
                    INSERT INTO "DailyPrompts" ("Id", "Text", "SortOrder", "IsPublished", "CreatedAt", "UpdatedAt")
                    SELECT gen_random_uuid(), '{escaped}', {sortOrder}, true, NOW(), NOW()
                    WHERE NOT EXISTS (SELECT 1 FROM "DailyPrompts" WHERE "Text" = '{escaped}');
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Removing seeded prompts on a rollback would also delete
            // any user edits made through the admin panel after seed —
            // safer to leave them in place and let the admin clean up
            // manually if the migration is reverted.
        }
    }
}
