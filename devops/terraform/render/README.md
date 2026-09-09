# Render free preview (Terraform)

Creates **1 Docker API** + **2 static sites** on Render Hobby ($0).  
Limitations: [`../render/LIMITATIONS.md`](../../render/LIMITATIONS.md).  
Azure later: [`../azure/`](../../azure/).

## CI/CD

| Layer | What runs |
|-------|-----------|
| **CI** | `.github/workflows/ci.yml` on push/PR to `staging` / `main` |
| **CD preview** | Promote `staging` → `main` ([PIPELINE.md](../../PIPELINE.md)); Render auto-deploys `main` |
| **CD Azure** | Manual `deploy-staging.yml` — idle until Azure exists |

Connect **GitHub → Render** before `terraform apply`, or deploys cannot clone the repo.

## One-time (you click)

1. Render account `sandesh@engineersbay.in`, workspace **societyhub**, plan **Hobby**. No card. No Render Postgres.
2. [Connect GitHub](https://dashboard.render.com/select-repo) → grant **engineersbay/society-hub** (org `engineersbay`).
3. API key: Account Settings → API Keys. Keep it in `~/.zshrc` as `RENDER_API_KEY` only.
4. [TiDB Cloud Serverless](https://tidbcloud.com/) — create cluster + database `societyhub`. Build `DATABASE_URL`:
   `mysql://USER:PASSWORD@HOST:4000/societyhub` (URL-encode `@` as `%40` in the password).
5. Owner ID (locked): `tea-da9bsdlg1s2s739u3g7g`.

## Apply

```bash
cd devops/terraform/render
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — database_url + jwt_secret

export RENDER_API_KEY   # from ~/.zshrc
export RENDER_OWNER_ID=tea-da9bsdlg1s2s739u3g7g

terraform init
terraform plan
terraform apply
```

Note outputs `api_url`, `client_url`, `manage_url`. If they differ from `https://societyhub-*.onrender.com`, set `cors_origin_override` and apply again.

## First boot

1. `GET {api_url}/health` — expect `{ "ok": true, "service": "society-hub-api" }`. Cold start can take ~1 min. Render often serves this as `https://societyhub-api-ece6.onrender.com`, **not** `https://societyhub-api.onrender.com`. Use the Terraform `api_url` output (and the same value for GitHub `MOBILE_API_BASE_URL`).
2. Seed once (free has no shell). Temporarily set the API start command in the dashboard to:
   `sh -c "bun run src/db/migrate.ts && bun run src/db/seed.ts && bun run src/index.ts"`  
   deploy, then change it back to the image default (`/app/api-start.sh`).
3. Open client + manage. Preview login: `DEV_AUTH` + OTP `123456` (unless you changed `dev_otp_code`).

## Day to day

Merge features to `staging`. When you want the preview updated, run **Promote preview** (Actions). That updates `main`; Render rebuilds. Watch Billing → Monthly Included Usage.

## Smoke

- [ ] `/health` returns ok
- [ ] Client loads over HTTPS and can call the API
- [ ] Manage loads over HTTPS
- [ ] Login works
- [ ] Google tab shows the GIS button (needs `VITE_GOOGLE_CLIENT_ID` + an onboarded email)
- [ ] Create one complaint on client; it lists on manage
