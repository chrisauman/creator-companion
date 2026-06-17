using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Infrastructure.Data;

/// <summary>
/// Seeds the public-facing blog categories — the permanent "Uncategorized"
/// system category plus a starter set for Chris to prune/extend in the admin.
/// Separate from the internal research discipline/pain-point vocabulary.
/// Idempotent + additive: only inserts slugs that don't already exist, so admin
/// edits/deletes survive every deploy.
/// </summary>
public static class BlogCategorySeeder
{
    private static readonly (string Slug, string Name, string Description)[] Starter =
    {
        ("creative-practice", "Creative Practice", "Building and sustaining a daily creative habit."),
        ("overcoming-blocks", "Overcoming Blocks", "Working through creative block, doubt, and resistance."),
        ("habits-and-streaks", "Habits & Streaks", "Consistency, momentum, and not breaking the chain."),
        ("motivation", "Motivation & Mindset", "Encouragement, focus, and the inner game of creating."),
        ("journaling", "Journaling", "Methods, prompts, and the craft of keeping a journal."),
        ("for-creatives", "For Every Creative", "Ideas across writing, music, art, photography, and more."),
    };

    public static async Task SeedAsync(AppDbContext db)
    {
        var have = new HashSet<string>(
            await db.BlogCategories.AsNoTracking().Select(c => c.Slug).ToListAsync(),
            StringComparer.OrdinalIgnoreCase);

        var added = false;

        // The permanent system category — never deletable/renamable.
        if (!have.Contains("uncategorized"))
        {
            db.BlogCategories.Add(new BlogCategory { Slug = "uncategorized", Name = "Uncategorized", IsSystem = true, Position = 999 });
            have.Add("uncategorized");
            added = true;
        }

        var pos = 0;
        foreach (var (slug, name, desc) in Starter)
        {
            pos += 10;
            if (have.Contains(slug)) continue;
            db.BlogCategories.Add(new BlogCategory { Slug = slug, Name = name, Description = desc, Position = pos });
            added = true;
        }

        if (added) await db.SaveChangesAsync();
    }
}
