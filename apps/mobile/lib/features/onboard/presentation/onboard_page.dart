import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/widgets.dart';

/// Manual single-resident onboard only. CSV / bulk import stays on web Client App.
class OnboardPage extends ConsumerStatefulWidget {
  const OnboardPage({super.key});

  @override
  ConsumerState<OnboardPage> createState() => _OnboardPageState();
}

class _VehicleLine {
  _VehicleLine(this.kind);
  final String kind;
  final registration = TextEditingController();
  bool parkingPurchased = false;
  void dispose() => registration.dispose();
}

class _OnboardPageState extends ConsumerState<OnboardPage> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _floor = TextEditingController();
  final _parking = TextEditingController();
  final _emergency = TextEditingController();
  final _adults = TextEditingController(text: '0');
  final _children = TextEditingController(text: '0');
  final _seniors = TextEditingController(text: '0');
  List<FlatDto> _flats = [];
  String? _flatId;
  String? _societyName;
  bool _isOwner = true;
  bool _pngGas = false;
  final List<_VehicleLine> _twoWheelers = [];
  final List<_VehicleLine> _fourWheelers = [];
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
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _floor.dispose();
    _parking.dispose();
    _emergency.dispose();
    _adults.dispose();
    _children.dispose();
    _seniors.dispose();
    for (final v in [..._twoWheelers, ..._fourWheelers]) {
      v.dispose();
    }
    super.dispose();
  }

  void _applyFlat(String? id) {
    _flatId = id;
    FlatDto? selected;
    for (final f in _flats) {
      if (f.id == id) selected = f;
    }
    _floor.text = selected?.floor?.toString() ?? '';
    _parking.text = selected?.parkingSlot ?? '';
    _pngGas = selected?.pngGasConnection ?? false;
    _adults.text = '${selected?.adultCount ?? 0}';
    _children.text = '${selected?.childCount ?? 0}';
    _seniors.text = '${selected?.seniorCitizenCount ?? 0}';
  }

  Future<void> _load() async {
    final session = ref.read(sessionProvider);
    if (!canUseAdminMode(session.user?.role)) return;
    final api = ref.read(apiProvider);
    try {
      final flats = await api.listFlats();
      if (mounted) {
        setState(() {
          _flats = flats;
          _applyFlat(flats.isNotEmpty ? flats.first.id : null);
        });
      }
    } catch (_) {}
    try {
      final memberships = await api.listMemberships();
      MembershipDto? mine;
      for (final m in memberships) {
        if (m.tenantId == session.user?.tenantId) {
          mine = m;
          break;
        }
      }
      if (mounted && mine != null) {
        setState(() => _societyName = mine!.societyName);
      }
    } catch (_) {}
  }

  FlatDto? get _selectedFlat {
    for (final f in _flats) {
      if (f.id == _flatId) return f;
    }
    return null;
  }

  int _remainingIncluded(int used, int included) {
    final left = included - used;
    return left < 0 ? 0 : left;
  }

  Future<void> _submit() async {
    final flatId = _flatId;
    if (flatId == null) {
      setState(() => _error = 'Select a flat first. Create flats on web Structure if needed.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final selected = _selectedFlat;
      final remainingTw = _remainingIncluded(selected?.twoWheelerCount ?? 0, 2);
      final remainingFw = _remainingIncluded(selected?.fourWheelerCount ?? 0, 1);
      final vehicles = <Map<String, Object?>>[];
      void collect(List<_VehicleLine> rows, String kind, int included) {
        for (var i = 0; i < rows.length; i++) {
          final plate = rows[i].registration.text.trim().toUpperCase();
          if (plate.length < 4) continue;
          vehicles.add({
            'kind': kind,
            'registrationNumber': plate,
            'parkingPurchased': i >= included ? rows[i].parkingPurchased : false,
          });
        }
      }

      collect(_twoWheelers, 'two_wheeler', remainingTw);
      collect(_fourWheelers, 'four_wheeler', remainingFw);

      final user = await ref.read(apiProvider).onboardResident(
            name: _name.text.trim(),
            phone: _phone.text.trim(),
            flatId: flatId,
            email: _email.text.trim().isEmpty ? null : _email.text.trim(),
            floor: int.tryParse(_floor.text.trim()),
            parkingSlot: _parking.text.trim().isEmpty ? null : _parking.text.trim(),
            isOwner: _isOwner,
            emergencyContact:
                _emergency.text.trim().isEmpty ? null : _emergency.text.trim(),
            pngGasConnection: _pngGas,
            adultCount: int.tryParse(_adults.text.trim()) ?? 0,
            childCount: int.tryParse(_children.text.trim()) ?? 0,
            seniorCitizenCount: int.tryParse(_seniors.text.trim()) ?? 0,
            vehicles: vehicles,
          );
      var flats = _flats;
      try {
        flats = await ref.read(apiProvider).listFlats();
      } catch (_) {}
      setState(() {
        _message = 'Onboarded ${user.name ?? user.phone}';
        _name.clear();
        _phone.clear();
        _email.clear();
        _emergency.clear();
        for (final v in [..._twoWheelers, ..._fourWheelers]) {
          v.dispose();
        }
        _twoWheelers.clear();
        _fourWheelers.clear();
        _flats = flats;
        _applyFlat(flatId);
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Widget> _vehicleEditors(List<_VehicleLine> rows, int included) {
    return [
      for (var i = 0; i < rows.length; i++) ...[
        TextField(
          controller: rows[i].registration,
          decoration: InputDecoration(
            labelText: i >= included ? 'Registration (extra)' : 'Registration',
          ),
        ),
        if (i >= included)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Purchased parking'),
            value: rows[i].parkingPurchased,
            onChanged: (v) =>
                setState(() => rows[i].parkingPurchased = v ?? false),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () {
              setState(() {
                rows[i].dispose();
                rows.removeAt(i);
              });
            },
            child: const Text('Remove'),
          ),
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (!canUseAdminMode(session.user?.role) ||
        session.mode != AppMode.admin) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/home/dashboard');
      });
      return const SizedBox.shrink();
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Onboard residents', style: displayStyle(size: 28)),
        const SizedBox(height: 4),
        const Text(
          'Add family members one at a time. Several people can share the same flat — each needs their own mobile. Bulk CSV import is on the web Client App.',
          style: TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        ShCard(
          key: AppKeys.onboardForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Add a family member',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              const SizedBox(height: 12),
              TextField(
                readOnly: true,
                controller: TextEditingController(text: _societyName ?? '—'),
                decoration: const InputDecoration(
                  labelText: 'Society',
                  filled: true,
                  fillColor: Color(0xFFFFF5EB),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: AppKeys.onboardName,
                controller: _name,
                decoration: const InputDecoration(labelText: 'Resident name'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: AppKeys.onboardPhone,
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email (optional)'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                // ignore: deprecated_member_use
                value: _flatId,
                decoration: const InputDecoration(labelText: 'Flat'),
                items: _flats
                    .map(
                      (f) => DropdownMenuItem(
                        value: f.id,
                        child: Text(f.label),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => _applyFlat(v)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _floor,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Floor'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _parking,
                decoration: const InputDecoration(labelText: 'Parking slot'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emergency,
                decoration: const InputDecoration(labelText: 'Emergency contact'),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Owner of this flat (uncheck for other family members)'),
                value: _isOwner,
                onChanged: (v) => setState(() => _isOwner = v ?? true),
              ),
              const Text('PNG gas connection'),
              RadioGroup<bool>(
                groupValue: _pngGas,
                onChanged: (v) => setState(() => _pngGas = v ?? false),
                child: Column(
                  children: [
                    RadioListTile<bool>(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Taken'),
                      value: true,
                    ),
                    RadioListTile<bool>(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Not taken'),
                      value: false,
                    ),
                  ],
                ),
              ),
              const Text(
                'Family members in this flat',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              TextField(
                controller: _adults,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Adults'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _children,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Children'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _seniors,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Senior citizens'),
              ),
              const SizedBox(height: 12),
              Text(
                'Two-wheelers (${_remainingIncluded(_selectedFlat?.twoWheelerCount ?? 0, 2)} included slots left for this flat)',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              ..._vehicleEditors(
                _twoWheelers,
                _remainingIncluded(_selectedFlat?.twoWheelerCount ?? 0, 2),
              ),
              TextButton(
                onPressed: () => setState(() => _twoWheelers.add(_VehicleLine('two_wheeler'))),
                child: const Text('Add two-wheeler'),
              ),
              Text(
                'Four-wheelers (${_remainingIncluded(_selectedFlat?.fourWheelerCount ?? 0, 1)} included slots left for this flat)',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              ..._vehicleEditors(
                _fourWheelers,
                _remainingIncluded(_selectedFlat?.fourWheelerCount ?? 0, 1),
              ),
              TextButton(
                onPressed: () => setState(() => _fourWheelers.add(_VehicleLine('four_wheeler'))),
                child: const Text('Add four-wheeler'),
              ),
              const SizedBox(height: 20),
              ShPrimaryButton(
                key: AppKeys.onboardSubmit,
                label: 'Onboard resident',
                busy: _busy,
                onPressed: _submit,
              ),
              if (_message != null) ...[
                const SizedBox(height: 12),
                Text(_message!, style: const TextStyle(color: Color(0xFF2E7D32))),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        ShCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Bulk import',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'CSV / bulk resident import stays on the web Client App for easier file handling.',
                style: TextStyle(color: Colors.black54, fontSize: 14),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
