using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class UpdateDefaultReminderMessage : Migration
    {
        /// <summary>
        /// Updates the seeded ReminderConfig (Id=1) MessageActiveStreak
        /// from the original "You're on a streak..." copy to the new
        /// "Remember to log today's progress..." copy.
        ///
        /// Only updates rows whose value still matches the original seed.
        /// If an admin has already customised the message via /admin/reminders,
        /// their custom text is preserved.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                @"UPDATE ""ReminderConfigs""
                  SET ""MessageActiveStreak"" = 'Remember to log today''s progress to keep your streak alive!'
                  WHERE ""Id"" = 1
                    AND ""MessageActiveStreak"" = 'You''re on a streak. Log today''s entry and keep it going.';"
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                @"UPDATE ""ReminderConfigs""
                  SET ""MessageActiveStreak"" = 'You''re on a streak. Log today''s entry and keep it going.'
                  WHERE ""Id"" = 1
                    AND ""MessageActiveStreak"" = 'Remember to log today''s progress to keep your streak alive!';"
            );
        }
    }
}
