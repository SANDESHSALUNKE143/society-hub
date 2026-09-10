import 'package:google_sign_in/google_sign_in.dart';

import 'google_id_token.dart';

/// Production Google Sign-In. Obtain an ID token for `POST /v1/auth/google`.
class GoogleSignInIdTokenSource implements GoogleIdTokenSource {
  GoogleSignInIdTokenSource();

  GoogleSignIn? _client;
  String? _serverClientId;

  GoogleSignIn _clientFor(String serverClientId) {
    if (_client != null && _serverClientId == serverClientId) {
      return _client!;
    }
    _serverClientId = serverClientId;
    // Do not pass an Android OAuth client as [GoogleSignIn.clientId] — that
    // is Play Services error 10. Only the Web client belongs here.
    _client = GoogleSignIn(serverClientId: serverClientId);
    return _client!;
  }

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    final configError = googleSignInConfigError(serverClientId);
    if (configError != null) {
      throw StateError(configError);
    }
    final signIn = _clientFor(serverClientId);
    // Do not signOut() before signIn() — that yields DEVELOPER_ERROR 10 on
    // some Play-signed installs even when SHA-1 clients are registered.
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
