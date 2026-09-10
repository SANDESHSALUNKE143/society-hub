# CI/CD — current pipelines

**Document:** 12-CICD  
**Product:** SocietyHub  
**Related:** [Go-Live](10-Go-Live.md), [Local development](08-Local-Development.md), [`devops/PIPELINE.md`](../devops/PIPELINE.md)

This is the operator map of **what runs today**. Do not invent extra environments. Do **not** commit keystores, `key.properties`, or Play/Apple JSON.

## 1. Git flow (do not skip)

```text
feature/<name>  →  PR  →  staging  →  Promote preview  →  main  →  Render Hobby
                     CI                 CI                         auto-deploy
```

| Branch | Role |
|--------|------|
| `feature/…` | Daily work. Open a PR into **`staging`**. |
| `staging` | Integration. Default PR target. |
| `main` | **Render preview only.** Update via **Promote preview**, not a feature PR into `main`. |

PRs into `main` from any branch other than `staging` fail **Promote guard**.

**Now (preview):** Render Hobby + TiDB. One stack.  
**Later:** Azure staging/production (workflows exist, idle until Azure secrets exist).

## 2. Workflows

| Workflow | File | When | What |
|----------|------|------|------|
| **CI** | `.github/workflows/ci.yml` | Push/PR to `staging` or `main` | MySQL 8 service, migrate, seed, `bun run quality` (lint, test, build web + API), Terraform fmt/validate |
| **Promote guard** | `promote-guard.yml` | PR into `main` | Head must be `staging` |
| **Promote preview** | `promote-preview.yml` | **Manual** (Actions → Promote preview) | Merge `staging` → `main`. Render rebuilds API + Client + Manage |
| **Mobile CI** | `mobile.yml` | PR/push `apps/mobile/**` or `mobile.yml`; dispatch; tag `mobile-v*` | See §3 |
| **Deploy staging** | `deploy-staging.yml` | Manual | Azure later — idle |
| **Deploy production** | `deploy-production.yml` | Manual + reviewers | Azure later — idle |

Web preview does **not** wait for Mobile CI. A mobile-only PR still runs **CI** (whole monorepo quality) plus **Mobile** analyze/test.

## 3. Mobile CI (Android first)

| Job | Trigger | Output |
|-----|---------|--------|
| Analyze + test | Every mobile PR/push | `flutter analyze` + `flutter test` |
| Android AAB | **Manual** Mobile CI, or tag `mobile-v*` | Signed `app-release.aab` artifact (needs keystore secrets) |
| Play internal | AAB job + `ENABLE_PLAY_UPLOAD=true` + `upload_play` | Upload + roll out **internal**. Never production |
| iOS IPA | Same + `ENABLE_IOS_IPA=true` + `build_ios` | Skipped until Apple secrets |

**Package / application id:** `com.societyhub.societyhub_mobile`

**How to build an AAB in CI**

1. GitHub → **Actions** → **Mobile CI** → **Run workflow**
2. Use workflow from the **`staging`** git branch (or `main` after promote). Store jobs always use GitHub environment **`prod`**.
3. Tick `upload_play` to upload and roll out to Play **internal**. Leave `build_ios` off until Apple. Production and closed testers stay in the Console.
4. Download artifact `societyhub-android-aab`

Production promote stays a Console click (staged 20% → 100%).

Local AAB (same signing): `apps/mobile/README.md` + `android/key.properties` (gitignored).

## 4. Render (preview host)

| Service | Typical URL | Deploys from |
|---------|-------------|----------------|
| API | `https://societyhub-api-ece6.onrender.com` | `main` (Docker). Render added the `-ece6` suffix; do **not** use `societyhub-api.onrender.com` (that host is not this API). |
| Client App | `https://societyhub-client.onrender.com` | `main` (static) |
| Manage | `https://societyhub-manage.onrender.com` | `main` (static) |

Hobby **cold start** can take ~1 minute. Mobile HTTP timeouts are 90s for that reason.

Privacy / terms (Play + OAuth): `https://societyhub-client.onrender.com/privacy` and `/terms`.

Preview login may still use `DEV_AUTH=true` + OTP `123456`. Store builds must hit an API with `DEV_AUTH=false`.

## 5. Secrets and variables (GitHub)

Repo + environments `staging`, `prod`, `production`. Mobile store jobs always use GitHub environment **`prod`**. The `staging` git branch is still the PR target; it is not a Mobile CI environment choice.

| Kind | Name | Used by |
|------|------|---------|
| Secret | `ANDROID_KEYSTORE_BASE64` | AAB signing |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | AAB signing |
| Secret | `ANDROID_KEY_PASSWORD` | AAB signing |
| Secret | `ANDROID_KEY_ALIAS` | Usually `upload` |
| Variable | `MOBILE_API_BASE_URL` | Flutter `--dart-define` (Render API today) |
| Variable | `GOOGLE_SERVER_CLIENT_ID` | Web OAuth client ID (API audience) |
| Variable | `PRIVACY_POLICY_URL` | In-app + listing |
| Variable | `ENABLE_PLAY_UPLOAD` | Leave unset/`false` until Play app exists |
| Variable | `ENABLE_IOS_IPA` | Leave unset until Apple |
| Secret | `PLAY_SERVICE_ACCOUNT_JSON` | Only when Play upload is on |
| Secret | Azure / `SWA_*` / OIDC | Idle until Azure |

Upload keystore lives only on the operator Mac (`apps/mobile/android/upload-keystore.jks`) and in GitHub secrets. Never in git.

GCP OAuth (already created): project `societyhub-507013`, Web `societyhub-web`, Android `societyhub-android`. IDs: [10-Go-Live](10-Go-Live.md) §4.

## 6. What is not automated

- Play **Create app**, store listing, Data safety, content rating  
- Play **production** rollout  
- Identity / device verification on the Play developer account  
- iOS / TestFlight  
- Azure apply  

## 7. Day-to-day commands

```text
# Land work
git checkout staging && git pull
git checkout -b feature/short-name
# … commit …
gh pr create --base staging
# merge when CI is green

# Put it on Render
GitHub → Actions → Promote preview → Run workflow

# Signed Android bundle (after keystore secrets)
GitHub → Actions → Mobile CI → Run workflow (git branch staging; environment prod)
```

More click-through for accounts and Play: [10-Go-Live](10-Go-Live.md). Local Flutter: [08-Local-Development](08-Local-Development.md) §12 and [`apps/mobile/README.md`](../apps/mobile/README.md).
