# SocietyHub — Product & Technical Summary

> **Purpose of this document:** a self-contained briefing to paste into an LLM (Claude / ChatGPT) when planning new features or a scaling strategy. It describes what exists **today**, verified against the codebase — not the roadmap, and not aspirations.
>
> Sections 2 and 3 are written to be pasted **independently**. Each restates the shared context it needs.

---

## 0. Ready-to-paste prompt

> I'm planning the next phase of a multi-tenant SaaS product. Below is a factual summary of the current codebase. Please: (1) identify the highest-value feature gaps, (2) propose a prioritised roadmap with rough effort, (3) flag architectural changes needed to scale from 1 pilot society to 500+, and (4) call out risks in the current design. Ask me clarifying questions before recommending anything major.
>
> \[paste Section 1 + Section 2 and/or Section 3 + Section 4 below]

---

## 1. Shared foundation

**Product.** SocietyHub is a multi-tenant SaaS for housing societies (apartment complexes) in India. Currency is paise/₹, default timezone `Asia/Kolkata`. One pilot society is live in seed data ("Keshav Heights"). The business model is B2B2C: SocietyHub sells to a society; the society's committee and its residents are the end users.

**Two web products, one API:**

| Surface | Audience | Status |
|---|---|---|
| Client App | A society's own Admin (committee) and Residents | Broad and working |
| Manage | SocietyHub's own employees (platform back-office) | Core live + commercial (plans, flags, platform bills, support) |
| Mobile (Flutter) | Mirrors Client App for Android/iOS | List parity for bills/notices/ops; deep flows on web |

**Stack.**

- Monorepo: Turborepo + Bun workspaces (`bun@1.3.14`)
- API: Bun + Elysia + Zod, Drizzle ORM, MySQL 8, JWT bearer auth, versioned `/v1`, OpenAPI/Swagger at `/docs`
- Web: React 19, Vite 6, Tailwind 4, React Router 7
- Mobile: Flutter, Riverpod, go_router, dio
- Shared packages consumed by every client: `types` (DTO contract), `validation` (Zod schemas), `sdk` (typed API client with token refresh), `auth` (jose JWT, password/PIN hashing), `ui` (shared chrome)
- Hosting target: Azure Container Apps + Static Web Apps. Dockerfiles and compose exist; **nothing is provisioned yet** — the product has never been deployed.

**Data model.** 30 MySQL tables. Every tenant-owned row carries `tenant_id`; every table carries `created_at/by`, `updated_at/by`, and `is_deleted`. **Soft delete everywhere — no hard deletes.** Groups: society structure (societies → buildings → wings → flats), identity and membership (users, user_roles, residents, resident_profiles, resident_family_members, verification_documents, invitations), auth state (otp_challenges, password_reset_challenges, refresh_tokens), complaints (+ comments, status_events, attachments), billing (bills, bill_line_items, payments), comms (notices, notice_reads, notifications), audit_logs, and society ops (visitors, parking_slots, bookings, assets, vendors, events).

**Authentication.** Four methods: phone OTP, email/password, PIN, and Google SSO. A user may hold roles in **multiple societies** and picks a tenant after login (`/v1/auth/select-tenant`). Access + refresh token pair; refresh tokens are stored hashed.

**Roles** (enforced server-side):

- Platform: `superadmin`
- Society staff: `chairperson` (`admin` is a legacy alias), `secretary`, `treasurer`, `cashier`, `committee`
- Residents: `resident`, `tenant`

**Multi-tenancy model.** Shared database, shared schema, `tenant_id` column scoping. There is no per-tenant database, schema, or row-level security in the engine — isolation is enforced entirely in application code.

**Engineering standards.** Strict TypeScript, Zod at every boundary, repository pattern, conventional commits. Quality gate (`bun run quality`) enforces: no MUI/Material-UI imports, zero TS errors, zero build warnings, and **≥90% coverage** on both unit and integration suites. Cypress E2E exists for both web apps but mocks the API via `cy.intercept`, so it never exercises the real backend.

---

## 2. CLIENT APP — Society Admin & Resident

*(Self-contained. Context: multi-tenant SaaS for Indian housing societies; React 19 + Vite + Tailwind front end against a Bun/Elysia + MySQL API; roles are society staff — chairperson, secretary, treasurer, cashier, committee — plus resident/tenant.)*

### The dual-mode concept

One application serves both audiences via an **Admin ⇄ Resident toggle** persisted in `localStorage`. Admin mode is available to society staff and to platform superadmins. This exists because a chairperson is usually *also* a resident — the seed data deliberately gives the chairperson a flat so both modes work from one login. Navigation, dashboard statistics, and permissions all switch with the mode.

### Complaints — the deep, flagship module

This is the only module built to production depth:

- **Raise:** title, category, auto-attached flat, description, **voice-to-text via microphone**, photo/video attachments
- **Track:** status workflow `open → assigned → in_progress → resolved → closed`, threaded comments, full status-event history
- **SLA:** per-society configurable due window (`societies.sla_days`, default 3 days), computed due date per ticket
- **Queue transparency:** each open ticket shows its queue position and a human hint ("About 3 tickets ahead of yours")
- **Staff notification** fires when a resident raises a ticket
- Residents see only their own tickets; staff see the whole society

### Society & resident management (Phase 1 — the second deep module)

- **Resident directory** with server-side search (name / phone / email / flat), filters (building, wing, owner/tenant/family, lifecycle status, verification status), sorting and pagination
- **Membership lifecycle**: invited → pending verification → active → suspended / moved out / rejected, with server-enforced transitions and a full audit trail
- **Move-in / move-out that preserves history** — a move-out closes the occupancy period rather than overwriting it, so every flat keeps a readable tenancy timeline
- **Owner / tenant / family** with primary and co-owner distinctions; a flat can have several owners, an owner and a tenant at once, and a person can hold flats in several societies
- **Verification workflow** at both membership and document level, with rejection reasons shown back to the resident
- **Verification documents**: typed uploads (identity, address proof, tenant agreement, police verification), private tenant-scoped downloads, audited access
- **Family members** — household members who may have no SocietyHub login
- **Flat detail** with derived occupancy (vacant / owner occupied / tenant occupied), owners, tenants, occupants, vehicles and occupancy history
- **Occupancy dashboard**: flats total/occupied/vacant/owner/tenant, residents total/active/pending verification/moved out, pending invitations — each tile links into the matching filtered list
- **Invitations 2.0**: flat- and type-bound invites, 14-day expiry, resend, revoke, duplicate prevention, and a public accept flow that lands the invitee in *pending verification*
- **Society team management** by the society itself (add, change role, remove), guarded so the last chairperson cannot be removed
- **CSV import 2.0**: upload → parse → validate → **preview** → confirm → row-level result report; a file with invalid rows is refused whole unless partial import is explicitly chosen
- **Resident self-service**: profile, society, flat, family, documents, verification status and communication preferences
- Society structure editor: buildings → wings → flats, including floor, parking slot, and an extensible JSON attribute bag per flat

### Finance

- **Bills:** generate per period (`YYYY-MM`), line items, statuses `draft / issued / paid / void / corrected`
- **Payments:** pay against a bill, receipt retrieval, payment ledger
- Razorpay order creation and a webhook endpoint exist — see the caveat in Section 4

### Communication

- **Notices:** publish / unpublish, per-resident read tracking
- **Notifications:** in-app notification centre

### Society operations

Visitors (pre-register + check-in/out), parking assign/release, clubhouse bookings (request/confirm/conflict), assets, vendors, and events (RSVP + capacity). Real Admin + Resident workflows with pagination — not SimpleCrud.

### Also present

Audit log viewer; society settings (SLA + UPI details); account page with household/security + staff support tickets; PIN setup; society switcher; role- and mode-aware dashboard; feature-flag–aware nav.

### Honest maturity assessment

| Depth | Modules |
|---|---|
| Production-grade | Complaints, authentication, **society & resident management**, society structure |
| Demo-complete (Phase 2) | Bills, payments, notices, notifications, dashboard, audit, team, visitors–events |
| Manage commercial | Plans, subscriptions, discounts, flags, platform bills/payments, announcements, support, integrations health |

Note: earlier revisions described Phase-2 modules as Coming soon / SimpleCrud. **That is out of date.**

---

## 3. MANAGE — SocietyHub platform back-office

*(Self-contained. Context: multi-tenant SaaS for Indian housing societies; this is the vendor's internal portal, entirely separate from the app that societies use. Access is restricted to the `superadmin` platform role. React 19 + Vite + Tailwind against a Bun/Elysia + MySQL API.)*

### Purpose

Manage is where SocietyHub's own staff operate the platform: create tenant societies, administer users across every tenant, and audit platform activity. Day-to-day society administration deliberately does **not** live here — that belongs to the society's own Admin in the Client App.

### Live today

| Area | Capability |
|---|---|
| Dashboard | Platform overview, quick actions, roadmap tiles |
| Societies | Create societies, view and edit structure, seed a society's initial team |
| Users | Cross-tenant search and administration of platform employees and society members; invite, suspend, reset access |
| Audit log | Immutable trail of platform actions, plus a per-society activity timeline |

### Commercial layer (live — demo)

| Area | Capability |
|---|---|
| Feature flags | Per-society module allow-list JSON |
| Society settings | SLA days, active/suspended |
| Subscriptions | Assign Starter / Growth / Enterprise |
| Discounts | Percent or flat off |
| Platform bills / payments | Generate invoice; mark paid offline |
| Announcements | Broadcast to society staff (in-app notify) |
| Integrations | Read-only env health (no secrets in DB) |
| Support | Society staff tickets → Manage inbox |

Society maintenance `bills`/`payments` remain separate from platform invoices.

### The single most important fact for planning

The commercial layer now exists for **manual Super Admin** assignment (no self-serve signup, no Razorpay-for-platform). Usage metering / SMS quotas remain future.

---

## 4. Current constraints, gaps, and known risks

Facts relevant to any scaling or feature plan.

### Commercial

- Manual Super Admin plan assignment exists (no self-serve signup)
- Per-tenant feature flags exist; Client App nav hides disabled modules
- Usage metering / SMS quotas remain future
- Platform invoices are offline mark-paid (no Razorpay-for-platform yet)
- No self-service signup; societies are created manually by a platform employee

### Architecture & scale

- Modular monolith. Single MySQL instance, single API process. No read replicas, no sharding, no connection-pool tuning beyond defaults
- Tenant isolation is **application-enforced only** — a missing `tenant_id` predicate in any query is a cross-tenant data leak
- **No queue or background workers.** Redis + BullMQ are planned and stubbed in compose behind a `phase2` profile, but nothing consumes jobs
- **Notifications are database rows only.** No push, email, or SMS fan-out is wired — `notify.ts` inserts a row and a Phase-2 worker is expected to deliver it
- No caching layer
- **File uploads go to local disk** (`UPLOAD_DIR`), not blob storage. In a container these are ephemeral and lost on restart. Azure Blob is planned, not implemented
- No rate limiting on any endpoint
- Never deployed — no staging or production environment exists, so all performance characteristics are untested

### Integrations

- Email (Resend) and WhatsApp (Gupshup) are **stub adapters** that log and return success unless API keys are configured
- SMS OTP (MSG91) is planned; OTP currently works via a dev bypass that returns the code in the API response
- **The Razorpay webhook does not verify the signature header** — it accepts any well-formed payload. This is explicitly marked dev-only in the code and is a hard blocker for taking real money
- Google SSO falls back to accepting `dev:<phone>` tokens when no client ID is set

### Product

- No reporting, analytics, or data export
- Search is server-side and paginated on the resident, flat and invitation directories; other list views are still minimal
- No internationalisation; India-specific assumptions throughout (₹, IST, Indian phone formats)
- Mobile app is partial and lags the web client
- No resident self-service signup — all residents are onboarded by an admin, by CSV import, or via an invitation they accept

### Engineering

- Cypress E2E mocks the API, so no test exercises a real browser against a real backend
- The `bun run quality` gate is bash-only, awkward on Windows
- Documentation drift: `AGENTS.md` understates what the Client App actually implements

---

## 5. Quick reference

**Repository layout**

```
apps/api          Bun + Elysia + Drizzle/MySQL  (:3000, OpenAPI at /docs)
apps/client-app   Society Admin | Resident       (:5173)
apps/manage       Platform employees only        (:5174)
apps/mobile       Flutter client (in progress)
packages/         types · validation · sdk · auth · ui
devops/           Dockerfiles, compose, Azure guides, CI examples
docs/             Vision, BRD, PRD, Architecture, Database, API, Coding Standards
```

**API surface** — all under `/v1`, JWT bearer, errors shaped `{ code, message, details? }`:

`auth` · `complaints` · `societies` (+ buildings/wings/flats/structure/team) · `admin` (residents, CSV import, invites) · `invitations` · `bills` · `payments` · `notices` · `notifications` · `dashboard` · `audit` · `profile` · `media` · `visitors` · `parking` · `bookings` · `assets` · `vendors` · `events` · `manage/*` (societies, users, activity — platform only)
