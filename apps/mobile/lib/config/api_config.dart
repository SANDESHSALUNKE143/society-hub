/// Runtime API config via `--dart-define`.
///
/// Example:
/// ```bash
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev
/// ```
class ApiConfig {
  const ApiConfig({
    required this.baseUrl,
    required this.env,
    this.googleServerClientId = '',
    this.privacyPolicyUrl = '',
  });

  final String baseUrl;
  final String env;
  final String googleServerClientId;
  final String privacyPolicyUrl;

  bool get isDev => env == 'dev';

  /// Dev-only Google shortcut (`dev:<phone>`). Never true in staging/prod.
  bool get allowsDevGoogle => env == 'dev';

  static const defaultPrivacyPolicyUrl = 'https://app.societyhub.in/privacy';

  /// Public Web OAuth client (`societyhub-web`). Safe in the app; not a secret.
  /// Play/staging builds still need this as `serverClientId` so Google returns
  /// an ID token. Android SHA-1s live on extra Android clients in GCP
  /// (one SHA-1 per client; do not overwrite `societyhub-android`).
  static const defaultGoogleServerClientId =
      '583640086898-uhmdenf6kpv8iskvdaju4pk4gpbmae20.apps.googleusercontent.com';

  /// Known Android OAuth clients. Using one as `serverClientId` causes
  /// Play Services error 10 (DEVELOPER_ERROR).
  static const androidGoogleClientIdPrefixes = <String>{
    '583640086898-9stsb90vslhphs56gqv65445pjj57qk6',
    '583640086898-m53784dglvpt6bre3c5o13cpos1maeh',
  };

  static String resolveGoogleServerClientId(String fromDefine) {
    final trimmed = fromDefine.trim();
    if (trimmed.isEmpty || !trimmed.contains('apps.googleusercontent.com')) {
      return defaultGoogleServerClientId;
    }
    final prefix = trimmed.split('.').first;
    if (androidGoogleClientIdPrefixes.contains(prefix)) {
      return defaultGoogleServerClientId;
    }
    return trimmed;
  }

  String get resolvedPrivacyPolicyUrl {
    final trimmed = privacyPolicyUrl.trim();
    return trimmed.isEmpty ? defaultPrivacyPolicyUrl : trimmed;
  }

  static ApiConfig fromEnvironment() {
    const baseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:3000',
    );
    const env = String.fromEnvironment('ENV', defaultValue: 'dev');
    const googleServerClientId = String.fromEnvironment(
      'GOOGLE_SERVER_CLIENT_ID',
    );
    const privacyPolicyUrl = String.fromEnvironment('PRIVACY_POLICY_URL');
    return ApiConfig(
      baseUrl: baseUrl,
      env: env,
      googleServerClientId: resolveGoogleServerClientId(googleServerClientId),
      privacyPolicyUrl: privacyPolicyUrl,
    );
  }
}
