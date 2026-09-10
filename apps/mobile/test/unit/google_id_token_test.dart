import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/auth/google_id_token.dart';
import 'package:societyhub_mobile/config/api_config.dart';

void main() {
  group('googleIdTokenForApi', () {
    test('dev env maps onboarded phone to a dev: token', () {
      const config = ApiConfig(baseUrl: 'http://api.test', env: 'dev');
      expect(
        googleIdTokenForApi(
          config: config,
          phone: ' 8888888888 ',
          googleIdToken: null,
        ),
        'dev:8888888888',
      );
    });

    test('dev env returns null when phone is empty', () {
      const config = ApiConfig(baseUrl: 'http://api.test', env: 'dev');
      expect(
        googleIdTokenForApi(config: config, phone: '   ', googleIdToken: 'real'),
        isNull,
      );
    });

    test('prod env returns the Google idToken', () {
      const config = ApiConfig(baseUrl: 'https://api.example', env: 'prod');
      expect(
        googleIdTokenForApi(
          config: config,
          phone: '8888888888',
          googleIdToken: 'ey.real.token',
        ),
        'ey.real.token',
      );
    });

    test('prod env refuses dev: Google tokens', () {
      const config = ApiConfig(baseUrl: 'https://api.example', env: 'prod');
      expect(
        googleIdTokenForApi(
          config: config,
          phone: '8888888888',
          googleIdToken: 'dev:8888888888',
        ),
        isNull,
      );
    });

    test('googleSignInConfigError flags a missing Web client ID', () {
      expect(googleSignInConfigError(''), isNotNull);
      expect(googleSignInConfigError('   '), isNotNull);
      expect(
        googleSignInConfigError('123.apps.googleusercontent.com'),
        isNull,
      );
    });

    test('prod env refuses an empty Google idToken', () {
      const config = ApiConfig(baseUrl: 'https://api.example', env: 'prod');
      expect(
        googleIdTokenForApi(
          config: config,
          phone: '8888888888',
          googleIdToken: '',
        ),
        isNull,
      );
    });
  });

  group('ApiConfig', () {
    test('allowsDevGoogle only in env=dev', () {
      expect(
        const ApiConfig(baseUrl: 'http://api.test', env: 'dev').allowsDevGoogle,
        isTrue,
      );
      expect(
        const ApiConfig(
          baseUrl: 'https://api.example',
          env: 'prod',
        ).allowsDevGoogle,
        isFalse,
      );
      expect(
        const ApiConfig(
          baseUrl: 'https://api.example',
          env: 'staging',
        ).allowsDevGoogle,
        isFalse,
      );
    });

    test('resolveGoogleServerClientId uses the public Web client when unset', () {
      expect(
        ApiConfig.resolveGoogleServerClientId(''),
        ApiConfig.defaultGoogleServerClientId,
      );
      expect(
        ApiConfig.resolveGoogleServerClientId('  '),
        ApiConfig.defaultGoogleServerClientId,
      );
      expect(
        ApiConfig.resolveGoogleServerClientId('custom.apps.googleusercontent.com'),
        'custom.apps.googleusercontent.com',
      );
      expect(
        ApiConfig.resolveGoogleServerClientId(
          '583640086898-9stsb90vslhphs56gqv65445pjj57qk6.apps.googleusercontent.com',
        ),
        ApiConfig.defaultGoogleServerClientId,
      );
      expect(
        ApiConfig.resolveGoogleServerClientId(
          '583640086898-m53784dglvpt6bre3c5o13cpos1maeh.apps.googleusercontent.com',
        ),
        ApiConfig.defaultGoogleServerClientId,
      );
      expect(
        ApiConfig.resolveGoogleServerClientId('not-a-client-id'),
        ApiConfig.defaultGoogleServerClientId,
      );
    });

    test('privacyPolicyUrl falls back to the public /privacy path', () {
      expect(
        const ApiConfig(
          baseUrl: 'https://api.example',
          env: 'prod',
        ).resolvedPrivacyPolicyUrl,
        'https://app.societyhub.in/privacy',
      );
      expect(
        const ApiConfig(
          baseUrl: 'https://api.example',
          env: 'prod',
          privacyPolicyUrl: 'https://app.example/privacy',
        ).resolvedPrivacyPolicyUrl,
        'https://app.example/privacy',
      );
    });
  });
}
