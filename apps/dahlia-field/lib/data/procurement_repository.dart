import 'package:supabase_flutter/supabase_flutter.dart';

class ProcurementRepository {
  ProcurementRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  Future<List<Map<String, dynamic>>> listProjects() async {
    final response = await _client
        .from('projects')
        .select('id, title, client')
        .eq('status', 'DIKERJAKAN')
        .order('title', ascending: true);
    return _rows(response);
  }

  Future<List<Map<String, dynamic>>> listSuppliers() async {
    final response = await _client
        .from('suppliers')
        .select('id, supplier_code, name, is_active')
        .eq('is_active', true)
        .order('name', ascending: true);
    return _rows(response);
  }

  Future<List<Map<String, dynamic>>> listPurchaseOrders({
    List<String>? statuses,
  }) async {
    var query = _client
        .from('project_purchase_orders')
        .select('''
          id, project_id, supplier_id, po_number, status, order_date,
          expected_date, notes, subtotal, created_at,
          project:projects(title, client),
          supplier:suppliers(name),
          items:project_purchase_order_items(
            id, material_code, material_name, unit,
            quantity_ordered, unit_price, line_total
          )
        ''')
        .order('created_at', ascending: false);
    if (statuses != null && statuses.isNotEmpty) {
      query = query.inFilter('status', statuses);
    }
    final response = await query;
    return _normalizePurchaseOrders(response);
  }

  Future<List<Map<String, dynamic>>> listMaterialRequestsForReview() async {
    final response = await _client.rpc(
      'dahlia_field_list_material_requests_for_review',
      params: {'p_project_id': null},
    );
    return _rows(response);
  }

  Future<void> reviewMaterialRequest({
    required String requestId,
    required String decision,
    String? rejectionReason,
  }) async {
    if (decision == 'rejected' && (rejectionReason ?? '').trim().isEmpty) {
      throw ArgumentError('Alasan penolakan wajib diisi.');
    }
    await _client.rpc(
      'dahlia_field_review_material_request',
      params: {
        'p_request_id': requestId,
        'p_decision': decision,
        'p_rejection_reason':
            decision == 'rejected' ? rejectionReason?.trim() : null,
      },
    );
  }

  Future<String> createPurchaseOrder({
    required String projectId,
    required String supplierId,
    required DateTime orderDate,
    DateTime? expectedDate,
    String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    if (items.isEmpty) {
      throw ArgumentError('Tambahkan minimal satu barang ke Purchase Order.');
    }
    final response = await _client.rpc(
      'create_project_purchase_order',
      params: {
        'p_project_id': projectId,
        'p_supplier_id': supplierId,
        'p_order_date': _dateOnly(orderDate),
        'p_expected_date':
            expectedDate == null ? null : _dateOnly(expectedDate),
        'p_notes': _clean(notes),
        'p_items': items,
      },
    );
    if (response is! String || response.isEmpty) {
      throw StateError('Database tidak mengembalikan ID Purchase Order.');
    }
    return response;
  }

  Future<void> approvePurchaseOrder(String purchaseOrderId) async {
    await _client.rpc(
      'approve_project_purchase_order',
      params: {'p_purchase_order_id': purchaseOrderId},
    );
  }

  Future<void> markPurchaseOrderOrdered(String purchaseOrderId) async {
    await _client.rpc(
      'mark_project_purchase_order_ordered',
      params: {'p_purchase_order_id': purchaseOrderId},
    );
  }

  static List<Map<String, dynamic>> _normalizePurchaseOrders(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((raw) {
      final row = Map<String, dynamic>.from(raw);
      row['project'] = _first(row['project']);
      row['supplier'] = _first(row['supplier']);
      final rawItems = row['items'];
      row['items'] = rawItems is List
          ? rawItems.whereType<Map>().map((item) {
              final line = Map<String, dynamic>.from(item);
              line['quantity_ordered'] =
                  _number(line['quantity_ordered']);
              line['unit_price'] = _number(line['unit_price']);
              line['line_total'] = _number(line['line_total']);
              return line;
            }).toList(growable: false)
          : <Map<String, dynamic>>[];
      row['subtotal'] = _number(row['subtotal']);
      return row;
    }).toList(growable: false);
  }

  static List<Map<String, dynamic>> _rows(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  static Map<String, dynamic>? _first(dynamic value) {
    if (value is List) {
      return value.isNotEmpty && value.first is Map
          ? Map<String, dynamic>.from(value.first as Map)
          : null;
    }
    return value is Map ? Map<String, dynamic>.from(value) : null;
  }

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String? _clean(String? value) {
    final result = value?.trim();
    return result == null || result.isEmpty ? null : result;
  }

  static String _dateOnly(DateTime value) {
    final local = value.toLocal();
    final year = local.year.toString().padLeft(4, '0');
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }
}
