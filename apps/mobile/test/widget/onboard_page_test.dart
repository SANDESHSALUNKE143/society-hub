import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/onboard/presentation/onboard_page.dart';
import 'package:societyhub_mobile/features/residents/presentation/residents_page.dart';

import '../helpers/test_harness.dart';

void main() {
  testWidgets('residents page shows directory and opens Add sheet', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/admin/residents',
        queryParameters: {'page': '1', 'limit': '20'},
        (server) => server.reply(200, {
          'items': [
            {
              'id': 'r1',
              'userId': 'u1',
              'name': 'Demo Resident',
              'phone': '8888888888',
              'email': null,
              'residentType': 'owner',
              'isPrimary': true,
              'status': 'active',
              'verificationStatus': 'approved',
              'moveInDate': '2026-01-01',
              'flat': {
                'id': 'f1',
                'number': '101',
                'wingName': 'A',
                'buildingName': null,
              },
              'createdAt': '2026-01-01T00:00:00.000Z',
            },
          ],
          'page': 1,
          'limit': 20,
          'total': 1,
        }),
      )
      ..onGet(
        '/v1/invitations',
        queryParameters: {'page': '1', 'limit': '20'},
        (server) => server.reply(200, {
          'items': [],
          'page': 1,
          'limit': 20,
          'total': 0,
        }),
      )
      ..onGet(
        '/v1/admin/flats',
        (server) => server.reply(200, [
          {'id': 'f1', 'number': '101', 'wingName': 'A'},
        ]),
      )
      ..onGet(
        '/v1/admin/society-residents',
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
        child: const MaterialApp(home: ResidentsPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Demo Resident'), findsOneWidget);
    expect(find.byKey(AppKeys.residentsAdd), findsOneWidget);
    expect(find.byKey(AppKeys.onboardNotifyEmail), findsNothing);

    await tester.tap(find.byKey(AppKeys.residentsAdd));
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.onboardForm), findsOneWidget);
    expect(find.byKey(AppKeys.onboardNotifyEmail), findsOneWidget);
    expect(find.byKey(AppKeys.onboardNotifyWhatsapp), findsOneWidget);
  });

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
        '/v1/admin/society-residents',
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
          'created': true,
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
    expect(find.byKey(AppKeys.onboardNotifyEmail), findsOneWidget);

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
        '/v1/admin/society-residents',
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

    expect(find.byKey(AppKeys.onboardTabFamily), findsOneWidget);
    await tester.tap(find.byKey(AppKeys.onboardTabOwner));
    await tester.pumpAndSettle();
    expect(find.text('Update owner'), findsOneWidget);
  });
}
