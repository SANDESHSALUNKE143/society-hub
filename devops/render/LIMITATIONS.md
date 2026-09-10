# Render free preview — limitations

This is a **$0 preview** environment. It is **not** production. Azure remains the paid path after Phase 1 UAT ([`devops/azure/`](../azure/), [`COST.md`](../COST.md)).

## What is free

| Piece | Render Hobby | Caveat |
|-------|----------------|--------|
| API (Docker web service) | Free instance | Sleeps after ~15 min idle; cold start ~30–90s |
| Client + Manage static sites | Free CDN | Fine for preview |
| Instance hours | 750 / month | Watch Billing → Monthly Included Usage |
| Bandwidth / pipeline minutes | Limited included quota | Workspace suspends if you exceed without a card |

## What is not durable

- **No persistent disk** on free. `UPLOAD_DIR` is wiped on spin-down and redeploy. Complaint photos do not survive. Azure Blob later.
- **Do not** create Render Postgres or Key Value. Postgres on free expires in 30 days and is the wrong engine. Use **TiDB Serverless** (MySQL protocol).
- **Do not** add a credit card for the first days. Overage then **suspends** instead of billing.
- **Do not** pick Pro ($25) or Scale.

## Auth and data

- Preview uses `DEV_AUTH=true` and a documented OTP. No real society PII.
- MSG91 / Google prod secrets stay optional until Azure staging.

## CI/CD

- **CI:** GitHub Actions `ci.yml` (lint, test, migrate, quality) on `main` / `staging`.
- **CD (preview):** Render **auto-deploy** from the connected GitHub branch. No Azure secrets required.
- **CD (later paid):** existing `deploy-staging.yml` / `deploy-production.yml` stay idle until Azure exists.

## Later (when you can pay)

Do not grow this free stack into production. Follow [`devops/azure/`](../azure/) — Container Apps + Static Web Apps + MySQL Flexible + Blob — then turn Render off.
