#!/usr/bin/env bash
# Print SHA-1 fingerprints for the Android OAuth client societyhub-android.
# Does not print keystore passwords.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
PROPS="$ANDROID/key.properties"

echo "Package: com.societyhub.societyhub_mobile"
echo "One SHA-1 per Android client. Do not overwrite societyhub-android (upload)."
echo "  https://console.cloud.google.com/auth/clients?project=societyhub-507013"
echo

echo "==> Debug (local flutter run / debug APK)"
keytool -list -v \
  -keystore "$HOME/.android/debug.keystore" \
  -alias androiddebugkey \
  -storepass android -keypass android 2>/dev/null \
  | awk '/SHA1:/{print "    "$0}'

if [[ -f "$PROPS" ]]; then
  STORE_FILE="$(awk -F= '/^storeFile=/{print $2}' "$PROPS" | tr -d '\r')"
  ALIAS="$(awk -F= '/^keyAlias=/{print $2}' "$PROPS" | tr -d '\r')"
  STORE_PASS="$(awk -F= '/^storePassword=/{print $2}' "$PROPS" | tr -d '\r')"
  if [[ "$STORE_FILE" != /* ]]; then
    STORE_FILE="$ANDROID/$STORE_FILE"
  fi
  if [[ -f "$STORE_FILE" ]]; then
    echo "==> Upload (CI / local release AAB — Play re-signs this)"
    keytool -list -v \
      -keystore "$STORE_FILE" \
      -alias "$ALIAS" \
      -storepass "$STORE_PASS" 2>/dev/null \
      | awk '/SHA1:/{print "    "$0}'
  fi
else
  echo "==> Upload keystore not on this machine (apps/mobile/android/key.properties missing)"
fi

echo
echo "==> Play App Signing (required for Play Store installs)"
echo "    Play Console → SocietyHub → Protected with Play"
echo "    → Play Store protection → Manage Play app signing"
echo "    → App signing key certificate → copy SHA-1"
echo "    That value is DIFFERENT from Upload. Google allows one SHA-1 per"
echo "    Android client — add extra clients; do not overwrite societyhub-android."
echo
echo "Already documented in docs/10-Go-Live.md §4.2:"
echo "    Debug:        E8:49:BF:F4:F0:C5:9B:A2:96:CC:61:E0:1F:9C:29:A5:D2:C2:D7:57"
echo "    Upload:       A7:05:A3:91:D4:DC:D7:7F:6F:84:6A:32:36:2D:10:B4:8E:CE:76:E2"
echo "    Play classic: 79:4C:A5:3F:6D:98:95:0A:C3:8A:10:50:04:CD:81:09:9B:3E:C0:5F"
echo "    Play PQC:     21:0E:39:37:AF:CD:CB:1D:3E:4E:12:ED:D1:3F:AF:AF:66:6B:99:E6"
