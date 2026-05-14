using CreatorCompanion.Api.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace CreatorCompanion.Tests.Helpers;

/// <summary>
/// Test-only helpers for the May 2026 at-rest encryption services.
/// Real EntryEncryptor + MediaUrlSigner with a fixed test key so the
/// round-trip behaviour is exercised in unit tests (not stubbed away).
/// The key is intentionally hard-coded — these are tests, not prod —
/// and is the same 32-byte all-zeros key everywhere so encrypted
/// values can be compared across test classes if needed.
/// </summary>
internal static class TestEncryptors
{
    // 32-byte all-zeros key, base64 encoded. Not secret — only used
    // by the in-memory test DB.
    private const string TestKeyBase64 =
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    public static IConfiguration BuildConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Entry:EncryptionKey"] = TestKeyBase64,
            })
            .Build();

    public static EntryEncryptor BuildEncryptor() =>
        new(BuildConfig(), NullLogger<EntryEncryptor>.Instance);

    public static MediaUrlSigner BuildUrlSigner() =>
        new(BuildConfig());
}
