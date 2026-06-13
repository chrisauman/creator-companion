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
/// Status of a keyword in the generation queue. The daily worker draws the
/// highest-priority <see cref="Pending"/> keyword, generates a page, and marks
/// it Generated (or Failed, with the error retained for the admin).
/// </summary>
public enum LandingPageKeywordStatus
{
    Pending   = 0,
    Generated = 1,
    Skipped   = 2,
    Failed    = 3,
}
