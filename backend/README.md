# MediOS WhatsApp backend

First messaging slice using NestJS, TypeScript, PostgreSQL and Prisma. Dependencies are installed, Prisma client generation and TypeScript compilation pass, and all nine unit/HTTP checks pass. Database migration execution and live Meta integration remain unverified. See INTEGRATION.md for the frontend connection and teammate handoff.

## Implemented in source

- Authenticated, permission-gated, hospital/branch-scoped conversation and message APIs.
- Text replies queued atomically with an audit record and a durable database job.
- Stable request idempotency, bounded provider requests and explicit `submit_uncertain` states.
- Signed Meta webhook ingestion, inbound deduplication and delivery receipts.
- PostgreSQL worker claiming with `SKIP LOCKED`, safe rate-limit retries and conservative crash recovery.
- Paginated lists and DTO validation. Free-text replies require a recent inbound message (24 hours), checked both when queued and when sent.

## Setup when ready

Requires Node 22+ and PostgreSQL. From this directory:

```powershell
npm install
Copy-Item .env.example .env
# Fill .env locally. Never put Meta credentials in frontend VITE_* variables.
npm run db:generate
npm run db:migrate -- --name whatsapp_initial
npm run build
npm start
```

The build/start path uses TypeScript decorator metadata for Nest dependency injection. `npm run dev` watches and recompiles source; run `node --watch dist/main.js` in a second terminal after the first successful compilation.

Server binds to localhost:3001. Set up an HTTPS reverse proxy/tunnel for Meta callbacks. Configure callback `/api/webhooks/whatsapp`, subscribe to WhatsApp messages, use META_VERIFY_TOKEN for verification, and META_APP_SECRET for signed POST validation. Set WORKER_ENABLED=true only after configuring the business number mapping, supported Graph version and access token.

One configured business number maps to exactly one hospital/branch. Other business numbers are ignored. Multi-number per-tenant credential storage is not implemented. This restriction is intentional and must be replaced before serving multiple hospital numbers from one deployment.

## Authentication boundary

There is no registration/login endpoint and no default admin or token bypass. Integrate with the existing MediOS auth service. This slice expects HS256 JWTs signed with JWT_SECRET, matching JWT_ISSUER and JWT_AUDIENCE, containing exp, sub, hospitalId, branchId and permissions (string array). Confirm the real backend contract before connecting; replace the guard with its existing JwtAuthGuard/PermissionsGuard when merging. Refresh tokens and revocation remain the responsibility of that service.

## API contract

All staff requests require `Authorization: Bearer <access-token>`.

| Method/path (under /api) | Permission | Contract |
| --- | --- | --- |
| GET /whatsapp/conversations | whatsapp.inbox.view | ?offset=0&limit=30; returns {items,total,offset,limit} |
| GET /whatsapp/conversations/:id | whatsapp.inbox.view | Conversation metadata |
| GET /whatsapp/conversations/:id/messages | whatsapp.inbox.view | Paginated newest-first messages |
| POST /whatsapp/conversations/:id/messages | whatsapp.inbox.reply | {"text":"Hello"}; Idempotency-Key header required; returns queued Message |
| PATCH /whatsapp/conversations/:id/read | whatsapp.inbox.view | {"unreadCount":0} or 1 |
| PATCH /whatsapp/conversations/:id/status | whatsapp.inbox.resolve | {"status":"open"} or resolved |
| GET /webhooks/whatsapp | Meta verification token | Challenge response |
| POST /webhooks/whatsapp | Meta HMAC signature | Durable inbound messages and receipts |

Message fields: id, conversationId, outgoing, text, at, status, providerId, idempotencyKey. Treat `queued` as accepted for processing, not delivered. Poll message history for delivery changes. `submit_uncertain` requires provider reconciliation/manual investigation; there is deliberately no blind resend endpoint.

Conversation fields include phone/displayName, patientId (nullable), assignedTo (nullable), status, unreadCount, lastInboundAt and lastMessageAt. No patient is guessed from phone alone. The current frontend expects nested patient/context/messages data; it needs an adapter and unmatched-patient rendering before consuming these responses.

## Remaining integration work

- Existing MediOS patient resolution, staff membership/assignment and refresh-session integration. No duplicate Patient/User tables were invented here.
- Central login integration. An optional API inbox now supports an in-memory backend session, history pagination, delivery polling and uncertain-state display. Root VITE_WHATSAPP_MODE selects demo or api explicitly.
- Approved Meta templates, template sends outside the reply window, opt-in/opt-out, broadcasts and per-recipient campaign jobs.
- Guided booking, reminder/report/prescription automation via the existing domain services and event outbox. This slice queues its own messages transactionally; it does not yet consume the other backend's outbox.
- Media download/upload, audit querying/retention, webhook/auth rate limiting, deployment configuration and operational reconciliation.
- PostgreSQL integration verification. Initial migration SQL and a dependency lockfile are committed-ready; neither database execution nor live Meta sends have been performed.

Do not enable broadcasts/automation with patient data until consent/preferences and the existing domain service boundaries are integrated. Credentials, deployment readiness, live Meta connectivity and compatibility with the separate MediOS backend are not verified.
