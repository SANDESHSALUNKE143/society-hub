# SocietyHub documentation

Functional and technical specification for SocietyHub.

**How to read:** follow `00` → `12`. Product behavior is in the PRD; stack overview in Tech Stack; system design in Architecture; schemas in Database; **HTTP API** in [09-API](09-API.md). **Local run:** [08-Local-Development](08-Local-Development.md). **Pipelines:** [12-CICD](12-CICD.md). Agents treat this folder as source of truth ([prompts/cursor-system.md](prompts/cursor-system.md), root [AGENTS.md](../AGENTS.md)).

**Pilot:** Keshav Heights Society  
**Phase 1:** two responsive web apps — **`apps/client-app`** (residents) + **`apps/manage`** (admin) — working **Complaints** + auth/onboard, plus **Society & Resident Management 2.0** (directory, membership lifecycle, verification, documents, family, flat occupancy, invitations, society team — see [implementation/phase-1-domain](implementation/phase-1-domain.md)); other planned modules shown as **Coming soon**.  
**Phase 2:** implement Coming soon for real (billing, payments, notices, …) — see [PRD](02-PRD.md).  
**Native mobile:** Flutter in `apps/mobile/` — **Android on Play** (internal/closed, package `com.societyhub.societyhub_mobile`); **iOS Simulator locally** (bundle `com.societyhub.societyhubMobile`, App Store listing next). Web MVP unchanged. Preview URLs and run commands: root [README.md](../README.md).

## Document index

| Doc | Description |
|-----|-------------|
| [00-Vision](00-Vision.md) | Vision, principles, pilot, long-term direction |
| [01-BRD](01-BRD.md) | Business problem, stakeholders, metrics, scope |
| [02-PRD](02-PRD.md) | Roles, modules, flows, NFRs, Phase 1 vs Phase 2 |
| [03-Architecture](03-Architecture.md) | Modular monolith, tenancy, integrations |
| [04-Database](04-Database.md) | Tables, relationships, audit/tenancy columns |
| [05-Development-Plan](05-Development-Plan.md) | Epic-oriented delivery; GitHub backlog |
| [06-Coding-Standards](06-Coding-Standards.md) | TypeScript, modules, tests, commits |
| [07-Tech-Stack](07-Tech-Stack.md) | **Full tech stack explanation** (what & why) |
| [08-Local-Development](08-Local-Development.md) | **Install, MySQL Workbench, run API + web + manage locally** |
| [09-API](09-API.md) | **REST `/v1` developer guide** (auth, roles, inventory, examples — Fassport-style) |
| [10-Go-Live](10-Go-Live.md) | **Cheapest Workspace + Azure host + Google SSO + Play/App Store + CI/CD** |
| [11-Engineers-Bay-Workspace](11-Engineers-Bay-Workspace.md) | **Company domain live:** `engineersbay.in`, Base plan, mail setup status |
| [12-CICD](12-CICD.md) | **Current pipelines:** git flow, CI, Promote preview, Mobile AAB, Render, secrets |
| [Play CI/CD Drive note](SocietyHub-Play-CICD-GDrive-Note.txt) | **Operator cheat-sheet** for Play internal + GitHub secrets (copy to Drive; no keys) |
| [test-docs/](test-docs/README.md) | **Manual UAT pack:** demo society CSVs + closed tester list |
| [PRODUCT-SUMMARY](PRODUCT-SUMMARY.md) | What exists today, verified against the codebase |
| [implementation/phase-1-domain](implementation/phase-1-domain.md) | **Society & Resident Management domain** — user vs membership vs occupancy, lifecycle, verification, invitations |
| [implementation/phase-1-resident-management-assessment](implementation/phase-1-resident-management-assessment.md) | Pre-implementation survey of what already existed |
| [implementation/phase-1-deferred](implementation/phase-1-deferred.md) | What Phase 1 deliberately left for later, and known technical debt |
| [prompts/agents.md](prompts/agents.md) | Agent operating rules (docs mirror) |
| [prompts/skills.md](prompts/skills.md) | Index of Cursor skills per stack item |
| [prompts/cursor-system.md](prompts/cursor-system.md) | Short system prompt for codegen agents |

## Technical stack

See the dedicated guide: **[07-Tech-Stack.md](07-Tech-Stack.md)** (what we use, why, Phase 1 vs 2, local MySQL, Azure).

### Phase 1 summary

| Layer | Choice |
|-------|--------|
| Architecture | Modular monolith |
| Monorepo | Turborepo + Bun workspaces |
| API | Bun + TypeScript (strict) + Elysia + Zod |
| ORM / DB | Drizzle + MySQL 8 |
| Object storage | Azure Blob (images + videos) |
| Web | React + TypeScript + Vite + Tailwind (+ headless/Radix) |
| Auth | OTP via MSG91 + Google SSO + PIN |
| Speech | Browser Web Speech API (client-side) |
| Hosting | Render Hobby preview now; Azure Container Apps + Static Web Apps + MySQL after UAT (see `devops/`) |
| Tests (when implementing) | Vitest + Playwright |

**Phase 2 stack (when needed):** Redis + BullMQ, Resend, Firebase web push, Razorpay.

### Future

- iOS App Store (same Flutter project; after Android internal track)
- WhatsApp Business API notifications
- Microservices / Kubernetes
- Visitor, parking, clubhouse, vendor marketplace, AI assistant, builder edition

## Related repo artifacts

- Root [README.md](../README.md)
- Root [AGENTS.md](../AGENTS.md)
- Project skills: [`.cursor/skills/`](../.cursor/skills/)
- DevOps / Azure: [`devops/`](../devops/README.md)
- Mobile (Flutter Android): [`apps/mobile/`](../apps/mobile/README.md)
- Implementation backlog: GitHub Issues on this repository
