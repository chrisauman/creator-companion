namespace CreatorCompanion.Api.Application.DTOs;

/// <summary>
/// Strongly-typed shape of a landing page's section content — the thing stored
/// as JSONB in <see cref="Domain.Models.LandingPage.ContentJson"/>, produced by
/// the AI generator and consumed by the renderer. Every field is optional/
/// defaulted so a partial or evolving blob never throws; the renderer simply
/// skips empty sections. This IS the agreed template schema — adding a section
/// here + handling it in the renderer is all it takes to evolve the layout (no
/// DB migration, since it's JSONB).
/// </summary>
public class LpContent
{
    public LpHero? Hero { get; set; }
    public LpHook? Hook { get; set; }
    public LpExplainer? Explainer { get; set; }
    public List<LpCard> BenefitCards { get; set; } = new();
    public LpBand? Band { get; set; }
    public List<LpTip> Tips { get; set; } = new();
    public List<LpFeatureRow> FeatureRows { get; set; } = new();
    public List<LpQa> Objections { get; set; } = new();
    public List<LpQa> Faq { get; set; } = new();
    public LpFinalCta? FinalCta { get; set; }
}

public class LpHero
{
    public string? Kicker { get; set; }
    public string? H1 { get; set; }
    public string? Subhead { get; set; }
    public string? CtaLabel { get; set; }
    /// <summary>Background loop (relative or absolute). Defaults to the shared hero clip.</summary>
    public string? VideoUrl { get; set; }
    public string? PosterUrl { get; set; }
}

public class LpHook
{
    public string? Heading { get; set; }
    public string? Lead { get; set; }
    public List<string> Chips { get; set; } = new();
}

public class LpExplainer
{
    public string? Kicker { get; set; }
    public string? H2 { get; set; }
    public List<string> Paragraphs { get; set; } = new();
    public string? ImageUrl { get; set; }
    public string? ImageAlt { get; set; }
}

public class LpCard
{
    /// <summary>Icon key from the renderer's fixed brand set (e.g. "spark", "shield").</summary>
    public string? Icon { get; set; }
    public string? Title { get; set; }
    public string? Body { get; set; }
}

public class LpBand
{
    public string? Heading { get; set; }
    public string? Subtext { get; set; }
    public string? ImageUrl { get; set; }
}

public class LpTip
{
    public string? Title { get; set; }
    public string? Body { get; set; }
}

public class LpFeatureRow
{
    public string? Kicker { get; set; }
    public string? H2 { get; set; }
    public string? Body { get; set; }
    public string? MediaUrl { get; set; }
    public string? MediaAlt { get; set; }
    /// <summary>True = frame the media as an app screenshot in a phone bezel.</summary>
    public bool Phone { get; set; }
    /// <summary>True = media on the right (alternating rows).</summary>
    public bool Reverse { get; set; }
}

public class LpQa
{
    public string? Q { get; set; }
    public string? A { get; set; }
}

public class LpFinalCta
{
    public string? Heading { get; set; }
    public string? Subtext { get; set; }
    public string? CtaLabel { get; set; }
}
