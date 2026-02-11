using Zinara.Domain;

namespace Zinara.Domain.Entities;

public class AppUser
{
    public Guid UserId { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public string? DisplayName { get; set; }
    public UserRole Role { get; set; }
    public string? BranchId { get; set; }            // required for BRANCH_USER
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
}

namespace Zinara.Domain.Entities;

public class AuditEvent
{
    public Guid AuditId { get; set; } = Guid.NewGuid();
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;

    public string EventType { get; set; } = default!;
    public Guid? ActorUserId { get; set; }
    public string? ActorRole { get; set; }

    public string EntityType { get; set; } = default!;
    public string EntityId { get; set; } = default!;
    public string? PayloadJson { get; set; }
}

namespace Zinara.Domain.Entities;

public class Branch
{
    public string BranchId { get; set; } = default!;      // e.g. "BR001"
    public string BranchName { get; set; } = default!;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<AppUser> Users { get; set; } = new List<AppUser>();
}

using Zinara.Domain;

namespace Zinara.Domain.Entities;

public class Certificate
{
    public Guid CertificateId { get; set; } = Guid.NewGuid();
    public string CertificateNumber { get; set; } = default!;
    public string CertTypeId { get; set; } = default!;
    public CertificateStatus Status { get; set; }
    public OwnerType CurrentOwnerType { get; set; } = OwnerType.HQ;
    public string? CurrentOwnerBranchId { get; set; }

    public DateTime CapturedAtUtc { get; set; }
    public Guid CapturedByUserId { get; set; }
    public DateTime LastMovementAtUtc { get; set; }

    // Issue fields
    public DateTime? IssuedAtUtc { get; set; }
    public string? IssuedBranchId { get; set; }
    public Guid? IssuedByUserId { get; set; }
    public string? IssuedToClientName { get; set; }
    public string? IssuedToIssuerName { get; set; }      // issuer optional
    public string? IssuedPolicyNumber { get; set; }      // policy optional

    // Navigation
    public CertificateType? CertificateType { get; set; }
    public Branch? CurrentOwnerBranch { get; set; }
    public AppUser? CapturedByUser { get; set; }
    public AppUser? IssuedByUser { get; set; }
    public Branch? IssuedBranch { get; set; }

    public ICollection<TransferItem> TransferItems { get; set; } = new List<TransferItem>();
    public ICollection<ReturnItem> ReturnItems { get; set; } = new List<ReturnItem>();
}

namespace Zinara.Domain.Entities;

public class CertificateType
{
    public string CertTypeId { get; set; } = default!;    // e.g. "ZINARA_LICENSE"
    public string Name { get; set; } = default!;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

using Zinara.Domain;

namespace Zinara.Domain.Entities;

public class Return
{
    public Guid ReturnId { get; set; } = Guid.NewGuid();
    public string ManifestNo { get; set; } = default!;
    public string FromBranchId { get; set; } = default!;
    public string CertTypeId { get; set; } = default!;
    public int Quantity { get; set; }
    public ManifestStatus Status { get; set; } = ManifestStatus.CREATED;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid CreatedByUserId { get; set; }

    public DateTime? SentAtUtc { get; set; }
    public Guid? SentByUserId { get; set; }

    public DateTime? AcceptedAtUtc { get; set; }
    public Guid? AcceptedByUserId { get; set; }

    // Navigation
    public Branch? FromBranch { get; set; }
    public CertificateType? CertificateType { get; set; }
    public AppUser? CreatedByUser { get; set; }
    public AppUser? SentByUser { get; set; }
    public AppUser? AcceptedByUser { get; set; }

    public ICollection<ReturnItem> Items { get; set; } = new List<ReturnItem>();
}

namespace Zinara.Domain.Entities;

public class ReturnItem
{
    public long ReturnItemId { get; set; }                // identity
    public Guid ReturnId { get; set; }
    public Guid CertificateId { get; set; }

    // Navigation
    public Return? Return { get; set; }
    public Certificate? Certificate { get; set; }
}

namespace Zinara.Domain.Entities;

public class Session
{
    public Guid SessionId { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public string TokenHash { get; set; } = null!; // store SHA256(token) not raw token
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }

    public bool IsRevoked { get; set; } = false;
    public DateTime? RevokedAtUtc { get; set; }
}

using Zinara.Domain;

namespace Zinara.Domain.Entities;

public class StockRequest
{
    public Guid RequestId { get; set; } = Guid.NewGuid();
    public string BranchId { get; set; } = default!;
    public string CertTypeId { get; set; } = default!;
    public int Quantity { get; set; }
    public string? Reason { get; set; }
    public RequestStatus Status { get; set; } = RequestStatus.OPEN;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid CreatedByUserId { get; set; }

    public DateTime? ClosedAtUtc { get; set; }
    public Guid? ClosedByUserId { get; set; }

    // Navigation
    public Branch? Branch { get; set; }
    public CertificateType? CertificateType { get; set; }
    public AppUser? CreatedByUser { get; set; }
    public AppUser? ClosedByUser { get; set; }
}

namespace Zinara.Domain.Entities;

public class Threshold
{
    public Guid ThresholdId { get; set; } = Guid.NewGuid();
    public string CertTypeId { get; set; } = default!;
    public string? BranchId { get; set; }                 // null = default
    public int MinLevel { get; set; }

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid UpdatedByUserId { get; set; }

    // Navigation
    public CertificateType? CertificateType { get; set; }
    public Branch? Branch { get; set; }
    public AppUser? UpdatedByUser { get; set; }
}

using Zinara.Domain;

namespace Zinara.Domain.Entities;

public class Transfer
{
    public Guid TransferId { get; set; } = Guid.NewGuid();
    public string ManifestNo { get; set; } = default!;
    public string ToBranchId { get; set; } = default!;
    public string CertTypeId { get; set; } = default!;
    public int Quantity { get; set; }
    public ManifestStatus Status { get; set; } = ManifestStatus.CREATED;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid CreatedByUserId { get; set; }

    public DateTime? SentAtUtc { get; set; }
    public Guid? SentByUserId { get; set; }

    public DateTime? AcceptedAtUtc { get; set; }
    public Guid? AcceptedByUserId { get; set; }

    // Navigation
    public Branch? ToBranch { get; set; }
    public CertificateType? CertificateType { get; set; }
    public AppUser? CreatedByUser { get; set; }
    public AppUser? SentByUser { get; set; }
    public AppUser? AcceptedByUser { get; set; }

    public ICollection<TransferItem> Items { get; set; } = new List<TransferItem>();
}

namespace Zinara.Domain.Entities;

public class TransferItem
{
    public long TransferItemId { get; set; }              // identity
    public Guid TransferId { get; set; }
    public Guid CertificateId { get; set; }

    // Navigation
    public Transfer? Transfer { get; set; }
    public Certificate? Certificate { get; set; }
}









