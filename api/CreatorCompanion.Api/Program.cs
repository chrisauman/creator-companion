using System.Text;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using WebPush;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Infrastructure.Data;
using CreatorCompanion.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;

Log.Logger = new LoggerConfiguration()
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
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlServer(
            builder.Configuration.GetConnectionString("DefaultConnection"),
            sql => sql.EnableRetryOnFailure(3)));

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
        Log.Warning("VAPID keys not configured. Add these to appsettings.json:");
        Log.Warning("  Vapid:PublicKey  = {Key}", keys.PublicKey);
        Log.Warning("  Vapid:PrivateKey = {Key}", keys.PrivateKey);
    }

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("LocalDev", policy =>
            policy.SetIsOriginAllowed(origin =>
                      Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                      (uri.Host == "localhost" || uri.Host == "192.168.127.165"))
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials());
    });

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.UseCors("LocalDev");
    }

    app.UseSerilogRequestLogging();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();

    // Auto-apply migrations on startup in development
    if (app.Environment.IsDevelopment())
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        Log.Information("Database migrations applied.");
    }

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application failed to start.");
}
finally
{
    Log.CloseAndFlush();
}
