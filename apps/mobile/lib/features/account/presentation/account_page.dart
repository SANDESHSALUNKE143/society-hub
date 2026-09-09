import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/household_people.dart';
import '../../../shared/household_tabs.dart';
import '../../../shared/parking_picker.dart';
import '../../../shared/widgets.dart';

class AccountPage extends ConsumerStatefulWidget {
  const AccountPage({super.key});

  @override
  ConsumerState<AccountPage> createState() => _AccountPageState();
}

class _VehicleLine {
  _VehicleLine(this.kind, {String? plate, this.parkingPurchased = false}) {
    registration.text = plate ?? '';
  }
  final String kind;
  final registration = TextEditingController();
  bool parkingPurchased = false;
  void dispose() => registration.dispose();
}

class _AccountPageState extends ConsumerState<AccountPage> {
  final _pin = TextEditingController();
  final _emergency = TextEditingController();
  final _adults = TextEditingController(text: '0');
  final _children = TextEditingController(text: '0');
  final _seniors = TextEditingController(text: '0');
  final List<_VehicleLine> _twoWheelers = [];
  final List<_VehicleLine> _fourWheelers = [];
  bool _pngGas = false;
  ResidentProfileDto? _profile;
  bool _busy = false;
  bool _profileBusy = false;
  bool _familyBusy = false;
  String? _message;
  String? _error;
  String? _profileMessage;
  String? _profileError;
  String? _familyMessage;
  String? _familyError;
  List<SocietyResidentDto> _household = [];
  SocietyResidentDto? _editingFamily;
  final _familyName = TextEditingController();
  final _familyPhone = TextEditingController();
  final _familyEmail = TextEditingController();
  final _parking = TextEditingController();
  String _section = 'flat';
  String _tab = 'owner';
  List<ParkingSlotDto> _parkings = [];
  String _parkingKind = 'puzzle';
  String? _parkingId;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _pin.dispose();
    _emergency.dispose();
    _adults.dispose();
    _children.dispose();
    _seniors.dispose();
    _familyName.dispose();
    _familyPhone.dispose();
    _familyEmail.dispose();
    _parking.dispose();
    for (final v in [..._twoWheelers, ..._fourWheelers]) {
      v.dispose();
    }
    super.dispose();
  }

  int _remainingForUser(int household, int mine, int included) {
    final others = household - mine;
    final left = included - (others < 0 ? 0 : others);
    return left < 0 ? 0 : left;
  }

  void _applyVehicles(ResidentProfileDto profile) {
    for (final v in [..._twoWheelers, ..._fourWheelers]) {
      v.dispose();
    }
    _twoWheelers.clear();
    _fourWheelers.clear();
    final vehicles = profile.vehicles;
    if (vehicles.isEmpty && (profile.vehicleNumber ?? '').isNotEmpty) {
      _fourWheelers.add(
        _VehicleLine('four_wheeler', plate: profile.vehicleNumber),
      );
      return;
    }
    for (final v in vehicles) {
      final line = _VehicleLine(
        v.kind,
        plate: v.registrationNumber,
        parkingPurchased: v.parkingPurchased,
      );
      if (v.kind == 'two_wheeler') {
        _twoWheelers.add(line);
      } else {
        _fourWheelers.add(line);
      }
    }
  }

  void _applyParking(ResidentProfileDto profile, List<ParkingSlotDto> lots) {
    final flat = profile.flat;
    ParkingSlotDto? assigned;
    if (flat != null) {
      for (final p in lots) {
        if (p.flatId == flat.id) assigned = p;
      }
      assigned ??= () {
        for (final p in lots) {
          if (p.slotNumber == flat.parkingSlot) return p;
        }
        return null;
      }();
    }
    _parkings = lots;
    _parkingKind = preferredParkingKind(lots, assigned, flat?.id, assigned?.id);
    _parking.text = assigned?.slotNumber ?? flat?.parkingSlot ?? '';
    _parkingId = assigned?.id;
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await ref.read(apiProvider).getProfile();
      var lots = <ParkingSlotDto>[];
      try {
        lots = await ref.read(apiProvider).listResidentParkings();
      } on ApiException {
        lots = [];
      }
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _emergency.text = profile.emergencyContact ?? '';
        _pngGas = profile.flat?.pngGasConnection ?? false;
        _adults.text = '${profile.flat?.adultCount ?? 0}';
        _children.text = '${profile.flat?.childCount ?? 0}';
        _seniors.text = '${profile.flat?.seniorCitizenCount ?? 0}';
        _applyVehicles(profile);
        _applyParking(profile, lots);
      });
      if (profile.flat != null) {
        try {
          final people = await ref.read(apiProvider).listHouseholdMembers();
          if (mounted) {
            setState(() {
              _household = people;
              _familyError = null;
            });
          }
        } on ApiException catch (e) {
          if (mounted) {
            setState(() {
              _household = [];
              _familyError = e.message;
            });
          }
        }
      }
    } on ApiException {
      // Profile is optional for staff without a residents row.
    }
  }

  void _openAddFamily() {
    setState(() {
      _editingFamily = null;
      _familyName.clear();
      _familyPhone.clear();
      _familyEmail.clear();
      _familyError = null;
    });
  }

  void _openEditFamily(SocietyResidentDto person) {
    setState(() {
      _editingFamily = person;
      _familyName.text = person.name ?? '';
      _familyPhone.text = person.phone ?? '';
      _familyEmail.text = person.email ?? '';
      _familyError = null;
    });
  }

  Future<void> _saveFamilyMember() async {
    setState(() {
      _familyBusy = true;
      _familyError = null;
      _familyMessage = null;
    });
    try {
      final editing = _editingFamily;
      final user = editing == null
          ? await ref.read(apiProvider).addHouseholdMember(
                name: _familyName.text.trim(),
                phone: _familyPhone.text.trim(),
                email: _familyEmail.text.trim().isEmpty
                    ? null
                    : _familyEmail.text.trim(),
              )
          : await ref.read(apiProvider).updateHouseholdMember(
                userId: editing.userId,
                name: _familyName.text.trim(),
                phone: _familyPhone.text.trim(),
                email: _familyEmail.text.trim().isEmpty
                    ? null
                    : _familyEmail.text.trim(),
              );
      var people = _household;
      try {
        people = await ref.read(apiProvider).listHouseholdMembers();
      } on ApiException {
        // Keep previous list if refresh fails.
      }
      if (!mounted) return;
      setState(() {
        _household = people;
        _familyName.clear();
        _familyPhone.clear();
        _familyEmail.clear();
        _editingFamily = null;
        _familyMessage =
            '${editing == null ? 'Added' : 'Updated'} ${user.name ?? user.phone}. They can log in with this number and raise complaints.';
      });
    } on ApiException catch (e) {
      setState(() => _familyError = e.message);
    } finally {
      if (mounted) setState(() => _familyBusy = false);
    }
  }

  Future<void> _deleteFamilyMember(SocietyResidentDto person) async {
    setState(() {
      _familyBusy = true;
      _familyError = null;
      _familyMessage = null;
    });
    try {
      await ref.read(apiProvider).removeHouseholdMember(person.userId);
      var people = _household;
      try {
        people = await ref.read(apiProvider).listHouseholdMembers();
      } on ApiException {
        people = _household.where((row) => row.userId != person.userId).toList();
      }
      if (!mounted) return;
      setState(() {
        _household = people;
        _familyMessage = 'Removed ${person.displayName}';
      });
    } on ApiException catch (e) {
      setState(() => _familyError = e.message);
    } finally {
      if (mounted) setState(() => _familyBusy = false);
    }
  }

  Future<void> _setPin() async {
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await ref.read(apiProvider).setPin(_pin.text.trim());
      setState(() {
        _message = 'PIN saved';
        _pin.clear();
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveProfile() async {
    setState(() {
      _profileBusy = true;
      _profileError = null;
      _profileMessage = null;
    });
    try {
      final flat = _profile?.flat;
      List<Map<String, Object?>>? vehicles;
      if (flat != null) {
        final myTwo = _profile!.vehicles.where((v) => v.kind == 'two_wheeler').length;
        final myFour = _profile!.vehicles.where((v) => v.kind == 'four_wheeler').length;
        final remainingTw = _remainingForUser(flat.twoWheelerCount, myTwo, 2);
        final remainingFw = _remainingForUser(flat.fourWheelerCount, myFour, 1);
        vehicles = [];
        void collect(List<_VehicleLine> rows, String kind, int included) {
          for (var i = 0; i < rows.length; i++) {
            final plate = rows[i].registration.text.trim().toUpperCase();
            vehicles!.add({
              'kind': kind,
              'registrationNumber': plate.length >= 4 ? plate : null,
              'parkingPurchased': i >= included ? rows[i].parkingPurchased : false,
            });
          }
        }

        collect(_twoWheelers, 'two_wheeler', remainingTw);
        collect(_fourWheelers, 'four_wheeler', remainingFw);
      }
      final next = await ref.read(apiProvider).updateProfile(
            emergencyContact: _emergency.text.trim().isEmpty
                ? null
                : _emergency.text.trim(),
            pngGasConnection: flat == null ? null : _pngGas,
            adultCount: flat == null ? null : int.tryParse(_adults.text.trim()) ?? 0,
            childCount: flat == null ? null : int.tryParse(_children.text.trim()) ?? 0,
            seniorCitizenCount:
                flat == null ? null : int.tryParse(_seniors.text.trim()) ?? 0,
            parkingSlot: flat == null ? null : _parking.text.trim(),
            parkingSlotId: _parkingId,
            vehicles: vehicles,
          );
      if (!mounted) return;
      setState(() {
        _profile = next;
        _pngGas = next.flat?.pngGasConnection ?? _pngGas;
        _adults.text = '${next.flat?.adultCount ?? 0}';
        _children.text = '${next.flat?.childCount ?? 0}';
        _seniors.text = '${next.flat?.seniorCitizenCount ?? 0}';
        _applyVehicles(next);
        _applyParking(next, _parkings);
        _profileMessage = 'Profile updated';
      });
    } on ApiException catch (e) {
      setState(() => _profileError = e.message);
    } finally {
      if (mounted) setState(() => _profileBusy = false);
    }
  }

  List<Widget> _vehicleEditors(List<_VehicleLine> rows, int included) {
    return [
      for (var i = 0; i < rows.length; i++) ...[
        TextField(
          controller: rows[i].registration,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(
            labelText: i >= included ? 'Registration (extra, optional)' : 'Registration (optional)',
          ),
        ),
        if (i >= included)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Purchased parking'),
            value: rows[i].parkingPurchased,
            onChanged: (v) => setState(() => rows[i].parkingPurchased = v ?? false),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => setState(() {
              rows[i].dispose();
              rows.removeAt(i);
            }),
            child: const Text('Remove'),
          ),
        ),
      ],
    ];
  }

  Widget _chip(String id, String label, Key key, String selected, ValueChanged<String> onPick) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        key: key,
        label: Text(label),
        selected: selected == id,
        onSelected: (_) => onPick(id),
      ),
    );
  }

  Widget _accountTab(String id, String label, Key key) {
    return _chip(id, label, key, _tab, (next) => setState(() => _tab = next));
  }

  Widget _sectionTab(String id, String label, Key key) {
    return _chip(id, label, key, _section, (next) => setState(() => _section = next));
  }

  String get _parkingSelectValue {
    final current = _parkingId;
    if (current == null || current.isEmpty) return '';
    for (final p in assignableParkingSlots(
      _parkings,
      _parkingKind,
      _profile?.flat?.id,
      _parkingId,
    )) {
      if (p.id == current) return current;
    }
    return '';
  }

  String get _saveLabel => householdSubmitLabel(_tab);

  SocietyResidentDto? get _ownerOnFlat {
    for (final person in _household) {
      if (person.isOwner) return person;
    }
    return null;
  }

  Widget _flatField(String label, String value, {Key? key}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: Colors.black45,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            key: key,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final flat = _profile?.flat;
    final flatLabel = flat != null
        ? flat.label
        : user?.flatNumber != null
            ? 'Flat ${user!.flatNumber}'
            : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Account', style: displayStyle(size: 28)),
        const SizedBox(height: 4),
        Text(
          [
            user?.email ?? user?.phone ?? 'No contact',
            user?.role ?? '—',
            if (flatLabel != null)
              flatLabel.startsWith('Flat') ? flatLabel : 'Flat $flatLabel',
          ].join(' · '),
          style: const TextStyle(color: Colors.black54),
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: AppKeys.accountPrivacy,
            onPressed: () {
              final url = Uri.parse(
                ref.read(apiConfigProvider).resolvedPrivacyPolicyUrl,
              );
              launchUrl(url, mode: LaunchMode.externalApplication);
            },
            child: const Text('Privacy Policy'),
          ),
        ),
        const SizedBox(height: 8),
        Material(
          color: Colors.transparent,
          child: SingleChildScrollView(
            key: AppKeys.accountSectionTabs,
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _sectionTab('flat', 'My flat', AppKeys.accountSectionFlat),
                _sectionTab('household', 'Household', AppKeys.accountSectionHousehold),
                _sectionTab('security', 'Security', AppKeys.accountSectionSecurity),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (_section == 'flat')
        ShCard(
          key: AppKeys.accountFlatDetails,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'My flat',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              const SizedBox(height: 4),
              const Text(
                'Society home linked to your account in this society.',
                style: TextStyle(color: Colors.black54, fontSize: 13),
              ),
              const SizedBox(height: 12),
              if (flat != null)
                Wrap(
                  spacing: 24,
                  runSpacing: 4,
                  children: [
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'Society',
                        _profile?.societyName ?? '—',
                        key: AppKeys.accountSocietyName,
                      ),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'Flat',
                        flat.label,
                        key: AppKeys.accountFlatNumber,
                      ),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'Building',
                        flat.buildingName ?? '—',
                      ),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField('Wing', flat.wingName ?? '—'),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'Floor',
                        flat.floor != null ? '${flat.floor}' : '—',
                      ),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'Parking',
                        flat.parkingSlot ?? '—',
                      ),
                    ),
                    SizedBox(
                      width: 140,
                      child: _flatField(
                        'PNG gas',
                        flat.pngGasConnection ? 'Taken' : 'Not taken',
                      ),
                    ),
                    SizedBox(
                      width: 280,
                      child: _flatField(
                        'Occupancy',
                        flat.isOwner ? 'Owner' : 'Tenant / occupant',
                      ),
                    ),
                    SizedBox(
                      width: 280,
                      child: _flatField(
                        'Family members',
                        '${flat.adultCount} adult${flat.adultCount == 1 ? '' : 's'}, ${flat.childCount} child${flat.childCount == 1 ? '' : 'ren'}, ${flat.seniorCitizenCount} senior citizen${flat.seniorCitizenCount == 1 ? '' : 's'}',
                      ),
                    ),
                  ],
                )
              else
                const Text(
                  key: AppKeys.accountFlatEmpty,
                  'No flat is linked to your account in this society yet. Ask a society admin to onboard you.',
                  style: TextStyle(color: Colors.black54, fontSize: 13),
                ),
            ],
          ),
        ),
        if (_section == 'household') ...[
        const SizedBox(height: 16),
        ShCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Household',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Same tabs as Onboard resident: Owner, Family, Parking Details, vehicles, and Gas.',
                style: TextStyle(color: Colors.black54, fontSize: 14),
              ),
              if (flat != null) ...[
                const SizedBox(height: 12),
                SingleChildScrollView(
                  key: AppKeys.accountTabs,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _accountTab('owner', 'Owner', AppKeys.accountTabOwner),
                      _accountTab('family', 'Family', AppKeys.accountTabFamily),
                      _accountTab('parking', 'Parking Details', AppKeys.accountTabParking),
                      _accountTab(
                        'two_wheeler',
                        'Two-wheelers',
                        AppKeys.accountTabTwoWheeler,
                      ),
                      _accountTab(
                        'four_wheeler',
                        'Four-wheelers',
                        AppKeys.accountTabFourWheeler,
                      ),
                      _accountTab('gas', 'Gas', AppKeys.accountTabGas),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (flat == null || _tab == 'owner') ...[
                if (flat != null) ...[
                  Text(
                    'Owner name: ${_ownerOnFlat?.displayName ?? user?.name ?? '—'}',
                  ),
                  Text(
                    'Contact: ${_ownerOnFlat?.phone ?? user?.phone ?? '—'}',
                  ),
                  Text(
                    'Email: ${_ownerOnFlat?.email ?? user?.email ?? '—'}',
                  ),
                  const SizedBox(height: 8),
                ],
                TextField(
                  key: AppKeys.accountEmergencyContact,
                  controller: _emergency,
                  decoration: const InputDecoration(
                    labelText: 'Emergency contact',
                    hintText: 'Name & phone number',
                  ),
                ),
              ],
              if (flat != null && _tab == 'family') ...[
                Column(
                  key: AppKeys.accountFamilyMembers,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    HouseholdPeopleList(
                      people: _household,
                      canEdit: flat.isOwner,
                      busy: _familyBusy,
                      onAdd: _openAddFamily,
                      onEdit: _openEditFamily,
                      onDelete: _deleteFamilyMember,
                    ),
                    if (flat.isOwner) ...[
                      const SizedBox(height: 8),
                      TextField(
                        key: AppKeys.accountFamilyName,
                        controller: _familyName,
                        decoration: const InputDecoration(labelText: 'Name'),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: AppKeys.accountFamilyPhone,
                        controller: _familyPhone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Contact number'),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _familyEmail,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Email'),
                      ),
                      const SizedBox(height: 12),
                      ShPrimaryButton(
                        key: AppKeys.accountAddFamily,
                        label: _editingFamily == null
                            ? 'Add family member'
                            : 'Update family member',
                        busy: _familyBusy,
                        onPressed: _saveFamilyMember,
                      ),
                    ],
                    if (_familyMessage != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _familyMessage!,
                        style: const TextStyle(color: Color(0xFF2E7D32)),
                      ),
                    ],
                    if (_familyError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _familyError!,
                        style: const TextStyle(color: AppColors.danger),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                const Text('Family members in this flat'),
                const SizedBox(height: 8),
                TextField(
                  key: AppKeys.accountAdults,
                  controller: _adults,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Adults'),
                ),
                const SizedBox(height: 8),
                TextField(
                  key: AppKeys.accountChildren,
                  controller: _children,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Children'),
                ),
                const SizedBox(height: 8),
                TextField(
                  key: AppKeys.accountSeniors,
                  controller: _seniors,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Senior citizens'),
                ),
              ],
              if (flat != null && _tab == 'parking') ...[
                if (_parkings.isNotEmpty) ...[
                  DropdownButtonFormField<String>(
                    key: ValueKey('parking-kind-$_parkingKind'),
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
                          flat.id,
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
                    key: ValueKey('parking-slot-$_parkingSelectValue'),
                    initialValue: _parkingSelectValue,
                    decoration: const InputDecoration(labelText: 'Parking number'),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('None')),
                      ...assignableParkingSlots(
                        _parkings,
                        _parkingKind,
                        flat.id,
                        _parkingId,
                      ).map(
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
                      flat.id,
                      _parkingId,
                    ) !=
                    null) ...[
                  const SizedBox(height: 8),
                  Text(
                    parkingNumberHint(
                      _parkings,
                      _parkingKind,
                      flat.id,
                      _parkingId,
                    )!,
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ],
              ],
              if (flat != null && _tab == 'two_wheeler') ...[
                Text(
                  'Two-wheelers (${_remainingForUser(flat.twoWheelerCount, _profile?.vehicles.where((v) => v.kind == 'two_wheeler').length ?? 0, 2)} included slots left)',
                ),
                ..._vehicleEditors(
                  _twoWheelers,
                  _remainingForUser(
                    flat.twoWheelerCount,
                    _profile?.vehicles.where((v) => v.kind == 'two_wheeler').length ?? 0,
                    2,
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () =>
                        setState(() => _twoWheelers.add(_VehicleLine('two_wheeler'))),
                    child: const Text('Add two-wheeler'),
                  ),
                ),
              ],
              if (flat != null && _tab == 'four_wheeler') ...[
                Text(
                  'Four-wheelers (${_remainingForUser(flat.fourWheelerCount, _profile?.vehicles.where((v) => v.kind == 'four_wheeler').length ?? 0, 1)} included slots left)',
                ),
                ..._vehicleEditors(
                  _fourWheelers,
                  _remainingForUser(
                    flat.fourWheelerCount,
                    _profile?.vehicles.where((v) => v.kind == 'four_wheeler').length ?? 0,
                    1,
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () =>
                        setState(() => _fourWheelers.add(_VehicleLine('four_wheeler'))),
                    child: const Text('Add four-wheeler'),
                  ),
                ),
              ],
              if (flat != null && _tab == 'gas') ...[
                const Text('PNG gas connection'),
                RadioGroup<bool>(
                  groupValue: _pngGas,
                  onChanged: (v) => setState(() => _pngGas = v ?? false),
                  child: Column(
                    children: [
                      RadioListTile<bool>(
                        key: AppKeys.accountPngYes,
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Taken'),
                        value: true,
                      ),
                      RadioListTile<bool>(
                        key: AppKeys.accountPngNo,
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Not taken'),
                        value: false,
                      ),
                    ],
                  ),
                ),
              ],
              if (flat == null)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'PNG, family counts, parking, and vehicles can be updated after an admin links a flat.',
                    style: TextStyle(color: Colors.black54, fontSize: 14),
                  ),
                ),
              const SizedBox(height: 12),
              ShPrimaryButton(
                label: _saveLabel,
                busy: _profileBusy,
                onPressed: _saveProfile,
              ),
              if (_profileMessage != null) ...[
                const SizedBox(height: 8),
                Text(
                  _profileMessage!,
                  style: const TextStyle(color: Color(0xFF2E7D32)),
                ),
              ],
              if (_profileError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _profileError!,
                  style: const TextStyle(color: AppColors.danger),
                ),
              ],
            ],
          ),
        ),
        ],
        if (_section == 'security') ...[
        const SizedBox(height: 16),
        ShCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user?.name ?? '—',
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 8),
              Text('Role: ${user?.role ?? '—'}'),
              Text('Phone: ${user?.phone ?? '—'}'),
              Text('Email: ${user?.email ?? '—'}'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ShCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Quick login PIN',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Set a PIN for faster mobile sign-in next time.',
                style: TextStyle(color: Colors.black54, fontSize: 14),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _pin,
                obscureText: true,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'New PIN'),
              ),
              const SizedBox(height: 12),
              ShPrimaryButton(
                label: 'Save PIN',
                busy: _busy,
                onPressed: _setPin,
              ),
              if (_message != null) ...[
                const SizedBox(height: 8),
                Text(
                  _message!,
                  style: const TextStyle(color: Color(0xFF2E7D32)),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
            ],
          ),
        ),
        ],
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: () async {
            await ref.read(sessionProvider.notifier).clearSession();
            if (context.mounted) context.go('/login');
          },
          child: const Text('Log out'),
        ),
      ],
    );
  }
}

class ComingSoonPage extends StatelessWidget {
  const ComingSoonPage({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: displayStyle(size: 28)),
          const SizedBox(height: 16),
          const EmptyState(
            message:
                'Coming soon on mobile. Use the web Client App for full access to this area.',
          ),
        ],
      ),
    );
  }
}
