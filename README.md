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
  audit/
  common/
  main.ts
```
