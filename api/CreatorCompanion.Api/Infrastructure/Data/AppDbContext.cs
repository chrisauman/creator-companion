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
    public DbSet<ReminderConfig> ReminderConfigs => Set<ReminderConfig>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<MotivationEntry> MotivationEntries => Set<MotivationEntry>();
    public DbSet<UserMotivationShown> UserMotivationShown => Set<UserMotivationShown>();
    public DbSet<UserFavoritedMotivation> UserFavoritedMotivations => Set<UserFavoritedMotivation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<ActionItem> ActionItems => Set<ActionItem>();
    public DbSet<Faq> Faqs => Set<Faq>();
    public DbSet<DailyPrompt> DailyPrompts => Set<DailyPrompt>();
    public DbSet<ProcessedStripeEvent> ProcessedStripeEvents => Set<ProcessedStripeEvent>();
    public DbSet<SubstackSettings> SubstackSettings => Set<SubstackSettings>();
    public DbSet<SubstackDailyPlan> SubstackDailyPlans => Set<SubstackDailyPlan>();

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
        modelBuilder.ApplyConfiguration(new ReminderConfigConfiguration());
        modelBuilder.ApplyConfiguration(new PushSubscriptionConfiguration());
        modelBuilder.ApplyConfiguration(new MotivationEntryConfiguration());
        modelBuilder.ApplyConfiguration(new UserMotivationShownConfiguration());
        modelBuilder.ApplyConfiguration(new UserFavoritedMotivationConfiguration());
        modelBuilder.ApplyConfiguration(new EmailTemplateConfiguration());
        modelBuilder.ApplyConfiguration(new ActionItemConfiguration());
        modelBuilder.ApplyConfiguration(new FaqConfiguration());
        modelBuilder.ApplyConfiguration(new DailyPromptConfiguration());
        modelBuilder.ApplyConfiguration(new PasswordResetTokenConfiguration());
        modelBuilder.ApplyConfiguration(new EmailVerificationTokenConfiguration());
        modelBuilder.ApplyConfiguration(new ProcessedStripeEventConfiguration());
        modelBuilder.ApplyConfiguration(new SubstackSettingsConfiguration());
        modelBuilder.ApplyConfiguration(new SubstackDailyPlanConfiguration());
    }
}
