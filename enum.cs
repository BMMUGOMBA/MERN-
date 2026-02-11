namespace Zinara.Domain;

public enum UserRole
{
    HQ_ADMIN = 1,
    BRANCH_USER = 2
}

public enum OwnerType
{
    HQ = 1,
    BRANCH = 2
}

public enum CertificateStatus
{
    HQ_STOCK = 1,
    IN_TRANSIT_TO_BRANCH = 2,
    BRANCH_STOCK = 3,
    ISSUED = 4,
    IN_TRANSIT_TO_HQ = 5
}

public enum ManifestStatus
{
    CREATED = 1,
    SENT = 2,
    ACCEPTED = 3,
    CANCELLED = 4
}

public enum RequestStatus
{
    OPEN = 1,
    FULFILLED = 2,
    DECLINED = 3,
    CLOSED = 4
}
