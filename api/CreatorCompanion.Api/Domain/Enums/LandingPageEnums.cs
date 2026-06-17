namespace CreatorCompanion.Api.Domain.Enums;

/// <summary>
/// Lifecycle of an SEO landing page. Stored as int (append-only).
/// Only <see cref="Published"/> pages are served publicly + listed in the
/// sitemap; Draft (incl. quality-gate "held") pages are admin-only + noindex;
/// Archived is an unpublished-but-kept page (soft removal keeps the slug so we
/// can 410/redirect rather than create an SEO dead-end).
/// </summary>
public enum LandingPageStatus
{
    Draft     = 0,
    Published = 1,
    Archived  = 2,
}

/// <summary>
/// Lifecycle of a keyword/topic in the research → build pipeline. Stored as int
/// (append-only). The flow: research surfaces candidates as <see cref="Idea"/>
/// (remembered so they're never re-suggested), promoting one to <see cref="Pending"/>
/// (the build queue, where a brief is generated); the daily worker draws the
/// highest-priority Pending keyword, generates a page, and marks it Generated
/// (or Failed). <see cref="Rejected"/> = deliberately won't build (still
/// remembered for dedup). <see cref="Skipped"/> = the worker passed it over.
///
/// The "master index" for dedup = every keyword NOT Rejected, unioned with every
/// live page's TargetKeyword — so research can't resurface anything already
/// queued, built, or held as an idea.
/// </summary>
public enum LandingPageKeywordStatus
{
    Pending   = 0,
    Generated = 1,
    Skipped   = 2,
    Failed    = 3,
    Idea      = 4,
    Rejected  = 5,
}

/// <summary>
/// What the automated pipeline builds from a keyword. Commercial-intent terms
/// usually want a conversion <see cref="Page"/>; informational/how-to terms want
/// a teaching <see cref="Post"/> (blog). The admin sets this per keyword (intent
/// is only a hint) — a keyword routes to the matching generator + content table.
/// Default Page keeps pre-existing keywords building landing pages as before.
/// </summary>
public enum LandingPageContentType
{
    Page = 0,
    Post = 1,
}
