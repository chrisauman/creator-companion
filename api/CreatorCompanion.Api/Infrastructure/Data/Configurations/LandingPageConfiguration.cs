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
        b.Property(k => k.Brief).HasMaxLength(2000);
        b.Property(k => k.LastError).HasMaxLength(2000);
        // Worker draws the next Pending keyword by priority then age.
        b.HasIndex(k => new { k.Status, k.Priority });
    }
}
