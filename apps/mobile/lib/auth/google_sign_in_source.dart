import 'package:google_sign_in/google_sign_in.dart';

import 'google_id_token.dart';

/// Production Google Sign-In. Obtain an ID token for `POST /v1/auth/google`.
class GoogleSignInIdTokenSource implements GoogleIdTokenSource {
  const GoogleSignInIdTokenSource();

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    final configError = googleSignInConfigError(serverClientId);
    if (configError != null) {
      throw StateError(configError);
    }
    final signIn = GoogleSignIn(
      serverClientId: serverClientId,
      scopes: const ['email', 'openid', 'profile'],
    );
    try {
      await signIn.signOut();
    } catch (_) {
      // Ignore a missing prior session.
    }
    final account = await signIn.signIn();
    if (account == null) return null;
    final auth = await account.authentication;
    final token = auth.idToken;
    if (token == null || token.isEmpty) {
      throw StateError(
        'Google did not return an ID token. Register the Play App Signing SHA-1 '
        'as its own Android OAuth client (do not overwrite societyhub-android).',
      );
    }
    return token;
  }
}
