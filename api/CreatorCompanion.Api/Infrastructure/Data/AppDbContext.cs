using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data.Configurations;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Journal> Journals => Set<Journal>();
    public DbSet<Entry> Entries => Set<Entry>();
    public DbSet<Draft> Drafts => Set<Draft>();
    public DbSet<EntryMedia> EntryMedia => Set<EntryMedia>();
    public DbSet<Pause> Pauses => Set<Pause>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AnalyticsEvent> AnalyticsEvents => Set<AnalyticsEvent>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<EntryTag> EntryTags => Set<EntryTag>();
    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<MotivationEntry> MotivationEntries => Set<MotivationEntry>();
    public DbSet<UserMotivationShown> UserMotivationShown => Set<UserMotivationShown>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new UserConfiguration());
        modelBuilder.ApplyConfiguration(new JournalConfiguration());
        modelBuilder.ApplyConfiguration(new EntryConfiguration());
        modelBuilder.ApplyConfiguration(new DraftConfiguration());
        modelBuilder.ApplyConfiguration(new EntryMediaConfiguration());
        modelBuilder.ApplyConfiguration(new PauseConfiguration());
        modelBuilder.ApplyConfiguration(new RefreshTokenConfiguration());
        modelBuilder.ApplyConfiguration(new AnalyticsEventConfiguration());
        modelBuilder.ApplyConfiguration(new TagConfiguration());
        modelBuilder.ApplyConfiguration(new EntryTagConfiguration());
        modelBuilder.ApplyConfiguration(new ReminderConfiguration());
        modelBuilder.ApplyConfiguration(new PushSubscriptionConfiguration());
        modelBuilder.ApplyConfiguration(new MotivationEntryConfiguration());
        modelBuilder.ApplyConfiguration(new UserMotivationShownConfiguration());
    }
}
