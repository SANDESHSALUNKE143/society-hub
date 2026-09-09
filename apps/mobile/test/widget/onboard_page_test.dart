import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/onboard/presentation/onboard_page.dart';

import '../helpers/test_harness.dart';

void main() {
  testWidgets('admin can submit single resident onboard (no CSV UI)', (tester) async {
    tester.view.physicalSize = const Size(800, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/admin/flats',
        (server) => server.reply(200, [
          {'id': 'f1', 'number': '101', 'wingName': 'A'},
        ]),
      )
      ..onGet(
        '/v1/admin/residents',
        (server) => server.reply(200, []),
      )
      ..onGet(
        '/v1/auth/memberships',
        (server) => server.reply(200, [
          {
            'tenantId': 't1',
            'societyName': 'Keshav Heights',
            'role': 'chairperson',
            'canUseAdminMode': true,
          },
        ]),
      )
      ..onPost(
        '/v1/admin/residents',
        (server) => server.reply(200, {
          'user': userJson(
            fixtureUser(role: 'resident', name: 'New Person', phone: '7777777777'),
          ),
        }),
        data: Matchers.any,
      );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'chairperson'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: OnboardPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.onboardForm), findsOneWidget);
    expect(find.textContaining('Pick a flat to see Owner'), findsWidgets);
    expect(find.byKey(AppKeys.onboardTabs), findsOneWidget);
    expect(find.text('Owner'), findsWidgets);
    expect(find.text('Family'), findsWidgets);
    expect(find.text('Parking Details'), findsOneWidget);
    expect(find.text('Gas'), findsOneWidget);

    await tester.enterText(find.byKey(AppKeys.onboardName), 'New Person');
    await tester.enterText(find.byKey(AppKeys.onboardPhone), '7777777777');
    await tester.ensureVisible(find.byKey(AppKeys.onboardSubmit));
    await tester.tap(find.byKey(AppKeys.onboardSubmit));
    await tester.pumpAndSettle();

    expect(find.textContaining('Onboarded New Person'), findsOneWidget);
  });

  testWidgets('staff can open Owner tab to edit an existing owner', (tester) async {
    tester.view.physicalSize = const Size(800, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/admin/flats',
        (server) => server.reply(200, [
          {'id': 'f1', 'number': '101', 'wingName': 'A'},
        ]),
      )
      ..onGet(
        '/v1/admin/residents',
        (server) => server.reply(200, [
          {
            'userId': 'u-owner',
            'name': 'Demo Resident',
            'email': 'demo@example.com',
            'phone': '8888888888',
            'flatId': 'f1',
            'flatNumber': '101',
            'wingName': 'A',
            'isOwner': true,
          },
        ]),
      )
      ..onGet(
        '/v1/auth/memberships',
        (server) => server.reply(200, [
          {
            'tenantId': 't1',
            'societyName': 'Keshav Heights',
            'role': 'chairperson',
            'canUseAdminMode': true,
          },
        ]),
      );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'chairperson'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: OnboardPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.onboardTabs), findsOneWidget);

    await tester.tap(find.byKey(AppKeys.onboardTabOwner));
    await tester.pumpAndSettle();

    expect(
      tester.widget<TextField>(find.byKey(AppKeys.onboardName)).controller?.text,
      'Demo Resident',
    );
    expect(find.text('Update owner'), findsOneWidget);
  });
}
