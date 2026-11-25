import 'package:flutter/material.dart';

import '../core/sync/field_sync_service.dart';
import '../data/field_repository.dart';

class MaterialRequestPage extends StatefulWidget {
  const MaterialRequestPage({
    required this.repository,
    required this.sync,
    required this.projects,
    super.key,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> projects;

  @override
  State<MaterialRequestPage> createState() => _MaterialRequestPageState();
}

class _MaterialRequestPageState extends State<MaterialRequestPage> {
  String? _projectId;
  String _priority = 'normal';
  DateTime _requiredDate = DateTime.now();
  final _notesController = TextEditingController();
  final List<_MaterialLine> _lines = [_MaterialLine()];
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    if (widget.projects.isNotEmpty) {
      _projectId = widget.projects.first['project_id'] as String;
    }
  }

  Future<void> _chooseRequiredDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _requiredDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (selected != null) setState(() => _requiredDate = selected);
  }

  Future<void> _submit() async {
    final projectId = _projectId;
    if (projectId == null) return;
    final validLines = <Map<String, dynamic>>[];

    for (final line in _lines) {
      final name = line.name.text.trim();
      final unit = line.unit.text.trim();
      final quantity = double.tryParse(line.quantity.text.trim());
      if (name.isEmpty || unit.isEmpty || quantity == null || quantity <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Isi nama, satuan, dan jumlah positif untuk setiap material.'),
          ),
        );
        return;
      }
      validLines.add({
        'material_id': null,
        'item_name': name,
        'unit': unit,
        'quantity': quantity,
        'notes': line.notes.text.trim(),
      });
    }

    setState(() => _isSaving = true);
    try {
      await widget.repository.queueMaterialRequest(
        projectId: projectId,
        requiredDate: _requiredDate,
        priority: _priority,
        notes: _notesController.text.trim(),
        items: validLines,
      );
      await widget.sync.syncPending();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Permintaan material masuk antrean untuk Purchasing.'),
        ),
      );
      setState(() {
        for (final line in _lines) {
          line.clear();
        }
        _notesController.clear();
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Permintaan belum dapat disimpan: $error')),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Permintaan material')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'Ajukan kebutuhan lapangan. Purchasing akan meninjau dan membuat PO resmi secara terpisah.',
            style: TextStyle(color: Color(0xFF65756F)),
          ),
          const SizedBox(height: 18),
          DropdownButtonFormField<String>(
            value: _projectId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Proyek',
              prefixIcon: Icon(Icons.apartment_outlined),
            ),
            items: widget.projects.map((project) {
              final id = project['project_id'] as String;
              return DropdownMenuItem<String>(
                value: id,
                child: Text(
                  project['title'] as String? ?? 'Proyek',
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (value) => setState(() => _projectId = value),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.event_available_outlined),
              title: const Text('Tanggal dibutuhkan'),
              subtitle: Text(_formatDate(_requiredDate)),
              trailing: const Icon(Icons.edit_calendar_outlined),
              onTap: _chooseRequiredDate,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _priority,
            decoration: const InputDecoration(
              labelText: 'Prioritas',
              prefixIcon: Icon(Icons.flag_outlined),
            ),
            items: const [
              DropdownMenuItem(value: 'normal', child: Text('Normal')),
              DropdownMenuItem(value: 'urgent', child: Text('Mendesak')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _priority = value);
            },
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Daftar material',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
              TextButton.icon(
                onPressed: _lines.length >= 50
                    ? null
                    : () => setState(() => _lines.add(_MaterialLine())),
                icon: const Icon(Icons.add),
                label: const Text('Tambah'),
              ),
            ],
          ),
          ..._lines.asMap().entries.map((entry) {
            final index = entry.key;
            final line = entry.value;
            return Card(
              key: ObjectKey(line),
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Material ${index + 1}',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                        if (_lines.length > 1)
                          IconButton(
                            tooltip: 'Hapus baris',
                            onPressed: () {
                              setState(() => _lines.removeAt(index));
                              line.dispose();
                            },
                            icon: const Icon(Icons.delete_outline),
                          ),
                      ],
                    ),
                    TextField(
                      controller: line.name,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Nama material'),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextField(
                            controller: line.quantity,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'Jumlah'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: line.unit,
                            decoration: const InputDecoration(labelText: 'Satuan'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: line.notes,
                      decoration: const InputDecoration(labelText: 'Spesifikasi / catatan (opsional)'),
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 4),
          TextField(
            controller: _notesController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Catatan pengajuan (opsional)',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _isSaving ? null : _submit,
            icon: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: const Text('Ajukan permintaan'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Nomor PR lapangan tidak sama dengan nomor PO. Aplikasi ini tidak menerbitkan pesanan resmi kepada toko/supplier.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Color(0xFF6F7E78)),
          ),
        ],
      ),
    );
  }
}

class _MaterialLine {
  final TextEditingController name = TextEditingController();
  final TextEditingController unit = TextEditingController(text: 'pcs');
  final TextEditingController quantity = TextEditingController();
  final TextEditingController notes = TextEditingController();

  void clear() {
    name.clear();
    unit.text = 'pcs';
    quantity.clear();
    notes.clear();
  }

  void dispose() {
    name.dispose();
    unit.dispose();
    quantity.dispose();
    notes.dispose();
  }
}

String _formatDate(DateTime date) {
  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}
