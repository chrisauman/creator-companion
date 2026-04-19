using System.Text;
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

    // Resend email
    builder.Services.AddOptions();
    builder.Services.AddHttpClient<ResendClient>();
    builder.Services.Configure<ResendClientOptions>(o =>
        o.ApiToken = builder.Configuration["Resend:ApiKey"] ?? string.Empty);
    builder.Services.AddTransient<IResend, ResendClient>();
    builder.Services.AddScoped<IEmailService, ResendEmailService>();

    // Application services
    builder.Services.AddScoped<IAuthService, AuthService>();
    builder.Services.AddScoped<IEntitlementService, EntitlementService>();
    builder.Services.AddScoped<IStreakService, StreakService>();
    builder.Services.AddScoped<IEntryService, EntryService>();
    builder.Services.AddScoped<IDraftService, DraftService>();
    builder.Services.AddScoped<IJournalService, JournalService>();
    builder.Services.AddScoped<IMediaService, MediaService>();
    builder.Services.AddScoped<IStorageService, LocalStorageService>();
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
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials());
    });

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
        app.MapOpenApi();

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
