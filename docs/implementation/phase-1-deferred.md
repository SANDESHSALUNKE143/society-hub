# Phase 1 — Deferred items

Things identified while building **Society & Resident Management 2.0** that are deliberately *not*
in Phase 1. Nothing here is a bug; each is either out of the stated scope or a later phase.

---

## 1. Explicitly out of scope for Phase 1 (from the brief)

| Area | Note |
|------|------|
| **Flutter / mobile** | `apps/mobile` was not touched. The `/v1` contracts added here are mobile-ready: `Paginated<T>`, plain JSON DTOs, bearer auth, no web-only assumptions. A mobile phase can consume `listResidents`, `getResident`, `getProfile` and the document routes unchanged. |
| Accounting, advanced finance | — |
| Vendor procurement | `vendors` remains the existing flat CRUD. |
| Guard application, advanced visitor management | `visitors` remains the existing flat CRUD. |
| Advanced parking workflows | `parking_slots` is **read** by resident/flat detail for the Vehicles tab; no parking module was built. |
| AI, analytics platform, marketplace | — |
| Subscription billing | The commercial layer is still entirely unbuilt (see `docs/PRODUCT-SUMMARY.md`). |
| Cloud deployment, Azure infrastructure, production Redis, microservices | — |
| External notification delivery (push / email / WhatsApp / SMS) | In-app notifications only. `resident_profiles.communication_prefs_json` and `notifications.kind`/`link_path` are shaped so a Phase 2 BullMQ worker can fan out without a migration. |

---

## 2. Discovered during implementation — worth a later phase

### Data model

- **`flats` uniqueness is society-wide, not per wing.** `UNIQUE(tenant_id, number)` means `A-101`
  and `B-101` collide unless the number itself is disambiguated. Changing it to
  `UNIQUE(tenant_id, wing_id, number)` is the right model but needs a data-migration plan for
  societies that already encoded the wing into the number. Left alone in Phase 1 to avoid
  destructive change.
- **Two vehicle stores.** `parking_slots.vehicle_number` (real CRUD) and
  `resident_profiles.vehicle_number` (a single free-text field on the profile). Phase 1 reads
  `parking_slots` for the Vehicles tabs and leaves the profile field for the resident's own note. A
  proper `resident_vehicles` table belongs with the parking module.
- **`residents` has no database-level foreign keys** (consistent with the rest of the schema, which
  relies on application-level integrity). Adding FKs across `residents → users/flats` would be a
  schema-wide decision, not a resident-management one.
- **Legacy `admin` role.** `user_roles.role` still allows `admin` as a deprecated alias of
  `chairperson`. Team management can display it but not assign it. Removing it needs a migration
  plus a sweep of `SOCIETY_STAFF_ROLES`.
- **`resident_profiles.emergency_contact`** is kept as a deprecated free-text column alongside the
  new structured `emergency_contact_name/relation/phone`. A later phase can backfill and drop it.

### Product

- **Resident self-service signup.** Everyone still arrives via admin onboarding, CSV or invitation.
- **Bulk lifecycle actions.** No multi-select "verify these 20 residents" on the directory.
- **Directory export.** No CSV/XLSX export of the resident list.
- **Document expiry alerts.** `verification_documents.expires_at` is stored and displayed but nothing
  watches it. A scheduled job that notifies on upcoming expiry is Phase 2 (needs the queue).
- **Family members with accounts.** `resident_family_members.linked_user_id` exists and is returned,
  but nothing writes it yet — there is no "invite this family member to create a login" flow.
- **Occupancy as of a date.** History is queryable per flat, but there is no "show me the society on
  2024-04-01" report. The row shape supports it.
- **Ownership transfer.** Selling a flat is currently modelled as move-out + move-in. A first-class
  transfer that links the two periods would read better in the history.

### Engineering

- **Two pre-existing integration failures.** `api.integration.test.ts` →
  *"bills pay path…"* and *"auth error paths…"* both assert `400` for a staff user **without** a
  flat, but `db/seed.ts` deliberately links the seeded chairperson (`9999999999`) to flat 101, so
  `claims.flatId` is set and the request succeeds with `200`. Verified failing at `HEAD` before any
  Phase 1 change. The fix is to give those two assertions a staff account that genuinely has no
  flat; left alone here because it is outside Phase 1 and changing the assertion could mask real
  behaviour.
- **`bun run test:unit` exits non-zero on coverage thresholds.** Also pre-existing and verified at
  `HEAD`. Totals are comfortably above 90% (94.08% funcs / 93.80% lines); the non-zero exit comes
  from per-file thresholds on files that unit tests do not reach — chiefly
  `apps/api/src/lib/audit.ts` (its query helpers are exercised by the integration suite instead).
- **`@types/bun` is not hoisted** by `bun install` with the isolated linker, so `tsc --noEmit` in
  `packages/{sdk,ui,validation}` cannot resolve `bun:test` on a cold clone. Adding `@types/bun` to
  those packages' `devDependencies` would fix it permanently.
- **CSV import is staged, not transactional.** The import validates the whole file first and refuses
  it outright when any row fails (unless `allowPartial`), so a bad upload cannot half-apply. It is
  not wrapped in a single SQL transaction — Drizzle + the per-row invite side effects make that
  awkward, and rows are individually idempotent. A true transactional import belongs with a
  background-job runner.
- **Cypress specs are intercept-mocked**, matching the existing suite's approach. Running the
  critical flows against a live API needs a seeded test database and a Cypress task to reset it.
