import 'package:supabase_flutter/supabase_flutter.dart';

class FinanceRepository {
  FinanceRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  Future<FinanceWorkspace> loadWorkspace() async {
    final projectRows = await _client
        .from('projects')
        .select('id, title, client, total_value')
        .eq('status', 'DIKERJAKAN')
        .order('title', ascending: true);

    final cashRows = await _client
        .from('company_cash_transactions')
        .select('''
          id, transaction_number, transaction_date, direction, category,
          project_id, description, amount, payment_method, reference_number,
          supplier_payment_id, status, created_at, project:projects(title)
        ''')
        .order('transaction_date', ascending: false)
        .order('created_at', ascending: false)
        .limit(300);

    final supplierPayments = await _client
        .from('project_supplier_payments')
        .select('''
          id, payment_number, project_id, purchase_order_id, payment_date,
          amount, payment_method, reference_number, notes, status, created_at,
          project:projects(title), supplier:suppliers(name),
          purchase_order:project_purchase_orders(po_number)
        ''')
        .order('payment_date', ascending: false)
        .order('created_at', ascending: false)
        .limit(200);

    final payableOrders = await _client
        .from('project_purchase_orders')
        .select('''
          id, project_id, po_number, status, order_date, subtotal,
          project:projects!inner(title,status), supplier:suppliers(name)
        ''')
        .eq('project.status', 'DIKERJAKAN')
        .inFilter('status', ['approved', 'ordered', 'partially_received', 'received'])
        .order('order_date', ascending: false);

    final obligations = await _client
        .from('payment_obligations')
        .select('''
          id, obligation_number, source_type, payee_type, project_id,
          obligation_date, due_date, description, amount, paid_amount, status,
          employee:employees(employee_number, full_name),
          subcontractor:subcontractors(legal_name),
          project:projects(title)
        ''')
        .inFilter('status', ['open', 'partially_paid'])
        .order('due_date', ascending: true, nullsFirst: false)
        .limit(200);

    final summaries = await _client
        .from('projects')
        .select('id, title, client, total_value, status')
        .inFilter('status', ['DIKERJAKAN', 'SELESAI'])
        .order('title', ascending: true);

    final ordersForSummary = await _client
        .from('project_purchase_orders')
        .select('project_id, subtotal, status');

    final paymentsForSummary = await _client
        .from('project_supplier_payments')
        .select('project_id, amount, status');

    final cashForSummary = await _client
        .from('company_cash_transactions')
        .select('project_id, direction, amount, status');

    final recaps = await _client
        .from('finance_recap_documents')
        .select('id, recap_number, scope_type, project_id, rab_division_id, period_start, period_end, report_title, snapshot, status, created_at, replaces_recap_id, replacement_reason, previous_recap_number')
        .order('created_at', ascending: false)
        .limit(100);

    final projectRowsList = _rows(projectRows);
    final payableRows = _rows(payableOrders);
    final supplierPaidByPo = <String, double>{};
    for (final payment in _rows(supplierPayments)) {
      if (payment['status'] != 'paid') continue;
      final poId = payment['purchase_order_id']?.toString();
      if (poId == null) continue;
      supplierPaidByPo[poId] = (supplierPaidByPo[poId] ?? 0) + _number(payment['amount']);
    }

    final payable = payableRows.map((row) {
      final project = _first(row['project']);
      final supplier = _first(row['supplier']);
      final subtotal = _number(row['subtotal']);
      final paid = supplierPaidByPo[row['id'].toString()] ?? 0;
      return {
        ...row,
        'project': project,
        'supplier': supplier,
        'subtotal': subtotal,
        'paid_total': paid,
        'remaining': (subtotal - paid).clamp(0, double.infinity).toDouble(),
      };
    }).where((row) => _number(row['remaining']) > 0.000001).toList(growable: false);

    final summaryProjects = _rows(summaries);
    final orderData = _rows(ordersForSummary);
    final paymentData = _rows(paymentsForSummary);
    final cashData = _rows(cashForSummary);
    final projectSummaries = summaryProjects.map((project) {
      final id = project['id'];
      final poRows = orderData.where((row) => row['project_id'] == id &&
          !['draft', 'pending_approval', 'cancelled'].contains(row['status']));
      final paidRows = paymentData.where((row) => row['project_id'] == id && row['status'] == 'paid');
      final confirmedCash = cashData.where((row) => row['project_id'] == id && row['status'] == 'confirmed');
      final committed = poRows.fold<double>(0, (sum, row) => sum + _number(row['subtotal']));
      final paid = paidRows.fold<double>(0, (sum, row) => sum + _number(row['amount']));
      final cashIn = confirmedCash.where((row) => row['direction'] == 'in')
          .fold<double>(0, (sum, row) => sum + _number(row['amount']));
      final cashOut = confirmedCash.where((row) => row['direction'] == 'out')
          .fold<double>(0, (sum, row) => sum + _number(row['amount']));
      return {
        'project_id': id,
        'project_name': project['title'],
        'client': project['client'],
        'project_value': _number(project['total_value']),
        'committed_po': committed,
        'paid_supplier': paid,
        'cash_in': cashIn,
        'cash_out': cashOut,
        'remaining_po': (committed - paid).clamp(0, double.infinity).toDouble(),
      };
    }).toList(growable: false);

    return FinanceWorkspace(
      projects: projectRowsList,
      cashTransactions: _rows(cashRows).map((row) => {
        ...row,
        'project': _first(row['project']),
        'amount': _number(row['amount']),
      }).toList(growable: false),
      supplierPayments: _rows(supplierPayments).map((row) {
        final project = _first(row['project']);
        final supplier = _first(row['supplier']);
        final po = _first(row['purchase_order']);
        return {
          ...row,
          'project': project,
          'supplier': supplier,
          'purchase_order': po,
          'amount': _number(row['amount']),
        };
      }).toList(growable: false),
      payableOrders: payable,
      obligations: _rows(obligations).map((row) => {
        ...row,
        'employee': _first(row['employee']),
        'subcontractor': _first(row['subcontractor']),
        'project': _first(row['project']),
        'amount': _number(row['amount']),
        'paid_amount': _number(row['paid_amount']),
      }).toList(growable: false),
      projectSummaries: projectSummaries,
      recapDocuments: _rows(recaps).map((row) {
        final snapshot = row['snapshot'];
        return {
          ...row,
          'snapshot': snapshot is Map ? Map<String, dynamic>.from(snapshot) : <String, dynamic>{},
        };
      }).toList(growable: false),
    );
  }

  Future<String> recordCash({
    required String transactionDate,
    required String direction,
    required String category,
    required String? projectId,
    required String description,
    required double amount,
    required String paymentMethod,
    required String? referenceNumber,
  }) async {
    final data = await _client.rpc('record_company_cash_transaction', params: {
      'p_transaction_date': transactionDate,
      'p_direction': direction,
      'p_category': category,
      'p_project_id': _clean(projectId),
      'p_description': description.trim(),
      'p_amount': amount,
      'p_payment_method': paymentMethod,
      'p_reference_number': _clean(referenceNumber),
    });
    if (data is! String || data.isEmpty) throw StateError('Database tidak mengembalikan ID transaksi kas.');
    return data;
  }

  Future<void> voidCash(String transactionId, String reason) async {
    await _client.rpc('void_company_cash_transaction', params: {
      'p_transaction_id': transactionId,
      'p_reason': reason.trim(),
    });
  }

  Future<String> recordSupplierPayment({
    required String purchaseOrderId,
    required String paymentDate,
    required double amount,
    required String paymentMethod,
    required String? referenceNumber,
    required String? notes,
  }) async {
    final data = await _client.rpc('record_project_supplier_payment', params: {
      'p_purchase_order_id': purchaseOrderId,
      'p_payment_date': paymentDate,
      'p_amount': amount,
      'p_payment_method': paymentMethod,
      'p_reference_number': _clean(referenceNumber),
      'p_notes': _clean(notes),
    });
    if (data is! String || data.isEmpty) throw StateError('Database tidak mengembalikan ID pembayaran supplier.');
    return data;
  }

  Future<void> voidSupplierPayment(String paymentId, String reason) async {
    await _client.rpc('void_project_supplier_payment', params: {
      'p_payment_id': paymentId,
      'p_reason': reason.trim(),
    });
  }

  Future<void> recordObligationPayment({
    required String obligationId,
    required String paymentDate,
    required String paymentMethod,
    required String? referenceNumber,
    required String? notes,
    required double amount,
  }) async {
    await _client.rpc('dahlia_record_payment_transaction', params: {
      'p_payment_date': paymentDate,
      'p_payment_method': paymentMethod,
      'p_reference_number': _clean(referenceNumber),
      'p_notes': _clean(notes),
      'p_allocations': [
        {'obligation_id': obligationId, 'amount': amount}
      ],
    });
  }

  Future<List<Map<String, dynamic>>> listRecapProjects() async {
    return _rows(await _client.from('projects')
        .select('id, title, client, total_value')
        .eq('status', 'DIKERJAKAN')
        .order('title', ascending: true));
  }

  Future<List<Map<String, dynamic>>> listRecapDivisions(String projectId) async {
    return _rows(await _client.from('rab_divisions')
        .select('id, project_id, code, name, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', ascending: true));
  }

  Future<Map<String, dynamic>> createRecap({
    required String scopeType,
    required String? projectId,
    required String? divisionId,
    required String periodStart,
    required String periodEnd,
    required String reportTitle,
  }) async {
    final data = await _client.rpc('create_finance_recap_document', params: {
      'p_scope_type': scopeType,
      'p_project_id': projectId,
      'p_rab_division_id': divisionId,
      'p_period_start': periodStart,
      'p_period_end': periodEnd,
      'p_report_title': reportTitle.trim().isEmpty ? null : reportTitle.trim(),
    });
    if (data is! Map || data['recap_number'] == null) {
      throw StateError('Database tidak mengembalikan dokumen rekap keuangan.');
    }
    return Map<String, dynamic>.from(data);
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

class FinanceWorkspace {
  const FinanceWorkspace({
    required this.projects,
    required this.cashTransactions,
    required this.supplierPayments,
    required this.payableOrders,
    required this.obligations,
    required this.projectSummaries,
    required this.recapDocuments,
  });

  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> cashTransactions;
  final List<Map<String, dynamic>> supplierPayments;
  final List<Map<String, dynamic>> payableOrders;
  final List<Map<String, dynamic>> obligations;
  final List<Map<String, dynamic>> projectSummaries;
  final List<Map<String, dynamic>> recapDocuments;
}
