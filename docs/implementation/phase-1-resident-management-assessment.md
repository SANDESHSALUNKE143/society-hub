# Phase 1 — Society & Resident Management 2.0: Repository Assessment

**Status:** Slice 1 (assessment) complete
**Scope:** Web (`apps/client-app`, `apps/manage`) + backend (`apps/api`) + shared packages.
**Out of scope:** `apps/mobile` (Flutter). No Flutter file is touched in this phase.

---

## 1. Summary matrix

| Domain | Existing | Partial | Missing | Recommendation |
|--------|:--------:|:-------:|:-------:|----------------|
| Users | ✅ | | | Reuse `users` as-is. Global identity; no `tenant_id`. No change needed. |
| Residents | | ⚠️ | | `residents` exists but is a flat *pointer*, not a membership: `(tenant_id, user_id, flat_id, is_owner)` with `UNIQUE(tenant_id, user_id)`. **Extend it** into the membership/occupancy record. Do not create a parallel `resident_memberships` table. |
| Resident Profiles | | ⚠️ | | `resident_profiles` holds only `emergency_contact` (a free-text string) + `vehicle_number`. Extend with structured emergency contact + communication preferences. |
| Membership | | | ❌ | No lifecycle status, no move-in/move-out dates, no history. Add to `residents`. |
| Flats | ✅ | | | `flats(tenant_id, wing_id, number, floor, parking_slot, details_json)`, `UNIQUE(tenant_id, number)`. Reuse. Occupancy must be **derived**, not stored. |
| Buildings | ✅ | | | `buildings(tenant_id, name)`. Reuse. |
| Wings | ✅ | | | `wings(tenant_id, building_id, name)`. Reuse. |
| Family | | | ❌ | Nothing exists. New table required — household members may have **no** `users` row, so `residents.user_id NOT NULL` cannot represent them. |
| Documents | | ⚠️ | | `verification_documents` table exists (`file_name`, `blob_path`, `content_type`) but has **no API, no UI, no type, no status**. Extend the existing table; do **not** add `resident_documents` (that name appears in `docs/04-Database.md` only, never in code). |
| Verification | | | ❌ | No status, verifier, verified date, or rejection reason anywhere. Add to `residents` (membership-level) and `verification_documents` (document-level). |
| Invitations | | ⚠️ | | Create + list + revoke exist. **No accept endpoint at all** — `findPendingInvitationByToken()` is exported from `apps/api/src/modules/invitations/routes.ts:139` and never called outside a test. No expiry, no resend, no duplicate prevention, no flat/type on the invite. |
| Team | | ⚠️ | | Read-only. `GET /v1/team` and `GET /v1/admin/team` list staff. Adding a member is **platform-only** (`POST /v1/manage/societies/:id/team`). Society admins cannot manage their own team. No role change, remove, suspend, reactivate. |
| Vehicles | | ⚠️ | | Two competing stores: `parking_slots.vehicle_number` (has full CRUD at `/v1/parking`) and `resident_profiles.vehicle_number` (single string). Reuse `parking_slots` for display on resident/flat detail; do not build a parking module. |
| Notifications | ✅ | | | `notifications` table + `notifyUser()` helper + `/v1/notifications`. Reuse. Currently only complaints emit notifications. |
| Audit | ✅ | | | `audit_logs` + `recordAudit()`/`recordActivity()` + `ActivityType` constants. Indexed on `(entity_type, entity_id)`. Reuse — extend `ActivityType`, do not build a second system. |

---

## 2. Existing tables (`apps/api/src/db/schema.ts`)

All tables share: `id CHAR(36)` PK, `created_at/created_by/updated_at/updated_by`, `is_deleted`. Tenant-owned tables add `tenant_id CHAR(36)`.

### Identity & membership

| Table | Columns of interest | Indexes |
|-------|---------------------|---------|
| `societies` | `name, address, city, pincode, timezone, sla_days, billing_defaults` | PK only. **`societies.id` is the `tenant_id`.** |
| `users` | `phone, email, name, username, password_hash, google_sub, pin_hash, pin_updated_at` | unique on `phone`, `email`, `username`. **No `tenant_id`** — global identity. |
| `user_roles` | `tenant_id, user_id, role` | idx `(tenant_id, user_id)`; unique `(tenant_id, user_id, role)` |
| `residents` | `tenant_id, user_id, flat_id, is_owner` | idx `(tenant_id)`; **unique `(tenant_id, user_id)`** |
| `resident_profiles` | `tenant_id, user_id, emergency_contact, vehicle_number` | unique `(tenant_id, user_id)` |
| `verification_documents` | `tenant_id, resident_id, file_name, blob_path, content_type` | idx `(resident_id)` |
| `invitations` | `tenant_id, email, phone, role, token, status(pending/accepted/revoked), invited_by` | idx `(tenant_id)`; unique `(token)` |

### Structure

`buildings(tenant_id, name)` → `wings(tenant_id, building_id, name)` → `flats(tenant_id, wing_id, number, floor, parking_slot, details_json)`.
`flats` has `UNIQUE(tenant_id, number)` — note this is society-wide, **not** per wing, so `A-101` and `B-101` collide unless the number itself is disambiguated.

### Supporting

`notifications(tenant_id, user_id, title, body, kind, read_at, link_path)`,
`audit_logs(tenant_id, actor_user_id, action, message, entity_type, entity_id, meta)`,
`parking_slots(tenant_id, flat_id, slot_number, vehicle_number, type)`,
plus complaints/bills/payments/notices/visitors/bookings/assets/vendors/events.

### Relationships as implemented

```text
societies (tenant)
   └── buildings ── wings ── flats
                               └── residents (tenant_id, user_id, flat_id, is_owner)
                                       ├── user_roles (tenant_id, user_id, role)
                                       ├── resident_profiles (tenant_id, user_id)
                                       └── verification_documents (resident_id)   [orphan: no code path]
users ─────────────────────────────────────┘  (global; many societies via user_roles)
```

---

## 3. Existing APIs (`/v1`)

Registered in `apps/api/src/app.ts`.

| Area | Endpoints | Notes |
|------|-----------|-------|
| Auth | `POST /v1/auth/otp/request\|otp/verify\|pin\|pin/login\|password/login\|password/forgot\|password/reset\|password/change\|google\|refresh\|logout\|select-tenant`, `GET /v1/auth/me\|memberships`, `PATCH /v1/auth/profile` | `authPlugin` derives `auth: AccessClaims \| null` from the bearer token. |
| Admin | `GET /v1/admin/flats\|structure\|team`, `POST /v1/admin/invites\|residents\|residents/import` | **No resident list, no resident detail, no resident mutations.** |
| Team | `GET /v1/team` | Read-only. |
| Societies | `GET/POST /v1/societies`, `GET /v1/societies/:id`, `DELETE /v1/societies/:id`, `GET/POST /v1/societies/:id/buildings`, `GET/POST /v1/buildings/:id/wings`, `DELETE /v1/buildings/:id`, `GET/POST /v1/wings/:id/flats`, `DELETE /v1/wings/:id`, `DELETE /v1/flats/:id` | **No `GET /v1/flats/:id`.** |
| Invitations | `GET /v1/invitations`, `POST /v1/invitations`, `POST /v1/invitations/:id/revoke` | No accept, no resend, no expiry. |
| Profile | `GET /v1/profile`, `PATCH /v1/profile` | Returns emergency contact, vehicle number, society name, one flat. |
| Manage (platform) | `POST /v1/manage/societies/:id/team`, `GET /v1/manage/users`, `GET /v1/manage/users/:id`, `GET /v1/manage/users/:id/activity`, `GET /v1/manage/activity` | superadmin only. |
| Dashboard | `GET /v1/dashboard/stats` | Complaints, dues, bookings, notices, unread. **No occupancy metrics.** |
| Complaints / Bills / Payments / Notices / Notifications / Audit / Misc | as listed in `docs/09-API.md` | |

### Conventions to follow

- **Pagination:** `listQuerySchema` in `@society-hub/validation` → `?page&limit&mine`, response `Paginated<T> = { items, page, limit, total }`. Used by `/v1/complaints`, `/v1/bills`, `/v1/payments`. Everything else returns bare arrays.
- **Errors:** `AppError(status, code, message, details?)`; Zod errors mapped to `400 validation_error` in `app.ts`.
- **Authorization:** role-predicate helpers in `apps/api/src/lib/auth-helpers.ts` — `requireAuth`, `requireRole`, `requireSocietyStaff`, `requirePlatform`, plus `assertTenantAccess(claims, tenantId)` in `lib/tenant-scope.ts`. There is **no permission-constant system**; extend the role helpers rather than introducing a second mechanism (per §23 of the brief).
- **Soft delete:** `softDelete(table, id, actorUserId)` in `lib/soft-delete.ts`; every read adds `eq(table.isDeleted, false)`.
- **Audit:** `recordAudit()` (awaited) / `recordActivity()` (fire-and-forget) with `ActivityType` string constants.

---

## 4. Existing web pages

### `apps/client-app` (residents + society admin, two modes via `AppModeProvider`)

`Dashboard, Complaints (+new/detail), Bills, Payments, Notices, Notifications, Visitors, Parking, Bookings, Onboard, Invites, Team, Audit, Structure, Assets, Vendors, Events, Account, Login/Forgot/Reset/SetPin/SelectSociety`.

Admin nav sections live in `apps/client-app/src/components/Shell.tsx` (`adminSections` / `residentSections`). Mode gating is client-side only (`canUseAdminMode(user.role)` in `app-mode.tsx`); the server enforces separately via `requireSocietyStaff`.

Relevant today:
- **`OnboardPage.tsx`** — single-resident form + CSV import. CSV is parsed **client-side** (`lib/resident-csv.ts`), mapped, then POSTed whole to `/v1/admin/residents/import`. There is **no preview/confirm step**; upload immediately imports.
- **`InvitesPage.tsx`** — create + list. No revoke button in the UI even though the API supports it. No resend.
- **`TeamPage.tsx`** — list only.
- **`AccountPage.tsx`** — self-service emergency contact + vehicle number, read-only flat card.
- **`StructurePage.tsx`** — buildings → wings → flats CRUD.
- **No residents directory, no resident detail, no flat detail page.**

### `apps/manage` (platform)

`Societies, SocietyDetail, Users, UserDetail, Dashboard, Team, Invites, Audit` + `ComingSoonPage` for unbuilt modules (`manage-nav.ts` marks routes `live` vs `soon`). Phase 1 needs no new Manage pages; society-level resident management belongs in `client-app` Admin mode.

### Shared components

`packages/ui` exports only `ShPage, ShPageHeader, ShSection, ShField, ShFormGrid, ShStack, ShSplit` + complaint label helpers. Design tokens are CSS variables (`--leaf`, `--sand`, `--mist`, `--danger`, …) with utility classes `card`, `input`, `label`, `btn`, `badge`, `empty-state` in `packages/ui/src/styles.css`. **No table, pagination, filter-bar, modal, or confirm-dialog primitive exists** — each page hand-rolls its own table markup.

---

## 5. Existing tests

| Kind | Location | Notes |
|------|----------|-------|
| Unit | `packages/{auth,validation,sdk,ui}/src/*.test.ts`, `apps/api/src/lib/*.test.ts`, `apps/api/src/config.test.ts` | Run by `bun run test:unit --coverage`. |
| Integration | `apps/api/src/api.integration.test.ts` (2063 lines) | Boots the Elysia app **in-process** on a random port, hits a **real MySQL**, uses `DEV_AUTH=true` (OTP `123456`). Coverage-gated ≥90%. |
| Web unit | `apps/{client-app,manage}/src/smoke.test.ts`, `app-mode.test.ts`, `manage-nav.test.ts`, `lib/resident-csv.test.ts` | |
| E2E | `apps/client-app/cypress/e2e/{account,complaint-flow,complaints,login,navigate,onboard,select-society,staff-navigate}.cy.ts`; `apps/manage/cypress/e2e/{login,navigate}.cy.ts` | |
| **Tenant isolation** | — | **Missing.** No negative cross-tenant test exists. |
| **Authorization** | partial | Some 403 assertions in the integration suite; no systematic matrix. |

Quality gate (`scripts/quality-gates.sh`): no MUI imports → `tsc --noEmit` across the workspace → `turbo build` with **zero warnings tolerated** → unit coverage ≥90% → integration coverage ≥90%.

---

## 6. Gaps that Phase 1 must close

1. **`residents` cannot express a lifecycle.** No status, no dates, no history. `UNIQUE(tenant_id, user_id)` makes "moved from A-101 to B-204" destructive — the old row is mutated in place (`onboard-resident.ts:141-156`).
2. **No resident directory API or page.** Nothing lists residents at all.
3. **`verification_documents` is dead schema.** No route, no DTO, no SDK method, no page.
4. **Invitations cannot be accepted.** The token is generated, emailed (`lib/messaging/invite-delivery.ts`), and there is no endpoint that consumes it.
5. **No family members.**
6. **No occupancy view.** Flat → who lives there is not answerable without scanning `/v1/admin/structure` plus a residents query that does not exist.
7. **Society admins cannot manage their own team** (platform-only endpoint).
8. **CSV import has no preview and is not transactional** — it loops row-by-row, writing as it goes; a mid-file failure leaves partial data.
9. **No cross-tenant negative tests.**
10. **No notifications for any resident/invitation/verification event.**

## 7. Potential schema duplication to avoid

| Tempting new table | Existing structure to reuse instead |
|--------------------|-------------------------------------|
| `resident_memberships` | **`residents`** — already `(tenant_id, user_id, flat_id, is_owner)`. Extend it. |
| `resident_documents` | **`verification_documents`** — extend with type/status/verifier. |
| `resident_verification_events` | **`audit_logs`** — already indexed on `(entity_type, entity_id)`; serve the resident Activity tab from it. |
| `occupancy_history` | **`residents`** rows themselves — a move-out closes a row (sets `move_out_date`, `status='moved_out'`) and a move-in inserts a new one. History is the row set. |
| `resident_vehicles` | **`parking_slots`** — already has `flat_id` + `vehicle_number` + CRUD. |
| `resident_status` lookup table | MySQL `ENUM`, matching the existing style (`complaints.status`, `bills.status`). |

Genuinely new tables required: **`resident_family_members`** only (household members have no `users` row, so no existing table can hold them).

---

## 8. Decisions taken into Slice 2

1. `residents` becomes the **membership + occupancy** record. `UNIQUE(tenant_id, user_id)` is dropped and replaced with a MySQL-compatible partial-uniqueness trick: a nullable `active_key CHAR(1)` set to `'Y'` while the membership is occupying and `NULL` otherwise, with `UNIQUE(tenant_id, user_id, flat_id, active_key)`. MySQL permits repeated `NULL`s, so historical rows are unconstrained while at most one *active* membership exists per person per flat per society.
2. Lifecycle status reuses the brief's vocabulary (`invited`, `pending_verification`, `active`, `suspended`, `moved_out`, `rejected`) because no equivalent exists today.
3. `is_owner` is **kept** (existing code and the CSV contract read it) and paired with a richer `resident_type` enum. `is_owner` is maintained as a derived mirror of `resident_type = 'owner'` so nothing existing breaks.
4. Occupancy status of a flat (`vacant` / `owner_occupied` / `tenant_occupied`) is **derived** at query time from active memberships — never stored.
5. Authorization extends the existing role-predicate helpers. No parallel permission-constant system.
6. Audit extends `ActivityType`; notifications extend `notifyUser()`.

Deferred discoveries are recorded in [phase-1-deferred.md](phase-1-deferred.md).
