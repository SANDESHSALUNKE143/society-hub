import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api/models.dart';
import '../../../auth/session.dart';
import '../../../core/app_keys.dart';
import '../../../core/theme.dart';
import '../../../shared/complaint_ui.dart';
import '../../../shared/flat_picker.dart';
import '../../../shared/widgets.dart';

class ComplaintsPage extends ConsumerStatefulWidget {
  const ComplaintsPage({super.key});

  @override
  ConsumerState<ComplaintsPage> createState() => _ComplaintsPageState();
}

class _ComplaintsPageState extends ConsumerState<ComplaintsPage> {
  List<ComplaintDto> _items = [];
  String _search = '';
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final staffView = ref.read(sessionProvider.notifier).isStaffView;
      final res = await ref.read(apiProvider).listComplaints(mine: !staffView);
      if (mounted) setState(() => _items = res.items);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final staffView = ref.watch(sessionProvider.notifier).isStaffView;
    final q = _search.trim().toLowerCase();
    final filtered = q.isEmpty
        ? _items
        : _items.where((c) {
            return c.title.toLowerCase().contains(q) ||
                c.ticketNumber.toLowerCase().contains(q) ||
                (staffView && c.flatNumber.toLowerCase().contains(q));
          }).toList();

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text('Complaints', style: displayStyle(size: 32)),
              ),
              FilledButton.icon(
                key: AppKeys.newComplaintLink,
                onPressed: () => context.go('/home/complaints/new'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.saffron,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New complaint'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            key: AppKeys.complaintsSearch,
            decoration: InputDecoration(
              hintText: staffView
                  ? 'Search ticket, title or flat…'
                  : 'Search your complaints…',
              prefixIcon: const Icon(Icons.search),
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
          const SizedBox(height: 16),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          if (!_loading && filtered.isEmpty)
            const EmptyState(
              key: AppKeys.complaintsEmpty,
              message: 'No complaints yet.',
            ),
          if (!_loading && filtered.isNotEmpty)
            Column(
              key: AppKeys.complaintsList,
              children: [
                for (var i = 0; i < filtered.length; i++) ...[
                  ComplaintListTile(
                    complaint: filtered[i],
                    onTap: () => context.go('/home/complaints/${filtered[i].id}'),
                  ),
                  if (i != filtered.length - 1)
                    const Divider(height: 1, color: AppColors.sand),
                ],
              ],
            ),
        ],
      ),
      ),
    );
  }
}

class _PickedFile {
  const _PickedFile({required this.path, required this.name});
  final String path;
  final String name;
}

class NewComplaintPage extends ConsumerStatefulWidget {
  const NewComplaintPage({super.key});

  @override
  ConsumerState<NewComplaintPage> createState() => _NewComplaintPageState();
}

class _NewComplaintPageState extends ConsumerState<NewComplaintPage> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _typeOther = TextEditingController();
  String _type = 'plumbing';
  String? _flatId;
  List<FlatDto> _flats = [];
  final List<_PickedFile> _files = [];
  bool _busy = false;
  bool _loadingFlats = false;
  bool _requestedFlats = false;
  String? _error;

  static const _types = [
    'electric',
    'plumbing',
    'housekeeping',
    'security',
    'lift',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider);
    _flatId = session.user?.flatId;
  }

  Future<void> _loadFlats() async {
    if (_loadingFlats || _requestedFlats) return;
    _requestedFlats = true;
    _loadingFlats = true;
    try {
      final flats = await ref.read(apiProvider).listFlats();
      if (!mounted) return;
      setState(() {
        _flats = flats;
        _flatId ??= flats.isNotEmpty ? flats.first.id : null;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.message);
      }
    } finally {
      _loadingFlats = false;
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _typeOther.dispose();
    super.dispose();
  }

  Future<void> _pickPhotos() async {
    final picker = ImagePicker();
    final images = await picker.pickMultiImage(imageQuality: 85);
    if (images.isEmpty || !mounted) return;
    setState(() {
      for (final img in images) {
        if (_files.length >= 5) break;
        _files.add(_PickedFile(path: img.path, name: img.name));
      }
    });
  }

  Future<void> _submit() async {
    final user = ref.read(sessionProvider).user;
    final staffPicker = ref.read(sessionProvider.notifier).isStaffView;
    if (!staffPicker && (user?.flatId == null || user!.flatId!.isEmpty)) {
      setState(
        () => _error =
            'Your account is not linked to a flat. Ask your society office to onboard you.',
      );
      return;
    }
    if (staffPicker && (_flatId == null || _flatId!.isEmpty)) {
      setState(() => _error = 'Select a flat to raise this complaint');
      return;
    }
    if (_type == 'other' && _typeOther.text.trim().isEmpty) {
      setState(() => _error = 'Please describe the complaint type');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final c = await api.createComplaint(
        title: _title.text.trim(),
        type: _type,
        description: _description.text.trim(),
        flatId: staffPicker ? _flatId : null,
        typeOtherText: _type == 'other' ? _typeOther.text.trim() : null,
      );
      for (final file in _files) {
        await api.uploadAttachment(
          complaintId: c.id,
          filePath: file.path,
          filename: file.name,
        );
      }
      if (!mounted) return;
      context.go('/home/complaints/${c.id}?justCreated=1');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final staffPicker = ref.watch(sessionProvider.notifier).isStaffView;
    final linkedFlatMissing =
        !staffPicker && (user?.flatId == null || user!.flatId!.isEmpty);
    if (staffPicker) {
      Future.microtask(_loadFlats);
    }

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
      children: [
        Expanded(
          child: ListView(
            key: AppKeys.newComplaintForm,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () => context.go('/home/complaints'),
                    icon: const Icon(Icons.arrow_back),
                    color: AppColors.leafDark,
                  ),
                  Expanded(
                    child: Text('New complaint', style: displayStyle(size: 28)),
                  ),
                ],
              ),
              if (!staffPicker && user?.flatNumber != null)
                Padding(
                  key: AppKeys.newComplaintLinkedFlat,
                  padding: const EdgeInsets.only(left: 12, bottom: 8),
                  child: Text(
                    'Filing for flat ${user!.flatNumber}',
                    style: const TextStyle(color: Colors.black54, fontSize: 13),
                  ),
                ),
              if (linkedFlatMissing)
                const Padding(
                  key: AppKeys.newComplaintNoFlat,
                  padding: EdgeInsets.only(left: 12, bottom: 8),
                  child: Text(
                    'Your account is not linked to a flat. Ask your society office to onboard you before raising a complaint.',
                    style: TextStyle(color: AppColors.danger, fontSize: 13),
                  ),
                ),
              if (staffPicker && _flats.isNotEmpty) ...[
                Column(
                  key: AppKeys.newComplaintFlatPicker,
                  children: [
                    DropdownButtonFormField<String>(
                      // ignore: deprecated_member_use
                      value: toWingSelectValue(wingForFlatId(_flats, _flatId)),
                      decoration: underlineFieldDecoration('Wing'),
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
                        setState(() {
                          _flatId = firstFlatIdInWing(
                            _flats,
                            fromWingSelectValue(w),
                          );
                        });
                      },
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      // ignore: deprecated_member_use
                      value: _flatId,
                      decoration: underlineFieldDecoration('Flat'),
                      items: flatsInWing(_flats, wingForFlatId(_flats, _flatId))
                          .map(
                            (f) => DropdownMenuItem(
                              value: f.id,
                              child: Text(f.number),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setState(() => _flatId = v),
                    ),
                  ],
                ),
              ],
              DropdownButtonFormField<String>(
                // ignore: deprecated_member_use
                value: _type,
                decoration: underlineFieldDecoration('Type'),
                items: [
                  for (final t in _types)
                    DropdownMenuItem(
                      value: t,
                      child: Text(complaintTypeLabels[t] ?? t),
                    ),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _type = v);
                },
              ),
              if (_type == 'other') ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _typeOther,
                  decoration: underlineFieldDecoration('Describe the type'),
                ),
              ],
              const SizedBox(height: 8),
              TextField(
                controller: _title,
                decoration: underlineFieldDecoration('Title'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _description,
                maxLines: 5,
                decoration: underlineFieldDecoration('Description').copyWith(
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Add photos (optional)',
                style: TextStyle(color: Colors.black54, fontSize: 13),
              ),
              const SizedBox(height: 8),
              PhotoDropzone(
                onTap: _busy ? () {} : _pickPhotos,
                count: _files.length,
              ),
              if (_files.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final f in _files)
                      Chip(
                        label: Text(f.name, overflow: TextOverflow.ellipsis),
                        onDeleted: () => setState(() => _files.remove(f)),
                      ),
                  ],
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: ShPrimaryButton(
              label: 'Submit complaint',
              busy: _busy,
              onPressed: linkedFlatMissing || (staffPicker && (_flatId == null || _flatId!.isEmpty))
                  ? null
                  : _submit,
            ),
          ),
        ),
      ],
      ),
    );
  }
}

class ComplaintDetailPage extends ConsumerStatefulWidget {
  const ComplaintDetailPage({
    super.key,
    required this.id,
    this.justCreated = false,
  });

  final String id;
  final bool justCreated;

  @override
  ConsumerState<ComplaintDetailPage> createState() =>
      _ComplaintDetailPageState();
}

class _ComplaintDetailPageState extends ConsumerState<ComplaintDetailPage> {
  ComplaintDto? _item;
  String? _error;
  bool _busy = false;
  bool _editing = false;
  final _note = TextEditingController();
  final _thread = TextEditingController();
  final _editTitle = TextEditingController();
  final _editDescription = TextEditingController();
  final List<_PickedFile> _evidence = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    _thread.dispose();
    _editTitle.dispose();
    _editDescription.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final c = await ref.read(apiProvider).getComplaint(widget.id);
      if (mounted) {
        _editTitle.text = c.title;
        _editDescription.text = c.description;
        setState(() => _item = c);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _pickEvidence() async {
    final picker = ImagePicker();
    final images = await picker.pickMultiImage(imageQuality: 85);
    if (images.isEmpty || !mounted) return;
    setState(() {
      for (final img in images) {
        _evidence.add(_PickedFile(path: img.path, name: img.name));
      }
    });
  }

  Future<void> _applyStatus(String status) async {
    if ((status == 'resolved' || status == 'closed') &&
        _note.text.trim().length < 3) {
      setState(() =>
          _error = 'Add a short closing comment before resolving or closing.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      for (final file in _evidence) {
        await api.uploadAttachment(
          complaintId: widget.id,
          filePath: file.path,
          filename: file.name,
        );
      }
      final note = _note.text.trim();
      final c = await api.updateComplaintStatus(
        widget.id,
        status,
        note: note.isEmpty ? null : note,
      );
      if (mounted) {
        setState(() {
          _item = c;
          _evidence.clear();
          _note.clear();
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _postThread(String kind) async {
    final body = _thread.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await ref.read(apiProvider).addComplaintComment(
            widget.id,
            body,
            kind: kind,
          );
      if (mounted) {
        _thread.clear();
        setState(() => _item = updated);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveEdits() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await ref.read(apiProvider).updateComplaint(
            widget.id,
            title: _editTitle.text.trim(),
            description: _editDescription.text.trim(),
          );
      if (mounted) {
        setState(() {
          _item = updated;
          _editing = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteComplaint() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete complaint?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).deleteComplaint(widget.id);
      if (mounted) context.go('/home/complaints');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final staffView = ref.watch(sessionProvider.notifier).isStaffView;
    final c = _item;

    if (_error != null && c == null) {
      return Center(
        child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
      );
    }
    if (c == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => context.go('/home/complaints'),
              icon: const Icon(Icons.arrow_back),
              color: AppColors.leafDark,
            ),
            Expanded(
              child: Text(c.ticketNumber, style: displayStyle(size: 22)),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        if (widget.justCreated) ...[
          const SizedBox(height: 8),
          Container(
            key: AppKeys.complaintCreatedBanner,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.mist.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Complaint submitted', style: displayStyle(size: 20)),
                const SizedBox(height: 6),
                Text(
                  'Your ticket number is ${c.ticketNumber}. The society office was notified by email and WhatsApp.',
                ),
                if (c.queueHint != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    key: AppKeys.complaintQueueHint,
                    c.queuePosition != null
                        ? '${c.queueHint!} (position #${c.queuePosition})'
                        : c.queueHint!,
                    style: const TextStyle(color: Colors.black54),
                  ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        if (_editing)
          TextField(
            key: AppKeys.complaintEditTitle,
            controller: _editTitle,
            decoration: const InputDecoration(labelText: 'Title'),
          )
        else
          Text(c.title, style: displayStyle(size: 28)),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: StatusBadge(
            status: c.status,
            variant: StatusBadgeVariant.outlined,
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            const Icon(Icons.apartment_outlined, color: AppColors.saffron),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Flat',
                  style: TextStyle(fontSize: 12, color: Colors.black45),
                ),
                Text(
                  c.flatNumber.isEmpty ? '—' : c.flatNumber,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.leafDark,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 20),
            Container(width: 1, height: 36, color: AppColors.sand),
            const SizedBox(width: 20),
            const Icon(Icons.calendar_today_outlined, color: AppColors.saffron, size: 20),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Raised',
                  style: TextStyle(fontSize: 12, color: Colors.black45),
                ),
                Text(
                  formatComplaintWhen(c.createdAt),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.leafDark,
                  ),
                ),
              ],
            ),
          ],
        ),
        if (!staffView && c.queueHint != null && c.status == 'open') ...[
          const SizedBox(height: 16),
          Text(
            '${c.queueHint!} Admins may acknowledge when ready — your ticket stays safe in the queue until then.',
            style: const TextStyle(fontSize: 13, color: Colors.black54),
          ),
        ],
        const SizedBox(height: 16),
        if (_editing)
          TextField(
            key: AppKeys.complaintEditDescription,
            controller: _editDescription,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Description'),
          )
        else
          Text(c.description, style: const TextStyle(height: 1.45, fontSize: 15)),
        if (!staffView && (c.status != 'resolved' && c.status != 'closed')) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              if (_editing)
                FilledButton(
                  key: AppKeys.complaintEditSave,
                  onPressed: _busy ? null : _saveEdits,
                  child: const Text('Save changes'),
                )
              else
                OutlinedButton(
                  key: AppKeys.complaintEdit,
                  onPressed: () => setState(() => _editing = true),
                  child: const Text('Edit'),
                ),
              if (c.status == 'open')
                OutlinedButton(
                  key: AppKeys.complaintDelete,
                  onPressed: _busy ? null : _deleteComplaint,
                  child: const Text('Delete'),
                ),
            ],
          ),
        ],
        if (staffView) ...[
          const SizedBox(height: 24),
          ShCard(
            key: AppKeys.complaintStaffActions,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Office actions', style: displayStyle(size: 20)),
                const SizedBox(height: 6),
                const Text(
                  'Leave it in queue if you are busy. Acknowledge when you have seen it. Start when work begins. Resolve/close with a short note and optional evidence photos.',
                  style: TextStyle(color: Colors.black54, fontSize: 13),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: AppKeys.complaintStaffNote,
                  controller: _note,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Note / closing comment',
                    hintText: 'Required when resolving or closing',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pickEvidence,
                  icon: const Icon(Icons.add_a_photo_outlined),
                  label: Text(
                    _evidence.isEmpty
                        ? 'Evidence photos (optional)'
                        : '${_evidence.length} evidence file(s)',
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (c.status == 'open')
                      OutlinedButton(
                        key: AppKeys.complaintAck,
                        onPressed:
                            _busy ? null : () => _applyStatus('assigned'),
                        child: const Text('Acknowledge'),
                      ),
                    if (c.status == 'open' || c.status == 'assigned')
                      FilledButton(
                        key: AppKeys.complaintStart,
                        onPressed: _busy
                            ? null
                            : () => _applyStatus('in_progress'),
                        child: const Text('Start work'),
                      ),
                    if (c.status != 'resolved' && c.status != 'closed')
                      OutlinedButton(
                        key: AppKeys.complaintResolve,
                        onPressed:
                            _busy ? null : () => _applyStatus('resolved'),
                        child: const Text('Mark resolved'),
                      ),
                    if (c.status != 'closed')
                      FilledButton(
                        key: AppKeys.complaintClose,
                        onPressed:
                            _busy ? null : () => _applyStatus('closed'),
                        child: const Text('Close ticket'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
        if (c.comments.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('Updates & comments', style: displayStyle(size: 20)),
          const SizedBox(height: 12),
          Column(
            key: AppKeys.complaintComments,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final comment in c.comments) ...[
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.mist.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        [
                          comment.kind == 'question' ? 'Question' : 'Comment',
                          if (comment.authorName != null &&
                              comment.authorName!.isNotEmpty)
                            comment.authorName!,
                        ].join(' · '),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Colors.black54,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(comment.body),
                      if (comment.createdAt.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          formatComplaintTimelineWhen(comment.createdAt),
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black45,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ],
          ),
        ],
        if (c.status != 'closed') ...[
          const SizedBox(height: 12),
          TextField(
            key: AppKeys.complaintThreadBody,
            controller: _thread,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Ask a question or add a comment',
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                key: AppKeys.complaintAddComment,
                onPressed: _busy ? null : () => _postThread('comment'),
                child: const Text('Add comment'),
              ),
              OutlinedButton(
                key: AppKeys.complaintAskQuestion,
                onPressed: _busy ? null : () => _postThread('question'),
                child: const Text('Ask a question'),
              ),
            ],
          ),
        ],
        if (c.statusEvents.isNotEmpty) ...[
          const SizedBox(height: 24),
          ComplaintTimeline(events: c.statusEvents),
        ],
        if (c.closingNote != null && c.closingNote!.isNotEmpty) ...[
          const SizedBox(height: 20),
          CommitteeNoteCard(
            key: AppKeys.complaintClosingNote,
            note: c.closingNote!,
          ),
        ],
        if (c.attachments.isNotEmpty) ...[
          const SizedBox(height: 20),
          ComplaintPhotoStrip(attachments: c.attachments),
        ],
      ],
      ),
    );
  }
}
