---
description: Generate and run Playwright E2E tests for BYOC. Creates test journeys for auth, RBAC, scanning, compliance, SIEM, and settings flows.
---

# /e2e — BYOC End-to-End Test Command

Invokes the `e2e-runner` agent to generate, maintain, and run Playwright E2E tests.

## Usage

`/e2e [test description or flow]`

## BYOC Critical Test Flows

### Authentication & MFA (CRITICAL)
- Login with email/password
- Login with MFA (TOTP)
- Login with SSO (OAuth)
- Accept invitation flow
- Account lockout after 5 failed attempts

### RBAC (CRITICAL)
- Each role (Admin, Analyst, Auditor, Viewer) sees correct UI
- Capability gates block unauthorized actions
- Scope filtering restricts data correctly

### Vulnerability Scanner
- Create scan → execute → view results
- Export scan results (CSV + JSON)
- Selective asset onboarding from scan
- Scan scheduling

### Compliance
- View compliance frameworks
- Update control assessment with evidence
- Export compliance report
- Assessment history timeline

### SIEM
- View alert queue, triage alert
- Escalate alert to incident
- Manage incident lifecycle
- Create detection rule

### Asset Management
- Create asset, assign tags
- View asset with scan findings
- Auto-tag rule execution

### Settings / Admin
- Invite user, assign role
- Create/manage custom role with capability matrix
- Manage API keys
- View audit log
- Configure SSO provider

## Running Tests

```bash
# All 258 tests
npx playwright test

# Specific feature area
npx playwright test tests/auth.spec.ts
npx playwright test tests/rbac.spec.ts
npx playwright test tests/scans.spec.ts

# Visual (headed) mode
npx playwright test --headed

# Debug mode
npx playwright test --debug

# View HTML report
npx playwright show-report
```

## Test File Naming

Place new tests in `tests/` following existing patterns:
- `tests/auth.spec.ts`
- `tests/rbac.spec.ts`
- `tests/assets.spec.ts`
- `tests/scans.spec.ts`
- `tests/compliance.spec.ts`
- `tests/siem.spec.ts`
- `tests/settings.spec.ts`

## BYOC Test Patterns

```typescript
import { test, expect } from '@playwright/test'

test.describe('Scan execution flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Security Analyst
    await page.goto('/login')
    await page.fill('[data-testid="email"]', 'analyst@test.com')
    await page.fill('[data-testid="password"]', 'TestPass123!')
    await page.click('[data-testid="login-btn"]')
    await page.waitForURL('/dashboard')
  })

  test('create and execute scan', async ({ page }) => {
    await page.goto('/scans')
    await page.click('[data-testid="new-scan-btn"]')
    await page.fill('[data-testid="target-input"]', 'example.com')
    await page.click('[data-testid="create-scan-btn"]')

    // Wait for scan creation
    await page.waitForSelector('[data-testid="scan-status"]')

    // Execute scan
    await page.click('[data-testid="execute-scan-btn"]')
    await expect(page.locator('[data-testid="scan-status"]')).toContainText('running')
  })
})
```

## CI Integration

Tests run automatically on every PR via Playwright GitHub Action (see playwright.config.ts).
