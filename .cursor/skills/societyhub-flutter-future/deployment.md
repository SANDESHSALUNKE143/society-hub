# Flutter deployment — SocietyHub mobile

## Local run

```bash
cd apps/mobile
flutter pub get
flutter run \
  --dart-define=ENV=dev \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

| Host | API base tip |
|------|----------------|
| Android emulator | `http://10.0.2.2:<api-port>` |
| iOS simulator | `http://127.0.0.1:<api-port>` |
| Physical device | Machine LAN IP + cleartext exception in **dev** only |

Match API port from [docs/08-Local-Development.md](../../../docs/08-Local-Development.md).

## Flavors (recommended)

| Flavor | App ID suffix | Entry | Store |
|--------|---------------|-------|-------|
| dev | `.dev` | local/dev API | internal only |
| staging | `.staging` | staging API | internal track / TestFlight |
| prod | _(none)_ | production API | production |

Use distinct icons/names so testers never confuse builds.

## Android release

```bash
flutter build appbundle --flavor prod --release \
  --dart-define=ENV=prod \
  --dart-define=API_BASE_URL=https://api.societyhub.example \
  --obfuscate --split-debug-info=build/debug-info
```

- Upload `.aab` to Play Console  
- Prefer Play App Signing  
- Tracks: internal → closed → production  
- Store listing, privacy policy, Data safety form required  

## iOS release

```bash
flutter build ipa --flavor prod --release \
  --dart-define=ENV=prod \
  --dart-define=API_BASE_URL=https://api.societyhub.example \
  --obfuscate --split-debug-info=build/debug-info
```

- Archive with distribution cert + App Store profile (or CI with ASC API key)  
- Upload to TestFlight → App Store review  
- Privacy nutrition labels must match OTP/SSO/camera usage  

## CI (GitHub Actions sketch)

Jobs:

1. `flutter analyze` + `flutter test`  
2. Signed AAB on `workflow_dispatch` or tag `mobile-v*`  
3. Optional Play **internal draft** when `ENABLE_PLAY_UPLOAD=true` (never production)  
4. IPA only when `ENABLE_IOS_IPA=true`  

Secrets (examples): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`, `ASC_API_KEY`.

Do **not** commit keystores, `google-services.json` with sensitive keys, or provisioning profiles.

## Versioning

- `pubspec.yaml` `version: X.Y.Z+BUILD`  
- Android `versionCode` = BUILD; iOS `CFBundleVersion` = BUILD  
- Align marketing version with release notes / GitHub release  

## Rollback

- Play / App Store staged rollout (e.g. 10% → 100%)  
- Keep previous AAB/IPA artifacts in CI  
- API must stay backward compatible for at least one mobile version (document breaking changes in `docs/09-API.md`)  

## Checklist before store submit

- [ ] Prod flavor; no `DEV_AUTH` UI  
- [ ] Correct API base URL  
- [ ] Obfuscation + saved debug-info  
- [ ] Privacy policy URL live  
- [ ] OTP + Google + password smoke-tested against staging  
- [ ] Crash reporting (if any) redacts tokens  
