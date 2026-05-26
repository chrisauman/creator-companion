using System.Text;
using AspNetCoreRateLimit;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Infrastructure.Services;
using WebPush;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Infrastructure.Data;
using CreatorCompanion.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Resend;
using Serilog;
using SerilogLog = Serilog.Log;

SerilogLog.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Serilog
    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .WriteTo.Console()
        .WriteTo.File("logs/app-.log", rollingInterval: RollingInterval.Day));

    // ── Sentry ──────────────────────────────────────────────────────
    // Captures unhandled exceptions in controllers, JWT auth failures
    // that bubble to a 500, and any explicit SentrySdk.CaptureException
    // calls in background workers.
    //
    // IMPORTANT: the Sentry .NET SDK does NOT gracefully no-op on a
    // null DSN — it throws ArgumentNullException at boot, which kills
    // the entire app. (Error message: "To disable Sentry, pass an empty
    // string.") We sidestep that by only calling UseSentry when the
    // DSN env var is actually set. Empty DSN → Sentry isn't registered
    // at all → zero footprint, zero crash risk.
    var sentryDsn = builder.Configuration["Sentry:Dsn"];
    if (!string.IsNullOrWhiteSpace(sentryDsn))
    {
        builder.WebHost.UseSentry(o =>
        {
            o.Dsn               = sentryDsn;
        o.Environment       = builder.Environment.EnvironmentName; // "Production" / "Development"
        o.Release           = Environment.GetEnvironmentVariable("RAILWAY_GIT_COMMIT_SHA")
                           ?? Environment.GetEnvironmentVariable("GIT_COMMIT_SHA")
                           ?? "dev";
        o.TracesSampleRate  = 0.1;   // 10% of requests get performance traces — keeps free tier alive
        o.SendDefaultPii    = false; // Never send PII automatically; user ID set explicitly elsewhere
        o.MaxRequestBodySize = Sentry.Extensibility.RequestSize.None; // We scrub bodies in BeforeSend

        // BeforeSend scrubs sensitive request data BEFORE the event
        // leaves the process. For a journaling app, entry/draft/journal
        // bodies contain the user's writing — that must never appear
        // in a third-party error tracker. Cookie + Authorization
        // headers go too: a stolen JWT in a Sentry event would be a
        // credential leak waiting to happen.
        o.SetBeforeSend((Sentry.SentryEvent e, Sentry.SentryHint _) =>
        {
            try
            {
                if (e.Request is { } req)
                {
                    // Strip auth headers from every event.
                    if (req.Headers is { } headers)
                    {
                        var toRemove = headers.Keys
                            .Where(k => string.Equals(k, "Authorization", StringComparison.OrdinalIgnoreCase)
                                     || string.Equals(k, "Cookie",        StringComparison.OrdinalIgnoreCase))
                            .ToList();
                        foreach (var k in toRemove) headers.Remove(k);
                    }

                    // Strip request body on routes that carry user content
                    // or credentials. Anything we wouldn't print to a log
                    // we shouldn't ship to Sentry.
                    if (!string.IsNullOrEmpty(req.Url) && ContainsSensitiveRoute(req.Url))
                    {
                        req.Data = "[scrubbed]";
                    }
                }
            }
            catch { /* never break event delivery on a scrub error */ }

            return e;
        });
        });

        // Routes whose request bodies must NEVER reach Sentry. Anything
        // with user-authored content (entry/draft/journal text), credentials
        // (auth endpoints), or PII (account self-service).
        static bool ContainsSensitiveRoute(string url)
        {
            var u = url.ToLowerInvariant();
            return u.Contains("/v1/entries")
                || u.Contains("/v1/drafts")
                || u.Contains("/v1/journals")
                || u.Contains("/v1/auth/")
                || u.Contains("/v1/users/me")
                || u.Contains("/v1/admin/email-templates"); // template bodies are admin content but still PII-adjacent
        }
    }

    // Database
    // Support both DATABASE_URL (Railway postgres:// URL) and legacy Npgsql connection string
    var rawDbUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
        ?? builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Database=creatorcompanion;Username=postgres;Password=postgres";

    // Convert postgresql:// or postgres:// URL to Npgsql connection string
    static string ResolveConnectionString(string raw)
    {
        if (!raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return raw; // already a key=value connection string

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':');
        var user = userInfo[0];
        var pass = userInfo.Length > 1 ? userInfo[1] : string.Empty;
        var host = uri.Host;
        var port = uri.Port > 0 ? uri.Port : 5432;
        var db   = uri.AbsolutePath.TrimStart('/');
        // SSL Mode=Require with Trust Server Certificate=true is the
        // Railway-recommended posture. Railway terminates TLS internally
        // with a self-signed cert that Npgsql can't validate against a
        // root, so VerifyFull would break the connection; Require gives
        // us in-transit encryption (defense in depth against any future
        // routing change that exposes the connection) without the
        // cert-pinning headache.
        return $"Host={host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Require;Trust Server Certificate=true";
    }

    var connectionString = ResolveConnectionString(rawDbUrl);

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connectionString));

    // JWT Authentication
    var jwtSecret = builder.Configuration["Jwt:Secret"]
        ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
    if (!builder.Environment.IsDevelopment() && jwtSecret.Length < 32)
        throw new InvalidOperationException("Jwt:Secret must be at least 32 characters in production.");
    var jwtKey = Encoding.UTF8.GetBytes(jwtSecret);

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidAudience = builder.Configuration["Jwt:Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(jwtKey),
                ClockSkew = TimeSpan.Zero
            };
        });

    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    });
    builder.Services.AddControllers();
    builder.Services.AddOpenApi();

    // Config binding
    builder.Services.Configure<EntryLimitsConfig>(
        builder.Configuration.GetSection("EntryLimits"));

    // Stripe
    builder.Services.Configure<StripeConfig>(builder.Configuration.GetSection("Stripe"));
    builder.Services.AddScoped<IStripeService, StripeService>();

    // Trust the single reverse proxy (Railway / Vercel edge) that sits in front of us.
    // This ensures RemoteIpAddress reflects the real client, not the proxy.
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit     = 1;          // only trust one hop
        options.KnownIPNetworks.Clear();       // clear defaults — Railway uses dynamic proxy IPs,
        options.KnownProxies.Clear();          // so we accept any single-hop forwarded IP
    });

    // Rate limiting
    builder.Services.AddMemoryCache();
    builder.Services.Configure<IpRateLimitOptions>(options =>
    {
        var authWindow  = builder.Configuration.GetValue<int>("RateLimit:AuthWindowSeconds", 60);
        var authMax     = builder.Configuration.GetValue<int>("RateLimit:AuthMaxRequests", 10);
        var writeWindow = builder.Configuration.GetValue<int>("RateLimit:WriteWindowSeconds", 60);
        var writeMax    = builder.Configuration.GetValue<int>("RateLimit:WriteMaxRequests", 30);

        options.EnableEndpointRateLimiting = true;
        options.StackBlockedRequests       = false;
        options.HttpStatusCode             = 429;
        // UseForwardedHeaders middleware (registered below) resolves the real client IP
        // into HttpContext.Connection.RemoteIpAddress before rate limiting runs,
        // so we do NOT read the raw X-Forwarded-For header here (prevents spoofing).
        options.ClientIdHeader             = "X-ClientId";

        // The Stripe webhook MUST be exempt from the global write
        // rate limit. Stripe replays events under back-off; receiving
        // a 429 makes Stripe drop the event after retries, silently
        // losing subscription state changes. Signature verification
        // (inside StripeService.HandleWebhookAsync) is the auth gate
        // for this endpoint.
        options.EndpointWhitelist = ["post:/v1/stripe/webhook"];

        options.GeneralRules =
        [
            // Auth endpoints — tight window, low limit
            new RateLimitRule { Endpoint = "POST:/v1/auth/login",            Limit = authMax, Period = $"{authWindow}s" },
            new RateLimitRule { Endpoint = "POST:/v1/auth/register",         Limit = authMax, Period = $"{authWindow}s" },
            new RateLimitRule { Endpoint = "POST:/v1/auth/forgot-password",  Limit = authMax, Period = $"{authWindow}s" },
            new RateLimitRule { Endpoint = "POST:/v1/auth/reset-password",   Limit = authMax, Period = $"{authWindow}s" },
            // Write endpoints — broader limit
            new RateLimitRule { Endpoint = "POST:*",   Limit = writeMax, Period = $"{writeWindow}s" },
            new RateLimitRule { Endpoint = "PUT:*",    Limit = writeMax, Period = $"{writeWindow}s" },
            new RateLimitRule { Endpoint = "DELETE:*", Limit = writeMax, Period = $"{writeWindow}s" },
            new RateLimitRule { Endpoint = "PATCH:*",  Limit = writeMax, Period = $"{writeWindow}s" },
        ];
    });
    builder.Services.AddSingleton<IIpPolicyStore, MemoryCacheIpPolicyStore>();
    builder.Services.AddSingleton<IRateLimitCounterStore, MemoryCacheRateLimitCounterStore>();
    builder.Services.AddSingleton<IProcessingStrategy, AsyncKeyLockProcessingStrategy>();
    builder.Services.AddSingleton<IRateLimitConfiguration, RateLimitConfiguration>();

    // Resend email
    builder.Services.AddOptions();
    builder.Services.AddHttpClient<ResendClient>();
    builder.Services.Configure<ResendClientOptions>(o =>
        o.ApiToken = builder.Configuration["Resend:ApiKey"] ?? string.Empty);
    builder.Services.AddTransient<IResend, ResendClient>();
    builder.Services.AddScoped<IEmailService, ResendEmailService>();

    // HIBP password-safety client (used by AuthService at registration
    // + password reset, and by UsersController at password change).
    // Singleton HttpClient via the typed-client helper so the API
    // base address + 1-second timeout are set once. Fail-open
    // behaviour lives in the service itself — see
    // HibpPasswordSafetyService for the rationale.
    builder.Services.AddHttpClient<IPasswordSafetyService, HibpPasswordSafetyService>(client =>
    {
        client.BaseAddress = new Uri("https://api.pwnedpasswords.com/");
        client.Timeout     = TimeSpan.FromSeconds(1);
        // A friendly User-Agent is requested by HIBP's docs. Identifies
        // us if there's ever an abuse investigation.
        client.DefaultRequestHeaders.UserAgent.ParseAdd("creator-companion/1.0");
    });

    // Cloudflare Turnstile verifier — used by AuthController at the
    // three public-facing auth surfaces (register / login /
    // forgot-password). 5-second timeout because Cloudflare's
    // siteverify is typically <500ms but the auth path can afford
    // a bigger headroom than the HIBP path (HIBP is on the password-
    // creation hot path and we want fail-open snappy; Turnstile is
    // the bot gate and we'd rather wait a moment than skip the check).
    // Fail-closed behaviour lives in the verifier — see
    // CloudflareTurnstileVerifier for the rationale.
    builder.Services.AddHttpClient<ITurnstileVerifier, CloudflareTurnstileVerifier>(client =>
    {
        client.BaseAddress = new Uri("https://challenges.cloudflare.com/");
        client.Timeout     = TimeSpan.FromSeconds(5);
    });

    // Application services
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<IAuditService, AuditService>();
    builder.Services.AddScoped<IAuthService, AuthService>();
    builder.Services.AddScoped<IEntitlementService, EntitlementService>();
    builder.Services.AddScoped<IStreakService, StreakService>();
    builder.Services.AddScoped<IEntryService, EntryService>();
    builder.Services.AddScoped<IDraftService, DraftService>();
    builder.Services.AddScoped<IJournalService, JournalService>();
    builder.Services.AddScoped<IMediaService, MediaService>();
    builder.Services.AddScoped<IWelcomeEntryService, WelcomeEntryService>();
    // Image processing — used by MediaService and the avatar upload
    // endpoint to downscale + recompress before saving.
    builder.Services.AddSingleton<IImageProcessor, ImageSharpProcessor>();
    // Use R2 in production, local filesystem in development
    if (builder.Environment.IsDevelopment())
        builder.Services.AddScoped<IStorageService, LocalStorageService>();
    else
        builder.Services.AddSingleton<IStorageService, R2StorageService>();
    builder.Services.AddScoped<ITagService, TagService>();
    builder.Services.AddScoped<IPauseService, PauseService>();
    builder.Services.AddScoped<IPushSender, WebPushSender>();
    builder.Services.AddHostedService<ReminderBackgroundService>();

    // Server-side encryption for at-rest user content (entry title +
    // body, draft text, tag names, image bytes). Key from
    // Entry__EncryptionKey env var. Singleton because the key load
    // is one-shot and the AesGcm calls are stateless past that.
    // See EntryEncryptor for the threat model — covers DB leaks and
    // admin-DB-access, does NOT cover server compromise (that needs
    // E2EE which we deliberately deferred).
    builder.Services.AddSingleton<IEntryEncryptor, EntryEncryptor>();
    // Signed image-serve URLs so <img> tags can fetch ciphertext-on-R2
    // through an authenticated decrypting endpoint without needing a
    // JWT header. HMAC tokens bind (mediaId, userId, expiry).
    builder.Services.AddSingleton<IMediaUrlSigner, MediaUrlSigner>();
    // One-shot bulk encryption pass on startup — encrypts any legacy
    // plaintext content (entries, drafts, tag names + hashes, media
    // bytes) so DB-leak protection is complete after the May 2026
    // privacy migration. Idempotent + safe to run on every boot.
    builder.Services.AddHostedService<ContentEncryptionMigrator>();

    // Daily-spark reminder pipeline (admin-only). Used to be the
    // Substack auto-poster — cookie protector + typed HttpClient +
    // poster were removed alongside the pivot to "email the admin the
    // daily spark for manual posting" (see SubstackPostingService
    // header comment for the why). Class + table names kept as
    // "Substack*" because Substack is the only consumer today; rename
    // when we add a second platform (Bluesky/Mastodon/Threads).
    builder.Services.AddScoped<ISubstackPostingService, SubstackPostingService>();
    builder.Services.AddHostedService<SubstackPostingBackgroundService>();

    // Production safety: required env-driven settings must be set
    // BEFORE the app starts serving traffic. Missing values silently
    // crippled features at runtime (push delivery off, paywall broken,
    // no inbound email). Fail-fast surfaces misconfig in the deploy.
    if (!builder.Environment.IsDevelopment())
    {
        var required = new (string Key, string FriendlyName)[]
        {
            ("Stripe:SecretKey",     "Stripe:SecretKey"),
            ("Stripe:WebhookSecret", "Stripe:WebhookSecret"),
            ("Stripe:MonthlyPriceId","Stripe:MonthlyPriceId"),
            ("Stripe:AnnualPriceId", "Stripe:AnnualPriceId"),
            ("Vapid:PublicKey",      "Vapid:PublicKey"),
            ("Vapid:PrivateKey",     "Vapid:PrivateKey"),
            ("Vapid:Subject",        "Vapid:Subject"),
        };
        var missing = required
            .Where(r => string.IsNullOrWhiteSpace(builder.Configuration[r.Key]))
            .Select(r => r.FriendlyName)
            .ToList();
        if (missing.Count > 0)
            throw new InvalidOperationException(
                $"Required config missing in Production: {string.Join(", ", missing)}");
    }
    else
    {
        // Generate VAPID keys on startup if not configured — dev only.
        var vapidPublic = builder.Configuration["Vapid:PublicKey"];
        if (string.IsNullOrEmpty(vapidPublic))
        {
            var keys = WebPush.VapidHelper.GenerateVapidKeys();
            SerilogLog.Warning("VAPID keys not configured. Add these to appsettings.json:");
            SerilogLog.Warning("  Vapid:PublicKey  = {Key}", keys.PublicKey);
            SerilogLog.Warning("  Vapid:PrivateKey = {Key}", keys.PrivateKey);
        }
    }

    // Boot-time Resend config sanity check. Loud warnings on
    // misconfig so future "no email ever arrived" incidents surface
    // on the next deploy instead of after users complain. Doesn't
    // fail-fast — email sending is treated as best-effort.
    var resendKey  = builder.Configuration["Resend:ApiKey"];
    var resendFrom = builder.Configuration["Resend:FromEmail"];
    if (string.IsNullOrWhiteSpace(resendKey))
    {
        SerilogLog.Warning("Resend:ApiKey is not configured. Email sends will fail silently. " +
                           "Set Resend__ApiKey on Railway with a key from resend.com → API Keys.");
    }
    if (string.IsNullOrWhiteSpace(resendFrom))
    {
        SerilogLog.Warning("Resend:FromEmail is not configured. Email sends will fail. " +
                           "Set Resend__FromEmail on Railway, e.g. " +
                           "\"Creator Companion <noreply@creatorcompanionapp.com>\".");
    }
    else if (resendFrom.Contains("onboarding@resend.dev", StringComparison.OrdinalIgnoreCase))
    {
        SerilogLog.Warning("Resend:FromEmail is still using the sandbox address " +
                           "onboarding@resend.dev. This can only send to your Resend account's " +
                           "signup email. Update to a verified-domain address for production.");
    }
    else if (!resendFrom.Contains("creatorcompanionapp.com", StringComparison.OrdinalIgnoreCase))
    {
        SerilogLog.Warning("Resend:FromEmail does not appear to use the verified domain " +
                           "creatorcompanionapp.com. Current value: {From}. Sends may fail if " +
                           "the domain isn't verified in Resend.", resendFrom);
    }

    // Entry encryption key check. Same rationale as the Resend keys —
    // surface misconfig at boot rather than at first write attempt.
    var entryKey = builder.Configuration["Entry:EncryptionKey"];
    if (string.IsNullOrWhiteSpace(entryKey))
    {
        SerilogLog.Warning("Entry:EncryptionKey is not configured. User-content encryption " +
                           "is DISABLED — entry writes and reads will fail on the encryption " +
                           "code path. Generate `openssl rand -base64 32` and set the " +
                           "`Entry__EncryptionKey` env var on Railway.");
    }

    var allowedOrigins = builder.Configuration["Cors:AllowedOrigins"]?.Split(',')
        ?? ["http://localhost:4200", "http://192.168.127.165:4200"];
    var isDevEnv = builder.Environment.IsDevelopment();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AppCors", policy =>
            policy.SetIsOriginAllowed(origin =>
                  {
                      if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                          return false;

                      // Always honor the configured allowlist (production
                      // app + marketing site go here).
                      if (allowedOrigins.Any(a =>
                            a.Trim().Equals(origin, StringComparison.OrdinalIgnoreCase)))
                          return true;

                      // Loose localhost / LAN-IP allow ONLY in Development.
                      // In Production this used to let any localhost:* page
                      // (browser extensions, other locally-installed apps,
                      // attacker pages on the LAN) issue credentialed
                      // cross-origin requests against the live API.
                      if (isDevEnv && (uri.Host == "localhost" || uri.Host == "192.168.127.165"))
                          return true;

                      return false;
                  })
                  .WithHeaders("Authorization", "Content-Type", "Accept", "X-Requested-With")
                  .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                  .AllowCredentials());
    });

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
        app.MapOpenApi();

    // Global exception handler — translates known exception types to
    // appropriate HTTP statuses, hides stack traces from clients in
    // production. Currently maps NoAccessException → 402 Payment
    // Required so the frontend can show the paywall when a user's
    // trial expires mid-session. All other exceptions become 500.
    if (!app.Environment.IsDevelopment())
    {
        app.UseExceptionHandler(errApp => errApp.Run(async ctx =>
        {
            var feat = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
            var ex   = feat?.Error;

            if (ex is CreatorCompanion.Api.Application.Services.NoAccessException nae)
            {
                ctx.Response.StatusCode  = StatusCodes.Status402PaymentRequired;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsJsonAsync(new {
                    error = nae.Message,
                    code  = "trial_expired"
                });
                return;
            }

            ctx.Response.StatusCode  = 500;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsJsonAsync(new { error = "An unexpected error occurred." });
        }));
    }

    // Resolve real client IP from the trusted reverse proxy before any other middleware.
    app.UseForwardedHeaders();

    // Security headers
    app.Use(async (context, next) =>
    {
        context.Response.Headers["X-Content-Type-Options"]    = "nosniff";
        context.Response.Headers["X-Frame-Options"]           = "DENY";
        // X-XSS-Protection is deprecated and can introduce bugs in legacy
        // browsers when set to "1; mode=block" (per OWASP guidance). Use
        // "0" to explicitly disable the legacy auditor; CSP is the modern
        // mitigation (applied at the frontend / Vercel layer).
        context.Response.Headers["X-XSS-Protection"]         = "0";
        context.Response.Headers["Referrer-Policy"]          = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"]       = "camera=(), microphone=(), geolocation=()";
        // HSTS — only meaningful over HTTPS; omit in development to avoid breaking local HTTP
        if (!context.Request.Host.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        await next();
    });

    app.UseIpRateLimiting();
    app.UseCors("AppCors");
    app.UseSerilogRequestLogging();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

    // Auto-apply migrations and seed data on startup
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        SerilogLog.Information("Database migrations applied.");
        await MotivationSeeder.SeedAsync(db);
        SerilogLog.Information("Motivation library seeded.");
        await DailyPromptsSeeder.SeedAsync(db);
        SerilogLog.Information("Daily prompts seeded.");
    }

    app.Run();
}
catch (Exception ex)
{
    SerilogLog.Fatal(ex, "Application failed to start.");
}
finally
{
    SerilogLog.CloseAndFlush();
}
