# MediOS

Hospital operating system with separate frontend and backend applications in one repository.

```text
MediOS/
  frontend/          React + Vite app, assets and frontend environment files
    src/
    public/
    package.json
    vite.config.js
  backend/           NestJS WhatsApp API and PostgreSQL integration
    src/
    prisma/
    prisma.config.ts
    package.json
  package.json       Convenience commands; each app owns its dependencies/lockfile
```

## Frontend

```powershell
cd frontend
npm ci
npm run dev
```

From the repository root, `npm run dev`, `npm run build` and `npm run preview` forward to frontend. Put frontend environment variables in `frontend/.env.local`; see `frontend/.env.example`.

## Backend

```powershell
cd backend
npm ci
npm run db:generate
npm run build
```

Configure `backend/.env` using `backend/.env.example` before starting the API or running database commands. Prisma 7 reads its CLI connection URL from `backend/prisma.config.ts`; runtime connections use the PostgreSQL adapter. Node 22.12+ is required (Node 24 also supported).

See [backend setup](backend/README.md) and [WhatsApp integration handoff](backend/INTEGRATION.md) for PostgreSQL, Meta setup and remaining integration work. The frontend supports a demo mode and an optional API inbox; a working production WhatsApp integration has not yet been verified.
