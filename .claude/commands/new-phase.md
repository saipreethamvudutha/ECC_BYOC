---
description: Start a new BYOC feature phase. Sets up documentation, plans implementation, and kicks off the development workflow.
---

# /new-phase — BYOC Feature Phase Kickoff

Use this command to start a new major feature phase for BYOC.

## Usage

`/new-phase [phase-number] [feature-name] [brief description]`

## What This Does

1. **Creates phase documentation** — `docs/PHASE-{N}-{FEATURE}-REPORT.md`
2. **Plans implementation** — invokes `planner` + `architect` agents
3. **Sets up test structure** — creates test file skeleton
4. **Chains full workflow** — `planner → architect → tdd-guide → code-reviewer → security-reviewer`

## Phase Document Template

Every new phase MUST create a report doc in `docs/` with this structure:

```markdown
# Phase {N}: {Feature Name} — Implementation Report

## Overview
[2-3 sentences: what this phase adds and why]

## Problem Statement
[What gap does this fill? What user/business need?]

## Value Added
[Concrete value: capability unlocked, security improved, compliance achieved, etc.]

## Architecture Changes

### New API Routes
| Route | Method | Purpose | RBAC Capability |
|-------|--------|---------|-----------------|

### New DB Models / Schema Changes
| Model/Field | Type | Purpose |

### New Components / Pages
| File | Purpose |

## Implementation Steps

### Phase {N}.A: [Sub-phase name]
1. [Step 1]
2. [Step 2]

### Phase {N}.B: [Sub-phase name]
...

## Security Considerations
- [List security implications]
- [RBAC capabilities added]
- [Audit events added]

## Testing
| Test Area | Count | Coverage |
|-----------|-------|---------|

## Deployment Notes
[Any migration steps, env vars, cron changes]

## Result
[What was shipped, metrics: routes added, tests added, capabilities added]
```

## Examples

```
/new-phase 13 "Threat Intelligence" "Integrate external threat feeds (MISP, AlienVault OTX) for IoC matching"
/new-phase 14 "PDF Reports" "Generate branded PDF security reports with executive summary and charts"
/new-phase 15 "WebSocket Streaming" "Real-time SIEM event streaming via WebSocket for live SOC dashboard"
```

## BYOC Phase Numbering

Current phases:
- Phase 1-4: Foundation, RBAC, Compliance, API Keys
- Phase 5: GRC Module (5A: frameworks, 5B: enterprise)
- Phase 6: Enterprise SSO, MFA, SCIM
- Phase 7: Vulnerability Scanner Engine
- Phase 8: Enterprise Asset Discovery
- Phase 9: Asset Inventory Enhancement
- Phase 10: Enterprise SIEM / SOC Operations Center
- Phase 11: Detection Engine, SOAR, Compliance Automation
- Phase 12: Enterprise Nmap Scanner (12A: engine, 12B: selective onboarding)
- **Phase 13: Next** — your choice
