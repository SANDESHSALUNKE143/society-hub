import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/api/society_hub_api.dart';
import 'package:societyhub_mobile/auth/google_id_token.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/config/api_config.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/auth/presentation/login_page.dart';

import '../helpers/test_harness.dart';

void attachApi(WidgetTester tester, SocietyHubApi api) {
  final element = tester.element(find.byType(LoginPage));
  ProviderScope.containerOf(element).read(sessionProvider.notifier).replaceApiForTest(api);
}

void main() {
  testWidgets('shows password fields by default and switches modes', (tester) async {
    await tester.pumpWidget(wrapForWidgetTest(child: const LoginPage()));
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.loginEmail), findsOneWidget);
    expect(find.byKey(AppKeys.loginPassword), findsOneWidget);
    expect(find.text('SocietyHub'), findsWidgets);

    await tester.tap(find.byKey(AppKeys.loginModeOtp));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.loginPhone), findsOneWidget);
    expect(find.text('Send OTP'), findsOneWidget);

    await tester.tap(find.byKey(AppKeys.loginModePin));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.loginPin), findsOneWidget);
  });

  testWidgets('password login success navigates to select-society', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onPost(
      '/v1/auth/password/login',
      (server) => server.reply(200, loginJson(fixtureUser())),
      data: Matchers.any,
    );

    final router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
        GoRoute(
          path: '/select-society',
          builder: (_, _) => const Scaffold(body: Text('SELECT_SOCIETY')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: testSessionOverrides(),
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    attachApi(tester, bundle.api);

    await tester.enterText(find.byKey(AppKeys.loginEmail), 'a@b.com');
    await tester.enterText(find.byKey(AppKeys.loginPassword), 'secret');
    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pumpAndSettle();

    expect(find.text('SELECT_SOCIETY'), findsOneWidget);
  });

  testWidgets('password login shows API error message', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onPost(
      '/v1/auth/password/login',
      (server) => server.reply(401, {
        'code': 'invalid_credentials',
        'message': 'Invalid email or password',
      }),
      data: Matchers.any,
    );

    await tester.pumpWidget(wrapForWidgetTest(child: const LoginPage()));
    await tester.pumpAndSettle();
    attachApi(tester, bundle.api);

    await tester.enterText(find.byKey(AppKeys.loginEmail), 'a@b.com');
    await tester.enterText(find.byKey(AppKeys.loginPassword), 'bad');
    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.loginError), findsOneWidget);
    expect(find.text('Email or password is incorrect.'), findsOneWidget);
  });

  testWidgets('dev Google login sends a dev: token', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onPost(
      '/v1/auth/google',
      (server) => server.reply(200, loginJson(fixtureUser())),
      data: Matchers.any,
    );

    final router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
        GoRoute(
          path: '/select-society',
          builder: (_, _) => const Scaffold(body: Text('SELECT_SOCIETY')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: testSessionOverrides(),
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    attachApi(tester, bundle.api);

    await tester.tap(find.byKey(AppKeys.loginModeGoogle));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(AppKeys.loginPhone), '8888888888');
    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pumpAndSettle();

    expect(find.text('SELECT_SOCIETY'), findsOneWidget);
  });

  testWidgets('prod Google login posts a real idToken and hides the phone field',
      (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onPost(
      '/v1/auth/google',
      (server) => server.reply(200, loginJson(fixtureUser())),
      data: {'idToken': 'ey.real.token'},
    );

    final router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
        GoRoute(
          path: '/select-society',
          builder: (_, _) => const Scaffold(body: Text('SELECT_SOCIETY')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testSessionOverrides(
            config: const ApiConfig(
              baseUrl: testApiBase,
              env: 'prod',
              googleServerClientId: 'web-client.apps.googleusercontent.com',
            ),
          ),
          googleIdTokenSourceProvider.overrideWithValue(
            _FakeGoogleSource('ey.real.token'),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    attachApi(tester, bundle.api);

    await tester.tap(find.byKey(AppKeys.loginModeGoogle));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.loginPhone), findsNothing);
    expect(find.text('Continue with Google'), findsOneWidget);

    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pumpAndSettle();

    expect(find.text('SELECT_SOCIETY'), findsOneWidget);
  });

  testWidgets('prod Google login refuses a cancelled or missing token',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testSessionOverrides(
            config: const ApiConfig(
              baseUrl: testApiBase,
              env: 'prod',
              googleServerClientId: 'web-client.apps.googleusercontent.com',
            ),
          ),
          googleIdTokenSourceProvider.overrideWithValue(
            const _FakeGoogleSource(null),
          ),
        ],
        child: const MaterialApp(home: LoginPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(AppKeys.loginModeGoogle));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.loginError), findsOneWidget);
    expect(
      find.textContaining('Google sign-in was cancelled'),
      findsOneWidget,
    );
  });

  testWidgets('prod Google login shows a spinner while the token is fetched',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testSessionOverrides(
            config: const ApiConfig(
              baseUrl: testApiBase,
              env: 'prod',
              googleServerClientId: 'web-client.apps.googleusercontent.com',
            ),
          ),
          googleIdTokenSourceProvider.overrideWithValue(
            const _SlowGoogleSource(),
          ),
        ],
        child: const MaterialApp(home: LoginPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(AppKeys.loginModeGoogle));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(AppKeys.loginSubmit));
    await tester.pump();

    expect(find.byKey(AppKeys.loginBusy), findsOneWidget);
    await tester.pumpAndSettle();
  });
}

class _FakeGoogleSource implements GoogleIdTokenSource {
  const _FakeGoogleSource(this.token);

  final String? token;

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    return token;
  }
}

class _SlowGoogleSource implements GoogleIdTokenSource {
  const _SlowGoogleSource();

  @override
  Future<String?> fetchIdToken({required String serverClientId}) async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
    return null;
  }
}
