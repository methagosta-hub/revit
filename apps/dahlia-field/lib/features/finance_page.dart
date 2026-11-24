import 'package:flutter/material.dart';

import '../data/dahlia_access.dart';
import '../data/finance_repository.dart';
import '../services/document_pdf_service.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({required this.repository, required this.access, super.key});

  final FinanceRepository repository;
  final DahliaAccess access;

  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> {
  late Future<FinanceWorkspace> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.loadWorkspace();
  }

  Future<void> _reload() async {
    final next = widget.repository.loadWorkspace();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Pusat Keuangan', style: TextStyle(fontWeight: FontWeight.w800)),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(icon: Icon(Icons.dashboard_outlined), text: 'Ringkasan'),
              Tab(icon: Icon(Icons.account_balance_wallet_outlined), text: 'Kas'),
              Tab(icon: Icon(Icons.payments_outlined), text: 'Supplier'),
              Tab(icon: Icon(Icons.pending_actions_outlined), text: 'Kewajiban'),
              Tab(icon: Icon(Icons.receipt_long_outlined), text: 'Rekap'),
            ],
          ),
        ),
        body: FutureBuilder<FinanceWorkspace>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return _FinanceError(message: snapshot.error.toString(), onRetry: _reload);
            }
            final data = snapshot.data!;
            return TabBarView(
              children: [
                _FinanceSummaryTab(data: data, onRefresh: _reload),
                _CashTab(
                  data: data,
                  canManage: widget.access.canManagePayments,
                  onRefresh: _reload,
                  onCreate: _createCash,
                  onVoid: _voidCash,
                ),
                _SupplierTab(
                  data: data,
                  canManage: widget.access.canManagePayments,
                  onRefresh: _reload,
                  onPay: _paySupplier,
                  onVoid: _voidSupplier,
                ),
                _ObligationsTab(
                  data: data,
                  canManage: widget.access.canManagePayments,
                  onRefresh: _reload,
                  onPay: _payObligation,
                ),
                _RecapTab(
                  data: data,
                  canManage: widget.access.canReadFinance,
                  onRefresh: _reload,
                  onCreate: _createRecap,
                  onPdf: _shareRecap,
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _createCash() async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _CashTransactionDialog(repository: widget.repository),
    );
    if (saved == true && mounted) {
      await _reload();
      _message('Transaksi kas berhasil dicatat.');
    }
  }

  Future<void> _paySupplier(Map<String, dynamic> order) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _SupplierPaymentDialog(repository: widget.repository, order: order),
    );
    if (saved == true && mounted) {
      await _reload();
      _message('Pembayaran supplier berhasil dicatat.');
    }
  }

  Future<void> _payObligation(Map<String, dynamic> obligation) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _ObligationPaymentDialog(repository: widget.repository, obligation: obligation),
    );
    if (saved == true && mounted) {
      await _reload();
      _message('Pembayaran kewajiban berhasil dicatat. Mutasi kas keluar dibuat oleh sistem.');
    }
  }

  Future<void> _createRecap() async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _FinanceRecapDialog(repository: widget.repository),
    );
    if (saved == true && mounted) {
      await _reload();
      _message('Snapshot rekap keuangan berhasil disimpan.');
    }
  }

  Future<void> _voidCash(Map<String, dynamic> row) async {
    final reason = await _askReason('Batalkan transaksi kas', 'Alasan pembatalan wajib diisi.');
    if (reason == null || !mounted) return;
    try {
      await widget.repository.voidCash(row['id'].toString(), reason);
      await _reload();
      _message('Transaksi kas ditandai dibatalkan.');
    } catch (error) {
      if (mounted) _message('Gagal membatalkan: ' + error.toString());
    }
  }

  Future<void> _voidSupplier(Map<String, dynamic> row) async {
    final reason = await _askReason('Batalkan pembayaran supplier', 'Pembatalan harus disertai alasan.');
    if (reason == null || !mounted) return;
    try {
      await widget.repository.voidSupplierPayment(row['id'].toString(), reason);
      await _reload();
      _message('Pembayaran supplier dibatalkan.');
    } catch (error) {
      if (mounted) _message('Gagal membatalkan: ' + error.toString());
    }
  }

  Future<void> _shareRecap(Map<String, dynamic> row) async {
    try {
      await DahliaDocumentPdf.shareFinanceRecap(row);
    } catch (error) {
      if (mounted) _message('PDF rekap gagal dibuat: ' + error.toString());
    }
  }

  Future<String?> _askReason(String title, String hint) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(hint, style: const TextStyle(fontSize: 12, color: Color(0xFF66766F))),
            const SizedBox(height: 12),
            TextField(controller: controller, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Alasan')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Kembali')),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isEmpty) return;
              Navigator.pop(dialogContext, controller.text.trim());
            },
            child: const Text('Konfirmasi'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }
}

class _FinanceSummaryTab extends StatelessWidget {
  const _FinanceSummaryTab({required this.data, required this.onRefresh});
  final FinanceWorkspace data;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final paidCash = data.cashTransactions.where((row) => row['status'] == 'confirmed').toList();
    final cashIn = paidCash.where((row) => row['direction'] == 'in').fold<double>(0, (sum, row) => sum + _number(row['amount']));
    final cashOut = paidCash.where((row) => row['direction'] == 'out').fold<double>(0, (sum, row) => sum + _number(row['amount']));
    final commitment = data.projectSummaries.fold<double>(0, (sum, row) => sum + _number(row['committed_po']));
    final paidSupplier = data.projectSummaries.fold<double>(0, (sum, row) => sum + _number(row['paid_supplier']));
    final openObligations = data.obligations.fold<double>(0, (sum, row) => sum + _outstanding(row));
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(19),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(21),
              gradient: const LinearGradient(
                colors: [Color(0xFF173F38), Color(0xFF287567)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.account_balance_rounded, color: Color(0xFFC8E5D9), size: 27),
                SizedBox(height: 12),
                Text('Pusat Kendali Keuangan', style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
                SizedBox(height: 5),
                Text('Pantau arus kas, komitmen pembelian, pembayaran supplier, dan kewajiban yang harus diselesaikan.',
                    style: TextStyle(color: Color(0xFFE5F2EC), fontSize: 11, height: 1.4)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            childAspectRatio: 1.48,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            children: [
              _FinanceMetric(label: 'Kas masuk', value: _money(cashIn), icon: Icons.south_west_rounded, color: const Color(0xFF23835F)),
              _FinanceMetric(label: 'Kas keluar', value: _money(cashOut), icon: Icons.north_east_rounded, color: const Color(0xFFB45C50)),
              _FinanceMetric(label: 'Komitmen PO', value: _money(commitment), icon: Icons.receipt_long_outlined, color: const Color(0xFF3979A2)),
              _FinanceMetric(label: 'Kewajiban terbuka', value: _money(openObligations), icon: Icons.pending_actions_outlined, color: const Color(0xFF9B7335)),
            ],
          ),
          const SizedBox(height: 16),
          _SectionLabel(title: 'Komitmen dan realisasi supplier'),
          _FinanceMetricRow(label: 'Total PO disetujui / berjalan', value: _money(commitment)),
          _FinanceMetricRow(label: 'Pembayaran supplier tercatat', value: _money(paidSupplier)),
          _FinanceMetricRow(label: 'Sisa komitmen', value: _money((commitment - paidSupplier).clamp(0, double.infinity))),
          const SizedBox(height: 16),
          _SectionLabel(title: 'Ringkasan keuangan per proyek'),
          if (data.projectSummaries.isEmpty)
            const _FinanceEmpty(message: 'Belum ada ringkasan proyek yang dapat ditampilkan.')
          else
            ...data.projectSummaries.map((row) => Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(row['project_name']?.toString() ?? 'Proyek', style: const TextStyle(fontWeight: FontWeight.w900)),
                  if ((row['client']?.toString() ?? '').isNotEmpty)
                    Text(row['client'].toString(), style: const TextStyle(fontSize: 11, color: Color(0xFF6B7A74))),
                  const Divider(height: 18),
                  _FinanceMetricRow(label: 'Nilai proyek', value: _money(row['project_value'])),
                  _FinanceMetricRow(label: 'Komitmen PO', value: _money(row['committed_po'])),
                  _FinanceMetricRow(label: 'Pembayaran supplier', value: _money(row['paid_supplier'])),
                  _FinanceMetricRow(label: 'Kas masuk / keluar', value: _money(row['cash_in']) + ' / ' + _money(row['cash_out'])),
                ]),
              ),
            )),
          const SizedBox(height: 18),
          _SectionLabel(title: 'Kewajiban yang perlu dipantau'),
          ...data.obligations.take(5).map((row) => _ObligationCard(row: row, canManage: false, onPay: null)),
        ],
      ),
    );
  }
}

class _CashTab extends StatelessWidget {
  const _CashTab({
    required this.data,
    required this.canManage,
    required this.onRefresh,
    required this.onCreate,
    required this.onVoid,
  });
  final FinanceWorkspace data;
  final bool canManage;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onCreate;
  final Future<void> Function(Map<String, dynamic>) onVoid;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [
          const Expanded(child: _SectionLabel(title: 'Buku kas perusahaan')),
          if (canManage) FilledButton.icon(onPressed: onCreate, icon: const Icon(Icons.add, size: 18), label: const Text('Catat')),
        ]),
        const _HintBoxFinance(text: 'Kas masuk dan keluar dicatat melalui transaksi resmi. Pembayaran kewajiban payroll atau subkontraktor dibuat oleh sistem saat pembayaran dicatat, jadi jangan input ulang sebagai kas manual.'),
        const SizedBox(height: 10),
        if (data.cashTransactions.isEmpty)
          const _FinanceEmpty(message: 'Belum ada transaksi kas.')
        else
          ...data.cashTransactions.map((row) {
            final incoming = row['direction'] == 'in';
            final confirmed = row['status'] == 'confirmed';
            final project = _first(row['project']);
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(13),
                child: Row(children: [
                  _FinanceIcon(icon: incoming ? Icons.south_west_rounded : Icons.north_east_rounded,
                      color: incoming ? const Color(0xFF23835F) : const Color(0xFFB45C50)),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(row['transaction_number']?.toString() ?? 'Transaksi kas', style: const TextStyle(fontWeight: FontWeight.w900)),
                    Text(row['description']?.toString() ?? '-', style: const TextStyle(fontSize: 12)),
                    Text((project?['title']?.toString() ?? 'Umum') + ' · ' +
                        (row['transaction_date']?.toString() ?? '-') + ' · ' +
                        (row['category']?.toString() ?? '-'),
                        style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
                    Text(confirmed ? 'Terkonfirmasi' : 'Dibatalkan',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: confirmed ? const Color(0xFF23835F) : const Color(0xFFB45C50))),
                  ])),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text((incoming ? '+' : '-') + _money(row['amount']), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: incoming ? const Color(0xFF23835F) : const Color(0xFFB45C50))),
                    if (canManage && confirmed)
                      IconButton(tooltip: 'Batalkan transaksi', onPressed: () => onVoid(row), icon: const Icon(Icons.block_outlined, size: 19)),
                  ]),
                ]),
              ),
            );
          }),
      ],
    ),
  );
}

class _SupplierTab extends StatelessWidget {
  const _SupplierTab({
    required this.data,
    required this.canManage,
    required this.onRefresh,
    required this.onPay,
    required this.onVoid,
  });
  final FinanceWorkspace data;
  final bool canManage;
  final Future<void> Function(Map<String, dynamic>) onPay;
  final Future<void> Function(Map<String, dynamic>) onVoid;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionLabel(title: 'PO yang masih harus dibayar'),
        if (data.payableOrders.isEmpty)
          const _FinanceEmpty(message: 'Tidak ada sisa pembayaran PO untuk proyek aktif.')
        else
          ...data.payableOrders.map((row) {
            final project = _first(row['project']);
            final supplier = _first(row['supplier']);
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(row['po_number']?.toString() ?? 'PO', style: const TextStyle(fontWeight: FontWeight.w900)),
                  Text((project?['title']?.toString() ?? 'Proyek') + ' · ' + (supplier?['name']?.toString() ?? 'Supplier'),
                      style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
                  const Divider(height: 18),
                  _FinanceMetricRow(label: 'Nilai PO', value: _money(row['subtotal'])),
                  _FinanceMetricRow(label: 'Sudah dibayar', value: _money(row['paid_total'])),
                  _FinanceMetricRow(label: 'Sisa pembayaran', value: _money(row['remaining']), emphasize: true),
                  if (canManage) ...[
                    const SizedBox(height: 9),
                    FilledButton.icon(
                      onPressed: () => onPay(row),
                      icon: const Icon(Icons.payments_outlined),
                      label: const Text('Catat pembayaran supplier'),
                    ),
                  ],
                ]),
              ),
            );
          }),
        const SizedBox(height: 16),
        const _SectionLabel(title: 'Riwayat pembayaran supplier'),
        if (data.supplierPayments.isEmpty)
          const _FinanceEmpty(message: 'Belum ada pembayaran supplier yang tercatat.')
        else
          ...data.supplierPayments.map((row) {
            final project = _first(row['project']);
            final supplier = _first(row['supplier']);
            final po = _first(row['purchase_order']);
            final paid = row['status'] == 'paid';
            return Card(
              child: ListTile(
                leading: _FinanceIcon(icon: Icons.receipt_long_outlined, color: paid ? const Color(0xFF23835F) : const Color(0xFFB45C50)),
                title: Text(row['payment_number']?.toString() ?? 'Pembayaran', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text((project?['title']?.toString() ?? 'Proyek') + ' · ' +
                    (supplier?['name']?.toString() ?? 'Supplier') + ' · PO ' +
                    (po?['po_number']?.toString() ?? '-') + '\n' +
                    (row['payment_date']?.toString() ?? '-') + ' · ' +
                    (paid ? 'Lunas / tercatat' : 'Dibatalkan'),
                    style: const TextStyle(fontSize: 11)),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(_money(row['amount']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                    if (canManage && paid)
                      IconButton(tooltip: 'Batalkan pembayaran', onPressed: () => onVoid(row), icon: const Icon(Icons.block_outlined, size: 18)),
                  ],
                ),
              ),
            );
          }),
      ],
    ),
  );
}

class _ObligationsTab extends StatelessWidget {
  const _ObligationsTab({
    required this.data,
    required this.canManage,
    required this.onRefresh,
    required this.onPay,
  });
  final FinanceWorkspace data;
  final bool canManage;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Map<String, dynamic>) onPay;

  @override
  Widget build(BuildContext context) {
    final rows = data.obligations.where((row) => _outstanding(row) > 0.000001).toList();
    final overdue = rows.where((row) {
      final due = row['due_date']?.toString();
      return due != null && due.isNotEmpty && due.substring(0, 10).compareTo(_today()) < 0;
    }).length;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _FinanceMetric(
            label: 'Kewajiban belum lunas',
            value: _money(rows.fold<double>(0, (sum, row) => sum + _outstanding(row))),
            icon: Icons.pending_actions_rounded,
            color: const Color(0xFF9B7335),
          ),
          const SizedBox(height: 8),
          _HintBoxFinance(text: rows.length.toString() + ' kewajiban terbuka · ' + overdue.toString() +
              ' sudah melewati tanggal jatuh tempo. Pembayaran akan memakai RPC resmi dan mutasi kas keluar dibuat otomatis oleh backend.'),
          const SizedBox(height: 12),
          if (rows.isEmpty)
            const _FinanceEmpty(message: 'Tidak ada kewajiban pembayaran yang masih terbuka.')
          else
            ...rows.map((row) => _ObligationCard(
              row: row,
              canManage: canManage,
              onPay: canManage ? () => onPay(row) : null,
            )),
        ],
      ),
    );
  }
}

class _ObligationCard extends StatelessWidget {
  const _ObligationCard({required this.row, required this.canManage, required this.onPay});
  final Map<String, dynamic> row;
  final bool canManage;
  final VoidCallback? onPay;

  @override
  Widget build(BuildContext context) {
    final employee = _first(row['employee']);
    final subcontractor = _first(row['subcontractor']);
    final project = _first(row['project']);
    final payee = row['payee_type'] == 'employee'
        ? (employee?['full_name']?.toString() ?? employee?['employee_number']?.toString() ?? 'Karyawan')
        : (subcontractor?['legal_name']?.toString() ?? 'Subkontraktor');
    final outstanding = _outstanding(row);
    final due = row['due_date']?.toString();
    final late = due != null && due.isNotEmpty && due.substring(0, 10).compareTo(_today()) < 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(row['obligation_number']?.toString() ?? 'Kewajiban', style: const TextStyle(fontWeight: FontWeight.w900))),
            _FinanceStatus(label: late ? 'Terlambat' : (due == null ? 'Belum terjadwal' : 'Terbuka'), warning: late),
          ]),
          const SizedBox(height: 4),
          Text(payee + ' · ' + (project?['title']?.toString() ?? 'Umum'), style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
          Text(row['description']?.toString() ?? '-', style: const TextStyle(fontSize: 12)),
          const Divider(height: 18),
          _FinanceMetricRow(label: 'Nilai kewajiban', value: _money(row['amount'])),
          _FinanceMetricRow(label: 'Sudah dibayar', value: _money(row['paid_amount'])),
          _FinanceMetricRow(label: 'Sisa pembayaran', value: _money(outstanding), emphasize: true),
          _FinanceMetricRow(label: 'Jatuh tempo', value: due == null ? 'Belum dijadwalkan' : due.substring(0, 10)),
          if (onPay != null) ...[
            const SizedBox(height: 8),
            FilledButton.icon(onPressed: onPay, icon: const Icon(Icons.payments_outlined), label: const Text('Bayar kewajiban')),
          ],
        ]),
      ),
    );
  }
}

class _RecapTab extends StatelessWidget {
  const _RecapTab({
    required this.data,
    required this.canManage,
    required this.onRefresh,
    required this.onCreate,
    required this.onPdf,
  });
  final FinanceWorkspace data;
  final bool canManage;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onCreate;
  final Future<void> Function(Map<String, dynamic>) onPdf;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [
          const Expanded(child: _SectionLabel(title: 'Arsip rekap keuangan')),
          if (canManage) FilledButton.icon(onPressed: onCreate, icon: const Icon(Icons.add, size: 18), label: const Text('Buat rekap')),
        ]),
        const _HintBoxFinance(text: 'Rekap disimpan sebagai snapshot resmi agar angka dan rincian laporan tidak berubah ketika transaksi berikutnya masuk. PDF dapat dibagikan dari perangkat.'),
        const SizedBox(height: 10),
        if (data.recapDocuments.isEmpty)
          const _FinanceEmpty(message: 'Belum ada dokumen rekap keuangan.')
        else
          ...data.recapDocuments.map((row) {
            final snapshot = _first(row['snapshot']) ?? <String, dynamic>{};
            final summary = _first(snapshot['summary']) ?? <String, dynamic>{};
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  const _FinanceIcon(icon: Icons.description_outlined, color: Color(0xFF3979A2)),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(row['recap_number']?.toString() ?? 'Rekap', style: const TextStyle(fontWeight: FontWeight.w900)),
                    Text(row['report_title']?.toString() ?? snapshot['report_title']?.toString() ?? 'Rekap keuangan',
                        style: const TextStyle(fontSize: 12)),
                    Text((row['period_start']?.toString() ?? '-') + ' s.d. ' +
                        (row['period_end']?.toString() ?? '-') + ' · ' + (row['status']?.toString() ?? '-'),
                        style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
                    Text('Kas masuk ' + _money(summary['cash_in']) + ' · kas keluar ' + _money(summary['cash_out']),
                        style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
                  ])),
                  IconButton(
                    tooltip: 'Bagikan PDF',
                    onPressed: () => onPdf(row),
                    icon: const Icon(Icons.picture_as_pdf_outlined, color: Color(0xFFB64E42)),
                  ),
                ]),
              ),
            );
          }),
      ],
    ),
  );
}

class _CashTransactionDialog extends StatefulWidget {
  const _CashTransactionDialog({required this.repository});
  final FinanceRepository repository;

  @override
  State<_CashTransactionDialog> createState() => _CashTransactionDialogState();
}

class _CashTransactionDialogState extends State<_CashTransactionDialog> {
  final _formKey = GlobalKey<FormState>();
  final _category = TextEditingController(text: 'Operasional');
  final _description = TextEditingController();
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  List<Map<String, dynamic>> _projects = [];
  String _direction = 'out';
  String _method = 'bank_transfer';
  String? _projectId;
  String _date = _today();
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repository.listRecapProjects().then((rows) {
      if (!mounted) return;
      setState(() { _projects = rows; _loading = false; });
    }).catchError((Object error) {
      if (mounted) setState(() { _loading = false; _error = error.toString(); });
    });
  }

  @override
  void dispose() {
    _category.dispose(); _description.dispose(); _amount.dispose(); _reference.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.recordCash(
        transactionDate: _date,
        direction: _direction,
        category: _category.text,
        projectId: _projectId,
        description: _description.text,
        amount: double.parse(_amount.text.replaceAll(',', '.')),
        paymentMethod: _method,
        referenceNumber: _reference.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Catat transaksi kas'),
    content: SizedBox(
      width: 460,
      child: _loading
          ? const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  if (_error != null) _DialogError(message: _error!),
                  DropdownButtonFormField<String>(
                    value: _direction,
                    decoration: const InputDecoration(labelText: 'Arah transaksi'),
                    items: const [
                      DropdownMenuItem(value: 'in', child: Text('Kas masuk')),
                      DropdownMenuItem(value: 'out', child: Text('Kas keluar')),
                    ],
                    onChanged: (value) => setState(() => _direction = value ?? 'out'),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(controller: _category, decoration: const InputDecoration(labelText: 'Kategori'), validator: _required),
                  const SizedBox(height: 8),
                  TextFormField(controller: _description, decoration: const InputDecoration(labelText: 'Uraian transaksi'), minLines: 2, maxLines: 3, validator: _required),
                  const SizedBox(height: 8),
                  TextFormField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Jumlah (Rp)'), validator: (value) {
                    final n = double.tryParse((value ?? '').replaceAll(',', '.'));
                    return n == null || n <= 0 ? 'Jumlah harus lebih dari nol.' : null;
                  }),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _projectId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Proyek (opsional)'),
                    items: [
                      const DropdownMenuItem<String>(value: null, child: Text('Umum / perusahaan')),
                      ..._projects.map((row) => DropdownMenuItem<String>(value: row['id'].toString(), child: Text(row['title']?.toString() ?? 'Proyek', overflow: TextOverflow.ellipsis))),
                    ],
                    onChanged: (value) => setState(() => _projectId = value),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _method,
                    decoration: const InputDecoration(labelText: 'Metode pembayaran'),
                    items: const [
                      DropdownMenuItem(value: 'cash', child: Text('Tunai')),
                      DropdownMenuItem(value: 'bank_transfer', child: Text('Transfer bank')),
                      DropdownMenuItem(value: 'other', child: Text('Lainnya')),
                    ],
                    onChanged: (value) => setState(() => _method = value ?? 'bank_transfer'),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(initialValue: _date, decoration: const InputDecoration(labelText: 'Tanggal (YYYY-MM-DD)'), onChanged: (value) => _date = value, validator: (value) => _validDate(value) ? null : 'Gunakan format YYYY-MM-DD.'),
                  const SizedBox(height: 8),
                  TextFormField(controller: _reference, decoration: const InputDecoration(labelText: 'Nomor referensi (opsional)')),
                ]),
              ),
            ),
    ),
    actions: [
      TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: const Text('Batal')),
      FilledButton(onPressed: _loading || _saving ? null : _save, child: Text(_saving ? 'Menyimpan...' : 'Simpan')),
    ],
  );
}

class _SupplierPaymentDialog extends StatefulWidget {
  const _SupplierPaymentDialog({required this.repository, required this.order});
  final FinanceRepository repository;
  final Map<String, dynamic> order;

  @override
  State<_SupplierPaymentDialog> createState() => _SupplierPaymentDialogState();
}

class _SupplierPaymentDialogState extends State<_SupplierPaymentDialog> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  String _date = _today();
  String _method = 'bank_transfer';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amount.text = _number(widget.order['remaining']).toStringAsFixed(0);
  }

  @override
  void dispose() { _amount.dispose(); _reference.dispose(); _notes.dispose(); super.dispose(); }

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.replaceAll(',', '.'));
    final remaining = _number(widget.order['remaining']);
    if (!_validDate(_date) || amount == null || amount <= 0 || amount > remaining + 0.000001) {
      setState(() => _error = 'Tanggal atau jumlah pembayaran tidak valid. Maksimal sisa PO ' + _money(remaining) + '.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.recordSupplierPayment(
        purchaseOrderId: widget.order['id'].toString(),
        paymentDate: _date,
        amount: amount,
        paymentMethod: _method,
        referenceNumber: _reference.text,
        notes: _notes.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final supplier = _first(widget.order['supplier']);
    return AlertDialog(
      title: const Text('Pembayaran supplier'),
      content: SingleChildScrollView(child: SizedBox(width: 440, child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text((widget.order['po_number']?.toString() ?? 'PO') + ' · ' + (supplier?['name']?.toString() ?? 'Supplier')),
        const SizedBox(height: 8),
        Text('Sisa yang dapat dibayar: ' + _money(widget.order['remaining']), style: const TextStyle(fontWeight: FontWeight.w800)),
        if (_error != null) _DialogError(message: _error!),
        TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Jumlah pembayaran (Rp)')),
        TextFormField(initialValue: _date, decoration: const InputDecoration(labelText: 'Tanggal (YYYY-MM-DD)'), onChanged: (v) => _date = v),
        DropdownButtonFormField<String>(
          value: _method, decoration: const InputDecoration(labelText: 'Metode'),
          items: const [
            DropdownMenuItem(value: 'cash', child: Text('Tunai')),
            DropdownMenuItem(value: 'bank_transfer', child: Text('Transfer bank')),
            DropdownMenuItem(value: 'other', child: Text('Lainnya')),
          ],
          onChanged: (v) => setState(() => _method = v ?? 'bank_transfer'),
        ),
        TextField(controller: _reference, decoration: const InputDecoration(labelText: 'Nomor referensi')),
        TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Catatan')),
      ]))),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Menyimpan...' : 'Simpan pembayaran')),
      ],
    );
  }
}

class _ObligationPaymentDialog extends StatefulWidget {
  const _ObligationPaymentDialog({required this.repository, required this.obligation});
  final FinanceRepository repository;
  final Map<String, dynamic> obligation;

  @override
  State<_ObligationPaymentDialog> createState() => _ObligationPaymentDialogState();
}

class _ObligationPaymentDialogState extends State<_ObligationPaymentDialog> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  String _date = _today();
  String _method = 'bank_transfer';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amount.text = _outstanding(widget.obligation).toStringAsFixed(0);
  }

  @override
  void dispose() { _amount.dispose(); _reference.dispose(); _notes.dispose(); super.dispose(); }

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.replaceAll(',', '.'));
    final balance = _outstanding(widget.obligation);
    if (!_validDate(_date) || amount == null || amount <= 0 || amount > balance + 0.000001) {
      setState(() => _error = 'Jumlah pembayaran tidak valid. Maksimal sisa kewajiban ' + _money(balance) + '.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.recordObligationPayment(
        obligationId: widget.obligation['id'].toString(),
        paymentDate: _date,
        paymentMethod: _method,
        referenceNumber: _reference.text,
        notes: _notes.text,
        amount: amount,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Bayar kewajiban'),
    content: SingleChildScrollView(child: SizedBox(width: 440, child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text(widget.obligation['obligation_number']?.toString() ?? 'Kewajiban'),
      const SizedBox(height: 6),
      Text('Sisa kewajiban: ' + _money(_outstanding(widget.obligation)), style: const TextStyle(fontWeight: FontWeight.w800)),
      if (_error != null) _DialogError(message: _error!),
      TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Jumlah pembayaran (Rp)')),
      TextFormField(initialValue: _date, decoration: const InputDecoration(labelText: 'Tanggal (YYYY-MM-DD)'), onChanged: (v) => _date = v),
      DropdownButtonFormField<String>(
        value: _method, decoration: const InputDecoration(labelText: 'Metode'),
        items: const [
          DropdownMenuItem(value: 'cash', child: Text('Tunai')),
          DropdownMenuItem(value: 'bank_transfer', child: Text('Transfer bank')),
          DropdownMenuItem(value: 'other', child: Text('Lainnya')),
        ],
        onChanged: (v) => setState(() => _method = v ?? 'bank_transfer'),
      ),
      TextField(controller: _reference, decoration: const InputDecoration(labelText: 'Nomor referensi')),
      TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Catatan')),
    ]))),
    actions: [
      TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: const Text('Batal')),
      FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Menyimpan...' : 'Simpan pembayaran')),
    ],
  );
}

class _FinanceRecapDialog extends StatefulWidget {
  const _FinanceRecapDialog({required this.repository});
  final FinanceRepository repository;

  @override
  State<_FinanceRecapDialog> createState() => _FinanceRecapDialogState();
}

class _FinanceRecapDialogState extends State<_FinanceRecapDialog> {
  final _title = TextEditingController(text: 'Rekap Keuangan');
  String _scope = 'company';
  String? _projectId;
  String? _divisionId;
  String _start = _firstDayOfMonth();
  String _end = _today();
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _divisions = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repository.listRecapProjects().then((rows) {
      if (!mounted) return;
      setState(() { _projects = rows; _loading = false; });
    }).catchError((Object error) {
      if (mounted) setState(() { _loading = false; _error = error.toString(); });
    });
  }

  @override
  void dispose() { _title.dispose(); super.dispose(); }

  Future<void> _setProject(String? value) async {
    setState(() { _projectId = value; _divisionId = null; _divisions = []; });
    if (value == null) return;
    try {
      final rows = await widget.repository.listRecapDivisions(value);
      if (mounted) setState(() => _divisions = rows);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _save() async {
    final needsProject = _scope == 'project' || _scope == 'division';
    if (!_validDate(_start) || !_validDate(_end) || _start.compareTo(_end) > 0 ||
        (needsProject && _projectId == null) || (_scope == 'division' && _divisionId == null)) {
      setState(() => _error = 'Periksa cakupan dan rentang tanggal rekap.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.createRecap(
        scopeType: _scope,
        projectId: needsProject ? _projectId : null,
        divisionId: _scope == 'division' ? _divisionId : null,
        periodStart: _start,
        periodEnd: _end,
        reportTitle: _title.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Buat snapshot rekap'),
    content: SizedBox(
      width: 460,
      child: _loading
          ? const Padding(padding: EdgeInsets.all(28), child: Center(child: CircularProgressIndicator()))
          : SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (_error != null) _DialogError(message: _error!),
              TextField(controller: _title, decoration: const InputDecoration(labelText: 'Judul laporan')),
              DropdownButtonFormField<String>(
                value: _scope,
                decoration: const InputDecoration(labelText: 'Cakupan rekap'),
                items: const [
                  DropdownMenuItem(value: 'company', child: Text('Perusahaan')),
                  DropdownMenuItem(value: 'consolidated', child: Text('Konsolidasi')),
                  DropdownMenuItem(value: 'project', child: Text('Per proyek')),
                  DropdownMenuItem(value: 'division', child: Text('Per divisi RAB')),
                ],
                onChanged: (value) => setState(() { _scope = value ?? 'company'; _projectId = null; _divisionId = null; _divisions = []; }),
              ),
              if (_scope == 'project' || _scope == 'division')
                DropdownButtonFormField<String>(
                  value: _projectId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Proyek'),
                  items: _projects.map((row) => DropdownMenuItem(value: row['id'].toString(), child: Text(row['title']?.toString() ?? 'Proyek', overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: _setProject,
                ),
              if (_scope == 'division')
                DropdownButtonFormField<String>(
                  value: _divisionId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Divisi RAB'),
                  items: _divisions.map((row) => DropdownMenuItem(value: row['id'].toString(), child: Text(row['name']?.toString() ?? 'Divisi', overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (value) => setState(() => _divisionId = value),
                ),
              TextFormField(initialValue: _start, decoration: const InputDecoration(labelText: 'Awal periode (YYYY-MM-DD)'), onChanged: (value) => _start = value),
              TextFormField(initialValue: _end, decoration: const InputDecoration(labelText: 'Akhir periode (YYYY-MM-DD)'), onChanged: (value) => _end = value),
            ])),
    ),
    actions: [
      TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: const Text('Batal')),
      FilledButton(onPressed: _loading || _saving ? null : _save, child: Text(_saving ? 'Membuat...' : 'Buat rekap')),
    ],
  );
}

class _FinanceMetric extends StatelessWidget {
  const _FinanceMetric({required this.label, required this.value, required this.icon, required this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _FinanceIcon(icon: icon, color: color),
          const Spacer(),
        ]),
        const SizedBox(height: 10),
        Text(value, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
        const SizedBox(height: 3),
        Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
      ]),
    ),
  );
}

class _FinanceMetricRow extends StatelessWidget {
  const _FinanceMetricRow({required this.label, required this.value, this.emphasize = false});
  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(children: [
      Expanded(child: Text(label, style: TextStyle(fontSize: 11, color: emphasize ? const Color(0xFF244C45) : const Color(0xFF687970), fontWeight: emphasize ? FontWeight.w800 : FontWeight.normal))),
      Text(value, style: TextStyle(fontSize: 11, fontWeight: emphasize ? FontWeight.w900 : FontWeight.w700)),
    ]),
  );
}

class _FinanceIcon extends StatelessWidget {
  const _FinanceIcon({required this.icon, required this.color});
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: 40, height: 40,
    decoration: BoxDecoration(color: color.withValues(alpha: 0.11), borderRadius: BorderRadius.circular(13)),
    child: Icon(icon, color: color, size: 21),
  );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
  );
}

class _FinanceStatus extends StatelessWidget {
  const _FinanceStatus({required this.label, required this.warning});
  final String label;
  final bool warning;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(color: warning ? const Color(0xFFFFEDEC) : const Color(0xFFEAF2EF), borderRadius: BorderRadius.circular(30)),
    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      child: Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: warning ? const Color(0xFFB64E42) : const Color(0xFF285F52)))),
  );
}

class _HintBoxFinance extends StatelessWidget {
  const _HintBoxFinance({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFF0F5F2), borderRadius: BorderRadius.circular(12)),
    child: Text(text, style: const TextStyle(fontSize: 11, color: Color(0xFF53665D), height: 1.45)),
  );
}

class _DialogError extends StatelessWidget {
  const _DialogError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(color: const Color(0xFFFFEEEE), borderRadius: BorderRadius.circular(10)),
    child: Text(message, style: const TextStyle(fontSize: 11, color: Color(0xFF9D3636))),
  );
}

class _FinanceEmpty extends StatelessWidget {
  const _FinanceEmpty({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(22),
    child: Column(children: [
      const Icon(Icons.receipt_long_outlined, size: 38, color: Color(0xFF87958F)),
      const SizedBox(height: 8),
      Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF687970))),
    ]),
  );
}

class _FinanceError extends StatelessWidget {
  const _FinanceError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off_outlined, size: 42, color: Color(0xFF9A6B2E)),
      const SizedBox(height: 10),
      const Text('Data keuangan belum dapat dimuat', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      const SizedBox(height: 8),
      Text(_friendlyError(message), textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF687970))),
      const SizedBox(height: 14),
      OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Coba lagi')),
    ]),
  ));
}

String? _required(String? value) => (value ?? '').trim().isEmpty ? 'Wajib diisi.' : null;

Map<String, dynamic>? _first(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty && value.first is Map) {
    return Map<String, dynamic>.from(value.first as Map);
  }
  return null;
}

double _number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

double _outstanding(Map<String, dynamic> row) =>
    (_number(row['amount']) - _number(row['paid_amount'])).clamp(0, double.infinity).toDouble();

String _money(dynamic value) {
  final number = _number(value).round().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < number.length; i++) {
    buffer.write(number[i]);
    final remaining = number.length - i - 1;
    if (remaining > 0 && remaining % 3 == 0) buffer.write('.');
  }
  return 'Rp ' + buffer.toString();
}

String _today() {
  final now = DateTime.now().toLocal();
  return now.year.toString().padLeft(4, '0') + '-' +
      now.month.toString().padLeft(2, '0') + '-' +
      now.day.toString().padLeft(2, '0');
}

String _firstDayOfMonth() => _today().substring(0, 8) + '01';

bool _validDate(String? value) {
  if (value == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return false;
  return DateTime.tryParse(value) != null;
}

String _friendlyError(Object error) {
  final raw = error.toString().replaceFirst('Exception: ', '').trim();
  if (raw.contains('42501') ||
      raw.toLowerCase().contains('permission denied') ||
      raw.toLowerCase().contains('row-level security')) {
    return 'Akun ini belum memiliki izin untuk membuka data keuangan. Periksa permission Finance.';
  }
  return raw.isEmpty ? 'Terjadi kesalahan. Periksa koneksi lalu coba kembali.' : raw;
}
