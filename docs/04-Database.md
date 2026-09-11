# Database

**Document:** 04-Database  
**Product:** SocietyHub  
**Version:** 1.0  
**Related:** [Architecture](03-Architecture.md), [PRD](02-PRD.md)

## 1. Principles

- **MySQL 8** via **Drizzle ORM** (lightweight locally via Docker; Azure Database for MySQL in cloud)
- **Multi-tenant:** every business table has `tenant_id`
- **Soft delete:** `is_deleted` (default queries exclude deleted)
- **Audit columns** on all tables (below)
- No cross-tenant foreign keys that leak data across societies

## 2. Standard columns (all tables)

| Column | Notes |
|--------|--------|
| `id` | CHAR(36) UUID string primary key |
| `tenant_id` | Society tenant; indexed; required on business tables (`users` may be global with membership via roles/residents) |
| `created_at` | DATETIME(3) UTC |
| `created_by` | user id nullable for system |
| `updated_at` | DATETIME(3) UTC |
| `updated_by` | user id nullable |
| `is_deleted` | boolean default false |

> Platform-level `users` may omit society-only semantics; membership and roles always carry `tenant_id`.

## 3. Core tables

### Hierarchy and tenancy

| Table | Purpose |
|-------|---------|
| `societies` | Tenant root (id often equals or maps to `tenant_id`) |
| `buildings` | Buildings within society |
| `wings` | Wings within building |
| `flats` | Flats within wing |
| `parking_slots` | Society parking inventory: puzzle (wing + number) or open (number). Optional link to a flat. |
| `resident_vehicles` | Registered two-wheelers / four-wheelers per resident (parking included vs purchased) |
| `society_settings` | SLA days, billing defaults, notification prefs |

### Identity and residents

| Table | Purpose |
|-------|---------|
| `users` | Login identity (phone, email, google subject). **Global — no `tenant_id`.** |
| `otp_challenges` | OTP request/verify records |
| `user_roles` | Role per user per tenant |
| `residents` | **Society membership + flat occupancy period** — see §5. One active owner per flat (`is_owner`). |
| `resident_profiles` | Per-society profile: emergency contact, vehicle note, channel preferences |
| `resident_family_members` | Household members of a membership (may have no login) |
| `verification_documents` | Metadata + blob path + review state for verification docs |
| `invitations` | Pending/accepted/revoked/expired invitations, with flat and resident type |

> The name `resident_documents` used by earlier drafts of this document is **not** a table —
> `verification_documents` is the implementation.

### Complaints

| Table | Purpose |
|-------|---------|
| `complaints` | Ticket, status, assignee, SLA due |
| `complaint_comments` | Thread (`kind` = `comment` or `question`) |
| `complaint_attachments` | Blob references |

### Billing and payments

| Table | Purpose |
|-------|---------|
| `bills` | Period bill per flat |
| `bill_line_items` | Line amounts/descriptions |
| `payments` | Offline UPI proof (pending review) or staff-recorded cash/cheque/NEFT; Razorpay columns reserved for later |

### Notices and notifications

| Table | Purpose |
|-------|---------|
| `notices` | Published content + targeting |
| `notice_attachments` | Image/video blob refs for notices |
| `notice_reads` | User/notice read receipts |
| `notifications` | In-app notification inbox |
| `complaint_status_events` | Status transition history on a complaint |

### Audit

| Table | Purpose |
|-------|---------|
| `audit_logs` | Actor, entity, action, payload/diff, timestamp |

## 4. Relationships

### 4.1 How relations build (setup order)

Physical inventory is created **before** people attach to it. Occupancy is **derived** from `residents` rows (`active_key IS NOT NULL`); it is never stored on `flats`.

```text
1. societies                          tenant root (tenant_id ≈ society id)
2. buildings → wings → flats          physical units (CSV / Setup)
3. parking_slots                      lot inventory; optional flat_id when assigned
4. users                              global login identity (no tenant_id)
5. user_roles                         staff/resident role inside a society
6. residents                          membership + occupancy period (user ↔ flat)
7. invitations / onboard CSV          create or link people onto flats
8. complaints, bills, notices…        day-to-day ops hang off flats / users / society
```

**Mental model**

| Layer | Tables | Meaning |
|-------|--------|---------|
| Tenancy | `societies` | One society = one `tenant_id` scope |
| Structure | `buildings` → `wings` → `flats` | Where units sit |
| Parking inventory | `parking_slots` | Puzzle/open lots; assign to a flat later |
| Identity | `users`, `user_roles` | Who can sign in; role per society |
| Occupancy | `residents` | Who lives where, for which period |
| Household extras | `resident_family_members`, `resident_vehicles`, `verification_documents`, `resident_profiles` | Attached to membership / user |
| Ops | `complaints`, `bills`/`payments`, `notices`, … | Scoped by tenant (+ flat or user) |

### 4.2 ER diagram (core)

```mermaid
erDiagram
  societies ||--o{ buildings : "has"
  buildings ||--o{ wings : "has"
  wings ||--o{ flats : "has"
  societies ||--o{ parking_slots : "inventory"
  flats ||--o{ parking_slots : "may_use"
  societies ||--o| society_settings : "has"

  users ||--o{ user_roles : "roles_in"
  societies ||--o{ user_roles : "grants"
  users ||--o{ residents : "member"
  flats ||--o{ residents : "occupied_by"
  users ||--o| resident_profiles : "profile_per_society"
  users ||--o{ resident_vehicles : "registers"
  residents ||--o{ resident_family_members : "household"
  residents ||--o{ verification_documents : "submits"
  flats ||--o{ invitations : "invites_to"
  users ||--o{ invitations : "accepted_by"

  flats ||--o{ complaints : "about"
  users ||--o{ complaints : "raised_by"
  complaints ||--o{ complaint_comments : "thread"
  complaints ||--o{ complaint_attachments : "media"
  complaints ||--o{ complaint_status_events : "history"

  flats ||--o{ bills : "billed"
  bills ||--o{ bill_line_items : "lines"
  bills ||--o{ payments : "settled_by"

  societies ||--o{ notices : "publishes"
  notices ||--o{ notice_attachments : "media"
  notices ||--o{ notice_reads : "tracked"
  users ||--o{ notice_reads : "reader"
  users ||--o{ notifications : "inbox"
  societies ||--o{ audit_logs : "tracks"
  users ||--o{ audit_logs : "actor"

  flats ||--o{ visitors : "hosts"
  flats ||--o{ bookings : "books"
```

### 4.3 Key join paths (how queries hang together)

| Need | Join path |
|------|-----------|
| Flat label `A-101` | `flats` → `wings` → `buildings` (all same `tenant_id`) |
| Who lives in a flat now | `residents` where `flat_id = ?` and `active_key IS NOT NULL` |
| Occupancy status | Derived from active `residents` (`owner` / `tenant` / vacant) — not a column on `flats` |
| Assign parking lot | `parking_slots.flat_id` → `flats.id` (inventory row owns the link) |
| Raise complaint | `complaints.flat_id` + `raised_by` → `users`; household mates share flat scope |
| Bill a flat | `bills.flat_id` → `flats`; `payments.bill_id` → `bills` |
| Notice audience | `notices` + optional `wing_id` / `flat_id`; reads via `notice_reads` |
| Staff vs resident | `user_roles` for `(tenant_id, user_id)` — not stored on `residents` |
## 5. Field-level notes (critical paths)

### residents — membership and occupancy

`residents` is **one person's membership of one society, occupying one flat, over one period**.
Full rationale in [implementation/phase-1-domain.md](implementation/phase-1-domain.md).

- `resident_type`: `owner` | `tenant` | `family`; `is_primary` separates the primary owner/tenant
  from co-owners and additional occupants
- `is_owner` is kept as a **derived mirror** of `resident_type = 'owner'` for backward compatibility.
  **One active owner per flat:** `is_owner` is true for exactly one currently occupying row per flat.
- `status`: `invited` | `pending_verification` | `active` | `suspended` | `moved_out` | `rejected`
  — transitions are enforced in `apps/api/src/lib/resident-lifecycle.ts`; `moved_out` is terminal
- `verification_status`: `pending` | `under_review` | `approved` | `rejected`, plus `verified_by`,
  `verified_at`, `rejection_reason`
- `move_in_date`, `move_out_date`, `move_out_reason`, `remarks`
- `active_key`: `'Y'` while the membership occupies the flat, `NULL` once it does not

**Occupancy history is never destroyed.** Move-out closes a row; move-in inserts a new one.

**Uniqueness.** MySQL has no partial unique indexes, so
`UNIQUE (tenant_id, user_id, flat_id, active_key)` combined with the nullable `active_key` gives
"at most one *active* membership per person per flat per society" while leaving any number of
historical rows unconstrained (MySQL allows repeated `NULL`s in a unique index). `active_key IS NOT
NULL` is the single predicate for "currently occupies".

Indexes: `(tenant_id)`, `(tenant_id, user_id)`, `(tenant_id, flat_id, active_key)`,
`(tenant_id, status)`, `(tenant_id, verification_status)`.

Login identity is **mobile**; `users.email` is optional and unique when set.

### resident_family_members

Household members attached to a membership. `user_id` cannot represent them because a family member
may have **no SocietyHub account** — `linked_user_id` is nullable and set only when they do.
`relationship`: `spouse` | `child` | `parent` | `sibling` | `other`.

### verification_documents

- `doc_type`: `identity` | `address_proof` | `tenant_agreement` | `police_verification` | `other`
- `status`: `pending` | `under_review` | `approved` | `rejected` with `verified_by`, `verified_at`,
  `rejection_reason`, `expires_at`
- `document_number` is for a masked/partial reference only — never a full sensitive number
- `blob_path` is **server-only**; files are served exclusively through the authenticated,
  tenant-checked, audited download routes

### invitations

- `status`: `pending` | `accepted` | `revoked` | `expired`
- `flat_id` + `resident_type` let an invitation pre-bind the invitee to a flat
- `expires_at` (default +14 days), `accepted_at`, `accepted_by_user_id`, `revoked_at`,
  `last_sent_at`, `resend_count`
- `active_key` = `lower(email|phone|role)` **only while pending**, with
  `UNIQUE (tenant_id, active_key)` — blocks a second live invitation for the same recipient while
  leaving revoked/accepted history unconstrained

### resident_profiles

Per-society profile for a user: structured emergency contact
(`emergency_contact_name/relation/phone`), `vehicle_number`, and `communication_prefs_json`
(`{"inApp":true,"push":true,"email":true,"whatsapp":false,"sms":false}`). The older free-text
`emergency_contact` column is deprecated but retained.

`resident_profiles.vehicle_number` remains a convenience copy of the first four-wheeler plate (else first two-wheeler) for older profile UI. Residents with a linked flat can update household PNG, family counts, and their `resident_vehicles` via `PATCH /v1/profile` (FR-ONB-10).

### flats (onboard extras)

- `floor` nullable int
- `parking_slot` varchar — primary slot label for the flat (matches `parking_slots.slot_number` when assigned)
- `png_gas_connection` boolean, default false — whether this flat has taken a PNG gas connection
- `adult_count`, `child_count`, `senior_citizen_count` — household size by age group (non-negative ints, default 0)

### parking_slots

- `kind`: `puzzle` | `open` (default `open` for older rows)
- `wing` nullable varchar — required for puzzle (A / B / C / D typical)
- `floor` nullable int — unused for inventory (kept for older rows)
- `slot_number` — puzzle unique with kind + wing; open unique by number among open slots
- `flat_id` nullable — set when a household uses this slot
- `type` — legacy vehicle hint (`car` / `bike`); inventory kind is `kind`, not `type`

### resident_vehicles

- `user_id` + `tenant_id` — the onboarded resident
- `kind`: `two_wheeler` | `four_wheeler`
- `registration_number` nullable — CSV count-only import may omit plates
- `parking_purchased` — required true when this vehicle is beyond the included quota for the **flat** (2 two-wheelers and 1 four-wheeler, counted across all family members)
- `parking_slot` optional label for that vehicle
- `sort_order` — display / quota order (first N of each kind on the flat use included parking)

### complaints

- `ticket_number` unique per tenant
- `title` required
- `type` enum/string: `electric` | `plumbing` | …predefined… | `other`
- `type_other_text` nullable when type = other
- `description` text (may originate from typing and/or client speech-to-text)
- `flat_id` required; set from logged-in resident — not arbitrary client override without authz check
- `status` (MVP): Open | InProgress | Resolved | Closed  
  (Phase 2 may add Assigned and SLA fields)
- `assignee_user_id` optional in MVP
- `sla_due_at` optional in MVP

### complaint_attachments

- `content_kind`: `image` | `video`
- `content_type` MIME
- `blob_path`, `byte_size`, `duration_seconds` (nullable for images)

### users (auth extras)

- `username` nullable unique (legacy alias; login uses email)
- `password_hash` nullable (bcrypt; used with email login)
- `pin_hash` nullable (set after OTP/SSO)
- `pin_updated_at` nullable
- Google subject / phone as today
- Roles via `user_roles.role`: `admin` | `resident` | `superadmin`
- `password_reset_challenges` for forgot/reset password codes (email delivery via Resend in Phase 2; DEV returns code)

### bills

- `flat_id`, `period_start`, `period_end`, `due_date`
- `status`: Unpaid | Partial | Paid | Overdue | Void
- Unique constraint: one non-void bill per flat per period (per tenant)

### societies (payment account)

- `upi_id`, `account_name`, `account_number`, `ifsc` — shown to residents for offline pay
- `qr_blob_path`, `qr_content_type` — optional society QR image

### payments

- `bill_id`, `amount`, `method`: upi | cash | cheque | neft | razorpay (razorpay unused until Phase 2 checkout)
- `status`: pending (screenshot submitted) | success (acknowledged / staff-recorded) | failed (rejected)
- `proof_blob_path` / `proof_content_type` for resident UPI screenshot
- `review_note` when staff acknowledge or reject
- `provider_payment_id` / `provider_order_id` reserved for future Razorpay
- `receipt_number` issued on success

### notices

- `audience`: all | wing | flat (+ `wing_id` / `flat_id` as needed)
- `published_at`, `unpublished_at`

### notice_attachments

- `content_kind`: `image` | `video`
- `content_type` MIME
- `blob_path`, `byte_size`

### audit_logs

- `entity_type`, `entity_id`, `action`, `actor_user_id`, `before_json`, `after_json` (or compact action payload)

## 6. Indexing guidance

- `(tenant_id)` on all tenant tables
- `(tenant_id, flat_id)` on bills, residents
- `(tenant_id, status)` on complaints, bills
- Unique `(tenant_id, ticket_number)` on complaints
- Unique provider payment ids where not null
- `(user_id, notice_id)` unique on `notice_reads`
- `(tenant_id, flat_id, active_key)` on residents — powers every "who lives here" query
- `(tenant_id, status)` and `(tenant_id, verification_status)` on residents — directory filters
- Unique `(tenant_id, user_id, flat_id, active_key)` on residents — one active membership per flat
- Unique `(tenant_id, active_key)` on invitations — one live invitation per recipient and role
- `(tenant_id, resident_id)` on verification_documents and resident_family_members

## 7. Soft delete and tenancy rules

- Default reads: `is_deleted = false` AND matching `tenant_id`
- Hard delete reserved for ephemeral data (e.g. expired OTP) only
- Migrations authored via Drizzle; never invent columns outside this doc + PRD without updating Spec first
- **Local (recommended):** native MySQL 8 + Workbench on port `3306`, user `root` / password `1900Summer@`, database `societyhub`. See **[08-Local-Development.md](08-Local-Development.md)**. Connection: `mysql://root:1900Summer%40@127.0.0.1:3306/societyhub`
- **Local (optional Docker):** `docker compose -f devops/docker/docker-compose.yml up mysql -d` — host port `3307` (avoids clashing with Workbench on `3306`)
