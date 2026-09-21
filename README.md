# MediOS backend

Empty NestJS API with Prisma and PostgreSQL. Domain modules are stubbed so the app boots now and features can be added later.

## Requirements

- Node.js 22+
- Docker Desktop (for PostgreSQL)

## Quick start

```bash
cd medios-backend
docker compose up -d postgres
npm install
npx prisma generate
npm run start:dev
```

PostgreSQL is published on host port **5433** so it does not collide with a local Postgres install on 5432.

Then open:

- http://localhost:3000
- http://localhost:3000/health

`/health` reports `database: "up"` once Postgres is ready.

## Docker (API + database)

```bash
docker compose up --build
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Run the API with watch mode |
| `npm run start:prod` | Run the compiled API |
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

### Real integrations currently available

| Feature | Real mode | Notes |
| --- | --- | --- |
| Gateway session auth | Yes | Requires sandbox/production client credentials |
| ABHA link-token request | Yes | Requires credentials + configured HIP ID |
| HFR registry search | Partial | Requires explicit `ABDM_HFR_SEARCH_URL` |
| ABHA callback | Partial | Optional `ABDM_CALLBACK_SECRET` header validation |

### Deferred / not implemented

- Full ABDM Consent Manager API (adapter returns 503 in real mode)
- Real HPR registry sync (503 in real mode)
- Real ABHA verify via gateway (400 in real mode)
- Production HFR/HPR registration workflows
- Care contexts, FHIR, health record exchange
- Callback JWT signature validation (deferred)

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
