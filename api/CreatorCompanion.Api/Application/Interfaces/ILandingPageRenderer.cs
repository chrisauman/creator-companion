using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Renders a <see cref="LandingPage"/> (its SEO columns + JSONB content) into a
/// complete, self-contained HTML document matching the marketing template. The
/// output is served on the marketing domain via proxy, so it references the
/// marketing site's own styles.css / fonts / assets by relative URL.
///
/// All user/AI text is HTML-escaped; the only markup injected is the template's
/// own and a tiny safe emphasis subset — there is no path for content to inject
/// tags or scripts.
/// </summary>
public interface ILandingPageRenderer
{
    /// <summary>
    /// Full HTML for the page. <paramref name="related"/> are other published
    /// pages used to build the internal-linking "Related" block.
    /// </summary>
    string Render(LandingPage page, IReadOnlyList<LandingPage> related);

    /// <summary>
    /// Renders the /resources hub — an on-brand index linking to every
    /// published page (crawl discovery + internal-linking surface).
    /// </summary>
    string RenderHub(IReadOnlyList<LandingPage> pages);
}
