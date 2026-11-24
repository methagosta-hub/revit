import 'package:supabase_flutter/supabase_flutter.dart';

import 'dahlia_access.dart';

class DahliaTask {
  const DahliaTask({
    required this.id,
    required this.category,
    required this.title,
    required this.detail,
    required this.projectName,
    required this.createdAt,
    required this.priority,
  });

  final String id;
  final String category;
  final String title;
  final String detail;
  final String projectName;
  final DateTime? createdAt;
  final bool priority;

  String get categoryLabel {
    switch (category) {
      case 'po_approval':
        return 'Persetujuan PO';
      case 'material_review':
        return 'Permintaan material';
      case 'warehouse_receipt':
        return 'Penerimaan barang';
      case 'finance_payment':
        return 'Pembayaran';
      case 'attendance_review':
        return 'Verifikasi absensi';
      default:
        return 'Tugas Dahlia';
    }
  }
}

class TaskCenterSnapshot {
  const TaskCenterSnapshot({
    required this.tasks,
    required this.warnings,
  });

  final List<DahliaTask> tasks;
  final List<String> warnings;
}

class TaskCenterRepository {
  TaskCenterRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  Future<TaskCenterSnapshot> load(DahliaAccess access) async {
    final tasks = <DahliaTask>[];
    final warnings = <String>[];

    if (access.canApprovePurchaseOrder) {
      await _capture(
        warnings,
        'Persetujuan PO',
        () async {
          final rows = await _client
              .from('project_purchase_orders')
              .select('id, po_number, created_at, project:projects(title)')
              .eq('status', 'pending_approval')
              .order('created_at', ascending: false)
              .limit(30);
          for (final row in rows) {
            tasks.add(DahliaTask(
              id: 'po_approval:${row['id']}',
              category: 'po_approval',
              title: 'PO ${row['po_number'] ?? 'baru'} menunggu persetujuan',
              detail: 'Periksa nilai dan rincian Purchase Order.',
              projectName: _relatedTitle(row['project']),
              createdAt: _date(row['created_at']),
              priority: true,
            ));
          }
        },
      );
    }

    if (access.canReviewMaterialRequest) {
      await _capture(
        warnings,
        'Peninjauan permintaan material',
        () async {
          final result = await _client.rpc(
            'dahlia_field_list_material_requests_for_review',
            params: {'p_project_id': null},
          );
          if (result is! List) return;
          for (final raw in result) {
            if (raw is! Map) continue;
            final row = Map<String, dynamic>.from(raw);
            final status = row['status']?.toString() ?? '';
            if (!['submitted', 'under_review'].contains(status)) continue;
            tasks.add(DahliaTask(
              id: 'material_review:${row['request_id']}',
              category: 'material_review',
              title: '${row['request_number'] ?? 'PR'} perlu ditinjau',
              detail: 'Permintaan material berstatus ${status == 'submitted' ? 'baru diajukan' : 'sedang ditinjau'}.',
              projectName: row['project_title']?.toString() ?? 'Proyek',
              createdAt: _date(row['created_at']),
              priority: row['priority'] == 'urgent',
            ));
          }
        },
      );
    }

    if (access.canReceiveMaterial) {
      await _capture(
        warnings,
        'Penerimaan barang',
        () async {
          final rows = await _client
              .from('project_purchase_orders')
              .select('id, po_number, status, expected_date, created_at, project:projects(title), supplier:suppliers(name)')
              .inFilter('status', ['approved', 'ordered', 'partially_received'])
              .order('expected_date', ascending: true, nullsFirst: false)
              .limit(40);
          for (final row in rows) {
            final project = _relatedTitle(row['project']);
            final supplier = _relatedName(row['supplier']);
            tasks.add(DahliaTask(
              id: 'warehouse_receipt:${row['id']}',
              category: 'warehouse_receipt',
              title: 'PO ${row['po_number'] ?? ''} menunggu penerimaan',
              detail: '${supplier.isEmpty ? 'Supplier belum diketahui' : supplier} · Status ${row['status']}',
              projectName: project,
              createdAt: _date(row['expected_date'] ?? row['created_at']),
              priority: row['status'] == 'ordered',
            ));
          }
        },
      );
    }

    if (access.canManagePayments) {
      await _capture(
        warnings,
        'Kewajiban pembayaran',
        () async {
          final rows = await _client
              .from('payment_obligations')
              .select('id, obligation_number, description, due_date, amount, paid_amount, project:projects(title)')
              .inFilter('status', ['open', 'partially_paid'])
              .order('due_date', ascending: true, nullsFirst: false)
              .limit(40);
          for (final row in rows) {
            final due = row['due_date']?.toString();
            tasks.add(DahliaTask(
              id: 'finance_payment:${row['id']}',
              category: 'finance_payment',
              title: '${row['obligation_number'] ?? 'Kewajiban'} menunggu pembayaran',
              detail: row['description']?.toString() ?? 'Periksa kewajiban dan jadwal pembayaran.',
              projectName: _relatedTitle(row['project']),
              createdAt: _date(due),
              priority: _isOverdue(due),
            ));
          }
        },
      );
    }

    if (access.canManageAttendance) {
      await _capture(
        warnings,
        'Verifikasi absensi',
        () async {
          final rows = await _client
              .from('attendance_records')
              .select('id, attendance_number, attendance_date, submitted_at, employee:employees(full_name)')
              .eq('approval_status', 'submitted')
              .order('submitted_at', ascending: false)
              .limit(40);
          for (final row in rows) {
            tasks.add(DahliaTask(
              id: 'attendance_review:${row['id']}',
              category: 'attendance_review',
              title: 'Absensi ${row['attendance_number'] ?? ''} menunggu verifikasi',
              detail: _relatedName(row['employee']),
              projectName: 'Personalia',
              createdAt: _date(row['submitted_at'] ?? row['attendance_date']),
              priority: false,
            ));
          }
        },
      );
    }

    tasks.sort((a, b) {
      if (a.priority != b.priority) return a.priority ? -1 : 1;
      final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return aDate.compareTo(bDate);
    });

    return TaskCenterSnapshot(
      tasks: List.unmodifiable(tasks),
      warnings: List.unmodifiable(warnings),
    );
  }

  Future<void> _capture(
    List<String> warnings,
    String label,
    Future<void> Function() operation,
  ) async {
    try {
      await operation();
    } catch (error) {
      warnings.add('$label belum dapat dimuat: ${_shortError(error)}');
    }
  }

  static String _relatedTitle(dynamic value) {
    if (value is Map) return value['title']?.toString() ?? '';
    if (value is List && value.isNotEmpty && value.first is Map) {
      return value.first['title']?.toString() ?? '';
    }
    return '';
  }

  static String _relatedName(dynamic value) {
    if (value is Map) {
      return value['name']?.toString() ??
          value['full_name']?.toString() ??
          '';
    }
    if (value is List && value.isNotEmpty && value.first is Map) {
      return value.first['name']?.toString() ??
          value.first['full_name']?.toString() ??
          '';
    }
    return '';
  }

  static DateTime? _date(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString())?.toLocal();
  }

  static bool _isOverdue(String? value) {
    if (value == null) return false;
    final due = DateTime.tryParse(value);
    if (due == null) return false;
    final now = DateTime.now();
    return DateTime(due.year, due.month, due.day)
        .isBefore(DateTime(now.year, now.month, now.day));
  }

  static String _shortError(Object error) {
    final value = error.toString().replaceFirst('Exception: ', '').trim();
    return value.length > 140 ? '${value.substring(0, 137)}...' : value;
  }
}
