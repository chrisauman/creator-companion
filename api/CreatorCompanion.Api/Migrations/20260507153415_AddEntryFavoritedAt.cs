using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEntryFavoritedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FavoritedAt",
                table: "Entries",
                type: "timestamp with time zone",
                nullable: true);

            // Backfill: existing favorited entries get FavoritedAt set
            // to UpdatedAt — the closest available timestamp to "when
            // the user last interacted with this entry," which is
            // often the favorite click. Only touches rows where the
            // entry is actually favorited; non-favorited rows stay
            // null. Idempotent in case the migration is re-run.
            migrationBuilder.Sql(
                @"UPDATE ""Entries""
                  SET ""FavoritedAt"" = ""UpdatedAt""
                  WHERE ""IsFavorited"" = true
                    AND ""FavoritedAt"" IS NULL;"
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FavoritedAt",
                table: "Entries");
        }
    }
}
