import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/flat_picker.dart';
import '../../../shared/parking_picker.dart';
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
  List<ParkingSlotDto> _parkings = [];
  List<SocietyResidentDto> _residents = [];
  String _parkingKind = 'puzzle';
  String? _parkingId;
  String? _flatId;
  String? _societyName;
  String _tab = 'owner';
  bool _tabTouched = false;
  bool _isOwner = true;
  bool _pngGas = false;
  final List<_VehicleLine> _twoWheelers = [
    _VehicleLine('two_wheeler'),
    _VehicleLine('two_wheeler'),
  ];
  final List<_VehicleLine> _fourWheelers = [_VehicleLine('four_wheeler')];
  bool _busy = false;
  String? _message;
  String? _error;
  bool _notifyEmail = true;
  bool _notifyWhatsapp = true;

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
    if (id != _flatId) _tabTouched = false;
    _flatId = id;
    FlatDto? selected;
    for (final f in _flats) {
      if (f.id == id) selected = f;
    }
    _floor.text = selected?.floor?.toString() ?? '';
    ParkingSlotDto? assigned;
    for (final p in _parkings) {
      if (p.flatId == id) assigned = p;
    }
    assigned ??= () {
      for (final p in _parkings) {
        if (p.slotNumber == selected?.parkingSlot) return p;
      }
      return null;
    }();
    final nextSlotId = assigned?.id;
    _parkingKind = preferredParkingKind(_parkings, assigned, id, nextSlotId);
    _parking.text = assigned?.slotNumber ?? selected?.parkingSlot ?? '';
    _parkingId = nextSlotId;
    _pngGas = selected?.pngGasConnection ?? false;
    _adults.text = '${selected?.adultCount ?? 0}';
    _children.text = '${selected?.childCount ?? 0}';
    _seniors.text = '${selected?.seniorCitizenCount ?? 0}';
    _syncTabForFlat();
  }

  void _syncTabForFlat() {
    if (_tabTouched) return;
    final hasOwner = _peopleOnFlat.any((r) => r.isOwner);
    _isOwner = !hasOwner;
    _tab = hasOwner ? 'family' : 'owner';
    _clearPersonFields();
  }

  Future<void> _load() async {
    final session = ref.read(sessionProvider);
    if (!canUseAdminMode(session.user?.role)) return;
    final api = ref.read(apiProvider);
    try {
      final flats = await api.listFlats();
      var parkings = <ParkingSlotDto>[];
      try {
        parkings = await api.listParkings();
      } catch (_) {}
      var residents = <SocietyResidentDto>[];
      try {
        residents = await api.listSocietyResidents();
      } catch (_) {}
      if (mounted) {
        setState(() {
          _flats = flats;
          _parkings = parkings;
          _residents = residents;
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

  List<SocietyResidentDto> get _peopleOnFlat {
    return _residents.where((r) => r.flatId == _flatId).toList();
  }

  SocietyResidentDto? get _ownerOnFlat {
    for (final r in _peopleOnFlat) {
      if (r.isOwner) return r;
    }
    return null;
  }

  void _fillOwnerFields() {
    final owner = _ownerOnFlat;
    _name.text = owner?.name ?? '';
    _phone.text = owner?.phone ?? '';
    _email.text = owner?.email ?? '';
  }

  void _clearPersonFields() {
    _name.clear();
    _phone.clear();
    _email.clear();
  }

  void _selectTab(String next) {
    setState(() {
      _tabTouched = true;
      _tab = next;
      if (next == 'owner') {
        _isOwner = true;
        _fillOwnerFields();
      }
      if (next == 'family') {
        _isOwner = false;
        _clearPersonFields();
      }
      if (next == 'parking') {
        _isOwner = true;
        _fillOwnerFields();
      }
    });
  }

  Widget _householdSummary() {
    final owner = _peopleOnFlat.where((r) => r.isOwner).toList();
    final family = _peopleOnFlat.where((r) => !r.isOwner).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'OWNER',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: Colors.black45,
          ),
        ),
        Text(
          owner.isEmpty
              ? 'No owner yet'
              : '${owner.first.displayName}${owner.first.phone != null ? ' · ${owner.first.phone}' : ''}',
          style: TextStyle(
            fontWeight: owner.isEmpty ? FontWeight.w400 : FontWeight.w600,
            color: owner.isEmpty ? Colors.black54 : Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'FAMILY',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: Colors.black45,
          ),
        ),
        Text(
          family.isEmpty
              ? 'None yet'
              : '${family.length} member${family.length == 1 ? '' : 's'}',
        ),
      ],
    );
  }

  Widget _detailTab(String id, String label, Key key) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        key: key,
        label: Text(label),
        selected: _tab == id,
        onSelected: (_) => _selectTab(id),
      ),
    );
  }

  List<ParkingSlotDto> _availableParkings(String kind) {
    return assignableParkingSlots(_parkings, kind, _flatId, _parkingId);
  }

  String get _parkingSelectValue {
    final current = _parkingId;
    if (current == null || current.isEmpty) return '';
    for (final p in _availableParkings(_parkingKind)) {
      if (p.id == current) return current;
    }
    return '';
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
    final owner = _ownerOnFlat;
    if (_tab == 'parking') {
      if ((owner?.name ?? _name.text).trim().isEmpty ||
          (owner?.phone ?? _phone.text).trim().isEmpty) {
        setState(() {
          _error = 'Add an owner first';
          _tab = 'owner';
        });
        return;
      }
    } else if (_name.text.trim().isEmpty || _phone.text.trim().isEmpty) {
      setState(() {
        _error = 'Enter name and contact number';
        _tab = _isOwner ? 'owner' : 'family';
      });
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

      final savingParking = _tab == 'parking';
      final editingOwner = savingParking
          ? owner != null
          : _isOwner && owner != null;
      final channels = <String>[
        if (_notifyEmail) 'email',
        if (_notifyWhatsapp) 'whatsapp',
      ];
      final user = await ref.read(apiProvider).onboardResident(
            name: savingParking
                ? (owner?.name ?? _name.text).trim()
                : _name.text.trim(),
            phone: savingParking
                ? (owner?.phone ?? _phone.text).trim()
                : _phone.text.trim(),
            flatId: flatId,
            email: savingParking
                ? owner?.email
                : (_email.text.trim().isEmpty ? null : _email.text.trim()),
            floor: int.tryParse(_floor.text.trim()),
            parkingSlot: _parking.text.trim().isEmpty ? null : _parking.text.trim(),
            parkingSlotId: _parkingId,
            isOwner: savingParking ? true : _isOwner,
            editOwner: editingOwner,
            emergencyContact:
                _emergency.text.trim().isEmpty ? null : _emergency.text.trim(),
            pngGasConnection: _pngGas,
            adultCount: int.tryParse(_adults.text.trim()) ?? 0,
            childCount: int.tryParse(_children.text.trim()) ?? 0,
            seniorCitizenCount: int.tryParse(_seniors.text.trim()) ?? 0,
            vehicles: vehicles,
            channels: editingOwner || savingParking || _tab == 'family'
                ? null
                : (channels.isEmpty ? null : channels),
          );
      var flats = _flats;
      var parkings = _parkings;
      var residents = _residents;
      try {
        flats = await ref.read(apiProvider).listFlats();
      } catch (_) {}
      try {
        parkings = await ref.read(apiProvider).listParkings();
      } catch (_) {}
      try {
        residents = await ref.read(apiProvider).listSocietyResidents();
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
        _twoWheelers
          ..clear()
          ..addAll([_VehicleLine('two_wheeler'), _VehicleLine('two_wheeler')]);
        _fourWheelers
          ..clear()
          ..add(_VehicleLine('four_wheeler'));
        _flats = flats;
        _parkings = parkings;
        _residents = residents;
        _tabTouched = false;
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
          'Pick a flat to see Owner, Family, Parking Details, vehicles, and Gas. Family members log in with their own mobile.',
          style: TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        ShCard(
          key: AppKeys.onboardForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Select the flat',
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
              if (_flats.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  key: AppKeys.onboardWing,
                  // ignore: deprecated_member_use
                  value: toWingSelectValue(wingForFlatId(_flats, _flatId)),
                  decoration: const InputDecoration(labelText: 'Wing'),
                  items: uniqueWingNames(_flats)
                      .map(
                        (w) => DropdownMenuItem(
                          value: toWingSelectValue(w),
                          child: Text(wingLabel(w)),
                        ),
                      )
                      .toList(),
                  onChanged: (w) {
                    if (w == null) return;
                    setState(
                      () => _applyFlat(firstFlatIdInWing(_flats, fromWingSelectValue(w))),
                    );
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: AppKeys.onboardFlat,
                  // ignore: deprecated_member_use
                  value: _flatId,
                  decoration: const InputDecoration(labelText: 'Flat'),
                  items: flatsInWing(_flats, wingForFlatId(_flats, _flatId))
                      .map(
                        (f) => DropdownMenuItem(
                          value: f.id,
                          child: Text(f.number),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _applyFlat(v)),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _floor,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Floor'),
              ),
              if (_flatId != null) ...[
                const SizedBox(height: 16),
                SingleChildScrollView(
                  key: AppKeys.onboardTabs,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _detailTab('owner', 'Owner', AppKeys.onboardTabOwner),
                      _detailTab('family', 'Family', AppKeys.onboardTabFamily),
                      _detailTab(
                        'parking',
                        'Parking Details',
                        AppKeys.onboardTabParking,
                      ),
                      _detailTab(
                        'two_wheeler',
                        'Two-wheelers',
                        AppKeys.onboardTabTwoWheeler,
                      ),
                      _detailTab(
                        'four_wheeler',
                        'Four-wheelers',
                        AppKeys.onboardTabFourWheeler,
                      ),
                      _detailTab('gas', 'Gas', AppKeys.onboardTabGas),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              if (_flatId != null && (_tab == 'owner' || _tab == 'family')) ...[
                TextField(
                  key: AppKeys.onboardName,
                  controller: _name,
                  decoration: InputDecoration(
                    labelText: _tab == 'owner' ? 'Owner name' : 'Family member name',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: AppKeys.onboardPhone,
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Contact number'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
              ],
              if (_flatId != null && _tab == 'owner') ...[
              TextField(
                controller: _emergency,
                decoration: const InputDecoration(labelText: 'Emergency contact'),
              ),
              ],
              if (_flatId != null && _tab == 'parking') ...[
              if (_parkings.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  key: Key('onboard-parking-kind-$_parkingKind'),
                  initialValue: _parkingKind,
                  decoration: const InputDecoration(labelText: 'Parking type'),
                  items: const [
                    DropdownMenuItem(value: 'puzzle', child: Text('Puzzle')),
                    DropdownMenuItem(value: 'open', child: Text('Open')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() {
                      _parkingKind = v;
                      final first = assignableParkingSlots(
                        _parkings,
                        v,
                        _flatId,
                        null,
                      );
                      _parking.text =
                          first.isNotEmpty ? first.first.slotNumber : '';
                      _parkingId = first.isNotEmpty ? first.first.id : null;
                    });
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: Key('onboard-parking-$_parkingSelectValue'),
                  initialValue: _parkingSelectValue,
                  decoration: const InputDecoration(labelText: 'Parking number'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('None')),
                    ..._availableParkings(_parkingKind).map(
                      (p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.label),
                      ),
                    ),
                  ],
                  onChanged: (v) => setState(() {
                    _parkingId = v == null || v.isEmpty ? null : v;
                    ParkingSlotDto? picked;
                    if (_parkingId != null) {
                      for (final p in _parkings) {
                        if (p.id == _parkingId) picked = p;
                      }
                    }
                    _parking.text = picked?.slotNumber ?? '';
                  }),
                ),
              ] else
                TextField(
                  controller: _parking,
                  decoration: const InputDecoration(
                    labelText: 'Parking number',
                    hintText: 'Add parking in Manage first, or type a slot',
                  ),
                ),
              if (parkingNumberHint(
                    _parkings,
                    _parkingKind,
                    _flatId,
                    _parkingId,
                  ) !=
                  null) ...[
                const SizedBox(height: 8),
                Text(
                  parkingNumberHint(
                    _parkings,
                    _parkingKind,
                    _flatId,
                    _parkingId,
                  )!,
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
              ],
              if (_flatId != null && _tab == 'family') ...[
                _householdSummary(),
                const SizedBox(height: 12),
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
              ],
              if (_flatId != null && _tab == 'two_wheeler') ...[
                Text(
                  'Two-wheeler numbers (${_remainingIncluded(_selectedFlat?.twoWheelerCount ?? 0, 2)} included slots left)',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                ..._vehicleEditors(
                  _twoWheelers,
                  _remainingIncluded(_selectedFlat?.twoWheelerCount ?? 0, 2),
                ),
                TextButton(
                  onPressed: () =>
                      setState(() => _twoWheelers.add(_VehicleLine('two_wheeler'))),
                  child: const Text('Add two-wheeler'),
                ),
              ],
              if (_flatId != null && _tab == 'four_wheeler') ...[
                Text(
                  'Four-wheeler numbers (${_remainingIncluded(_selectedFlat?.fourWheelerCount ?? 0, 1)} included slots left)',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                ..._vehicleEditors(
                  _fourWheelers,
                  _remainingIncluded(_selectedFlat?.fourWheelerCount ?? 0, 1),
                ),
                TextButton(
                  onPressed: () =>
                      setState(() => _fourWheelers.add(_VehicleLine('four_wheeler'))),
                  child: const Text('Add four-wheeler'),
                ),
              ],
              if (_flatId != null && _tab == 'gas') ...[
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
              ],
              if (_flatId != null && (_tab == 'owner' || _tab == 'family')) ...[
                const SizedBox(height: 8),
                const Text(
                  'Notify after add (welcome — no invite link)',
                  style: TextStyle(fontSize: 13, color: Colors.black54),
                ),
                CheckboxListTile(
                  key: AppKeys.onboardNotifyEmail,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Email'),
                  value: _notifyEmail,
                  onChanged: (v) => setState(() => _notifyEmail = v ?? false),
                ),
                CheckboxListTile(
                  key: AppKeys.onboardNotifyWhatsapp,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('WhatsApp'),
                  value: _notifyWhatsapp,
                  onChanged: (v) => setState(() => _notifyWhatsapp = v ?? false),
                ),
              ],
              if (_flatId != null) ...[
                const SizedBox(height: 20),
                ShPrimaryButton(
                  key: AppKeys.onboardSubmit,
                  label: _tab == 'family'
                      ? 'Save household counts'
                      : _tab == 'parking'
                          ? 'Save parking'
                          : _isOwner
                              ? (_ownerOnFlat != null ? 'Update owner' : 'Save owner')
                              : 'Save family member',
                  busy: _busy,
                  onPressed: _submit,
                ),
              ],
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
