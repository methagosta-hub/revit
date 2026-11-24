import 'package:supabase_flutter/supabase_flutter.dart';

class DirectMaterialPurchaseRepository {
  DirectMaterialPurchaseRepository({required SupabaseClient client})
      : _client = client;

  final SupabaseClient _client;

  Future<DirectPurchaseWorkspace> loadWorkspace() async {
    final projects = _rows(await _client.from('projects')
        .select('id, title, status').order('title', ascending: true));
    final suppliers = _rows(await _client.from('suppliers')
        .select('id, name').eq('is_active', true).order('name', ascending: true));
    final materials = _rows(await _client.from('master_materials')
        .select('id, code, name, unit, unit_price, category').order('name', ascending: true))
        .map((row) => {...row, 'unit_price': _number(row['unit_price'])})
        .toList(growable: false);
    final headers = _rows(await _client.from('project_direct_material_purchases')
        .select('id, purchase_number, project_id, rab_division_id, supplier_id, supplier_name, purchase_date, invoice_number, payment_method, reference_number, total_amount, notes, status, created_at')
        .order('purchase_date', ascending: false)
        .order('created_at', ascending: false)
        .limit(100));

    if (headers.isEmpty) {
      return DirectPurchaseWorkspace(
        projects: projects,
        suppliers: suppliers,
        materials: materials,
        purchases: const [],
      );
    }

    final purchaseIds = headers.map((row) => row['id'].toString()).toList();
    final projectIds = headers.map((row) => row['project_id'].toString()).toSet().toList();
    final divisionIds = headers.map((row) => row['rab_division_id']?.toString())
        .whereType<String>().toSet().toList();
    final items = _rows(await _client.from('project_direct_material_purchase_items')
        .select('id, purchase_id, material_id, material_code, material_name, unit, quantity_received, quantity_damaged, quantity_accepted, unit_price, line_total, notes')
        .inFilter('purchase_id', purchaseIds)
        .order('created_at', ascending: true));
    final projectRows = _rows(await _client.from('projects')
        .select('id, title').inFilter('id', projectIds));
    final divisions = divisionIds.isEmpty
        ? <Map<String, dynamic>>[]
        : _rows(await _client.from('rab_divisions')
            .select('id, name').inFilter('id', divisionIds));

    final projectNames = <String, String>{
      for (final row in projectRows)
        row['id'].toString(): row['title']?.toString() ?? 'Proyek',
    };
    final divisionNames = <String, String>{
      for (final row in divisions)
        row['id'].toString(): row['name']?.toString() ?? 'Divisi',
    };
    final itemMap = <String, List<Map<String, dynamic>>>{};
    for (final item in items) {
      final id = item['purchase_id']?.toString();
      if (id == null) continue;
      itemMap.putIfAbsent(id, () => <Map<String, dynamic>>[]).add({
        ...item,
        'quantity_received': _number(item['quantity_received']),
        'quantity_damaged': _number(item['quantity_damaged']),
        'quantity_accepted': _number(item['quantity_accepted']),
        'unit_price': _number(item['unit_price']),
        'line_total': _number(item['line_total']),
      });
    }
    final purchases = headers.map((row) => {
      ...row,
      'project_title': projectNames[row['project_id'].toString()] ?? 'Proyek tidak ditemukan',
      'division_name': row['rab_division_id'] == null
          ? null : divisionNames[row['rab_division_id'].toString()],
      'total_amount': _number(row['total_amount']),
      'items': itemMap[row['id'].toString()] ?? <Map<String, dynamic>>[],
    }).toList(growable: false);

    return DirectPurchaseWorkspace(
      projects: projects,
      suppliers: suppliers,
      materials: materials,
      purchases: purchases,
    );
  }

  Future<List<Map<String, dynamic>>> listDivisions(String projectId) async {
    return _rows(await _client.from('rab_divisions')
        .select('id, project_id, code, name, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', ascending: true));
  }

  Future<Map<String, dynamic>> recordPurchase({
    required String projectId,
    required String purchaseDate,
    required String? supplierId,
    required String supplierName,
    required String? divisionId,
    required String? invoiceNumber,
    required String paymentMethod,
    required String? referenceNumber,
    required String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    if (items.isEmpty) throw ArgumentError('Tambahkan minimal satu material.');
    final data = await _client.rpc('record_direct_material_purchase', params: {
      'p_project_id': projectId,
      'p_purchase_date': purchaseDate,
      'p_supplier_id': _clean(supplierId),
      'p_supplier_name': supplierName.trim(),
      'p_rab_division_id': _clean(divisionId),
      'p_invoice_number': _clean(invoiceNumber),
      'p_payment_method': paymentMethod,
      'p_reference_number': _clean(referenceNumber),
      'p_notes': _clean(notes),
      'p_items': items,
    });
    if (data is! Map || data['purchase_number'] == null) {
      throw StateError('Database tidak mengembalikan nomor pembelian langsung.');
    }
    return Map<String, dynamic>.from(data);
  }

  Future<void> voidPurchase(String purchaseId, String reason) async {
    if (reason.trim().isEmpty) throw ArgumentError('Alasan pembatalan wajib diisi.');
    await _client.rpc('void_direct_material_purchase', params: {
      'p_purchase_id': purchaseId,
      'p_reason': reason.trim(),
    });
  }

  static List<Map<String, dynamic>> _rows(dynamic value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value.whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
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

class DirectPurchaseWorkspace {
  const DirectPurchaseWorkspace({
    required this.projects,
    required this.suppliers,
    required this.materials,
    required this.purchases,
  });

  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> suppliers;
  final List<Map<String, dynamic>> materials;
  final List<Map<String, dynamic>> purchases;
}
