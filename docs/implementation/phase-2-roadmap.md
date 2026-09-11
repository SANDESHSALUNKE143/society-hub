# SocietyHub — capability audit and Phase 2 roadmap

**Status:** written 2026-09-09, verified against the working tree on `Rohan_Changes_Phase1`
**Scope:** **web + backend only** — `apps/api`, `apps/client-app`, `apps/manage`, `packages/*`. Mobile (`apps/mobile`) is out of scope, as it was for Phase 1; APIs stay mobile-ready for a later phase.
**Method:** every claim below was checked against source, not against the PRD. Where the docs and the code disagree, the code wins and the gap is listed.

This document has four parts:

- **[Part A](#part-a--what-exists-today)** — what exists today, graded by how finished it actually is
- **[Part B](#part-b--fix-first-existing-things-that-are-not-finished)** — existing things that need completing or correcting
- **[Part C](#part-c--platform-work-robustness-and-scale)** — cross-cutting platform work
- **[Part D](#part-d--new-capability-roadmap)** — new capability

---

## Part A — What exists today

Four tiers, by depth rather than by whether a screen renders.

### Tier 1 — Complete end-to-end

Real workflow, server-side authorization, audit trail, tests.

| Area | What works |
|---|---|
| **Auth** | OTP, password, PIN, Google SSO, refresh-token **rotation with revocation** (`auth/routes.ts:392-428`), multi-society membership switching, forgot/reset password |
| **Society & Resident Management** | Directory with server-side search/filter/sort/paging, membership lifecycle, verification, private documents, family members, derived flat occupancy, occupancy history, invitations with accept/resend/expiry, society team management, CSV preview→confirm import |
| **Complaints** | Raise, track, comments, attachments, status events, staff vs resident scoping, media serving |

### Tier 2 — Real but happy-path only

The primary path works. Edge cases, admin ergonomics and scale are missing.

| Area | Exists | Missing |
|---|---|---|
| **Bills** | generate, list, mine, detail, pay, delete | edit, partial payment, adjustments/credit notes, late fees, dues ageing, per-flat statement, generation preview |
| **Payments** | list, mine, record, mock, receipt, webhook | real gateway, signature verification, idempotency, refunds, reconciliation |
| **Notices** | create, publish, unpublish, read receipts, delete, **audience targeting (all / wing / flat)** | attachments, scheduling, pinning, owner-only and tenant-only audiences; targeting is filtered in JS after fetching all rows (`notices/routes.ts:59-61`) rather than in SQL |
| **Notifications** | list, mark one read | unread count, mark-all-read, pagination (hard `limit(100)`), preference enforcement |
| **Structure** | buildings/wings/flats CRUD | bulk import, per-wing flat uniqueness, floor metadata |
| **Audit log** | list with search | export, retention, entity deep-links |
| **Dashboard** | one `/stats` call | trends, time series, drill-down beyond occupancy |

### Tier 3 — Shells

These render, save a row and delete it. They are **not workflows**. All six are served by one 353-line module (`modules/misc/routes.ts`) exposing only `GET /`, `POST /`, `DELETE /:id` — no update, no state transitions, no pagination, no search, no filters.

| Module | The workflow that is missing |
|---|---|
| **Visitors** | `checkedInAt` / `checkedOutAt` columns exist with **no endpoints to set them**. No pre-approval, no gate pass, no resident approve/deny, no expected-vs-walk-in |
| **Parking** | No allocation to a resident or flat, no availability view, no conflict detection. Also doubles as the vehicle store — see [phase-1-deferred](phase-1-deferred.md) |
| **Bookings** | No approval, no conflict/double-booking detection, no calendar, no cancellation, no charges |
| **Assets** | No AMC schedule, no service history, no warranty expiry, no assignment |
| **Vendors** | No linkage to complaints, no ratings, no contracts, no payment history |
| **Events** | No RSVP, no capacity, no reminders |

On the client these six all render through the generic `SimpleCrudPage` component, which is honest about it — it shows *"This module's API isn't live yet"* on a 404 (`SimpleCrudPage.tsx:144-148`).

### Tier 4 — Not started

- **Manage app:** platform ops screens routed to `ComingSoonPage` (subscriptions, feature flags, plans)

*(Mobile is also largely stubbed — 13 of ~16 nav destinations — but is out of scope here.)*

---

## Part B — Fix first: existing things that are not finished

Ordered by severity. Items B1–B4 should be closed before any new feature work.

### B1 — 🔴 The Razorpay webhook is unauthenticated and unverified

`POST /v1/payments/razorpay/webhook` (`modules/payments/routes.ts`) takes `{ orderId, paymentId, status }`, and on `status: "success"` sets `payments.status = 'success'` **and `bills.status = 'paid'`**. The handler destructures only `{ body }` — it never calls `requireAuth`, and there is no signature check.

The code comment says production must verify the signature, but the route is mounted unconditionally in the live app graph (`app.ts:130`). Anyone who can reach the API and supply a valid `orderId` can mark bills paid, in any tenant.

**Fix:** verify `X-Razorpay-Signature` via HMAC-SHA256 against a webhook secret; reject unsigned requests; fail closed when the secret is unset rather than accepting the payload.

### B2 — 🔴 Secrets fall back to hardcoded defaults

`config.ts:6-7` defaults `jwtSecret` to the literal `"dev-change-me-society-hub-jwt-secret-32chars"`, and `databaseUrl` to a hardcoded local DSN with a real-looking password. A deployment that forgets to set `JWT_SECRET` starts successfully and signs tokens with a value that is public in this repository — every token becomes forgeable, silently.

**Fix:** keep the dev defaults only when `NODE_ENV !== 'production'`; otherwise fail fast at boot with a clear message. Same treatment for `DATABASE_URL`.

### B3 — 🟠 No rate limiting anywhere

There is no rate-limit middleware in `createApp()`. `POST /v1/auth/otp/request` is the sharpest edge — it is an SMS-cost amplifier and a user-enumeration oracle. Login, password-reset and the public invite-accept routes are equally open.

**Fix:** per-IP and per-identifier limits on all `/v1/auth/*` and `/v1/invites/*` routes, plus a global ceiling.

### B4 — 🟠 Payment settlement is a mock in the live path

`POST /v1/bills/:id/pay` inserts a payment with `status: "success"`, invents `order_dev_…` / `pay_dev_…` identifiers and marks the bill paid — no gateway involved. Correct for local dev, but it is the same code path production would run.

**Fix:** put it behind the same environment gate as B2, so a production build cannot settle a bill without the gateway.

### B5 — Notification plumbing is thinner than the model

Communication preferences are stored (`residentProfiles.communicationPrefsJson`, added in Phase 1) but nothing reads them when delivering. The list endpoint is capped at 100 rows with no paging, and there is no unread count — so the shell cannot show a badge without fetching everything.

### B6 — The six Tier-3 modules need real workflows

See the table in Tier 3. Each needs, at minimum: update endpoints, state transitions, server-side pagination/search matching the `Paginated<T>` convention already used by the resident directory, and cross-tenant negative tests.

### B7 — Unbounded list endpoints

Every route in `modules/misc/routes.ts` returns a bare array of all non-deleted rows for the tenant. Admin lists elsewhere were held to server-side pagination in Phase 1; these were not. They will degrade badly past a few hundred rows.

### B8 — Carried-over debt from Phase 1

Tracked in [phase-1-deferred.md](phase-1-deferred.md): society-wide rather than per-wing flat uniqueness; two competing vehicle stores; the legacy `admin` role; two pre-existing `api.integration.test.ts` failures caused by the seed linking the chairperson to flat 101.

### B9 — Demo data quality — ✅ done

The Docker MySQL holds integration-test residue (`Coverage Resident`, `cov-…@example.com`) inside the pilot society, and `seed.ts` creates exactly **one** flat, leaving the Phase 1 occupancy screens near-empty in a walkthrough.

Addressed by `bun run db:seed-demo` (`apps/api/src/db/seed-demo.ts`), which builds **Green Meadows Society** in its own tenant — 36 flats, mixed occupancy, 40 memberships across every lifecycle state, closed occupancy periods, invitations in each status. It never touches Keshav Heights, so the integration-test fixtures are unaffected. See [08-Local-Development §8b](../08-Local-Development.md).

---

## Part C — Platform work: robustness and scale

None of this is visible in the UI; all of it decides whether the product survives contact with more than one society.

### C1 — File storage does not survive a second replica

Documents and complaint attachments are written to local disk via `UPLOAD_DIR` (`config.ts:22`). Nothing in `apps/api` or `packages` imports an Azure Blob SDK — the storage abstraction the docs describe does not exist yet. Two API replicas would each hold half the uploads.

**Fix:** a `StorageAdapter` interface with local-disk and Blob implementations, selected by env — mirroring the pattern already used for `EmailAdapter` / `WhatsAppAdapter`.

### C2 — No background job runner

Redis is in `docker-compose.yml` under the `phase2` profile but nothing uses it. Consequences today:

- Invitation expiry is **lazy** — `expireStaleInvitations()` runs on read, so an invitation is only "expired" once someone looks
- `verificationDocuments.expiresAt` exists with no sweeper, so expiring documents raise no alert
- No SLA breach detection for complaints
- No scheduled bill generation
- No digest or reminder delivery

### C3 — Observability is `console.log`

No structured logging, no request/correlation IDs, no metrics, no tracing, no error reporting. Debugging a cross-tenant issue in production would mean reading raw stdout.

### C4 — Health checking is shallow

`GET /health` returns a static object. It never touches the database, so an API with a dead connection pool still reports healthy — and the compose healthcheck passes. Needs a real readiness probe separate from liveness.

### C5 — No graceful shutdown

`index.ts` calls `.listen()` and nothing else. No SIGTERM handler, no connection draining — in-flight requests are cut during any deploy or restart.

### C6 — Missing payment idempotency

No idempotency keys on payment creation. A retried request creates a duplicate payment row.

### C7 — Delivery adapters are stubs

Email and WhatsApp fall back to logging adapters when unconfigured (`lib/messaging/`). This was deliberate and correct for Phase 1 — noted here so it is not mistaken for working delivery.

### C8 — Test coverage is uneven

The cross-tenant negative tests added in Phase 1 cover residents and core routes. The Tier-3 modules have no equivalent. Every new tenant-owned route needs one, per `AGENTS.md`.

### C9 — Build hygiene

`.dockerignore` had to be moved to the repo root during this session — all three images build with `context: ../..`, and Docker only reads the file from the context root, so `devops/docker/.dockerignore` was never applied. Worth a look for similar config that is present but inert.

---

## Part D — New capability roadmap

Sequenced so each stage rests on the one before it.

### D1 — Finish the foundation *(prerequisite for everything)*

B1–B4, C1–C5. Nothing below is safe to build on an API with an open webhook, a default JWT secret and no job runner.

### D2 — Complete the Tier-3 modules into real workflows

| Module | Target |
|---|---|
| Visitors | Pre-approval, resident approve/deny, gate check-in/out, expected vs walk-in, visitor history per flat |
| Parking | Slot allocation to flat/resident, availability, visitor parking, violations |
| Bookings | Facility calendar, conflict detection, approval, charges, cancellation policy |
| Assets | AMC schedule, service history, warranty expiry alerts (needs C2) |
| Vendors | Complaint assignment, ratings, contracts, payment history |
| Events | RSVP, capacity, reminders |

### D3 — Finance, properly

Dues ageing, late-fee rules, partial payments, adjustments and credit notes, per-flat statements, collection reports, real gateway integration, reconciliation, refunds.

### D4 — Communication

Extend the existing notice targeting (all/wing/flat) with owner-only and tenant-only audiences, and push the filter into SQL. Add attachments, scheduling and pinning. Then delivery fan-out over C2 — email, WhatsApp, push — honouring the preferences already stored (B5).

### D5 — Complaints maturity

SLA timers and escalation, assignment to staff or vendor, category-driven routing, reopen, satisfaction rating, recurring-issue detection.

### D6 — Platform / multi-society *(manage app)*

The manage app's `ComingSoonPage` routes: subscription plans, feature flags per society, usage metering, society-level branding, platform-wide reporting.

### D7 — Analytics and intelligence

Collection trends, complaint heatmaps, occupancy trends, resident engagement. Deliberately last — it needs the clean, complete data that D2–D5 produce.

*(Mobile consumption of these APIs is a separate phase and is not sequenced here.)*

---

## Suggested order

1. **B1, B2, B3, B4** — security. Small, self-contained, and they are live defects rather than gaps.
2. **C1, C2** — storage adapter and job runner. Both unblock large parts of D2–D4.
3. **B9** — a realistic demo seed, so the Phase 1 work can actually be reviewed and demoed.
4. **C3, C4, C5** — observability and lifecycle, before real traffic exists.
5. **D2** — pick the two modules with the strongest pilot demand and take them to Tier 1 rather than advancing all six shallowly.
