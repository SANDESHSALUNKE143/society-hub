import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/account/presentation/account_page.dart';

import '../helpers/test_harness.dart';

void main() {
  testWidgets('shows my flat details from profile API', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onGet(
      '/v1/profile',
      (server) => server.reply(200, profileJson()),
    );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'resident', flatNumber: '101'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AccountPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.accountFlatDetails), findsOneWidget);
    expect(find.byKey(AppKeys.accountSocietyName), findsOneWidget);
    expect(find.text('Keshav Heights'), findsOneWidget);
    expect(find.byKey(AppKeys.accountFlatNumber), findsOneWidget);
    expect(find.text('A-101'), findsWidgets);
    expect(find.byKey(AppKeys.accountFlatEmpty), findsNothing);
    expect(find.byKey(AppKeys.accountPrivacy), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);
  });

  testWidgets('shows empty flat state when profile has no flat', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onGet(
      '/v1/profile',
      (server) => server.reply(200, profileJson(withFlat: false)),
    );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'resident'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AccountPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.accountFlatEmpty), findsOneWidget);
  });

  testWidgets('saves profile fields', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/profile',
        (server) => server.reply(200, profileJson()),
      )
      ..onPatch(
        '/v1/profile',
        (server) => server.reply(200, {
          ...profileJson(),
          'emergencyContact': 'Dad 888',
          'flat': {
            ...profileJson()['flat'] as Map<String, dynamic>,
            'adultCount': 3,
            'pngGasConnection': true,
          },
        }),
        data: Matchers.any,
      );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'resident', flatNumber: '101'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AccountPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(AppKeys.accountEmergencyContact),
      'Dad 888',
    );
    await tester.enterText(find.byKey(AppKeys.accountAdults), '3');
    await tester.ensureVisible(find.text('Save profile'));
    await tester.tap(find.text('Save profile'));
    await tester.pumpAndSettle();

    expect(find.text('Profile updated'), findsOneWidget);
  });
}
