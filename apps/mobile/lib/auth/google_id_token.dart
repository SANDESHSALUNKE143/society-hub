import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/api_config.dart';

/// Maps UI input to the `idToken` sent to `POST /v1/auth/google`.
///
/// Dev may use `dev:<phone>` when the API has `DEV_AUTH`. Production and
/// staging must send a real Google ID token — never a `dev:` prefix.
String? googleIdTokenForApi({
  required ApiConfig config,
  required String phone,
  required String? googleIdToken,
}) {
  if (config.allowsDevGoogle) {
    final trimmed = phone.trim();
    if (trimmed.isEmpty) return null;
    return 'dev:$trimmed';
  }
  if (googleIdToken == null || googleIdToken.isEmpty) return null;
  if (googleIdToken.startsWith('dev:')) return null;
  return googleIdToken;
}

/// Missing Web client ID — Android then returns no `idToken`.
String? googleSignInConfigError(String serverClientId) {
  if (serverClientId.trim().isEmpty) {
    return 'Google Sign-In is not configured in this build.';
  }
  return null;
}

/// Fetches a Google ID token. Tests override this; release uses Sign-In.
abstract class GoogleIdTokenSource {
  Future<String?> fetchIdToken({required String serverClientId});
}

class UnavailableGoogleIdTokenSource implements GoogleIdTokenSource {
  const UnavailableGoogleIdTokenSource();

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    return null;
  }
}

final googleIdTokenSourceProvider = Provider<GoogleIdTokenSource>((ref) {
  return const UnavailableGoogleIdTokenSource();
});
