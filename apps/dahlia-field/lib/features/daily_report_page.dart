import 'package:flutter/material.dart';

import '../core/sync/field_sync_service.dart';
import '../data/field_repository.dart';

class DailyReportPage extends StatefulWidget {
  const DailyReportPage({
    required this.repository,
    required this.sync,
    required this.projects,
    super.key,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> projects;

  @override
  State<DailyReportPage> createState() => _DailyReportPageState();
}

class _DailyReportPageState extends State<DailyReportPage> {
  static const _green = Color(0xFF244C45);
  static const _muted = Color(0xFF65756F);

  late String _projectId;
  late Future<Map<String, dynamic>> _contextFuture;
  Future<List<Map<String, dynamic>>>? _archiveFuture;
  Future<List<Map<String, dynamic>>>? _rosterFuture;

  String _divisionId = '';
  int _step = 0;
  bool _saving = false;
  DateTime _reportDate = DateTime.now();
  String _weather = 'clear';

  final _condition = TextEditingController();
  final _summary = TextEditingController();
  final _startTime = TextEditingController(text: '07:30');
  final _endTime = TextEditingController(text: '16:00');
  final _obstacles = TextEditingController();
  final _followUp = TextEditingController();

  final List<_WorkLine> _workLines = [];
  final List<_LaborLine> _laborLines = [];
  final List<_MaterialLine> _materialLines = [];
  final List<_EquipmentLine> _equipmentLines = [];

  @override
  void initState() {
    super.initState();
    _projectId = widget.projects.first['project_id']?.toString() ?? '';
    _contextFuture = _loadContext(_projectId);
  }

  @override
  void dispose() {
    _condition.dispose();
    _summary.dispose();
    _startTime.dispose();
    _endTime.dispose();
    _obstacles.dispose();
    _followUp.dispose();
    _clearLines();
    super.dispose();
  }

  Future<Map<String, dynamic>> _loadContext(String projectId) async {
    if (projectId.isEmpty) throw StateError('Belum ada proyek yang dapat diakses akun ini.');
    final data = await widget.repository.getDailyReportContext(projectId);
    final divisions = _maps(data['divisions']);
    if (!divisions.any((row) => row['id']?.toString() == _divisionId)) {
      _divisionId = divisions.isEmpty ? '' : divisions.first['id'].toString();
    }
    _archiveFuture = widget.repository.listDailyReports(projectId);
    _refreshRosterFuture();
    return data;
  }

  void _refreshRosterFuture() {
    _rosterFuture = (_projectId.isEmpty || _divisionId.isEmpty)
        ? null
        : widget.repository.getDailyReportEmployees(
            _projectId, _dateOnly(_reportDate), _divisionId);
  }

  void _changeProject(String? value) {
    if (value == null || value == _projectId) return;
    _clearLines();
    setState(() {
      _projectId = value;
      _divisionId = '';
      _step = 0;
      _contextFuture = _loadContext(value);
    });
  }

  void _clearLines() {
    for (final line in _workLines) { line.dispose(); }
    for (final line in _laborLines) { line.dispose(); }
    for (final line in _materialLines) { line.dispose(); }
    for (final line in _equipmentLines) { line.dispose(); }
    _workLines.clear();
    _laborLines.clear();
    _materialLines.clear();
    _equipmentLines.clear();
  }

  List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return [];
    return value.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  String _dateOnly(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';

  String _dateLabel(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}/'
      '${value.month.toString().padLeft(2, '0')}/${value.year}';

  double _number(String value, {double fallback = 0}) =>
      double.tryParse(value.trim().replaceAll(',', '.')) ?? fallback;

  Future<void> _chooseDate() async {
    final today = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      initialDate: _reportDate,
      firstDate: DateTime(today.year - 5),
      lastDate: DateTime(today.year, today.month, today.day),
      helpText: 'Pilih tanggal laporan',
    );
    if (selected == null) return;
    setState(() {
      _reportDate = selected;
      for (final line in _laborLines) { line.dispose(); }
      _laborLines.clear();
      _refreshRosterFuture();
    });
  }

  List<Map<String, dynamic>> _availableItems(Map<String, dynamic> contextData) {
    return _maps(contextData['package_items']).where((item) {
      final itemDivision = item['rab_division_id']?.toString() ??
          item['package_division_id']?.toString() ?? '';
      return itemDivision == _divisionId;
    }).toList();
  }

  Future<void> _pickWorkItem(List<Map<String, dynamic>> items) async {
    final chosen = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.of(sheetContext).size.height * .72,
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.all(18),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Pilih item pekerjaan RAB',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                ),
              ),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Text('Belum ada item paket/RAB pada divisi ini.'))
                    : ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final item = items[index];
                          final id = item['id']?.toString() ?? '';
                          final exists = _workLines.any((line) => line.item['id']?.toString() == id);
                          return ListTile(
                            enabled: !exists,
                            title: Text(item['item_name']?.toString() ?? 'Item pekerjaan',
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text(
                              '${item['rab_code'] ?? 'Tanpa kode'} • RAB ${item['planned_quantity'] ?? 0} ${item['unit'] ?? ''}\n'
                              '${item['package_name'] ?? 'Paket pekerjaan'}',
                            ),
                            trailing: Icon(exists ? Icons.check_circle : Icons.add_circle_outline,
                                color: exists ? _green : null),
                            onTap: exists ? null : () => Navigator.pop(sheetContext, item),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
    if (chosen != null && mounted) setState(() => _workLines.add(_WorkLine(chosen)));
  }

  Future<void> _openRoster() async {
    final future = _rosterFuture;
    if (future == null) return;
    final chosen = await showModalBottomSheet<List<Map<String, dynamic>>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RosterPicker(
        future: future,
        alreadySelected: _laborLines.map((line) => line.employee['id']?.toString() ?? '').toSet(),
      ),
    );
    if (!mounted || chosen == null) return;
    setState(() {
      for (final employee in chosen) {
        final id = employee['id']?.toString() ?? '';
        if (id.isNotEmpty && !_laborLines.any((line) => line.employee['id']?.toString() == id)) {
          _laborLines.add(_LaborLine(employee));
        }
      }
    });
  }

  int? _parseTime(String value) {
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  bool _validateStep() {
    if (_step == 0) {
      if (_divisionId.isEmpty) { _message('Pilih divisi pekerjaan terlebih dahulu.'); return false; }
      final today = DateTime.now();
      if (DateTime(_reportDate.year, _reportDate.month, _reportDate.day)
          .isAfter(DateTime(today.year, today.month, today.day))) {
        _message('Tanggal laporan tidak boleh di masa mendatang.'); return false;
      }
      final start = _startTime.text.trim();
      final end = _endTime.text.trim();
      if (start.isNotEmpty && end.isNotEmpty) {
        final a = _parseTime(start);
        final b = _parseTime(end);
        if (a == null || b == null || b <= a) {
          _message('Jam selesai harus setelah jam mulai. Gunakan format JJ:MM.');
          return false;
        }
      }
    }
    if (_step == 1 && !_workLines.any((line) => _number(line.quantity.text) > 0)) {
      _message('Tambahkan minimal satu item pekerjaan dengan volume hari ini.');
      return false;
    }
    if (_step == 3) {
      for (final line in _materialLines) {
        if (line.name.text.trim().isNotEmpty && _number(line.quantity.text) <= 0) {
          _message('Volume material harus lebih besar dari nol.'); return false;
        }
      }
      for (final line in _equipmentLines) {
        if (line.name.text.trim().isNotEmpty && _number(line.quantity.text) <= 0) {
          _message('Jumlah peralatan harus lebih besar dari nol.'); return false;
        }
      }
    }
    return true;
  }

  void _continue() {
    if (!_validateStep()) return;
    if (_step < 5) {
      setState(() {
        _step++;
        if (_step == 2) _refreshRosterFuture();
      });
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  Future<void> _save({required bool submit}) async {
    if (_saving) return;
    if (_divisionId.isEmpty || !_workLines.any((line) => _number(line.quantity.text) > 0)) {
      setState(() => _step = _divisionId.isEmpty ? 0 : 1);
      _message('Pilih divisi dan catat minimal satu volume pekerjaan.');
      return;
    }

    final payload = <String, dynamic>{
      'report_id': null,
      'project_id': _projectId,
      'division_id': _divisionId,
      'report_date': _dateOnly(_reportDate),
      'weather': _weather,
      'field_condition': _condition.text.trim(),
      'work_summary': _summary.text.trim(),
      'start_time': _startTime.text.trim(),
      'end_time': _endTime.text.trim(),
      'obstacles': _obstacles.text.trim(),
      'follow_up': _followUp.text.trim(),
      'submit': submit,
      'work_items': _workLines.where((line) => _number(line.quantity.text) > 0).map((line) => {
        'package_item_id': line.item['id'],
        'segment_item_id': null,
        'quantity_today': _number(line.quantity.text),
        'notes': line.notes.text.trim(),
      }).toList(),
      'labor': _laborLines.map((line) => {
        'employee_id': line.employee['id'],
        'daily_assignment_id': line.employee['daily_assignment_id'],
        'position_snapshot': line.employee['position_title'],
        'attendance_status': line.status,
        'hours_worked': _number(line.hours.text, fallback: 8),
        'hok': _number(line.hok.text, fallback: 1),
        'overtime_hours': _number(line.overtime.text),
        'notes': line.notes.text.trim(),
      }).toList(),
      'materials': _materialLines.where((line) =>
          line.name.text.trim().isNotEmpty && _number(line.quantity.text) > 0).map((line) => {
        'material_id': null,
        'material_name': line.name.text.trim(),
        'unit': line.unit.text.trim().isEmpty ? 'unit' : line.unit.text.trim(),
        'quantity_used': _number(line.quantity.text),
        'estimated_waste_quantity': _number(line.waste.text),
        'notes': line.notes.text.trim(),
      }).toList(),
      'equipment': _equipmentLines.where((line) => line.name.text.trim().isNotEmpty).map((line) => {
        'equipment_name': line.name.text.trim(),
        'quantity': _number(line.quantity.text, fallback: 1),
        'hours_used': _number(line.hours.text),
        'condition_status': line.condition,
        'cost_estimate': _number(line.cost.text),
        'notes': line.notes.text.trim(),
      }).toList(),
    };

    setState(() => _saving = true);
    try {
      await widget.repository.queueDailyReport(payload);
      final result = await widget.sync.syncPending();
      if (!mounted) return;
      final message = result.sent > 0
          ? (submit ? 'Laporan harian dikirim untuk diverifikasi.' : 'Draft laporan harian berhasil disimpan.')
          : (submit ? 'Laporan masuk antrean aman dan dikirim saat koneksi tersedia.' : 'Draft masuk antrean aman dan dikirim saat koneksi tersedia.');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      Navigator.of(context).pop();
    } catch (error) {
      if (mounted) _message('Laporan belum dapat disimpan: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Laporan Harian Proyek',
          style: TextStyle(fontWeight: FontWeight.w800))),
      body: _projectId.isEmpty
          ? const Center(child: Text('Belum ada proyek yang dapat diakses.'))
          : FutureBuilder<Map<String, dynamic>>(
              future: _contextFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return _ErrorPanel(
                    message: snapshot.error.toString(),
                    onRetry: () => setState(() => _contextFuture = _loadContext(_projectId)),
                  );
                }
                final data = snapshot.data!;
                final divisions = _maps(data['divisions']);
                final items = _availableItems(data);
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                  children: [
                    _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const _Eyebrow('PROYEK AKTIF'),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        value: _projectId,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Pilih proyek',
                          prefixIcon: Icon(Icons.apartment_outlined),
                        ),
                        items: widget.projects.map((project) => DropdownMenuItem<String>(
                          value: project['project_id'].toString(),
                          child: Text(project['title']?.toString() ?? 'Proyek',
                              overflow: TextOverflow.ellipsis),
                        )).toList(),
                        onChanged: _changeProject,
                      ),
                      const SizedBox(height: 8),
                      Text(data['project']?['location']?.toString() ?? 'Lokasi proyek belum diisi',
                          style: const TextStyle(color: _muted, fontSize: 12)),
                    ])),
                    const SizedBox(height: 14),
                    if (divisions.isEmpty)
                      const _Notice(message: 'Proyek belum mempunyai divisi RAB. Buat divisi dan paket pekerjaan di JAVAWASTHU MANAGEMENT terlebih dahulu.')
                    else ...[
                      const Text('Buat laporan aktivitas proyek',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      const Text('Catat pekerjaan, personel, material, peralatan, cuaca, dan kendala dalam satu laporan.',
                          style: TextStyle(color: _muted, fontSize: 12, height: 1.4)),
                      const SizedBox(height: 12),
                      Stepper(
                        currentStep: _step,
                        onStepTapped: (index) { if (index <= _step) setState(() => _step = index); },
                        onStepContinue: _continue,
                        onStepCancel: () { if (_step > 0) setState(() => _step--); },
                        controlsBuilder: (context, details) {
                          if (_step == 5) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                                OutlinedButton.icon(
                                  onPressed: _saving ? null : () => _save(submit: false),
                                  icon: const Icon(Icons.save_outlined),
                                  label: const Text('Simpan sebagai draft'),
                                ),
                                const SizedBox(height: 8),
                                FilledButton.icon(
                                  onPressed: _saving ? null : () => _save(submit: true),
                                  icon: _saving
                                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                      : const Icon(Icons.send_rounded),
                                  label: Text(_saving ? 'Menyimpan...' : 'Ajukan laporan'),
                                ),
                                TextButton(
                                  onPressed: _saving ? null : details.onStepCancel,
                                  child: const Text('Kembali'),
                                ),
                              ]),
                            );
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Row(children: [
                              FilledButton(onPressed: details.onStepContinue, child: const Text('Lanjut')),
                              if (_step > 0) ...[
                                const SizedBox(width: 8),
                                TextButton(onPressed: details.onStepCancel, child: const Text('Kembali')),
                              ],
                            ]),
                          );
                        },
                        steps: [
                          Step(title: const Text('Informasi'), subtitle: const Text('Tanggal, divisi, cuaca, jam kerja'),
                              isActive: _step >= 0, content: _informationStep(divisions)),
                          Step(title: const Text('Pekerjaan'), subtitle: const Text('Realisasi volume RAB/AHSP'),
                              isActive: _step >= 1, content: _workStep(items)),
                          Step(title: const Text('Personel'), subtitle: const Text('Tenaga kerja, kehadiran, HOK'),
                              isActive: _step >= 2, content: _laborStep()),
                          Step(title: const Text('Sumber daya'), subtitle: const Text('Material dan peralatan'),
                              isActive: _step >= 3, content: _resourceStep()),
                          Step(title: const Text('Catatan'), subtitle: const Text('Ringkasan, kendala, tindak lanjut'),
                              isActive: _step >= 4, content: _notesStep()),
                          Step(title: const Text('Review'), subtitle: const Text('Periksa sebelum diajukan'),
                              isActive: _step >= 5, content: _reviewStep()),
                        ],
                      ),
                    ],
                    const SizedBox(height: 8),
                    const Text('Arsip laporan terbaru',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    _archive(),
                    const SizedBox(height: 14),
                    const _Notice(message: 'Laporan harian hanya merekam aktivitas proyek. Data personel tidak membuat transaksi absensi baru dan pemakaian material tidak mengurangi stok gudang. Verifikasi tetap dilakukan di JAVAWASTHU MANAGEMENT.'),
                  ],
                );
              },
            ),
    );
  }

  Widget _informationStep(List<Map<String, dynamic>> divisions) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _FieldLabel('Tanggal laporan'),
      OutlinedButton.icon(onPressed: _chooseDate,
          icon: const Icon(Icons.calendar_month_outlined), label: Text(_dateLabel(_reportDate))),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(
        value: _divisionId.isEmpty ? null : _divisionId,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Divisi / lokasi pekerjaan',
            prefixIcon: Icon(Icons.account_tree_outlined)),
        items: divisions.map((division) => DropdownMenuItem<String>(
          value: division['id'].toString(),
          child: Text('${division['code'] ?? ''} ${division['name'] ?? ''}'.trim(),
              overflow: TextOverflow.ellipsis),
        )).toList(),
        onChanged: (value) {
          if (value == null) return;
          _clearLines();
          setState(() { _divisionId = value; _refreshRosterFuture(); });
        },
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(
        value: _weather,
        decoration: const InputDecoration(labelText: 'Cuaca',
            prefixIcon: Icon(Icons.cloud_outlined)),
        items: const [
          DropdownMenuItem(value: 'clear', child: Text('Cerah')),
          DropdownMenuItem(value: 'cloudy', child: Text('Mendung')),
          DropdownMenuItem(value: 'rain_light', child: Text('Hujan ringan')),
          DropdownMenuItem(value: 'rain_heavy', child: Text('Hujan lebat')),
          DropdownMenuItem(value: 'other', child: Text('Lainnya')),
        ],
        onChanged: (value) => setState(() => _weather = value ?? 'clear'),
      ),
      const SizedBox(height: 12),
      TextField(controller: _condition, maxLines: 2,
          decoration: const InputDecoration(labelText: 'Kondisi lapangan',
              hintText: 'Area kerja, akses, kondisi tanah, dan sebagainya...')),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextField(controller: _startTime, keyboardType: TextInputType.datetime,
            decoration: const InputDecoration(labelText: 'Mulai (JJ:MM)'))),
        const SizedBox(width: 10),
        Expanded(child: TextField(controller: _endTime, keyboardType: TextInputType.datetime,
            decoration: const InputDecoration(labelText: 'Selesai (JJ:MM)'))),
      ]),
    ],
  );

  Widget _workStep(List<Map<String, dynamic>> items) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _Notice(compact: true, message: 'Pilih pekerjaan dari paket/RAB proyek agar realisasi harian terhubung ke item yang sama pada JAVAWASTHU MANAGEMENT.'),
      const SizedBox(height: 10),
      OutlinedButton.icon(onPressed: () => _pickWorkItem(items),
          icon: const Icon(Icons.add), label: const Text('Tambah item pekerjaan')),
      if (_workLines.isEmpty)
        const Padding(padding: EdgeInsets.all(12), child: Text(
          'Belum ada item pekerjaan. Tambahkan item untuk mencatat volume hari ini.',
          textAlign: TextAlign.center, style: TextStyle(color: _muted))),
      ..._workLines.asMap().entries.map((entry) {
        final index = entry.key;
        final line = entry.value;
        final item = line.item;
        final components = item['components_snapshot'];
        final componentCount = components is List ? components.length : 0;
        return _LineCard(
          title: item['item_name']?.toString() ?? 'Item pekerjaan',
          subtitle: '${item['rab_code'] ?? 'Tanpa kode'} • RAB ${item['planned_quantity'] ?? 0} ${item['unit'] ?? ''}',
          onRemove: () => setState(() => _workLines.removeAt(index).dispose()),
          children: [
            if (componentCount > 0) Text('Referensi AHSP: ${componentCount} komponen tersimpan',
                style: const TextStyle(color: _muted, fontSize: 11)),
            TextField(controller: line.quantity,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: 'Volume hari ini (${item['unit'] ?? ''})')),
            TextField(controller: line.notes, decoration: const InputDecoration(labelText: 'Catatan pekerjaan')),
          ],
        );
      }),
    ],
  );

  Widget _laborStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _Notice(compact: true, message: 'Daftar personel diambil dari penempatan proyek pada Personalia. Keterangan ini hanya snapshot laporan, bukan transaksi absensi/payroll.'),
      const SizedBox(height: 10),
      OutlinedButton.icon(onPressed: _rosterFuture == null ? null : _openRoster,
          icon: const Icon(Icons.person_add_alt_1), label: const Text('Pilih personel proyek')),
      if (_laborLines.isEmpty)
        const Padding(padding: EdgeInsets.all(12), child: Text(
          'Belum ada personel yang ditambahkan pada laporan ini.',
          textAlign: TextAlign.center, style: TextStyle(color: _muted))),
      ..._laborLines.asMap().entries.map((entry) {
        final index = entry.key;
        final line = entry.value;
        final employee = line.employee;
        return _LineCard(
          title: employee['full_name']?.toString() ?? 'Personel',
          subtitle: '${employee['employee_number'] ?? 'Tanpa NIK'} • ${employee['position_title'] ?? 'Jabatan belum diisi'}',
          onRemove: () => setState(() => _laborLines.removeAt(index).dispose()),
          children: [
            DropdownButtonFormField<String>(
              value: line.status,
              decoration: const InputDecoration(labelText: 'Status kehadiran'),
              items: const [
                DropdownMenuItem(value: 'present', child: Text('Hadir')),
                DropdownMenuItem(value: 'half_day', child: Text('Setengah hari')),
                DropdownMenuItem(value: 'sick', child: Text('Sakit')),
                DropdownMenuItem(value: 'permission', child: Text('Izin')),
                DropdownMenuItem(value: 'absent', child: Text('Tidak hadir')),
                DropdownMenuItem(value: 'other', child: Text('Lainnya')),
              ],
              onChanged: (value) => setState(() => line.status = value ?? 'present'),
            ),
            Row(children: [
              Expanded(child: _numberField(line.hours, 'Jam kerja')),
              const SizedBox(width: 8),
              Expanded(child: _numberField(line.hok, 'HOK')),
            ]),
            _numberField(line.overtime, 'Lembur (jam)'),
            TextField(controller: line.notes, decoration: const InputDecoration(labelText: 'Catatan personel')),
          ],
        );
      }),
    ],
  );

  Widget _resourceStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text('Pemakaian material', style: TextStyle(fontWeight: FontWeight.w800)),
      const SizedBox(height: 5),
      const Text('Catat material yang dipakai di lapangan. Ini tidak memotong stok gudang.',
          style: TextStyle(color: _muted, fontSize: 12)),
      OutlinedButton.icon(onPressed: () => setState(() => _materialLines.add(_MaterialLine())),
          icon: const Icon(Icons.add), label: const Text('Tambah material')),
      ..._materialLines.asMap().entries.map((entry) {
        final i = entry.key;
        final line = entry.value;
        return _LineCard(
          title: 'Material ${i + 1}',
          onRemove: () => setState(() => _materialLines.removeAt(i).dispose()),
          children: [
            TextField(controller: line.name, decoration: const InputDecoration(labelText: 'Nama material')),
            Row(children: [
              Expanded(child: _numberField(line.quantity, 'Jumlah dipakai')),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: line.unit, decoration: const InputDecoration(labelText: 'Satuan'))),
            ]),
            _numberField(line.waste, 'Estimasi sisa/terbuang'),
            TextField(controller: line.notes, decoration: const InputDecoration(labelText: 'Catatan material')),
          ],
        );
      }),
      const Divider(height: 28),
      const Text('Peralatan', style: TextStyle(fontWeight: FontWeight.w800)),
      OutlinedButton.icon(onPressed: () => setState(() => _equipmentLines.add(_EquipmentLine())),
          icon: const Icon(Icons.add), label: const Text('Tambah peralatan')),
      ..._equipmentLines.asMap().entries.map((entry) {
        final i = entry.key;
        final line = entry.value;
        return _LineCard(
          title: 'Peralatan ${i + 1}',
          onRemove: () => setState(() => _equipmentLines.removeAt(i).dispose()),
          children: [
            TextField(controller: line.name, decoration: const InputDecoration(labelText: 'Nama peralatan')),
            Row(children: [
              Expanded(child: _numberField(line.quantity, 'Jumlah/unit')),
              const SizedBox(width: 8),
              Expanded(child: _numberField(line.hours, 'Jam digunakan')),
            ]),
            DropdownButtonFormField<String>(
              value: line.condition,
              decoration: const InputDecoration(labelText: 'Kondisi peralatan'),
              items: const [
                DropdownMenuItem(value: 'good', child: Text('Baik')),
                DropdownMenuItem(value: 'minor_issue', child: Text('Kendala ringan')),
                DropdownMenuItem(value: 'damaged', child: Text('Rusak')),
                DropdownMenuItem(value: 'maintenance', child: Text('Perawatan')),
              ],
              onChanged: (value) => setState(() => line.condition = value ?? 'good'),
            ),
            _numberField(line.cost, 'Estimasi biaya (opsional)'),
            TextField(controller: line.notes, decoration: const InputDecoration(labelText: 'Catatan peralatan')),
          ],
        );
      }),
    ],
  );

  Widget _notesStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextField(controller: _summary, maxLines: 3,
          decoration: const InputDecoration(labelText: 'Ringkasan aktivitas hari ini',
              hintText: 'Jelaskan aktivitas utama yang berlangsung di proyek...')),
      const SizedBox(height: 12),
      TextField(controller: _obstacles, maxLines: 3,
          decoration: const InputDecoration(labelText: 'Kendala / hambatan',
              hintText: 'Cuaca, keterlambatan material, akses, tenaga kerja, dan lainnya...')),
      const SizedBox(height: 12),
      TextField(controller: _followUp, maxLines: 3,
          decoration: const InputDecoration(labelText: 'Tindak lanjut / rencana berikutnya',
              hintText: 'Langkah yang perlu dilakukan setelah laporan ini...')),
    ],
  );

  Widget _reviewStep() {
    final works = _workLines.where((line) => _number(line.quantity.text) > 0).length;
    final materials = _materialLines.where((line) =>
        line.name.text.trim().isNotEmpty && _number(line.quantity.text) > 0).length;
    final equipment = _equipmentLines.where((line) => line.name.text.trim().isNotEmpty).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _ReviewRow('Tanggal', _dateLabel(_reportDate)),
      _ReviewRow('Cuaca', _weatherLabel(_weather)),
      _ReviewRow('Volume pekerjaan', '${works} item'),
      _ReviewRow('Personel', '${_laborLines.length} orang'),
      _ReviewRow('Material', '${materials} jenis'),
      _ReviewRow('Peralatan', '${equipment} jenis'),
      const Divider(height: 24),
      const Text('Ringkasan aktivitas', style: TextStyle(fontWeight: FontWeight.w800)),
      const SizedBox(height: 5),
      Text(_summary.text.trim().isEmpty ? 'Belum diisi' : _summary.text.trim()),
      const SizedBox(height: 12),
      const _Notice(compact: true, message: 'Laporan masuk ke proses verifikasi JAVAWASTHU MANAGEMENT. Pengajuan tidak mengesahkan absensi, pengeluaran material, ataupun pembayaran secara otomatis.'),
    ]);
  }

  Widget _archive() {
    final future = _archiveFuture;
    if (future == null) return const _Notice(message: 'Arsip laporan belum dimuat.');
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
        }
        if (snapshot.hasError) return _Notice(message: 'Arsip belum dapat dimuat: ${snapshot.error}');
        final reports = snapshot.data ?? [];
        if (reports.isEmpty) return const _Notice(message: 'Belum ada laporan harian pada proyek ini.');
        return _Panel(child: Column(children: reports.take(20).map((report) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const CircleAvatar(backgroundColor: Color(0xFFEAF1EE),
              child: Icon(Icons.description_outlined, color: _green)),
          title: Text(report['report_number']?.toString() ?? 'Laporan harian',
              style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text('${report['report_date'] ?? ''} • ${_weatherLabel(report['weather']?.toString() ?? 'other')}\n'
              '${report['work_summary'] ?? 'Tanpa ringkasan'}',
              maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: _StatusChip(status: report['status']?.toString() ?? 'draft'),
        )).toList()));
      },
    );
  }

  Widget _numberField(TextEditingController controller, String label) => TextField(
    controller: controller,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    decoration: InputDecoration(labelText: label),
  );

  String _weatherLabel(String value) => switch (value) {
    'clear' => 'Cerah',
    'cloudy' => 'Mendung',
    'rain_light' => 'Hujan ringan',
    'rain_heavy' => 'Hujan lebat',
    _ => 'Lainnya',
  };
}

class _WorkLine {
  _WorkLine(this.item);
  final Map<String, dynamic> item;
  final quantity = TextEditingController();
  final notes = TextEditingController();
  void dispose() { quantity.dispose(); notes.dispose(); }
}

class _LaborLine {
  _LaborLine(this.employee);
  final Map<String, dynamic> employee;
  String status = 'present';
  final hours = TextEditingController(text: '8');
  final hok = TextEditingController(text: '1');
  final overtime = TextEditingController(text: '0');
  final notes = TextEditingController();
  void dispose() { hours.dispose(); hok.dispose(); overtime.dispose(); notes.dispose(); }
}

class _MaterialLine {
  final name = TextEditingController();
  final unit = TextEditingController();
  final quantity = TextEditingController();
  final waste = TextEditingController(text: '0');
  final notes = TextEditingController();
  void dispose() { name.dispose(); unit.dispose(); quantity.dispose(); waste.dispose(); notes.dispose(); }
}

class _EquipmentLine {
  final name = TextEditingController();
  final quantity = TextEditingController(text: '1');
  final hours = TextEditingController(text: '0');
  final cost = TextEditingController(text: '0');
  String condition = 'good';
  final notes = TextEditingController();
  void dispose() { name.dispose(); quantity.dispose(); hours.dispose(); cost.dispose(); notes.dispose(); }
}

class _RosterPicker extends StatefulWidget {
  const _RosterPicker({required this.future, required this.alreadySelected});
  final Future<List<Map<String, dynamic>>> future;
  final Set<String> alreadySelected;
  @override
  State<_RosterPicker> createState() => _RosterPickerState();
}

class _RosterPickerState extends State<_RosterPicker> {
  final Set<String> _selected = {};
  String _search = '';

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      height: MediaQuery.of(context).size.height * .76,
      child: Column(children: [
        const Padding(padding: EdgeInsets.fromLTRB(18, 8, 18, 10),
            child: Align(alignment: Alignment.centerLeft,
                child: Text('Personel terjadwal', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(onChanged: (value) => setState(() => _search = value.toLowerCase()),
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search),
                    hintText: 'Cari nama atau nomor karyawan'))),
        Expanded(child: FutureBuilder<List<Map<String, dynamic>>>(
          future: widget.future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
            if (snapshot.hasError) return Center(child: Text('Roster gagal dimuat: ${snapshot.error}'));
            final rows = (snapshot.data ?? []).where((employee) {
              final id = employee['id']?.toString() ?? '';
              final text = '${employee['full_name'] ?? ''} ${employee['employee_number'] ?? ''}'.toLowerCase();
              return !widget.alreadySelected.contains(id) && text.contains(_search);
            }).toList();
            if (rows.isEmpty) return const Center(child: Text('Tidak ada personel yang cocok.'));
            return ListView.builder(itemCount: rows.length, itemBuilder: (context, index) {
              final employee = rows[index];
              final id = employee['id'].toString();
              return CheckboxListTile(
                value: _selected.contains(id),
                title: Text(employee['full_name']?.toString() ?? ''),
                subtitle: Text('${employee['employee_number'] ?? ''} • ${employee['position_title'] ?? 'Jabatan belum diisi'}'),
                onChanged: (checked) => setState(() {
                  if (checked == true) { _selected.add(id); } else { _selected.remove(id); }
                }),
              );
            });
          },
        )),
        Padding(padding: const EdgeInsets.all(16), child: FilledButton(
          onPressed: () async {
            final rows = await widget.future;
            if (!context.mounted) return;
            Navigator.pop(context, rows.where((row) => _selected.contains(row['id']?.toString())).toList());
          },
          child: Text('Tambahkan ${_selected.length} personel'),
        )),
      ]),
    ),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(padding: const EdgeInsets.all(14), child: child),
  );
}

class _LineCard extends StatelessWidget {
  const _LineCard({required this.title, required this.children, this.subtitle, this.onRemove});
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final VoidCallback? onRemove;
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(top: 10),
    child: Padding(padding: const EdgeInsets.all(12), child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800))),
          if (onRemove != null) IconButton(tooltip: 'Hapus baris', onPressed: onRemove,
              icon: const Icon(Icons.delete_outline, color: Colors.redAccent)),
        ]),
        if (subtitle != null) Padding(padding: const EdgeInsets.only(bottom: 8),
            child: Text(subtitle!, style: const TextStyle(color: Color(0xFF65756F), fontSize: 11))),
        ...children.map((child) => Padding(padding: const EdgeInsets.only(top: 8), child: child)),
      ],
    )),
  );
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(children: [
      Expanded(child: Text(label, style: const TextStyle(color: Color(0xFF65756F)))),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
    ]),
  );
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.value);
  final String value;
  @override
  Widget build(BuildContext context) => Text(value,
      style: const TextStyle(color: Color(0xFF65756F), fontSize: 10,
          fontWeight: FontWeight.w800, letterSpacing: 1.1));
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.value);
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
  );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.message, this.compact = false});
  final String message;
  final bool compact;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(compact ? 10 : 13),
    decoration: BoxDecoration(color: const Color(0xFFEAF1EE),
        borderRadius: BorderRadius.circular(12)),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.info_outline, color: Color(0xFF244C45), size: 18),
      const SizedBox(width: 8),
      Expanded(child: Text(message, style: const TextStyle(
          color: Color(0xFF38574F), fontSize: 11, height: 1.4))),
    ]),
  );
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off_outlined, size: 42, color: Color(0xFF65756F)),
      const SizedBox(height: 12),
      Text(message, textAlign: TextAlign.center),
      const SizedBox(height: 14),
      FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Coba lagi')),
    ]),
  ));
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'submitted' => 'Diajukan',
      'approved' => 'Disetujui',
      'rejected' => 'Perbaikan',
      _ => 'Draft',
    };
    final color = switch (status) {
      'submitted' => const Color(0xFF9A6416),
      'approved' => const Color(0xFF236B4A),
      'rejected' => const Color(0xFFB43E3E),
      _ => const Color(0xFF65756F),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: .10), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}
