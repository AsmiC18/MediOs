# WhatsApp integration handoff

## Current verified status

Backend dependencies installed, Prisma client generated and schema validated, TypeScript compilation passed, and all nine unit/HTTP checks passed. Frontend production builds passed in demo and API modes. Initial PostgreSQL migration SQL generated without connecting to a database. No PostgreSQL server, migrations against a server, Meta credentials or live message exchanges have been verified. Run `npm test` in backend to reproduce the checks; database calls in these tests are substituted, so they do not establish PostgreSQL correctness.

The frontend has two explicitly separated modes. `VITE_WHATSAPP_MODE=demo` uses the existing local prototype. `api` uses the new real HTTP inbox; templates/broadcast routes are unavailable in this mode, including direct URL access. No automatic fallback to demo data occurs after API failures.

## Local development once PostgreSQL is available

1. Install Docker Desktop or supply an existing PostgreSQL database. Docker is not installed by this work.
2. In `backend/.env`, set POSTGRES_PASSWORD and the matching DATABASE_URL. Use a development database, not a production database.
3. With Docker available, run `docker compose up -d postgres` from backend. This creates a persistent named database volume.
4. Run `npx prisma migrate deploy`, `npm run build`, then `npm start` from backend.
5. For local verification only, set ALLOW_DEV_TOKEN=true and set WHATSAPP_HOSPITAL_ID and WHATSAPP_BRANCH_ID to development scope IDs. Run `npm run dev:token` and copy the short-lived token privately.
6. Set the root `.env.local` to VITE_WHATSAPP_MODE=api and VITE_API_BASE_URL=http://localhost:3001/api, then restart Vite (`npm run dev`).
7. Open `/staff/whatsapp/inbox` and connect the token. The existing mock login does not issue backend tokens. Empty conversations are expected until a valid signed inbound webhook arrives.

## Meta configuration still required

Obtain access to the team's Meta developer app and WhatsApp test number. Set META_APP_SECRET, META_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and a supported META_GRAPH_VERSION in backend/.env. Do not paste secrets into chat, source code, frontend environment variables, screenshots or Git.

Expose the localhost API via an HTTPS tunnel/reverse proxy. Use `https://YOUR_HOST/api/webhooks/whatsapp` as the callback and subscribe to the messages field. The backend verifies the GET challenge token and POST signature against the original raw body.

First send a message from an authorized test recipient to the test business number. Confirm it appears in the inbox. Set WORKER_ENABLED=true and restart the backend to send a reply. A queued API response means only that the database accepted the job. Check delivered/read status separately. Text replies outside the customer-service window are rejected; approved template sending is still pending.

## Merge with teammate's backend

Do not apply these standalone migrations unchanged to their database. Review and merge the models into their Prisma schema, then generate a migration against their schema/history. Reuse their Prisma provider and existing job system instead of running duplicate infrastructure.

Replace StaffGuard with the established identity/permissions guards. This temporary contract uses exp/sub/hospitalId/branchId/permissions and HS256 with configured issuer/audience; their actual contract has not been verified. The frontend token form is a developer bridge, not a replacement for real login, refresh and logout integration.

Connect patient resolution through the existing hospital-scoped Patient service. Keep unmatched conversations unmatched until that service confirms a unique patient. Staff assignment must validate branch membership through the existing Staff service; no assignment endpoint was invented without that model.

Connect reminders, lab notifications, prescriptions and guided booking to existing domain services and the transactional outbox. Do not write appointment/patient tables from webhook handlers. Replace the one-number environment mapping with their tenant-owned business-number/secret configuration for multiple hospitals.

## Remaining work

- Full database and HTTP integration verification against PostgreSQL.
- Meta end-to-end verification and malformed/oversized webhook/load testing.
- Central login/refresh/session revocation and backend-owned permissions.
- Staff assignment, patient linking, media handling, approved templates and consent-aware campaigns.
- Provider reconciliation for submit_uncertain; uncertain jobs never resend automatically.
- Durable rate limiting, retention policy, audit export and production monitoring.
- Indexed/bounded delivery-reconciliation processing before large workloads; the initial worker reconciles stored receipts each cycle.

Only the messaging slice is implemented. Templates, broadcasts, booking automation and other MediOS domain modules remain pending. No real patient data, external credentials or live sends were used during this work.
