import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../offline/secure_outbox.dart';

class SyncSummary {
  const SyncSummary({required this.sent, required this.failed});

  final int sent;
  final int failed;
}

class FieldSyncService extends ChangeNotifier {
  FieldSyncService({
    required SupabaseClient client,
    required SecureOutbox outbox,
  })  : _client = client,
        _outbox = outbox;

  final SupabaseClient _client;
  final SecureOutbox _outbox;
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isSyncing = false;
  String _lastMessage = 'Data lapangan tersimpan aman di perangkat.';

  bool get isSyncing => _isSyncing;
  String get lastMessage => _lastMessage;

  void start() {
    _connectivitySubscription ??=
        _connectivity.onConnectivityChanged.listen((results) {
      if (results.any((result) => result != ConnectivityResult.none)) {
        unawaited(syncPending());
      }
    });
    unawaited(syncPending());
  }

  Future<SyncSummary> syncPending() async {
    if (_isSyncing) return const SyncSummary(sent: 0, failed: 0);
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      _lastMessage = 'Login diperlukan sebelum sinkronisasi.';
      notifyListeners();
      return const SyncSummary(sent: 0, failed: 0);
    }

    _isSyncing = true;
    notifyListeners();
    var sent = 0;
    var failed = 0;

    try {
      final operations = await _outbox.pendingOperations(userId);
      if (operations.isEmpty) {
        _lastMessage = 'Semua data sudah tersinkron.';
      }

      for (final operation in operations) {
        try {
          final result = await _send(operation);
          await _outbox.markSynced(operation.operationId);
          sent++;
          if (result is Map && result['duplicate'] == true) {
            _lastMessage = 'Sebagian absensi sudah tercatat sebelumnya; periksa riwayat absensi.';
          } else if (result is Map && result['message'] is String) {
            _lastMessage = result['message']! as String;
          } else {
            _lastMessage = 'Data berhasil dikirim ke Javawasthu Management.';
          }
        } catch (error) {
          failed++;
          await _outbox.markFailed(operation.operationId, error);
          _lastMessage = 'Sebagian data belum terkirim. Data tetap tersimpan aman untuk dicoba lagi.';
        }
      }
      if (sent > 0 && failed == 0) {
        _lastMessage = '$sent data berhasil disinkronkan.';
      } else if (sent == 0 && failed > 0) {
        _lastMessage = '$failed data menunggu koneksi atau pemeriksaan server.';
      } else if (sent > 0 && failed > 0) {
        _lastMessage = '$sent data terkirim; $failed data masih tertahan.';
      }
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
    return SyncSummary(sent: sent, failed: failed);
  }

  Future<dynamic> _send(FieldOperation operation) {
    final payload = operation.payload;
    switch (operation.action) {
      case 'attendance':
        return _client.rpc(
          'dahlia_field_submit_attendance',
          params: {
            'p_operation_id': operation.operationId,
            'p_employee_id': payload['employee_id'],
            'p_project_id': payload['project_id'],
            'p_attendance_date': payload['attendance_date'],
            'p_check_in_at': payload['check_in_at'],
            'p_check_out_at': payload['check_out_at'],
            'p_notes': payload['notes'],
          },
        );
      case 'material_request':
        return _client.rpc(
          'dahlia_field_submit_material_request',
          params: {
            'p_operation_id': operation.operationId,
            'p_project_id': payload['project_id'],
            'p_required_date': payload['required_date'],
            'p_priority': payload['priority'],
            'p_notes': payload['notes'],
            'p_items': payload['items'],
          },
        );
      case 'progress':
        return _client.rpc(
          'dahlia_field_submit_progress',
          params: {
            'p_operation_id': operation.operationId,
            'p_segment_item_id': payload['segment_item_id'],
            'p_report_date': payload['report_date'],
            'p_quantity': payload['quantity'],
            'p_notes': payload['notes'],
          },
        );
      case 'payment_request':
        return _client.rpc(
          'dahlia_field_submit_payment_request',
          params: {
            'p_operation_id': operation.operationId,
            'p_segment_id': payload['segment_id'],
            'p_term_id': payload['term_id'],
            'p_request_date': payload['request_date'],
            'p_gross_amount': payload['gross_amount'],
            'p_retention_amount': payload['retention_amount'],
            'p_deduction_amount': payload['deduction_amount'],
            'p_notes': payload['notes'],
            'p_progress_lines': payload['progress_lines'],
          },
        );
      case 'daily_report':
        return _client.rpc(
          'dahlia_field_submit_daily_report',
          params: {
            'p_operation_id': operation.operationId,
            'p_payload': payload,
          },
        );
      default:
        throw StateError('Jenis operasi lokal tidak dikenal: \${operation.action}');
    }
  }

  @override
  void dispose() {
    unawaited(_connectivitySubscription?.cancel());
    super.dispose();
  }
}
