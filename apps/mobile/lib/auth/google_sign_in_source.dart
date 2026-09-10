import 'package:google_sign_in/google_sign_in.dart';

import 'google_id_token.dart';

/// Production Google Sign-In. Obtain an ID token for `POST /v1/auth/google`.
///
/// Uses Credential Manager (`google_sign_in` 7). The old GoogleSignIn SDK
/// returns Play Services error 10 on current Play-signed Samsung installs.
class GoogleSignInIdTokenSource implements GoogleIdTokenSource {
  GoogleSignInIdTokenSource();

  Future<void>? _initialized;

  Future<void> _ensureInitialized(String serverClientId) {
    return _initialized ??= GoogleSignIn.instance.initialize(
      serverClientId: serverClientId,
    );
  }

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    final configError = googleSignInConfigError(serverClientId);
    if (configError != null) {
      throw StateError(configError);
    }
    await _ensureInitialized(serverClientId);
    if (!GoogleSignIn.instance.supportsAuthenticate()) {
      throw StateError(
        'Google Sign-In is not available on this device. Use OTP or email.',
      );
    }
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final token = account.authentication.idToken;
      if (token == null || token.isEmpty) {
        throw StateError(
          'Google did not return an ID token. Register the Play App Signing SHA-1 '
          'as its own Android OAuth client (do not overwrite societyhub-android).',
        );
      }
      return token;
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        return null;
      }
      rethrow;
    }
  }
}
