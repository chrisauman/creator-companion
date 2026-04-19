using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace CreatorCompanion.Api.Application.Validation;

/// <summary>
/// Requires a password to be at least 8 characters and contain at least one
/// uppercase letter, one lowercase letter, one digit, and one special character.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed partial class StrongPasswordAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext context)
    {
        if (value is not string password)
            return ValidationResult.Success; // let [Required] handle nulls

        var errors = new List<string>();

        if (password.Length < 8)
            errors.Add("at least 8 characters");
        if (!UppercaseRegex().IsMatch(password))
            errors.Add("one uppercase letter");
        if (!LowercaseRegex().IsMatch(password))
            errors.Add("one lowercase letter");
        if (!DigitRegex().IsMatch(password))
            errors.Add("one number");
        if (!SpecialCharRegex().IsMatch(password))
            errors.Add("one special character (!@#$%^&* etc.)");

        if (errors.Count == 0)
            return ValidationResult.Success;

        return new ValidationResult(
            $"Password must contain {string.Join(", ", errors)}.",
            [context.MemberName ?? "Password"]);
    }

    [GeneratedRegex(@"[A-Z]")] private static partial Regex UppercaseRegex();
    [GeneratedRegex(@"[a-z]")] private static partial Regex LowercaseRegex();
    [GeneratedRegex(@"\d")]    private static partial Regex DigitRegex();
    [GeneratedRegex(@"[^a-zA-Z\d]")] private static partial Regex SpecialCharRegex();
}
