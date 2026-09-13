# Phase 2 demo — GitHub backlog

Track these as issues when `gh` is available (`gh issue create`). Labels: `scope:phase2`, module name, `docs`, `tests`.

## Epics

1. **Client App core** — Dashboard, Team, Audit, Bills, Payments, Notices, Notifications, society settings/suspend  
   UAT: [uat/bills-payments.md](../test-docs/uat/bills-payments.md), [uat/notices.md](../test-docs/uat/notices.md)
2. **Client App society ops** — Visitors, Parking, Bookings, Assets, Vendors, Events  
   UAT: [uat/visitors.md](../test-docs/uat/visitors.md), [uat/parking-bookings.md](../test-docs/uat/parking-bookings.md), [uat/assets-vendors-events.md](../test-docs/uat/assets-vendors-events.md)
3. **Manage commercial** — Plans, subscriptions, flags, discounts, platform bills/payments, announcements, support, integrations health  
   UAT: [uat/manage-commercial.md](../test-docs/uat/manage-commercial.md)
4. **Flutter parity** — Mirror Client App nav (no CSV/Manage)
5. **Docs** — User manuals + UAT stay in sync with shipped screens

## Acceptance (every story)

- Spec FR updated before code
- `tenant_id` scoped; cross-tenant → 404 test
- Zod at boundary; DTO only
- Manual section + UAT checklist linked
