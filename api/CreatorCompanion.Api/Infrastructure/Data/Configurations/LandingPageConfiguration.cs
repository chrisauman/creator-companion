using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class LandingPageConfiguration : IEntityTypeConfiguration<LandingPage>
{
    public void Configure(EntityTypeBuilder<LandingPage> b)
    {
        b.HasKey(p => p.Id);

        // Slug is the public URL key — unique across all rows (incl. soft-deleted,
        // so a deleted slug stays reserved and we never collide on re-use).
        b.HasIndex(p => p.Slug).IsUnique();
        b.Property(p => p.Slug).HasMaxLength(160).IsRequired();

        b.Property(p => p.TargetKeyword).HasMaxLength(200);
        b.Property(p => p.MetaTitle).HasMaxLength(200);
        b.Property(p => p.MetaDescription).HasMaxLength(400);
        b.Property(p => p.OgImageKey).HasMaxLength(400);

        // Section content is schema-flexible JSONB so the template can evolve
        // without migrations. Postgres-only column type; harmless on others.
        b.Property(p => p.ContentJson).HasColumnType("jsonb");
        b.Property(p => p.OriginalContentJson).HasColumnType("jsonb");
        b.Property(p => p.PreviousContentJson).HasColumnType("jsonb");
        b.Property(p => p.OldSlugsJson).HasColumnType("jsonb");

        // Directory queries filter on status + sort by dates; index the hot path.
        b.HasIndex(p => new { p.Status, p.UpdatedAt });
    }
}

public class LandingPageKeywordConfiguration : IEntityTypeConfiguration<LandingPageKeyword>
{
    public void Configure(EntityTypeBuilder<LandingPageKeyword> b)
    {
        b.HasKey(k => k.Id);
        b.Property(k => k.Keyword).HasMaxLength(200).IsRequired();
        b.Property(k => k.Brief).HasMaxLength(8000);     // structured brief is richer than the old free-text note
        b.Property(k => k.LastError).HasMaxLength(2000);
        b.Property(k => k.Theme).HasMaxLength(200);
        b.Property(k => k.Discipline).HasMaxLength(80);
        b.Property(k => k.PainPoint).HasMaxLength(80);
        b.Property(k => k.Intent).HasMaxLength(40);
        b.Property(k => k.Signature).HasMaxLength(300);
        // Worker draws the next Pending keyword by priority then age.
        b.HasIndex(k => new { k.Status, k.Priority });
        // Dedup checks hit Signature constantly — index it.
        b.HasIndex(k => k.Signature);
    }
}

public class ResearchBatchConfiguration : IEntityTypeConfiguration<ResearchBatch>
{
    public void Configure(EntityTypeBuilder<ResearchBatch> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Theme).HasMaxLength(200);
        b.Property(x => x.Method).HasMaxLength(20);
        b.Property(x => x.Discipline).HasMaxLength(80);
        b.Property(x => x.PainPoint).HasMaxLength(80);
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.HasIndex(x => x.CreatedAt);
    }
}

public class ResearchVocabularyConfiguration : IEntityTypeConfiguration<ResearchVocabulary>
{
    public void Configure(EntityTypeBuilder<ResearchVocabulary> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasMaxLength(20).IsRequired();
        b.Property(x => x.Value).HasMaxLength(80).IsRequired();
        // One value per kind — no duplicate "Musicians" disciplines.
        b.HasIndex(x => new { x.Kind, x.Value }).IsUnique();
    }
}
