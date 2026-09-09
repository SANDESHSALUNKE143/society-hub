import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/memberships.dart';
import '../../../auth/session.dart';
import '../../../core/theme.dart';
import '../../../shared/widgets.dart';

class SelectSocietyPage extends ConsumerStatefulWidget {
  const SelectSocietyPage({super.key});

  @override
  ConsumerState<SelectSocietyPage> createState() => _SelectSocietyPageState();
}

class _SelectSocietyPageState extends ConsumerState<SelectSocietyPage> {
  List<MembershipDto>? _memberships;
  String? _busyTenant;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final unique = uniqueMembershipsBySociety(rows);
      if (!mounted) return;
      if (unique.length <= 1) {
        context.go('/home/dashboard');
        return;
      }
      setState(() => _memberships = unique);
    } catch (_) {
      if (!mounted) return;
      context.go('/home/dashboard');
    }
  }

  Future<void> _pick(String tenantId) async {
    setState(() {
      _busyTenant = tenantId;
      _error = null;
    });
    try {
      final res = await ref.read(apiProvider).selectTenant(tenantId);
      await ref.read(sessionProvider.notifier).setSession(res.user, res.tokens);
      if (!mounted) return;
      context.go('/home/dashboard');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busyTenant = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                children: [
                  Text('Choose your society', style: displayStyle(size: 28)),
                  const SizedBox(height: 8),
                  const Text(
                    'You belong to more than one society. Pick one to continue.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black54),
                  ),
                  const SizedBox(height: 24),
                  ShCard(
                    padding: EdgeInsets.zero,
                    child: _memberships == null
                        ? const Padding(
                            padding: EdgeInsets.all(24),
                            child: Center(child: CircularProgressIndicator()),
                          )
                        : Column(
                            children: [
                              for (var i = 0; i < _memberships!.length; i++) ...[
                                if (i > 0) const Divider(height: 1),
                                ListTile(
                                  title: Text(
                                    _memberships![i].societyName,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  trailing: Text(
                                    _busyTenant == _memberships![i].tenantId
                                        ? 'Switching…'
                                        : 'Continue →',
                                    style: const TextStyle(color: AppColors.leaf),
                                  ),
                                  onTap: _busyTenant != null
                                      ? null
                                      : () => _pick(_memberships![i].tenantId),
                                ),
                              ],
                            ],
                          ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!, style: const TextStyle(color: AppColors.danger)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
