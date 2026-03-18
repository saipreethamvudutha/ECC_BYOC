# BYOC Vulnerability Scanner — Complete Technical Reference
## End-to-End Architecture, Code, Data Flow & Deployment Guide

> **Document Classification:** Client Technical Reference
> **Prepared by:** Engineering Team — Furix AI
> **Product:** BYOC (Bring Your Own Cloud) — Enterprise Cybersecurity SaaS
> **Version:** 1.0
> **Date:** 2026-03-17
> **Live URL:** https://byoc-rosy.vercel.app
> **Source Code:** https://github.com/saipreethamvudutha/ECC_BYOC

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack — What We Used and Why](#2-technology-stack--what-we-used-and-why)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Scanner Engine Design](#4-scanner-engine-design)
5. [Check Modules — What Gets Scanned](#5-check-modules--what-gets-scanned)
6. [Authenticated Scanning — SSH & WinRM](#6-authenticated-scanning--ssh--winrm)
7. [CIS v8.1 Benchmark Compliance](#7-cis-v81-benchmark-compliance)
8. [Credential Vault — Secrets Management](#8-credential-vault--secrets-management)
9. [Delta Diff Engine — Tracking Change Over Time](#9-delta-diff-engine--tracking-change-over-time)
10. [Data Flow — Cradle to Grave](#10-data-flow--cradle-to-grave)
11. [Backend API — Every Endpoint Explained](#11-backend-api--every-endpoint-explained)
12. [Frontend Flow — What the User Sees](#12-frontend-flow--what-the-user-sees)
13. [Database Design — Every Table Explained](#13-database-design--every-table-explained)
14. [Security Architecture](#14-security-architecture)
15. [SIEM & SOAR Integration](#15-siem--soar-integration)
16. [Where the Code Lives](#16-where-the-code-lives)
17. [Deployment Guide](#17-deployment-guide)
18. [Is the Scanner Up to Date?](#18-is-the-scanner-up-to-date)
19. [Metrics & Capabilities Summary](#19-metrics--capabilities-summary)
20. [Glossary — Technical Terms Explained](#20-glossary--technical-terms-explained)

---

## 1. Executive Summary

BYOC's vulnerability scanner is an **enterprise-grade, multi-mode security assessment engine** built entirely in TypeScript/Node.js. It does not rely on any third-party commercial scanning vendors — every piece of it is purpose-built.

### What it does

At a high level, you point the scanner at an IP address or hostname. It then:

1. **Enumerates** open ports and services running on that host
2. **Identifies** operating system, software versions, and patch levels
3. **Checks** for known vulnerabilities (CVEs), misconfigurations, and compliance gaps
4. **Logs into the target** (with SSH or WinRM credentials) to check things only visible from inside
5. **Maps findings** to industry standards (CIS v8.1, CVSS scores, CVE IDs)
6. **Stores everything** in a structured database with full audit trail
7. **Compares** results to previous scans to show what changed
8. **Feeds findings** into the SIEM (Security Information & Event Management) module for alerting
9. **Triggers** SOAR playbooks for automated response

### How it's different from commercial scanners

| Feature | Commercial Scanner (e.g., Nessus) | BYOC Scanner |
|---------|----------------------------------|--------------|
| License cost | $5,000–$50,000/year | Included |
| Multi-tenant | Separate installations | Native — one instance serves all customers |
| Data leaves your cloud | Yes | Never — all data stays in your PostgreSQL |
| Custom scan modules | No | Yes — add new CheckModules in TypeScript |
| SIEM integration | Separate product | Native — same platform |
| Audit trail | Limited | Full — every check, every batch, every mutation |
| CIS Benchmark | Paid add-on | Built-in |

---

## 2. Technology Stack — What We Used and Why

### Core Runtime

| Technology | Version | Role | Why We Chose It |
|-----------|---------|------|----------------|
| **TypeScript** | 5.9 | Language for all code | Strict types catch bugs before runtime; full IDE support |
| **Node.js** | 22.x | JavaScript runtime | Non-blocking I/O — ideal for concurrent network scanning |
| **Next.js** | 16 | Full-stack framework | One codebase for both API (backend) and UI (frontend); server-side rendering |
| **React** | 19 | UI component library | Reactive data — UI updates automatically when scan status changes |

### Database & ORM

| Technology | Version | Role | Why We Chose It |
|-----------|---------|------|----------------|
| **PostgreSQL** | 15 | Relational database | ACID transactions — scan results never get corrupted mid-write |
| **Prisma** | 6 | Database ORM (Object-Relational Mapper) | Auto-generates TypeScript types from schema; prevents SQL injection |
| **Railway** | — | PostgreSQL hosting | Managed PostgreSQL with automatic backups |

> **What is an ORM?** Instead of writing raw SQL like `SELECT * FROM scans WHERE tenantId = 'abc'`, we write `prisma.scan.findMany({ where: { tenantId: 'abc' } })`. The ORM translates this to SQL automatically and provides full TypeScript type safety.

### Security Libraries

| Library | Role |
|---------|------|
| **crypto** (Node.js built-in) | AES-256-GCM encryption for credential vault; SHA-256 for finding fingerprints |
| **bcrypt** | Password hashing (bcryptjs) |
| **jose** | JWT (JSON Web Token) creation and verification |
| **ssh2** | SSH protocol client for authenticated Linux scanning |
| **zod** | Runtime input validation on all API endpoints |

### Infrastructure

| Technology | Role |
|-----------|------|
| **Vercel** | Cloud hosting, automatic deployments from GitHub, serverless API execution |
| **Nmap** | External network scanning tool (optional; scanner degrades gracefully without it) |
| **Resend** | Transactional email |
| **Tailwind CSS 4** | Utility-first CSS framework |
| **Radix UI** | Accessible UI component library |

---

## 3. High-Level Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BYOC PLATFORM                                │
│                                                                     │
│  ┌───────────────┐          ┌──────────────────────────────────┐   │
│  │   BROWSER UI  │◄────────►│         NEXT.JS APP              │   │
│  │  (React 19)   │  HTTPS   │    (Vercel Serverless)           │   │
│  └───────────────┘          │                                  │   │
│                             │  ┌────────────────────────────┐  │   │
│                             │  │      API ROUTES (117)      │  │   │
│                             │  │   /api/scans/*             │  │   │
│                             │  │   /api/credentials/*       │  │   │
│                             │  └────────────┬───────────────┘  │   │
│                             │               │                  │   │
│                             │  ┌────────────▼───────────────┐  │   │
│                             │  │    SCANNER ENGINE          │  │   │
│                             │  │  src/lib/scanner/index.ts  │  │   │
│                             │  │                            │  │   │
│                             │  │  ┌──────────┐ ┌────────┐  │  │   │
│                             │  │  │ BUILTIN  │ │  NMAP  │  │  │   │
│                             │  │  │ ADAPTER  │ │ADAPTER │  │  │   │
│                             │  │  └────┬─────┘ └───┬────┘  │  │   │
│                             │  │       │            │       │  │   │
│                             │  │  ┌────▼────────────▼────┐  │  │   │
│                             │  │  │   CHECK MODULES      │  │  │   │
│                             │  │  │  25+ modules         │  │  │   │
│                             │  │  │  (HTTP/SSH/WinRM/CIS) │  │  │   │
│                             │  │  └─────────┬────────────┘  │  │   │
│                             │  └────────────┼───────────────┘  │   │
│                             │               │                  │   │
│                             │  ┌────────────▼───────────────┐  │   │
│                             │  │     POSTGRESQL DATABASE    │  │   │
│                             │  │     (Railway hosted)       │  │   │
│                             │  │  30 tables, tenantId on   │  │   │
│                             │  │  every single row          │  │   │
│                             │  └────────────────────────────┘  │   │
│                             └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │         TARGET HOSTS             │
               │                                 │
               │  ┌─────────┐   ┌─────────────┐  │
               │  │ LINUX   │   │   WINDOWS   │  │
               │  │ SERVER  │   │   SERVER    │  │
               │  │ (SSH)   │   │  (WinRM)    │  │
               │  └─────────┘   └─────────────┘  │
               └─────────────────────────────────┘
```

### Multi-Tenant Architecture

BYOC serves multiple organizations ("tenants") from a single deployment:

```
┌────────────────────────────────────────────────────────┐
│                 ONE BYOC INSTALLATION                  │
│                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  ACME Corp  │  │  Globex Inc │  │  Initech    │   │
│  │ tenantId=A  │  │ tenantId=B  │  │ tenantId=C  │   │
│  │             │  │             │  │             │   │
│  │ Own scans   │  │ Own scans   │  │ Own scans   │   │
│  │ Own assets  │  │ Own assets  │  │ Own assets  │   │
│  │ Own users   │  │ Own users   │  │ Own users   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                        │
│  SHARED: Same database, same code, separate data       │
│  EVERY DB query includes WHERE tenantId = 'X'          │
└────────────────────────────────────────────────────────┘
```

> **Why multi-tenant?** One deployment serves unlimited customers. Adding a new customer takes seconds (create a tenant record). No new servers, no new databases.

---

## 4. Scanner Engine Design

### The Core Engine File

**Location:** `src/lib/scanner/index.ts` (627 lines)

This is the heart of the scanner. Every scan flows through this file. Here's what it does:

### The Problem: Vercel's 10-Second Limit

Vercel (our hosting platform) kills any serverless function that runs longer than 10 seconds. A full vulnerability scan can take minutes. We solved this with **chunked batch execution**:

```
Instead of running the entire scan in one API call (which would time out):

  APPROACH 1 (won't work):
  POST /api/scans/create → run all 12 checks → timeout after 10s ✗

  APPROACH 2 (what we built):
  POST /api/scans/create → create scan record in DB → return immediately ✓
  POST /api/scans/123/execute → run 2 checks → save progress → return in <7s ✓
  POST /api/scans/123/execute → run next 2 checks → save progress → return ✓
  ... repeat until all checks complete ...
  POST /api/scans/123/execute → complete scan, run post-scan hooks → return ✓
```

### How Scan Progress Is Stored

We store scan progress as a JSON object inside the `scans.progress` column:

```json
{
  "completedChecks": ["http-headers", "ssl-tls", "port-scan"],
  "currentBatch": 2,
  "totalBatches": 6,
  "totalFindings": 14,
  "scanEngine": "builtin",
  "checkResults": {
    "http-headers": 3,
    "ssl-tls": 2,
    "port-scan": 9
  }
}
```

The frontend polls `/api/scans/[id]` every 5 seconds and shows a live progress bar based on `currentBatch / totalBatches`.

### Adapter Selection — Nmap vs Builtin

```
getActiveAdapter():
  ↓
  Check: is Nmap installed on this machine? (runs: nmap --version)
  ↓
  YES → use NmapAdapter (enterprise-grade, slower, more accurate)
  NO  → use BuiltinAdapter (pure Node.js, always available, faster)
  ↓
  Cache this decision for 60 seconds (avoid checking on every request)
```

> **What is Nmap?** Nmap (Network Mapper) is the industry-standard open-source network scanning tool. It can fingerprint operating systems, detect service versions, and run NSE (Nmap Scripting Engine) vulnerability scripts. Our code wraps it so you don't need to know command-line Nmap.

### Engine State Machine

```
SCAN CREATED (status: queued)
       │
       ▼
POST /execute called
       │
       ▼
Status: running
       │
       ▼
Load progress from DB ──── If first batch: initialize progress
       │
       ▼
Determine next checks to run (skip already completed)
       │
       ▼
Run up to 2 checks concurrently
       │
       ▼
Collect findings → compute deduplicationHash → insert to scan_results
       │
       ▼
Upsert AssetVulnerability (cross-scan deduplication)
       │
       ▼
Save updated progress to DB
       │
       ├──── More checks remaining? → return { status: "running" }
       │                               Frontend calls /execute again
       │
       └──── All checks done?
                   │
                   ▼
          Run Post-Scan Hooks:
          1. Create SIEM events
          2. Evaluate detection rules
          3. Trigger SOAR playbooks
          4. Update Asset records
          5. Update vulnerability counts
          6. Map compliance findings
          7. Create AI action suggestions
                   │
                   ▼
          Status: completed
          Return { status: "completed", findings: [] }
```

---

## 5. Check Modules — What Gets Scanned

A **Check Module** is a self-contained piece of code that inspects one aspect of a target host. Every module implements the same interface:

```typescript
interface CheckModule {
  id: string;      // e.g., "http-headers", "ssh-user-accounts"
  name: string;    // e.g., "HTTP Security Headers", "SSH User Accounts"
  run(
    target: string,  // IP address or hostname, e.g., "192.168.1.50"
    config?: ScanConfig  // optional: credentials, port range, etc.
  ): Promise<CheckResult[]>;  // returns array of findings (empty = clean)
}
```

Every module returns zero or more **findings**. A finding looks like this:

```typescript
interface CheckResult {
  title: string;          // "Missing X-Frame-Options Header"
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;    // Plain-English explanation
  remediation: string;    // Exact steps to fix it
  cveId?: string;         // e.g., "CVE-2021-44228" (Log4Shell)
  cvssScore?: number;     // 0.0–10.0 risk score
  details: {              // Structured extra data
    checkModuleId: string;
    detectionMethod: "network" | "authenticated" | "agent";
    cisControlId?: string;  // e.g., "5.2.7"
    cisLevel?: 1 | 2;
    // ... check-specific fields
  };
}
```

### Complete Check Module Inventory (41 Total)

#### Category 1: HTTP/Network Checks (12 modules)
*These run from outside the target — no credentials needed*

| Module ID | File | What It Checks | Key Findings |
|-----------|------|---------------|-------------|
| `http-headers` | checks/http-headers.ts (127 lines) | HTTP response headers | Missing X-Frame-Options, X-Content-Type-Options, CSP, HSTS |
| `ssl-tls` | checks/ssl-tls.ts (221 lines) | SSL/TLS certificate & config | Expired certs, weak ciphers, SSLv3/TLS 1.0 enabled |
| `port-scan` | checks/port-scan.ts (359 lines) | Open TCP/UDP ports | Unexpected open ports, dangerous services |
| `service-detection` | checks/service-detection.ts (375 lines) | Service versions | Outdated software versions with known CVEs |
| `os-fingerprint` | checks/os-fingerprint.ts (414 lines) | Operating system | EOL operating systems, unpatched OS versions |
| `network-discovery` | checks/network-discovery.ts (344 lines) | Network topology | Hidden services, unusual network behavior |
| `cloud-inventory` | checks/cloud-inventory.ts (488 lines) | Cloud resources | Exposed S3 buckets, misconfigured cloud services |
| `cloud-misconfig` | checks/cloud-misconfig.ts (187 lines) | Cloud security posture | Public-facing resources that shouldn't be |
| `exposed-panels` | checks/exposed-panels.ts (115 lines) | Admin/management panels | Exposed phpMyAdmin, Tomcat manager, etc. |
| `info-disclosure` | checks/info-disclosure.ts (228 lines) | Information leakage | Server banners, error messages revealing stack |
| `common-cves` | checks/common-cves.ts (171 lines) | Known CVE checks | Cross-references against vulnerability database |
| `dns-checks` | checks/dns-checks.ts (124 lines) | DNS configuration | Zone transfer enabled, DNS rebinding risks |

#### Category 2: Nmap-Powered Checks (6 modules)
*Used when Nmap is installed — more accurate than builtin equivalents*

| Module ID | File | What It Does Better |
|-----------|------|---------------------|
| `nmap-port-scan` | checks/nmap-port-scan.ts (180 lines) | Stealth SYN scanning, UDP port detection |
| `nmap-service-detection` | checks/nmap-service-detection.ts (201 lines) | Version detection with -sV flag, 99%+ accuracy |
| `nmap-os-fingerprint` | checks/nmap-os-fingerprint.ts (153 lines) | TCP/IP stack fingerprinting via Nmap -O |
| `nmap-network-discovery` | checks/nmap-network-discovery.ts (188 lines) | Subnet mapping, ARP discovery |
| `nmap-vuln-scripts` | checks/nmap-vuln-scripts.ts (121 lines) | Runs Nmap NSE vulnerability scripts |
| `nmap-auth-scan` | checks/nmap-auth-scan.ts (122 lines) | Authentication weakness detection |

#### Category 3: SSH Authenticated Checks (8 modules)
*Log into Linux targets via SSH — see what's visible from inside*

| Module ID | File | What It Checks |
|-----------|------|---------------|
| `ssh-os-info` | connectors/ssh.ts:29 | OS version, kernel, distribution |
| `ssh-user-accounts` | connectors/ssh.ts:70 | All user accounts, UID 0 accounts, UID >= 1000 |
| `ssh-sudo-config` | connectors/ssh.ts:128 | NOPASSWD sudo rules (privilege escalation risk) |
| `ssh-listening-services` | connectors/ssh.ts:168 | ALL listening services (including localhost-only) |
| `ssh-installed-packages` | connectors/ssh.ts:203 | Every installed package (200+ checked for CVEs) |
| `ssh-file-permissions` | connectors/ssh.ts:244 | Critical file permissions (/etc/shadow, /etc/sudoers) |
| `ssh-cron-jobs` | connectors/ssh.ts:303 | Scheduled tasks (backdoor persistence detection) |
| `ssh-sshd-config` | connectors/ssh.ts:338 | SSH server configuration (22 directives checked) |

#### Category 4: WinRM Authenticated Checks (7 modules)
*Log into Windows targets via WinRM — PowerShell-based inspection*

| Module ID | File | What It Checks |
|-----------|------|---------------|
| `winrm-os-info` | connectors/winrm.ts:45 | Windows version, build, service pack |
| `winrm-local-users` | connectors/winrm.ts:72 | Local user accounts, last logon, password expiry |
| `winrm-local-admins` | connectors/winrm.ts:99 | Members of Administrators group |
| `winrm-services` | connectors/winrm.ts:126 | All running Windows services |
| `winrm-installed-software` | connectors/winrm.ts:153 | All installed software (from registry) |
| `winrm-firewall-rules` | connectors/winrm.ts:180 | Enabled inbound firewall allow rules |
| `winrm-patches` | connectors/winrm.ts:207 | Installed hotfixes — alerts if >30 days behind |

#### Category 5: CIS v8.1 SSH Compliance Checks (12 modules)
*Maps Linux configuration to CIS Benchmark v8.1 — 55 controls*

| Module ID | CIS Controls | What It Checks |
|-----------|-------------|---------------|
| `cis-filesystem-mounts` | 1.1.1–1.1.22 | /tmp, /var/tmp, /dev/shm mount options (nodev, nosuid, noexec) |
| `cis-kernel-parameters` | 3.x | ASLR, ExecShield, IP forwarding, SYN cookies |
| `cis-filesystem-integrity` | 4.1 | AIDE or Tripwire installed and scheduled |
| `cis-access-auth` | 5.x | SSH key auth, password aging policies, account lockout |
| `cis-sudo-usage` | 5.2 | Sudo logging, sudo audit rules |
| `cis-login-retries` | 5.4 | Failed login attempt limits |
| `cis-pam-config` | 5.3–5.4 | PAM password quality (complexity requirements) |
| `cis-ssh-banner` | 5.2.16 | Legal warning banner before login |
| `cis-auditd-rules` | 4.4 | Auditd daemon running, audit rules configured |
| `cis-log-retention` | 4.3 | Log rotation policies, retention periods |
| `cis-aide-cron` | 4.1.3 | AIDE file integrity check scheduled in cron |
| `cis-permissions-remediation` | 6.1 | SUID/SGID binary audit, world-writable files |

#### Category 6: CIS Benchmark (NSE-based)

| Module ID | File | What It Does |
|-----------|------|-------------|
| `cis-benchmark` | checks/cis-benchmark.ts (177 lines) | Quick CIS checks via Nmap NSE scripts (network-based, no SSH) |

### Scan Type → Check Module Mapping

When you create a scan, you choose a **scan type**. The engine selects the right modules:

```
"vulnerability" scan → 6 modules:
  http-headers, ssl-tls, port-scan, exposed-panels, info-disclosure, common-cves

"port" scan → 2 modules:
  port-scan, http-headers

"compliance" scan → 4 + 12 CIS modules = 16 modules:
  http-headers, ssl-tls, dns-checks, info-disclosure + all 12 cis-* modules

"full" scan → 12 modules:
  All 12 HTTP/network modules

"discovery" scan → 7 modules:
  network-discovery, port-scan, service-detection, os-fingerprint,
  cloud-inventory, dns-checks, http-headers

"enterprise" scan → 15 + 12 CIS modules = 27 modules:
  All checks including Nmap + SSH + WinRM + CIS

"authenticated" scan → 8 SSH + 7 WinRM + 12 CIS = 27 modules:
  All authenticated modules
```

---

## 6. Authenticated Scanning — SSH & WinRM

### Why Authenticated Scanning?

Without credentials, a scanner can only see what's **visible from the outside** (like a burglar casing a building from the street). With credentials, it can see **everything from inside** (like a security auditor with a master key).

```
WITHOUT credentials (network scan):
  ✓ Open port 22 (SSH running)
  ✓ OpenSSH 8.2 (version from banner)
  ✗ Cannot see: /etc/shadow permissions
  ✗ Cannot see: What packages are installed
  ✗ Cannot see: Whether root login is enabled
  ✗ Cannot see: Localhost-only services

WITH SSH credentials (authenticated scan):
  ✓ Open port 22 (SSH running)
  ✓ OpenSSH 8.2 (version from banner)
  ✓ /etc/shadow is world-readable (CRITICAL)
  ✓ 247 packages installed, 12 with known CVEs
  ✓ Root SSH login enabled (HIGH risk)
  ✓ MySQL running on localhost:3306 (previously hidden)
```

### SSH Scanning Flow

```
1. User creates credential in BYOC:
   { credentialType: "ssh_password", username: "ubuntu", secret: "***" }
   ↓
   Encrypted with AES-256-GCM → stored in credential_vaults table
   Secret NEVER leaves the vault in plaintext

2. User creates scan with credentialId attached:
   POST /api/scans/create
   { type: "authenticated", targets: ["192.168.1.50"], credentialId: "cred_abc" }

3. When scan executes:
   ↓
   Decrypt credential from vault (in-memory only)
   ↓
   ssh2 library opens TCP connection to 192.168.1.50:22
   ↓
   Authenticate with decrypted username + password (or private key)
   ↓
   Run commands (all static strings — no user input):
     "uname -a"
     "cat /etc/os-release"
     "getent passwd | awk -F: '{ if ($3 >= 1000) print }'"
     "grep -E '^PermitRootLogin' /etc/ssh/sshd_config"
     ...
   ↓
   Parse command output → findings
   ↓
   Close SSH connection
   ↓
   PlainCredential object garbage collected (no longer in memory)
```

### SSH Security Constraints

**Critical security rule:** Every SSH command is a **static hardcoded string**. Never a template with user input:

```typescript
// ✅ SAFE — static string, no user input
const output = await runSshCommand(client, "grep -E '^PermitRootLogin' /etc/ssh/sshd_config");

// ❌ WOULD NEVER BE DONE — command injection risk
const output = await runSshCommand(client, `grep ${userInput} /etc/ssh/sshd_config`);
```

This is enforced by the `security-reviewer` agent at every phase.

### WinRM Scanning Flow

WinRM (Windows Remote Management) is Windows's answer to SSH. We built our own WinRM client from scratch in pure Node.js — no npm packages needed.

```
WinRM Protocol (WS-Management over HTTP):

  BYOC Scanner                          Windows Server
       │                                      │
       │── POST :5985/wsman (SOAP XML) ───────►│
       │   "Create a PowerShell shell"         │
       │◄── ShellId: "ABC-123" ────────────────│
       │                                      │
       │── POST :5985/wsman ──────────────────►│
       │   "Run: Get-LocalUser"               │
       │◄── CommandId: "CMD-456" ─────────────│
       │                                      │
       │── POST :5985/wsman ──────────────────►│
       │   "Give me output for CMD-456"        │
       │◄── stdout: "Name  Enabled  LastLogon" │
       │          "admin  True  2026-03-15"    │
       │                                      │
       │── POST :5985/wsman ──────────────────►│
       │   "Delete shell ABC-123"              │
```

Every WinRM interaction builds a SOAP XML message, sends it over HTTP/HTTPS, and parses the XML response. This is all handled in `src/lib/scanner/connectors/winrm-client.ts`.

---

## 7. CIS v8.1 Benchmark Compliance

### What is CIS?

**CIS** (Center for Internet Security) is a nonprofit organization that publishes security best practices called **Benchmarks**. The **CIS Benchmark v8.1** for Linux/Unix is a 300-page document containing hundreds of configuration rules that a secure Linux server should follow.

### How We Implemented It

We translated 55 of the most critical CIS controls into automated SSH check modules:

```
CIS v8.1 Control 5.2.7:
  Title: "Ensure SSH MaxAuthTries is set to 4 or less"
  Level: 1 (basic security — everyone should do this)
  Family: Access Control

  Our implementation (cis-ssh-hardening-check module):
    SSH command: "sshd -T | grep maxauthtries"
    Parse output: MaxAuthTries = 6
    CIS says: should be ≤ 4
    Finding: severity HIGH, cisControlId: "5.2.7", cisLevel: 1
    Remediation: "Set MaxAuthTries 4 in /etc/ssh/sshd_config"
```

### CIS Control Families

```
Family 1 — Filesystem (11 controls)
  1.1.1  Ensure /tmp is on separate partition
  1.1.2  Ensure nodev on /tmp
  1.1.3  Ensure nosuid on /tmp
  1.1.4  Ensure noexec on /tmp
  ... 7 more controls

Family 3 — Network Parameters (4 controls)
  3.1    Ensure IP forwarding is disabled
  3.2    Ensure packet redirect sending disabled
  3.3    Ensure source route not accepted
  3.4    Ensure ICMP redirects not accepted

Family 4 — Logging & Auditing (4 controls)
  4.1    Ensure auditd is installed
  4.1.3  Ensure AIDE cron scheduled
  4.3    Ensure log rotation configured
  4.4    Ensure audit rules for privileged commands

Family 5 — Access, Authentication, Authorization (18 controls)
  5.2.1  Ensure SSH Protocol 2
  5.2.7  Ensure SSH MaxAuthTries ≤ 4
  5.2.8  Ensure SSH IgnoreRhosts enabled
  5.2.9  Ensure SSH HostbasedAuthentication disabled
  5.2.10 Ensure SSH root login disabled
  5.2.16 Ensure SSH warning banner configured
  5.3.1  Ensure sudo commands require tty
  5.4.1  Ensure password expiration ≤ 365 days
  ... 10 more controls

Family 6 — System Maintenance (3 controls)
  6.1    Ensure SUID/SGID files examined
  6.2.1  Ensure password fields are not empty
  6.2.5  Ensure no duplicate UIDs exist
```

### CIS Level 1 vs Level 2

| Level | Description | Recommended For |
|-------|-------------|----------------|
| **Level 1** | Basic security — low performance impact | ALL servers |
| **Level 2** | Enhanced security — may impact performance/functionality | High-security environments |

Every finding in BYOC tells you which CIS level it belongs to, so you can prioritize Level 1 fixes first.

---

## 8. Credential Vault — Secrets Management

### The Problem

To do authenticated scanning, we need to store SSH passwords and private keys in the database. But if the database is ever breached, we don't want those secrets to be readable.

### The Solution: AES-256-GCM Encryption

Every credential is encrypted **before** it touches the database:

```
User input:
  username: "ubuntu"
  secret: "MySSHPassword123!"

What gets stored in the database:
  username: "enc:v1:AAABBBCCC...base64..." (encrypted)
  secret:   "enc:v1:DDDEEEFFF...base64..." (encrypted)

What API responses look like:
  { id: "cred_abc", name: "My Linux Server", credentialType: "ssh_password" }
  (no username, no secret, no passphrase — NEVER returned)
```

### AES-256-GCM Explained

**AES-256** = Advanced Encryption Standard with 256-bit key (military-grade)
**GCM** = Galois/Counter Mode (authenticated encryption — detects tampering)

```
Encryption process:
  1. Generate random 12-byte IV (Initialization Vector) — different every time
  2. Encrypt plaintext with AES-256-GCM using IV + 256-bit key (from env var)
  3. Get authTag (proves data wasn't tampered with)
  4. Store: "enc:v1:" + base64(iv + authTag + ciphertext)

Decryption process:
  1. Detect "enc:v1:" prefix
  2. Decode base64 → extract IV, authTag, ciphertext
  3. Verify authTag (if tampered, decryption fails)
  4. Decrypt using AES-256-GCM
  5. Return plaintext in memory only
```

### Vault Data Model

```
credential_vaults table:
  id             → "cred_abc123"
  tenantId       → "tenant_xyz" (multi-tenant isolation)
  name           → "Production Linux Web Server"
  credentialType → "ssh_password" | "ssh_key" | "winrm_password"
  username       → "enc:v1:..." (encrypted)
  secret         → "enc:v1:..." (encrypted password or SSH private key PEM)
  passphrase     → "enc:v1:..." (encrypted SSH key passphrase, if any)
  defaultPort    → 22 (or 5985 for WinRM)
  createdById    → "user_def456"
  createdAt      → 2026-03-17T10:00:00Z
```

### Referential Integrity

If a credential is referenced by an active scan, **deletion is blocked**:

```
DELETE /api/credentials/cred_abc
  ↓
  Check: any scan_target_credentials rows reference this credential?
  ↓
  YES → HTTP 409 "Credential in use by active scans"
  NO  → Delete proceeds, audit log created
```

---

## 9. Delta Diff Engine — Tracking Change Over Time

### The Problem

Running the same scan twice gives you the same list of findings. But security teams need to know:
- **What's new** since last week? (new attack surface)
- **What did we fix?** (resolved vulnerabilities)
- **What's still open?** (persistent risks)
- **Are things getting better or worse?** (risk trend)

### How Fingerprinting Works

Every finding gets a **deterministic fingerprint** (deduplication hash) — a unique ID computed from the finding's content:

```
Finding fingerprint = SHA-256 of:
  tenantId + ":" + assetId + ":" + checkModuleId + ":" + titleSlug

Example:
  "tenant_abc:asset_xyz:ssh-sshd-config:ensure-ssh-maxauthtries-is-4-or-less"
  ↓
  SHA-256 hash: "a3f8c2d1e9b7..."
```

The same security issue on the same asset always produces the **same fingerprint**, regardless of which scan found it or when. This lets us match findings across scans.

### Diff Algorithm

```
Input:
  Scan A (last week): 14 findings, fingerprints: [f1, f2, f3, f4, f5...]
  Scan B (today):     16 findings, fingerprints: [f1, f2, f3, f6, f7...]

Process:
  Set(B) - Set(A) = {f6, f7}     → NEW findings (weren't there before)
  Set(A) - Set(B) = {f4, f5}     → RESOLVED findings (fixed since last scan)
  Set(A) ∩ Set(B) = {f1, f2, f3} → PERSISTENT findings (still there)

  For persistent findings, compare severity:
    f2: severity "medium" → "high"  → ESCALATED (getting worse)
    f3: severity "high" → "medium"  → IMPROVED (getting better)

Risk Trend:
  new_high_crit + escalated > resolved_high_crit + improved → "increasing"
  resolved_high_crit + improved > new_high_crit + escalated → "decreasing"
  otherwise → "stable"

Output:
  { newCount: 2, resolvedCount: 2, persistentCount: 3,
    changedCount: 2, riskTrend: "increasing" }
```

### Diff Storage

The computed diff is stored in the `scan_diffs` table and cached for 1 hour:

```
scan_diffs table:
  baseScanId    → "scan_week1"
  newScanId     → "scan_week2"
  newCount      → 2
  resolvedCount → 2
  persistentCount → 3
  changedCount  → 2
  diffData      → JSON with full finding lists
  computedAt    → 2026-03-17T10:30:00Z
```

---

## 10. Data Flow — Cradle to Grave

### Complete End-to-End Data Flow

```
STEP 1: User Creates a Scan
───────────────────────────
Browser → POST /api/scans/create
  Body: { name: "Weekly Scan", type: "compliance",
          targets: ["192.168.1.50", "192.168.1.51"],
          credentialId: "cred_abc" }
  ↓
  Auth: getAuthenticatedUser() → { userId, tenantId }
  RBAC: hasCapability("scan.create") → true
  ↓
  Insert into scans table:
    status = "queued"
    targets = ["192.168.1.50", "192.168.1.51"]
    progress = { completedChecks: [], totalBatches: 8, currentBatch: 0 }
  ↓
  Insert into scan_target_credentials:
    scanId, target: "192.168.1.50", credentialId: "cred_abc"
    scanId, target: "192.168.1.51", credentialId: "cred_abc"
  ↓
  createAuditLog("scan.created", ...)
  ↓
  Response: { id: "scan_123", status: "queued" }

STEP 2: Frontend Starts Execution Loop
────────────────────────────────────────
Browser frontend calls:
  POST /api/scans/scan_123/execute
  ↓
  Auth + RBAC: hasCapability("scan.execute")
  ↓
  scanner.executeNextBatch("scan_123")
  ↓
  Load progress from DB: { currentBatch: 0, completedChecks: [] }
  ↓
  Determine next checks: ["http-headers", "ssl-tls"] (first 2 of 16)
  ↓
  Run both checks concurrently (Promise.all):
    httpHeadersCheck.run("192.168.1.50") → 3 findings
    sslTlsCheck.run("192.168.1.50") → 1 finding
  ↓
  For each finding, compute deduplicationHash:
    SHA-256("tenant_xyz:asset_50:http-headers:missing-x-frame-options")
    = "a3f8c2..."
  ↓
  Batch insert into scan_results (createMany):
    { scanId: "scan_123", tenantId: "tenant_xyz", severity: "medium",
      title: "Missing X-Frame-Options", deduplicationHash: "a3f8c2..." }
  ↓
  Upsert into asset_vulnerabilities:
    IF hash exists → update lastSeenAt (preserve firstDiscoveredAt)
    IF new hash → insert { firstDiscoveredAt: now, status: "open" }
  ↓
  Update progress in scans table:
    { completedChecks: ["http-headers", "ssl-tls"], currentBatch: 1 }
  ↓
  Response: { status: "running", newFindings: 4, progress: { 1/8 } }

STEP 3: Frontend Continues Loop
─────────────────────────────────
Browser calls POST /api/scans/scan_123/execute again...
  → Runs ["port-scan", "exposed-panels"] (checks 3 and 4)
  → Updates progress
  → Returns { status: "running" }
  ...continues until all 16 checks complete...

STEP 4: SSH Checks Execute
────────────────────────────
When CIS SSH check module runs:
  ↓
  Load credential from scan_target_credentials
  ↓
  Decrypt from vault (in-memory PlainCredential object)
  ↓
  ssh2.createConnection({ host: "192.168.1.50", port: 22,
                          username: "ubuntu", password: "****" })
  ↓
  Run: "grep -E '^PermitRootLogin' /etc/ssh/sshd_config"
  Output: "PermitRootLogin yes"
  ↓
  Finding: { title: "SSH Root Login Enabled", severity: "high",
             cisControlId: "5.2.10", cisLevel: 1,
             detectionMethod: "authenticated" }
  ↓
  Close SSH connection
  ↓
  PlainCredential garbage collected

STEP 5: Scan Completes — Post-Scan Hooks
─────────────────────────────────────────
All checks done → runPostScanHooks("scan_123", "tenant_xyz"):

  Hook 1: SIEM Events
    For each critical/high finding → createSiemEvent()
    { type: "vulnerability.found", severity: "high", assetId, ... }

  Hook 2: Detection Rules
    evaluateDetectionRules(siemEvents)
    IF rule matches → createAlert()

  Hook 3: SOAR Playbooks
    IF alert severity = "critical" → triggerPlaybook("critical-alert-escalation")

  Hook 4: Update Asset Record
    Update assets table:
      os = "Ubuntu 20.04", openPorts = [22, 80, 443], services = [...]

  Hook 5: Vulnerability Counts
    COUNT scan_results WHERE assetId AND status = "open" GROUP BY severity
    Update assets table:
      vulnerabilityCount = 14, criticalCount = 2, highCount = 6

  Hook 6: Compliance Mapping
    Map findings to compliance frameworks (SOC2, ISO27001, NIST)

STEP 6: User Views Results
───────────────────────────
Browser → GET /api/scans/scan_123/results?severity=high&page=1
  ↓
  Auth + RBAC: hasCapability("scan.view")
  ↓
  prisma.scanResult.findMany({
    where: { scanId: "scan_123", tenantId: "tenant_xyz", severity: "high" },
    orderBy: { createdAt: "desc" },
    take: 20, skip: 0,
    include: { asset: true }
  })
  ↓
  Response: { results: [...], total: 6, page: 1, pages: 1 }
  ↓
  Frontend renders findings with severity badges, CVSS scores, CIS controls

STEP 7: Delta Diff
───────────────────
Browser → POST /api/scans/scan_456/diff?baseId=scan_123
  ↓
  Load all findings from scan_123 (base)
  Load all findings from scan_456 (new)
  ↓
  Compare by deduplicationHash
  ↓
  { newCount: 3, resolvedCount: 1, persistentCount: 11,
    riskTrend: "increasing" }
  ↓
  Store in scan_diffs table
  ↓
  Create SIEM events for new critical/high findings
```

---

## 11. Backend API — Every Endpoint Explained

### Authentication & Authorization Model

**Every single API endpoint** follows this exact pattern:

```typescript
// Example: GET /api/scans
export async function GET(request: NextRequest) {

  // Step 1: Who is this?
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Step 2: Are they allowed to do this?
  const allowed = await hasCapability(user.id, 'scan.view', user.tenantId);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Step 3: Business logic (always scoped to their tenant)
  const scans = await prisma.scan.findMany({
    where: { tenantId: user.tenantId },  // ← NEVER omit this
    orderBy: { createdAt: 'desc' }
  });

  // Step 4: Audit log (for mutations — create/update/delete)
  await createAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'scan.list',
    resourceType: 'scan'
  });

  return NextResponse.json({ scans });
}
```

### Scan Management Endpoints

| Endpoint | Method | Capability Required | What It Does |
|----------|--------|--------------------|-----------|
| `/api/scans` | GET | `scan.view` | List all scans for this tenant (paginated, 20/page) |
| `/api/scans/create` | POST | `scan.create` | Create new scan → inserts to DB, returns scan_id |
| `/api/scans/[id]` | GET | `scan.view` | Full scan detail with progress + severity counts |
| `/api/scans/[id]` | DELETE | `scan.create` | Delete scan and all associated findings |
| `/api/scans/[id]/execute` | POST | `scan.execute` | Run next batch (2 checks) → returns progress |
| `/api/scans/[id]/results` | GET | `scan.view` | Paginated findings (filter by severity, status) |
| `/api/scans/[id]/results/[resultId]` | GET | `scan.view` | Full finding detail with remediation steps |
| `/api/scans/[id]/diff` | GET | `scan.view` | Retrieve previously computed diff |
| `/api/scans/[id]/diff` | POST | `scan.view` | Compute new diff against base scan |
| `/api/scans/[id]/export` | GET | `scan.export` | Download results as JSON or CSV |
| `/api/scans/[id]/onboard` | POST | `asset.edit` | Convert scan targets → Asset records |

### Credential Endpoints

| Endpoint | Method | Capability Required | What It Does |
|----------|--------|--------------------|-----------|
| `/api/credentials` | GET | `scan.credential.view` | List all credentials (NEVER includes secrets) |
| `/api/credentials` | POST | `scan.credential.manage` | Create + encrypt new credential |
| `/api/credentials/[id]` | GET | `scan.credential.view` | Get credential summary (no secrets) |
| `/api/credentials/[id]` | PUT | `scan.credential.manage` | Update + re-encrypt credential |
| `/api/credentials/[id]` | DELETE | `scan.credential.manage` | Delete (blocked if in use by active scan) |
| `/api/credentials/[id]/test` | POST | `scan.credential.manage` | Test SSH/WinRM connectivity |

### HTTP Status Code Reference

| Code | Meaning in BYOC |
|------|----------------|
| 200 | Success |
| 201 | Created (new resource) |
| 204 | Deleted (no content) |
| 400 | Bad request (malformed JSON) |
| 401 | Not authenticated (no/invalid JWT token) |
| 403 | Authenticated but lacks capability |
| 404 | Resource not found **or** belongs to different tenant |
| 409 | Conflict (duplicate name, credential in use) |
| 422 | Validation failed (Zod schema check failed) |
| 500 | Internal server error |

> **Why 404 instead of 403 for cross-tenant?** If Tenant A tries to access Tenant B's scan, returning 403 would confirm the resource exists. Returning 404 reveals nothing — attackers can't map other tenants' resources.

---

## 12. Frontend Flow — What the User Sees

### Page 1: Scans List (`/scans`)

**File:** `src/app/(dashboard)/scans/page.tsx` (351 lines)

```
┌────────────────────────────────────────────────────────────────┐
│  BYOC                                    [+ New Scan]          │
├────────────────────────────────────────────────────────────────┤
│  VULNERABILITY SCANS                                           │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Total   │  │ Running  │  │Completed │  │ Findings │      │
│  │   14     │  │    2     │  │   11     │  │   247    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                │
│  Name                Type         Status    Findings  Age     │
│  ──────────────────────────────────────────────────────────   │
│  ● Weekly Scan        Compliance   ✅ Done    42        1d    │
│  ● Dev Server Scan    Full         ⟳ Running  8         —     │
│  ● Port Scan          Port         ⏱ Queued   —         5m    │
│  ● Linux Baseline     Enterprise   ✅ Done    156       3d    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Auto-refresh:** Every 15 seconds while any scan is "running" or "queued"

**Create Scan Dialog:**
```
┌──────────────────────────────────┐
│  New Scan                    [×] │
│                                  │
│  Name: [Weekly Production Scan ] │
│                                  │
│  Type: [Compliance Scan      ▼]  │
│        ● Vulnerability Scan      │
│        ● Port Scan               │
│        ● Compliance Scan         │
│        ● Full Assessment         │
│        ● Asset Discovery         │
│                                  │
│  Targets (one per line):         │
│  [192.168.1.50               ]   │
│  [192.168.1.51               ]   │
│                                  │
│  Credential (optional):          │
│  [Linux Production Servers  ▼]   │
│                                  │
│  [Cancel]          [Create Scan] │
└──────────────────────────────────┘
```

### Page 2: Scan Detail (`/scans/[id]`)

**File:** `src/app/(dashboard)/scans/[id]/page.tsx`

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back  Weekly Compliance Scan              [▶ Resume] [Export]│
│          Compliance • 192.168.1.50 • Completed 2h ago          │
├────────────────────────────────────────────────────────────────┤
│  Progress: ████████████████████ 100%  (16/16 checks)           │
│                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Critical │ │   High   │ │  Medium  │ │   Low    │         │
│  │    2     │ │    6     │ │    9     │ │   25     │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                                                                │
│  [By Host ▼]  [All Severities ▼]  [Open ▼]                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  192.168.1.50 — Ubuntu 20.04                           42 ↕   │
│                                                                │
│  🔴 CRITICAL  SSH Root Login Enabled              CIS 5.2.10  │
│     PermitRootLogin is set to 'yes' in /etc/ssh/sshd_config   │
│     Detected via: Authenticated (SSH) | CIS Level 1           │
│     ▼ Expand                                                   │
│     Remediation: Set PermitRootLogin no in sshd_config,       │
│     then: systemctl restart ssh                               │
│                                                                │
│  🔴 CRITICAL  /etc/shadow World-Readable          CIS 6.1     │
│     /etc/shadow has permissions 644 — should be 000           │
│                                                                │
│  🟠 HIGH      SSH MaxAuthTries = 6               CIS 5.2.7   │
│     MaxAuthTries should be 4 or less                          │
│     CVSS: 7.5  CVE: —  EPSS: 0.12                            │
│                                                                │
│  🟡 MEDIUM    Missing X-Frame-Options Header     HTTP        │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

**Finding Expansion (click to expand any finding):**

```
  🔴 CRITICAL  SSH Root Login Enabled  [Open ▼] [Acknowledge] [Resolve]
  ─────────────────────────────────────────────────────────────────────

  Description:
  The SSH server is configured to allow root logins directly. An attacker
  who compromises the root password gains full system access without any
  additional privilege escalation step.

  Technical Details:
    Found: PermitRootLogin yes
    File: /etc/ssh/sshd_config
    Module: ssh-sshd-config
    Detection: Authenticated (SSH credential)
    CIS Control: 5.2.10 — Level 1
    CVSS Score: 9.8 (Critical)

  Remediation:
  1. Edit /etc/ssh/sshd_config
  2. Set: PermitRootLogin no
  3. Run: sudo systemctl restart ssh
  4. Verify: sshd -T | grep permitrootlogin
```

### Data Flow from Frontend Perspective

```
User opens /scans/scan_123
  ↓
  GET /api/scans/scan_123 (scan status + progress)
  ↓
  Render progress bar, severity counts
  ↓
  IF status = "running" or "queued":
    Every 5 seconds: GET /api/scans/scan_123 (auto-refresh)
    IF status just became "completed":
      Fetch findings: GET /api/scans/scan_123/results
      Stop polling
  ↓
  User applies filter: ?severity=critical
    → GET /api/scans/scan_123/results?severity=critical
    → Re-render finding list
  ↓
  User clicks finding → expand (client-side, no API call)
  ↓
  User clicks "Acknowledge"
    → PATCH /api/scans/scan_123/results/result_456
      { status: "acknowledged" }
    → Re-render badge
```

---

## 13. Database Design — Every Table Explained

### Scanner-Related Tables

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA (Scanner)                    │
│                                                                 │
│  scans ─────────────────────────────────────────────────────   │
│  id | tenantId | name | type | status | targets (JSON)         │
│  progress (JSON) | scanEngine | findingsSummary (JSON)         │
│  complianceScore | scanDurationSeconds | engineVersion         │
│          │                                                      │
│          │ 1:many                                               │
│          ▼                                                      │
│  scan_results ───────────────────────────────────────────────  │
│  id | tenantId | scanId | assetId | severity | title          │
│  description | cveId | cvssScore | status | remediation       │
│  details (JSON) | deduplicationHash | firstDiscovered          │
│  lastSeen | checkModuleId | detectionMethod                    │
│  cisControlId | cisLevel | epssScore | cvssVector              │
│          │                                                      │
│          │ many:1                                               │
│          ▼                                                      │
│  assets ─────────────────────────────────────────────────────  │
│  id | tenantId | name | ipAddress | hostname | os              │
│  riskScore | vulnerabilityCount | criticalCount | highCount    │
│  environment | isProduction | dataClassification               │
│          │                                                      │
│          │ 1:many                                               │
│          ▼                                                      │
│  asset_vulnerabilities ──────────────────────────────────────  │
│  id | tenantId | assetId | deduplicationHash                   │
│  firstDiscoveredAt | lastSeenAt | resolvedAt | status          │
│  (Unique: tenantId + assetId + deduplicationHash)              │
│                                                                 │
│  credential_vaults ──────────────────────────────────────────  │
│  id | tenantId | name | credentialType                         │
│  username (encrypted) | secret (encrypted) | passphrase (enc) │
│                                                                 │
│  scan_target_credentials ────────────────────────────────────  │
│  id | tenantId | scanId | target | credentialId                │
│  (Unique: scanId + target — one credential per target)         │
│                                                                 │
│  scan_diffs ─────────────────────────────────────────────────  │
│  id | tenantId | baseScanId | newScanId                        │
│  newCount | resolvedCount | persistentCount | changedCount     │
│  diffData (JSON) | computedAt                                  │
│  (Unique: baseScanId + newScanId)                              │
│                                                                 │
│  scan_policies ──────────────────────────────────────────────  │
│  id | tenantId | name | scanType | schedule (cron) | enabled   │
│  targetTags (JSON) | config (JSON)                             │
│                                                                 │
│  scan_templates ─────────────────────────────────────────────  │
│  id | tenantId | name | scanType                               │
│  checkModules (include list) | excludeModules (skip list)      │
│  isBuiltin | config (JSON)                                     │
│                                                                 │
│  scan_executions ────────────────────────────────────────────  │
│  id | tenantId | scanId | batchNumber | checkModuleId | target  │
│  startedAt | completedAt | durationMs | status | findingCount  │
│  (Audit trail — one row per check module per batch)            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Why store progress as JSON in the scans table?**
Vercel serverless functions don't share memory between invocations. Storing progress in the DB allows any invocation to pick up where the last one left off, even if running on a completely different server instance.

**Why deduplicationHash on scan_results?**
Without a fingerprint, the same vulnerability found in two different scans creates two separate rows with no connection. With the hash, we can find "this finding in scan B is the same as finding in scan A" and compute diffs.

**Why AssetVulnerability separate from ScanResult?**
`scan_results` is scan-scoped (one row per finding per scan). `asset_vulnerabilities` is asset-scoped (one row per unique finding per asset, across all scans). This lets you ask "how long has this vulnerability been open?" without querying every scan.

---

## 14. Security Architecture

### The Five Security Pillars

#### Pillar 1: Authentication (Who are you?)

```
Every request:
  1. Extract JWT from Authorization header or cookie
  2. Verify JWT signature (jose library, HS256)
  3. Check token expiry
  4. Look up user in DB → get userId + tenantId + roles
  5. If any check fails → 401 Unauthorized
```

#### Pillar 2: Authorization (What can you do?)

```
RBAC (Role-Based Access Control) — 56 capabilities total
Scanner-related capabilities (9):
  scan.view, scan.create, scan.execute, scan.schedule,
  scan.policy.view, scan.policy.manage, scan.export,
  scan.credential.view, scan.credential.manage

Role defaults:
  Admin        → all 9 scanner capabilities
  Security Team → scan.view, scan.create, scan.execute, scan.export,
                   scan.credential.view, scan.credential.manage
  Auditor      → scan.view, scan.export (read-only)
  Viewer       → scan.view only
```

#### Pillar 3: Tenant Isolation (One customer can't see another's data)

```typescript
// This is enforced by rules/security.md — never omitted:
prisma.scan.findMany({
  where: {
    tenantId: user.tenantId,  // ← ALWAYS present
    // ... other filters
  }
})
```

If a user from Tenant A knows the scan_id of Tenant B's scan and tries to access it, they get 404 (not found) — not 403 (forbidden), which would reveal the resource exists.

#### Pillar 4: Audit Logging (What happened, when, by whom?)

Every mutation creates an audit log entry:

```
audit_logs table:
  tenantId: "tenant_xyz"
  userId: "user_abc"
  action: "credential.created"
  resourceType: "credential"
  resourceId: "cred_def"
  details: { name: "Production Linux", credentialType: "ssh_password" }
  ipAddress: "203.0.113.50"
  userAgent: "Mozilla/5.0..."
  createdAt: "2026-03-17T10:00:00Z"
```

#### Pillar 5: Secrets Never Exposed

```
Credential secret lifecycle:
  Create:  plaintext → AES-256-GCM encrypt → DB (always encrypted)
  Read:    DB (encrypted) → decrypt in memory → PlainCredential
  Use:     PlainCredential → SSH/WinRM connection → discard
  Delete:  DB rows deleted → no trace of plaintext ever exists

API responses NEVER include:
  ❌ username (credential)
  ❌ secret (password or SSH key)
  ❌ passphrase (SSH key passphrase)
  ❌ passwordHash (user passwords)
  ❌ mfaSecret (TOTP secret)
```

---

## 15. SIEM & SOAR Integration

### How Scanner Findings Feed the SIEM

After a scan completes, `runPostScanHooks()` creates SIEM events for every critical or high finding:

```
Scan Result:
  title: "SSH Root Login Enabled"
  severity: "critical"
  assetId: "asset_xyz"
  cisControlId: "5.2.10"
         ↓
SIEM Event (ECS format):
  {
    event: { kind: "alert", category: "vulnerability", type: "info" },
    vulnerability: { id: "ssh-root-login", severity: "critical",
                     reference: ["CIS-5.2.10"] },
    host: { name: "prod-web-01", ip: "192.168.1.50", os: "Ubuntu 20.04" },
    tags: ["scanner", "authenticated", "cis-benchmark"],
    "@timestamp": "2026-03-17T10:00:00Z"
  }
```

### Detection Rule Evaluation

After SIEM events are created, detection rules run:

```
Detection Rule: "Critical Vulnerability on Production Asset"
  Condition: event.category = "vulnerability" AND
             vulnerability.severity = "critical" AND
             host.environment = "production"
  Action: CREATE ALERT

Alert Created:
  title: "Critical Vulnerability: SSH Root Login on prod-web-01"
  severity: "critical"
  source: "scanner"
  status: "open"
```

### SOAR Playbook Execution

Alerts can trigger automated playbooks:

```
Playbook: "Critical Alert Escalation"
  Trigger: alert.severity = "critical" AND alert.status = "open"
  Steps:
    1. Send email to security team
    2. Create ticket in JIRA (if configured)
    3. Set SLA timer (4 hours to acknowledge)
    4. If not acknowledged in 4h → escalate to CISO
```

---

## 16. Where the Code Lives

### Directory Map

```
BYOC/
├── prisma/
│   └── schema.prisma          ← Database schema (30 models, 8 scanner-related)
│
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   └── scans/
│   │   │       ├── page.tsx           ← Scans list UI (351 lines)
│   │   │       └── [id]/page.tsx      ← Scan detail UI (150+ lines)
│   │   │
│   │   └── api/
│   │       ├── scans/
│   │       │   ├── route.ts           ← GET /api/scans (list)
│   │       │   ├── create/route.ts    ← POST /api/scans/create
│   │       │   └── [id]/
│   │       │       ├── route.ts       ← GET + DELETE single scan
│   │       │       ├── execute/route.ts   ← POST run next batch
│   │       │       ├── results/route.ts   ← GET findings
│   │       │       ├── diff/route.ts      ← GET/POST diff
│   │       │       ├── export/route.ts    ← GET export
│   │       │       └── onboard/route.ts   ← POST → assets
│   │       │
│   │       └── credentials/
│   │           ├── route.ts           ← GET list, POST create
│   │           └── [id]/
│   │               ├── route.ts       ← GET, PUT, DELETE
│   │               └── test/route.ts  ← POST test connection
│   │
│   └── lib/
│       └── scanner/
│           ├── index.ts          ← Main engine (627 lines)
│           ├── types.ts          ← Type definitions (57 lines)
│           │
│           ├── vault/
│           │   └── index.ts      ← Credential encrypt/decrypt (85 lines)
│           │
│           ├── adapters/
│           │   ├── builtin.ts    ← Node.js fallback adapter (145 lines)
│           │   └── nmap.ts       ← Nmap adapter (137 lines)
│           │
│           ├── connectors/
│           │   ├── ssh-client.ts ← SSH protocol client (112 lines)
│           │   ├── ssh.ts        ← 8 SSH check modules (408 lines)
│           │   ├── winrm-client.ts ← WinRM protocol (120+ lines)
│           │   └── winrm.ts      ← 7 WinRM check modules (258 lines)
│           │
│           ├── checks/
│           │   ├── http-headers.ts     (127 lines)
│           │   ├── ssl-tls.ts          (221 lines)
│           │   ├── port-scan.ts        (359 lines)
│           │   ├── service-detection.ts (375 lines)
│           │   ├── os-fingerprint.ts   (414 lines)
│           │   ├── network-discovery.ts (344 lines)
│           │   ├── cloud-inventory.ts  (488 lines)
│           │   ├── cloud-misconfig.ts  (187 lines)
│           │   ├── exposed-panels.ts   (115 lines)
│           │   ├── info-disclosure.ts  (228 lines)
│           │   ├── common-cves.ts      (171 lines)
│           │   ├── dns-checks.ts       (124 lines)
│           │   ├── cis-benchmark.ts    (177 lines)
│           │   ├── cis-ssh.ts          (1069 lines) ← CIS v8.1
│           │   ├── cis-mappings.ts     (470 lines)  ← 55 CIS controls
│           │   ├── nmap-port-scan.ts   (180 lines)
│           │   ├── nmap-service-detection.ts (201 lines)
│           │   ├── nmap-os-fingerprint.ts (153 lines)
│           │   ├── nmap-network-discovery.ts (188 lines)
│           │   ├── nmap-vuln-scripts.ts (121 lines)
│           │   ├── nmap-auth-scan.ts   (122 lines)
│           │   └── vulnerability-db.ts (40,334 lines) ← CVE database
│           │
│           ├── diff/
│           │   ├── engine.ts     ← Diff algorithm (163 lines)
│           │   └── index.ts      ← Persistence + SIEM hooks (72 lines)
│           │
│           └── nmap/
│               ├── executor.ts   ← Run Nmap subprocess (217 lines)
│               ├── profiles.ts   ← Nmap flag presets (113 lines)
│               ├── parser.ts     ← Parse Nmap XML output (215 lines)
│               ├── types.ts      ← Nmap types (77 lines)
│               ├── cpe-mapper.ts ← CPE to CVE mapping (76 lines)
│               ├── nvd-client.ts ← NVD API client (148 lines)
│               └── nse-parsers.ts ← NSE script output parsers (385 lines)
│
├── tests/
│   └── e2e/
│       ├── 15-scanner-engine.spec.ts   (591 lines) ← Core scanner tests
│       ├── 18-phase12c.spec.ts         (594 lines) ← SSH/WinRM/Diff tests
│       └── 19-phase12d.spec.ts         (711 lines) ← CIS/Enterprise tests
│
└── docs/
    ├── SCANNER-ENGINE-v2-DOCUMENTATION.md
    ├── PHASE-12D-CIS-ENTERPRISE-REPORT.md
    └── SCANNER-TECHNICAL-DEEP-DIVE.md  ← This document
```

---

## 17. Deployment Guide

### Current Deployment (Production)

```
Code → GitHub (ECC_BYOC / BYOC repos)
  ↓ automatic on push to master
Vercel (serverless hosting)
  ↓
https://byoc-rosy.vercel.app
  ↓
PostgreSQL (Railway.app)
```

### Environment Variables Required

```bash
# Database
DATABASE_URL="postgresql://user:pass@railway-host:5432/byoc"

# Authentication
JWT_SECRET="minimum-32-char-random-string"
NEXTAUTH_SECRET="another-random-string"
NEXTAUTH_URL="https://your-domain.com"

# Credential Vault Encryption
ENCRYPTION_KEY="32-byte-hex-string-for-AES-256"

# Email
RESEND_API_KEY="re_..."

# Optional: Nmap path (if running on non-Vercel server)
NMAP_PATH="/usr/bin/nmap"
```

### Deploying to Vercel (Current Setup)

```bash
# 1. Push to GitHub (auto-deploys)
git push origin master

# 2. Or manual deploy via CLI
npm install -g vercel
vercel --prod

# 3. Apply database changes
npm run db:push

# 4. Seed demo data
npm run db:seed
```

### Why Nmap Works Differently in Production

Vercel is a **serverless** platform — there's no persistent server to install Nmap on. Our scanner automatically detects this:

```
On Vercel: isNmapAvailable() = false → uses builtin adapter (Node.js only)
On VPS/EC2: isNmapAvailable() = true → uses Nmap adapter (full power)
```

### For Full Nmap Support — Deploy to VPS or AWS

**Option A: DigitalOcean/Hetzner VPS**
```bash
# On Ubuntu 22.04 VPS:
apt-get install nmap
npm install
npm run build
npm start  # or pm2 start npm -- start
```

**Option B: AWS ECS (Phase 18 plan)**
```
ECR → Docker image (includes Nmap)
ECS Fargate → Runs container (Nmap available)
RDS PostgreSQL Multi-AZ → Production DB
ALB → HTTPS termination
CloudFront → CDN
WAF → Edge protection
```

The Dockerfile for AWS deployment:
```dockerfile
FROM node:22-alpine
RUN apk add --no-cache nmap
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 18. Is the Scanner Up to Date?

### Current Status (as of Phase 12D — 2026-03-17)

| Feature | Status | Details |
|---------|--------|---------|
| Core scan engine | ✅ Complete | Chunked execution, state machine, adapters |
| HTTP/Network checks (12) | ✅ Complete | Headers, SSL, ports, services, OS, cloud, CVEs |
| Nmap integration (6 modules) | ✅ Complete | Port scan, service detect, OS fingerprint, vuln scripts |
| SSH authenticated scanning (8) | ✅ Complete | All Linux check modules with CIS mapping |
| WinRM authenticated scanning (7) | ✅ Complete | All Windows check modules |
| CIS v8.1 benchmark (12 SSH + 55 controls) | ✅ Complete | Phase 12D |
| Credential vault (AES-256-GCM) | ✅ Complete | Phase 12C |
| Delta diff engine | ✅ Complete | Phase 12C |
| Cross-scan deduplication | ✅ Complete | Phase 12D (deduplicationHash + AssetVulnerability) |
| SIEM integration | ✅ Complete | Scanner → SIEM events → detection rules → alerts |
| SOAR integration | ✅ Complete | 3 built-in playbooks |
| Asset count updates | ✅ Complete | Phase 12D (vulnerabilityCount, criticalCount, highCount) |
| CVSS scoring | ✅ Complete | Stored on every finding |
| EPSS scoring | ✅ Complete | Exploit Prediction Scoring System field |
| Enterprise schema | ✅ Complete | ScanPolicy, ScanTemplate, AssetVulnerability, ScanExecution |
| Compliance mapping | ✅ Complete | SOC2, ISO27001, NIST CSF |

### What's Planned Next

| Feature | Phase | Description |
|---------|-------|-------------|
| Real-time scan updates | 14 | WebSocket push instead of polling |
| PDF scan reports | 15 | Generate and download professional PDF reports |
| Scheduled scanning | Policy engine | Cron-based automatic recurring scans |
| Cloud asset auto-discovery | 20 | AWS/Azure/GCP API-based asset inventory |
| UEBA behavioral analytics | 19 | Detect anomalous scan patterns |

---

## 19. Metrics & Capabilities Summary

### Scanner by the Numbers

| Metric | Count |
|--------|-------|
| Total check modules | **41** |
| HTTP/network-based checks | 12 |
| Nmap-powered checks | 6 |
| SSH authenticated checks | 8 |
| WinRM authenticated checks | 7 |
| CIS v8.1 SSH compliance checks | 12 |
| NSE-based CIS check | 1 |
| CIS v8.1 controls mapped | **55** |
| Vulnerability database entries | **40,334** CVE/CWE records |
| Scanner code files | **26 files** |
| Total scanner code lines | **~11,000 lines** |
| Scan types supported | **7** |
| Severity levels | 5 (critical/high/medium/low/info) |
| Finding statuses | 4 (open/acknowledged/resolved/false_positive) |
| Scanner API endpoints | **11** |
| Credential API endpoints | **6** |
| Database models (scanner) | **8** |
| Database indices (scanner) | **12** |
| RBAC capabilities (scanner) | **9** |
| E2E tests (scanner) | **113** tests across 3 spec files |

---

## 20. Glossary — Technical Terms Explained

| Term | Plain-English Explanation |
|------|--------------------------|
| **AES-256-GCM** | Military-grade encryption algorithm. AES = Advanced Encryption Standard, 256 = key size in bits, GCM = mode that also detects tampering |
| **API** | Application Programming Interface — a way for software to talk to other software. Our frontend talks to our backend through API endpoints |
| **Asset** | A device or system in your infrastructure (server, workstation, firewall, cloud resource) |
| **Audit Log** | A permanent record of who did what, when. Required by SOC2, ISO27001, HIPAA |
| **BYOC** | Bring Your Own Cloud — the product name. Customers run it in their own cloud infrastructure |
| **CheckModule** | A self-contained piece of code that checks one security aspect of a target |
| **CIS Benchmark** | Center for Internet Security — published security configuration guides. CIS v8.1 for Linux has 300+ rules |
| **CVSS** | Common Vulnerability Scoring System — a 0–10 score for how dangerous a vulnerability is |
| **CVE** | Common Vulnerabilities and Exposures — public database of known security flaws (e.g., CVE-2021-44228 = Log4Shell) |
| **Credential Vault** | Encrypted storage for SSH passwords/keys and WinRM passwords |
| **CWE** | Common Weakness Enumeration — categories of security flaws (e.g., CWE-89 = SQL Injection) |
| **Deduplication Hash** | A fingerprint for a finding — same vulnerability on same host always has same hash |
| **Delta Diff** | Comparing two scans to find what changed (new findings, resolved findings) |
| **EPSS** | Exploit Prediction Scoring System — probability that a CVE will be exploited in the wild |
| **JWT** | JSON Web Token — a signed token that proves who you are (like a cryptographic ID card) |
| **MFA** | Multi-Factor Authentication — login requires something you know (password) + something you have (phone) |
| **Multi-tenant** | One installation serves many customers, each with completely isolated data |
| **Nmap** | Network Mapper — open-source tool for discovering hosts, services, and vulnerabilities on networks |
| **NSE** | Nmap Scripting Engine — allows Nmap to run custom security check scripts |
| **ORM** | Object-Relational Mapper — translates between TypeScript objects and SQL database tables |
| **PAM** | Pluggable Authentication Modules — Linux framework for authentication policies |
| **Prisma** | The ORM we use for PostgreSQL. Provides TypeScript types and prevents SQL injection |
| **RBAC** | Role-Based Access Control — what you can do depends on your role (admin, viewer, auditor, etc.) |
| **SCIM** | System for Cross-domain Identity Management — standard for automatic user provisioning |
| **SHA-256** | Secure Hash Algorithm — creates a deterministic 256-bit fingerprint of any data |
| **SIEM** | Security Information & Event Management — collects security events, detects threats, generates alerts |
| **SOAR** | Security Orchestration, Automation & Response — automatically responds to security alerts |
| **SOC2** | Service Organization Control Type 2 — compliance framework for SaaS security |
| **SSH** | Secure Shell — encrypted remote login protocol for Linux/Unix systems |
| **Tenant** | An organization/customer using the BYOC platform. Each tenant has fully isolated data |
| **TypeScript** | JavaScript with type safety — catches bugs at compile time, not at runtime |
| **Vercel** | Cloud hosting platform for Next.js applications. Serverless — no servers to manage |
| **WinRM** | Windows Remote Management — remote command execution on Windows (like SSH for Windows) |
| **Zod** | TypeScript library for runtime input validation — ensures API inputs match expected schema |

---

*Technical document prepared by the BYOC Engineering Team — Furix AI*
*Repository: https://github.com/saipreethamvudutha/ECC_BYOC*
*Current Phase: 12D complete | Next: Phase 13 — PII/PHI Redaction Engine*
