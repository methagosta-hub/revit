import 'package:flutter/material.dart';

import '../data/dahlia_access.dart';
import '../data/procurement_repository.dart';

class ProcurementPage extends StatefulWidget {
  const ProcurementPage({
    required this.repository,
    required this.access,
    super.key,
  });

  final ProcurementRepository repository;
  final DahliaAccess access;

  @override
  State<ProcurementPage> createState() => _ProcurementPageState();
}

class _ProcurementPageState extends State<ProcurementPage> {
  late Future<void> _loadFuture;
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _requests = [];
  bool _loading = true;
  String? _error;
  String? _notice;
  String _filter = 'all';
  String? _busyId;

  bool get _canCreate => widget.access.canCreatePurchaseOrder;
  bool get _canApprove => widget.access.canApprovePurchaseOrder;
  bool get _canReviewRequests => widget.access.canReviewMaterialRequest;

  @override
  void initState() {
    super.initState();
    _loadFuture = _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.repository.listPurchaseOrders(),
        if (_canReviewRequests)
          widget.repository.listMaterialRequestsForReview()
        else
          Future.value(<Map<String, dynamic>>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _orders = results[0];
        _requests = results[1];
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _loadFuture = next);
    await next;
  }

  Future<void> _createOrder() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => CreatePurchaseOrderPage(
          repository: widget.repository,
        ),
      ),
    );
    if (created == true && mounted) {
      setState(() => _notice = 'Purchase Order berhasil diajukan untuk persetujuan.');
      await _refresh();
    }
  }

  Future<void> _approveOrder(Map<String, dynamic> order) async {
    if (!_canApprove) return;
    final id = order['id']?.toString() ?? '';
    final number = order['po_number']?.toString() ?? 'PO';
    final confirmed = await _confirm(
      title: 'Setujui Purchase Order?',
      message: 'PO $number akan diteruskan ke tahap pemesanan.',
      actionLabel: 'Setujui',
    );
    if (!confirmed || id.isEmpty) return;
    await _runAction(id, () => widget.repository.approvePurchaseOrder(id),
        success: 'PO $number berhasil disetujui.');
  }

  Future<void> _markOrdered(Map<String, dynamic> order) async {
    if (!_canCreate) return;
    final id = order['id']?.toString() ?? '';
    final number = order['po_number']?.toString() ?? 'PO';
    final confirmed = await _confirm(
      title: 'Tandai sudah dipesan?',
      message: 'Status PO $number akan berubah menjadi sudah dipesan.',
      actionLabel: 'Tandai dipesan',
    );
    if (!confirmed || id.isEmpty) return;
    await _runAction(id, () => widget.repository.markPurchaseOrderOrdered(id),
        success: 'PO $number ditandai sudah dipesan.');
  }

  Future<void> _reviewRequest(
    Map<String, dynamic> request,
    String decision,
  ) async {
    if (!_canReviewRequests) return;
    final id = request['request_id']?.toString() ?? '';
    final number = request['request_number']?.toString() ?? 'PR';
    if (id.isEmpty) return;
    String? reason;
    if (decision == 'rejected') {
      reason = await _askRejectionReason();
      if (reason == null || reason.trim().isEmpty) return;
    } else {
      final label = decision == 'approved' ? 'Setujui' : 'Mulai tinjau';
      final confirmed = await _confirm(
        title: '$label permintaan material?',
        message: 'Permintaan $number akan diperbarui.',
        actionLabel: label,
      );
      if (!confirmed) return;
    }
    await _runAction(
      id,
      () => widget.repository.reviewMaterialRequest(
        requestId: id,
        decision: decision,
        rejectionReason: reason,
      ),
      success: 'Status permintaan $number berhasil diperbarui.',
    );
  }

  Future<void> _runAction(
    String id,
    Future<void> Function() action, {
    required String success,
  }) async {
    setState(() {
      _busyId = id;
      _error = null;
      _notice = null;
    });
    try {
      await action();
      if (!mounted) return;
      setState(() => _notice = success);
      await _refresh();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String actionLabel,
  }) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Batal'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text(actionLabel),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<String?> _askRejectionReason() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Alasan penolakan'),
        content: TextField(
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: 'Jelaskan alasan permintaan ditolak',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Tolak permintaan'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final showOrders = _canCreate || _canApprove;
    final tabs = <Widget>[];
    final pages = <Widget>[];
    if (showOrders) {
      tabs.add(const Tab(text: 'Purchase Order'));
      pages.add(_buildOrders());
    }
    if (_canReviewRequests) {
      tabs.add(const Tab(text: 'Permintaan Material'));
      pages.add(_buildRequests());
    }

    return DefaultTabController(
      length: tabs.isEmpty ? 1 : tabs.length,
      child: Scaffold(
      appBar: AppBar(
        title: const Text('Pengadaan & Purchasing'),
        actions: [
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _loading ? null : _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
        bottom: tabs.isEmpty
            ? null
            : TabBar(
                isScrollable: true,
                tabs: tabs,
              ),
      ),
      floatingActionButton: _canCreate
          ? FloatingActionButton.extended(
              onPressed: _loading ? null : _createOrder,
              icon: const Icon(Icons.add_shopping_cart_rounded),
              label: const Text('Buat PO'),
            )
          : null,
      body: Column(
        children: [
          if (_error != null) _MessageBanner(message: _error!, isError: true),
          if (_notice != null) _MessageBanner(message: _notice!, isError: false),
          Expanded(
            child: tabs.isEmpty
                ? const _EmptyPanel(
                    icon: Icons.lock_outline,
                    title: 'Akses pengadaan belum tersedia',
                    message: 'Akun ini belum memiliki permission Purchasing atau peninjauan permintaan material.',
                  )
                : TabBarView(children: pages),
          ),
        ],
      ),
      ),
    );
  }

  Widget _buildOrders() {
    final filtered = _filter == 'all'
        ? _orders
        : _orders.where((row) => row['status'] == _filter).toList();
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 100),
        children: [
          _SummaryStrip(
            title: 'Purchase Order',
            subtitle: '${_orders.length} dokumen dalam cakupan akun',
            count: _orders.where((row) => row['status'] == 'pending_approval').length,
            countLabel: 'Menunggu persetujuan',
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _filter,
            decoration: const InputDecoration(
              labelText: 'Filter status PO',
              prefixIcon: Icon(Icons.filter_list_rounded),
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'all', child: Text('Semua status')),
              DropdownMenuItem(value: 'pending_approval', child: Text('Menunggu persetujuan')),
              DropdownMenuItem(value: 'approved', child: Text('Disetujui')),
              DropdownMenuItem(value: 'ordered', child: Text('Sudah dipesan')),
              DropdownMenuItem(value: 'partially_received', child: Text('Diterima sebagian')),
              DropdownMenuItem(value: 'received', child: Text('Sudah diterima')),
              DropdownMenuItem(value: 'cancelled', child: Text('Dibatalkan')),
            ],
            onChanged: (value) => setState(() => _filter = value ?? 'all'),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (filtered.isEmpty)
            const _EmptyPanel(
              icon: Icons.receipt_long_outlined,
              title: 'Belum ada Purchase Order',
              message: 'PO yang dapat diakses akun ini akan tampil di sini.',
            )
          else
            ...filtered.map(_orderCard),
        ],
      ),
    );
  }

  Widget _orderCard(Map<String, dynamic> order) {
    final status = order['status']?.toString() ?? '-';
    final id = order['id']?.toString() ?? '';
    final busy = _busyId == id;
    final project = _related(order['project']);
    final supplier = _related(order['supplier']);
    final items = order['items'] is List
        ? (order['items'] as List).whereType<Map>().map(
            (item) => Map<String, dynamic>.from(item),
          ).toList()
        : <Map<String, dynamic>>[];
    final actions = <Widget>[];
    if (_canApprove && status == 'pending_approval') {
      actions.add(
        OutlinedButton.icon(
          onPressed: busy ? null : () => _approveOrder(order),
          icon: busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.check_circle_outline),
          label: const Text('Setujui PO'),
        ),
      );
    }
    if (_canCreate && status == 'approved') {
      actions.add(
        FilledButton.icon(
          onPressed: busy ? null : () => _markOrdered(order),
          icon: busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.local_shipping_outlined),
          label: const Text('Tandai dipesan'),
        ),
      );
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order['po_number']?.toString() ?? 'Purchase Order',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
                _StatusPill(status: _statusLabel(status)),
              ],
            ),
            const SizedBox(height: 6),
            Text(project?['title']?.toString() ?? 'Proyek tidak diketahui',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('Supplier: ${supplier?['name'] ?? '—'}',
                style: const TextStyle(color: Color(0xFF65756F), fontSize: 12)),
            const SizedBox(height: 10),
            ...items.take(5).map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          item['material_name']?.toString() ?? 'Barang',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      Text(
                        '${_qty(item['quantity_ordered'])} ${item['unit'] ?? ''}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                )),
            if (items.length > 5)
              Text('dan ${items.length - 5} barang lainnya',
                  style: const TextStyle(color: Color(0xFF65756F), fontSize: 11)),
            const Divider(height: 22),
            Row(
              children: [
                const Expanded(child: Text('Subtotal', style: TextStyle(color: Color(0xFF65756F)))),
                Text(_money(order['subtotal']),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ],
            ),
            if (actions.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRequests() {
    final pending = _requests.where((row) =>
        ['submitted', 'under_review'].contains(row['status'])).toList();
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          _SummaryStrip(
            title: 'Permintaan Material Lapangan',
            subtitle: '${_requests.length} permintaan dapat ditinjau',
            count: pending.length,
            countLabel: 'Belum selesai',
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_requests.isEmpty)
            const _EmptyPanel(
              icon: Icons.inventory_2_outlined,
              title: 'Belum ada permintaan material',
              message: 'Permintaan dari mandor akan tampil di sini saat tersedia untuk akun Anda.',
            )
          else
            ..._requests.map((request) => _requestCard(request)),
        ],
      ),
    );
  }

  Widget _requestCard(Map<String, dynamic> request) {
    final status = request['status']?.toString() ?? '-';
    final id = request['request_id']?.toString() ?? '';
    final busy = _busyId == id;
    final items = request['items'] is List
        ? (request['items'] as List).whereType<Map>().toList()
        : const <Map>[];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request['request_number']?.toString() ?? 'Permintaan Material',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                _StatusPill(status: _statusLabel(status)),
              ],
            ),
            const SizedBox(height: 5),
            Text(request['project_title']?.toString() ?? 'Proyek tidak diketahui'),
            Text(
              'Dibutuhkan: ${request['required_date'] ?? '—'} · Prioritas: ${request['priority'] ?? 'normal'}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF65756F)),
            ),
            const SizedBox(height: 8),
            ...items.map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                    '• ${item['item_name'] ?? 'Barang'} — ${_qty(item['quantity'])} ${item['unit'] ?? ''}',
                    style: const TextStyle(fontSize: 12),
                  ),
                )),
            if ((request['notes']?.toString() ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 7),
              Text(request['notes'].toString(),
                  style: const TextStyle(fontSize: 12, color: Color(0xFF65756F))),
            ],
            if (_canReviewRequests &&
                ['submitted', 'under_review'].contains(status)) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: busy ? null : () => _reviewRequest(request, 'under_review'),
                    child: const Text('Mulai tinjau'),
                  ),
                  FilledButton.tonal(
                    onPressed: busy ? null : () => _reviewRequest(request, 'approved'),
                    child: const Text('Setujui PR'),
                  ),
                  TextButton(
                    onPressed: busy ? null : () => _reviewRequest(request, 'rejected'),
                    child: const Text('Tolak'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class CreatePurchaseOrderPage extends StatefulWidget {
  const CreatePurchaseOrderPage({required this.repository, super.key});

  final ProcurementRepository repository;

  @override
  State<CreatePurchaseOrderPage> createState() => _CreatePurchaseOrderPageState();
}

class _CreatePurchaseOrderPageState extends State<CreatePurchaseOrderPage> {
  final _formKey = GlobalKey<FormState>();
  final _notes = TextEditingController();
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _unit = TextEditingController(text: 'pcs');
  final _quantity = TextEditingController(text: '1');
  final _price = TextEditingController();
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _suppliers = [];
  String? _projectId;
  String? _supplierId;
  DateTime _orderDate = DateTime.now();
  DateTime? _expectedDate;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  Future<void> _loadOptions() async {
    try {
      final results = await Future.wait([
        widget.repository.listProjects(),
        widget.repository.listSuppliers(),
      ]);
      if (!mounted) return;
      setState(() {
        _projects = results[0];
        _suppliers = results[1];
        _projectId = _projects.isNotEmpty ? _projects.first['id']?.toString() : null;
        _supplierId = _suppliers.isNotEmpty ? _suppliers.first['id']?.toString() : null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    _name.dispose();
    _code.dispose();
    _unit.dispose();
    _quantity.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool expected}) async {
    final initial = expected ? (_expectedDate ?? _orderDate) : _orderDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (expected) {
        _expectedDate = picked;
      } else {
        _orderDate = picked;
        if (_expectedDate != null && _expectedDate!.isBefore(picked)) {
          _expectedDate = null;
        }
      }
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_projectId == null || _supplierId == null) {
      setState(() => _error = 'Pilih proyek aktif dan supplier terlebih dahulu.');
      return;
    }
    final quantity = double.tryParse(_quantity.text.trim());
    final price = double.tryParse(_price.text.trim());
    if (quantity == null || quantity <= 0 || price == null || price < 0) {
      setState(() => _error = 'Kuantitas harus lebih dari nol dan harga tidak boleh negatif.');
      return;
    }
    if (_expectedDate != null && _expectedDate!.isBefore(_orderDate)) {
      setState(() => _error = 'Tanggal perkiraan tiba tidak boleh sebelum tanggal PO.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.repository.createPurchaseOrder(
        projectId: _projectId!,
        supplierId: _supplierId!,
        orderDate: _orderDate,
        expectedDate: _expectedDate,
        notes: _notes.text,
        items: [
          {
            'material_code': _code.text.trim().isEmpty ? null : _code.text.trim(),
            'material_name': _name.text.trim(),
            'unit': _unit.text.trim(),
            'quantity_ordered': quantity,
            'unit_price': price,
            'notes': null,
          }
        ],
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
      appBar: AppBar(title: const Text('Buat Purchase Order')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  if (_error != null) _MessageBanner(message: _error!, isError: true),
                  _sectionTitle('Informasi pesanan'),
                  DropdownButtonFormField<String>(
                    value: _projectId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Proyek aktif',
                      border: OutlineInputBorder(),
                    ),
                    items: _projects.map((row) => DropdownMenuItem<String>(
                      value: row['id'].toString(),
                      child: Text(row['title']?.toString() ?? 'Proyek'),
                    )).toList(),
                    onChanged: _saving ? null : (value) => setState(() => _projectId = value),
                    validator: (value) => value == null ? 'Pilih proyek.' : null,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _supplierId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Supplier aktif',
                      border: OutlineInputBorder(),
                    ),
                    items: _suppliers.map((row) => DropdownMenuItem<String>(
                      value: row['id'].toString(),
                      child: Text(row['name']?.toString() ?? 'Supplier'),
                    )).toList(),
                    onChanged: _saving ? null : (value) => setState(() => _supplierId = value),
                    validator: (value) => value == null ? 'Pilih supplier.' : null,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : () => _pickDate(expected: false),
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text('Tanggal PO: ${_dateLabel(_orderDate)}'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : () => _pickDate(expected: true),
                    icon: const Icon(Icons.event_available_outlined),
                    label: Text('Perkiraan tiba: ${_expectedDate == null ? 'Belum ditentukan' : _dateLabel(_expectedDate!)}'),
                  ),
                  const SizedBox(height: 18),
                  _sectionTitle('Rincian barang'),
                  TextFormField(
                    controller: _code,
                    decoration: const InputDecoration(
                      labelText: 'Kode material (opsional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(
                      labelText: 'Nama barang',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) => (value ?? '').trim().isEmpty ? 'Nama barang wajib diisi.' : null,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _unit,
                          decoration: const InputDecoration(
                            labelText: 'Satuan',
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) => (value ?? '').trim().isEmpty ? 'Satuan wajib diisi.' : null,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _quantity,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(
                            labelText: 'Kuantitas',
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            final number = double.tryParse(value ?? '');
                            return number == null || number <= 0 ? 'Kuantitas tidak valid.' : null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _price,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Harga satuan (Rp)',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      final number = double.tryParse(value ?? '');
                      return number == null || number < 0 ? 'Harga tidak valid.' : null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _notes,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Catatan PO (opsional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_projects.isEmpty || _suppliers.isEmpty)
                    const _InfoNotice(
                      message: 'PO belum dapat dibuat karena belum ada proyek DIKERJAKAN atau supplier aktif yang dapat diakses.',
                    ),
                  FilledButton.icon(
                    onPressed: _saving || _projects.isEmpty || _suppliers.isEmpty ? null : _submit,
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send_rounded),
                    label: Text(_saving ? 'Mengirim...' : 'Ajukan Purchase Order'),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'PO baru akan masuk status menunggu persetujuan. Pembuatan PO tidak otomatis menyetujui atau mengirim pesanan.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF65756F)),
                  ),
                ],
              ),
            ),
    );
  }
}

class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({
    required this.title,
    required this.subtitle,
    required this.count,
    required this.countLabel,
  });

  final String title;
  final String subtitle;
  final int count;
  final String countLabel;

  @override
  Widget build(BuildContext context) => Card(
        color: const Color(0xFFEAF2EF),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Row(
            children: [
              const Icon(Icons.shopping_bag_outlined, size: 28, color: Color(0xFF244C45)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(subtitle, style: const TextStyle(fontSize: 11, color: Color(0xFF65756F))),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('$count', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  Text(countLabel, style: const TextStyle(fontSize: 9, color: Color(0xFF65756F))),
                ],
              ),
            ],
          ),
        ),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFFEAF2EF),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Text(
            status,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF285F52)),
          ),
        ),
      );
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({required this.message, required this.isError});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isError ? const Color(0xFFFFEEEE) : const Color(0xFFE7F4EC),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(isError ? Icons.error_outline : Icons.check_circle_outline,
                color: isError ? const Color(0xFFB33B3B) : const Color(0xFF287449)),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: const TextStyle(fontSize: 12))),
          ],
        ),
      );
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 42, color: const Color(0xFF82918B)),
              const SizedBox(height: 12),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(message, textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF65756F))),
            ],
          ),
        ),
      );
}

class _InfoNotice extends StatelessWidget {
  const _InfoNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF5E7),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(message, style: const TextStyle(fontSize: 12, color: Color(0xFF7A5826))),
      );
}

Map<String, dynamic>? _related(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty && value.first is Map) {
    return Map<String, dynamic>.from(value.first as Map);
  }
  return null;
}

String _statusLabel(String status) {
  const labels = <String, String>{
    'draft': 'Draft',
    'pending_approval': 'Menunggu persetujuan',
    'approved': 'Disetujui',
    'ordered': 'Sudah dipesan',
    'partially_received': 'Diterima sebagian',
    'received': 'Diterima',
    'cancelled': 'Dibatalkan',
    'submitted': 'Diajukan',
    'under_review': 'Sedang ditinjau',
    'rejected': 'Ditolak',
    'converted': 'Sudah menjadi PO',
    'cancelled': 'Dibatalkan',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

String _dateLabel(DateTime date) {
  final day = date.day.toString().padLeft(2, '0');
  final month = date.month.toString().padLeft(2, '0');
  return '$day/$month/${date.year}';
}

String _qty(dynamic value) {
  final number = value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
  return number.toStringAsFixed(number == number.roundToDouble() ? 0 : 2);
}

String _money(dynamic value) {
  final number = value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
  final text = number.round().toString();
  final buffer = StringBuffer();
  for (var index = 0; index < text.length; index++) {
    buffer.write(text[index]);
    final remaining = text.length - index - 1;
    if (remaining > 0 && remaining % 3 == 0) buffer.write('.');
  }
  return 'Rp ${buffer.toString()}';
}

String _friendlyError(Object error) {
  final raw = error.toString().replaceFirst('Exception: ', '').trim();
  if (raw.contains('42501') ||
      raw.toLowerCase().contains('permission denied') ||
      raw.toLowerCase().contains('row-level security')) {
    return 'Akun ini belum memiliki izin untuk tindakan tersebut. Periksa permission dan penugasan pengguna.';
  }
  if (raw.isEmpty) return 'Terjadi kesalahan. Coba muat ulang dan periksa koneksi.';
  return raw;
}

Widget _sectionTitle(String title) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
    );
