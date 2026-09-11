import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/core/app_keys.dart';
import 'package:societyhub_mobile/features/shell/presentation/app_shell.dart';

import '../helpers/test_harness.dart';

Future<void> pumpShell(
  WidgetTester tester, {
  required UserRoleSeed seed,
}) async {
  final container = ProviderContainer(overrides: testSessionOverrides());
  addTearDown(container.dispose);
  await container.read(sessionProvider.notifier).setSession(
        fixtureUser(role: seed.role, name: seed.name, flatNumber: seed.flat),
        fixtureTokens(),
      );
  container.read(sessionProvider.notifier).setMode(seed.mode);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: ThemeData(useMaterial3: true),
        home: const AppShell(child: Text('BODY')),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class UserRoleSeed {
  const UserRoleSeed({
    required this.role,
    this.mode = AppMode.admin,
    this.name = 'Demo',
    this.flat,
  });
  final String role;
  final AppMode mode;
  final String name;
  final String? flat;
}

void main() {
  testWidgets('chairperson sees Admin/Resident toggle', (tester) async {
    await pumpShell(
      tester,
      seed: const UserRoleSeed(role: 'chairperson'),
    );

    final scaffold = tester.state<ScaffoldState>(find.byType(Scaffold));
    scaffold.openDrawer();
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.modeToggle), findsOneWidget);
    expect(find.byKey(AppKeys.modeAdmin), findsOneWidget);
    expect(find.byKey(AppKeys.modeResident), findsOneWidget);
    expect(find.text('Onboard resident'), findsOneWidget);
  });

  testWidgets('switching to Resident hides admin-only nav', (tester) async {
    await pumpShell(
      tester,
      seed: const UserRoleSeed(role: 'chairperson'),
    );

    tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
    await tester.pumpAndSettle();
    expect(find.text('Onboard resident'), findsOneWidget);

    await tester.tap(find.byKey(AppKeys.modeResident));
    await tester.pumpAndSettle();

    expect(find.text('Onboard resident'), findsNothing);
    expect(find.text('Complaints'), findsOneWidget);
  });

  testWidgets('pure resident never sees mode toggle', (tester) async {
    await pumpShell(
      tester,
      seed: const UserRoleSeed(
        role: 'resident',
        mode: AppMode.resident,
        flat: '101',
      ),
    );

    tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
    await tester.pumpAndSettle();

    expect(find.byKey(AppKeys.modeToggle), findsNothing);
    expect(find.text('Onboard resident'), findsNothing);
    expect(find.text('Complaints'), findsOneWidget);
  });
}
