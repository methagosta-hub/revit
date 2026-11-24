import 'package:flutter/material.dart';

import '../data/dahlia_access.dart';
import '../data/warehouse_repository.dart';
import '../services/document_pdf_service.dart';

class WarehousePage extends StatefulWidget {
  const WarehousePage({required this.repository, required this.access, super.key});

  final WarehouseRepository repository;
  final DahliaAccess access;

  @override
  State<WarehousePage> createState() => _WarehousePageState();
}

class _WarehousePageState extends State<WarehousePage> {
  late Future<WarehouseWorkspace> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.loadWorkspace();
  }

  Future<void> _refresh() async {
    final next = widget.repository.loadWorkspace();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Operasional Gudang', style: TextStyle(fontWeight: FontWeight.w800)),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(icon: Icon(Icons.inventory_2_outlined), text: 'Stok'),
              Tab(icon: Icon(Icons.move_to_inbox_outlined), text: 'Penerimaan'),
              Tab(icon: Icon(Icons.outbox_outlined), text: 'Pengeluaran'),
              Tab(icon: Icon(Icons.receipt_long_outlined), text: 'Riwayat'),
            ],
          ),
        ),
        body: FutureBuilder<WarehouseWorkspace>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return _WarehouseError(message: snapshot.error.toString(), onRetry: _refresh);
            }
            final data = snapshot.data!;
            return TabBarView(
              children: [
                _StockTab(data: data, access: widget.access, onRefresh: _refresh),
                _ReceiptTab(
                  data: data,
                  allowed: widget.access.canReceiveMaterial,
                  onReceive: (order) async {
                    final saved = await Navigator.of(context).push<bool>(
                      MaterialPageRoute<bool>(
                        builder: (_) => ReceiveMaterialPage(
                          repository: widget.repository,
                          order: order,
                        ),
                      ),
                    );
                    if (saved == true && mounted) {
                      await _refresh();
                      _notice('Penerimaan material berhasil dicatat.');
                    }
                  },
                  onRefresh: _refresh,
                ),
                _IssueTab(
                  data: data,
                  allowed: widget.access.canIssueMaterial,
                  onIssue: () async {
                    final saved = await Navigator.of(context).push<bool>(
                      MaterialPageRoute<bool>(
                        builder: (_) => IssueMaterialPage(
                          repository: widget.repository,
                          data: data,
                        ),
                      ),
                    );
                    if (saved == true && mounted) {
                      await _refresh();
                      _notice('Pengeluaran material berhasil dicatat.');
                    }
                  },
                  onRefresh: _refresh,
                ),
                _HistoryTab(data: data, onRefresh: _refresh),
              ],
            );
          },
        ),
      ),
    );
  }

  void _notice(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _StockTab extends StatelessWidget {
  const _StockTab({required this.data, required this.access, required this.onRefresh});

  final WarehouseWorkspace data;
  final DahliaAccess access;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (!access.canManageWarehouse && !access.canReceiveMaterial && !access.canIssueMaterial) {
      return const _NoAccess(message: 'Akun ini belum memiliki izin untuk melihat persediaan gudang.');
    }
    final totalLines = data.stocks.length;
    final totalQty = data.stocks.fold<double>(0, (sum, row) => sum + _number(row['quantity_on_hand']));
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _WarehouseHero(
            title: 'Persediaan material',
            subtitle: 'Stok yang sudah diterima dan layak digunakan, dikelompokkan per proyek.',
            icon: Icons.inventory_2_rounded,
            color: const Color(0xFF246B62),
            value: totalLines.toString(),
            valueLabel: 'baris stok',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _MiniMetric(label: 'Jenis material', value: totalLines.toString(), icon: Icons.category_outlined)),
              const SizedBox(width: 10),
              Expanded(child: _MiniMetric(label: 'Jumlah kuantitas', value: _qty(totalQty), icon: Icons.scale_outlined)),
            ],
          ),
          const SizedBox(height: 12),
          if (data.stocks.isEmpty)
            const _EmptyWarehouse(title: 'Belum ada stok', message: 'Stok akan muncul setelah penerimaan material dikonfirmasi di sistem.')
          else
            ...data.stocks.map((row) => Card(
              child: ListTile(
                leading: const _IconTile(icon: Icons.widgets_outlined, color: Color(0xFF246B62)),
                title: Text(row['material_name']?.toString() ?? 'Material', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(
                  (row['project_title']?.toString() ?? 'Proyek') +
                  (row['material_code'] == null ? '' : ' · ' + row['material_code'].toString()),
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(_qty(row['quantity_on_hand']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    Text(row['unit']?.toString() ?? '-', style: const TextStyle(fontSize: 11, color: Color(0xFF6A7A73))),
                  ],
                ),
              ),
            )),
        ],
      ),
    );
  }
}

class _ReceiptTab extends StatelessWidget {
  const _ReceiptTab({
    required this.data,
    required this.allowed,
    required this.onReceive,
    required this.onRefresh,
  });

  final WarehouseWorkspace data;
  final bool allowed;
  final ValueChanged<Map<String, dynamic>> onReceive;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (!allowed) {
      return const _NoAccess(message: 'Akun ini belum memiliki permission warehouse.receive untuk mencatat penerimaan.');
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _WarehouseHero(
            title: 'Penerimaan material',
            subtitle: 'Pilih PO yang disetujui atau sudah dipesan. Kuantitas diterima dan rusak dicatat per item.',
            icon: Icons.move_to_inbox_rounded,
            color: const Color(0xFF2F7190),
            value: data.pendingOrders.length.toString(),
            valueLabel: 'PO menunggu',
          ),
          const SizedBox(height: 12),
          if (data.pendingOrders.isEmpty)
            const _EmptyWarehouse(title: 'Tidak ada PO menunggu penerimaan', message: 'PO berstatus disetujui, dipesan, atau diterima sebagian akan tampil di sini.')
          else
            ...data.pendingOrders.map((order) {
              final project = _first(order['project']);
              final supplier = _first(order['supplier']);
              final items = _rows(order['items']);
              final outstanding = items.fold<double>(0, (sum, row) => sum + _number(row['quantity_remaining']));
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(15),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const _IconTile(icon: Icons.local_shipping_outlined, color: Color(0xFF2F7190)),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(order['po_number']?.toString() ?? 'PO', style: const TextStyle(fontWeight: FontWeight.w900)),
                                Text(project?['title']?.toString() ?? 'Proyek', style: const TextStyle(fontSize: 12, color: Color(0xFF687970))),
                              ],
                            ),
                          ),
                          _StatusChip(label: _status(order['status']?.toString() ?? '')),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('Supplier: ' + (supplier?['name']?.toString() ?? 'Tidak diketahui'), style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 8),
                      ...items.map((item) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          children: [
                            Expanded(child: Text(item['material_name']?.toString() ?? 'Material', style: const TextStyle(fontSize: 12))),
                            Text('Sisa ' + _qty(item['quantity_remaining']) + ' ' + (item['unit']?.toString() ?? ''),
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11)),
                          ],
                        ),
                      )),
                      const Divider(height: 20),
                      Row(
                        children: [
                          Expanded(child: Text('Sisa kuantitas: ' + _qty(outstanding), style: const TextStyle(fontSize: 12, color: Color(0xFF53665D)))),
                          FilledButton.icon(
                            onPressed: () => onReceive(order),
                            icon: const Icon(Icons.add_box_outlined, size: 18),
                            label: const Text('Catat terima'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _IssueTab extends StatelessWidget {
  const _IssueTab({
    required this.data,
    required this.allowed,
    required this.onIssue,
    required this.onRefresh,
  });

  final WarehouseWorkspace data;
  final bool allowed;
  final VoidCallback onIssue;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (!allowed) {
      return const _NoAccess(message: 'Akun ini belum memiliki permission warehouse.issue untuk mencatat pengeluaran material.');
    }
    final stockQty = data.stocks.fold<double>(0, (sum, row) => sum + _number(row['quantity_on_hand']));
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _WarehouseHero(
            title: 'Pengeluaran material',
            subtitle: 'Keluarkan stok per proyek dan kaitkan setiap material dengan divisi atau item pekerjaan RAB.',
            icon: Icons.outbox_rounded,
            color: const Color(0xFF9A6B2E),
            value: data.stocks.length.toString(),
            valueLabel: 'baris stok tersedia',
          ),
          const SizedBox(height: 12),
          _MiniMetric(label: 'Total kuantitas tersedia', value: _qty(stockQty), icon: Icons.inventory_outlined),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: data.projects.isEmpty || data.stocks.isEmpty ? null : onIssue,
            icon: const Icon(Icons.add_shopping_cart_rounded),
            label: const Text('Buat pengeluaran material'),
          ),
          const SizedBox(height: 10),
          const _HintBox(text: 'Pengeluaran mengurangi stok proyek pada backend setelah transaksi berhasil disimpan. Jangan membuat catatan pengeluaran kedua untuk transaksi yang sama.'),
          if (data.projects.isEmpty)
            const _EmptyWarehouse(title: 'Belum ada proyek aktif', message: 'Tidak ditemukan proyek berstatus DIKERJAKAN.')
          else if (data.stocks.isEmpty)
            const _EmptyWarehouse(title: 'Belum ada stok tersedia', message: 'Penerimaan material harus tercatat terlebih dahulu.'),
        ],
      ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.data, required this.onRefresh});

  final WarehouseWorkspace data;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Riwayat transaksi gudang', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          const Text('Dokumen PDF dibuat dari data penerimaan atau pengeluaran yang sudah tersimpan.', style: TextStyle(fontSize: 12, color: Color(0xFF687970))),
          const SizedBox(height: 16),
          const _HistoryHeading(title: 'Penerimaan material', icon: Icons.move_to_inbox_outlined),
          if (data.receipts.isEmpty)
            const _EmptyWarehouse(title: 'Belum ada penerimaan', message: 'Riwayat penerimaan akan tampil setelah transaksi pertama.')
          else
            ...data.receipts.map((row) => _HistoryCard(
              number: row['receipt_number']?.toString() ?? 'Penerimaan',
              project: _first(row['project'])?['title']?.toString() ?? 'Proyek',
              date: _date(row['received_at']),
              note: 'PO ' + (_first(row['purchase_order'])?['po_number']?.toString() ?? '-') +
                  ' · diterima ' + _qty(row['total_received']) +
                  ' · rusak ' + _qty(row['total_damaged']),
              icon: Icons.move_to_inbox_outlined,
              color: const Color(0xFF2F7190),
              onPdf: () => _sharePdf(context, () => DahliaDocumentPdf.shareWarehouseReceipt(row)),
            )),
          const SizedBox(height: 18),
          const _HistoryHeading(title: 'Pengeluaran material', icon: Icons.outbox_outlined),
          if (data.issues.isEmpty)
            const _EmptyWarehouse(title: 'Belum ada pengeluaran', message: 'Riwayat pengeluaran akan tampil setelah transaksi pertama.')
          else
            ...data.issues.map((row) => _HistoryCard(
              number: row['issue_number']?.toString() ?? 'Pengeluaran',
              project: _first(row['project'])?['title']?.toString() ?? 'Proyek',
              date: _date(row['issued_at']),
              note: 'Penerima ' + (row['recipient_name']?.toString() ?? '-') +
                  ' · ' + _rows(row['items']).length.toString() + ' item',
              icon: Icons.outbox_outlined,
              color: const Color(0xFF9A6B2E),
              onPdf: () => _sharePdf(context, () => DahliaDocumentPdf.shareWarehouseIssue(row)),
            )),
        ],
      ),
    );
  }

  Future<void> _sharePdf(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('PDF gagal dibuat: ' + error.toString())));
      }
    }
  }
}

class ReceiveMaterialPage extends StatefulWidget {
  const ReceiveMaterialPage({required this.repository, required this.order, super.key});

  final WarehouseRepository repository;
  final Map<String, dynamic> order;

  @override
  State<ReceiveMaterialPage> createState() => _ReceiveMaterialPageState();
}

class _ReceiveMaterialPageState extends State<ReceiveMaterialPage> {
  final _formKey = GlobalKey<FormState>();
  final _deliveryNote = TextEditingController();
  final _notes = TextEditingController();
  late final List<Map<String, dynamic>> _items;
  late final List<TextEditingController> _received;
  late final List<TextEditingController> _damaged;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _items = _rows(widget.order['items']);
    _received = List.generate(_items.length, (_) => TextEditingController());
    _damaged = List.generate(_items.length, (_) => TextEditingController(text: '0'));
  }

  @override
  void dispose() {
    _deliveryNote.dispose();
    _notes.dispose();
    for (final controller in _received) { controller.dispose(); }
    for (final controller in _damaged) { controller.dispose(); }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    final payload = <Map<String, dynamic>>[];
    for (var i = 0; i < _items.length; i++) {
      final received = double.tryParse(_received[i].text.trim()) ?? 0;
      final damaged = double.tryParse(_damaged[i].text.trim()) ?? 0;
      if (received <= 0) continue;
      final remaining = _number(_items[i]['quantity_remaining']);
      if (received > remaining + 0.000001) {
        setState(() => _error = 'Jumlah diterima untuk ' + (_items[i]['material_name']?.toString() ?? 'material') + ' melebihi sisa PO.');
        return;
      }
      if (damaged > received) {
        setState(() => _error = 'Jumlah rusak tidak boleh melebihi jumlah diterima.');
        return;
      }
      payload.add({
        'purchase_order_item_id': _items[i]['id'],
        'quantity_received': received,
        'quantity_damaged': damaged,
        'notes': null,
      });
    }
    if (payload.isEmpty) {
      setState(() => _error = 'Masukkan kuantitas pada minimal satu item.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.recordReceipt(
        purchaseOrderId: widget.order['id'].toString(),
        receivedAt: DateTime.now(),
        deliveryNoteNumber: _deliveryNote.text,
        notes: _notes.text,
        items: payload,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = _first(widget.order['project']);
    final supplier = _first(widget.order['supplier']);
    return Scaffold(
      appBar: AppBar(title: const Text('Form Penerimaan Material')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _WarehouseHero(
              title: widget.order['po_number']?.toString() ?? 'PO',
              subtitle: (project?['title']?.toString() ?? 'Proyek') + ' · ' + (supplier?['name']?.toString() ?? 'Supplier'),
              icon: Icons.local_shipping_outlined,
              color: const Color(0xFF2F7190),
            ),
            const SizedBox(height: 12),
            if (_error != null) _ErrorBanner(message: _error!),
            TextFormField(
              controller: _deliveryNote,
              decoration: const InputDecoration(labelText: 'Nomor surat jalan', prefixIcon: Icon(Icons.confirmation_number_outlined)),
            ),
            const SizedBox(height: 10),
            const Text('Kuantitas penerimaan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
            const SizedBox(height: 5),
            const _HintBox(text: 'Isi jumlah fisik yang datang. Jumlah rusak akan dipisahkan dan tidak menambah stok layak pakai. Kosongkan item yang tidak diterima.'),
            ...List.generate(_items.length, (index) {
              final item = _items[index];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(13),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item['material_name']?.toString() ?? 'Material', style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text('Sisa PO: ' + _qty(item['quantity_remaining']) + ' ' + (item['unit']?.toString() ?? ''),
                          style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(child: TextFormField(
                            controller: _received[index],
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'Diterima', border: OutlineInputBorder(), isDense: true),
                            validator: (value) {
                              if ((value ?? '').trim().isEmpty) return null;
                              final number = double.tryParse(value!);
                              return number == null || number < 0 ? 'Jumlah tidak valid' : null;
                            },
                          )),
                          const SizedBox(width: 10),
                          Expanded(child: TextFormField(
                            controller: _damaged[index],
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(labelText: 'Rusak', border: OutlineInputBorder(), isDense: true),
                            validator: (value) {
                              final number = double.tryParse(value ?? '');
                              return number == null || number < 0 ? 'Jumlah tidak valid' : null;
                            },
                          )),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            TextFormField(
              controller: _notes,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Catatan pemeriksaan', alignLabelWithHint: true),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _saving ? null : _submit,
              icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Menyimpan...' : 'Simpan penerimaan'),
            ),
          ],
        ),
      ),
    );
  }
}

class IssueMaterialPage extends StatefulWidget {
  const IssueMaterialPage({required this.repository, required this.data, super.key});

  final WarehouseRepository repository;
  final WarehouseWorkspace data;

  @override
  State<IssueMaterialPage> createState() => _IssueMaterialPageState();
}

class _IssueMaterialPageState extends State<IssueMaterialPage> {
  final _formKey = GlobalKey<FormState>();
  final _recipient = TextEditingController();
  final _notes = TextEditingController();
  String? _projectId;
  final List<_IssueLine> _lines = [_IssueLine()];
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _projectId = widget.data.projects.isNotEmpty ? widget.data.projects.first['id']?.toString() : null;
  }

  @override
  void dispose() {
    _recipient.dispose();
    _notes.dispose();
    for (final line in _lines) { line.dispose(); }
    super.dispose();
  }

  List<Map<String, dynamic>> get _projectStocks => widget.data.stocks
      .where((row) => row['project_id']?.toString() == _projectId)
      .toList(growable: false);

  List<Map<String, dynamic>> get _projectDivisions => widget.data.divisions
      .where((row) => row['project_id']?.toString() == _projectId)
      .toList(growable: false);

  void _changeProject(String? value) {
    setState(() {
      _projectId = value;
      for (final line in _lines) { line.dispose(); }
      _lines
        ..clear()
        ..add(_IssueLine());
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    if (_projectId == null) {
      setState(() => _error = 'Pilih proyek terlebih dahulu.');
      return;
    }
    final stocks = _projectStocks;
    final payload = <Map<String, dynamic>>[];
    for (final line in _lines) {
      if (line.stockIndex == null || line.stockIndex! >= stocks.length) {
        setState(() => _error = 'Pilih material untuk setiap baris.');
        return;
      }
      if (line.divisionId == null) {
        setState(() => _error = 'Pilih divisi atau lokasi RAB pada setiap baris.');
        return;
      }
      final stock = stocks[line.stockIndex!];
      final quantity = double.tryParse(line.quantity.text.trim()) ?? 0;
      final available = _number(stock['quantity_on_hand']);
      if (quantity <= 0 || quantity > available + 0.000001) {
        setState(() => _error = 'Jumlah keluar harus lebih dari nol dan tidak boleh melebihi stok tersedia.');
        return;
      }
      payload.add({
        'material_id': stock['material_id'],
        'material_code': stock['material_code'],
        'material_name': stock['material_name'],
        'unit': stock['unit'],
        'quantity_issued': quantity,
        'division_id': line.divisionId,
        'rab_item_id': (line.rabItemId == null || line.rabItemId!.isEmpty) ? null : line.rabItemId,
        'notes': null,
      });
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.repository.recordIssue(
        projectId: _projectId!,
        issuedAt: DateTime.now(),
        recipientName: _recipient.text,
        notes: _notes.text,
        items: payload,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Form Pengeluaran Material')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _WarehouseHero(
              title: 'Pengeluaran stok',
              subtitle: 'Pilih proyek, material, penerima, dan alokasi pekerjaan. Sistem memeriksa jumlah stok yang tersedia.',
              icon: Icons.outbox_rounded,
              color: Color(0xFF9A6B2E),
            ),
            if (_error != null) ...[const SizedBox(height: 10), _ErrorBanner(message: _error!)],
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _projectId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Proyek', prefixIcon: Icon(Icons.apartment_outlined)),
              items: widget.data.projects.map((row) => DropdownMenuItem(
                value: row['id'].toString(),
                child: Text(row['title']?.toString() ?? 'Proyek', overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: _saving ? null : _changeProject,
              validator: (value) => value == null ? 'Pilih proyek.' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _recipient,
              decoration: const InputDecoration(labelText: 'Nama penerima material', prefixIcon: Icon(Icons.person_outline)),
              validator: (value) => (value ?? '').trim().isEmpty ? 'Nama penerima wajib diisi.' : null,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Expanded(child: Text('Rincian material', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900))),
                TextButton.icon(onPressed: _saving ? null : () => setState(() => _lines.add(_IssueLine())), icon: const Icon(Icons.add), label: const Text('Tambah item')),
              ],
            ),
            if (_projectStocks.isEmpty)
              const _HintBox(text: 'Belum ada stok tersedia pada proyek ini. Pilih proyek lain atau lakukan penerimaan material terlebih dahulu.'),
            if (_projectDivisions.isEmpty)
              const _HintBox(text: 'Proyek ini belum memiliki divisi RAB yang dapat dipilih. Pengeluaran tidak dapat disimpan tanpa alokasi divisi.'),
            ...List.generate(_lines.length, (index) => _issueLineCard(index)),
            const SizedBox(height: 10),
            TextFormField(
              controller: _notes,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Catatan pengeluaran', alignLabelWithHint: true),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saving || _projectStocks.isEmpty || _projectDivisions.isEmpty ? null : _submit,
              icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_circle_outline),
              label: Text(_saving ? 'Menyimpan...' : 'Simpan pengeluaran'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _issueLineCard(int index) {
    final line = _lines[index];
    final stocks = _projectStocks;
    final divisions = _projectDivisions;
    final selectedStock = line.stockIndex != null && line.stockIndex! < stocks.length
        ? stocks[line.stockIndex!]
        : null;
    Map<String, dynamic>? division;
    for (final row in divisions) {
      if (row['id']?.toString() == line.divisionId) {
        division = row;
        break;
      }
    }
    final rabItems = division == null ? <Map<String, dynamic>>[] : _rows(division['items']);
    if (!rabItems.any((row) => row['id']?.toString() == line.rabItemId)) line.rabItemId = null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Item ' + (index + 1).toString(), style: const TextStyle(fontWeight: FontWeight.w800))),
                if (_lines.length > 1)
                  IconButton(
                    tooltip: 'Hapus item',
                    onPressed: _saving ? null : () => setState(() { _lines.removeAt(index).dispose(); }),
                    icon: const Icon(Icons.delete_outline, color: Color(0xFFB54F45)),
                  ),
              ],
            ),
            DropdownButtonFormField<int>(
              value: line.stockIndex,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Material dari stok proyek'),
              items: List.generate(stocks.length, (i) {
                final row = stocks[i];
                return DropdownMenuItem(
                  value: i,
                  child: Text(
                    (row['material_name']?.toString() ?? 'Material') + ' · tersedia ' +
                    _qty(row['quantity_on_hand']) + ' ' + (row['unit']?.toString() ?? ''),
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }),
              onChanged: _saving ? null : (value) => setState(() {
                line.stockIndex = value;
                line.quantity.text = value == null ? '1' : '1';
              }),
              validator: (value) => value == null ? 'Pilih material.' : null,
            ),
            const SizedBox(height: 9),
            TextFormField(
              controller: line.quantity,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Jumlah keluar',
                helperText: selectedStock == null ? null : 'Maksimal ' + _qty(selectedStock['quantity_on_hand']) + ' ' + (selectedStock['unit']?.toString() ?? ''),
              ),
              validator: (value) {
                final number = double.tryParse(value ?? '');
                return number == null || number <= 0 ? 'Jumlah harus lebih dari nol.' : null;
              },
            ),
            const SizedBox(height: 9),
            DropdownButtonFormField<String>(
              value: line.divisionId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Divisi / lokasi pekerjaan RAB'),
              items: divisions.map((row) => DropdownMenuItem(
                value: row['id'].toString(),
                child: Text(row['name']?.toString() ?? 'Divisi', overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: _saving ? null : (value) => setState(() { line.divisionId = value; line.rabItemId = null; }),
              validator: (value) => value == null ? 'Pilih divisi.' : null,
            ),
            if (rabItems.isNotEmpty) ...[
              const SizedBox(height: 9),
              DropdownButtonFormField<String>(
                value: line.rabItemId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Item pekerjaan (opsional)'),
                items: [
                  const DropdownMenuItem<String>(value: '', child: Text('Tidak dikaitkan ke item tertentu')),
                  ...rabItems.map((row) => DropdownMenuItem<String>(
                    value: row['id'].toString(),
                    child: Text(row['name']?.toString() ?? 'Item RAB', overflow: TextOverflow.ellipsis),
                  )),
                ],
                onChanged: _saving ? null : (value) => setState(() => line.rabItemId = value),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _IssueLine {
  int? stockIndex;
  String? divisionId;
  String? rabItemId;
  final TextEditingController quantity = TextEditingController(text: '1');
  void dispose() => quantity.dispose();
}

class _WarehouseHero extends StatelessWidget {
  const _WarehouseHero({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    this.value,
    this.valueLabel,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final String? value;
  final String? valueLabel;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.82)], begin: Alignment.topLeft, end: Alignment.bottomRight),
    ),
    child: Row(
      children: [
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
          child: Icon(icon, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 13),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
            const SizedBox(height: 5),
            Text(subtitle, style: const TextStyle(color: Color(0xFFF0F7F5), fontSize: 11, height: 1.4)),
          ],
        )),
        if (value != null) ...[
          const SizedBox(width: 8),
          Column(
            children: [
              Text(value!, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              Text(valueLabel ?? '', style: const TextStyle(color: Colors.white70, fontSize: 9)),
            ],
          ),
        ],
      ],
    ),
  );
}

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Row(children: [
        const SizedBox(width: 2),
        Icon(icon, color: const Color(0xFF2F7166), size: 23),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
          const SizedBox(height: 3),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        ])),
      ]),
    ),
  );
}

class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 42, height: 42,
    decoration: BoxDecoration(color: color.withValues(alpha: 0.11), borderRadius: BorderRadius.circular(13)),
    child: Icon(icon, color: color),
  );
}

class _HistoryHeading extends StatelessWidget {
  const _HistoryHeading({required this.title, required this.icon});
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, color: const Color(0xFF244C45)),
    const SizedBox(width: 8),
    Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
  ]);
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({
    required this.number,
    required this.project,
    required this.date,
    required this.note,
    required this.icon,
    required this.color,
    required this.onPdf,
  });

  final String number;
  final String project;
  final String date;
  final String note;
  final IconData icon;
  final Color color;
  final VoidCallback onPdf;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Row(children: [
        _IconTile(icon: icon, color: color),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(number, style: const TextStyle(fontWeight: FontWeight.w900)),
          Text(project, style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
          Text(date + ' · ' + note, style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
        ])),
        IconButton(
          tooltip: 'Buat / bagikan PDF',
          onPressed: onPdf,
          icon: const Icon(Icons.picture_as_pdf_outlined, color: Color(0xFFB64E42)),
        ),
      ]),
    ),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(color: const Color(0xFFEAF2EF), borderRadius: BorderRadius.circular(30)),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      child: Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF285F52))),
    ),
  );
}

class _HintBox extends StatelessWidget {
  const _HintBox({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFFFF5E7), borderRadius: BorderRadius.circular(12)),
    child: Text(text, style: const TextStyle(fontSize: 11, color: Color(0xFF795927), height: 1.4)),
  );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFFFEEEE), borderRadius: BorderRadius.circular(12)),
    child: Text(message, style: const TextStyle(fontSize: 12, color: Color(0xFF9D3636))),
  );
}

class _EmptyWarehouse extends StatelessWidget {
  const _EmptyWarehouse({required this.title, required this.message});
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(22),
    child: Column(children: [
      const Icon(Icons.inbox_outlined, size: 40, color: Color(0xFF87958F)),
      const SizedBox(height: 8),
      Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      const SizedBox(height: 4),
      Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
    ]),
  );
}

class _NoAccess extends StatelessWidget {
  const _NoAccess({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.lock_outline, size: 40, color: Color(0xFF8B9691)),
      const SizedBox(height: 10),
      Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF687970))),
    ]),
  ));
}

class _WarehouseError extends StatelessWidget {
  const _WarehouseError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off_outlined, size: 42, color: Color(0xFF9A6B2E)),
      const SizedBox(height: 12),
      const Text('Data gudang belum dapat dimuat', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
      const SizedBox(height: 8),
      Text(_friendlyError(message), textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF687970))),
      const SizedBox(height: 14),
      OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Coba lagi')),
    ]),
  ));
}

Map<String, dynamic>? _first(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty && value.first is Map) {
    return Map<String, dynamic>.from(value.first as Map);
  }
  return null;
}

List<Map<String, dynamic>> _rows(dynamic value) {
  if (value is! List) return <Map<String, dynamic>>[];
  return value.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
}

double _number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

String _qty(dynamic value) {
  final number = _number(value);
  return number == number.roundToDouble() ? number.toStringAsFixed(0) : number.toStringAsFixed(2);
}

String _date(dynamic value) {
  if (value == null) return '-';
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) return value.toString();
  final local = parsed.toLocal();
  return local.day.toString().padLeft(2, '0') + '/' +
      local.month.toString().padLeft(2, '0') + '/' + local.year.toString();
}

String _status(String value) {
  const labels = {
    'approved': 'Disetujui',
    'ordered': 'Sudah dipesan',
    'partially_received': 'Diterima sebagian',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

String _friendlyError(Object error) {
  final raw = error.toString().replaceFirst('Exception: ', '').trim();
  if (raw.contains('42501') || raw.toLowerCase().contains('permission denied') || raw.toLowerCase().contains('row-level security')) {
    return 'Akun ini belum memiliki hak akses gudang untuk transaksi tersebut.';
  }
  return raw.isEmpty ? 'Terjadi kesalahan. Periksa koneksi lalu coba kembali.' : raw;
}
