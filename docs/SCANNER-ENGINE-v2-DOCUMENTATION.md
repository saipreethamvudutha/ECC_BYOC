# BYOC Scanner Engine v2 — Enterprise Nmap Integration

## Overview

The BYOC Scanner Engine v2 is an enterprise-grade vulnerability scanner that integrates Nmap as its primary scanning backend while maintaining full backward compatibility with the original Node.js-based scanner. The engine auto-detects Nmap availability at runtime and seamlessly switches between backends.

**Key Stats:**
- 15 check modules (4 Nmap-powered + 3 enterprise + 8 HTTP-based)
- 10 pre-defined Nmap scan profiles
- 70+ vulnerability database entries
- Live NVD API 2.0 CVE lookup via CPE strings
- 9 NSE script output parsers
- CIS v8.1 compliance control mapping
- Auto-fallback to Node.js when Nmap is unavailable

---

## Architecture

```
                          ┌─────────────────────┐
                          │     Browser / UI     │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │           API Layer              │
                    │  POST /api/scans/create          │
                    │  POST /api/scans/[id]/execute    │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │        Orchestrator              │
                    │  getActiveAdapter() ──┐          │
                    │  executeNextBatch()   │          │
                    └──────────┬───────────┘          │
                               │                      │
               ┌───────────────┼───────────────┐      │
               │                               │      │
    ┌──────────▼──────────┐    ┌───────────────▼────┐ │
    │   Nmap Adapter      │    │  Builtin Adapter   │ │
    │   15 modules        │    │  12 modules        │ │
    │   batch=1, 300s     │    │  batch=2, 7s       │ │
    └──────────┬──────────┘    └────────────────────┘ │
               │                                       │
    ┌──────────▼──────────────────────────────────┐   │
    │              Nmap Engine                      │   │
    │  executor → parser → profiles → nse-parsers  │   │
    │  nvd-client → cpe-mapper                     │   │
    └──────────┬──────────────────────────────────┘   │
               │                                       │
    ┌──────────▼──────────────────────────────────┐   │
    │           Post-Scan Pipeline                 │   │
    │  SIEM → Rules → SOAR → Compliance → AI      │   │
    └─────────────────────────────────────────────┘   │
                                                       │
    ┌──────────────────────────────────────────────┐   │
    │  PostgreSQL (Railway / AWS RDS)              │◄──┘
    │  Scans, ScanResults, Assets, Events, Alerts  │
    └──────────────────────────────────────────────┘
```

---

## How It Works

### 1. Auto-Detection (`getActiveAdapter()`)

When a scan is created or executed, the engine calls `getActiveAdapter()` which:

1. Checks if Nmap is installed by running `nmap --version`
2. Searches these paths:
   - **Windows:** `C:\Program Files (x86)\Nmap\nmap.exe`, `C:\Program Files\Nmap\nmap.exe`, then `PATH`
   - **Linux:** `/usr/bin/nmap`, `/usr/local/bin/nmap`, then `PATH`
3. Caches the result for 60 seconds (avoids repeated filesystem checks)
4. Returns `nmapAdapter` if found, `builtinAdapter` otherwise

```
isNmapAvailable() → true  → nmapAdapter  (15 modules, 300s timeout)
isNmapAvailable() → false → builtinAdapter (12 modules, 7s timeout)
```

**No configuration needed.** Install Nmap on the server and the scanner upgrades automatically.

### 2. Scan Execution Flow

```
User clicks "New Scan" in UI
  │
  ▼
POST /api/scans/create
  │ → initializeProgress(scanType)
  │   → getActiveAdapter()
  │   → Returns module list + batch config
  │ → Creates Scan record in DB (status: "queued")
  │
  ▼
UI polls POST /api/scans/[id]/execute
  │
  ▼
executeNextBatch(scanId)
  │ → Loads scan from DB
  │ → getActiveAdapter() → selects engine
  │ → Gets remaining unchecked modules
  │ → Runs next batch (1 module for Nmap, 2 for builtin)
  │   → For each module:
  │     → module.run(target)
  │       → [Nmap modules] spawns nmap.exe via execFile()
  │       → [HTTP modules] uses Node.js fetch/net
  │     → Saves CheckResults to DB
  │     → Updates progress JSON
  │ → Returns { status, progress, newFindings }
  │
  ▼
When all modules complete:
  │ → Status set to "completed"
  │ → runPostScanHooks()
  │   → Creates SIEM events for critical/high findings
  │   → Runs detection rules → creates alerts
  │   → Runs SOAR playbooks (auto-escalation, containment)
  │   → Updates Asset records (OS, services, ports)
  │   → Maps findings to compliance controls
  │   → Creates AI remediation action suggestions
```

### 3. How Nmap Modules Work

Each Nmap check module follows this pattern:

```typescript
async run(target: string): Promise<CheckResult[]> {
  // 1. Check Nmap availability
  if (!(await isNmapAvailable())) {
    throw new Error('Nmap not available');
  }

  // 2. Select scan profile (pre-defined arguments)
  const profile = SCAN_PROFILES['quick-syn'];

  // 3. Spawn nmap process
  const { xml } = await runNmap([...profile.args, target], profile.timeout);
  // Under the hood: child_process.execFile('nmap', args)
  // Output: XML file parsed after process exits

  // 4. Parse XML results
  const scanResult = parseNmapXml(xml);

  // 5. Transform to CheckResult[] format
  // (compatible with existing post-scan pipeline)
  return results;
}
```

**Security:** Uses `execFile` (not `exec`) to prevent shell injection. Blocks dangerous arguments like `--script-args-file`. XML output written to temp file, read back, and cleaned up in `finally` block.

---

## Check Modules (15 Total)

### Nmap-Powered Replacements (4)

These replace the original Node.js modules with Nmap-backed versions. Same `id` values ensure backward compatibility with the post-scan pipeline.

| Module | ID | Nmap Flags | What It Does |
|--------|-----|------------|-------------|
| Port Scan | `port-scan` | `-sS -T4 --top-ports 1000` | SYN scan of top 1000 ports. Maps risky ports (RDP, databases, FTP) to vuln-db entries. |
| Service Detection | `service-detection` | `-sV --version-all --script vulners` | Identifies service name, product, version via Nmap's 12,000+ probe database. Extracts CPE strings for NVD CVE lookup. |
| OS Fingerprint | `os-fingerprint` | `-O --osscan-guess` | TCP/IP stack analysis for OS identification (90%+ accuracy vs 65% with heuristics). Flags 16 end-of-life OS patterns. |
| Network Discovery | `network-discovery` | `-sn -PE -PS80,443,22` | ICMP + TCP + ARP ping sweep. Classifies devices as server, workstation, network_device, printer, iot_device. |

### Enterprise Modules (3 — NEW)

| Module | ID | Nmap Flags | What It Does |
|--------|-----|------------|-------------|
| Vuln Scripts | `vuln-scripts` | `--script vulners,ssl-enum-ciphers,smb-vuln-*` | Runs NSE vulnerability detection scripts. Extracts real CVE IDs with CVSS scores from vulners database. Audits SSL cipher suites. Checks for EternalBlue (MS17-010). |
| Auth Scan | `auth-scan` | `--script ssh-auth-methods,ftp-anon,smb-security-mode,snmp-info` | Audits authentication configuration across SSH, FTP, SMB, SNMP. Flags password-only SSH, anonymous FTP, disabled SMB signing, default SNMP community strings. |
| CIS Benchmark | `cis-benchmark` | `--script ssl-enum-ciphers,ssh2-enum-algos,ftp-anon,smb-security-mode,snmp-info` | Maps Nmap NSE findings to CIS v8.1 controls. Produces compliance score (% passing) and per-control pass/fail status. Controls: 3.10 (encrypt transit), 4.1 (secure config), 4.8 (disable services), 5.2 (passwords). |

### HTTP-Based Modules (8 — Unchanged)

These use pure Node.js (no Nmap needed) and are shared between both adapters:

| Module | ID | What It Does |
|--------|-----|-------------|
| HTTP Headers | `http-headers` | Checks CSP, HSTS, X-Frame-Options, etc. |
| SSL/TLS | `ssl-tls` | Certificate expiry, self-signed, weak protocols |
| Exposed Panels | `exposed-panels` | Admin panels, phpMyAdmin, Swagger UI |
| Info Disclosure | `info-disclosure` | .env files, .git directories, backups |
| Common CVEs | `common-cves` | Log4Shell, Spring4Shell, ProxyShell |
| DNS Checks | `dns-checks` | SPF, DMARC, DNSSEC, zone transfer |
| Cloud Misconfig | `cloud-misconfig` | Open S3/Azure/GCP buckets, CORS |
| Cloud Inventory | `cloud-inventory` | Docker, K8s, cloud provider detection |

---

## Scan Types

| Scan Type | Modules Used | Use Case |
|-----------|-------------|----------|
| `vulnerability` | 8 modules | Standard vuln scan (HTTP + ports + NSE vulns) |
| `port` | 3 modules | Quick port scan + service detection |
| `compliance` | 6 modules | CIS/PCI compliance audit (HTTP + auth + CIS benchmark) |
| `full` | 12 modules | Comprehensive scan (all except enterprise-only) |
| `discovery` | 7 modules | Network discovery + asset classification |
| `enterprise` | 14 modules | Everything: full scan + vuln scripts + auth audit + CIS |

---

## Nmap Scan Profiles

Pre-defined argument sets in `profiles.ts`:

| Profile | Arguments | Timeout | Use Case |
|---------|-----------|---------|----------|
| `quick-syn` | `-sS -T4 --top-ports 1000 -sV --version-light` | 120s | Fast port scan |
| `full-tcp` | `-sS -p- -T3 -sV` | 600s | All 65535 ports |
| `os-detect` | `-sS -O --osscan-guess -T4 --top-ports 200` | 120s | OS fingerprinting |
| `service-version` | `-sV --version-all -T3 --top-ports 1000` | 180s | Detailed service ID |
| `discovery` | `-sn -PE -PS80,443,22,3389 -PA80,443` | 120s | Ping sweep |
| `vuln-scripts` | `-sV --script vulners,ssl-enum-ciphers,smb-vuln-*` | 300s | NSE vulnerability scan |
| `combined` | `-sS -sV -O --osscan-guess -sC -T3` | 300s | All-in-one |
| `auth-scan` | `-sV --script ssh-auth-methods,ftp-anon,smb-security-mode` | 120s | Auth audit |
| `cis-baseline` | `-sV --script ssl-enum-ciphers,ssh2-enum-algos,ftp-anon,...` | 300s | CIS compliance |
| `udp-scan` | `-sU -T4 --top-ports 50 -sV` | 300s | UDP services |

---

## NVD CVE Integration

The scanner enriches findings with live CVE data from NIST's National Vulnerability Database:

```
Nmap -sV detects service → Extracts CPE string
  e.g., "OpenSSH 6.6.1p1" → cpe:/a:openbsd:openssh:6.6.1p1

CPE string → NVD API 2.0 query
  GET https://services.nvd.nist.gov/rest/json/cves/2.0?cpeName={cpe}

Response → Filter to CVSS >= 4.0 → Create CheckResults with real CVE IDs
```

**Rate limiting:** 5 requests per 30 seconds (NVD free tier). Max 5 CPE lookups per scan to prevent API exhaustion.

**Caching:** In-memory cache with 1-hour TTL per CPE. Prevents duplicate lookups across scans.

---

## CIS v8.1 Compliance Mapping

The CIS Benchmark module maps NSE findings to specific CIS v8.1 controls:

| CIS Control | Title | What We Check |
|-------------|-------|--------------|
| 3.10 | Encrypt Sensitive Data in Transit | SSL/TLS cipher suites, protocol versions |
| 4.1 | Establish Secure Configuration Process | SMB security mode, signing |
| 4.8 | Disable Unnecessary Services | FTP anonymous access, SNMP configuration |
| 5.2 | Use Unique Passwords | SSH auth methods, SSH algorithms |

Output includes:
- Compliance score (% controls passing)
- Per-control pass/fail status
- `cisControlId` in each finding for direct framework mapping

---

## Deployment Guide

### Local Development (Windows)

1. **Install Nmap:** Download from https://nmap.org/download.html
   - Run the Windows installer (includes Npcap)
   - Default path: `C:\Program Files (x86)\Nmap\`
2. **Start dev server:** `npm run dev`
3. **Auto-detected:** The scanner finds `nmap.exe` automatically
4. **Verify:** Check server logs for `[Scanner] Active adapter: nmap`

### AWS EC2 (Production)

1. **Launch EC2 instance:**
   - Recommended: `t3.medium` (2 vCPU, 4GB RAM) minimum
   - For heavy scanning: `t3.large` (2 vCPU, 8GB RAM)
   - Storage: 50GB+ SSD (scan results, Nmap DB)
   - OS: Ubuntu 22.04 LTS or Amazon Linux 2023

2. **Install Nmap:**
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install -y nmap

   # Amazon Linux / RHEL
   sudo yum install -y nmap

   # Verify
   nmap --version
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

4. **Deploy BYOC:**
   ```bash
   git clone https://github.com/saipreethamvudutha/BYOC.git
   cd BYOC
   npm install
   npx prisma generate
   npm run build
   npm start
   ```

5. **Environment variables:**
   ```bash
   DATABASE_URL=postgresql://user:pass@host:5432/byoc
   AUTH_SECRET=your-jwt-secret
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   ```

6. **No rebuild needed.** The same code auto-detects Nmap at runtime.

### AWS with Docker

```dockerfile
FROM node:20-slim

# Install Nmap
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Vercel (Fallback Mode)

Vercel cannot install system binaries like Nmap. The scanner automatically falls back to the Node.js builtin adapter:
- 12 check modules (HTTP-based + Node.js TCP probes)
- 2 checks per batch, 7s timeout
- Still functional, just without Nmap's advanced capabilities

**No code changes needed** between Vercel and AWS deployments.

---

## Comparison: Builtin vs Nmap

| Capability | Builtin (Node.js) | Nmap Engine |
|-----------|-------------------|-------------|
| Port scanning | TCP connect (100 ports) | SYN scan (65535 ports) |
| Service detection | 50 regex patterns | 12,000+ Nmap probe database |
| OS fingerprinting | 65% accuracy (heuristic) | 90%+ (TCP/IP stack analysis) |
| CVE database | 70 static entries | 70 static + live NVD API |
| CPE mapping | None | Auto-extract from -sV |
| NSE scripts | None | vulners, ssl-enum-ciphers, smb-vuln-* |
| Auth auditing | None | SSH, FTP, SMB, SNMP checks |
| CIS compliance | None | CIS v8.1 control mapping |
| Scan evidence | None | Raw Nmap XML stored |
| Batch size | 2 checks / 7s | 1 check / 300s |
| Deployment | Vercel (serverless) | AWS EC2 / Docker |

---

## File Structure

```
src/lib/scanner/
├── index.ts                    # Orchestrator (executeNextBatch, initializeProgress)
├── types.ts                    # Core interfaces (CheckModule, CheckResult, ScanProgress)
├── vulnerability-db.ts         # 70+ static vulnerability entries
│
├── adapters/
│   ├── builtin.ts              # Node.js adapter + getActiveAdapter()
│   └── nmap.ts                 # Nmap adapter (15 modules, 6 scan types)
│
├── nmap/                       # Nmap Engine Core
│   ├── index.ts                # Barrel exports
│   ├── types.ts                # NmapHost, NmapPort, NmapService, NmapScanResult
│   ├── executor.ts             # Binary detection, process spawning, XML temp files
│   ├── parser.ts               # XML → TypeScript (fast-xml-parser)
│   ├── profiles.ts             # 10 scan profiles (quick-syn, full-tcp, etc.)
│   ├── nse-parsers.ts          # 9 NSE output parsers (vulners, ssl, ssh, smb, etc.)
│   ├── nvd-client.ts           # NVD API 2.0 client (rate-limited, cached)
│   └── cpe-mapper.ts           # CPE → NVD CVE enrichment
│
├── checks/                     # Check Modules
│   ├── nmap-port-scan.ts       # SYN scan (replaces port-scan.ts)
│   ├── nmap-service-detection.ts # -sV + CPE + NVD (replaces service-detection.ts)
│   ├── nmap-os-fingerprint.ts  # -O fingerprint (replaces os-fingerprint.ts)
│   ├── nmap-network-discovery.ts # -sn ping sweep (replaces network-discovery.ts)
│   ├── nmap-vuln-scripts.ts    # NSE vulnerability scripts (NEW)
│   ├── nmap-auth-scan.ts       # SSH/FTP/SMB/SNMP auth audit (NEW)
│   ├── cis-benchmark.ts        # CIS v8.1 compliance mapping (NEW)
│   ├── http-headers.ts         # (unchanged)
│   ├── ssl-tls.ts              # (unchanged)
│   ├── exposed-panels.ts       # (unchanged)
│   ├── info-disclosure.ts      # (unchanged)
│   ├── common-cves.ts          # (unchanged)
│   ├── dns-checks.ts           # (unchanged)
│   ├── cloud-misconfig.ts      # (unchanged)
│   └── cloud-inventory.ts      # (unchanged)
```

---

## Database Schema Changes

Three new fields added to the `Scan` model:

```prisma
model Scan {
  // ... existing fields ...
  scanEngine  String   @default("builtin") // "builtin" | "nmap"
  nmapVersion String?  // e.g. "7.98"
  rawOutput   String?  // Nmap XML for audit evidence
}
```

---

## Security Considerations

1. **No shell injection:** Uses `execFile` (not `exec`), arguments passed as array
2. **Blocked dangerous args:** `--script-args-file`, `--datadir`, `--resume` are rejected
3. **Output size limit:** 50MB max stdout buffer
4. **Temp file cleanup:** XML output files cleaned up in `finally` block
5. **Rate limiting:** NVD API calls rate-limited to 5/30s
6. **Safe targets only:** Scanner should only target authorized systems
7. **No credential storage:** Auth scan uses Nmap's built-in NSE scripts, no credential vault

---

## Tested Results

Tested against `scanme.nmap.org` (authorized Nmap test target):

```
Nmap 7.98 auto-detected at C:\Program Files (x86)\Nmap\nmap.exe
TCP connect scan completed in 9.9s
Host: 45.33.32.156 (scanme.nmap.org) — UP
Open ports: 3
  21/tcp — FTP (tcpwrapped)
  22/tcp — SSH OpenSSH 6.6.1p1  [CPE: cpe:/a:openbsd:openssh:6.6.1p1]
  80/tcp — HTTP Apache 2.4.7    [CPE: cpe:/a:apache:http_server:2.4.7]

Port scan module findings:
  [INFO] Open Ports Detected: 3 ports on scanme.nmap.org
  [MEDIUM] FTP Port (21) Open — Unencrypted File Transfer
```
