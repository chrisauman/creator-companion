using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class BlogPostConfiguration : IEntityTypeConfiguration<BlogPost>
{
    public void Configure(EntityTypeBuilder<BlogPost> b)
    {
        b.HasKey(p => p.Id);

        // Slug is the public key — unique across all rows (incl. soft-deleted, so
        // a deleted slug stays reserved and never collides on re-use).
        b.HasIndex(p => p.Slug).IsUnique();
        b.Property(p => p.Slug).HasMaxLength(160).IsRequired();

        b.Property(p => p.TargetKeyword).HasMaxLength(200);
        b.Property(p => p.Title).HasMaxLength(300);
        b.Property(p => p.Dek).HasMaxLength(500);
        b.Property(p => p.MetaTitle).HasMaxLength(200);
        b.Property(p => p.MetaDescription).HasMaxLength(400);
        b.Property(p => p.CanonicalUrl).HasMaxLength(500);
        b.Property(p => p.FeaturedImageUrl).HasMaxLength(600);
        b.Property(p => p.FeaturedImageAlt).HasMaxLength(400);
        b.Property(p => p.Snippet).HasMaxLength(400);
        b.Property(p => p.OgImageKey).HasMaxLength(400);

        b.Property(p => p.ContentJson).HasColumnType("jsonb");
        b.Property(p => p.OriginalContentJson).HasColumnType("jsonb");
        b.Property(p => p.PreviousContentJson).HasColumnType("jsonb");
        b.Property(p => p.OldSlugsJson).HasColumnType("jsonb");

        // Listing queries: published, by category, ordered by pin then date.
        b.HasIndex(p => new { p.Status, p.PublishDate });
        b.HasIndex(p => p.CategoryId);
    }
}

public class BlogCategoryConfiguration : IEntityTypeConfiguration<BlogCategory>
{
    public void Configure(EntityTypeBuilder<BlogCategory> b)
    {
        b.HasKey(c => c.Id);
        b.HasIndex(c => c.Slug).IsUnique();
        b.Property(c => c.Slug).HasMaxLength(120).IsRequired();
        b.Property(c => c.Name).HasMaxLength(120).IsRequired();
        b.Property(c => c.Description).HasMaxLength(600);
        b.Property(c => c.OldSlugsJson).HasColumnType("jsonb");
    }
}
