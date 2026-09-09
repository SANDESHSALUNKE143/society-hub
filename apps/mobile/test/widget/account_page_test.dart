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
    tester.view.physicalSize = const Size(800, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/profile',
        (server) => server.reply(200, profileJson()),
      )
      ..onGet(
        '/v1/household/members',
        (server) => server.reply(200, []),
      )
      ..onGet(
        '/v1/parking',
        (server) => server.reply(200, []),
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
    expect(find.byKey(AppKeys.accountSectionTabs), findsOneWidget);
    await tester.tap(find.byKey(AppKeys.accountSectionHousehold));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.accountTabs), findsOneWidget);
    await tester.ensureVisible(find.byKey(AppKeys.accountTabFamily));
    await tester.tap(find.byKey(AppKeys.accountTabFamily));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.accountFamilyMembers), findsOneWidget);
    expect(find.byKey(AppKeys.accountFamilyPhone), findsOneWidget);
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
    expect(find.byKey(AppKeys.accountFamilyMembers), findsNothing);
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
      ..onGet(
        '/v1/household/members',
        (server) => server.reply(200, []),
      )
      ..onGet(
        '/v1/parking',
        (server) => server.reply(200, []),
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

    await tester.tap(find.byKey(AppKeys.accountSectionHousehold));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(AppKeys.accountEmergencyContact),
      'Dad 888',
    );
    await tester.tap(find.byKey(AppKeys.accountTabFamily));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(AppKeys.accountAdults), '3');
    await tester.ensureVisible(find.text('Save household counts'));
    await tester.tap(find.text('Save household counts'));
    await tester.pumpAndSettle();

    expect(find.text('Profile updated'), findsOneWidget);
  });

  testWidgets('owner can add a family member', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/profile',
        (server) => server.reply(200, profileJson()),
      )
      ..onGet(
        '/v1/household/members',
        (server) => server.reply(200, [
          {
            'userId': 'u1',
            'name': 'Owner',
            'email': null,
            'phone': '9000000001',
            'flatId': 'f1',
            'flatNumber': '101',
            'wingName': 'A',
            'isOwner': true,
          },
        ]),
      )
      ..onGet(
        '/v1/parking',
        (server) => server.reply(200, []),
      )
      ..onPost(
        '/v1/household/members',
        (server) => server.reply(200, {
          'user': userJson(
            fixtureUser(role: 'resident', name: 'Family Kid', phone: '9000000002'),
          ),
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

    await tester.tap(find.byKey(AppKeys.accountSectionHousehold));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(AppKeys.accountTabFamily));
    await tester.pumpAndSettle();
    expect(find.text('Owner'), findsWidgets);
    expect(find.text('People in this flat'), findsOneWidget);
    await tester.enterText(find.byKey(AppKeys.accountFamilyName), 'Family Kid');
    await tester.enterText(find.byKey(AppKeys.accountFamilyPhone), '9000000002');
    await tester.ensureVisible(find.byKey(AppKeys.accountAddFamily));
    await tester.tap(find.byKey(AppKeys.accountAddFamily));
    await tester.pumpAndSettle();

    expect(find.textContaining('Added Family Kid'), findsOneWidget);
  });
}
