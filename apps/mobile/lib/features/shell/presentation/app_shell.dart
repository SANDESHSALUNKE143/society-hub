import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/widgets.dart';

class _NavItem {
  const _NavItem(this.path, this.label, this.icon);
  final String path;
  final String label;
  final IconData icon;
}

class _NavSection {
  const _NavSection(this.title, this.items);
  final String title;
  final List<_NavItem> items;
}

const _adminSections = [
  _NavSection('Overview', [
    _NavItem('/home/dashboard', 'Dashboard', Icons.dashboard_outlined),
  ]),
  _NavSection('Operations', [
    _NavItem('/home/complaints', 'Complaints', Icons.report_problem_outlined),
    _NavItem('/home/residents', 'Residents', Icons.people_outline),
    _NavItem('/home/team', 'Team', Icons.groups_outlined),
  ]),
  _NavSection('Finance', [
    _NavItem('/home/bills', 'Bills', Icons.receipt_long_outlined),
    _NavItem('/home/payments', 'Payments', Icons.payments_outlined),
  ]),
  _NavSection('Communication', [
    _NavItem('/home/notices', 'Notices', Icons.campaign_outlined),
    _NavItem('/home/notifications', 'Notifications', Icons.notifications_outlined),
  ]),
  _NavSection('Society', [
    _NavItem('/home/structure', 'Structure', Icons.apartment_outlined),
    _NavItem('/home/visitors', 'Visitors', Icons.hail_outlined),
    _NavItem('/home/parking', 'Parking', Icons.local_parking_outlined),
    _NavItem('/home/bookings', 'Bookings', Icons.event_available_outlined),
    _NavItem('/home/assets', 'Assets', Icons.inventory_2_outlined),
    _NavItem('/home/vendors', 'Vendors', Icons.storefront_outlined),
    _NavItem('/home/events', 'Events', Icons.celebration_outlined),
  ]),
  _NavSection('System', [
    _NavItem('/home/audit', 'Audit log', Icons.history_outlined),
  ]),
];

const _residentSections = [
  _NavSection('Overview', [
    _NavItem('/home/dashboard', 'Dashboard', Icons.dashboard_outlined),
  ]),
  _NavSection('Complaints', [
    _NavItem('/home/complaints', 'Complaints', Icons.report_problem_outlined),
  ]),
  _NavSection('Finance', [
    _NavItem('/home/bills', 'Bills', Icons.receipt_long_outlined),
    _NavItem('/home/payments', 'Payments', Icons.payments_outlined),
  ]),
  _NavSection('Communication', [
    _NavItem('/home/notices', 'Notices', Icons.campaign_outlined),
    _NavItem('/home/notifications', 'Notifications', Icons.notifications_outlined),
  ]),
  _NavSection('Society', [
    _NavItem('/home/visitors', 'Visitors', Icons.hail_outlined),
    _NavItem('/home/parking', 'Parking', Icons.local_parking_outlined),
    _NavItem('/home/bookings', 'Clubhouse booking', Icons.event_available_outlined),
  ]),
];

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final user = session.user;
    final showToggle = canUseAdminMode(user?.role);
    final sections = (showToggle && session.mode == AppMode.admin)
        ? _adminSections
        : _residentSections;

    return Scaffold(
      appBar: AppBar(
        title: Text('SocietyHub', style: displayStyle(size: 22)),
        actions: [
          IconButton(
            tooltip: 'Account',
            onPressed: () => context.go('/home/account'),
            icon: const Icon(Icons.person_outline),
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: AppColors.card,
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: BrandMark(compact: true),
              ),
              if (user?.flatNumber != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Flat ${user!.flatNumber}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                      color: AppColors.gold,
                    ),
                  ),
                ),
              if (showToggle)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Container(
                    key: AppKeys.modeToggle,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: AppColors.mist.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: _ModeChip(
                            key: AppKeys.modeAdmin,
                            label: 'Admin',
                            selected: session.mode == AppMode.admin,
                            onTap: () => ref
                                .read(sessionProvider.notifier)
                                .setMode(AppMode.admin),
                          ),
                        ),
                        Expanded(
                          child: _ModeChip(
                            key: AppKeys.modeResident,
                            label: 'Resident',
                            selected: session.mode == AppMode.resident,
                            onTap: () => ref
                                .read(sessionProvider.notifier)
                                .setMode(AppMode.resident),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  children: [
                    for (final section in sections) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                        child: Text(
                          section.title.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                            color: Colors.black38,
                          ),
                        ),
                      ),
                      for (final item in section.items)
                        ListTile(
                          leading: Icon(item.icon, size: 20),
                          title: Text(item.label),
                          dense: true,
                          onTap: () {
                            Navigator.of(context).pop();
                            context.go(item.path);
                          },
                        ),
                    ],
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Log out'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await ref.read(sessionProvider.notifier).clearSession();
                  if (context.mounted) context.go('/login');
                },
              ),
              if (user?.name != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Text(
                    '${user!.name} · ${user.role}',
                    style: const TextStyle(fontSize: 12, color: Colors.black38),
                  ),
                ),
            ],
          ),
        ),
      ),
      body: child,
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(6),
      elevation: selected ? 1 : 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.leafDark : Colors.black54,
            ),
          ),
        ),
      ),
    );
  }
}
