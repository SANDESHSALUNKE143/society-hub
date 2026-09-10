import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/theme.dart';
import '../../../shared/complaint_ui.dart';
import '../../../shared/widgets.dart';

class DashboardPage extends ConsumerStatefulWidget {
  const DashboardPage({super.key});

  @override
  ConsumerState<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends ConsumerState<DashboardPage> {
  DashboardStatsDto? _stats;
  List<ComplaintDto> _recent = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiProvider);
    final staffView = ref.read(sessionProvider.notifier).isStaffView;
    try {
      final stats = await api.getDashboardStats(mine: !staffView);
      if (mounted) setState(() => _stats = stats);
    } catch (_) {}
    try {
      final list = await api.listComplaints(page: 1, limit: 4, mine: !staffView);
      if (mounted) setState(() => _recent = list.items);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final user = session.user;
    final staffView = ref.watch(sessionProvider.notifier).isStaffView;
    ref.listen(sessionProvider, (prev, next) {
      if (prev?.mode != next.mode) {
        _load();
      }
    });
    final firstName = user?.name?.split(' ').first;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            firstName == null ? 'Hello' : 'Hello, $firstName',
            style: displayStyle(size: 28),
          ),
          const SizedBox(height: 4),
          Text(
            user?.flatNumber != null
                ? 'Flat ${user!.flatNumber}'
                : 'Welcome to SocietyHub',
            style: const TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 20),
          KpiCard(
            label: 'Dues outstanding',
            value: _stats == null
                ? '—'
                : formatRupees(_stats!.duesOutstandingPaise),
            onTap: () => context.go('/home/bills'),
          ),
          const SizedBox(height: 12),
          KpiCard(
            label: 'Open complaints',
            value: _stats?.openComplaints.toString() ?? '—',
            onTap: () => context.go('/home/complaints'),
          ),
          const SizedBox(height: 12),
          KpiCard(
            label: 'Notices',
            value: _stats?.publishedNotices.toString() ?? '—',
            onTap: () => context.go('/home/notices'),
          ),
          const SizedBox(height: 24),
          ShCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        staffView ? 'Recent complaints' : 'Your recent complaints',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.go('/home/complaints'),
                      child: const Text('View all'),
                    ),
                  ],
                ),
                if (_recent.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No complaints yet.',
                      style: TextStyle(color: Colors.black54),
                    ),
                  )
                else
                  ..._recent.map(
                    (c) => ComplaintListTile(
                      complaint: c,
                      onTap: () => context.go('/home/complaints/${c.id}'),
                    ),
                  ),
                const SizedBox(height: 8),
                ShPrimaryButton(
                  label: 'Raise complaint',
                  onPressed: () => context.go('/home/complaints/new'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
