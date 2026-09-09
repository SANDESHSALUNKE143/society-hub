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

1. Platform users manage societies and **list, add, and remove a society team** via Manage (`GET` / `POST` / `DELETE /v1/manage/societies/:id/team`).
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
4. `GET /v1/manage/societies/{societyId}/team` — list current society staff (shown on Manage society detail)
5. Chairperson signs in via OTP / password and uses Client App Admin

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

1. Staff: `GET /v1/admin/residents` lists onboarded people (multiple rows may share a flat); `POST /v1/admin/residents` with `name`, `phone`, `flatId`, plus optional `email` and the same onboard fields as CSV (`floor`, `parkingSlot`, `isOwner`, `emergencyContact`, `vehicles`, `pngGasConnection`, `adultCount`, `childCount`, `seniorCitizenCount`). Match existing people by **phone**. Email must be unique if set. CSV `twoWheelers` / `fourWheelers` may be counts without registration numbers. Family counts (`adults`, `children`, `seniorCitizens`) are per flat.
2. Resident: OTP verify with that phone
3. `POST /v1/complaints` (resident uses linked flat; staff must pass `flatId`)
4. Staff: `PATCH /v1/complaints/{id}/status`, `POST /v1/complaints/{id}/comments`
5. Optional: `POST /v1/complaints/{id}/attachments` (`multipart/form-data`, field `file`)

Complaint types: `electric`, `plumbing`, `housekeeping`, `security`, `lift`, `other`  
Statuses: `open`, `assigned`, `in_progress`, `resolved`, `closed`

### D. Billing and payment

1. Staff: `POST /v1/bills/generate` with `{ "periodYm": "2026-07", "amountPaise": 500000 }`
2. Resident: `GET /v1/bills/mine`
3. Staff publish pay details: `PATCH /v1/payments/account` `{ "upiId", "accountName?", "accountNumber?", "ifsc?" }` and optional `POST /v1/payments/account/qr` (`file`)
4. Resident offline pay: `POST /v1/payments/offline` multipart `{ billId, file }` (screenshot) → status `pending`
5. Staff review: `POST /v1/payments/{id}/acknowledge` or `/reject` (credits or leaves bill unpaid)
6. Staff in-person: `POST /v1/payments` with `method: "cash"|"cheque"|"neft"` (immediate credit)
7. Receipt: `GET /v1/payments/{id}/receipt` after acknowledgement
8. **Future Razorpay:** `POST /v1/payments/mock` and `/v1/bills/{id}/pay` stay as local/dev only — not the resident product path
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
| POST | `/google` | No | `{ idToken }` — Google ID token (`aud` must match `GOOGLE_CLIENT_ID`); or `dev:<phone>` when `DEV_AUTH=true` |
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
| PATCH | `/profile` | Yes | Alias of `PATCH /v1/profile` (SDK) |

### 6.3 Profile — `/v1/profile`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Yes | Profile + linked flat (PNG, family counts, household vehicle counts) + this user's vehicles |
| PATCH | `/` | Yes | Partial upsert: emergency contact, vehicles, PNG, `adultCount` / `childCount` / `seniorCitizenCount`. Household fields need a linked flat (`400 no_flat` otherwise). |

### 6.4 Manage (platform) — `/v1/manage/societies`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/:id/team` | Platform | List society staff (`TeamMemberDto[]`). 404 if society missing |
| POST | `/:id/team` | Platform | Add/update society staff membership |
| DELETE | `/:id/team/:userId` | Platform | Soft-remove staff roles (cannot remove self) |

Body (POST): `{ email? , phone?, name?, role }` — email **or** phone required. Role defaults to `chairperson`.

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
| GET | `/v1/admin/flats` | Staff | Flat picker (includes household `twoWheelerCount` / `fourWheelerCount`) |
| GET | `/v1/admin/structure` | Staff | Nested buildings→wings→flats |
| GET | `/v1/admin/team` | Staff | Society team |
| POST | `/v1/team` | Staff | Add team member `{ email?, phone?, name?, role }` — email or phone required |
| PATCH | `/v1/team/:userId` | Staff | Update name / email / mobile / role |
| DELETE | `/v1/team/:userId` | Staff | Soft-remove staff roles (cannot remove self) |
| POST | `/v1/admin/invites` | Staff | Same as invitations create |
| GET | `/v1/admin/flats` | Staff | Flats with floor, parking, PNG, household vehicle counts |
| GET | `/v1/admin/residents` | Staff | List onboarded residents (name, phone, email, flat) |
| POST | `/v1/admin/residents` | Staff | Onboard one resident (same fields as CSV row + `flatId`) |
| POST | `/v1/admin/residents/import` | Staff | Bulk CSV rows (`name,phone,email,flatNumber,wingName,floor,parkingSlot,isOwner,emergencyContact,vehicleNumber,twoWheelers,fourWheelers,pngGasConnection,adults,children,seniorCitizens`). `twoWheelers` / `fourWheelers` may be a **count** (`2`) or registration list (`MH12TW0001;MH12TW0002`). Plates optional. Family counts are per flat. |
| POST | `/v1/invitations` | Staff | Invite via email and/or WhatsApp (Gupshup adapter; stub without keys) |
| GET | `/v1/team` | Staff | Society team list |

### 6.7 Invitations — `/v1/invitations`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | Staff | |
| POST | `/` | Staff | `{ email? , phone?, role }` |
| POST | `/:id/revoke` | Staff | Sets status `revoked` |

When `DEV_AUTH=true`, create responses may include `devToken`.

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
| GET | `/account` | Yes | Society UPI / QR / bank details |
| PATCH | `/account` | Staff | Set UPI ID and account fields |
| POST | `/account/qr` | Staff | Upload QR image (`file`) |
| GET | `/account/qr` | Yes | QR image (`?access_token=` allowed) |
| POST | `/offline` | Yes | Resident screenshot vs `billId` → `pending` |
| POST | `/` | Staff | Immediate cash/cheque/NEFT credit |
| POST | `/:id/acknowledge` | Staff | Credit pending UPI proof; mark bill paid |
| POST | `/:id/reject` | Staff | Reject proof; bill stays unpaid |
| GET | `/:id/proof` | Yes | Screenshot (`?access_token=` allowed) |
| POST | `/mock` | Yes | Dev Razorpay mock (not product UI) |
| GET | `/:id/receipt` | Yes | After success |
| POST | `/razorpay/webhook` | No* | Future Razorpay; local mock only |

\*Webhook is unauthenticated in local/dev mock form. Production must verify Razorpay signature before trusting the body.

Payment methods: `upi` (resident screenshot), `cash`, `cheque`, `neft` (staff), `razorpay` (future)

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
| GET | `/v1/dashboard/stats` | Yes | Counts scoped by role |
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

### D. Offline UPI payment (product path)

Resident: `POST /v1/payments/offline` as `multipart/form-data` with `billId` + screenshot `file`.

Staff credit: `POST /v1/payments/{id}/acknowledge`

Staff in-person cash still uses `POST /v1/payments` `{ method: "cash"|"cheque"|"neft" }`.

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
  "phone": "8888888888",
  "name": "Platform Ops",
  "role": "secretary"
}
```

`GET /v1/manage/societies/{societyId}/team` returns the current staff list.  
`DELETE /v1/manage/societies/{societyId}/team/{userId}` removes staff access (cannot remove yourself).

Society Admin can also manage the current society's team:

- `POST /v1/team` — same body
- `PATCH /v1/team/{userId}` — `{ "email"?, "phone"?, "name"?, "role"? }`
- `DELETE /v1/team/{userId}` — remove staff access (cannot remove yourself)

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
