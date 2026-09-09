import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth/session.dart';
import 'features/account/presentation/account_page.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/auth/presentation/select_society_page.dart';
import 'features/complaints/presentation/complaints_pages.dart';
import 'features/dashboard/presentation/dashboard_page.dart';
import 'features/onboard/presentation/onboard_page.dart';
import 'features/shell/presentation/app_shell.dart';
import 'features/team/presentation/team_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionListenable(ref);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final loading = session.loading;
      final loggedIn = session.user != null;
      final loc = state.matchedLocation;
      final onLogin = loc == '/login';

      if (loading) return null;
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/select-society';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/select-society',
        builder: (context, state) => const SelectSocietyPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/home/dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: '/home/complaints',
            builder: (context, state) => const ComplaintsPage(),
          ),
          GoRoute(
            path: '/home/complaints/new',
            builder: (context, state) => const NewComplaintPage(),
          ),
          GoRoute(
            path: '/home/complaints/:id',
            builder: (context, state) => ComplaintDetailPage(
              id: state.pathParameters['id']!,
              justCreated:
                  state.uri.queryParameters['justCreated'] == '1',
            ),
          ),
          GoRoute(
            path: '/home/onboard',
            builder: (context, state) => const OnboardPage(),
          ),
          GoRoute(
            path: '/home/account',
            builder: (context, state) => const AccountPage(),
          ),
          GoRoute(
            path: '/home/bills',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Bills'),
          ),
          GoRoute(
            path: '/home/payments',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Payments'),
          ),
          GoRoute(
            path: '/home/notices',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Notices'),
          ),
          GoRoute(
            path: '/home/notifications',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Notifications'),
          ),
          GoRoute(
            path: '/home/invites',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Invites'),
          ),
          GoRoute(
            path: '/home/team',
            builder: (context, state) => const TeamPage(),
          ),
          GoRoute(
            path: '/home/structure',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Structure'),
          ),
          GoRoute(
            path: '/home/visitors',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Visitors'),
          ),
          GoRoute(
            path: '/home/parking',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Parking'),
          ),
          GoRoute(
            path: '/home/bookings',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Bookings'),
          ),
          GoRoute(
            path: '/home/assets',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Assets'),
          ),
          GoRoute(
            path: '/home/vendors',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Vendors'),
          ),
          GoRoute(
            path: '/home/events',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Events'),
          ),
          GoRoute(
            path: '/home/audit',
            builder: (context, state) =>
                const ComingSoonPage(title: 'Audit log'),
          ),
        ],
      ),
    ],
  );
});

class _SessionListenable extends ChangeNotifier {
  _SessionListenable(this._ref) {
    _ref.listen<SessionState>(sessionProvider, (_, _) => notifyListeners());
  }

  final Ref _ref;
}
