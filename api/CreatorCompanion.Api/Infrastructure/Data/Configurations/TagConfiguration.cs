using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CreatorCompanion.Api.Infrastructure.Data.Configurations;

public class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.HasKey(t => t.Id);
        // Name is now an encrypted blob (enc:v1:<base64>). A short
        // tag name like "writing" encrypts to ~85 bytes; cap at 200
        // to leave headroom and protect against pathological inputs.
        // Was 50 when the column stored plaintext.
        builder.Property(t => t.Name).HasMaxLength(200).IsRequired();
        // NameHash is a base64-encoded HMAC-SHA256, always 44 chars.
        builder.Property(t => t.NameHash).HasMaxLength(64).IsRequired();
        builder.Property(t => t.Color).HasMaxLength(20);

        // Non-unique lookup index. Should be UNIQUE long-term (the old
        // (UserId, Name) unique constraint protected against duplicate
        // tag names), but starting non-unique because legacy rows have
        // empty NameHash until the startup ContentEncryptionMigrator
        // populates them — a unique constraint at create time would
        // fail on the empty-string collisions. TagService.CreateAsync
        // already does an application-level uniqueness check before
        // inserting, so duplicates are still prevented going forward.
        // A future migration will tighten this back to UNIQUE once all
        // legacy rows are guaranteed populated.
        builder.HasIndex(t => new { t.UserId, t.NameHash });
        builder.HasIndex(t => t.UserId);

        builder.HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
