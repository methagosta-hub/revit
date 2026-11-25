import 'package:flutter/material.dart';

import '../core/sync/field_sync_service.dart';
import '../data/field_repository.dart';

class AttendancePage extends StatefulWidget {
  const AttendancePage({
    required this.repository,
    required this.sync,
    required this.projects,
    super.key,
  });

  final FieldRepository repository;
  final FieldSyncService sync;
  final List<Map<String, dynamic>> projects;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  late final DateTime _attendanceDate;
  String? _selectedProjectId;
  Future<List<Map<String, dynamic>>>? _rosterFuture;
  final _notesController = TextEditingController();
  final Set<String> _submittingEmployees = <String>{};

  @override
  void initState() {
    super.initState();
    _attendanceDate = DateTime.now();
    if (widget.projects.isNotEmpty) {
      _selectedProjectId = widget.projects.first['project_id'] as String;
      _loadRoster();
    }
  }

  void _loadRoster() {
    final projectId = _selectedProjectId;
    if (projectId == null) return;
    setState(() {
      _rosterFuture = widget.repository.listAttendanceRoster(
        projectId,
        _attendanceDate,
      );
    });
  }

  Future<void> _recordAttendance(Map<String, dynamic> employee) async {
    final employeeId = employee['employee_id'] as String;
    final projectId = _selectedProjectId;
    if (projectId == null) return;

    setState(() => _submittingEmployees.add(employeeId));
    try {
      await widget.repository.queueAttendance(
        projectId: projectId,
        employeeId: employeeId,
        attendanceDate: _attendanceDate,
        checkInAt: DateTime.now(),
        notes: _notesController.text.trim(),
      );
      await widget.sync.syncPending();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Absensi masuk antrean dan akan disinkronkan.'),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Gagal menyimpan absensi: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _submittingEmployees.remove(employeeId));
      }
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Absensi pekerja')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'Pilih proyek dan catat pekerja yang bertugas hari ini.',
            style: TextStyle(color: Color(0xFF65756F)),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _selectedProjectId,
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
            onChanged: (value) {
              setState(() => _selectedProjectId = value);
              _loadRoster();
            },
          ),
          const SizedBox(height: 12),
          _DateCard(date: _attendanceDate),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
              labelText: 'Catatan (opsional)',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          const SizedBox(height: 22),
          const Text(
            'Daftar pekerja yang ditugaskan',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          if (_rosterFuture == null)
            const _MessageCard(message: 'Pilih proyek untuk memuat daftar pekerja.')
          else
            FutureBuilder<List<Map<String, dynamic>>>(
              future: _rosterFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.all(30),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return _MessageCard(
                    message: 'Daftar pekerja tidak dapat dimuat: ${snapshot.error}',
                  );
                }
                final employees = snapshot.data ?? [];
                if (employees.isEmpty) {
                  return const _MessageCard(
                    message: 'Tidak ada pekerja aktif yang ditugaskan pada tanggal ini.',
                  );
                }
                return Card(
                  child: Column(
                    children: employees.map((employee) {
                      final id = employee['employee_id'] as String;
                      final name = employee['full_name'] as String? ?? 'Pekerja';
                      final isLoading = _submittingEmployees.contains(id);
                      return Column(
                        children: [
                          ListTile(
                            leading: CircleAvatar(
                              backgroundColor: const Color(0xFFE5EFEB),
                              child: Text(
                                name.isEmpty ? '?' : name.substring(0, 1).toUpperCase(),
                                style: const TextStyle(
                                  color: Color(0xFF244C45),
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            title: Text(
                              name,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            subtitle: Text(
                              employee['employee_number'] as String? ?? '',
                            ),
                            trailing: SizedBox(
                              width: 104,
                              child: FilledButton.tonal(
                                onPressed: isLoading
                                    ? null
                                    : () => _recordAttendance(employee),
                                child: isLoading
                                    ? const SizedBox(
                                        width: 17,
                                        height: 17,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : const Text('Hadir'),
                              ),
                            ),
                          ),
                          if (employee != employees.last)
                            const Divider(height: 1, indent: 70),
                        ],
                      );
                    }).toList(),
                  ),
                );
              },
            ),
          const SizedBox(height: 16),
          const _MessageCard(
            message: 'Catatan dari aplikasi berstatus submitted dan bersumber dari '
                'Flutter. Data belum menjadi dasar payroll sebelum diverifikasi Personalia.',
          ),
        ],
      ),
    );
  }
}

class _DateCard extends StatelessWidget {
  const _DateCard({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final dateText =
        '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    return Card(
      child: ListTile(
        leading: const Icon(Icons.calendar_today_outlined),
        title: const Text('Tanggal absensi'),
        subtitle: Text(dateText),
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          message,
          style: const TextStyle(color: Color(0xFF66756F)),
        ),
      ),
    );
  }
}
