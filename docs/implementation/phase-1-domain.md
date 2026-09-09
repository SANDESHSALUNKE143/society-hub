# Domain — Society & Resident Management

**Phase:** 1 (web + backend). Mobile consumes the same contracts in a later phase.
**Related:** [04-Database](../04-Database.md) · [09-API](../09-API.md) · [assessment](phase-1-resident-management-assessment.md)

---

## 1. The five nouns

| Concept | Table | What it is |
|---------|-------|------------|
| **User** | `users` | A global authenticated identity: phone, email, password/PIN/Google. **No `tenant_id`** — one person, one row, across every society. |
| **Membership** | `residents` | One person's relationship with **one society**, occupying **one flat**, over **one period**. Carries the lifecycle status, verification state and move-in/move-out dates. |
| **Flat** | `flats` | A physical unit inside `wings` → `buildings` → `societies`. |
| **Occupancy** | *(derived)* | Who lives in a flat right now. Computed from live memberships — never stored. |
| **Family member** | `resident_family_members` | A household member attached to a membership, who may have **no** SocietyHub account. |

```text
Society (tenant)
   └── Building
          └── Wing
                 └── Flat
                        └── Membership  (residents)      ← owner | tenant | family
                                ├── Family members       (resident_family_members)
                                └── Documents            (verification_documents)
User ──────────────────────────────┘   (global identity, many societies via user_roles)
```

### Why `residents` is the membership

`residents` already held `(tenant_id, user_id, flat_id, is_owner)`. Phase 1 extended it rather than
adding a parallel `resident_memberships` table. A **membership row is an occupancy period**:

- **Move-in** inserts a new row.
- **Move-out** closes the row: `status = 'moved_out'`, `move_out_date` set, `active_key = NULL`.
- **Nothing is ever deleted or overwritten**, so history is simply the set of rows for a flat.

```text
Flat A-1204

2023-01-01 → 2025-05-31   Tenant: Person A   (status moved_out)
2025-06-15 → Present      Owner:  Person B   (status active)
```

### The `active_key` trick

MySQL has no partial unique indexes. `residents.active_key` holds `'Y'` while the membership
occupies the flat and `NULL` once it does not, with:

```sql
UNIQUE (tenant_id, user_id, flat_id, active_key)
```

MySQL permits repeated `NULL`s in a unique index, so:

- at most **one active** membership exists per person per flat per society, and
- any number of **historical** rows may exist for the same person and flat.

`active_key IS NOT NULL` is therefore the single predicate for "currently occupies", used by the
directory, flat occupancy, dashboard stats and the session's flat resolution.

---

## 2. Owner and tenant

`residents.resident_type` is `owner | tenant | family`; `residents.is_primary` separates the primary
owner/tenant from co-owners and additional occupants. `is_owner` is retained as a derived mirror of
`resident_type = 'owner'` so pre-existing callers and the CSV contract keep working.

Indian housing scenarios this deliberately supports:

- multiple owners on one flat (primary owner + co-owners),
- an owner **and** a tenant living in the same flat,
- one person owning several flats in the same society,
- a person who is a resident in one society and staff in another.

---

## 3. Lifecycle

```text
INVITED
   │
   ├─► PENDING_VERIFICATION ─► ACTIVE ─┬─► SUSPENDED ─► ACTIVE
   │            │                      │        │
   │            └─► REJECTED           │        └─► MOVED_OUT
   │                   │               └─► MOVED_OUT
   │                   └─► PENDING_VERIFICATION / ACTIVE
   └─► ACTIVE (admin-created, already trusted)
```

Enforced in [`apps/api/src/lib/resident-lifecycle.ts`](../../apps/api/src/lib/resident-lifecycle.ts).
Illegal or no-op transitions return **409 `invalid_transition`**, so a double-clicked Approve or a
stale browser tab cannot corrupt the record.

| Status | Occupies the flat? | Meaning |
|--------|:------------------:|---------|
| `invited` | ✅ | Invitation issued, not yet accepted |
| `pending_verification` | ✅ | Accepted or self-registered; awaiting Admin review |
| `active` | ✅ | Verified and living in the flat |
| `suspended` | ✅ | Access withheld; still recorded on the flat |
| `moved_out` | ❌ | Period closed. **Terminal.** |
| `rejected` | ❌ | Verification refused |

`MOVED_OUT` is terminal by design: a returning resident gets a **new** membership row, so both
tenancies remain visible in the flat history.

### Who created it, and what that means

- **Admin-created** (`POST /v1/admin/residents`, CSV import) — the admin has already vetted the
  person, so the membership starts `active` / `approved`.
- **Invitation-accepted** — starts `pending_verification` / `pending`. An admin must approve.

---

## 4. Verification

Verification lives at two levels:

| Level | Column | Purpose |
|-------|--------|---------|
| Membership | `residents.verification_status` | Is this person cleared for this society? |
| Document | `verification_documents.status` | Is this individual file accepted? |

```text
pending ──► under_review ──► approved
                    └──────► rejected ──► (re-upload) ──► under_review
```

Uploading a document moves a `pending` **or** `rejected` membership to `under_review`. An already
`approved` membership is left alone — a new document does not un-verify someone.

Rejections carry a reason that is shown to the resident on their Account page. Approve/reject/upload
/download are all audited; **no document content or full document number is ever written to
`audit_logs`** — only metadata (type, MIME, size, resident id).

### Document privacy

`verification_documents.blob_path` never leaves the server. Files are reachable only through:

- `GET /v1/admin/resident-documents/:id/file` — society staff, tenant-checked, audited
- `GET /v1/profile/documents/:id/file` — the owning resident only

Both return `Cache-Control: private, no-store`. A cross-tenant request returns **404**, not 403, so
the endpoint does not confirm that another society's document exists.

---

## 5. Occupancy is derived

`flats` stores **no** occupancy column. Occupancy comes from live memberships:

| Result | Rule |
|--------|------|
| `vacant` | no membership with `active_key = 'Y'` |
| `tenant_occupied` | at least one live membership with `resident_type = 'tenant'` |
| `owner_occupied` | live memberships exist, none of them tenants |

Owner-plus-tenant reads as **tenant occupied** — that is the fact an admin acts on. The rule lives in
one function (`deriveOccupancy`) and the equivalent SQL in `listFlatsWithOccupancy`, so the list, the
detail page and the dashboard can never disagree.

---

## 6. Invitations

`invitations` gained `flat_id`, `resident_type`, `name`, `expires_at`, `accepted_at`,
`accepted_by_user_id`, `revoked_at`, `last_sent_at`, `resend_count` and `active_key`, plus an
`expired` status.

- `active_key` = `lower(email|phone|role)` while **pending**, `NULL` otherwise, with
  `UNIQUE (tenant_id, active_key)` — one live invitation per recipient and role, while revoked and
  accepted history stays unconstrained.
- Revoking sets `active_key = NULL`, so a replacement invite can be issued immediately.
- Expiry defaults to 14 days and is applied lazily: listing or creating an invitation flips overdue
  pending rows to `expired` and frees their key.
- Accepting is single-use, creates or reuses the `users` row, grants the role, and — when the invite
  names a flat — opens a `pending_verification` membership.

---

## 7. Authorization and tenant isolation

Phase 1 **extends the existing role-predicate helpers** rather than introducing a second
permission system (`apps/api/src/lib/auth-helpers.ts`):

| Capability | Guard |
|------------|-------|
| Everything under `/v1/admin/*`, `/v1/team`, `/v1/invitations` | `requireSocietyStaff` |
| `/v1/profile/*` | `requireAuth` + the caller's own membership |
| `/v1/invites/:token`, `/v1/invites/accept` | none — the token is the credential |
| `/v1/manage/*` | `requirePlatform` |

Every resident-management query pins `tenant_id` from the JWT. A resource in another society is
**404**, never a partial read. Negative cases are covered in
`apps/api/src/residents.integration.test.ts`.

---

## 8. Audit and notifications

Both reuse the existing infrastructure — no second system.

**Audit** (`audit_logs` via `recordAudit`): `resident.created/updated/verified/rejected/suspended/
reactivated/moved_in/moved_out`, `resident.family_added/family_removed`,
`document.uploaded/viewed/verified/rejected`,
`invitation.created/resent/revoked/accepted`, `team.member_added/member_removed`, `role.changed`.
The resident detail Activity tab reads them back via `listEntityActivity`.

**Notifications** (`notifications` via `notifyUser`, in-app only): resident invited, invitation
accepted, verification approved, verification rejected, resident moved in, resident moved out,
document rejected, team invitation. The payload shape (`title`, `body`, `kind`, `linkPath`) already
suits future push/email/WhatsApp/SMS fan-out; `resident_profiles.communication_prefs_json` records
the per-channel opt-ins those channels will read.
