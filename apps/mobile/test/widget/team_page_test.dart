import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/team/presentation/team_page.dart';

import '../helpers/test_harness.dart';

void main() {
  testWidgets('admin can add a team member with mobile', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    var listed = [
      {
        'userId': 'u2',
        'name': 'Committee',
        'email': 'ops@example.com',
        'phone': null,
        'role': 'committee',
      },
    ];
    bundle.adapter
      ..onGet('/v1/team', (server) => server.reply(200, listed))
      ..onPost(
        '/v1/team',
        (server) {
          listed = [
            ...listed,
            {
              'userId': 'u3',
              'name': 'New Staff',
              'email': null,
              'phone': '7777777777',
              'role': 'secretary',
            },
          ];
          return server.reply(200, {
            'ok': true,
            'userId': 'u3',
            'role': 'secretary',
            'societyName': 'Keshav Heights',
          });
        },
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
        child: const MaterialApp(home: TeamPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.teamPage), findsOneWidget);
    expect(find.byKey(AppKeys.addTeamPhone), findsOneWidget);
    expect(find.text('Committee'), findsOneWidget);
    expect(find.textContaining('OTP login will not work'), findsOneWidget);
    expect(find.byKey(AppKeys.teamEdit('u2')), findsOneWidget);
    expect(find.byKey(AppKeys.teamRemove('u2')), findsOneWidget);

    await tester.enterText(find.byKey(AppKeys.addTeamPhone), '7777777777');
    await tester.enterText(find.byKey(AppKeys.addTeamName), 'New Staff');
    await tester.ensureVisible(find.byKey(AppKeys.addTeamSubmit));
    await tester.tap(find.byKey(AppKeys.addTeamSubmit));
    await tester.pumpAndSettle();

    expect(find.textContaining('Added as secretary'), findsOneWidget);
  });

  testWidgets('admin can edit missing mobile on a team member', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final bundle = MockApiBundle();
    bundle.adapter
      ..onGet(
        '/v1/team',
        (server) => server.reply(200, [
          {
            'userId': 'u2',
            'name': 'Committee',
            'email': 'ops@example.com',
            'phone': null,
            'role': 'committee',
          },
        ]),
      )
      ..onPatch(
        '/v1/team/u2',
        (server) => server.reply(200, {
          'userId': 'u2',
          'name': 'Committee',
          'email': 'ops@example.com',
          'phone': '8888888888',
          'role': 'committee',
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
        child: const MaterialApp(home: TeamPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(AppKeys.teamEdit('u2')));
    await tester.pumpAndSettle();
    expect(find.byKey(AppKeys.editTeamForm), findsOneWidget);
    await tester.enterText(find.byKey(AppKeys.editTeamPhone), '8888888888');
    await tester.tap(find.byKey(AppKeys.editTeamSave));
    await tester.pumpAndSettle();

    expect(find.textContaining('Team member updated'), findsOneWidget);
  });
}
