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
| `resident_vehicles` | Registered two-wheelers / four-wheelers per resident (parking included vs purchased) |
| `society_settings` | SLA days, billing defaults, notification prefs |

### Identity and residents

| Table | Purpose |
|-------|---------|
| `users` | Login identity (phone, email, google subject) |
| `otp_challenges` | OTP request/verify records |
| `user_roles` | Role per user per tenant |
| `residents` | Person linked to a flat (owner/occupant). **Many residents per flat** (family). Unique `(tenant_id, user_id)` — one membership per person per society, not one person per flat. |
| `resident_documents` | Metadata + blob path for verification docs |

### Complaints

| Table | Purpose |
|-------|---------|
| `complaints` | Ticket, status, assignee, SLA due |
| `complaint_comments` | Thread |
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
| `notice_reads` | User/notice read receipts |
| `notifications` | In-app notification inbox |

### Audit

| Table | Purpose |
|-------|---------|
| `audit_logs` | Actor, entity, action, payload/diff, timestamp |

## 4. Relationships

```mermaid
erDiagram
  societies ||--o{ buildings : has
  buildings ||--o{ wings : has
  wings ||--o{ flats : has
  societies ||--o| society_settings : has
  flats ||--o{ residents : occupied_by
  users ||--o{ residents : linked
  users ||--o{ resident_vehicles : registers
  users ||--o{ user_roles : has
  residents ||--o{ complaints : raises
  complaints ||--o{ complaint_comments : has
  complaints ||--o{ complaint_attachments : has
  flats ||--o{ bills : billed
  bills ||--o{ bill_line_items : contains
  bills ||--o{ payments : settled_by
  societies ||--o{ notices : publishes
  notices ||--o{ notice_reads : tracked
  users ||--o{ notifications : receives
  societies ||--o{ audit_logs : tracks
```

## 5. Field-level notes (critical paths)

### flats (onboard extras)

- `floor` nullable int
- `parking_slot` varchar — primary slot label for the flat
- `png_gas_connection` boolean, default false — whether this flat has taken a PNG gas connection
- `adult_count`, `child_count`, `senior_citizen_count` — household size by age group (non-negative ints, default 0)

### resident_vehicles

- `user_id` + `tenant_id` — the onboarded resident
- `kind`: `two_wheeler` | `four_wheeler`
- `registration_number` nullable — CSV count-only import may omit plates
- `parking_purchased` — required true when this vehicle is beyond the included quota for the **flat** (2 two-wheelers and 1 four-wheeler, counted across all family members)
- `parking_slot` optional label for that vehicle
- `sort_order` — display / quota order (first N of each kind on the flat use included parking)

### residents

- Unique `(tenant_id, user_id)` so a person belongs to one flat in a society
- Many rows may share the same `flat_id` (family members). Login identity is **mobile**; `users.email` is optional and unique when set.

`resident_profiles.vehicle_number` remains a convenience copy of the first four-wheeler plate (else first two-wheeler) for older profile UI. Residents with a linked flat can update household PNG, family counts, and their `resident_vehicles` via `PATCH /v1/profile` (FR-ONB-10).

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
- `published_at`, `is_published`

### audit_logs

- `entity_type`, `entity_id`, `action`, `actor_user_id`, `before_json`, `after_json` (or compact action payload)

## 6. Indexing guidance

- `(tenant_id)` on all tenant tables
- `(tenant_id, flat_id)` on bills, residents
- `(tenant_id, status)` on complaints, bills
- Unique `(tenant_id, ticket_number)` on complaints
- Unique provider payment ids where not null
- `(user_id, notice_id)` unique on `notice_reads`

## 7. Soft delete and tenancy rules

- Default reads: `is_deleted = false` AND matching `tenant_id`
- Hard delete reserved for ephemeral data (e.g. expired OTP) only
- Migrations authored via Drizzle; never invent columns outside this doc + PRD without updating Spec first
- **Local (recommended):** native MySQL 8 + Workbench on port `3306`, user `root` / password `1900Summer@`, database `societyhub`. See **[08-Local-Development.md](08-Local-Development.md)**. Connection: `mysql://root:1900Summer%40@127.0.0.1:3306/societyhub`
- **Local (optional Docker):** `docker compose -f devops/docker/docker-compose.yml up mysql -d` — host port `3307` (avoids clashing with Workbench on `3306`)
