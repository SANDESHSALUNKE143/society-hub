# Business Requirements Document (BRD)

**Document:** 01-BRD  
**Product:** SocietyHub  
**Version:** 0.1  
**Related:** [Vision](00-Vision.md), [PRD](02-PRD.md)

## 1. Problem

Housing societies are mini-ecosystems of residents, owners, tenants, committee members, security, housekeeping, and vendors. Despite growing complexity, most societies still run on fragmented tools:

| Activity | Typical tool today |
|----------|-------------------|
| Maintenance collection | Excel |
| Complaints | Notebook / WhatsApp |
| Notices | WhatsApp / print / email |
| Vendor details | Paper / chats |
| Visitors | Security register |

Disconnected tools cause poor visibility, delayed issue resolution, weak accountability, financial inefficiency, data loss, and resident dissatisfaction.

## 2. Business objectives

### MVP (now)

1. Digitize **complaint registration and tracking** (replace notebook/WhatsApp for issues).
2. Make complaint raise easy for residents (login + simple form + media + voice-to-text).
3. Give **Admin** visibility of all raised complaints and statuses.
4. Onboard Admin and Residents with login/logout (SSO, OTP, or PIN).

### Phase 2+

5. Enable online maintenance payments and clearer reconciliation.
6. Centralize notices with confirmation of view.
7. Reduce broader administrative work for Secretary and Treasurer.
8. Deliver a multi-tenant SaaS that can onboard societies without code changes.

## 3. Stakeholders

### Primary

- Residents
- Owners
- Tenants

### Secondary (society management)

- Society Secretary
- Treasurer
- Committee members
- Society Admin

### Operational (MVP: limited; fuller modules later)

- Security, housekeeping, vendors (directory/docs may appear; full vendor ops = future)

### Platform

- Super Admin
- Support team

## 4. Stakeholder pain points (summary)

| Stakeholder | Pain | Need |
|-------------|------|------|
| Resident | Unresolved complaints, payment confusion, missed notices | Transparency, mobile access, faster resolution |
| Secretary | Phone calls, Excel, complaint follow-ups | Automation, dashboard, reports |
| Treasurer | Reconciliation, defaulters, receipts | Online pay, auto reconcile, financial reports |
| Committee | Lack of visibility, resident complaints | Real-time dashboards, decision support |

## 5. Business impact of status quo

- High administrative effort and operational cost
- Resident dissatisfaction and delayed resolution
- Poor financial transparency and compliance risk
- Data inconsistency and weak auditability

## 6. Opportunity

A centralized SaaS platform can reduce manual effort, improve transparency, standardize workflows, increase collection rates, raise resident satisfaction, and enable data-driven committee decisions—while supporting a scalable subscription business.

## 7. Success metrics

### MVP (complaint portal)

| Metric | Target |
|--------|--------|
| Residents raise complaints via portal instead of only WhatsApp/notebook | Majority of pilot issues logged in-app |
| Admin can see and act on all open complaints in one list | Yes |
| Login works via SSO or OTP; PIN available after setup | Yes |

### Phase 2+ (platform)

| Metric | Target |
|--------|--------|
| Resident active usage | ≥ 80% of residents |
| Maintenance payments online | > 70% |
| Complaints resolved within SLA | > 90% |
| Manual admin work reduction | ≥ 50% |
| Multi-society readiness | Onboard new societies without code changes |

## 8. Business scope

### In scope (MVP)

Responsive web **complaint portal**: onboard Admin, onboard Resident, login/logout (SSO / mobile OTP / PIN), raise complaint (title, auto flat, type, description, voice-to-text, photos/videos), resident + admin complaint lists with status.

### Phase 2 (full society operations)

Explicitly retained from the original broad MVP (detailed FR-* in [PRD](02-PRD.md) §§6.2, 7.4–7.12):

- Full roles: Super Admin, Society Admin, Secretary, Treasurer, Committee, Resident, Tenant
- Society hierarchy + settings (SLA, billing defaults) + role assignment
- Owners/tenants, profiles, tenant verification documents
- Advanced complaints: assignment, comments, SLA reminders/escalation
- Maintenance billing (generate, dues, defaulters, corrections)
- Payments (Razorpay + cash/cheque/NEFT, receipts, history)
- Notices with read acknowledgment
- Notifications (in-app, email, web push)
- Ops + finance dashboards; audit log UI

### Phase 2 ops (promoted for demo)

Visitor pre-register + check-in/out, parking lot assign/release, clubhouse booking with confirm/cancel, asset register, vendor directory, society events with RSVP. Platform commercial: plans, subscriptions, feature flags, platform invoices, announcements, support inbox.

### Out of scope (future — after Phase 2)

Staff attendance, CCTV requests, advanced vendor procurement, marketplace, AI assistant, builder edition, municipal extensions, WhatsApp inbound complaint channel, Razorpay live checkout.

## 9. Constraints and assumptions

- SMS OTP (MSG91) and Google SSO for India pilot; PIN is device/app unlock after verified identity.
- Voice-to-text relies on browser speech APIs where available.
- Deliver as a **simple responsive web app** (not a native app for MVP); UX must stay simple for non-technical users.
- Committees have limited technical expertise; UX must stay simple.
- Pilot validates product-market fit at Keshav Heights before broad sales motion.
