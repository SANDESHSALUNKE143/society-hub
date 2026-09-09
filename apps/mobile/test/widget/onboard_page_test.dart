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
    expect(find.textContaining('family members'), findsWidgets);
    expect(find.textContaining('web Client App'), findsWidgets);

    await tester.enterText(find.byKey(AppKeys.onboardName), 'New Person');
    await tester.enterText(find.byKey(AppKeys.onboardPhone), '7777777777');
    await tester.ensureVisible(find.byKey(AppKeys.onboardSubmit));
    await tester.tap(find.byKey(AppKeys.onboardSubmit));
    await tester.pumpAndSettle();

    expect(find.textContaining('Onboarded New Person'), findsOneWidget);
  });
}
