import 'package:flutter/material.dart';

import '../core/sync/field_sync_service.dart';
import '../data/field_repository.dart';

class SubcontractorPage extends StatelessWidget {
  const SubcontractorPage({
    required this.repository,
    required this.sync,
    required this.segments,
    this.initialTab = 0,
    super.key,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> segments;
  final int initialTab;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      initialIndex: initialTab == 1 ? 1 : 0,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ruang subkontraktor'),
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.stacked_line_chart), text: 'Progres'),
              Tab(icon: Icon(Icons.request_quote_outlined), text: 'Tagihan'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _ProgressTab(
              repository: repository,
              sync: sync,
              segments: segments,
            ),
            _PaymentTab(
              repository: repository,
              sync: sync,
              segments: segments,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressTab extends StatefulWidget {
  const _ProgressTab({
    required this.repository,
    required this.sync,
    required this.segments,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> segments;

  @override
  State<_ProgressTab> createState() => _ProgressTabState();
}

class _ProgressTabState extends State<_ProgressTab> {
  String? _segmentId;
  String? _segmentItemId;
  Future<List<Map<String, dynamic>>>? _itemsFuture;
  final _quantityController = TextEditingController();
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.segments.isNotEmpty) {
      _segmentId = widget.segments.first['segment_id'] as String;
      _loadItems();
    }
  }

  void _loadItems() {
    final id = _segmentId;
    if (id == null) return;
    setState(() {
      _segmentItemId = null;
      _itemsFuture = widget.repository.listSegmentItems(id);
    });
  }

  Future<void> _submit() async {
    final itemId = _segmentItemId;
    final quantity = double.tryParse(_quantityController.text.trim());
    if (itemId == null || quantity == null || quantity <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih item dan isi volume lebih dari nol.')),
      );
      return;
    }
    setState(() => _isSubmitting = true);
    try {
      await widget.repository.queueProgress(
        segmentItemId: itemId,
        reportDate: DateTime.now(),
        quantity: quantity,
        notes: _notesController.text.trim(),
      );
      await widget.sync.syncPending();
      if (!mounted) return;
      _quantityController.clear();
      _notesController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Laporan progres masuk antrean untuk diperiksa pengawas.'),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Laporan progres belum tersimpan: $error')),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'Pilih kontrak dan item lingkup pekerjaan yang akan dilaporkan.',
          style: TextStyle(color: Color(0xFF65756F)),
        ),
        const SizedBox(height: 16),
        _SegmentDropdown(
          segments: widget.segments,
          value: _segmentId,
          onChanged: (value) {
            setState(() => _segmentId = value);
            _loadItems();
          },
        ),
        const SizedBox(height: 14),
        if (_itemsFuture != null)
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _itemsFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              if (snapshot.hasError) {
                return _InfoCard(message: 'Item tidak dapat dimuat: ${snapshot.error}');
              }
              final items = snapshot.data ?? [];
              if (items.isEmpty) {
                return const _InfoCard(
                  message: 'Tidak ada item pekerjaan yang dapat dilaporkan pada segmen ini.',
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                    value: _segmentItemId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Item pekerjaan',
                      prefixIcon: Icon(Icons.format_list_bulleted),
                    ),
                    items: items.map((item) {
                      final id = item['segment_item_id'] as String;
                      final name = item['item_name'] as String? ?? 'Item';
                      final unit = item['unit'] as String? ?? '';
                      return DropdownMenuItem<String>(
                        value: id,
                        child: Text(
                          '$name ($unit)',
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                    onChanged: (value) => setState(() => _segmentItemId = value),
                  ),
                  const SizedBox(height: 12),
                  if (_segmentItemId != null)
                    Builder(
                      builder: (context) {
                        final selected = items.firstWhere(
                          (item) => item['segment_item_id'] == _segmentItemId,
                        );
                        return _InfoCard(
                          message: 'Alokasi: ${selected['allocated_quantity']} '
                              '${selected['unit']} • ${selected['project_title']}',
                        );
                      },
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _quantityController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Volume yang dikerjakan',
                      prefixIcon: Icon(Icons.straighten),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Catatan progres (opsional)',
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _isSubmitting ? null : _submit,
                    icon: _isSubmitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                    label: const Text('Kirim laporan progres'),
                  ),
                ],
              );
            },
          )
        else
          const _InfoCard(message: 'Belum ada segmen kontrak yang tersedia.'),
        const SizedBox(height: 16),
        const _InfoCard(
          message: 'Laporan berstatus submitted. Volume baru menjadi dasar klaim '
              'setelah diperiksa dan disetujui oleh pihak JAVAWASTHU MANAGEMENT.',
        ),
      ],
    );
  }
}

class _PaymentTab extends StatefulWidget {
  const _PaymentTab({
    required this.repository,
    required this.sync,
    required this.segments,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> segments;

  @override
  State<_PaymentTab> createState() => _PaymentTabState();
}

class _PaymentTabState extends State<_PaymentTab> {
  String? _segmentId;
  String? _selectedProgressId;
  String? _selectedTermId;
  Future<List<Map<String, dynamic>>>? _claimItemsFuture;
  Future<List<Map<String, dynamic>>>? _historyFuture;
  final _quantityController = TextEditingController();
  final _grossController = TextEditingController();
  final _retentionController = TextEditingController(text: '0');
  final _deductionController = TextEditingController(text: '0');
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  Map<String, dynamic>? get _selectedSegment {
    for (final segment in widget.segments) {
      if (segment['segment_id'] == _segmentId) return segment;
    }
    return null;
  }

  bool get _isUnitContract =>
      _selectedSegment?['execution_method'] == 'subcontract_unit';

  @override
  void initState() {
    super.initState();
    if (widget.segments.isNotEmpty) {
      _segmentId = widget.segments.first['segment_id'] as String;
      _loadClaimData();
    }
  }

  void _loadClaimData() {
    final id = _segmentId;
    if (id == null) return;
    setState(() {
      _selectedProgressId = null;
      _selectedTermId = null;
      _quantityController.clear();
      _grossController.clear();
      _claimItemsFuture = _isUnitContract
          ? widget.repository.listClaimProgress(id)
          : widget.repository.listTerms(id);
      _historyFuture = widget.repository.listPaymentRequests(segmentId: id);
    });
  }

  double _calculatedGross(List<Map<String, dynamic>> rows) {
    if (!_isUnitContract) {
      return double.tryParse(_grossController.text.trim()) ?? 0;
    }
    if (_selectedProgressId == null) return 0;
    final selected = rows.firstWhere(
      (row) => row['progress_entry_id'] == _selectedProgressId,
    );
    final quantity = double.tryParse(_quantityController.text.trim()) ?? 0;
    final available = _asDouble(selected['available_quantity']);
    if (quantity <= 0 || quantity > available) return 0;
    return quantity * _asDouble(selected['unit_rate']);
  }

  Future<void> _submit(List<Map<String, dynamic>> rows) async {
    final segmentId = _segmentId;
    if (segmentId == null) return;

    final quantity = double.tryParse(_quantityController.text.trim()) ?? 0;
    final gross = _calculatedGross(rows);
    final retention = double.tryParse(_retentionController.text.trim()) ?? 0;
    final deduction = double.tryParse(_deductionController.text.trim()) ?? 0;

    if (_isUnitContract && (_selectedProgressId == null || quantity <= 0 || gross <= 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih progres disetujui dan isi volume klaim yang tersedia.')),
      );
      return;
    }
    if (!_isUnitContract &&
        (_selectedTermId == null || gross <= 0 || gross > _availableTerm(rows))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih termin dan isi nilai klaim sesuai sisa termin.')),
      );
      return;
    }
    if (retention < 0 || deduction < 0 || retention + deduction >= gross) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Retensi dan potongan harus valid serta lebih kecil dari bruto.')),
      );
      return;
    }
    if (deduction > 0 && _notesController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Catatan dasar potongan wajib diisi.')),
      );
      return;
    }

    final progressLines = _isUnitContract
        ? [
            {
              'progress_entry_id': _selectedProgressId,
              'quantity': quantity,
            }
          ]
        : <Map<String, dynamic>>[];

    setState(() => _isSubmitting = true);
    try {
      await widget.repository.queuePaymentRequest(
        segmentId: segmentId,
        termId: _isUnitContract ? null : _selectedTermId,
        grossAmount: _isUnitContract ? null : gross,
        retentionAmount: retention,
        deductionAmount: deduction,
        notes: _notesController.text.trim(),
        progressLines: progressLines,
      );
      await widget.sync.syncPending();
      if (!mounted) return;
      _quantityController.clear();
      _grossController.clear();
      _retentionController.text = '0';
      _deductionController.text = '0';
      _notesController.clear();
      setState(() {
        _claimItemsFuture = _isUnitContract
            ? widget.repository.listClaimProgress(segmentId)
            : widget.repository.listTerms(segmentId);
        _historyFuture = widget.repository.listPaymentRequests(segmentId: segmentId);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Permintaan pembayaran masuk antrean untuk diperiksa Finance.'),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Tagihan belum dapat disimpan: $error')),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  double _availableTerm(List<Map<String, dynamic>> rows) {
    if (_selectedTermId == null) return 0;
    final selected = rows.firstWhere(
      (row) => row['term_id'] == _selectedTermId,
    );
    return _asDouble(selected['available_to_claim']);
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _grossController.dispose();
    _retentionController.dispose();
    _deductionController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'Pengajuan hanya dapat dibuat dari progres disetujui atau termin kontrak yang masih tersedia.',
          style: TextStyle(color: Color(0xFF65756F)),
        ),
        const SizedBox(height: 16),
        _SegmentDropdown(
          segments: widget.segments,
          value: _segmentId,
          onChanged: (value) {
            setState(() => _segmentId = value);
            _loadClaimData();
          },
        ),
        const SizedBox(height: 14),
        if (_claimItemsFuture != null)
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _claimItemsFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              if (snapshot.hasError) {
                return _InfoCard(message: 'Dasar klaim tidak dapat dimuat: ${snapshot.error}');
              }
              final rows = snapshot.data ?? [];
              if (rows.isEmpty) {
                return const _InfoCard(
                  message: 'Belum ada progres disetujui atau termin dengan nilai tersedia.',
                );
              }
              return _claimForm(rows);
            },
          ),
        const SizedBox(height: 18),
        const Text(
          'Riwayat permintaan pembayaran',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        if (_historyFuture != null)
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _historyFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const LinearProgressIndicator();
              }
              if (snapshot.hasError) {
                return _InfoCard(message: 'Riwayat tidak dapat dimuat: ${snapshot.error}');
              }
              final requests = snapshot.data ?? [];
              if (requests.isEmpty) {
                return const _InfoCard(message: 'Belum ada permintaan pembayaran.');
              }
              return Card(
                child: Column(
                  children: requests.map((request) {
                    return ListTile(
                      title: Text(
                        request['request_number'] as String? ?? 'Permintaan',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${request['segment_title']} • ${request['status']}',
                      ),
                      trailing: Text(
                        _currency(_asDouble(request['gross_amount'])),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        const SizedBox(height: 14),
        const _InfoCard(
          message: 'Status submitted bukan bukti pembayaran. Persetujuan klaim dan '
              'pencairan dana tetap mengikuti proses Finance di JAVAWASTHU MANAGEMENT.',
        ),
      ],
    );
  }

  Widget _claimForm(List<Map<String, dynamic>> rows) {
    if (_isUnitContract) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: _selectedProgressId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Progres disetujui',
              prefixIcon: Icon(Icons.verified_outlined),
            ),
            items: rows.map((row) {
              final id = row['progress_entry_id'] as String;
              final name = row['item_name'] as String? ?? 'Progres';
              final available = _asDouble(row['available_quantity']);
              final unit = row['unit'] as String? ?? '';
              return DropdownMenuItem<String>(
                value: id,
                child: Text(
                  '$name • sisa $available $unit',
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (value) => setState(() {
              _selectedProgressId = value;
              _quantityController.clear();
            }),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _quantityController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Volume yang ditagihkan',
              prefixIcon: Icon(Icons.straighten),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Estimasi bruto: ${_currency(_calculatedGross(rows))}. Nilai final dihitung ulang server berdasarkan tarif kontrak dan volume tersedia.',
            style: const TextStyle(color: Color(0xFF61736C), fontSize: 12),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _isSubmitting ? null : () => _submit(rows),
            icon: _isSubmitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(_isSubmitting ? 'Mengirim...' : 'Ajukan permintaan pembayaran'),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          value: _selectedTermId,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Termin kontrak',
            prefixIcon: Icon(Icons.receipt_long_outlined),
          ),
          items: rows.map((row) {
            final id = row['term_id'] as String;
            final title = row['term_name'] as String? ?? 'Termin';
            final available = _asDouble(row['available_to_claim']);
            return DropdownMenuItem<String>(
              value: id,
              child: Text(
                '$title • tersedia ${_currency(available)}',
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(),
          onChanged: (value) => setState(() => _selectedTermId = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _grossController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: 'Nilai bruto klaim',
            prefixIcon: const Icon(Icons.payments_outlined),
            helperText: 'Sisa termin: ${_currency(_availableTerm(rows))}',
          ),
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: _isSubmitting ? null : () => _submit(rows),
          icon: _isSubmitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send_rounded),
          label: Text(_isSubmitting ? 'Mengirim...' : 'Ajukan permintaan pembayaran'),
        ),
      ],
    );
  }
}

class _SegmentDropdown extends StatelessWidget {
  const _SegmentDropdown({
    required this.segments,
    required this.value,
    required this.onChanged,
  });

  final List<Map<String, dynamic>> segments;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    if (segments.isEmpty) {
      return const _InfoCard(message: 'Belum ada segmen kontrak yang tersedia.');
    }
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: const InputDecoration(
        labelText: 'Kontrak / segmen',
        prefixIcon: Icon(Icons.assignment_outlined),
      ),
      items: segments.map((segment) {
        final id = segment['segment_id'] as String;
        final title = segment['segment_title'] as String? ?? 'Segmen';
        final project = segment['project_title'] as String? ?? '';
        return DropdownMenuItem<String>(
          value: id,
          child: Text(
            '$project • $title',
            overflow: TextOverflow.ellipsis,
          ),
        );
      }).toList(),
      onChanged: onChanged,
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Text(
          message,
          style: const TextStyle(color: Color(0xFF65756F), fontSize: 13),
        ),
      ),
    );
  }
}

double _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

String _currency(double value) {
  final rounded = value.round();
  final text = rounded.toString();
  final parts = <String>[];
  for (var index = text.length; index > 0; index -= 3) {
    final start = index - 3 < 0 ? 0 : index - 3;
    parts.insert(0, text.substring(start, index));
  }
  return 'Rp ${parts.join('.')}';
}
