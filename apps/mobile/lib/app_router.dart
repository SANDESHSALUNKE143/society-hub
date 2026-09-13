import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth/session.dart';
import 'features/account/presentation/account_page.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/auth/presentation/select_society_page.dart';
import 'features/complaints/presentation/complaints_pages.dart';
import 'features/dashboard/presentation/dashboard_page.dart';
import 'features/residents/presentation/residents_page.dart';
import 'features/ops/presentation/api_list_page.dart';
import 'features/shell/presentation/app_shell.dart';
import 'features/team/presentation/team_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionListenable(ref);

  const adminOnlyPrefixes = [
    '/home/residents',
    '/home/team',
    '/home/structure',
    '/home/assets',
    '/home/vendors',
    '/home/events',
    '/home/audit',
    '/home/onboard',
    '/home/invites',
  ];

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

      final needsAdmin = adminOnlyPrefixes.any((p) => loc == p || loc.startsWith('$p/'));
      if (needsAdmin &&
          !(canUseAdminMode(session.user?.role) &&
              session.mode == AppMode.admin)) {
        return '/home/dashboard';
      }
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
            path: '/home/residents',
            builder: (context, state) => ResidentsPage(
              initialTab: state.uri.queryParameters['tab'] ?? 'directory',
              openAdd: state.uri.queryParameters['add'] == '1',
            ),
          ),
          GoRoute(
            path: '/home/onboard',
            builder: (context, state) =>
                const ResidentsRedirectPage(add: true),
          ),
          GoRoute(
            path: '/home/account',
            builder: (context, state) => const AccountPage(),
          ),
          GoRoute(
            path: '/home/bills',
            builder: (context, state) => const ApiListPage(
              title: 'Bills',
              path: '/v1/bills?page=1&limit=50',
              titleField: 'periodYm',
              subtitleField: 'status',
            ),
          ),
          GoRoute(
            path: '/home/payments',
            builder: (context, state) => const ApiListPage(
              title: 'Payments',
              path: '/v1/payments?page=1&limit=50',
              titleField: 'method',
              subtitleField: 'status',
            ),
          ),
          GoRoute(
            path: '/home/notices',
            builder: (context, state) => const ApiListPage(
              title: 'Notices',
              path: '/v1/notices?page=1&limit=50',
              titleField: 'title',
            ),
          ),
          GoRoute(
            path: '/home/notifications',
            builder: (context, state) => const ApiListPage(
              title: 'Notifications',
              path: '/v1/notifications?page=1&limit=50',
              titleField: 'title',
              subtitleField: 'body',
            ),
          ),
          GoRoute(
            path: '/home/invites',
            builder: (context, state) =>
                const ResidentsRedirectPage(tab: 'invites'),
          ),
          GoRoute(
            path: '/home/team',
            builder: (context, state) => const TeamPage(),
          ),
          GoRoute(
            path: '/home/structure',
            builder: (context, state) =>
                const ResidentsRedirectPage(tab: 'flats'),
          ),
          GoRoute(
            path: '/home/visitors',
            builder: (context, state) => const ApiListPage(
              title: 'Visitors',
              path: '/v1/visitors?page=1&limit=50',
              titleField: 'visitorName',
              subtitleField: 'purpose',
            ),
          ),
          GoRoute(
            path: '/home/parking',
            builder: (context, state) => const ApiListPage(
              title: 'Parking',
              path: '/v1/parking?page=1&limit=50',
              titleField: 'slotNumber',
              subtitleField: 'vehicleNumber',
            ),
          ),
          GoRoute(
            path: '/home/bookings',
            builder: (context, state) => const ApiListPage(
              title: 'Bookings',
              path: '/v1/bookings?page=1&limit=50',
              titleField: 'facilityName',
              subtitleField: 'status',
            ),
          ),
          GoRoute(
            path: '/home/assets',
            builder: (context, state) => const ApiListPage(
              title: 'Assets',
              path: '/v1/assets?page=1&limit=50',
              titleField: 'name',
              subtitleField: 'category',
            ),
          ),
          GoRoute(
            path: '/home/vendors',
            builder: (context, state) => const ApiListPage(
              title: 'Vendors',
              path: '/v1/vendors?page=1&limit=50',
              titleField: 'name',
              subtitleField: 'phone',
            ),
          ),
          GoRoute(
            path: '/home/events',
            builder: (context, state) => const ApiListPage(
              title: 'Events',
              path: '/v1/events?page=1&limit=50',
              titleField: 'title',
              subtitleField: 'location',
            ),
          ),
          GoRoute(
            path: '/home/audit',
            builder: (context, state) => const ApiListPage(
              title: 'Audit log',
              path: '/v1/audit-logs',
              itemsKey: '',
              titleField: 'action',
              subtitleField: 'entityType',
            ),
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
