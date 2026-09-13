import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/session.dart';

/// Lightweight list screens for Phase 2 demo modules (bills, notices, ops).
class ApiListPage extends ConsumerStatefulWidget {
  const ApiListPage({
    super.key,
    required this.title,
    required this.path,
    this.itemsKey = 'items',
    this.titleField = 'title',
    this.subtitleField,
  });

  final String title;
  final String path;
  final String itemsKey;
  final String titleField;
  final String? subtitleField;

  @override
  ConsumerState<ApiListPage> createState() => _ApiListPageState();
}

class _ApiListPageState extends ConsumerState<ApiListPage> {
  List<Map<String, dynamic>> _rows = [];
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
      final api = ref.read(apiProvider);
      final json = await api.getJson(widget.path);
      List<dynamic> list;
      if (json is Map &&
          widget.itemsKey.isNotEmpty &&
          json[widget.itemsKey] is List) {
        list = json[widget.itemsKey] as List;
      } else if (json is List) {
        list = json;
      } else if (json is Map && json['items'] is List) {
        list = json['items'] as List;
      } else {
        list = const [];
      }
      setState(() {
        _rows = list
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, textAlign: TextAlign.center),
                  ),
                )
              : _rows.isEmpty
                  ? Center(child: Text('No ${widget.title.toLowerCase()} yet.'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: _rows.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final row = _rows[i];
                          final title = '${row[widget.titleField] ?? row['name'] ?? row['visitorName'] ?? row['facilityName'] ?? row['id']}';
                          final sub = widget.subtitleField != null
                              ? '${row[widget.subtitleField]}'
                              : null;
                          return ListTile(
                            title: Text(title),
                            subtitle: sub != null && sub != 'null' ? Text(sub) : null,
                          );
                        },
                      ),
                    ),
    );
  }
}
