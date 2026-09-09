import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/widgets.dart';

const _teamRoles = [
  ('chairperson', 'Chairperson'),
  ('secretary', 'Secretary'),
  ('treasurer', 'Treasurer'),
  ('cashier', 'Cashier'),
  ('committee', 'Committee member'),
];

/// Society Admin team list — add / update email+mobile / remove. Mirrors web Team.
class TeamPage extends ConsumerStatefulWidget {
  const TeamPage({super.key});

  @override
  ConsumerState<TeamPage> createState() => _TeamPageState();
}

class _TeamPageState extends ConsumerState<TeamPage> {
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _name = TextEditingController();
  String _role = 'committee';
  List<TeamMemberDto> _items = [];
  bool _loading = true;
  bool _busy = false;
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _email.dispose();
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final session = ref.read(sessionProvider);
    if (!canUseAdminMode(session.user?.role)) return;
    try {
      final rows = await ref.read(apiProvider).listTeam();
      if (mounted) {
        setState(() {
          _items = rows;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load team';
          _loading = false;
        });
      }
    }
  }

  Future<void> _add() async {
    final phone = _phone.text.trim();
    if (phone.length < 10) {
      setState(() => _error = 'Enter a 10-digit mobile number so they can sign in with OTP.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final res = await ref.read(apiProvider).addTeamMember(
            email: _email.text.trim().isEmpty ? null : _email.text.trim(),
            phone: phone,
            name: _name.text.trim().isEmpty ? null : _name.text.trim(),
            role: _role,
          );
      _email.clear();
      _phone.clear();
      _name.clear();
      setState(() {
        _message =
            'Added as ${res.role}. They can sign in on this app with that mobile (OTP).';
      });
      await _load();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit(TeamMemberDto member) async {
    final draft = await showModalBottomSheet<_TeamDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _EditTeamSheet(member: member),
    );
    if (draft == null) return;
    if (draft.phone.length < 10) {
      setState(() => _error = 'Enter a 10-digit mobile so they can sign in with OTP.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await ref.read(apiProvider).updateTeamMember(
            member.userId,
            email: draft.email.isEmpty ? null : draft.email,
            phone: draft.phone,
            name: draft.name.isEmpty ? null : draft.name,
            role: draft.role,
          );
      setState(() => _message = 'Team member updated. They can sign in with that mobile.');
      await _load();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(TeamMemberDto member) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove from team?'),
        content: Text(
          'Remove ${member.displayName} from this society team? They will not be able to use Admin mode.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await ref.read(apiProvider).removeTeamMember(member.userId);
      setState(() => _message = 'Team member removed.');
      await _load();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (!canUseAdminMode(session.user?.role) || session.mode != AppMode.admin) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/home/dashboard');
      });
      return const SizedBox.shrink();
    }

    final me = session.user?.id;

    return ListView(
      key: AppKeys.teamPage,
      padding: const EdgeInsets.all(16),
      children: [
        Text('Team', style: displayStyle(size: 28)),
        const SizedBox(height: 4),
        const Text(
          'Staff who can manage this society. Add a mobile number so they can sign in with OTP on this app.',
          style: TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        ShCard(
          key: AppKeys.addTeamForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Add team member',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              const SizedBox(height: 12),
              TextField(
                key: AppKeys.addTeamEmail,
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email (optional)'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: AppKeys.addTeamPhone,
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Mobile',
                  hintText: '10-digit mobile',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: AppKeys.addTeamName,
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name (optional)'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                // ignore: deprecated_member_use
                value: _role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: [
                  for (final r in _teamRoles)
                    DropdownMenuItem(value: r.$1, child: Text(r.$2)),
                ],
                onChanged: (v) => setState(() => _role = v ?? _role),
              ),
              const SizedBox(height: 20),
              ShPrimaryButton(
                key: AppKeys.addTeamSubmit,
                label: 'Add team member',
                busy: _busy,
                onPressed: _add,
              ),
            ],
          ),
        ),
        if (_message != null) ...[
          const SizedBox(height: 12),
          Text(_message!, style: const TextStyle(color: Color(0xFF2E7D32))),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        const SizedBox(height: 24),
        if (_loading)
          const Center(child: CircularProgressIndicator())
        else if (_items.isEmpty)
          const Text('No team members yet.', style: TextStyle(color: Colors.black54))
        else
          Column(
            key: AppKeys.teamList,
            children: [
              for (final m in _items) ...[
                ShCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        m.displayName,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                      ),
                      const SizedBox(height: 4),
                      Text(m.email ?? 'No email', style: const TextStyle(color: Colors.black54)),
                      Text(
                        m.phone ?? 'No mobile — OTP login will not work',
                        style: TextStyle(
                          color: m.phone == null ? AppColors.alert : Colors.black54,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Chip(label: Text(m.role), visualDensity: VisualDensity.compact),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          TextButton(
                            key: AppKeys.teamEdit(m.userId),
                            onPressed: _busy ? null : () => _edit(m),
                            child: const Text('Edit'),
                          ),
                          if (m.userId != me)
                            TextButton(
                              key: AppKeys.teamRemove(m.userId),
                              onPressed: _busy ? null : () => _remove(m),
                              child: const Text('Remove'),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
      ],
    );
  }
}

class _TeamDraft {
  const _TeamDraft({
    required this.email,
    required this.phone,
    required this.name,
    required this.role,
  });

  final String email;
  final String phone;
  final String name;
  final String role;
}

class _EditTeamSheet extends StatefulWidget {
  const _EditTeamSheet({required this.member});

  final TeamMemberDto member;

  @override
  State<_EditTeamSheet> createState() => _EditTeamSheetState();
}

class _EditTeamSheetState extends State<_EditTeamSheet> {
  late final TextEditingController _email;
  late final TextEditingController _phone;
  late final TextEditingController _name;
  late String _role;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.member.email ?? '');
    _phone = TextEditingController(text: widget.member.phone ?? '');
    _name = TextEditingController(text: widget.member.name ?? '');
    _role = _teamRoles.any((r) => r.$1 == widget.member.role)
        ? widget.member.role
        : 'committee';
  }

  @override
  void dispose() {
    _email.dispose();
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        key: AppKeys.editTeamForm,
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Update ${widget.member.displayName}', style: displayStyle(size: 22)),
          const SizedBox(height: 12),
          TextField(
            key: AppKeys.editTeamEmail,
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 12),
          TextField(
            key: AppKeys.editTeamPhone,
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Mobile',
              hintText: '10-digit mobile',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            // ignore: deprecated_member_use
            value: _role,
            decoration: const InputDecoration(labelText: 'Role'),
            items: [
              for (final r in _teamRoles)
                DropdownMenuItem(value: r.$1, child: Text(r.$2)),
            ],
            onChanged: (v) => setState(() => _role = v ?? _role),
          ),
          const SizedBox(height: 20),
          ShPrimaryButton(
            key: AppKeys.editTeamSave,
            label: 'Save changes',
            onPressed: () => Navigator.pop(
              context,
              _TeamDraft(
                email: _email.text.trim(),
                phone: _phone.text.trim(),
                name: _name.text.trim(),
                role: _role,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
