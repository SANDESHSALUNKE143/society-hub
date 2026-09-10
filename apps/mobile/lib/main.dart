import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'auth/google_id_token.dart';
import 'auth/google_sign_in_source.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      overrides: [
        googleIdTokenSourceProvider.overrideWithValue(
          GoogleSignInIdTokenSource(),
        ),
      ],
      child: const SocietyHubApp(),
    ),
  );
}
