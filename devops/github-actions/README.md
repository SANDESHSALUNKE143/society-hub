# GitHub Actions (CI/CD)

**Branch flow:** [PIPELINE.md](../PIPELINE.md) — feature → `staging` → Promote preview → `main` → Render.

Live workflows live in [`.github/workflows/`](../../.github/workflows/).  
Full buy/host/SSO checklist: [docs/10-Go-Live.md](../../docs/10-Go-Live.md).

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | PR / push to `staging` or `main` | MySQL service, migrate, seed, `bun run quality`, Terraform fmt/validate |
| `promote-guard.yml` | PR into `main` | Fail unless the head branch is `staging` |
| `promote-preview.yml` | Manual | Merge `staging` → `main` (Render then auto-deploys) |
| `mobile.yml` | Changes under `apps/mobile/` | `flutter analyze` + `flutter test` |
| `deploy-staging.yml` | Manual | Azure only — idle until secrets exist |
| `deploy-production.yml` | Manual + `production` reviewers | Azure only — idle until secrets exist |

Examples in this folder are historical templates. Prefer the workflows under `.github/workflows/`.

## Required GitHub config

- Environments: `staging`, `production` (production = required reviewers)
- Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_NAME`, `ACR_LOGIN_SERVER`, `AZURE_RESOURCE_GROUP`, `CONTAINER_APP_NAME`, `SWA_TOKEN_CLIENT`, `SWA_TOKEN_MANAGE`, `VITE_API_URL`

Use **OIDC** (`azure/login` federated credentials). Do not store a long-lived Azure password.
