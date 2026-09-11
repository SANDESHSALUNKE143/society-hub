import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../onboard/presentation/onboard_page.dart';

/// Admin hub: directory + leftover invitations + Add resident sheet.
class ResidentsPage extends ConsumerStatefulWidget {
  const ResidentsPage({
    super.key,
    this.initialTab = 'directory',
    this.openAdd = false,
  });

  final String initialTab;
  final bool openAdd;

  @override
  ConsumerState<ResidentsPage> createState() => _ResidentsPageState();
}

class _ResidentsPageState extends ConsumerState<ResidentsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _search = TextEditingController();
  PaginatedDto<ResidentSummaryDto>? _directory;
  PaginatedDto<InvitationDto>? _invites;
  bool _loadingDirectory = true;
  bool _loadingInvites = true;
  String? _directoryError;
  String? _invitesError;
  String? _actionMessage;
  String? _actionError;
  bool _openedAdd = false;

  @override
  void initState() {
    super.initState();
    final initialIndex = widget.initialTab == 'invites' ? 1 : 0;
    _tabs = TabController(length: 2, vsync: this, initialIndex: initialIndex);
    _tabs.addListener(() {
      if (_tabs.indexIsChanging) return;
      setState(() {});
      if (_tabs.index == 0) {
        _loadDirectory();
      } else {
        _loadInvites();
      }
    });
    _loadDirectory();
    _loadInvites();
    if (widget.openAdd) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_openedAdd && mounted) {
          _openedAdd = true;
          _openAddSheet();
        }
      });
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _loadDirectory() async {
    setState(() {
      _loadingDirectory = true;
      _directoryError = null;
    });
    try {
      final data = await ref.read(apiProvider).listResidents(
            search: _search.text.trim().isEmpty ? null : _search.text.trim(),
          );
      if (mounted) setState(() => _directory = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _directoryError = e.message);
    } finally {
      if (mounted) setState(() => _loadingDirectory = false);
    }
  }

  Future<void> _loadInvites() async {
    setState(() {
      _loadingInvites = true;
      _invitesError = null;
    });
    try {
      final data = await ref.read(apiProvider).listInvitations();
      if (mounted) setState(() => _invites = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _invitesError = e.message);
    } finally {
      if (mounted) setState(() => _loadingInvites = false);
    }
  }

  Future<void> _openAddSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.paper,
      builder: (ctx) {
        return SizedBox(
          height: MediaQuery.sizeOf(ctx).height * 0.94,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Add resident',
                        style: displayStyle(size: 22),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Save the household now. Optional Email / WhatsApp welcome — no invite link.',
                    style: TextStyle(fontSize: 13, color: Colors.black54),
                  ),
                ),
              ),
              const Expanded(child: OnboardPage()),
            ],
          ),
        );
      },
    );
    if (mounted) {
      await _loadDirectory();
      await _loadInvites();
    }
  }

  Future<void> _resend(InvitationDto invite) async {
    setState(() {
      _actionError = null;
      _actionMessage = null;
    });
    try {
      await ref.read(apiProvider).resendInvitation(invite.id);
      setState(
        () => _actionMessage =
            'Invitation resent to ${invite.email ?? invite.phone ?? invite.displayName}.',
      );
      await _loadInvites();
    } on ApiException catch (e) {
      setState(() => _actionError = e.message);
    }
  }

  Future<void> _revoke(InvitationDto invite) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke invitation?'),
        content: Text(
          'This link will stop working for ${invite.email ?? invite.phone ?? 'the invitee'}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _actionError = null;
      _actionMessage = null;
    });
    try {
      await ref.read(apiProvider).revokeInvitation(invite.id);
      setState(() => _actionMessage = 'Invitation revoked.');
      await _loadInvites();
    } on ApiException catch (e) {
      setState(() => _actionError = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Residents', style: displayStyle(size: 28)),
                      const SizedBox(height: 4),
                      const Text(
                        'Directory and leftover invite links. Add resident saves the household now.',
                        style: TextStyle(fontSize: 13, color: Colors.black54),
                      ),
                    ],
                  ),
                ),
                FilledButton(
                  key: AppKeys.residentsAdd,
                  onPressed: _openAddSheet,
                  child: const Text('Add'),
                ),
              ],
            ),
          ),
          TabBar(
            key: AppKeys.residentsTabs,
            controller: _tabs,
            labelColor: AppColors.leafDark,
            indicatorColor: AppColors.saffron,
            tabs: const [
              Tab(text: 'Directory'),
              Tab(text: 'Pending invitations'),
            ],
          ),
          if (_actionMessage != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                _actionMessage!,
                style: const TextStyle(color: Color(0xFF2E7D32)),
              ),
            ),
          if (_actionError != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                _actionError!,
                style: const TextStyle(color: AppColors.danger),
              ),
            ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _buildDirectory(),
                _buildInvites(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDirectory() {
    return RefreshIndicator(
      onRefresh: _loadDirectory,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            key: AppKeys.residentsSearch,
            controller: _search,
            decoration: InputDecoration(
              labelText: 'Search',
              hintText: 'Name, phone, email or flat',
              suffixIcon: IconButton(
                icon: const Icon(Icons.search),
                onPressed: _loadDirectory,
              ),
            ),
            onSubmitted: (_) => _loadDirectory(),
          ),
          const SizedBox(height: 12),
          if (_loadingDirectory)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_directoryError != null)
            Text(_directoryError!, style: const TextStyle(color: AppColors.danger))
          else if ((_directory?.items.isEmpty ?? true))
            const Text('No residents match these filters.')
          else
            Column(
              key: AppKeys.residentsList,
              children: [
                for (final row in _directory!.items)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(row.displayName),
                      subtitle: Text(
                        [
                          row.flatLabel,
                          row.residentType,
                          row.status,
                        ].join(' · '),
                      ),
                      trailing: Text(
                        row.phone ?? row.email ?? '',
                        style: const TextStyle(fontSize: 12, color: Colors.black45),
                      ),
                    ),
                  ),
                if (_directory!.total > _directory!.items.length)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Showing ${_directory!.items.length} of ${_directory!.total}',
                      style: const TextStyle(fontSize: 12, color: Colors.black45),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildInvites() {
    return RefreshIndicator(
      onRefresh: _loadInvites,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Leftover invite links from CSV or older flows. New residents use Add — they sign in with mobile OTP.',
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
          const SizedBox(height: 12),
          if (_loadingInvites)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_invitesError != null)
            Text(_invitesError!, style: const TextStyle(color: AppColors.danger))
          else if ((_invites?.items.isEmpty ?? true))
            const Text('No invitations match these filters.')
          else
            Column(
              key: AppKeys.residentsInvites,
              children: [
                for (final invite in _invites!.items)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(invite.displayName),
                      subtitle: Text(
                        [
                          invite.role,
                          invite.status,
                          if (invite.flatNumber != null) invite.flatNumber!,
                          if (invite.expiresAt != null)
                            'expires ${invite.expiresAt!.substring(0, 10)}',
                        ].join(' · '),
                      ),
                      isThreeLine: true,
                      trailing: Wrap(
                        spacing: 4,
                        children: [
                          if (invite.status == 'pending' ||
                              invite.status == 'expired')
                            TextButton(
                              onPressed: () => _resend(invite),
                              child: const Text('Resend'),
                            ),
                          if (invite.status != 'accepted' &&
                              invite.status != 'revoked')
                            TextButton(
                              onPressed: () => _revoke(invite),
                              child: const Text('Revoke'),
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Thin redirect host used by legacy `/home/onboard` and `/home/invites`.
class ResidentsRedirectPage extends StatelessWidget {
  const ResidentsRedirectPage({
    super.key,
    this.tab,
    this.add = false,
  });

  final String? tab;
  final bool add;

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final q = <String, String>{};
      if (tab != null) q['tab'] = tab!;
      if (add) q['add'] = '1';
      final query = q.entries.map((e) => '${e.key}=${e.value}').join('&');
      context.go(query.isEmpty ? '/home/residents' : '/home/residents?$query');
    });
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
