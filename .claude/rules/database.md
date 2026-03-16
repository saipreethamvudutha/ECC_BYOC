---
paths:
  - "prisma/**"
  - "src/app/api/**"
  - "src/lib/**"
---
# Database Rules for BYOC (PostgreSQL + Prisma)

## CRITICAL: Tenant Isolation

Every single database query MUST include `tenantId`. This is non-negotiable for a multi-tenant security platform.

```typescript
// CORRECT
await prisma.asset.findMany({ where: { tenantId: user.tenantId } })

// SECURITY VIOLATION — never do this
await prisma.asset.findMany()
await prisma.asset.findMany({ where: { status: 'active' } })
```

## Prisma Best Practices

### Use Select to Avoid Over-fetching

```typescript
// GOOD: Only fetch what you need
const user = await prisma.user.findUnique({
  where: { id, tenantId },
  select: { id: true, email: true, name: true, status: true }
})

// BAD: Fetches all fields including passwordHash, mfaSecret
const user = await prisma.user.findUnique({ where: { id } })
```

### Pagination (Always Required for Lists)

```typescript
// GOOD: Paginated query
const { page = 1, limit = 50 } = params
const [data, total] = await Promise.all([
  prisma.asset.findMany({
    where: { tenantId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' }
  }),
  prisma.asset.count({ where: { tenantId } })
])
return { data, total, page, limit }

// BAD: Unbounded query (can return thousands of rows)
const data = await prisma.asset.findMany({ where: { tenantId } })
```

### Transactions for Multi-Step Operations

```typescript
// When creating related records, use transactions
await prisma.$transaction(async (tx) => {
  const role = await tx.role.create({ data: { tenantId, name } })
  await tx.roleCapability.createMany({
    data: capabilities.map(cap => ({ roleId: role.id, capabilityId: cap.id }))
  })
  return role
})
```

### Avoid N+1 Queries

```typescript
// GOOD: Include related data in one query
const scans = await prisma.scan.findMany({
  where: { tenantId },
  include: { results: { select: { severity: true } } }
})

// BAD: N+1 pattern — one query per scan
for (const scan of scans) {
  scan.results = await prisma.scanResult.findMany({ where: { scanId: scan.id } })
}
```

## Schema Change Guidelines

When modifying `prisma/schema.prisma`:
1. All new models MUST have `tenantId String` with Tenant relation
2. All new models MUST have `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
3. Run `npm run db:push` to apply changes in dev
4. Never rename existing fields in production without migration
5. Add new models to the Tenant model's relation list

## Sensitive Data Handling

- `passwordHash` — never return in API responses; always `select` to exclude
- `mfaSecret` — encrypted with AES-256-GCM, never return raw
- `mfaBackupCodes` — stored as bcrypt-hashed JSON array
- API key values — only shown once at creation; stored as bcrypt hash

## Performance Rules

- Always add indexes on foreign keys (Prisma does this automatically)
- For SIEM event tables, add composite index on `(tenantId, createdAt)` for time-series queries
- For audit log, always query with `tenantId` + time range + pagination
- Use `count()` queries separately for pagination totals (parallel with data query)
