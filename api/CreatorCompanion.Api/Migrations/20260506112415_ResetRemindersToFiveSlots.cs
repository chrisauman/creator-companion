using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <summary>
    /// Resets every user's reminders to a fresh set of five fixed slots.
    /// Wipes all existing reminders and inserts five new ones per user —
    /// all at noon, all disabled, with sequential CreatedAt timestamps so
    /// "slot #1" is stable. The notifications page renders these as five
    /// identical slots; users toggle each on/off and edit their times +
    /// messages from there.
    ///
    /// Safe in this codebase because we're still pre-launch with only
    /// internal users; in production this kind of wipe-and-reseed would
    /// need confirmed sign-off.
    ///
    /// Down() is intentionally a no-op — the wiped reminders can't be
    /// recovered from the migration alone, and rolling forward + back
    /// shouldn't be a recovery path here.
    /// </summary>
    public partial class ResetRemindersToFiveSlots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop every existing reminder.
            migrationBuilder.Sql(@"DELETE FROM ""Reminders"";");

            // 2. Insert five disabled noon slots per user. CreatedAt is
            //    offset by milliseconds so the slot order is deterministic
            //    when sorted by CreatedAt. gen_random_uuid() requires
            //    PostgreSQL 13+ (Railway is fine).
            migrationBuilder.Sql(@"
                INSERT INTO ""Reminders"" (""Id"", ""UserId"", ""Time"", ""Message"", ""IsEnabled"", ""IsDefault"", ""LastSentAt"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(),
                       u.""Id"",
                       TIME '12:00',
                       NULL,
                       FALSE,
                       FALSE,
                       NULL,
                       NOW() + (slot * INTERVAL '1 millisecond'),
                       NOW() + (slot * INTERVAL '1 millisecond')
                FROM ""Users"" u
                CROSS JOIN generate_series(0, 4) AS slot;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op — the original reminders are gone after Up() runs and
            // there's no way to reconstruct them from the schema alone.
        }
    }
}
