import 'package:supabase_flutter/supabase_flutter.dart';

class WarehouseRepository {
  WarehouseRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  Future<WarehouseWorkspace> loadWorkspace() async {
    final orderRows = await _client
        .from('project_purchase_orders')
        .select('''
          id, project_id, po_number, status, order_date, expected_date,
          project:projects(title), supplier:suppliers(name),
          items:project_purchase_order_items(
            id, material_id, material_code, material_name, unit,
            quantity_ordered, unit_price
          )
        ''')
        .inFilter('status', ['approved', 'ordered', 'partially_received'])
        .order('created_at', ascending: false);

    final receiptBalanceRows = await _client
        .from('project_material_receipts')
        .select('purchase_order_id, items:project_material_receipt_items(purchase_order_item_id, quantity_received)')
        .eq('status', 'confirmed');

    final stockRows = await _client
        .from('v_project_material_stock')
        .select('project_id, material_id, material_code, material_name, unit, quantity_on_hand')
        .gt('quantity_on_hand', 0)
        .order('material_name', ascending: true);

    final projectRows = await _client
        .from('projects')
        .select('id, title, client')
        .eq('status', 'DIKERJAKAN')
        .order('title', ascending: true);

    final receiptRows = await _client
        .from('project_material_receipts')
        .select('''
          id, receipt_number, received_at, delivery_note_no, notes,
          project:projects(title),
          purchase_order:project_purchase_orders(
            po_number, supplier:suppliers(name)
          ),
          items:project_material_receipt_items(
            quantity_received, quantity_damaged, quantity_accepted, notes,
            purchase_order_item:project_purchase_order_items(material_code, material_name, unit)
          )
        ''')
        .eq('status', 'confirmed')
        .order('received_at', ascending: false)
        .limit(50);

    final issueRows = await _client
        .from('project_material_issues')
        .select('''
          id, issue_number, project_id, issued_at, recipient_name, notes, status,
          project:projects(title),
          items:project_material_issue_items(
            id, material_name, unit, quantity_issued,
            division:rab_divisions(name)
          )
        ''')
        .order('issued_at', ascending: false)
        .limit(50);

    final projects = _rows(projectRows);
    final projectIds = projects.map((row) => row['id'].toString()).toList();
    var divisionRows = <Map<String, dynamic>>[];
    if (projectIds.isNotEmpty) {
      divisionRows = _rows(await _client
          .from('rab_divisions')
          .select('id, project_id, code, name, sort_order, items:rab_items(id, code, name, unit)')
          .inFilter('project_id', projectIds)
          .order('sort_order', ascending: true));
    }

    final receivedByItem = <String, double>{};
    for (final receipt in _rows(receiptBalanceRows)) {
      final items = _rows(receipt['items']);
      for (final item in items) {
        final itemId = item['purchase_order_item_id']?.toString();
        if (itemId == null) continue;
        receivedByItem[itemId] = (receivedByItem[itemId] ?? 0) +
            _number(item['quantity_received']);
      }
    }

    final pendingOrders = <Map<String, dynamic>>[];
    for (final raw in _rows(orderRows)) {
      final items = <Map<String, dynamic>>[];
      for (final item in _rows(raw['items'])) {
        final ordered = _number(item['quantity_ordered']);
        final received = receivedByItem[item['id'].toString()] ?? 0;
        final remaining = (ordered - received).clamp(0, double.infinity).toDouble();
        if (remaining <= 0.000001) continue;
        items.add({
          ...item,
          'quantity_ordered': ordered,
          'quantity_received': received,
          'quantity_remaining': remaining,
          'unit_price': _number(item['unit_price']),
        });
      }
      if (items.isEmpty) continue;
      pendingOrders.add({
        ...raw,
        'project': _first(raw['project']),
        'supplier': _first(raw['supplier']),
        'items': items,
      });
    }

    final projectMap = <String, Map<String, dynamic>>{
      for (final project in projects) project['id'].toString(): project,
    };
    final stocks = <Map<String, dynamic>>[];
    for (final raw in _rows(stockRows)) {
      final project = projectMap[raw['project_id']?.toString()];
      stocks.add({
        ...raw,
        'project_title': project?['title'] ?? 'Proyek tidak ditemukan',
        'project_client': project?['client'],
        'quantity_on_hand': _number(raw['quantity_on_hand']),
      });
    }

    final receipts = _rows(receiptRows).map((row) {
      final po = _first(row['purchase_order']);
      final items = _rows(row['items']);
      final totalReceived = items.fold<double>(
        0, (sum, item) => sum + _number(item['quantity_received']),
      );
      final totalDamaged = items.fold<double>(
        0, (sum, item) => sum + _number(item['quantity_damaged']),
      );
      return {
        ...row,
        'project': _first(row['project']),
        'purchase_order': po == null
            ? null
            : {...po, 'supplier': _first(po['supplier'])},
        'items': items.map((item) => {
          ...item,
          'purchase_order_item': _first(item['purchase_order_item']),
        }).toList(growable: false),
        'total_received': totalReceived,
        'total_damaged': totalDamaged,
      };
    }).toList(growable: false);

    final issues = _rows(issueRows).map((row) {
      return {
        ...row,
        'project': _first(row['project']),
        'items': _rows(row['items']).map((item) => {
          ...item,
          'division': _first(item['division']),
          'quantity_issued': _number(item['quantity_issued']),
        }).toList(growable: false),
      };
    }).toList(growable: false);

    final divisions = divisionRows.map((row) => {
      ...row,
      'items': _rows(row['items']),
    }).toList(growable: false);

    return WarehouseWorkspace(
      pendingOrders: pendingOrders,
      stocks: stocks,
      projects: projects,
      divisions: divisions,
      receipts: receipts,
      issues: issues,
    );
  }

  Future<String> recordReceipt({
    required String purchaseOrderId,
    required DateTime receivedAt,
    required String? deliveryNoteNumber,
    required String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    if (items.isEmpty) throw ArgumentError('Masukkan minimal satu item yang diterima.');
    final data = await _client.rpc('record_project_material_receipt', params: {
      'p_purchase_order_id': purchaseOrderId,
      'p_received_at': receivedAt.toIso8601String(),
      'p_delivery_note_no': _clean(deliveryNoteNumber),
      'p_notes': _clean(notes),
      'p_items': items,
    });
    if (data is! String || data.isEmpty) {
      throw StateError('Database tidak mengembalikan ID penerimaan.');
    }
    return data;
  }

  Future<String> recordIssue({
    required String projectId,
    required DateTime issuedAt,
    required String? recipientName,
    required String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    if (items.isEmpty) throw ArgumentError('Masukkan minimal satu item pengeluaran.');
    final data = await _client.rpc('record_project_material_issue', params: {
      'p_project_id': projectId,
      'p_issued_at': issuedAt.toIso8601String(),
      'p_recipient_name': _clean(recipientName),
      'p_notes': _clean(notes),
      'p_items': items,
    });
    if (data is! String || data.isEmpty) {
      throw StateError('Database tidak mengembalikan ID pengeluaran.');
    }
    return data;
  }

  static List<Map<String, dynamic>> _rows(dynamic value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value.whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  static Map<String, dynamic>? _first(dynamic value) {
    if (value is List) {
      if (value.isEmpty || value.first is! Map) return null;
      return Map<String, dynamic>.from(value.first as Map);
    }
    return value is Map ? Map<String, dynamic>.from(value) : null;
  }

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String? _clean(String? value) {
    final clean = value?.trim();
    return clean == null || clean.isEmpty ? null : clean;
  }
}

class WarehouseWorkspace {
  const WarehouseWorkspace({
    required this.pendingOrders,
    required this.stocks,
    required this.projects,
    required this.divisions,
    required this.receipts,
    required this.issues,
  });

  final List<Map<String, dynamic>> pendingOrders;
  final List<Map<String, dynamic>> stocks;
  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> divisions;
  final List<Map<String, dynamic>> receipts;
  final List<Map<String, dynamic>> issues;
}
