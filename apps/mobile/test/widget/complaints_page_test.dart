import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/complaints/presentation/complaints_pages.dart';

import '../helpers/test_harness.dart';

void main() {
  testWidgets('lists complaints from API and filters by search', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onGet(
      RegExp(r'/v1/complaints.*'),
      (server) => server.reply(200, {
        'items': [
          {
            'id': 'c1',
            'ticketNumber': 'C-1',
            'title': 'Gate issue',
            'type': 'security',
            'description': 'x',
            'status': 'open',
            'flatId': 'f1',
            'flatNumber': '101',
            'residentName': null,
            'createdAt': '2026-07-19T00:00:00.000Z',
          },
          {
            'id': 'c2',
            'ticketNumber': 'C-2',
            'title': 'Water leak',
            'type': 'plumbing',
            'description': 'y',
            'status': 'open',
            'flatId': 'f2',
            'flatNumber': '202',
            'residentName': null,
            'createdAt': '2026-07-19T00:00:00.000Z',
          },
        ],
        'page': 1,
        'limit': 20,
        'total': 2,
      }),
    );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container.read(sessionProvider.notifier).setSession(
          fixtureUser(role: 'chairperson'),
          fixtureTokens(),
        );
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const ComplaintsPage(),
        ),
        GoRoute(
          path: '/home/complaints/new',
          builder: (_, _) => const Scaffold(body: Text('NEW')),
        ),
        GoRoute(
          path: '/home/complaints/:id',
          builder: (_, state) =>
              Scaffold(body: Text('DETAIL:${state.pathParameters['id']}')),
        ),
      ],
    );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.complaintsList), findsOneWidget);
    expect(find.text('Gate issue'), findsOneWidget);
    expect(find.text('Water leak'), findsOneWidget);
    expect(find.text('Ticket ID'), findsWidgets);
    expect(find.text('Flat 101'), findsOneWidget);

    await tester.enterText(find.byKey(AppKeys.complaintsSearch), 'gate');
    await tester.pumpAndSettle();
    expect(find.text('Gate issue'), findsOneWidget);
    expect(find.text('Water leak'), findsNothing);
  });

  testWidgets('shows empty state when API returns no items', (tester) async {
    final bundle = MockApiBundle();
    bundle.adapter.onGet(
      RegExp(r'/v1/complaints.*'),
      (server) => server.reply(200, {
        'items': <Map<String, dynamic>>[],
        'page': 1,
        'limit': 20,
        'total': 0,
      }),
    );

    final container = ProviderContainer(overrides: testSessionOverrides());
    addTearDown(container.dispose);
    await container
        .read(sessionProvider.notifier)
        .setSession(fixtureUser(role: 'resident'), fixtureTokens());
    container.read(sessionProvider.notifier).setMode(AppMode.resident);
    container.read(sessionProvider.notifier).replaceApiForTest(bundle.api);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: ComplaintsPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.complaintsEmpty), findsOneWidget);
  });
}
