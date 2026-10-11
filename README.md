# MediOS backend

NestJS REST API for hospital operations with Prisma, PostgreSQL, JWT authentication, RBAC, and domain modules across patients, scheduling, billing, clinical, pharmacy, insurance, ABDM, and more.

## Requirements

- Node.js 22+
- Docker Desktop (for PostgreSQL)

## Quick start

```bash
cd medios-backend
docker compose up -d postgres
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Demo login after seed: `admin@test.com` / `MediOS@12345` with hospital code `DEMO`.

PostgreSQL is published on host port **5433** so it does not collide with a local Postgres install on 5432.

Then open:

- http://localhost:3000
- http://localhost:3000/health

`/health` reports `database: "up"` once Postgres is ready.

## Docker (full stack)

One image runs both the API and the background worker (different commands). The scheduler runs **inside the API process only**.

1. Set Postgres password for Compose substitution (project-root `.env`, not committed):

   ```bash
   echo POSTGRES_PASSWORD=your-local-postgres-password >> .env
   ```

2. Copy Docker application env (API + worker):

   ```bash
   cp .env.docker.example .env.docker
   # Edit .env.docker — JWT_SECRET (32+ chars), CORS_ORIGINS, ABDM_CALLBACK_SECRET,
   # and integration keys if mock modes are false (required in NODE_ENV=production).
   ```

3. Build and start Postgres, API, and worker:

   ```bash
   docker compose build
   docker compose up -d
   ```

4. Apply migrations **once** (from host or a one-off container):

   ```bash
   npx prisma migrate deploy
   ```

5. Verify `GET http://localhost:3000/health` → `database: "up"`.

## Production operations

### Architecture

```text
PostgreSQL
    ├── API container     → HTTP + job scheduler (leader lock in Postgres)
    └── Worker container  → claims and runs background jobs
```

Same Docker image; API runs `node dist/src/main.js`, worker runs `node dist/src/worker.js`.

### Startup order

1. PostgreSQL (healthy via `pg_isready`)
2. Database migrations (`npx prisma migrate deploy`) — not run automatically on API boot
3. API container
4. Worker container (depends on Postgres only, not on API)

### Build and start

```bash
docker compose build
docker compose up -d
```

### Verify API

```bash
curl -s http://localhost:3000/health
```

Expect JSON with `"database": "up"` when Postgres is reachable.

Docker also marks the API healthy when `GET /health` succeeds.

### Verify scheduler (API logs)

Look for structured log events:

- `scheduler_started`
- `scheduler_tick` with `"leaderAcquired": true` (one leader when multiple API replicas share Postgres)

Non-leaders log `"leaderAcquired": false`, `"outcome": "skipped"`.

### Verify worker (worker logs)

- `worker_started` on boot
- `job_executed` with `"outcome": "completed"` or `"failed"` as jobs run

The worker does **not** expose HTTP. Liveness is the running process plus these logs.

**Note:** The worker process does not call `validateProductionConfig()` (API does). Compose should still supply the same `.env.docker` so job handlers can reach Razorpay, Postgres, and configured notification email providers.

### Stuck jobs

Jobs stuck in `RUNNING` with an old `lockedAt` (older than `JOB_WORKER_STALE_LEASE_MS`, default 5 minutes) are reset to `PENDING` by the worker stale-lease recovery. Inspect the `Job` table in PostgreSQL.

### DEAD jobs

Rows with `status = DEAD` include `lastError`. There is no admin replay API; investigate and re-enqueue manually only with idempotency in mind.

### Restart

```bash
docker compose restart api worker
```

Prefer `docker compose down` / `up -d` for image updates. Send SIGTERM (Compose default) so the worker can drain in-flight jobs.

### Migrations

```bash
npx prisma migrate deploy
```

Run after Postgres is up and before or after API/worker start; do not rely on automatic migration on every API container start.

### Data residency, backups, and privacy retention (J4)

MediOS does **not** enforce cloud region or backup policy in application code. Production operators must define **deployment and infrastructure** controls, including:

- Application and worker compute in an **India-region** footprint appropriate to your DPDP and contractual obligations
- **PostgreSQL** hosted in India with **encryption at rest** on primary storage
- **Encrypted backups**, documented **backup retention**, periodic **restore testing**, and a written **disaster recovery** plan
- Explicit **cross-region replication** policy (allowed destinations, encryption in transit, key custody)
- Vendor **data residency** requirements for WhatsApp, Razorpay, ABDM gateway, and any observability tools

Optional **privacy retention** purges (disabled by default) remove aged **audit logs**, terminal **WhatsApp messages**, and terminal **notifications** only. They do **not** delete patients, clinical records, invoices, payments, or ABDM consent. Enable only with explicit env configuration:

- `PRIVACY_RETENTION_ENABLED=true`
- `JOB_PRIVACY_RETENTION_SCHEDULER_ENABLED=true`
- `JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED=true` (patient CRM at-risk; one `patient.at_risk.evaluate` job per hospital per UTC day)
- `JOB_ATTENDANCE_MONTHLY_SUMMARY_SCHEDULER_ENABLED=true` (payroll-ready attendance aggregation; one `attendance.monthly.summary` job per hospital per completed UTC month)

**Staff attendance → consultation billing (A2):** configure a hospital-level consultation fee before automatic draft invoices are created from doctor clock-in events (`PATCH /billing/config/consultation-fee`, requires `billing:manage`). Fields are stored on `Hospital`: `consultationFeeUnitPrice`, optional `consultationFeeHsnSac`, and `consultationFeeGstRate` (defaults to `0`). If the fee is missing or zero, the billing worker fails permanently (no zero-value line). Link staff users to doctor resources via `PATCH /scheduling/resources/:id` with `userId` (DOCTOR resources only). Consultation events use `staff.attendance.consultation` (not WhatsApp); dedupe key on invoice lines is `staff.attendance.consultation:{appointmentId}`.

- `PRIVACY_RETENTION_AUDIT_LOG_DAYS`, `PRIVACY_RETENTION_WHATSAPP_MESSAGE_DAYS`, `PRIVACY_RETENTION_NOTIFICATION_DAYS` (positive integers; validated in production)
- `PRIVACY_RETENTION_BATCH_SIZE` (bounded delete batch per job run)

### Notification email durability

Patient/staff notification **email** and **in-app** delivery run inside the durable `notification.dispatch` job (outbox → job → channel adapter). Outbox rows with `channel: 'whatsapp'` use the same job but are **not** sent to Meta—they are marked **SKIPPED** when policy allows delivery (`channel_not_configured`). That job provides retries, idempotency keys, and terminal `FAILED` or `SKIPPED` notification rows. There is no second email-only queue in this repository.

**Internal vs external:** this repository implements **internal retention enforcement** (configurable cutoffs, durable `privacy.retention.purge` jobs, tenant isolation, audit). Which retention periods satisfy DPDP, clinical norms, or finance law for your organisation is an **external legal/operational policy** decision—the env day counts above are operator-configured, not legal advice.

### Rate limiting (J3)

Login, refresh, registration, and webhook ingress rate limits use **PostgreSQL-backed counters** (`RateLimitBucket` table) so multiple API replicas share the same limits. Apply migrations that include `RateLimitBucket` before relying on limits in production.

- **Login:** failed attempts per client IP + normalized email (`LOGIN_RATE_LIMIT_*`).
- **Refresh:** all refresh attempts per IP + SHA-256 hash prefix (`REFRESH_RATE_LIMIT_*`). Plaintext refresh tokens are never stored in rate-limit keys.
- **Registration:** attempts per IP + target `hospitalId` (`REGISTRATION_RATE_LIMIT_*`).
- **Webhooks:** ingress per provider + IP (`WEBHOOK_RATE_LIMIT_*`) on Razorpay and ABDM callback routes. Signature/secret verification still runs after the limit check. WhatsApp webhooks are not registered on the staff API (Phase B).

HTTP **429** responses from rate limiting include a **`Retry-After`** header (seconds until the bucket resets).

**Trusted proxy:** set `TRUST_PROXY=true` only when the API sits behind a reverse proxy that strips untrusted `X-Forwarded-For` and sets the client IP correctly. With `TRUST_PROXY=false` (default), only the direct connection IP is used so clients cannot spoof forwarded headers.

**Edge/WAF:** application rate limits do not replace API-gateway or WAF volumetric protection for general authenticated API traffic or large-scale DDoS.

Staff **HTTP** routes for manual WhatsApp send/list and `/webhooks/whatsapp` are removed (Phase B). Legacy in-process WhatsApp send services were removed in Phase D1; notification outbox rows may still use `channel: 'whatsapp'` and are skipped at dispatch when policy allows delivery (`channel_not_configured`). Database tables for historical WhatsApp messages remain until a later migration phase.

### Seed

`npm run prisma:seed` creates demo data and permissions. **Do not run seed blindly in production** unless you intend to create or update demo admin credentials.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Run the API with watch mode |
| `npm run start:prod` | Run the compiled API (`dist/src/main.js`) |
| `npm run start:worker` | Run the background job worker (`dist/src/worker.js`) |
| `npx prisma generate` | Generate the Prisma client |
| `npx prisma migrate dev` | Create/apply migrations (when models exist) |

## Layout

```
src/
  auth/
  users/
  patients/
  scheduling/
  billing/
  abdm/
  audit/
  common/
  main.ts
```

## ABDM (Week 5)

The `src/abdm/` module provides a local ABDM foundation with tenant isolation, RBAC, audit logging, and mock-first external adapters.

### Mock mode (default)

`ABDM_MOCK_MODE=true` (or unset in sandbox) keeps all ABDM external calls local and deterministic. This is the safe default for development and tests.

In production (`ABDM_ENV=production`), mock mode is **off by default** unless `ABDM_MOCK_MODE=true` is explicitly set.

Production startup (`NODE_ENV=production`, `ABDM_MOCK_MODE=false`) requires:

- `ABDM_CALLBACK_SECRET` (additional shared-secret ingress control; not a substitute for JWT verification)
- `ABDM_CALLBACK_JWT_PUBLIC_KEY` and/or `ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS=true` (RS256 verification of `Authorization: Bearer` gateway JWT on HIP callbacks)
- Sandbox client credentials (`ABDM_SANDBOX_CLIENT_ID` / `ABDM_SANDBOX_CLIENT_SECRET`) when `ABDM_ENV` is not `production`
- Production client credentials (`ABDM_PRODUCTION_CLIENT_ID` / `ABDM_PRODUCTION_CLIENT_SECRET`) when `ABDM_ENV=production`

The API **and worker** both run the same production configuration validation.

**Consent Manager:** not implemented for real mode. With `ABDM_MOCK_MODE=false`, creating `REQUESTED` consents or PATCH transitions that imply an external CM grant/deny/revoke are rejected. Internal `DRAFT` records, list/read, and expiry jobs still work. This is not full ABDM regulatory compliance.

### Real integrations currently available

| Feature | Real mode | Notes |
| --- | --- | --- |
| Gateway session auth | Yes | Requires sandbox/production client credentials |
| ABHA link-token request | Yes | Requires credentials + configured HIP ID |
| HFR registry search | Partial | Requires explicit `ABDM_HFR_SEARCH_URL` |
| ABHA callback | Partial | JWT signature verification (real mode) + optional `ABDM_CALLBACK_SECRET` |

### Deferred / not implemented

- Full ABDM Consent Manager API (adapter returns 503 in real mode)
- Real HPR registry sync (503 in real mode)
- Real ABHA verify via gateway (400 in real mode)
- Production HFR/HPR registration workflows
- Care contexts, FHIR, health record exchange
- Official ABDM callback claim/schema hardening beyond configured RS256 + optional iss/aud (operator must align PEM/certs with live gateway)

### Permissions

- `abdm:read` / `abdm:manage` — hospital config, HFR/HPR, ABHA
- `abdm:consent:read` / `abdm:consent:manage` — consent lifecycle

All ABDM queries are scoped by JWT `hospitalId`. Client-supplied hospital IDs are never trusted.

### Environment variables

See `.env.example` for all `ABDM_*` settings. Do not commit real credentials.

### Tests

```bash
npm run build
node scripts/test-abdm.cjs
```

Requires the API running on port 3000 and a seeded database.
