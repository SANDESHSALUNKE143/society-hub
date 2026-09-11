# SocietyHub Mobile (Flutter)

Native **Android first** (Play internal/closed) + **iOS Simulator locally**. Same Bun `/v1` API as `apps/client-app`. App Store / TestFlight listing is not open yet.

Index: root [README.md](../../README.md) · [docs/08-Local-Development.md](../../docs/08-Local-Development.md) §12. Store / CI: [docs/10-Go-Live.md](../../docs/10-Go-Live.md) §6–7 · [docs/12-CICD.md](../../docs/12-CICD.md). Agent skill: [`.cursor/skills/societyhub-flutter-future/`](../../.cursor/skills/societyhub-flutter-future/SKILL.md)

| | Android | iOS |
|--|---------|-----|
| Id | `com.societyhub.societyhub_mobile` | `com.societyhub.societyhubMobile` |
| Version | `1.0.7+8` | same `pubspec.yaml` |
| Store | [Play listing](https://play.google.com/store/apps/details?id=com.societyhub.societyhub_mobile) (internal/closed today) | Not listed |
| Local API | `http://10.0.2.2:3000` (emulator) | `http://127.0.0.1:3000` (Simulator) |

## Scope

| In mobile | On web only |
|-----------|-------------|
| Auth (OTP, email/password, PIN, Google) | Speech-to-text on raise |
| Dashboard, complaints (list / raise / detail) | **CSV bulk** import |
| Manual **single** resident onboard | Structure / heavy admin bulk |
| **Team** — add / edit email+mobile / remove | Manage portal (create society) |
| Account: flat, profile, PIN, privacy link | CSV / bulk import |
| Coming soon stubs | Full Phase 2 modules |

## Prerequisites (Android debug)

1. Flutter **stable** (`flutter doctor -v` — Android toolchain green)
2. Android Studio or SDK + emulator image (API 34+) + `adb`; accept licenses
3. USB debugging on a physical phone (optional)
4. API on `http://localhost:3000` — [docs/08-Local-Development.md](../../docs/08-Local-Development.md)
5. `DEV_AUTH=true` in `apps/api/.env` for local OTP shortcuts

```bash
cd apps/mobile
flutter pub get
flutter doctor -v
flutter devices
```

## Run matrix

| Target | `API_BASE_URL` | Notes |
|--------|----------------|-------|
| Android emulator | `http://10.0.2.2:3000` | Host loopback |
| Physical Android (same Wi‑Fi) | `http://<LAN-IP>:3000` | `ipconfig getifaddr en0` |
| iOS Simulator (optional) | `http://127.0.0.1:3000` | Mac only; no store signing here |
| Hosted API | `https://<public-api>` | `--dart-define=ENV=staging` or `prod` |

```bash
cd apps/mobile

# Android emulator → local API
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev

# Physical phone (example)
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000 --dart-define=ENV=dev

# iOS Simulator (optional)
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Local OTP when `DEV_AUTH=true`: Chairperson `9999999999`, Resident `8888888888`, code `123456`.

Hot reload: `r` in the terminal. Restart: `R`.

## Verify setup (do this after first `flutter run`)

Longer checklist: root [README.md](../../README.md) — **Check / test local Android and iOS**.

```bash
# Machine (no device)
cd apps/mobile && flutter analyze && flutter test

# API must already be running
curl -sS http://127.0.0.1:3000/health
grep DEV_AUTH ../api/.env            # from apps/mobile; expect true
```

**Android device check**

```bash
flutter emulators --launch <emulator_id>
adb devices                                          # … device
adb shell curl -sS http://10.0.2.2:3000/health || adb reverse tcp:3000 tcp:3000
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev
```

Physical Android: same Wi‑Fi + `http://<LAN>:3000`, or USB `adb reverse tcp:3000 tcp:3000` + `http://127.0.0.1:3000`.

**iOS Simulator check**

```bash
cd ios && pod install && cd ..
open -a Simulator
curl -sS http://127.0.0.1:3000/health
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

**In-app smoke (same on both)** — login is Email first; switch to **OTP**:

1. Chairperson `9999999999` / `123456` → dashboard (Admin). Toggle Resident.
2. Complaints → New → plumbing → submit → ticket is **In queue**.
3. Account → Family → people list (owner + family), not only counts.
4. Log out. Resident `8888888888` / `123456` → raise a complaint.
5. Optional: Email `superadmin@societyhub.local` / `Test@1234`.

### Common failures

| Symptom | Fix |
|---------|-----|
| Login network error on phone | Same Wi‑Fi; firewall allows 3000; `curl http://<lan-ip>:3000/health` |
| Cleartext / HTTP blocked | Debug builds allow HTTP. **Release must use HTTPS** (`usesCleartextTraffic` is debug-only). |
| `flutter doctor` Android licenses | `flutter doctor --android-licenses` |
| Google Sign-In on a device | Add debug SHA-1 to the Android OAuth client (Go-Live §4) |
| Release build unsigned | Create `android/key.properties` from `android/key.properties.example` |

## Debug APK (sideload, no Play)

```bash
cd apps/mobile
flutter build apk --debug \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=ENV=dev
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

## Release signing (Play)

Release builds **do not** use the debug keystore. Copy `android/key.properties.example` → `android/key.properties` (gitignored) and generate an upload key:

```bash
keytool -genkey -v -keystore android/upload-keystore.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias upload
```

Then:

```bash
cd apps/mobile
flutter build appbundle --release \
  --dart-define=ENV=prod \
  --dart-define=API_BASE_URL=https://<public-api-host> \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-oauth-client-id> \
  --dart-define=PRIVACY_POLICY_URL=https://app.societyhub.in/privacy \
  --obfuscate --split-debug-info=build/debug-info
```

Output: `build/app/outputs/bundle/release/app-release.aab`

SHA-1 for GCP Android OAuth:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android
# After Play App Signing: Protected with Play → Play Store protection
# → Manage Play app signing → App signing key certificate
```

## Google Sign-In

- **Dev (`ENV=dev`):** `dev:<phone>` against API `DEV_AUTH` (or unset `GOOGLE_CLIENT_ID`).
- **Staging/prod:** real Google ID token. `serverClientId` = Web client (`GOOGLE_CLIENT_ID` on the API). The app falls back to that public Web client ID if `--dart-define` is omitted.
- Android OAuth: one SHA-1 per client. `societyhub-android` = upload key. Extra clients for debug + Play classical + Play PQC (Go-Live §4.2). Play-installed Google Sign-In needs the Play signing SHA-1s registered. Print local fingerprints: `bash scripts/print-android-sha1.sh`. Never put an Android client ID in Flutter — `serverClientId` stays the **Web** client.

## CI/CD

[`.github/workflows/mobile.yml`](../../.github/workflows/mobile.yml)

| Job | When | Notes |
|-----|------|-------|
| Analyze + test | PR / push to `apps/mobile/**` | Always |
| Android AAB | `workflow_dispatch` or tag `mobile-v*` | Needs keystore secrets + `MOBILE_API_BASE_URL` |
| Play internal | Same + `ENABLE_PLAY_UPLOAD=true` + `upload_play` | Rolls out **internal** (`status: completed`). Never production. |
| iOS IPA | Same triggers **and** `ENABLE_IOS_IPA=true` | Skipped until Apple secrets; see Go-Live |

GitHub **variables** (environment `prod` for store jobs): `MOBILE_API_BASE_URL` (**must** be `https://societyhub-api-ece6.onrender.com` — confirm with `GET /health`), `GOOGLE_SERVER_CLIENT_ID`, `PRIVACY_POLICY_URL`. Optional: `ENABLE_PLAY_UPLOAD`, `ENABLE_IOS_IPA`.

GitHub **secrets** (Android): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`. Later: `PLAY_SERVICE_ACCOUNT_JSON`.

iOS later: set variable `ENABLE_IOS_IPA=true` and ASC secrets. Do not buy Apple Developer to merge this workflow.

## Play Console (operator)

1. Pay $25, create app `SocietyHub`, id `com.societyhub.societyhub_mobile`, enable Play App Signing.
2. Upload the CI (or local) AAB to the **internal** track first.
3. Privacy policy URL: `https://societyhub-client.onrender.com/privacy`.
4. Data safety: account, phone, photos/videos for complaints.
5. Store listing files: [`store/`](store/) (icon, feature graphic, 4 phone screenshots). Copy in [Go-Live §7.2a](../../docs/10-Go-Live.md).
6. Production after smoke; staged rollout 20% → 100%.

## Local iOS (Simulator)

Mac + Xcode + CocoaPods. Same Flutter project — no second app.

```bash
# Once: Xcode from the Mac App Store, then
xcode-select --install
sudo gem install cocoapods   # or: brew install cocoapods

cd apps/mobile
flutter pub get
cd ios && pod install && cd ..
flutter doctor -v            # Xcode + iOS toolchain must be green
open -a Simulator
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ENV=dev
```

Physical iPhone: same Wi‑Fi, `API_BASE_URL=http://<LAN-IP>:3000`, sign **Runner** in Xcode with a free Apple ID (Debug only).

## App Store / TestFlight (not this phase)

After Android stays on an internal Play track: Apple Developer $99, bundle `com.societyhub.societyhubMobile`, Info.plist camera/photo strings, Google iOS URL scheme, paste ASC secrets, re-run Mobile CI with `build_ios` and `ENABLE_IOS_IPA=true`.

## Tests

```bash
cd apps/mobile
./scripts/run_tests.sh
```

| Suite | Path |
|-------|------|
| Unit — Google tokens | `test/unit/google_id_token_test.dart` |
| Unit — roles / models / API / session | `test/unit/` |
| Widget — login (incl. prod Google) | `test/widget/login_page_test.dart` |
| Widget — account privacy link | `test/widget/account_page_test.dart` |

## Layout

```
lib/
  api/          # Dio client mirroring packages/sdk
  auth/         # Secure session + Google token mapping
  config/       # dart-defines
  features/     # auth, shell, dashboard, complaints, onboard, account
```
