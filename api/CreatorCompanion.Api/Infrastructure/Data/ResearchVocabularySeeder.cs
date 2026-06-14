using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Infrastructure.Data;

/// <summary>
/// Seeds a starter controlled vocabulary for research dimensions — the
/// disciplines + pain-points that anchor the coverage matrix and keep dedup
/// buckets coherent. A starting point for Chris to prune/extend in the admin,
/// not a fixed list. Idempotent + additive: only inserts values that don't
/// already exist, so admin edits/retirements survive every deploy.
/// </summary>
public static class ResearchVocabularySeeder
{
    private static readonly string[] Disciplines =
    {
        "Writers", "Poets", "Novelists", "Songwriters", "Musicians", "Visual artists",
        "Painters", "Illustrators", "Photographers", "Filmmakers", "Designers",
        "Ceramicists", "Crafters", "Dancers", "Actors", "Game developers", "Content creators",
    };

    private static readonly string[] PainPoints =
    {
        "Creative block", "Consistency", "Motivation", "Perfectionism", "Comparison",
        "Burnout", "Finding time", "Finishing projects", "Self-doubt", "Procrastination",
        "Building a habit", "Staying inspired", "Accountability", "Overwhelm",
    };

    public static async Task SeedAsync(AppDbContext db)
    {
        var existing = await db.ResearchVocabulary.AsNoTracking()
            .Select(v => v.Kind + "" + v.Value).ToListAsync();
        var have = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);

        var added = false;
        void Seed(string kind, string[] values)
        {
            var order = 0;
            foreach (var value in values)
            {
                order += 10;
                if (have.Contains(kind + "" + value)) continue;
                db.ResearchVocabulary.Add(new ResearchVocabulary { Kind = kind, Value = value, SortOrder = order });
                added = true;
            }
        }

        Seed("discipline", Disciplines);
        Seed("painpoint", PainPoints);
        if (added) await db.SaveChangesAsync();
    }
}
