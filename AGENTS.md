# AGENTS.md — SocietyHub

Instructions for AI coding agents working in this repository.

## Mission

Build SocietyHub per the Spec. **Docs are source of truth.** Never invent business requirements.

## Read first

1. [docs/README.md](docs/README.md)
2. [docs/08-Local-Development.md](docs/08-Local-Development.md) — how to run locally (MySQL Workbench / Bun)
3. [docs/02-PRD.md](docs/02-PRD.md) — product behavior
4. [docs/07-Tech-Stack.md](docs/07-Tech-Stack.md) — tech stack (what & why)
5. [docs/03-Architecture.md](docs/03-Architecture.md) — system design
6. [docs/04-Database.md](docs/04-Database.md) — data model
7. [docs/06-Coding-Standards.md](docs/06-Coding-Standards.md)
8. [docs/prompts/cursor-system.md](docs/prompts/cursor-system.md)
9. Skills index: [docs/prompts/skills.md](docs/prompts/skills.md)

## Hard rules

- **MVP clients = two simple responsive React web apps** (phone browser + desktop): `apps/client-app` (residents) and `apps/manage` (Admin / Super Admin). Keep UI/UX simple: few screens, one primary action, no clutter.
- **Native mobile (in progress):** Flutter Client App under `apps/mobile/` — mirrors client-app UX; bulk CSV stays on web. Use `.cursor/skills/societyhub-flutter-future`.
- **Product (Phase 1 + Phase 2 demo):** **Complaints**, **Society & Resident Management**, plus Client App **Bills / Payments / Notices / Notifications / Dashboard / Audit** and society ops (**Visitors, Parking, Bookings, Assets, Vendors, Events**). Manage commercial layer (plans, flags, platform invoices, support) is in scope per [docs/02-PRD.md](docs/02-PRD.md). Do not invent modules outside the Spec.
- **Residents:** `residents` is the **membership + occupancy period**, not a flat pointer. Move-out closes a row; move-in inserts a new one; **never overwrite or delete occupancy history**. `active_key IS NOT NULL` is the one predicate for "currently occupies". Flat occupancy is **derived**, never stored.
- **Multi-tenant:** every query and blob path scoped by `tenant_id`. A resource in another society must return **404**, not a partial read. Add a negative cross-tenant test for every new tenant-owned route.
- **RBAC:** enforce Admin vs Resident on the server (MVP). Extend the role predicates in `apps/api/src/lib/auth-helpers.ts` — do **not** add a second authorization mechanism.
- **Audit & notifications:** reuse `recordAudit`/`ActivityType` and `notifyUser`. Never put document content or full document numbers in `audit_logs`.
- **Admin lists:** server-side pagination, search and filters (`Paginated<T>` = `{ items, page, limit, total }`). Never fetch everything and filter in React.
- **Deploy:** follow [`devops/PIPELINE.md`](devops/PIPELINE.md). Features PR into **`staging`**. Preview is **`main` → Render**. Promote with Actions → **Promote preview**. Azure later. Do **not** provision Azure production until Phase 1 UAT.
- Prefer updating Spec + GitHub issue over guessing product behavior.
- Conventional commits; strict TypeScript; Zod at boundaries; repository pattern.

## When to use which skill

| Task | Skill folder |
|------|----------------|
| Bun runtime / workspaces | `.cursor/skills/societyhub-bun-typescript` |
| Elysia routes / API | `.cursor/skills/societyhub-elysia` |
| Schema / migrations / repos | `.cursor/skills/societyhub-drizzle-mysql` |
| Web UI (resident + manage) | `.cursor/skills/societyhub-react-vite-tailwind` — shared chrome in `packages/ui` (`@society-hub/ui`) |
| Monorepo layout / pipelines | `.cursor/skills/societyhub-turborepo` |
| New domain module boundaries | `.cursor/skills/societyhub-modular-monolith` |
| Queues / SLA jobs | `.cursor/skills/societyhub-redis-bullmq` |
| Files / Azure deploy / devops | `.cursor/skills/societyhub-azure-blob-hosting` |
| SMS OTP | `.cursor/skills/societyhub-msg91-otp` |
| Transactional email | `.cursor/skills/societyhub-resend-email` |
| Web push | `.cursor/skills/societyhub-firebase-notifications` |
| Payments / webhooks | `.cursor/skills/societyhub-razorpay-payments` |
| Native mobile Android (Play now) + iOS later | `.cursor/skills/societyhub-flutter-future` |

## Out of scope unless Spec updated

WhatsApp inbound complaint bot, marketplace, AI assistant, builder edition, staff attendance, CCTV, Razorpay live checkout, Redis/BullMQ SLA jobs, email/push fan-out beyond in-app. Flutter Client App is under active build in `apps/mobile/` (bulk CSV and Manage stay web-only).
