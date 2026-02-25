# BYOC Platform - Sprint 1 Report
## Foundation Build

**Date:** February 24, 2026
**Sprint Duration:** Sprint 1
**Status:** COMPLETED

---

## Objectives
Build the core foundation of the BYOC cybersecurity platform including authentication, RBAC engine, database schema, and base UI shell.

## Deliverables

### 1. Technology Stack
- **Frontend:** Next.js 16.1.6, React 19, TypeScript 5.9, Tailwind CSS 4.2
- **Backend:** Next.js API Routes (server-side)
- **Database:** SQLite (dev) via Prisma ORM 6.19 (production: PostgreSQL)
- **Auth:** JWT-based cookie authentication
- **Build Tool:** Turbopack

### 2. Database Schema (18 tables)
| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant organizations |
| `users` | User accounts with SSO support |
| `roles` | Role definitions (built-in + custom) |
| `permissions` | 102 granular permissions |
| `role_permissions` | RBAC permission mapping |
| `user_roles` | User-to-role assignments |
| `api_keys` | Machine-to-machine auth |
| `audit_log` | Immutable audit trail |
| `invitations` | User invitation flow |
| `asset_groups` | Asset grouping/scoping |
| `assets` | IT asset inventory |
| `scans` | Security scan jobs |
| `scan_results` | Vulnerability findings |
| `compliance_frameworks` | GDPR, PCI DSS, HIPAA |
| `compliance_controls` | Framework-specific controls |
| `compliance_assessments` | Assessment records |
| `siem_events` / `siem_alerts` / `siem_rules` | SIEM module |
| `ai_actions` | AI-driven security actions |
| `reports` | Generated reports |

### 3. RBAC Engine
- Hierarchical role model (RBAC1) with role inheritance
- 6 built-in roles: Super Admin, Org Admin, Security Analyst, Auditor, Viewer, API Service
- 102 permissions across 9 modules (Dashboard, Scans, Assets, Risk, Reports, AI, SIEM, Settings, System)
- In-memory permission caching (5-minute TTL)
- ABAC scoping support for enterprise asset group restrictions
- Deny-by-default with explicit deny override

### 4. Authentication
- Email + password login with bcrypt hashing (12 rounds)
- JWT access tokens (15-min TTL) + refresh tokens (7 days)
- HTTP-only secure cookies
- Session middleware with automatic redirect to login

### 5. Compliance Module
- **GDPR** (2016/679): 10 controls across 6 categories
- **PCI DSS** (v4.0): 12 requirements across 8 categories
- **HIPAA** (2013): 11 controls across 3 safeguard types
- Compliance scoring with weighted calculation
- Control status tracking: Compliant, Partially Compliant, Non-Compliant, Not Assessed

### 6. UI Pages (14 pages, 26 routes)
| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Auth page with dark cybersecurity theme |
| Dashboard | `/` | Security overview with 6 stat cards, vulnerability chart, compliance summary |
| Scans | `/scans` | Scan management with history and stats |
| Assets | `/assets` | IT asset inventory with filtering |
| Risk Scoring | `/risk-scoring` | Risk score gauge and breakdown |
| Compliance | `/compliance` | GDPR/PCI DSS/HIPAA controls with drill-down |
| Reports | `/reports` | Report generation templates |
| AI Actions | `/ai-actions` | AI action approval queue |
| SIEM | `/siem` | Security events and alerts |
| Settings: Users | `/settings/users` | User management table |
| Settings: Roles | `/settings/roles` | Role viewer (built-in + custom) |
| Settings: Audit Log | `/settings/audit-log` | Filterable audit trail |

### 7. API Endpoints (14 routes)
- `POST /api/auth/login` - Authentication
- `POST /api/auth/logout` - Session termination
- `GET /api/auth/me` - Current user + permissions
- `GET /api/dashboard` - Dashboard aggregated stats
- `GET /api/scans` - Scan listing
- `GET /api/assets` - Asset inventory
- `GET /api/compliance` - Compliance frameworks + controls
- `GET /api/siem` - SIEM events + alerts
- `GET /api/ai-actions` - AI action queue
- `GET /api/users` - User listing
- `GET /api/roles` - Role listing
- `GET /api/audit-log` - Audit log entries

## Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@acme.co | Admin123! |
| Security Analyst | priya@acme.co | Admin123! |
| Auditor | amit@acme.co | Admin123! |

## Build Status
- TypeScript compilation: PASS (0 errors)
- Next.js production build: PASS (26/26 routes)
- Database migration: PASS
- Seed script: PASS (102 permissions, 3 compliance frameworks, 33 controls)

## Next Sprint (Sprint 2)
- Interactive user invite flow
- Role creation/editing with permission matrix
- CRUD operations for all management pages
- Real-time form validation
