import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../core/offline/secure_outbox.dart';

class FieldRepository {
  FieldRepository({
    required SupabaseClient client,
    required SecureOutbox outbox,
  })  : _client = client,
        _outbox = outbox;

  final SupabaseClient _client;
  final SecureOutbox _outbox;
  static const Uuid _uuid = Uuid();

  String get currentUserId {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw StateError('Sesi login sudah berakhir.');
    return id;
  }

  Future<Map<String, dynamic>> getContext() async {
    final result = await _client.rpc('dahlia_field_get_context');
    return Map<String, dynamic>.from(result as Map);
  }

  Future<List<Map<String, dynamic>>> listProjects() {
    return _rows('dahlia_field_list_projects');
  }

  Future<List<Map<String, dynamic>>> listAttendanceRoster(
    String projectId,
    DateTime attendanceDate,
  ) {
    return _rows(
      'dahlia_field_list_attendance_roster',
      {
        'p_project_id': projectId,
        'p_attendance_date': _dateOnly(attendanceDate),
      },
    );
  }

  Future<List<Map<String, dynamic>>> listMaterialRequests({
    String? projectId,
  }) {
    return _rows(
      'dahlia_field_list_material_requests',
      {'p_project_id': projectId},
    );
  }

  Future<List<Map<String, dynamic>>> listMySegments() {
    return _rows('dahlia_field_list_my_segments');
  }

  Future<List<Map<String, dynamic>>> listSegmentItems(String segmentId) {
    return _rows(
      'dahlia_field_list_segment_items',
      {'p_segment_id': segmentId},
    );
  }

  Future<List<Map<String, dynamic>>> listClaimProgress(String segmentId) {
    return _rows(
      'dahlia_field_list_my_progress_claims',
      {'p_segment_id': segmentId},
    );
  }

  Future<List<Map<String, dynamic>>> listTerms(String segmentId) {
    return _rows(
      'dahlia_field_list_my_terms',
      {'p_segment_id': segmentId},
    );
  }

  Future<List<Map<String, dynamic>>> listPaymentRequests({
    String? segmentId,
  }) {
    return _rows(
      'dahlia_field_list_my_payment_requests',
      {'p_segment_id': segmentId},
    );
  }

  Future<String> queueAttendance({
    required String projectId,
    required String employeeId,
    required DateTime attendanceDate,
    required DateTime checkInAt,
    String? notes,
  }) async {
    final operationId = _uuid.v4();
    await _outbox.enqueue(
      operationId: operationId,
      ownerUserId: currentUserId,
      action: 'attendance',
      payload: {
        'project_id': projectId,
        'employee_id': employeeId,
        'attendance_date': _dateOnly(attendanceDate),
        'check_in_at': checkInAt.toUtc().toIso8601String(),
        'check_out_at': null,
        'notes': notes,
      },
    );
    return operationId;
  }

  Future<String> queueMaterialRequest({
    required String projectId,
    required DateTime requiredDate,
    required String priority,
    required String notes,
    required List<Map<String, dynamic>> items,
  }) async {
    final operationId = _uuid.v4();
    await _outbox.enqueue(
      operationId: operationId,
      ownerUserId: currentUserId,
      action: 'material_request',
      payload: {
        'project_id': projectId,
        'required_date': _dateOnly(requiredDate),
        'priority': priority,
        'notes': notes,
        'items': items,
      },
    );
    return operationId;
  }

  Future<String> queueProgress({
    required String segmentItemId,
    required DateTime reportDate,
    required double quantity,
    required String notes,
  }) async {
    final operationId = _uuid.v4();
    await _outbox.enqueue(
      operationId: operationId,
      ownerUserId: currentUserId,
      action: 'progress',
      payload: {
        'segment_item_id': segmentItemId,
        'report_date': _dateOnly(reportDate),
        'quantity': quantity,
        'notes': notes,
      },
    );
    return operationId;
  }

  Future<String> queuePaymentRequest({
    required String segmentId,
    String? termId,
    double? grossAmount,
    required double retentionAmount,
    required double deductionAmount,
    required String notes,
    required List<Map<String, dynamic>> progressLines,
  }) async {
    final operationId = _uuid.v4();
    await _outbox.enqueue(
      operationId: operationId,
      ownerUserId: currentUserId,
      action: 'payment_request',
      payload: {
        'segment_id': segmentId,
        'term_id': termId,
        'request_date': _dateOnly(DateTime.now()),
        'gross_amount': grossAmount,
        'retention_amount': retentionAmount,
        'deduction_amount': deductionAmount,
        'notes': notes,
        'progress_lines': progressLines,
      },
    );
    return operationId;
  }


  Future<Map<String, dynamic>> getDailyReportContext(String projectId) async {
    final result = await _client.rpc(
      'dahlia_daily_report_context',
      params: {'p_project_id': projectId},
    );
    return Map<String, dynamic>.from(result as Map);
  }

  Future<List<Map<String, dynamic>>> getDailyReportEmployees(
    String projectId,
    String reportDate,
    String divisionId,
  ) {
    return _rows(
      'dahlia_daily_report_employees',
      {
        'p_project_id': projectId,
        'p_report_date': reportDate,
        'p_division_id': divisionId,
      },
    );
  }

  Future<List<Map<String, dynamic>>> listDailyReports(String projectId) async {
    final response = await _client
        .from('project_daily_reports')
        .select('id,report_number,report_date,weather,work_summary,status,created_at')
        .eq('project_id', projectId)
        .order('report_date', ascending: false)
        .order('created_at', ascending: false)
        .limit(30);
    return response
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  Future<String> queueDailyReport(Map<String, dynamic> payload) async {
    final operationId = _uuid.v4();
    await _outbox.enqueue(
      operationId: operationId,
      ownerUserId: currentUserId,
      action: 'daily_report',
      payload: payload,
    );
    return operationId;
  }

  Future<List<Map<String, dynamic>>> _rows(
    String functionName, [
    Map<String, dynamic>? params,
  ]) async {
    final dynamic result = await _client.rpc(functionName, params: params);
    if (result is! List) return <Map<String, dynamic>>[];
    return result
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList(growable: false);
  }

  static String _dateOnly(DateTime value) {
    final local = value.toLocal();
    final year = local.year.toString().padLeft(4, '0');
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }
}
