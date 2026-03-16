---
name: pii-redaction
description: >
  PII, PHI, and sensitive data detection, redaction, and compliance patterns for BYOC.
  Covers GDPR personal data, HIPAA protected health information, PCI-DSS cardholder data,
  SSN/passport/biometric data, and enterprise identity data. Use when implementing data
  masking, audit log sanitization, report redaction, or any feature that processes personal data.
origin: BYOC-custom
---

# PII / PHI / Sensitive Data Redaction Skill

This skill governs how BYOC handles all categories of personal, health, financial, and identity data — both in-system (logs, DB, API responses) and in transit (reports, exports, SIEM events).

---

## Data Categories

### 1. PII — Personally Identifiable Information (GDPR Art. 4)
| Data Type | Examples | Risk Level | Redaction Pattern |
|-----------|---------|------------|------------------|
| Full name | "John Smith" | Medium | `J*** S****` |
| Email address | john@company.com | High | `j***@c******.com` |
| Phone number | +1-555-123-4567 | High | `+1-***-***-4567` |
| IP address | 192.168.1.100 | Medium | `192.168.*.*` |
| Physical address | 123 Main St, NY | High | `123 **** St, **` |
| Date of birth | 1985-04-15 | High | `****-**-15` |
| National ID / SSN | 123-45-6789 | CRITICAL | `***-**-6789` |
| Passport number | A12345678 | CRITICAL | `A*******8` |
| Driver's license | D1234567 | CRITICAL | `D*****67` |
| Biometric data | fingerprint_hash | CRITICAL | `[REDACTED-BIOMETRIC]` |
| Location data | lat/lng coordinates | Medium | `[REDACTED-LOCATION]` |
| Cookie/session IDs | sess_abc123 | Medium | `sess_***` |
| Device fingerprint | ua_hash_abc | Low | `[DEVICE-ID]` |

### 2. PHI — Protected Health Information (HIPAA 18 Identifiers)
| Identifier | Examples | Redaction |
|-----------|---------|----------|
| Patient name | "Mary Johnson" | `M*** J*****` |
| Geographic data < state | ZIP 90210 | `902**` |
| All dates except year | 03/15/1985 | `03/***/****` |
| Phone numbers | 555-123-4567 | `***-***-4567` |
| Fax numbers | 555-987-6543 | `[FAX-REDACTED]` |
| Email addresses | patient@email.com | `[EMAIL-REDACTED]` |
| SSNs | 123-45-6789 | `[SSN-REDACTED]` |
| Medical record numbers | MRN-12345 | `MRN-*****` |
| Health plan beneficiary numbers | HP-98765 | `HP-*****` |
| Account numbers | ACC-54321 | `ACC-*****` |
| Certificate/license numbers | LIC-11111 | `[LIC-REDACTED]` |
| Vehicle identifiers | VIN-ABC123 | `[VIN-REDACTED]` |
| Device identifiers/serial numbers | SN-XYZ789 | `[DEVICE-REDACTED]` |
| Web URLs with PHI | /patient/john-doe | `/patient/[REDACTED]` |
| IP addresses (PHI context) | 10.0.0.1 | `[IP-REDACTED]` |
| Biometric identifiers | finger_print_123 | `[BIOMETRIC-REDACTED]` |
| Full-face photos | image/jpeg | `[IMAGE-REDACTED]` |
| Any unique identifying number | UUID tied to patient | `[ID-REDACTED]` |

### 3. PCI-DSS — Payment Card Data (PCI DSS v4.0)
| Data | Redaction Rule | Storage Rule |
|------|---------------|-------------|
| Primary Account Number (PAN) | Last 4 digits only: `****-****-****-1234` | Never store full PAN without encryption |
| CVV/CVC/CID | Never store: `[CVV-NEVER-STORED]` | Must be wiped after auth |
| Expiry date | `**/**` | Never store without encryption |
| Cardholder name | `J*** D**` | Never store without encryption |
| PIN/PIN block | `[PIN-NEVER-STORED]` | Never store |
| Magnetic stripe data | `[TRACK-NEVER-STORED]` | Never store |

### 4. Enterprise Identity Data
| Data | Examples | Handling |
|------|---------|---------|
| TOTP secrets | base32_secret_abc | AES-256-GCM encrypted, never in logs |
| MFA backup codes | code_12345678 | bcrypt hashed, never plaintext |
| API keys | sk_live_abc123 | bcrypt hashed, show once, never log |
| OAuth tokens | access_token_xyz | Encrypted at rest, short-lived |
| JWT payloads | {sub, email, ...} | Never log full JWT |
| Passwords | plaintext_pass | bcrypt (12 rounds), never log |
| Session tokens | sess_token_abc | HTTP-only cookies, never in URLs |
| SCIM tokens | scim_token_xyz | bcrypt hashed |

---

## Implementation Patterns

### Server-Side Redaction (TypeScript / Next.js)

```typescript
// src/lib/redaction.ts

export type DataCategory = 'pii' | 'phi' | 'pci' | 'identity' | 'none'
export type RedactionLevel = 'full' | 'partial' | 'hash' | 'mask'

interface RedactionRule {
  pattern: RegExp
  category: DataCategory
  level: RedactionLevel
  replacement: string | ((match: string) => string)
}

// PII patterns
const PII_PATTERNS: RedactionRule[] = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    category: 'pii',
    level: 'partial',
    replacement: (email) => {
      const [user, domain] = email.split('@')
      return `${user[0]}***@${domain[0]}***.${email.split('.').pop()}`
    }
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN
    category: 'pii',
    level: 'partial',
    replacement: (ssn) => `***-**-${ssn.slice(-4)}`
  },
  {
    pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,  // Credit card
    category: 'pci',
    level: 'partial',
    replacement: (pan) => `****-****-****-${pan.replace(/\D/g, '').slice(-4)}`
  },
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,  // Phone
    category: 'pii',
    level: 'partial',
    replacement: '***-***-XXXX'
  },
  {
    // TOTP/JWT/API key patterns — full redaction
    pattern: /\b(sk_(?:live|test)_[A-Za-z0-9]+|eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)\b/g,
    category: 'identity',
    level: 'full',
    replacement: '[CREDENTIAL-REDACTED]'
  }
]

// Redact text for audit logs (never log raw PII)
export function redactForAuditLog(text: string): string {
  let redacted = text
  for (const rule of PII_PATTERNS) {
    redacted = redacted.replace(rule.pattern, (match) => {
      if (typeof rule.replacement === 'function') {
        return rule.replacement(match)
      }
      return rule.replacement
    })
  }
  return redacted
}

// Redact API response fields (for non-privileged roles)
export function redactResponseFields<T extends Record<string, unknown>>(
  data: T,
  fieldsToRedact: string[]
): T {
  const redacted = { ...data }
  for (const field of fieldsToRedact) {
    if (field in redacted) {
      const value = redacted[field]
      if (typeof value === 'string') {
        redacted[field] = '[REDACTED]' as T[keyof T]
      }
    }
  }
  return redacted
}

// Never include these fields in any API response
export const NEVER_EXPOSE_FIELDS = [
  'passwordHash',
  'mfaSecret',
  'mfaBackupCodes',
  'scimToken',
  'apiKeyHash',
  'encryptedData',
] as const

// Remove sensitive fields from Prisma results before sending to client
export function sanitizeForResponse<T extends Record<string, unknown>>(obj: T): Omit<T, typeof NEVER_EXPOSE_FIELDS[number]> {
  const sanitized = { ...obj }
  for (const field of NEVER_EXPOSE_FIELDS) {
    delete sanitized[field]
  }
  return sanitized as Omit<T, typeof NEVER_EXPOSE_FIELDS[number]>
}
```

### HIPAA-Compliant Audit Logging

```typescript
// When logging SIEM events or audit entries that may contain PHI
import { redactForAuditLog } from '@/lib/redaction'

await createAuditLog({
  tenantId,
  userId,
  action: 'siem.event.ingested',
  resource: 'SiemEvent',
  resourceId: event.id,
  severity: 'info',
  category: 'data',
  details: {
    // NEVER put raw PII/PHI in audit log details
    eventType: event.type,
    source: event.source,
    // Redact any string values that might contain PII
    message: redactForAuditLog(event.message ?? ''),
    userId: event.userId ? '[USER-REF]' : null  // reference only, not name/email
  }
})
```

### Prisma Select — Never Over-Fetch PHI

```typescript
// Define safe select sets for different contexts
export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  department: true,
  createdAt: true,
  // NEVER include: passwordHash, mfaSecret, mfaBackupCodes, failedLoginAttempts
} as const

export const USER_ADMIN_SELECT = {
  ...USER_PUBLIC_SELECT,
  lastLoginAt: true,
  lastLoginIp: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  // Still NEVER include: passwordHash, mfaSecret, mfaBackupCodes
} as const

// Usage
const user = await prisma.user.findUnique({
  where: { id, tenantId },
  select: USER_PUBLIC_SELECT  // Safe for any role
})
```

### Report Export Redaction

```typescript
// When generating compliance or vulnerability reports
// Different roles see different levels of detail
export function redactReportForRole(
  data: Record<string, unknown>[],
  userRole: string
): Record<string, unknown>[] {
  const isViewer = userRole === 'viewer' || userRole === 'auditor'

  return data.map(row => ({
    ...row,
    // Viewers/Auditors never see raw IPs or user details
    ipAddress: isViewer ? '[IP-REDACTED]' : row.ipAddress,
    userEmail: isViewer ? '[EMAIL-REDACTED]' : row.userEmail,
    // All roles: never show credentials
    apiKey: '[API-KEY-REDACTED]',
    sessionToken: '[SESSION-REDACTED]',
  }))
}
```

---

## SIEM Event Ingestion — PII Protection

When ingesting SIEM events via `POST /api/siem/events`, apply redaction pipeline:

```typescript
// In src/app/api/siem/events/route.ts
import { redactForAuditLog } from '@/lib/redaction'

// Before storing: strip PII from event message/details
const sanitizedEvent = {
  ...event,
  message: redactForAuditLog(event.message),
  details: Object.fromEntries(
    Object.entries(event.details ?? {}).map(([k, v]) => [
      k,
      typeof v === 'string' ? redactForAuditLog(v) : v
    ])
  )
}
```

---

## Compliance Mapping

| Feature | GDPR | HIPAA | PCI-DSS | CCPA |
|---------|------|-------|---------|------|
| Audit log redaction | Art. 5(1)(f) | §164.312(b) | Req. 10 | Cal. Civ. §1798.150 |
| Right to erasure | Art. 17 | N/A | N/A | §1798.105 |
| Data minimization | Art. 5(1)(c) | §164.502(b) | Req. 3 | §1798.100 |
| Access controls | Art. 25 | §164.312(a)(1) | Req. 7 | §1798.150 |
| Breach notification | Art. 33 | §164.400 | Req. 12 | §1798.150 |
| Encryption at rest | Art. 32 | §164.312(a)(2)(iv) | Req. 3.5 | §1798.150 |
| Export/portability | Art. 20 | N/A | N/A | §1798.100 |

---

## Data Retention Rules (Platform-Level)

| Data Type | Retention Period | Deletion Method |
|-----------|----------------|-----------------|
| Audit logs | 7 years (financial), 3 years (general) | Soft delete → scheduled hard delete |
| SIEM events | 90 days hot, 1 year cold archive | Archive to S3, delete from DB |
| Session records | 90 days after expiry | Scheduled cleanup |
| Scan results | Until manually deleted or 2 years | Soft delete |
| User activity | Life of account + 90 days | Cascade on user deletion |
| Failed login attempts | 90 days | Scheduled cleanup |
| API key usage logs | 1 year | Scheduled cleanup |

---

## When to Use This Skill

1. Implementing any feature that processes user emails, names, or IDs
2. Building SIEM event ingestion (may contain raw log data with PII)
3. Creating report export functionality
4. Designing audit log schema
5. Building compliance reporting (GDPR, HIPAA, PCI-DSS articles)
6. Implementing data subject access requests (DSAR) / right to erasure
7. Adding data retention and scheduled deletion jobs
8. Building healthcare client integrations

---

## Testing PII Redaction

```typescript
// tests/lib/redaction.spec.ts
import { redactForAuditLog } from '@/lib/redaction'

describe('PII Redaction', () => {
  test('redacts email addresses', () => {
    const result = redactForAuditLog('User john@example.com logged in')
    expect(result).not.toContain('john@example.com')
    expect(result).toContain('@')  // partial still shows domain hint
  })

  test('redacts SSN', () => {
    const result = redactForAuditLog('SSN: 123-45-6789 verified')
    expect(result).not.toContain('123-45-6789')
    expect(result).toContain('6789')  // last 4 preserved
  })

  test('redacts credit card numbers', () => {
    const result = redactForAuditLog('Card 4111-1111-1111-1111 charged')
    expect(result).not.toContain('4111-1111-1111-1111')
    expect(result).toContain('1111')  // last 4 preserved
  })

  test('fully redacts API keys and JWTs', () => {
    const result = redactForAuditLog('API key: sk_live_abc123xyz used')
    expect(result).not.toContain('sk_live_abc123xyz')
    expect(result).toContain('[CREDENTIAL-REDACTED]')
  })

  test('never exposes mfaSecret in user objects', () => {
    const user = { id: '123', email: 'test@test.com', mfaSecret: 'TOTP_SECRET' }
    const sanitized = sanitizeForResponse(user)
    expect(sanitized).not.toHaveProperty('mfaSecret')
  })
})
```
