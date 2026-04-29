namespace CreatorCompanion.Api.Domain.Models;

public class EmailTemplate
{
    public int Id { get; set; }

    /// <summary>Unique key identifying the template, e.g. "welcome".</summary>
    public string Key { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    /// <summary>Editable HTML content (the inner body, not the full email wrapper).</summary>
    public string HtmlContent { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
