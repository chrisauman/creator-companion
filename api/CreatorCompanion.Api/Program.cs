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
        return $"Host={host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Disable";
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
        options.RealIpHeader               = "X-Forwarded-For";
        options.ClientIdHeader             = "X-ClientId";
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
    // Use R2 in production, local filesystem in development
    if (builder.Environment.IsDevelopment())
        builder.Services.AddScoped<IStorageService, LocalStorageService>();
    else
        builder.Services.AddSingleton<IStorageService, R2StorageService>();
    builder.Services.AddScoped<ITagService, TagService>();
    builder.Services.AddScoped<IPauseService, PauseService>();
    builder.Services.AddScoped<IPushSender, WebPushSender>();
    builder.Services.AddHostedService<ReminderBackgroundService>();

    // Generate VAPID keys on startup if not configured (dev convenience)
    var vapidPublic = builder.Configuration["Vapid:PublicKey"];
    if (string.IsNullOrEmpty(vapidPublic))
    {
        var keys = WebPush.VapidHelper.GenerateVapidKeys();
        SerilogLog.Warning("VAPID keys not configured. Add these to appsettings.json:");
        SerilogLog.Warning("  Vapid:PublicKey  = {Key}", keys.PublicKey);
        SerilogLog.Warning("  Vapid:PrivateKey = {Key}", keys.PrivateKey);
    }

    var allowedOrigins = builder.Configuration["Cors:AllowedOrigins"]?.Split(',')
        ?? ["http://localhost:4200", "http://192.168.127.165:4200"];

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AppCors", policy =>
            policy.SetIsOriginAllowed(origin =>
                      Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                      (uri.Host == "localhost" ||
                       uri.Host == "192.168.127.165" ||
                       allowedOrigins.Any(a => a.Trim().Equals(origin, StringComparison.OrdinalIgnoreCase))))
                  .WithHeaders("Authorization", "Content-Type", "Accept", "X-Requested-With")
                  .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                  .AllowCredentials());
    });

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
        app.MapOpenApi();

    // Global exception handler — prevents stack traces leaking in production
    if (!app.Environment.IsDevelopment())
    {
        app.UseExceptionHandler(errApp => errApp.Run(async ctx =>
        {
            ctx.Response.StatusCode  = 500;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsJsonAsync(new { error = "An unexpected error occurred." });
        }));
    }

    // Security headers
    app.Use(async (context, next) =>
    {
        context.Response.Headers["X-Content-Type-Options"]    = "nosniff";
        context.Response.Headers["X-Frame-Options"]           = "DENY";
        context.Response.Headers["X-XSS-Protection"]         = "1; mode=block";
        context.Response.Headers["Referrer-Policy"]          = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"]       = "camera=(), microphone=(), geolocation=()";
        await next();
    });

    app.UseIpRateLimiting();
    app.UseCors("AppCors");
    app.UseSerilogRequestLogging();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

    // Auto-apply migrations on startup
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        SerilogLog.Information("Database migrations applied.");
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
