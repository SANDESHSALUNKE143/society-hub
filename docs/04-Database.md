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
| `society_settings` | SLA days, billing defaults, notification prefs |

### Identity and residents

| Table | Purpose |
|-------|---------|
| `users` | Login identity (phone, email, google subject). **Global — no `tenant_id`.** |
| `otp_challenges` | OTP request/verify records |
| `user_roles` | Role per user per tenant |
| `residents` | **Society membership + flat occupancy period** — see §5 |
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
| `complaint_comments` | Thread |
| `complaint_attachments` | Blob references |

### Billing and payments

| Table | Purpose |
|-------|---------|
| `bills` | Period bill per flat |
| `bill_line_items` | Line amounts/descriptions |
| `payments` | Razorpay or manual payment rows |

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
  users ||--o{ user_roles : has
  residents ||--o{ resident_family_members : household
  residents ||--o{ verification_documents : submits
  users ||--o| resident_profiles : profile
  flats ||--o{ invitations : invites_to
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

### residents — membership and occupancy

`residents` is **one person's membership of one society, occupying one flat, over one period**.
Full rationale in [implementation/phase-1-domain.md](implementation/phase-1-domain.md).

- `resident_type`: `owner` | `tenant` | `family`; `is_primary` separates the primary owner/tenant
  from co-owners and additional occupants
- `is_owner` is kept as a **derived mirror** of `resident_type = 'owner'` for backward compatibility
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

### payments

- `bill_id`, `amount`, `mode`: razorpay | cash | cheque | neft
- `provider_payment_id` / `provider_order_id` for Razorpay (unique for idempotency)
- `reference` for offline modes
- `status`: created | captured | failed | cancelled

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
