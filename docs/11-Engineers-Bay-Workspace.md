# Engineers Bay — Workspace and domain

**Document:** 11-Engineers-Bay-Workspace  
**Status:** In progress (29 Aug 2026)  
**Related:** [10-Go-Live](10-Go-Live.md)

Company identity for SocietyHub and future products. Product domain is **not** bought yet.

## Locked

| Item | Value |
|------|--------|
| Brand | Engineers Bay |
| Legal later | Engineers Bay Technologies Private Limited |
| Domain | **engineersbay.in** |
| Workspace | **Base** (India), 1 user, 14-day trial then promo |
| Mail | `sandesh@engineersbay.in` |
| Product domain | Deferred |
| GCP project | **SocietyHub** / `societyhub-507013` (org `engineersbay.in`) |
| OAuth Web | `societyhub-web` — Client ID in [10-Go-Live](10-Go-Live.md) §4.2 |

## Task status

| Task | Status |
|------|--------|
| Lock company name + `engineersbay.in` | **Done** |
| Buy domain in Workspace signup + verify primary | **Done** |
| Activate Gmail | **Done** (sends; first test landed in personal Spam) |
| DKIM + SPF + DMARC | **In progress** |
| 2-Step Verification | **Not done** |
| Second seat `admin@` | **Skipped** (saves money until a colleague joins) |
| Product domain (`societyhub.in` or other) | **Deferred** |
| Google Sites company page | **Optional / not started** |
| Point [10-Go-Live](10-Go-Live.md) at `@engineersbay.in` | **Done** (company mail); product host still TBD |
| GCP **SocietyHub** / `societyhub-507013` + Web OAuth `societyhub-web` | **Done** (29 Aug 2026). Do not create another project. |
| Android OAuth clients | **Done.** `societyhub-android` = upload SHA-1 (30 Aug 2026). Play classical SHA-1 already registered. Play PQC client created 10 Sep 2026 (Go-Live §4.2). App still uses Web client as `serverClientId`. |

## Next for you (Admin) — DKIM / SPF / DMARC

Exact clicks: plan section **Do now — DKIM / SPF / DMARC** in [.cursor/plans/company_workspace_domains_64abcbad.plan.md](../.cursor/plans/company_workspace_domains_64abcbad.plan.md).

1. [Authenticate email](https://admin.google.com/ac/apps/gmail/authenticateemail) → Generate new record → Start authentication.
2. SPF TXT if missing: `v=spf1 include:_spf.google.com ~all` (one SPF only).
3. DMARC TXT `_dmarc`: `v=DMARC1; p=none; rua=mailto:sandesh@engineersbay.in`
4. Wait, send a normal mail, **Show original** → SPF PASS + DKIM PASS.
5. Then turn on 2-Step Verification.

## What not to buy yet

Product domain, `engineersbay.com`, extra Workspace seats, Azure, Play, Apple, MCA/GST.

Full click-through: [.cursor/plans/company_workspace_domains_64abcbad.plan.md](../.cursor/plans/company_workspace_domains_64abcbad.plan.md).
