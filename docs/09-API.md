# SocietyHub API — full developer guide (single document)

Use this as one standalone reference for the SocietyHub REST API (`/v1`). Replace `YOUR_API_HOST` with your environment API base (no path), e.g. `http://localhost:3000` or `https://api.societyhub.example.com`.

**Related:** [Local Development](08-Local-Development.md) · [Architecture](03-Architecture.md) · Live OpenAPI: `{YOUR_API_HOST}/docs`

---

## 1. Base URL, versioning, auth

| Item | Value |
|------|--------|
| API base | `YOUR_API_HOST` |
| Version prefix | `/v1` on all business routes |
| Health | `GET /health` (no auth) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Content type | `application/json` (except multipart file uploads) |

**JWT (access token)** claims used by the API:

| Claim | Meaning |
|-------|---------|
| `sub` | User id |
| `role` | Active role in the current tenant context |
| `tenantId` | Active society id (`societies.id`) |
| `flatId` | Linked flat id when the user is a resident (nullable for staff) |

**Token issuance**

| Flow | Endpoint | Who |
|------|----------|-----|
| Phone OTP | `POST /v1/auth/otp/request` → `POST /v1/auth/otp/verify` | Residents + society staff with phone |
| Email/password | `POST /v1/auth/password/login` | Platform `superadmin` (+ any user with password) |
| Google (dev) | `POST /v1/auth/google` with `idToken: "dev:<phone>"` when `DEV_AUTH=true` | Local/dev only |
| PIN | `POST /v1/auth/pin` then `POST /v1/auth/pin/login` | Returning mobile-style login |
| Refresh | `POST /v1/auth/refresh` with `refreshToken` | Rotate access token |
| Switch society | `POST /v1/auth/select-tenant` | Multi-membership users / platform |

Successful auth responses return:

```json
{
  "user": { "id": "...", "role": "resident", "tenantId": "...", "flatId": "...", "name": "...", "email": null, "phone": "8888888888" },
  "tokens": { "accessToken": "<jwt>", "refreshToken": "<jwt>" },
  "memberships": [{ "tenantId": "...", "role": "resident", "societyName": "Keshav Heights" }]
}
```

(`memberships` may be omitted on some paths; use `GET /v1/auth/memberships` when needed.)

---

## 2. Response and error shape

SocietyHub does **not** wrap successes in `{ data, error }`. Successful handlers return the DTO (object or array) directly.

**Error body** (all failures):

```json
{
  "code": "forbidden",
  "message": "Society staff role required",
  "details": null
}
```

| HTTP | Typical `code` | Meaning |
|------|----------------|---------|
| 400 | `validation_error` | Zod boundary failure; `details` is Zod `flatten()` |
| 400 | domain codes (`otp_invalid`, `already_paid`, `flat_required`, …) | Business rule |
| 401 | `unauthorized` / `invalid_credentials` / `invalid_refresh` | Missing/bad token or credentials |
| 403 | `forbidden` / `not_onboarded` / `not_a_member` | Authenticated but not allowed |
| 404 | `not_found` / `*_not_found` | Missing resource (or hidden as 404 for tenants) |
| 500 | `internal_error` | Unexpected server error |

**Pagination** (list endpoints that use `listQuerySchema`):

```
GET /v1/complaints?page=1&limit=20
```

```json
{
  "items": [ /* DTOs */ ],
  "page": 1,
  "limit": 20,
  "total": 42
}
```

---

## 3. Interactive API documentation (OpenAPI)

On your API host:

| Surface | Path |
|---------|------|
| Swagger UI | `{YOUR_API_HOST}/docs` |
| OpenAPI JSON | `{YOUR_API_HOST}/docs/json` |

Use Swagger for live schemas. This Markdown guide is the **narrative + inventory** source of truth for integrators (web, manage, future mobile / SDK).

---

## 4. Portals, roles, and who may call what

| Portal | Host (local) | Who | JWT roles |
|--------|--------------|-----|-----------|
| **Manage** | `manage.localhost:5174` | SocietyHub platform employees | `superadmin` only. Live: Dashboard, Societies, **Users** (directory + activity), **Audit log**. Roadmap (Coming soon): Feature flags, Society settings, Subscriptions, Discounts, Generate bills, Payments, Announcements, Integrations, Support |
| **Client App — Admin mode** | `app.localhost:5173` | Society day-to-day staff **and** Manage platform team | `chairperson`, `secretary`, `treasurer`, `cashier`, `committee` (`admin` = legacy alias of chairperson), **`superadmin`** |
| **Client App — Resident mode** | `app.localhost:5173` | Flat residents / tenants | `resident`, `tenant` |

**Rules**

1. Platform users manage societies and **add people to a society team** via Manage (`POST /v1/manage/societies/:id/team`).
2. Manage platform employees (`superadmin`) may also sign in to the **Client App** and use **Admin mode** on any society by default (same Client Admin APIs as society staff).
3. Society staff use **Client App Admin** for bills, notices, complaints triage, structure, etc.
4. Residents use **Client App Resident** for their flat’s complaints, dues, notices, profile, visitors/bookings.
5. Cross-tenant access is denied (`403 forbidden`) unless the caller is `superadmin` (platform routes / Client Admin across societies) or has membership in that society.

Allowed role enum values:

- `superadmin`, `chairperson`, `admin`, `secretary`, `treasurer`, `cashier`, `committee`, `resident`, `tenant`

---

## 5. End-to-end flows

### A. Platform: create a society and add chairperson to the team

1. `POST /v1/auth/password/login` as `superadmin@societyhub.local`
2. `POST /v1/societies` — create society (+ optional chairperson fields)
3. `POST /v1/manage/societies/{societyId}/team` — ensure a SocietyHub user is on the society staff team
4. Chairperson signs in via OTP / password and uses Client App Admin

`POST /v1/societies` body example:

```json
{
  "name": "Keshav Heights",
  "city": "Pune",
  "address": "Baner Road",
  "pincode": "411045",
  "chairpersonName": "Asha Patil",
  "chairpersonEmail": "asha@example.com",
  "chairpersonPhone": "9999999999"
}
```

Save `id` as `societyId` / `tenantId`.

### B. Society staff: structure (building → wing → flat)

1. OTP login as chairperson
2. `POST /v1/societies/{tenantId}/buildings` → `buildingId`
3. `POST /v1/buildings/{buildingId}/wings` → `wingId`
4. `POST /v1/wings/{wingId}/flats` → `flatId`
5. Or read tree: `GET /v1/admin/structure`

### C. Onboard a resident and raise a complaint

1. Staff: `POST /v1/admin/residents` with `name`, `phone`, `email`, `flatId`
2. Resident: OTP verify with that phone
3. `POST /v1/complaints` (resident uses linked flat; staff must pass `flatId`)
4. Staff: `PATCH /v1/complaints/{id}/status`, `POST /v1/complaints/{id}/comments`
5. Optional: `POST /v1/complaints/{id}/attachments` (`multipart/form-data`, field `file`)

Complaint types: `electric`, `plumbing`, `housekeeping`, `security`, `lift`, `other`  
Statuses: `open`, `assigned`, `in_progress`, `resolved`, `closed`

### C2. Invite → accept → verify (resident lifecycle)

1. Staff: `POST /v1/invitations` `{ "email": "…", "role": "resident", "flatId": "…", "residentType": "tenant" }`
   → `pending`, expires in 14 days. In `DEV_AUTH` the response carries `devToken`.
2. Invitee (unauthenticated): `GET /v1/invites/{token}` to preview, then
   `POST /v1/invites/accept` `{ "token": "…", "name": "…", "phone": "…" }`
3. The membership is created as **`pending_verification`** — accepting does not self-approve.
4. Resident: `POST /v1/profile/documents` (`multipart`, `file` + `docType`) → membership moves to
   `under_review`
5. Staff: `GET /v1/admin/residents?verificationStatus=under_review`, then
   `POST /v1/admin/residents/{id}/verify` (or `/reject` with a `reason`)
6. Resident: `GET /v1/profile` shows `membership.verificationStatus: "approved"` — or the rejection
   reason verbatim

### C3. Move a resident out (history is preserved)

1. Staff: `POST /v1/admin/residents/{id}/move-out` `{ "moveOutDate": "2025-05-31", "reason": "…" }`
2. The membership becomes `moved_out`; it disappears from `GET /v1/admin/flats/{flatId}/residents`
   but remains in `GET /v1/admin/flats/{flatId}/history` and in
   `GET /v1/admin/residents?status=moved_out`
3. Re-onboarding the same person creates a **new** membership; both periods stay visible

Resident types: `owner`, `tenant`, `family`  
Membership statuses: `invited`, `pending_verification`, `active`, `suspended`, `moved_out`, `rejected`  
Verification statuses: `pending`, `under_review`, `approved`, `rejected`

### D. Billing and payment

1. Staff: `POST /v1/bills/generate` with `{ "periodYm": "2026-07", "amountPaise": 500000 }`
2. Resident: `GET /v1/bills/mine`
3. Pay (dev mock): `POST /v1/payments/mock` `{ "billId": "..." }` **or** `POST /v1/bills/{id}/pay`
4. Offline cash: staff `POST /v1/payments` with `method: "cash"|"cheque"|"neft"`
5. Receipt: `GET /v1/payments/{id}/receipt`
6. Void: staff `DELETE /v1/bills/{id}`

Amounts are always **integer paise** (₹1 = 100).

### E. Notices and in-app notifications

1. Staff: `POST /v1/notices` → `POST /v1/notices/{id}/publish`
2. Resident: `GET /v1/notices` → `POST /v1/notices/{id}/read`
3. Payment/notice side-effects may create rows readable via `GET /v1/notifications`
4. Mark read: `POST /v1/notifications/{id}/read`

Audience enum: `all`, `wing`, `flat`

### F. Dev credentials (local seed)

| Actor | How |
|-------|-----|
| Platform (Manage + Client Admin) | `superadmin@societyhub.local` / `Test@1234` |
| Chairperson | phone `9999999999`, OTP `123456` when `DEV_AUTH=true` |
| Resident | phone `8888888888`, OTP `123456` when `DEV_AUTH=true` |

---

## 6. Full endpoint inventory

Auth required unless noted. **Staff** = society staff roles. **Platform** = `superadmin`. **Resident** = resident/tenant (and often staff can also call read paths).

### 6.1 Health

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | No | `{ ok, service }` |

### 6.2 Auth — `/v1/auth`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/otp/request` | No | `{ phone }` → optional `devCode` |
| POST | `/otp/verify` | No | `{ phone, code }` → tokens |
| POST | `/google` | No | Dev: `{ idToken: "dev:<phone>" }` |
| POST | `/password/login` | No | `{ email, password }` |
| POST | `/password/forgot` | No | `{ email }` → optional `devCode` |
| POST | `/password/reset` | No | `{ email, code, newPassword }` |
| POST | `/password/change` | Yes | `{ currentPassword, newPassword }` |
| POST | `/pin` | Yes | `{ pin }` 4–6 digits |
| POST | `/pin/login` | No | `{ phone, pin }` |
| POST | `/refresh` | No | `{ refreshToken }` |
| POST | `/logout` | Yes | `{ refreshToken }` revokes refresh |
| GET | `/me` | Yes | Current user DTO |
| GET | `/memberships` | Yes | Societies the user can enter |
| POST | `/select-tenant` | Yes | `{ tenantId }` → new tokens |
| PATCH | `/profile` | Yes | Alias of profile upsert (SDK) |

### 6.3 Profile (resident self-service) — `/v1/profile`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Yes | Full `ResidentProfileDto`: identity, society, flat, **membership** (status, verification, rejection reason, move-in/out), family, documents, communication preferences |
| PATCH | `/` | Yes | Partial upsert. Accepts `name`, structured emergency contact, `vehicleNumber`, `communicationPreferences`. **Cannot** change flat, resident type, membership status or verification — those require an Admin. |
| POST | `/documents` | Yes | `multipart` field `file` + `docType`, `documentNumber?`, `expiresAt?`. Image or PDF, ≤10 MB. |
| GET | `/documents/:id/file` | Yes | Streams the caller's **own** document. Another resident gets `403`; another society gets `404`. |

### 6.4 Manage (platform) — `/v1/manage/societies`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/:id/team` | Platform | Add/update society staff membership |

Body: `{ email? , phone?, name?, role }` — email **or** phone required. Role defaults to `chairperson`.

### 6.5 Societies & structure

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/societies` | Platform | List societies |
| POST | `/v1/societies` | Platform | Create society |
| GET | `/v1/societies/:id` | Staff/platform | Society DTO |
| DELETE | `/v1/societies/:id` | Platform | Soft-delete |
| GET | `/v1/societies/:id/buildings` | Staff | List buildings |
| POST | `/v1/societies/:id/buildings` | Staff | `{ name }` |
| GET | `/v1/buildings/:id/wings` | Staff | |
| POST | `/v1/buildings/:id/wings` | Staff | `{ name }` |
| DELETE | `/v1/buildings/:id` | Staff | Soft-delete |
| GET | `/v1/wings/:id/flats` | Staff | |
| POST | `/v1/wings/:id/flats` | Staff | `{ number }` |
| DELETE | `/v1/wings/:id` | Staff | Soft-delete |
| DELETE | `/v1/flats/:id` | Staff | Soft-delete |

### 6.6 Admin helpers — `/v1/admin`, `/v1/team`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/admin/flats` | Staff | Flat picker — all flats with floor + parking |
| GET | `/v1/admin/structure` | Staff | Nested buildings→wings→flats |
| GET | `/v1/admin/team` | Staff | Society team |
| POST | `/v1/admin/invites` | Staff | Same as invitations create |
| POST | `/v1/admin/residents/import/preview` | Staff | **Dry run** — validates rows against the live structure and reports per-row `action` (`create`/`update`/`unchanged`/`skip`), errors and warnings. Writes nothing. |
| POST | `/v1/admin/residents/import` | Staff | Applies the import. Rejects the **whole file** when any row is invalid unless `allowPartial: true`. |

### 6.6a Residents — `/v1/admin/residents`

All staff-only and tenant-scoped: a resident in another society returns `404`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | **Server-side** directory. Query: `page`, `limit` (≤100), `search` (name/phone/email/flat), `buildingId`, `wingId`, `flatId`, `residentType`, `status`, `verificationStatus`, `sort` (`name`\|`flat`\|`createdAt`\|`status`), `order`. Returns `Paginated<ResidentSummaryDto>`. |
| POST | `/` | Onboard/move a resident in. `{ name, phone, email, flatId, residentType?, isPrimary?, moveInDate?, remarks? }`. If the person already occupies a *different* flat, that period is closed first. |
| GET | `/:id` | `ResidentDetailDto` — membership, flat, roles, emergency contact, family, documents, vehicles, other memberships |
| PATCH | `/:id` | `{ name?, phone?, email?, residentType?, isPrimary?, moveInDate?, remarks? }` |
| POST | `/:id/verify` | Approve verification → `active` |
| POST | `/:id/reject` | `{ reason }` (required, ≥3 chars) → `rejected`; the reason is shown to the resident |
| POST | `/:id/suspend` | `{ reason? }` |
| POST | `/:id/reactivate` | Back to `active` |
| POST | `/:id/move-out` | `{ moveOutDate?, reason?, remarks? }` — closes the period; **history is preserved** |
| GET | `/:id/activity` | Audit trail for this membership |
| GET/POST | `/:id/family` | List / add household members |
| PATCH/DELETE | `/:id/family/:familyId` | Edit / soft-delete a household member |
| GET/POST | `/:id/documents` | List / upload verification documents (`multipart` `file` + `docType`) |

Illegal lifecycle moves (e.g. suspending an already-suspended resident, reviving a moved-out one)
return **409 `invalid_transition`**.

### 6.6b Documents — `/v1/admin/resident-documents`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/:id/verify` | Approve |
| POST | `/:id/reject` | `{ reason }` — notifies the resident |
| DELETE | `/:id` | Soft-delete |
| GET | `/:id/file` | Streams the file. Staff only, tenant-checked, **audited**, `Cache-Control: private, no-store`. Accepts `?access_token=` for browser `<a>`/`<img>` (same pattern as `/v1/media`). |

Blob paths are never returned to clients.

### 6.6c Flats & occupancy — `/v1/admin/flats`, `/v1/admin/occupancy`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/admin/flats/:id` | `FlatDetailDto` — derived `occupancyStatus`, primary owner, co-owners, tenants, current occupants, vehicles, document count |
| GET | `/v1/admin/flats/:id/residents` | Current occupants only |
| GET | `/v1/admin/flats/:id/history` | Every occupancy period, newest first |
| GET | `/v1/admin/occupancy/stats` | `OccupancyStatsDto` — flats total/occupied/vacant/owner/tenant, residents total/active/pending-verification/moved-out, pending invitations |
| GET | `/v1/admin/occupancy/flats` | Paginated flat directory. Query: `page`, `limit`, `search`, `buildingId`, `wingId`, `occupancy` (`vacant`\|`owner_occupied`\|`tenant_occupied`) |

Occupancy is **derived from live memberships**, never stored on the flat.

### 6.6d Society team — `/v1/team`

Society-scoped, distinct from the platform-only `/v1/manage/societies/:id/team`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Society staff list |
| POST | `/members` | `{ userId? \| email? \| phone?, name?, role }` — reuses a matching account when one exists |
| PATCH | `/members/:userId/role` | `{ fromRole, toRole }` |
| DELETE | `/members/:userId/roles/:role` | Removes one staff role |

Removing the last chairperson returns **409 `last_chairperson`**.

### 6.7 Invitations — `/v1/invitations` (staff) and `/v1/invites` (public)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/invitations` | Staff | `Paginated<InvitationDto>`. Query: `page`, `limit`, `search`, `status`, `role`. Expired pending rows are flipped lazily on read. |
| POST | `/v1/invitations` | Staff | `{ name?, email?, phone?, role, flatId?, residentType?, expiresInDays?, channels? }`. Email **or** phone required. |
| POST | `/v1/invitations/:id/resend` | Staff | Re-sends and extends the window; `pending`/`expired` only |
| POST | `/v1/invitations/:id/revoke` | Staff | `revoked`; frees the slot so a replacement can be sent at once |
| GET | `/v1/invites/:token` | **None** | Public preview: society, role, flat, expiry. The token is the credential. |
| POST | `/v1/invites/accept` | **None** | `{ token, name?, phone?, email? }`. Single use. Creates/reuses the user, grants the role, and — when the invite names a flat — opens a `pending_verification` membership. |

A second **active** invitation for the same recipient and role returns **409 `invitation_exists`**;
an expired token returns **410 `invite_expired`**.

When `DEV_AUTH=true`, create responses include `devToken` so testers can accept without delivery.

### 6.8 Complaints & media

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/complaints` | Yes | Staff: all; resident: own |
| GET | `/v1/complaints/:id` | Yes | |
| POST | `/v1/complaints` | Resident/staff | Staff needs `flatId` if no linked flat |
| PATCH | `/v1/complaints/:id/status` | Staff | |
| GET | `/v1/complaints/:id/comments` | Yes | |
| POST | `/v1/complaints/:id/comments` | Yes | `{ body }` |
| DELETE | `/v1/complaints/:id` | Staff | Soft-delete |
| POST | `/v1/complaints/:id/attachments` | Yes | `multipart` field `file` (image≤10MB, video≤50MB) |
| GET | `/v1/media/:id` | Yes | Bearer **or** `?access_token=` |

### 6.9 Bills — `/v1/bills`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Staff | Paginated |
| GET | `/mine` | Yes | Resident flat bills |
| POST | `/generate` | Staff | `{ periodYm, amountPaise, notes?, flatIds? }` |
| GET | `/:id` | Yes | Own flat or staff |
| POST | `/:id/pay` | Yes | Dev instant Razorpay settlement + notification |
| DELETE | `/:id` | Staff | Void / corrected |

### 6.10 Payments — `/v1/payments`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Staff | Paginated |
| GET | `/mine` | Yes | |
| POST | `/` | Staff | Offline record |
| POST | `/mock` | Yes | Dev pay by `billId` |
| GET | `/:id/receipt` | Yes | |
| POST | `/razorpay/webhook` | No* | Dev mock; production must verify signature |

\*Webhook is unauthenticated in local/dev mock form. Production must verify Razorpay signature before trusting the body.

Payment methods: `razorpay`, `cash`, `cheque`, `neft`

### 6.11 Notices — `/v1/notices`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Yes | Residents see published |
| POST | `/` | Staff | |
| PATCH | `/:id` | Staff | |
| POST | `/:id/publish` | Staff | |
| POST | `/:id/unpublish` | Staff | |
| POST | `/:id/read` | Yes | Mark read for caller |
| DELETE | `/:id` | Staff | Soft-delete |

### 6.12 Notifications, dashboard, audit

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/notifications` | Yes | In-app inbox |
| POST | `/v1/notifications/:id/read` | Yes | Idempotent |
| GET | `/v1/dashboard/stats` | Yes | Counts scoped by role. Staff (without `?mine=1`) additionally get `occupancy: OccupancyStatsDto`; in Resident mode `occupancy` is `null`. |
| GET | `/v1/audit` | Staff | Alias |
| GET | `/v1/audit-logs` | Staff | Same data |

### 6.13 Misc modules (each: GET list, POST create, DELETE `/:id`)

| Prefix | Create body highlights | Auth create/list/delete |
|--------|------------------------|-------------------------|
| `/v1/visitors` | `visitorName`, optional `flatId`, `purpose` | Resident create; list own/staff |
| `/v1/parking` | `slotNumber`, optional `flatId`, `vehicleNumber` | Staff |
| `/v1/bookings` | `facilityName`, `startAt`, `endAt`, optional `flatId` | Resident/staff; MySQL datetime `YYYY-MM-DD HH:MM:SS` |
| `/v1/assets` | `name`, optional category/location | Staff |
| `/v1/vendors` | `name`, optional phone/email | Staff |
| `/v1/events` | `title`, optional `startAt`/`endAt`/`location` | Staff create; all can list |

---

## 7. Swagger-style payload examples

### A. OTP login (resident)

`POST /v1/auth/otp/request`

```json
{ "phone": "8888888888" }
```

`POST /v1/auth/otp/verify`

```json
{ "phone": "8888888888", "code": "123456" }
```

### B. Create complaint

`POST /v1/complaints`

```json
{
  "title": "Leaking tap",
  "type": "plumbing",
  "description": "Kitchen sink drip overnight"
}
```

Staff without a linked flat:

```json
{
  "title": "Common area light",
  "type": "electric",
  "description": "Staircase dark",
  "flatId": "66666666-6666-6666-6666-666666666666"
}
```

### C. Generate bills + mock pay

`POST /v1/bills/generate`

```json
{ "periodYm": "2026-08", "amountPaise": 500000 }
```

`POST /v1/payments/mock`

```json
{ "billId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
```

### D. Offline payment

`POST /v1/payments`

```json
{
  "flatId": "66666666-6666-6666-6666-666666666666",
  "billId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "amountPaise": 500000,
  "method": "cash"
}
```

### E. Publish notice

`POST /v1/notices`

```json
{
  "title": "Water supply maintenance",
  "body": "No water tomorrow 10am–2pm",
  "audience": "all"
}
```

Then `POST /v1/notices/{id}/publish`.

### F. Add platform user to society team

`POST /v1/manage/societies/{societyId}/team`

```json
{
  "email": "ops@societyhub.local",
  "name": "Platform Ops",
  "role": "secretary"
}
```

### G. Razorpay webhook (dev)

`POST /v1/payments/razorpay/webhook`

```json
{
  "orderId": "order_dev_xxxxxxxxxxxx",
  "paymentId": "pay_dev_xxxxxxxxxxxx",
  "status": "success"
}
```

### H. Validation error example

```json
{
  "code": "validation_error",
  "message": "Invalid request",
  "details": {
    "formErrors": [],
    "fieldErrors": { "email": ["Invalid email"] }
  }
}
```

---

## 8. Per-endpoint quick navigation (integration checklist)

| Area | Must implement | Save ids |
|------|----------------|----------|
| Auth OTP / password / refresh / logout | Yes | `accessToken`, `refreshToken`, `tenantId`, `flatId` |
| `select-tenant` / memberships | Multi-society / platform | new tokens |
| Societies CRUD + team add | Manage only | `societyId` |
| Buildings / wings / flats | Client Admin | structure ids |
| Admin residents + invites | Client Admin | `userId` |
| Complaints + comments + attachments + media | Both modes | `complaintId`, `attachmentId` |
| Bills generate / mine / pay / void | Admin + Resident | `billId`, `paymentId` |
| Payments list / receipt / webhook | Admin + backend | `receiptNumber` |
| Notices publish / read | Admin + Resident | `noticeId` |
| Notifications mark read | Resident | `notificationId` |
| Dashboard + audit | Admin | — |
| Profile | Resident | — |
| Visitors / bookings / parking / assets / vendors / events | Per module | resource ids |

**Recommended dependency order**

1. Auth + me + memberships  
2. Platform society create + team  
3. Structure + onboard residents  
4. Complaints (+ media)  
5. Bills + payments (+ webhook)  
6. Notices + notifications  
7. Dashboard / audit / misc modules  

---

## 9. SDK and clients

| Package | Role |
|---------|------|
| `@society-hub/validation` | Zod schemas — single source for request bodies |
| `@society-hub/types` | DTO TypeScript types |
| `@society-hub/auth` | JWT issue/verify helpers |
| `@society-hub/sdk` | Typed HTTP client used by web apps |

Prefer the SDK over raw `fetch` in first-party apps so paths stay aligned with this guide.

---

## 10. Testing the API

| Command | What |
|---------|------|
| `bun run test:unit` | Lib + packages coverage ≥90% |
| `bun run test:integration` | In-process HTTP coverage of `/v1` (≥90%, per-file) |
| `bun run quality` | MUI ban + lint + build + unit + integration |
| Live Swagger | `{YOUR_API_HOST}/docs` |

Integration tests boot `createApp()` in-process so Bun coverage instruments route modules. Set `API_URL` only when debugging against an external server.

---

## 11. Local smoke curls

```bash
export API=http://localhost:3000

curl -s "$API/health"

curl -s -X POST "$API/v1/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"8888888888"}'

curl -s -X POST "$API/v1/auth/otp/verify" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"8888888888","code":"123456"}'
# → copy tokens.accessToken

curl -s "$API/v1/auth/me" -H "Authorization: Bearer $TOKEN"
curl -s "$API/v1/dashboard/stats" -H "Authorization: Bearer $TOKEN"
```

---

## 12. Coming later (documented as out of scope for current `/v1`)

These may appear in product docs as **Coming soon** and must not be faked in clients until routes exist:

- Real Razorpay signature verification + order create  
- MSG91 / Resend / FCM production delivery  
- WhatsApp Business notifications  
- Flutter-specific endpoints (same `/v1` contract via SDK)  
- Builder / municipal editions  

When added, update this file’s inventory and OpenAPI `info.version`.
