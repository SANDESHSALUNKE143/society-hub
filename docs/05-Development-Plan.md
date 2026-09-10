# Development Plan

**Document:** 05-Development-Plan  
**Product:** SocietyHub  
**Version:** 1.2  
**Related:** [PRD](02-PRD.md), [Architecture](03-Architecture.md)

## 1. Approach

No sprint calendar. Delivery:

1. Spec defines **MVP (complaint portal)** and **Phase 2 (full ops)** — see PRD
2. GitHub: `scope:mvp` for MVP; Phase 2 stories use `scope:future` until Phase 2 starts
3. **Develop Phase 1** — working Complaints + auth/onboard; nav shows other planned features as **Coming soon**
4. **DevOps phase (after Phase 1 code):** Docker finalize → Azure staging → UAT → production ([devops/](../../devops/README.md))
5. **Phase 2** — replace Coming soon with real billing, payments, notices, etc.
6. Future modules remain after Phase 2

Docker templates and Azure staging/production guides are maintained under `devops/` now so deployment is ready when Phase 1 development completes — **do not** burn production Azure spend before the app is ready.

## 2. MVP epic backlog

| Epic | Focus |
|------|--------|
| E1 Platform & tenancy | Shell, tenant isolation, Admin vs Resident RBAC |
| E2 Authentication | SSO (Google), mobile OTP, set/use PIN, login/logout |
| E3 Onboarding | Onboard Admin, flats, onboard Residents |
| E5 Complaints (MVP) | Raise (title, type, auto flat, description, voice-to-text, photo/video), lists, status |

## 3. Phase 2 epic backlog (retained — do not drop)

| Epic | Module | PRD focus |
|------|--------|-----------|
| E3+ Society (extended) | society | Full hierarchy, settings, role assignment (FR-SOC-*) |
| E4 Resident (extended) | resident | Owners/tenants, profile, verification docs (FR-RES-*) |
| E5 Complaints (advanced) | complaints | Assigned, comments, SLA (FR-CMP-P2-*) |
| E6 Maintenance billing | billing | Generate, dues, corrections (FR-BIL-*) |
| E7 Payments | payments | Razorpay, manual, receipts (FR-PAY-*) |
| E8 Notices | notices | Publish, read tracking (FR-NOT-*) |
| E9 Notifications | notifications | In-app, email, web push (FR-NTF-*) |
| E10 Dashboards & reports | dashboards | Ops + finance + resident home (FR-DSH-*) |
| E11 Audit trail | audit | audit_logs UI (FR-AUD-*) |
| E12 Future scope | future | iOS store listing, WhatsApp, visitor, parking, etc. |

## 4. MVP implementation order

1. Platform + Auth (OTP, Google SSO, PIN) + logout  
2. Onboard Admin + onboard Resident (flat binding)  
3. Raise complaint form (title, type, auto flat, description, mic, media)  
4. Resident complaint list + status; Admin all-complaints list + status update  
5. Finalize Dockerfiles against real apps; local compose smoke  
6. **DevOps:** provision Azure staging (cost-aware) → deploy → pilot UAT  
7. **DevOps:** production promote (same image tags)  

## 5. Phase 2 suggested order (after MVP + prod pilot)

1. Expand roles + society settings + resident/tenant model  
2. Advanced complaints (assign, comments, SLA) + notifications  
3. Billing + payments  
4. Notices + dashboards + audit UI  
5. Phase 2 UAT  

## 6. Definition of done (user story)

- Meets GitHub acceptance criteria and matching PRD FR-*
- Tenant-scoped; RBAC enforced for the release’s roles
- Zod at API boundary
- Tests for auth, complaints, and (in Phase 2) money paths when touched

## 7. Pilot UAT criteria

### MVP (Keshav Heights)

- Admin and at least one resident onboarded
- Resident logs in with OTP or Google; can set PIN and use it
- Resident raises complaint with title, type, auto flat, description (typed and/or voice), photo and/or video
- Resident sees complaint status; Admin sees all and can change status
- Logout works

### Phase 2 (later)

- Bills generated; online payment succeeds; receipts available
- Notice published with read counts
- SLA reminders fire; dashboards usable; audit entries for bill/role changes

## 8. Dependencies and risks

| Risk | Mitigation |
|------|------------|
| SMS OTP | MSG91; rate limits |
| Speech API gaps | Graceful disable mic; typing always works |
| Large video uploads | Size limits + Blob |
| Scope creep | Phase 2 stays labeled until MVP ships |
| Payment webhooks (Phase 2) | Idempotent handlers + Treasurer manual match |

## 9. Tracking

- MVP: `label:scope:mvp`
- Phase 2 backlog: `label:scope:future` + module labels (promote when Phase 2 starts)
- Future: Epic #12 and related placeholders
