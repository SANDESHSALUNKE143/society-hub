# SocietyHub Mobile (Flutter)

Native **Android first** (Play) + iOS later. Same Bun `/v1` API as `apps/client-app`.

Index: [docs/08-Local-Development.md](../../docs/08-Local-Development.md) (Mobile section). Store / CI: [docs/10-Go-Live.md](../../docs/10-Go-Live.md) §6–7. Agent skill: [`.cursor/skills/societyhub-flutter-future/`](../../.cursor/skills/societyhub-flutter-future/SKILL.md)

## Scope

| In mobile | On web only |
|-----------|-------------|
| Auth (OTP, email/password, PIN, Google) | Speech-to-text on raise |
| Dashboard, complaints (list / raise / detail) | **CSV bulk** import |
| Manual **single** resident onboard | Structure / heavy admin bulk |
| Account: flat, profile, PIN, privacy link | Manage portal |
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
# After Play App Signing: Console → App integrity → App signing key certificate
```

## Google Sign-In

- **Dev (`ENV=dev`):** `dev:<phone>` against API `DEV_AUTH` (or unset `GOOGLE_CLIENT_ID`).
- **Staging/prod:** real Google ID token. `serverClientId` = Web client (`GOOGLE_CLIENT_ID` on the API). Android OAuth client must list this package + SHA-1.

## CI/CD

[`.github/workflows/mobile.yml`](../../.github/workflows/mobile.yml)

| Job | When | Notes |
|-----|------|-------|
| Analyze + test | PR / push to `apps/mobile/**` | Always |
| Android AAB | `workflow_dispatch` or tag `mobile-v*` | Needs keystore secrets + `MOBILE_API_BASE_URL` |
| Play internal | Same + `ENABLE_PLAY_UPLOAD=true` + `upload_play` | Rolls out **internal** (`status: completed`). Never production. |
| iOS IPA | Same triggers **and** `ENABLE_IOS_IPA=true` | Skipped until Apple secrets; see Go-Live |

GitHub **variables** (environment `prod` for store jobs): `MOBILE_API_BASE_URL`, `GOOGLE_SERVER_CLIENT_ID`, `PRIVACY_POLICY_URL`. Optional: `ENABLE_PLAY_UPLOAD`, `ENABLE_IOS_IPA`.

GitHub **secrets** (Android): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`. Later: `PLAY_SERVICE_ACCOUNT_JSON`.

iOS later: set variable `ENABLE_IOS_IPA=true` and ASC secrets. Do not buy Apple Developer to merge this workflow.

## Play Console (operator)

1. Pay $25, create app `SocietyHub`, id `com.societyhub.societyhub_mobile`, enable Play App Signing.
2. Upload the CI (or local) AAB to the **internal** track first.
3. Privacy policy URL: `https://societyhub-client.onrender.com/privacy`.
4. Data safety: account, phone, photos/videos for complaints.
5. Store listing files: [`store/`](store/) (icon, feature graphic, 4 phone screenshots). Copy in [Go-Live §7.2a](../../docs/10-Go-Live.md).
6. Production after smoke; staged rollout 20% → 100%.

## Next: iOS (not this phase)

Same Flutter project. After Android is on an internal Play track: Apple Developer $99, bundle `com.societyhub.societyhubMobile`, Info.plist camera/photo strings, Google iOS URL scheme, paste ASC secrets, re-run workflow with `build_ios`.

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
