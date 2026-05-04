using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Infrastructure.Data;

/// <summary>
/// Seeds the DailyPrompts table once on first startup with the same
/// 20 brief prompts that were previously hardcoded in the Angular
/// dashboard. Admins can edit/add/remove from the admin UI afterward.
/// Re-running the seeder is a no-op if any prompts exist.
/// </summary>
public static class DailyPromptsSeeder
{
    private static readonly string[] InitialPrompts =
    {
        "What excited you when you were creating today?",
        "What got in the way of your practice today?",
        "Describe something small you noticed.",
        "What did you almost write but didn't?",
        "Who or what made you feel seen today?",
        "What would you tell yourself one week ago?",
        "What's one thing you almost did but didn't?",
        "What were you avoiding today, and why?",
        "What surprised you this week?",
        "Where did your attention go that you didn't expect?",
        "What did you make today that you're proud of?",
        "What's a small win from this week?",
        "What's been on your mind that you haven't shared?",
        "What does your creative space need right now?",
        "What's a question you're sitting with?",
        "Describe a moment that made you feel alive today.",
        "What's something you're letting go of?",
        "What do you want to remember about today?",
        "What small risk did you take?",
        "What's something new you tried recently?",
    };

    public static async Task SeedAsync(AppDbContext db)
    {
        if (await db.DailyPrompts.AnyAsync()) return;

        var now = DateTime.UtcNow;
        var prompts = InitialPrompts.Select((text, idx) => new DailyPrompt
        {
            Text        = text,
            SortOrder   = idx,
            IsPublished = true,
            CreatedAt   = now,
            UpdatedAt   = now,
        }).ToList();

        db.DailyPrompts.AddRange(prompts);
        await db.SaveChangesAsync();
    }
}
