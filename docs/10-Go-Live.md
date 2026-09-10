# Go-live — cheapest path (Workspace, Azure, Google SSO, stores)

**Document:** 10-Go-Live  
**Product:** SocietyHub  
**Related:** [Tech Stack](07-Tech-Stack.md), [Architecture](03-Architecture.md), [DevOps](../devops/README.md), [API](09-API.md)

This is the **source of truth** for buying accounts, hosting, Google SSO, and Play / App Store.  
Do **not** put residents on Workspace. Product login stays **OTP + Google (any Gmail) + PIN**.

**Company mail (live):** Workspace Base on **`engineersbay.in`** — `sandesh@engineersbay.in`. Setup notes: [11-Engineers-Bay-Workspace](11-Engineers-Bay-Workspace.md).  
**Product domain:** not bought yet (do not put Workspace on SocietyHub).

**Preview host (now, $0):** Render Hobby + TiDB — [`devops/terraform/render/README.md`](../devops/terraform/render/README.md). Azure deploy workflows stay idle until UAT.

---

## 1. What to buy now (cheapest)

| Item | Buy | Why | Approx. cost (India, Aug 2026) |
|------|-----|-----|--------------------------------|
| Domain | `societyhub.in` (or `.app` if taken) | Email, OAuth, `app.` / `manage.` / `api.` | ~₹700–1,500 / year |
| **Google Workspace** | **Business Base**, **1–2 users**, buy **direct from Google** | Company email + GCP org | **₹99 / user / month** annual (~₹120 flexible) + 18% GST |
| Google Cloud OAuth | Free (same Google account / org) | Sign in with Google for web + mobile | ₹0 |
| Azure | **Pay-as-you-go** or **free $200 trial**, region **Central India** | Host API + web | Staging ~₹1,700–3,000 / month (MySQL is most of it) |
| Google Play | Play Console | Android release | **$25 one-time** |
| Apple | Apple Developer Program | iOS / TestFlight | **$99 / year** (~₹8,300) |

### Workspace: pick Base, not Starter

| Plan | Price (annual) | Users | Storage | Buy how |
|------|----------------|-------|---------|---------|
| **Business Base (India only)** | **₹99 / user / mo** | Max 20 | 20 GB pooled | [workspace.google.com](https://workspace.google.com/intl/en_in/) self-serve |
| Business Starter | ₹270 / user / mo | Max 300 | 30 GB | Partner or Google |
| Standard / Plus | ₹1,080+ | Max 300 | 2–5 TB | Later |

Start with **2 seats** (`sandesh@…`, `admin@…`). Annual is cheaper; use **flexible monthly** if you want to cancel in 30 days.

**14-day trial first.** Enable **2-Step Verification** on day one.

Do **not** buy seats for Keshav Heights residents.

---

## 2. Do this in order (do not skip)

```text
1. Domain
2. Workspace Business Base (2 users) + 2SV
3. Google Cloud — project + Web + Android clients DONE (iOS later)
4. Azure staging only (not production) — preview is Render Hobby today
5. GitHub secrets + environment `prod`
6. Push → CI green → Promote preview (`staging` → `main`)
7. Play internal live; confirm Google Sign-In on a Play install + Apple later
8. Wire GOOGLE_CLIENT_ID on Render + Flutter (Web client ID is known)
```

Production Azure and store **production** tracks come after staging UAT.

---

## 3. Domain + Workspace (you click)

1. Buy the domain (Google Domains / Squarespace, GoDaddy, Namecheap).
2. Sign up: [Google Workspace Business Base](https://workspace.google.com/intl/en_in/pricing.html) → **India** → **Base**.
3. Verify the domain (TXT record).
4. Create users: `sandesh@engineersbay.in` (live). Add `admin@` only when you need a second paid seat.
5. In Admin console → Gmail → set **SPF, DKIM, DMARC** (needed later for Resend too).
6. Admin → Security → 2-Step Verification: **on**, enforce for all users.

Keep the **Workspace admin** login in a password manager. This account owns the Google Cloud org.

---

## 4. Google Cloud + SSO clients (₹0)

Workspace does **not** turn on product SSO. OAuth lives in Google Cloud.

**Do not create a second GCP project.** Use the live project below. Do not click Gemini, Deploy, VM, or the $300 trial for Sign-In — OAuth is free without billing.

### 4.1 Project (done — 29 Aug 2026)

| Field | Value |
|-------|--------|
| Console | [console.cloud.google.com](https://console.cloud.google.com) as `sandesh@engineersbay.in` |
| Organisation | `engineersbay.in` |
| Project name | **SocietyHub** |
| Project ID | `societyhub-507013` |
| Project number | `583640086898` |
| Billing | Not required for OAuth |

Consent / branding (Google Auth platform):

- User type: **External** (residents use personal Gmail)
- App name: `SocietyHub`
- Support email: `sandesh@engineersbay.in`
- Homepage / privacy / terms: Client App on Render (`/`, `/privacy`, `/terms`)
- Authorized domain: `engineersbay.in` only (do **not** add `onrender.com`; add `societyhub.in` after that domain exists)
- Scopes: `openid`, `email`, `profile` only
- Publishing: **Testing** + test users until Play is live; then Publish

### 4.2 OAuth clients

| Client type | Name | Status | Used by |
|-------------|------|--------|---------|
| **Web** | `societyhub-web` | **Done** (29 Aug 2026) | `apps/client-app`, `apps/manage` (reuse), API `GOOGLE_CLIENT_ID` |
| **Android** | `societyhub-android` | **Done** (30 Aug 2026) | Flutter Play / debug |
| **iOS** | `societyhub-ios` | Skip until TestFlight | Flutter iOS |

**Web client ID (public; not a secret):**

```text
583640086898-uhmdenf6kpv8iskvdaju4pk4gpbmae20.apps.googleusercontent.com
```

Use this as Render `GOOGLE_CLIENT_ID`, GitHub `GOOGLE_SERVER_CLIENT_ID`, and Flutter `--dart-define=GOOGLE_SERVER_CLIENT_ID=…`. Do **not** put the Web client **secret** in the Flutter app or this repo.

**Web client — authorised JavaScript origins and redirect URIs (already set, same list)**

Google rejects `*.localhost` hostnames. Loopback + live preview hosts are on `societyhub-web`:

```text
http://localhost:5173
http://localhost:5174
http://127.0.0.1:5173
http://127.0.0.1:5174
https://societyhub-client.onrender.com
https://societyhub-manage.onrender.com
```

Add `https://app.societyhub.in` and `https://manage.societyhub.in` after the product domain exists. Do not add `onrender.com` as an OAuth authorized domain (you do not own it). Branding authorized domain is `engineersbay.in`.

**Android client (done)** — package `com.societyhub.societyhub_mobile`.

Google Auth Platform allows **one SHA-1 per Android client**. Sign-In matches **package + SHA-1** across every Android client in the project. Do **not** overwrite the SHA-1 on `societyhub-android` (that is the upload key). Add extra Android clients with the same package.

| Client name | SHA-1 | Used for |
|-------------|--------|----------|
| `societyhub-android` | `A7:05:A3:91:D4:DC:D7:7F:6F:84:6A:32:36:2D:10:B4:8E:CE:76:E2` | Upload / CI AAB |
| `societyhub-android-debug` | `E8:49:BF:F4:F0:C5:9B:A2:96:CC:61:E0:1F:9C:29:A5:D2:C2:D7:57` | Local `flutter run` |
| `societyhub-android-play` | `79:4C:A5:3F:6D:98:95:0A:C3:8A:10:50:04:CD:81:09:9B:3E:C0:5F` | Play classical signing |
| `societyhub-android-play-pqc` | `21:0E:39:37:AF:CD:CB:1D:3E:4E:12:ED:D1:3F:AF:AF:66:6B:99:E6` | Play post-quantum signing |

**Play SHA-1s (10 Sep 2026):**

- Classical `79:4C:A5:3F:…` — already registered (Create said package + fingerprint in use). Do not create again.
- PQC `21:0E:39:37:…` — Android client created (`societyhub-android-play-pqc`, client id `583640086898-9stsb90vslhphs56gqv65445pjj57qk6`).
- If local Google Sign-In fails, add `societyhub-android-debug` with the debug SHA-1 above.
- Flutter `serverClientId` stays the **Web** client (`societyhub-web`). Never put an Android client ID or downloaded `client_secret*.json` in the app or git.
- Play Console path for fingerprints: **Protected with Play → Play Store protection → Manage Play app signing** (not the old App integrity page).
- After any new Android client, wait 5–10 minutes (sometimes longer) and test Google Sign-In on a **Play internal** install. If consent is Testing, add tester Gmails on the OAuth audience / test-users list.

If Create says **package name and fingerprint are already in use**, that SHA-1 is already registered. Open [Clients](https://console.cloud.google.com/auth/clients?project=societyhub-507013) and test Play Google Sign-In instead of creating another client.

Print local fingerprints (does not print passwords):

```bash
cd apps/mobile && bash scripts/print-android-sha1.sh
```

```bash
# Debug SHA-1 only
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android
```

**iOS client**

- Bundle ID: `com.societyhub.societyhubMobile`
- Copy the iOS URL scheme Google shows (`com.googleusercontent.apps.…`) into Xcode later

### 4.3 How tokens are verified (product rule)

Mobile and web send a Google **ID token** to `POST /v1/auth/google`.

On mobile, set **server client ID** = the **Web** client ID. The API then checks `aud == GOOGLE_CLIENT_ID`.

| App | Who may sign in |
|-----|-----------------|
| Client App | Any Google account, **only if** that email/phone is already onboarded |
| Manage | Only `@societyhub.in` (enforce `hd` / email domain in API when we wire real SSO) |

Residents without Gmail keep **MSG91 OTP**.

**Today in code:** `POST /v1/auth/google` verifies a Google ID token against `GOOGLE_CLIENT_ID` (tokeninfo `aud` + verified email), then signs in only if that email or `google_sub` is already onboarded. `dev:<phone>` still works when `DEV_AUTH=true` or the client ID is unset. Client App and Manage show the GIS button when `VITE_GOOGLE_CLIENT_ID` is set.

**Manage `@societyhub.in` lock** waits until the product domain exists. Preview accepts any onboarded email.

---

## 5. Host on Azure (cheapest staging)

Spec: Container Apps + Static Web Apps + MySQL Flexible. **No AKS.**  
Region: **Central India**.  
Provision **staging only** until UAT passes.

### 5.1 Resource names

| Resource | Name |
|----------|------|
| Resource group | `rg-societyhub-staging` |
| Container Apps env | `cae-societyhub-staging` |
| API app | `ca-societyhub-api-staging` |
| ACR (shared) | `societyhubacr` (must be globally unique — add digits if taken) |
| MySQL | `mysql-societyhub-staging` |
| Storage | `stsocietyhubstaging` |
| Key Vault | `kv-societyhub-staging` |
| Static Web App (client) | `swa-societyhub-app-staging` |
| Static Web App (manage) | `swa-societyhub-manage-staging` |

### 5.2 Cheapest SKUs

| Resource | SKU | Why |
|----------|-----|-----|
| API | Container Apps, **0.25 vCPU**, **min replicas 0** | Scale to zero when idle |
| Client + Manage | Static Web Apps **Free** | HTTPS + custom domain later |
| MySQL | Flexible **B1ms**, 32 GB, Burstable | Largest cost — stop off-hours if the tier allows |
| Redis | **Do not create** | Phase 2 only |
| ACR | **Basic** | One registry for staging + later prod |
| Storage | Standard **LRS** | Complaint media |
| Key Vault | Standard | Secrets |
| App Insights | Basic, 30-day retention | Enough for pilot |

### 5.3 Public URLs (after custom domain)

| Host | App |
|------|-----|
| `https://app.societyhub.in` | Resident / society admin (`client-app`) |
| `https://manage.societyhub.in` | SocietyHub employees only |
| `https://api.societyhub.in` | Bun API |

Until DNS is ready, use the `*.azurecontainerapps.io` and `*.azurestaticapps.net` hostnames GitHub Actions print.

### 5.4 Azure one-time setup (you run)

Need: Azure subscription + [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) + Owner on the subscription.

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
az group create -n rg-societyhub-staging -l centralindia
```

Then create ACR, Key Vault, Storage, MySQL B1ms, Container Apps environment + API app, two Static Web Apps. Prefer **Bicep under `devops/azure/iac/`** (add when you are ready to apply). Until then, Azure Portal is fine if you match the names above.

**GitHub → Azure OIDC** (no long-lived password):

1. Create an App Registration / user-assigned identity.
2. Federated credential: repo `OWNER/society-hub`, environments `staging` and `production`.
3. Role: **AcrPush** on ACR, **Contributor** on `rg-societyhub-staging` only (not the whole subscription).

### 5.5 Key Vault secrets (staging)

| Name | Example / notes |
|------|-----------------|
| `DATABASE_URL` | `mysql://shuser:<pwd>@mysql-societyhub-staging.mysql.database.azure.com:3306/societyhub?ssl=true` |
| `JWT_SECRET` | 32+ random chars, **not** the local default |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID (`….apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Web client secret (server-side only; GIS idToken flow may not need it) |
| `MSG91_AUTH_KEY` | OTP; sandbox until pilot |
| `CORS_ORIGIN` | `https://app.societyhub.in,https://manage.societyhub.in` |
| `PUBLIC_API_URL` | `https://api.societyhub.in` |
| `PUBLIC_APP_URL` | `https://app.societyhub.in` |
| `DEV_AUTH` | **`false`** on staging/prod |

Container Apps references these secrets. Never commit them.

---

## 6. CI/CD (in this repo)

Operator map of every pipeline: **[12-CICD](12-CICD.md)**. Short git rules: [`devops/PIPELINE.md`](../devops/PIPELINE.md).

Workflows:

| File | When | What |
|------|------|------|
| `.github/workflows/ci.yml` | PR + push to `staging` / `main` | MySQL service, migrate, seed, `bun run quality`, Terraform fmt/validate |
| `.github/workflows/promote-preview.yml` | **Manual** | Merge `staging` → `main` (Render preview) |
| `.github/workflows/promote-guard.yml` | PR into `main` | Only `staging` may target `main` |
| `.github/workflows/mobile.yml` | PR/push `apps/mobile/**`; dispatch; tags `mobile-v*` | Analyze + test; **Android AAB**; Play internal upload skipped until `ENABLE_PLAY_UPLOAD`; **iOS IPA** skipped until `ENABLE_IOS_IPA` |
| `.github/workflows/deploy-staging.yml` | **Manual** (`workflow_dispatch`) | Azure later — idle until secrets exist |
| `.github/workflows/deploy-production.yml` | **Manual** + environment approval | Azure later — idle until secrets exist |

Git flow: [devops/PIPELINE.md](../devops/PIPELINE.md).

### 6.1 GitHub settings (you click)

**Settings → Environments**

- `staging` — no reviewers required
- `production` — **required reviewers** (you)

**Settings → Secrets and variables → Actions** (and/or per-environment)

| Secret | Used by |
|--------|---------|
| `AZURE_CLIENT_ID` | OIDC login |
| `AZURE_TENANT_ID` | OIDC login |
| `AZURE_SUBSCRIPTION_ID` | OIDC login |
| `ACR_LOGIN_SERVER` | e.g. `societyhubacr.azurecr.io` |
| `ACR_NAME` | e.g. `societyhubacr` |
| `AZURE_RESOURCE_GROUP` | `rg-societyhub-staging` |
| `CONTAINER_APP_NAME` | `ca-societyhub-api-staging` |
| `SWA_TOKEN_CLIENT` | Client-app Static Web App deployment token |
| `SWA_TOKEN_MANAGE` | Manage Static Web App deployment token |
| `VITE_API_URL` | Public API URL baked into web builds |

**Production** environment: same names, production values. Add `IMAGE_TAG` at dispatch time (git SHA already on staging).

Do **not** put Android keystores or Apple keys in the repo.

**Mobile Environments** (reuse `staging` / `production`, or add `mobile-staging` / `mobile-prod`):

| Kind | Name | Used by |
|------|------|---------|
| Variable | `MOBILE_API_BASE_URL` | AAB / IPA dart-define |
| Variable | `GOOGLE_SERVER_CLIENT_ID` | Web OAuth client (API audience) |
| Variable | `PRIVACY_POLICY_URL` | In-app + store listing (default `https://app.societyhub.in/privacy`) |
| Variable | `ENABLE_IOS_IPA` | Set `true` to run the IPA job |
| Variable | `ENABLE_PLAY_UPLOAD` | Set `true` to upload the AAB and roll out Play **internal**. Never production. |
| Secret | `ANDROID_KEYSTORE_BASE64` | AAB signing |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | AAB signing |
| Secret | `ANDROID_KEY_PASSWORD` | AAB signing |
| Secret | `ANDROID_KEY_ALIAS` | AAB signing (usually `upload`) |
| Secret | `PLAY_SERVICE_ACCOUNT_JSON` | Play Developer API (JSON). Internal track only. |
| Secret | `ASC_API_KEY` / `ASC_KEY_ID` / `ASC_ISSUER_ID` | IPA / TestFlight (later) |

---

## 7. Android first (Flutter) — iOS next

The app is `apps/mobile/` — one codebase. **This phase ships Android** (`com.societyhub.societyhub_mobile`) to Play. iOS (`com.societyhub.societyhubMobile`) uses the same Dart code; store listing waits until Android is on an internal Play track.

Local debug: [apps/mobile/README.md](../apps/mobile/README.md) and [08-Local-Development.md](08-Local-Development.md) §12.

**Google Sign-In:** `ENV=dev` may send `dev:<phone>`. Staging/prod send a real Google ID token. Set `GOOGLE_CLIENT_ID` on the API and `GOOGLE_SERVER_CLIENT_ID` (same Web client) in the Flutter build.

### 7.1 Accounts

1. [Google Play Console](https://play.google.com/console) — $25, same Google account as Workspace admin is fine.
2. [Apple Developer](https://developer.apple.com/programs/) — $99/year, **individual** is enough for the pilot (D-U-N-S later if you incorporate).
3. Create apps:
   - Play: `SocietyHub` / application id `com.societyhub.societyhub_mobile`
   - App Store Connect: bundle `com.societyhub.societyhubMobile`

### 7.2a Default store listing (en-IN)

Assets live in [`apps/mobile/store/`](../apps/mobile/store/).

| Field | Value |
|---|---|
| App name | SocietyHub |
| Short description | Raise and track housing society complaints from your phone. |
| Full description | See below |
| App icon | `apps/mobile/store/icon-512.png` |
| Feature graphic | `apps/mobile/store/feature-graphic-1024x500.png` |
| Phone screenshots | `screenshot-01` … `screenshot-04` in the same folder |
| Video | empty |
| Website | `https://societyhub-client.onrender.com` |
| Privacy | `https://societyhub-client.onrender.com/privacy` |
| Delete-data URL | same privacy URL |

Full description:

```
SocietyHub helps housing-society residents raise and track complaints in one place.

You must already be onboarded by your society admin. Sign in with mobile OTP, Google, email, or a PIN. Then submit a complaint, add optional photos or video, and follow the ticket until it is resolved.

Committee members can review the queue, update status, and add a short note or evidence photos.

This app is for society operations. It is not a substitute for emergency services.

Privacy policy: https://societyhub-client.onrender.com/privacy
```

### 7.2 Local builds (no store)

```bash
cd apps/mobile
flutter pub get
flutter analyze && flutter test

# Android emulator → local API
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev

# iOS simulator
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Staging API (after host is up):

```bash
flutter run --release \
  --dart-define=API_BASE_URL=https://api.societyhub.in \
  --dart-define=ENV=staging
```

### 7.3 Store builds (after accounts)

```bash
# Android App Bundle (Play) — requires android/key.properties
flutter build appbundle --release \
  --dart-define=ENV=prod \
  --dart-define=API_BASE_URL=https://api.societyhub.in \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-client-id> \
  --obfuscate --split-debug-info=build/debug-info
```

**Android CI (thought through — no Flutter code change for Play):**

| Step | How | Auto? |
|------|-----|--------|
| Analyze + test | PR / push `apps/mobile/**` | Yes |
| Signed AAB | Actions → **Mobile CI** → Run workflow, or tag `mobile-v*` | Yes, after keystore secrets |
| First Play upload | Download the AAB artifact → Play **internal** track | **Manual** until identity unlocks **Create app** |
| Later uploads | Same workflow + `ENABLE_PLAY_UPLOAD=true` + `PLAY_SERVICE_ACCOUNT_JSON` | Internal track **completed** (testers can install). Never production. |
| Production | Play Console: promote internal → production, staged 20% → 100% | **Never** from CI |

Do **not** auto-publish production from `main` or every commit. First listing, Data safety, and content rating stay Console clicks.

Privacy policy until the product domain exists: `https://societyhub-client.onrender.com/privacy`. Data safety: account, phone, complaint photos/videos. No `DEV_AUTH` on the hosted API for store builds.

### 7.3a Next: iOS (do not block Android)

1. Apple Developer $99 + App Store Connect app, bundle `com.societyhub.societyhubMobile`.
2. Info.plist camera/photo usage strings, ATS HTTP only in Debug, Google iOS URL scheme.
3. Set `ENABLE_IOS_IPA=true` and ASC secrets; re-run Mobile CI with **Build IPA**.
4. TestFlight → App Store; privacy nutrition labels.

```bash
flutter build ipa --release \
  --dart-define=ENV=prod \
  --dart-define=API_BASE_URL=https://api.societyhub.in \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-client-id> \
  --obfuscate --split-debug-info=build/debug-info
```

### 7.4 Google Sign-In on mobile (after §4)

| Platform | Config |
|----------|--------|
| Android | `google_sign_in` + Android OAuth client (package + SHA-1) |
| iOS | URL scheme from iOS OAuth client in `Info.plist` |
| Both | `serverClientId` = **Web** `GOOGLE_CLIENT_ID` |
| API | Verify ID token; bind to onboarded user (`google_sub` / email) |

---

## 8. Monthly burn (pilot, 2 people)

| Line | Approx. |
|------|---------|
| Workspace Base × 2 + GST | ~₹230–280 |
| Domain (amortized) | ~₹80 |
| Azure staging (MySQL B1ms + ACR + idle ACA + SWA Free) | ~₹1,700–3,000 |
| Apple Developer (amortized) | ~₹700 |
| Play Console | $25 once |
| **Total run-rate** | **~₹2,700–4,000 / month** after one-time Play fee |

Cut Azure: stop MySQL nights/weekends; keep API min replicas at 0.  
Do **not** create production RG until staging UAT is green.

---

## 9. What is done in git vs what you still click

| Done | Still to do |
|------|-------------|
| Workspace `engineersbay.in`, GCP project `societyhub-507013`, Web + Android OAuth clients (upload + Play SHA-1s) | Confirm Play Google Sign-In on an internal install |
| `ci.yml` / `mobile.yml` / deploy workflows | Paste `GOOGLE_CLIENT_ID` on Render + GitHub `GOOGLE_SERVER_CLIENT_ID` |
| Flutter Android (OTP / password / PIN / Google / complaints) | Play identity approval, then create app + AAB |
| Privacy / terms on Client App | `DEV_AUTH=false` on hosted API for store builds |
| Play Console personal account (Engineers Bay) | Apple $99 when you want TestFlight |

---

## 10. Checklist

- [x] Workspace on `engineersbay.in` (`sandesh@engineersbay.in`)
- [x] GCP project **SocietyHub** / `societyhub-507013` + Web client `societyhub-web`
- [ ] Domain `societyhub.in` (or chosen TLD)
- [ ] 2SV, SPF/DKIM/DMARC
- [x] Paste Web client ID as GitHub `GOOGLE_SERVER_CLIENT_ID` (repo + `prod` env). Confirm `GOOGLE_CLIENT_ID` on Render if hosted web Google SSO fails.
- [x] Android OAuth clients: upload SHA-1 on `societyhub-android`; Play classical already registered; Play PQC client created 10 Sep 2026 (§4.2)
- [ ] iOS URL scheme (later)
- [ ] Azure `rg-societyhub-staging` in Central India
- [x] GitHub environment `prod` + mobile keystore / Play upload secrets
- [x] Preview CI green on `main` (Render Hobby)
- [x] Hosted API `/health` ok (`https://societyhub-api-ece6.onrender.com`)
- [ ] OTP login on hosted Client App (confirm after `DEV_AUTH=false`)
- [x] Play Console account (personal, Engineers Bay)
- [x] Play app + AAB on **internal** track (`1.0.3+4`)
- [ ] Confirm Google Sign-In on a **Play internal** install (wait after PQC client; add consent testers if needed)
- [ ] Apple Developer + App Store Connect (next; not required for Android)
