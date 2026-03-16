---
name: aws-deployment
description: >
  AWS production deployment patterns for BYOC. Covers ECS Fargate (Next.js app),
  RDS PostgreSQL (replacing Railway), ALB, CloudFront CDN, WAF, Secrets Manager,
  VPC networking, ECR, CI/CD with GitHub Actions, and security hardening for
  an enterprise cybersecurity SaaS product on AWS.
origin: BYOC-custom
---

# AWS Deployment Skill — BYOC

## Target Architecture

```
Internet
    │
    ▼
CloudFront (CDN + WAF)
    │
    ▼
ALB (Application Load Balancer)
    │
    ├──► ECS Fargate (Next.js App) — Auto-scaling, 2-4 tasks
    │         │
    │         ├──► RDS PostgreSQL (Multi-AZ)
    │         ├──► ElastiCache Redis (sessions + caching)
    │         └──► S3 (reports, exports, audit archives)
    │
    └── Private Subnets (VPC)
         │
         └──► Secrets Manager (JWT_SECRET, DB_PASSWORD, RESEND_KEY)
```

## AWS Services Used

| Service | Purpose | Why |
|---------|---------|-----|
| ECS Fargate | Run Next.js app containers | No server management, auto-scaling |
| ECR | Docker image registry | Private, integrated with ECS |
| RDS PostgreSQL 15 Multi-AZ | Production database | High availability, automated backups |
| ElastiCache Redis | Session store + rate limiting | Sub-ms latency for auth checks |
| ALB | Load balancer + SSL termination | HTTPS, health checks, path routing |
| CloudFront | CDN + edge caching | Static assets, global low-latency |
| WAF | Web Application Firewall | Block SQLi, XSS, rate limiting at edge |
| Secrets Manager | Secure secrets storage | Rotation, audit trail, no .env files |
| S3 | Report exports, audit archives | Durable, lifecycle policies |
| VPC | Network isolation | Private subnets for DB, Redis |
| Route 53 | DNS management | Latency routing, health checks |
| ACM | SSL/TLS certificates | Free, auto-renew |
| CloudWatch | Logs + metrics + alarms | Observability, alerting |
| GuardDuty | Threat detection | Detects compromised credentials, unusual access |
| Config | Compliance tracking | SOC2/ISO27001 evidence |
| CloudTrail | API audit log | Compliance, forensics |

---

## Dockerfile (Production)

```dockerfile
# Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Builder
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Runner (minimal production image)
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user (security)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

## next.config.ts — Enable standalone output

```typescript
// next.config.ts
const nextConfig = {
  output: 'standalone',  // Required for Docker/ECS deployment
  // ... other config
}
```

---

## ECS Task Definition (key fields)

```json
{
  "family": "byoc-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [{
    "name": "byoc",
    "image": "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/byoc:latest",
    "portMappings": [{"containerPort": 3000, "protocol": "tcp"}],
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "NEXT_TELEMETRY_DISABLED", "value": "1"}
    ],
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:...byoc/database-url"},
      {"name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:...byoc/jwt-secret"},
      {"name": "ENCRYPTION_KEY", "valueFrom": "arn:aws:secretsmanager:...byoc/encryption-key"},
      {"name": "RESEND_API_KEY", "valueFrom": "arn:aws:secretsmanager:...byoc/resend-api-key"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/byoc",
        "awslogs-region": "${AWS_REGION}",
        "awslogs-stream-prefix": "byoc"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"],
      "interval": 30,
      "timeout": 10,
      "retries": 3,
      "startPeriod": 60
    }
  }]
}
```

---

## GitHub Actions CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: BYOC Deploy to AWS

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: byoc
  ECS_SERVICE: byoc-service
  ECS_CLUSTER: byoc-cluster
  CONTAINER_NAME: byoc

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      # E2E tests against staging
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --project=chromium
        env:
          PLAYWRIGHT_BASE_URL: ${{ secrets.STAGING_URL }}

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: .
          severity: CRITICAL,HIGH

  deploy:
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, push Docker image
        run: |
          IMAGE_TAG=${{ github.sha }}
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Run DB migrations
        run: |
          # Run prisma migrate deploy via ECS run-task
          aws ecs run-task \
            --cluster $ECS_CLUSTER \
            --task-definition byoc-migrate \
            --overrides '{"containerOverrides":[{"name":"byoc","command":["npx","prisma","migrate","deploy"]}]}'

      - name: Deploy to ECS (rolling update)
        run: |
          aws ecs update-service \
            --cluster $ECS_CLUSTER \
            --service $ECS_SERVICE \
            --force-new-deployment

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster $ECS_CLUSTER \
            --services $ECS_SERVICE

      - name: Health check
        run: |
          curl -f ${{ secrets.PROD_URL }}/api/health
```

---

## WAF Rules (Essential for Security Platform)

```
Rate limiting:         2000 req/5min per IP
SQLi protection:       AWSManagedRulesSQLiRuleSet
XSS protection:        AWSManagedRulesCommonRuleSet
Known bad IPs:         AWSManagedRulesAmazonIpReputationList
Linux/Unix protections:AWSManagedRulesLinuxRuleSet
Bot control:           AWSManagedRulesBotControlRuleSet

Custom rules:
- Block /api/auth/login > 20 attempts/min per IP
- Block SCIM endpoints to allowlisted IPs only
- Geo-block regions as required by compliance
```

---

## RDS PostgreSQL — Security Config

```
- Multi-AZ: enabled (failover < 60s)
- Encryption at rest: AES-256 (KMS key)
- Backups: 7-day automated + daily snapshots to S3
- SSL enforcement: rds.force_ssl = 1
- Parameter group: max_connections=200, log_min_duration_statement=500ms
- Performance Insights: enabled (7-day retention)
- Enhanced monitoring: 60-second intervals
- VPC: private subnets only (no public access)
- Security group: port 5432 from ECS only
```

---

## Secrets Manager — Secret Structure

```
byoc/production/
├── database-url          → postgresql://user:pass@rds-endpoint:5432/byoc
├── jwt-secret            → 64-byte random hex
├── encryption-key        → 32-byte AES key
├── resend-api-key        → re_xxxxxxxxxxxx
└── next-public-app-url   → https://app.byoc.io
```

Rotation policy: JWT_SECRET rotates every 90 days, ENCRYPTION_KEY requires migration.

---

## Cost Estimate (Production)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| ECS Fargate | 2x 1vCPU/2GB, 24/7 | ~$60 |
| RDS PostgreSQL | db.t3.medium Multi-AZ | ~$90 |
| ElastiCache Redis | cache.t3.micro | ~$20 |
| ALB | Standard | ~$20 |
| CloudFront | 1TB transfer | ~$85 |
| WAF | 3 rule groups | ~$20 |
| Secrets Manager | 5 secrets | ~$3 |
| S3 | 50GB | ~$1 |
| CloudWatch | Logs + metrics | ~$20 |
| **Total** | | **~$320/mo** |

---

## Migration Plan (Vercel → AWS)

### Phase 1: Parallel deployment (zero downtime)
1. Build Docker image locally and push to ECR
2. Set up RDS and migrate data from Railway using pg_dump / pg_restore
3. Deploy to ECS Fargate (staging environment)
4. Run full Playwright E2E test suite against AWS staging
5. Configure CloudFront + WAF + Route 53

### Phase 2: Traffic cutover
1. Deploy to production ECS
2. Switch Route 53 DNS from Vercel → ALB (TTL 60s)
3. Monitor CloudWatch for errors for 30 minutes
4. Keep Vercel deployment live for 24h as fallback

### Phase 3: Decommission Vercel
1. Verify all health checks passing on AWS
2. Remove Vercel project after 7-day soak period
3. Update `NEXT_PUBLIC_APP_URL` to AWS domain
4. Update OAuth callback URLs (Google, Azure, Okta)

---

## Environment Variables in AWS

Replace `.env.local` with Secrets Manager. All secrets fetched by ECS at task start via IAM role.

IAM policy for ECS task role:
```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": ["arn:aws:secretsmanager:us-east-1:*:secret:byoc/production/*"]
}
```
