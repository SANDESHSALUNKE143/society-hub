# SocietyHub

Multi-tenant SaaS for housing societies. **Pilot:** Keshav Heights.

| Client | Who | Where |
|--------|-----|--------|
| **Client App (web)** | Society Admin \| Resident | `apps/client-app` |
| **Manage (web)** | SocietyHub platform employees only | `apps/manage` |
| **Client App (native)** | Same resident / chairperson flows | `apps/mobile` (Flutter — **Android on Play now**, iOS local / listing next) |
| **API** | Shared `/v1` JSON for web + mobile | `apps/api` |

MVP product is **Complaints** (auth, onboard, raise/track). Other planned modules show as **Coming soon**. Docs are source of truth: [`docs/`](docs/README.md).

## Deployed preview (Render)

Deploys from **`main`**. Land work on **`staging`**, then **Promote preview**. Hobby cold start can take ~1 minute.

| Service | URL |
|---------|-----|
| API | https://societyhub-api-ece6.onrender.com |
| API health | https://societyhub-api-ece6.onrender.com/health |
| OpenAPI | https://societyhub-api-ece6.onrender.com/docs |
| Client App | https://societyhub-client.onrender.com |
| Manage | https://societyhub-manage.onrender.com |
| Privacy (Play + OAuth) | https://societyhub-client.onrender.com/privacy |
| Terms | https://societyhub-client.onrender.com/terms |

Use **`societyhub-api-ece6.onrender.com`** only. `societyhub-api.onrender.com` is not this API.

Azure staging/production workflows exist and stay idle until Phase 1 UAT.

## Android (Play)

| | |
|--|--|
| App name | SocietyHub |
| Package / application id | `com.societyhub.societyhub_mobile` |
| Current version | `1.0.3+4` (`apps/mobile/pubspec.yaml`) |
| Store listing | https://play.google.com/store/apps/details?id=com.societyhub.societyhub_mobile |
| Play Console | https://play.google.com/console |
| Track today | **Internal / closed testing.** Production promote is a Console click (not CI). |
| Listing assets | [`apps/mobile/store/`](apps/mobile/store/) |

CI: GitHub → **Actions** → **Mobile CI** → Run workflow (`upload_play` for internal). Details: [docs/12-CICD.md](docs/12-CICD.md).

## iOS (same Flutter app)

| | |
|--|--|
| Bundle id | `com.societyhub.societyhubMobile` |
| Status | **Local Simulator / device only.** No App Store / TestFlight listing yet. |
| IPA in CI | Off until `ENABLE_IOS_IPA=true` + Apple Developer ($99) + ASC secrets |

Run locally on a Mac with Xcode — see [Local iOS](#local-ios-simulator) below. Store steps: [docs/10-Go-Live.md](docs/10-Go-Live.md) §6–7.

---

## Local web + API

Full guide: **[docs/08-Local-Development.md](docs/08-Local-Development.md)**

```bash
# 1) Bun on PATH
export PATH="$HOME/.bun/bin:$PATH"

# 2) /etc/hosts (once)
# 127.0.0.1 app.localhost
# 127.0.0.1 manage.localhost

# 3) One-time setup (install + .env + MySQL migrate/seed)
bun run setup

# 4) Start API (:3000) + client-app (:5173) + manage (:5174)
bun run dev
```

Requires **local MySQL 8** (Workbench GUI is optional). Default: `127.0.0.1:3306` · `root` / `1900Summer@` · database `societyhub`.

| Who | Login | URL |
|-----|--------|-----|
| Platform / Manage | `superadmin@societyhub.local` / `Test@1234` | http://manage.localhost:5174 |
| Same account on Client Admin | `superadmin@societyhub.local` / `Test@1234` | http://app.localhost:5173 |
| Chairperson OTP (dev) | phone `9999999999` · code `123456` | http://app.localhost:5173 |
| Resident OTP (dev) | phone `8888888888` · code `123456` | http://app.localhost:5173 |
| OpenAPI | — | http://localhost:3000/docs |

`DEV_AUTH=true` in `apps/api/.env` is required for local OTP `123456`.

---

## Local Android (development)

Need the API from `bun run dev` first. Deep dive: [`apps/mobile/README.md`](apps/mobile/README.md).

### Prerequisites

1. Flutter **stable** — `flutter doctor -v` (Android toolchain green)
2. Android Studio (or SDK) + emulator **API 34+** + `adb`; `flutter doctor --android-licenses`
3. Optional: physical phone with USB debugging
4. API at `http://localhost:3000` with `DEV_AUTH=true`

```bash
cd apps/mobile
flutter pub get
flutter doctor -v
flutter devices
```

### Run

| Target | `API_BASE_URL` | Command |
|--------|----------------|---------|
| Android emulator | `http://10.0.2.2:3000` (host loopback) | see below |
| Physical Android (same Wi‑Fi) | `http://<LAN-IP>:3000` | `ipconfig getifaddr en0` on the Mac |

```bash
cd apps/mobile

# Emulator → local API
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev

# Physical phone (replace with your LAN IP)
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000 --dart-define=ENV=dev
```

Local OTP: Chairperson `9999999999`, Resident `8888888888`, code `123456`. Hot reload `r`, restart `R`.

Sideload debug APK (no Play):

```bash
cd apps/mobile
flutter build apk --debug \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=ENV=dev
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

| Symptom | Fix |
|---------|-----|
| Login network error on phone | Same Wi‑Fi; firewall allows port 3000; `curl http://<lan-ip>:3000/health` |
| HTTP blocked | Debug allows cleartext. Release **must** use HTTPS. |
| Google Sign-In on a device | Add debug SHA-1 to the Android OAuth client ([Go-Live §4](docs/10-Go-Live.md)) |

Point the app at preview instead of localhost:

```bash
cd apps/mobile
flutter run \
  --dart-define=API_BASE_URL=https://societyhub-api-ece6.onrender.com \
  --dart-define=ENV=staging
```

---

## Local iOS (Simulator)

Mac only. Same `apps/mobile/` project — there is no separate iOS repo. **No App Store listing yet.**

### Prerequisites

1. macOS + **Xcode** (App Store) + Command Line Tools (`xcode-select --install`)
2. Open Xcode once, accept the license, install additional components
3. Flutter stable — `flutter doctor -v` must show **Xcode** and **iOS toolchain** green
4. CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)
5. Local API running (`bun run dev`, `DEV_AUTH=true`)

```bash
cd apps/mobile
flutter pub get
cd ios && pod install && cd ..
open -a Simulator
flutter devices
```

### Run

The iOS Simulator reaches the Mac as `127.0.0.1` (not `10.0.2.2`).

```bash
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Physical iPhone (same Wi‑Fi): use `http://<LAN-IP>:3000`, sign the Runner target in Xcode with your **free Apple ID** (Debug). Store / TestFlight signing is later.

Same local OTP as Android: `9999999999` / `8888888888` · `123456`.

---

## Check / test local Android and iOS

Do these in order. Stop if a step fails — later steps will not work. Full copy also lives in [docs/08-Local-Development.md](docs/08-Local-Development.md) §12.

### 0. API is up (both platforms)

In a repo-root terminal:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run dev
```

In a second terminal:

```bash
curl -sS http://127.0.0.1:3000/health
# expect: {"ok":true,...}

# Confirm local OTP shortcut (must be true for 123456)
grep DEV_AUTH apps/api/.env
```

If `health` fails: MySQL on `3306`, then `bun run db:migrate && bun run db:seed`.

Optional machine check (no emulator needed):

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
```

Both must finish with no issues / all tests passed.

### 1. Flutter doctor

```bash
flutter doctor -v
```

**Android is ready** when these are green (not `[!]`):

- Flutter (stable channel)
- Android toolchain — `adb`, platform-tools, licenses
- Android Studio **or** a standalone SDK
- Connected device **or** an emulator you can launch

**iOS is ready** (Mac only) when these are green:

- Xcode (path set, license accepted)
- CocoaPods
- iOS toolchain / Simulator

Fix licenses / Xcode before continuing:

```bash
flutter doctor --android-licenses
sudo xcodebuild -license accept
xcode-select -p    # should be /Applications/Xcode.app/Contents/Developer
```

### 2. Android — boot a device and prove the API

```bash
flutter emulators
# pick an id, e.g. Medium_Phone_API_34
flutter emulators --launch Medium_Phone_API_34

# wait until the home screen appears, then:
adb devices
# expect: emulator-5554   device

# From the emulator, 10.0.2.2 is your Mac. Prove it:
adb shell curl -sS http://10.0.2.2:3000/health
# if curl is missing on the image:
adb reverse tcp:3000 tcp:3000
curl -sS http://127.0.0.1:3000/health
```

Physical phone instead of emulator:

1. Phone and Mac on the **same Wi‑Fi**. USB debugging on. Unlock and accept the RSA prompt.
2. `adb devices` shows `device` (not `unauthorized`).
3. `ipconfig getifaddr en0` → that IP is `LAN`.
4. On the Mac: `curl -sS http://<LAN>:3000/health` (if this fails, the phone cannot reach the API either — allow port 3000 in the firewall).
5. Easier USB path: `adb reverse tcp:3000 tcp:3000` then use `API_BASE_URL=http://127.0.0.1:3000`.

```bash
cd apps/mobile
flutter devices          # the emulator or phone must be listed
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev
# physical + adb reverse:
# flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Wait until the login screen is up. Login defaults to **Email**. Switch to **OTP**.

| Check | What you do | Pass |
|-------|-------------|------|
| Chairperson login | Phone `9999999999` → Request OTP → code `123456` | Dashboard (Admin mode). If two societies exist you pick one first. |
| Admin / Resident toggle | Switch to Resident | Same account, resident chrome |
| Complaints | Open Complaints | Seed / empty list, search box, not a crash |
| Raise | New complaint — type plumbing, title, submit | Ticket opens; status **In queue** |
| Detail | Open that ticket | Flat / raised / type facts + timeline |
| Account family | Account → Family | People table (owner + family), not only Adult/Child counts |
| Resident login | Log out. OTP `8888888888` / `123456` | Dashboard in Resident mode; can raise a complaint |
| Password login | Log out. Email `superadmin@societyhub.local` / `Test@1234` | Lands in platform / admin flow |

Dev Google (`ENV=dev`) only works with API `DEV_AUTH`. Real Google on a device needs the debug SHA-1 on the Android OAuth client ([Go-Live §4](docs/10-Go-Live.md)).

### 3. iOS — boot Simulator and prove the API

```bash
xcode-select -p
cd apps/mobile
flutter pub get
cd ios && pod install && cd ..

open -a Simulator
# Simulator → File → Open Simulator → iPhone 16 (or any iOS 17+)

flutter devices
# expect a line like: iPhone 16 (mobile) • … • ios

# Simulator talks to the Mac as 127.0.0.1 (not 10.0.2.2)
curl -sS http://127.0.0.1:3000/health

flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Repeat the **same login / complaints / Account family table** from the Android checklist. OTP and seed users are identical.

Physical iPhone:

1. Same Wi‑Fi as the Mac. `API_BASE_URL=http://<LAN>:3000`.
2. Open `apps/mobile/ios/Runner.xcworkspace` in Xcode (the **workspace**, not the `.xcodeproj`).
3. Signing & Capabilities → Team → your **personal Apple ID** (free, Debug only).
4. Plug in the phone, trust the computer, enable Developer Mode (iOS 16+).
5. First launch may need Settings → General → VPN & Device Management → trust the developer cert.
6. Then `flutter run` with the LAN URL (or run from Xcode).

### 4. You are done when

- [ ] `flutter analyze` and `flutter test` are clean  
- [ ] `curl /health` works from the Mac  
- [ ] Android emulator (or `adb reverse` phone) reaches `10.0.2.2` / `127.0.0.1:3000`  
- [ ] iOS Simulator reaches `127.0.0.1:3000`  
- [ ] Chairperson `9999999999` and resident `8888888888` both log in with `123456`  
- [ ] Raise + open a complaint; Account Family shows people, not only counts  

| Still broken | Likely cause |
|--------------|--------------|
| White screen / “network” on login | Wrong `API_BASE_URL` for that device, or API not running |
| OTP “invalid code” | `DEV_AUTH` is not `true`; restart `bun run dev` |
| Android `unauthorized` | Unlock phone and tap Allow USB debugging |
| iOS `pod install` fails | `cd apps/mobile/ios && pod repo update && pod install` |
| iOS codesign / “untrusted developer” | Xcode Team + trust the cert on the phone |
| Google Sign-In (Android device) | Missing debug SHA-1 on the Android OAuth client |

---

## Repo layout

| Path | Role |
|------|------|
| `apps/api` | Bun + Elysia + Drizzle / MySQL |
| `apps/client-app` | Society Admin \| Resident (React + Vite + Tailwind) |
| `apps/manage` | SocietyHub platform employees only |
| `apps/mobile` | Flutter Client App (Android + iOS) |
| `packages/{sdk,validation,auth,types,ui}` | Shared contracts and web chrome |
| `docs/` | Spec — product, API, local run, CI/CD |
| `devops/` | Docker, Terraform, Azure (later) |

## Tech stack

Full explanation: **[docs/07-Tech-Stack.md](docs/07-Tech-Stack.md)**

| Layer | Choice |
|-------|--------|
| Architecture | Modular monolith, multi-tenant (`tenant_id` on every query) |
| Monorepo | Turborepo + Bun workspaces |
| API | Bun + TypeScript (strict) + Elysia + Zod · JWT Bearer |
| Data | Drizzle + MySQL 8 (local Workbench / native server) |
| Web | React + Vite + Tailwind (+ headless / Radix). Shared UI in `packages/ui` |
| Native | Flutter (stable) + Dart 3 · Riverpod · go_router · Dio · flutter_secure_storage |
| Auth | Email/password + MSG91 OTP + Google SSO + PIN |
| Files | Azure Blob (photos / videos) when configured |
| Hosting now | Render Hobby (API Docker + two static sites + TiDB) |
| Hosting later | Azure Container Apps + Static Web Apps + MySQL after UAT |
| Tests | Bun unit + API integration (≥90% coverage), Cypress (web), `flutter test` |
| Phase 2 (not MVP) | Redis + BullMQ, Resend, Firebase web push, Razorpay |

**Git:** `feature/…` → PR into **`staging`** → **Promote preview** → `main` → Render. See [docs/12-CICD.md](docs/12-CICD.md).

## Spec pack

| Doc | Purpose |
|-----|---------|
| [Local Development](docs/08-Local-Development.md) | Web, API, MySQL, Flutter Android / iOS |
| [CI/CD](docs/12-CICD.md) | Pipelines, Render URLs, Play / iOS jobs, secrets |
| [Go-Live](docs/10-Go-Live.md) | Play Console, OAuth, Apple later |
| [Vision](docs/00-Vision.md) | Product vision |
| [BRD](docs/01-BRD.md) | Business requirements |
| [PRD](docs/02-PRD.md) | Product requirements |
| [Architecture](docs/03-Architecture.md) | System design |
| [Database](docs/04-Database.md) | Data model |
| [Tech Stack](docs/07-Tech-Stack.md) | Stack choices |
| [Development Plan](docs/05-Development-Plan.md) | Delivery approach |
| [Coding Standards](docs/06-Coding-Standards.md) | Conventions |
| [API Guide](docs/09-API.md) | REST `/v1` (auth, household, complaints, …) |

Agent guidance: [AGENTS.md](AGENTS.md) · Mobile: [`apps/mobile/README.md`](apps/mobile/README.md) · DevOps: [`devops/`](devops/README.md)

## Quality gates

```bash
bun run quality
```

Enforces: no direct `@mui` / `@material-ui` imports, zero TypeScript lint errors, clean build (zero warnings), unit coverage ≥90%, integration coverage ≥90% (in-process API).

```bash
cd apps/mobile && flutter analyze && flutter test
```
