AuthController.cs

using Microsoft.EntityFrameworkCore;
using Zinara.Infrastructure;
using Zinara.Application.Common.Interfaces;
using Zinara.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi

//add services to the container
builder.Services.AddOpenApi();

builder.Services.AddControllers();

//DB CONTEXT REGISTRATION (ADD THIS)
builder.Services.AddDbContext<ZinaraDbContext> (options => 

options.UseSqlServer(builder.Configuration.GetConnectionString("ZinaraDb"))
);

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
    );
});



var app = builder.Build();
app.UseCors("DevCors");


using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ZinaraDbContext>();
    await Zinara.Infrastructure.Seeding.DbSeeder.SeedAsync(db);
}


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

//app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.UseMiddleware<Zinara.Api.Auth.SessionAuthMiddleware>();

app.MapControllers();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}


SessionAuthMiddleware.cs

using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Zinara.Infrastructure;

namespace Zinara.Api.Auth;

public class SessionAuthMiddleware
{
    private readonly RequestDelegate _next;

    public SessionAuthMiddleware(RequestDelegate next) => _next = next;



   public async Task Invoke(HttpContext context, ZinaraDbContext db)
{
    // Allow anonymous endpoints (login/health/docs)

    Console.WriteLine($"[AUTH-MW] {context.Request.Method} {context.Request.Path}");
    var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";

    if (path.StartsWith("/auth/login") ||
        path.StartsWith("/health") ||
        path.StartsWith("/swagger") ||
        path.StartsWith("/openapi"))
    {
        await _next(context);
        return;
    }

    var rawToken = GetBearer(context);

    // If no token, do NOT block here — downstream [Authorize] will handle
    if (string.IsNullOrWhiteSpace(rawToken))
    {
        await _next(context);
        return;
    }

    var tokenHash = AuthCrypto.Sha256Hex(rawToken);
    var now = DateTime.UtcNow;

    var session = await db.Sessions.AsNoTracking()
        .FirstOrDefaultAsync(s =>
            s.TokenHash == tokenHash &&
            !s.IsRevoked &&
            s.ExpiresAtUtc > now);

    if (session != null)
    {
        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.UserId == session.UserId && u.IsActive);

        if (user != null)
        {
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
                new Claim("branchId", user.BranchId ?? "")
            };

            var identity = new ClaimsIdentity(claims, "SessionToken");
            context.User = new ClaimsPrincipal(identity);
        }
    }

    await _next(context);
}


    private static string? GetBearer(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header)) return null;
        const string prefix = "Bearer ";
        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
        return header.Substring(prefix.Length).Trim();
    }
}

Program.cs

using Microsoft.EntityFrameworkCore;
using Zinara.Infrastructure;
using Zinara.Application.Common.Interfaces;
using Zinara.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi

//add services to the container
builder.Services.AddOpenApi();

builder.Services.AddControllers();

//DB CONTEXT REGISTRATION (ADD THIS)
builder.Services.AddDbContext<ZinaraDbContext> (options => 

options.UseSqlServer(builder.Configuration.GetConnectionString("ZinaraDb"))
);

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
    );
});



var app = builder.Build();
app.UseCors("DevCors");


using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ZinaraDbContext>();
    await IZinara.Infrastructure.Seeding.DbSeeder.SeedAsync(db);
}


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

//app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.UseMiddleware<Zinara.Api.Auth.SessionAuthMiddleware>();

app.MapControllers();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}


CertificateService.cs

using Microsoft.EntityFrameworkCore;
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Zinara.Domain;
using Zinara.Application.Common.Interfaces;
using Zinara.Domain.Entities;

namespace Zinara.Application.Certificates;

public sealed class CertificateService : ICertificateService
{
    private readonly IZinaraDbContext _db;

    public CertificateService(IZinaraDbContext db)
    {
        _db = db;
    }

    public async Task<CaptureCertificateResponse> CaptureToHqStockAsync(
        CaptureCertificateRequest request,
        CancellationToken ct = default
    )
    {
        // ---------- Validation ----------
        var certTypeId = (request.CertTypeId ?? "").Trim().ToUpperInvariant();
        var certNo = (request.CertificateNumber ?? "").Trim();

        if (string.IsNullOrWhiteSpace(certTypeId))
            throw new InvalidOperationException("CertTypeId is required.");

        if (string.IsNullOrWhiteSpace(certNo))
            throw new InvalidOperationException("CertificateNumber is required.");

        if (request.CapturedByUserId == Guid.Empty)
            throw new InvalidOperationException("CapturedByUserId is required (dev mode).");

        // Ensure cert type exists + active (optional but recommended)
        var certTypeExists = await _db.CertificateTypes
            .AnyAsync(t => t.CertTypeId == certTypeId && t.IsActive, ct);

        if (!certTypeExists)
            throw new InvalidOperationException($"CertificateType not found or inactive: {certTypeId}");

        // Ensure user exists + active (optional but recommended)
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.UserId == request.CapturedByUserId && u.IsActive, ct);

        if (user is null)
            throw new InvalidOperationException("CapturedByUser is not found or inactive.");

        // Business rule (recommended): only HQ can capture to HQ stock
        if (user.Role != UserRole.HQ_ADMIN)
            throw new InvalidOperationException("Only HQ_ADMIN can capture to HQ stock.");

        // ---------- Duplicate Check (case-insensitive) ----------
        var exists = await _db.Certificates.AnyAsync(
            c => c.CertificateNumber.ToLower() == certNo.ToLower(),
            ct
        );

        if (exists)
            throw new InvalidOperationException($"Duplicate certificate number: {certNo}");

        // ---------- Create certificate ----------
        var now = DateTime.UtcNow;

        var entity = new Certificate
        {
            CertificateId = Guid.NewGuid(),
            CertificateNumber = certNo,
            CertTypeId = certTypeId,

            Status = CertificateStatus.HQ_STOCK,
            CurrentOwnerType = OwnerType.HQ,
            CurrentOwnerBranchId = null,

            CapturedAtUtc = now,
            CapturedByUserId = user.UserId,
            LastMovementAtUtc = now
        };

        _db.Certificates.Add(entity);

        // ---------- Audit ----------
        var audit = new AuditEvent
        {
            AuditId = Guid.NewGuid(),
            AtUtc = now,
            EventType = "CAPTURE",
            ActorUserId = user.UserId,
            ActorRole = user.Role.ToString(),
            EntityType = "CERTIFICATE",
            EntityId = certNo,
            PayloadJson = JsonSerializer.Serialize(new
            {
                certTypeId,
                certificateNumber = certNo,
                status = entity.Status.ToString(),
                method = request.Method,
                batchId = request.BatchId
            })
        };

        _db.AuditEvents.Add(audit);

        await _db.SaveChangesAsync(ct);

        return new CaptureCertificateResponse
        {
            Ok = true,
            CertificateId = entity.CertificateId,
            CertificateNumber = entity.CertificateNumber,
            Status = entity.Status.ToString(),
            CapturedAtUtc = entity.CapturedAtUtc
        };
    }
}

DbSeeder.cs

using Microsoft.EntityFrameworkCore;
using Zinara.Domain.Entities;
using Zinara.Domain; // enums
using System.Security.Cryptography;
using System.Text;

namespace Zinara.Infrastructure.Seeding;

public static class DbSeeder
{
    public static async Task SeedAsync(ZinaraDbContext db)
    {
        // 0) Apply migrations
        await db.Database.MigrateAsync();

        // 1) Branches (add missing by BranchId)
        await EnsureBranchesAsync(db);

        // 2) Certificate Types (add missing by CertTypeId)
        await EnsureCertificateTypesAsync(db);

        // 3) Users (add missing by Username)
        await EnsureUsersAsync(db);

        // 4) Thresholds (global defaults, add missing per CertTypeId with BranchId = null)
        await EnsureGlobalThresholdsAsync(db);
    }

    private static async Task EnsureBranchesAsync(ZinaraDbContext db)
    {
        var desired = new[]
        {
            new Branch { BranchId = "HQ",    BranchName = "Head Office" },
            new Branch { BranchId = "BR001", BranchName = "Borrowdale Branch" },
            new Branch { BranchId = "BR002", BranchName = "Bulawayo Branch" }
        };

        var existingIds = await db.Branches
            .Select(b => b.BranchId)
            .ToListAsync();

        var missing = desired
            .Where(b => !existingIds.Contains(b.BranchId))
            .ToList();

        if (missing.Count > 0)
        {
            db.Branches.AddRange(missing);
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureCertificateTypesAsync(ZinaraDbContext db)
    {
        var desired = new[]
        {
            new CertificateType { CertTypeId = "MOTOR_INSURANCE", Name = "Motor Insurance Certificate" },
            new CertificateType { CertTypeId = "FIRE_INSURANCE",  Name = "Fire Insurance Certificate" }
        };

        var existingIds = await db.CertificateTypes
            .Select(c => c.CertTypeId)
            .ToListAsync();

        var missing = desired
            .Where(c => !existingIds.Contains(c.CertTypeId))
            .ToList();

        if (missing.Count > 0)
        {
            db.CertificateTypes.AddRange(missing);
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureUsersAsync(ZinaraDbContext db)
    {
        // Ensure HQ exists (should be created by EnsureBranchesAsync)
        var hqExists = await db.Branches.AnyAsync(b => b.BranchId == "HQ");
        if (!hqExists) throw new InvalidOperationException("Seed failed: Branch 'HQ' not found.");

        var br001Exists = await db.Branches.AnyAsync(b => b.BranchId == "BR001");
        if (!br001Exists) throw new InvalidOperationException("Seed failed: Branch 'BR001' not found.");

        // What we want
        var desired = new[]
        {
            new AppUser
            {
                Username = "hq.admin",
                DisplayName = "HQ Admin",
                Role = UserRole.HQ_ADMIN,
                BranchId = "HQ",
                //PasswordHash = HashPassword("Admin@123"),
                PasswordHash = "Admin@123",
                IsActive = true
            },
            new AppUser
            {
                Username = "br001.user",
                DisplayName = "BR001 User",
                Role = UserRole.BRANCH_USER,
                BranchId = "BR001",
                //PasswordHash = HashPassword("Br001@123"),
                PasswordHash = "Br001@123"),
                IsActive = true
            }
        };

        var existingUsernames = await db.Users
            .Select(u => u.Username)
            .ToListAsync();

        var missing = desired
            .Where(u => !existingUsernames.Contains(u.Username))
            .ToList();

        if (missing.Count > 0)
        {
            // If your AppUser.UserId default already generates GUID, you can omit this.
            foreach (var u in missing)
                u.UserId = Guid.NewGuid();

            db.Users.AddRange(missing);
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureGlobalThresholdsAsync(ZinaraDbContext db)
    {
        // pick updater (must exist)
        var updater = await db.Users.FirstOrDefaultAsync(u => u.Username == "hq.admin");
        if (updater == null) throw new InvalidOperationException("Seed failed: user 'hq.admin' not found.");

        // Global thresholds = BranchId == null
        var existingGlobal = await db.Thresholds
            .Where(t => t.BranchId == null)
            .Select(t => t.CertTypeId)
            .ToListAsync();

        var desired = new[]
        {
            new Threshold
            {
                ThresholdId = Guid.NewGuid(),
                CertTypeId = "MOTOR_INSURANCE",
                BranchId = null,
                MinLevel = 50,
                UpdatedByUserId = updater.UserId,
                UpdatedAtUtc = DateTime.UtcNow
            },
            new Threshold
            {
                ThresholdId = Guid.NewGuid(),
                CertTypeId = "FIRE_INSURANCE",
                BranchId = null,
                MinLevel = 20,
                UpdatedByUserId = updater.UserId,
                UpdatedAtUtc = DateTime.UtcNow
            }
        };

        var missing = desired
            .Where(t => !existingGlobal.Contains(t.CertTypeId))
            .ToList();

        if (missing.Count > 0)
        {
            db.Thresholds.AddRange(missing);
            await db.SaveChangesAsync();
        }
    }

    // Simple hash (OK for dev seed). For production, use ASP.NET Identity / BCrypt.
    private static string HashPassword(string raw)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
        return Convert.ToBase64String(bytes);
    }
}

ZinaraDbContext.cs

using Microsoft.EntityFrameworkCore;
using Zinara.Domain.Entities;
using Zinara.Domain;
using Zinara.Application.Common.Interfaces;

using Zinara.Infrastructure.Persistence;



namespace Zinara.Infrastructure.Persistence;

public class ZinaraDbContext : DbContext, IZinaraDbContext

{
    public ZinaraDbContext(DbContextOptions<ZinaraDbContext> options) : base(options) { }

    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<CertificateType> CertificateTypes => Set<CertificateType>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Certificate> Certificates => Set<Certificate>();
    public DbSet<Transfer> Transfers => Set<Transfer>();
    public DbSet<TransferItem> TransferItems => Set<TransferItem>();
    public DbSet<Return> Returns => Set<Return>();
    public DbSet<ReturnItem> ReturnItems => Set<ReturnItem>();
    public DbSet<StockRequest> StockRequests => Set<StockRequest>();
    public DbSet<Threshold> Thresholds => Set<Threshold>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    public DbSet<Session> Sessions => Set<Session>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SCHEMAS
        modelBuilder.Entity<Branch>().ToTable("Branches", "ref");
        modelBuilder.Entity<CertificateType>().ToTable("CertificateTypes", "ref");
        modelBuilder.Entity<AppUser>().ToTable("Users", "sec");
        modelBuilder.Entity<Certificate>().ToTable("Certificates", "core");
        modelBuilder.Entity<Transfer>().ToTable("Transfers", "ops");
        modelBuilder.Entity<TransferItem>().ToTable("TransferItems", "ops");
        modelBuilder.Entity<Return>().ToTable("Returns", "ops");
        modelBuilder.Entity<ReturnItem>().ToTable("ReturnItems", "ops");
        modelBuilder.Entity<StockRequest>().ToTable("StockRequests", "ops");
        modelBuilder.Entity<Threshold>().ToTable("Thresholds", "ops");
        modelBuilder.Entity<AuditEvent>().ToTable("AuditEvents", "audit");

        // Branch
        modelBuilder.Entity<Branch>(e =>
        {
            e.HasKey(x => x.BranchId);
            e.Property(x => x.BranchId).HasMaxLength(10).IsUnicode(false);
            e.Property(x => x.BranchName).HasMaxLength(120).IsUnicode(true).IsRequired();
            e.Property(x => x.CreatedAtUtc).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        // CertificateType
        modelBuilder.Entity<CertificateType>(e =>
        {
            e.HasKey(x => x.CertTypeId);
            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(120).IsUnicode(true).IsRequired();
            e.Property(x => x.CreatedAtUtc).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        // Users
        modelBuilder.Entity<AppUser>(e =>
        {
            e.HasKey(x => x.UserId);
            e.Property(x => x.Username).HasMaxLength(80).IsUnicode(false).IsRequired();
            e.HasIndex(x => x.Username).IsUnique();

            e.Property(x => x.PasswordHash).HasMaxLength(300).IsUnicode(true).IsRequired();
            e.Property(x => x.DisplayName).HasMaxLength(120);

            e.Property(x => x.Role).HasConversion<int>(); // store enum as int
            e.Property(x => x.BranchId).HasMaxLength(10).IsUnicode(false);

            e.HasOne(x => x.Branch)
                .WithMany(b => b.Users)
                .HasForeignKey(x => x.BranchId)
                .OnDelete(DeleteBehavior.Restrict);

            e.Property(x => x.CreatedAtUtc).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        // Certificates
        modelBuilder.Entity<Certificate>(e =>
        {
            e.HasKey(x => x.CertificateId);

            e.Property(x => x.CertificateNumber).HasMaxLength(80).IsUnicode(false).IsRequired();
            e.HasIndex(x => x.CertificateNumber).IsUnique();

            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false).IsRequired();

            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.CurrentOwnerType).HasConversion<int>();
            e.Property(x => x.CurrentOwnerBranchId).HasMaxLength(10).IsUnicode(false);

            e.Property(x => x.CapturedAtUtc).IsRequired();
            e.Property(x => x.LastMovementAtUtc).IsRequired();

            e.Property(x => x.IssuedToClientName).HasMaxLength(120);
            e.Property(x => x.IssuedToIssuerName).HasMaxLength(120);
            e.Property(x => x.IssuedPolicyNumber).HasMaxLength(80);
            e.Property(x => x.IssuedBranchId).HasMaxLength(10).IsUnicode(false);

            e.HasOne(x => x.CertificateType)
                .WithMany()
                .HasForeignKey(x => x.CertTypeId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.CurrentOwnerBranch)
                .WithMany()
                .HasForeignKey(x => x.CurrentOwnerBranchId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.CapturedByUser)
                .WithMany()
                .HasForeignKey(x => x.CapturedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.IssuedByUser)
                .WithMany()
                .HasForeignKey(x => x.IssuedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.IssuedBranch)
                .WithMany()
                .HasForeignKey(x => x.IssuedBranchId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(x => new { x.Status, x.CertTypeId });
            e.HasIndex(x => new { x.CurrentOwnerType, x.CurrentOwnerBranchId, x.Status });

            // Optional DB-level rule (best effort):
            // If status == ISSUED then (IssuerName OR PolicyNumber) must be present.
            // NOTE: This is enforced definitively in service layer; DB constraint is extra.
            e.ToTable(tb => tb.HasCheckConstraint(
                "CK_Cert_Issue_IssuerOrPolicy",
                "([Status] <> 4) OR (NULLIF(LTRIM(RTRIM([IssuedToIssuerName])), '') IS NOT NULL OR NULLIF(LTRIM(RTRIM([IssuedPolicyNumber])), '') IS NOT NULL)"
            ));
        });

        // Transfers
        modelBuilder.Entity<Transfer>(e =>
        {
            e.HasKey(x => x.TransferId);
            e.Property(x => x.ManifestNo).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.HasIndex(x => x.ManifestNo).IsUnique();

            e.Property(x => x.ToBranchId).HasMaxLength(10).IsUnicode(false).IsRequired();
            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false).IsRequired();

            e.Property(x => x.Status).HasConversion<int>();

            e.HasOne(x => x.ToBranch).WithMany().HasForeignKey(x => x.ToBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CertificateType).WithMany().HasForeignKey(x => x.CertTypeId).OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SentByUser).WithMany().HasForeignKey(x => x.SentByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AcceptedByUser).WithMany().HasForeignKey(x => x.AcceptedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TransferItem>(e =>
        {
            e.HasKey(x => x.TransferItemId);
            e.Property(x => x.TransferItemId).ValueGeneratedOnAdd();

            e.HasOne(x => x.Transfer)
                .WithMany(t => t.Items)
                .HasForeignKey(x => x.TransferId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Certificate)
                .WithMany(c => c.TransferItems)
                .HasForeignKey(x => x.CertificateId)
                .OnDelete(DeleteBehavior.Restrict);

            // prevents a certificate from being in multiple transfer items at the same time in this MVP
            e.HasIndex(x => x.CertificateId).IsUnique();
        });

        // Returns
        modelBuilder.Entity<Return>(e =>
        {
            e.HasKey(x => x.ReturnId);
            e.Property(x => x.ManifestNo).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.HasIndex(x => x.ManifestNo).IsUnique();

            e.Property(x => x.FromBranchId).HasMaxLength(10).IsUnicode(false).IsRequired();
            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false).IsRequired();

            e.Property(x => x.Status).HasConversion<int>();

            e.HasOne(x => x.FromBranch).WithMany().HasForeignKey(x => x.FromBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CertificateType).WithMany().HasForeignKey(x => x.CertTypeId).OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SentByUser).WithMany().HasForeignKey(x => x.SentByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AcceptedByUser).WithMany().HasForeignKey(x => x.AcceptedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReturnItem>(e =>
        {
            e.HasKey(x => x.ReturnItemId);
            e.Property(x => x.ReturnItemId).ValueGeneratedOnAdd();

            e.HasOne(x => x.Return)
                .WithMany(r => r.Items)
                .HasForeignKey(x => x.ReturnId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Certificate)
                .WithMany(c => c.ReturnItems)
                .HasForeignKey(x => x.CertificateId)
                .OnDelete(DeleteBehavior.Restrict);

            // prevents a certificate from being in multiple return items at the same time in this MVP
            e.HasIndex(x => x.CertificateId).IsUnique();
        });

        // Stock Requests
        modelBuilder.Entity<StockRequest>(e =>
        {
            e.HasKey(x => x.RequestId);
            e.Property(x => x.BranchId).HasMaxLength(10).IsUnicode(false).IsRequired();
            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false).IsRequired();
            e.Property(x => x.Reason).HasMaxLength(300);

            e.Property(x => x.Status).HasConversion<int>();

            e.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CertificateType).WithMany().HasForeignKey(x => x.CertTypeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ClosedByUser).WithMany().HasForeignKey(x => x.ClosedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // Thresholds
        modelBuilder.Entity<Threshold>(e =>
        {
            e.HasKey(x => x.ThresholdId);
            e.Property(x => x.CertTypeId).HasMaxLength(50).IsUnicode(false).IsRequired();
            e.Property(x => x.BranchId).HasMaxLength(10).IsUnicode(false);

            e.HasOne(x => x.CertificateType).WithMany().HasForeignKey(x => x.CertTypeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.UpdatedByUser).WithMany().HasForeignKey(x => x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(x => new { x.CertTypeId, x.BranchId }).IsUnique();
        });

        // Audit
        modelBuilder.Entity<AuditEvent>(e =>
        {
            e.HasKey(x => x.AuditId);
            e.Property(x => x.EventType).HasMaxLength(50).IsUnicode(false).IsRequired();
            e.Property(x => x.ActorRole).HasMaxLength(30).IsUnicode(false);
            e.Property(x => x.EntityType).HasMaxLength(50).IsUnicode(false).IsRequired();
            e.Property(x => x.EntityId).HasMaxLength(120).IsUnicode(true).IsRequired();
        });
        
    }
}


