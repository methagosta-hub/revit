import 'package:flutter/material.dart';

import '../data/direct_purchase_repository.dart';
import '../services/document_pdf_service.dart';

class DirectMaterialPurchasePage extends StatefulWidget {
  const DirectMaterialPurchasePage({required this.repository, super.key});

  final DirectMaterialPurchaseRepository repository;

  @override
  State<DirectMaterialPurchasePage> createState() =>
      _DirectMaterialPurchasePageState();
}

class _DirectMaterialPurchasePageState extends State<DirectMaterialPurchasePage> {
  late Future<DirectPurchaseWorkspace> _future;

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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pembelian Material Langsung',
            style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: FutureBuilder<DirectPurchaseWorkspace>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _PurchaseError(
              message: _friendlyError(snapshot.error!),
              onRetry: _reload,
            );
          }
          final data = snapshot.data!;
          final active = data.purchases
              .where((row) => row['status'] == 'confirmed').toList();
          final total = active.fold<double>(
            0, (sum, row) => sum + _number(row['total_amount']));
          return RefreshIndicator(
            onRefresh: _reload,
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
                      Icon(Icons.shopping_bag_rounded,
                          color: Color(0xFFC8E5D9), size: 27),
                      SizedBox(height: 12),
                      Text('Pembelian tanpa Purchase Order',
                          style: TextStyle(color: Colors.white,
                              fontSize: 19, fontWeight: FontWeight.w900)),
                      SizedBox(height: 5),
                      Text(
                        'Catat pembelian material dari toko atau supplier langsung ke proyek. '
                        'Backend mencatat pembelian, kas keluar, dan penambahan stok dalam satu transaksi.',
                        style: TextStyle(color: Color(0xFFE5F2EC),
                            fontSize: 11, height: 1.4),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: _MetricCard(
                    label: 'Transaksi aktif',
                    value: active.length.toString(),
                    icon: Icons.receipt_long_outlined,
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: _MetricCard(
                    label: 'Total pembelian',
                    value: _money(total),
                    icon: Icons.account_balance_wallet_outlined,
                  )),
                ]),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: data.projects.isEmpty || data.materials.isEmpty
                      ? null
                      : () async {
                          final saved = await Navigator.of(context).push<bool>(
                            MaterialPageRoute<bool>(
                              builder: (_) => _DirectPurchaseFormPage(
                                repository: widget.repository,
                                data: data,
                              ),
                            ),
                          );
                          if (saved == true && mounted) {
                            await _reload();
                            _message('Pembelian langsung berhasil dicatat.');
                          }
                        },
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: const Text('Buat pembelian langsung'),
                ),
                const SizedBox(height: 9),
                const _InfoBox(
                  text: 'Pembelian langsung otomatis menambah stok material yang layak pakai dan mencatat kas keluar. '
                      'Jangan input ulang nilai yang sama sebagai transaksi kas manual.',
                ),
                const SizedBox(height: 16),
                const Text('Riwayat pembelian',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                const SizedBox(height: 8),
                if (data.purchases.isEmpty)
                  const _EmptyPurchase(message: 'Belum ada pembelian material langsung.')
                else
                  ...data.purchases.map((row) => _PurchaseCard(
                        row: row,
                        onPdf: () => _sharePdf(row),
                        onVoid: row['status'] == 'confirmed'
                            ? () => _voidPurchase(row)
                            : null,
                      )),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _sharePdf(Map<String, dynamic> row) async {
    try {
      await DahliaDocumentPdf.shareDirectPurchase(row);
    } catch (error) {
      if (mounted) _message('PDF gagal dibuat: ' + error.toString());
    }
  }

  Future<void> _voidPurchase(Map<String, dynamic> row) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Batalkan ' + (row['purchase_number']?.toString() ?? 'pembelian') + '?'),
        content: TextField(
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'Alasan pembatalan'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Kembali')),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                Navigator.pop(dialogContext, controller.text.trim());
              }
            },
            child: const Text('Batalkan'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null || !mounted) return;
    try {
      await widget.repository.voidPurchase(row['id'].toString(), reason);
      await _reload();
      _message('Pembelian dibatalkan. Kas keluar dan stok dikoreksi backend.');
    } catch (error) {
      _message('Pembatalan gagal: ' + error.toString());
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }
}

class _DirectPurchaseFormPage extends StatefulWidget {
  const _DirectPurchaseFormPage({required this.repository, required this.data});

  final DirectMaterialPurchaseRepository repository;
  final DirectPurchaseWorkspace data;

  @override
  State<_DirectPurchaseFormPage> createState() => _DirectPurchaseFormPageState();
}

class _DirectPurchaseFormPageState extends State<_DirectPurchaseFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _supplierName = TextEditingController();
  final _invoice = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  final _date = TextEditingController(text: _today());
  final List<_PurchaseLine> _lines = [_PurchaseLine()];
  String? _projectId;
  String? _supplierId;
  String? _divisionId;
  String _method = 'bank_transfer';
  List<Map<String, dynamic>> _divisions = [];
  bool _loadingDivisions = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _supplierName.dispose();
    _invoice.dispose();
    _reference.dispose();
    _notes.dispose();
    _date.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  Future<void> _setProject(String? value) async {
    setState(() {
      _projectId = value;
      _divisionId = null;
      _divisions = [];
      _loadingDivisions = value != null;
    });
    if (value == null) return;
    try {
      final rows = await widget.repository.listDivisions(value);
      if (mounted) setState(() => _divisions = rows);
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _loadingDivisions = false);
    }
  }

  void _chooseSupplier(String? value) {
    _supplierId = value;
    for (final supplier in widget.data.suppliers) {
      if (supplier['id']?.toString() == value) {
        _supplierName.text = supplier['name']?.toString() ?? '';
        return;
      }
    }
    _supplierName.clear();
  }

  double get _total => _lines.fold<double>(
        0,
        (sum, line) =>
            sum + _number(line.received.text) * _number(line.price.text),
      );

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    if (_projectId == null || _supplierName.text.trim().isEmpty) {
      setState(() => _error = 'Pilih proyek dan isi nama supplier.');
      return;
    }
    if (!_validDate(_date.text)) {
      setState(() => _error = 'Tanggal pembelian harus berformat YYYY-MM-DD.');
      return;
    }
    final items = <Map<String, dynamic>>[];
    for (var index = 0; index < _lines.length; index++) {
      final line = _lines[index];
      Map<String, dynamic>? material;
      for (final row in widget.data.materials) {
        if (row['id']?.toString() == line.materialId) {
          material = row;
          break;
        }
      }
      final received = _number(line.received.text);
      final damaged = _number(line.damaged.text);
      final price = _number(line.price.text);
      if (material == null || received <= 0 ||
          damaged < 0 || damaged > received || price < 0) {
        setState(() => _error =
            'Periksa material, jumlah, barang rusak, dan harga pada baris ' +
            (index + 1).toString() + '.');
        return;
      }
      items.add({
        'material_id': material['id'],
        'material_code': material['code'],
        'material_name': material['name'],
        'unit': material['unit'],
        'quantity_received': received,
        'quantity_damaged': damaged,
        'unit_price': price,
        'notes': null,
      });
    }
    if (_total <= 0) {
      setState(() => _error = 'Total pembelian harus lebih besar dari nol.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.repository.recordPurchase(
        projectId: _projectId!,
        purchaseDate: _date.text,
        supplierId: _supplierId,
        supplierName: _supplierName.text,
        divisionId: _divisionId,
        invoiceNumber: _invoice.text,
        paymentMethod: _method,
        referenceNumber: _reference.text,
        notes: _notes.text,
        items: items,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Form Pembelian Langsung')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null) _ErrorBox(message: _error!),
            DropdownButtonFormField<String>(
              value: _projectId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Proyek tujuan',
                prefixIcon: Icon(Icons.apartment_outlined),
              ),
              items: widget.data.projects.map((row) => DropdownMenuItem(
                value: row['id'].toString(),
                child: Text(row['title']?.toString() ?? 'Proyek',
                    overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: _saving ? null : _setProject,
              validator: (value) => value == null ? 'Pilih proyek.' : null,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _supplierId ?? '',
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Supplier terdaftar (opsional)',
                prefixIcon: Icon(Icons.store_outlined),
              ),
              items: [
                const DropdownMenuItem<String>(
                  value: '',
                  child: Text('Supplier lain / tidak ada di master'),
                ),
                ...widget.data.suppliers.map((row) => DropdownMenuItem(
                  value: row['id'].toString(),
                  child: Text(row['name']?.toString() ?? 'Supplier',
                      overflow: TextOverflow.ellipsis),
                )),
              ],
              onChanged: _saving
                  ? null
                  : (value) => setState(() =>
                      _chooseSupplier(value == null || value.isEmpty ? null : value)),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _supplierName,
              decoration: const InputDecoration(
                labelText: 'Nama supplier / toko',
                prefixIcon: Icon(Icons.business_outlined),
              ),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Nama supplier wajib diisi.' : null,
            ),
            const SizedBox(height: 10),
            if (_loadingDivisions)
              const LinearProgressIndicator()
            else
              DropdownButtonFormField<String>(
                value: _divisionId ?? '',
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Divisi RAB (opsional)',
                  prefixIcon: Icon(Icons.account_tree_outlined),
                ),
                items: [
                  const DropdownMenuItem<String>(
                    value: '', child: Text('Belum dialokasikan')),
                  ..._divisions.map((row) => DropdownMenuItem(
                    value: row['id'].toString(),
                    child: Text(row['name']?.toString() ?? 'Divisi',
                        overflow: TextOverflow.ellipsis),
                  )),
                ],
                onChanged: _saving ? null : (value) => setState(() =>
                    _divisionId = value == null || value.isEmpty ? null : value),
              ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _date,
              decoration: const InputDecoration(
                labelText: 'Tanggal pembelian (YYYY-MM-DD)',
                prefixIcon: Icon(Icons.calendar_today_outlined),
              ),
              validator: (value) => _validDate(value) ? null : 'Tanggal tidak valid.',
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                const Expanded(
                  child: Text('Material yang dibeli',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                ),
                TextButton.icon(
                  onPressed: _saving ? null : () =>
                      setState(() => _lines.add(_PurchaseLine())),
                  icon: const Icon(Icons.add),
                  label: const Text('Tambah'),
                ),
              ],
            ),
            ...List.generate(_lines.length, (index) => _lineCard(index)),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: Text('Total pembelian: ' + _money(_total),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 14),
            TextFormField(controller: _invoice,
                decoration: const InputDecoration(labelText: 'Nomor faktur / nota')),
            const SizedBox(height: 10),
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
            const SizedBox(height: 10),
            TextFormField(controller: _reference,
                decoration: const InputDecoration(labelText: 'Nomor referensi pembayaran')),
            const SizedBox(height: 10),
            TextFormField(controller: _notes, minLines: 2, maxLines: 4,
                decoration: const InputDecoration(labelText: 'Catatan pembelian')),
            const SizedBox(height: 14),
            const _InfoBox(
              text: 'Jumlah diterima mencakup barang rusak. Sistem menghitung jumlah layak pakai, '
                  'menambah stok, dan mencatat kas keluar secara otomatis.',
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _saving || _loadingDivisions ? null : _save,
              icon: _saving
                  ? const SizedBox.square(dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Menyimpan...' : 'Simpan pembelian'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lineCard(int index) {
    final line = _lines[index];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Material ' + (index + 1).toString(),
                    style: const TextStyle(fontWeight: FontWeight.w800))),
                if (_lines.length > 1)
                  IconButton(
                    tooltip: 'Hapus material',
                    onPressed: _saving ? null :
                        () => setState(() => _lines.removeAt(index).dispose()),
                    icon: const Icon(Icons.delete_outline,
                        color: Color(0xFFB64E42)),
                  ),
              ],
            ),
            DropdownButtonFormField<String>(
              value: line.materialId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Master material',
                prefixIcon: Icon(Icons.inventory_2_outlined),
              ),
              items: widget.data.materials.map((row) => DropdownMenuItem(
                value: row['id'].toString(),
                child: Text((row['code']?.toString() ?? '') + ' · ' +
                    (row['name']?.toString() ?? 'Material'),
                    overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: _saving ? null : (value) {
                setState(() {
                  line.materialId = value;
                  for (final material in widget.data.materials) {
                    if (material['id']?.toString() == value) {
                      line.price.text =
                          _number(material['unit_price']).toStringAsFixed(0);
                      break;
                    }
                  }
                });
              },
              validator: (value) => value == null ? 'Pilih material.' : null,
            ),
            const SizedBox(height: 9),
            Row(
              children: [
                Expanded(child: TextFormField(
                  controller: line.received,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Diterima'),
                  validator: (value) => _number(value) <= 0
                      ? 'Jumlah tidak valid.' : null,
                )),
                const SizedBox(width: 8),
                Expanded(child: TextFormField(
                  controller: line.damaged,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Rusak'),
                  validator: (value) {
                    final damaged = _number(value);
                    final received = _number(line.received.text);
                    return damaged < 0 || damaged > received
                        ? 'Jumlah tidak valid.' : null;
                  },
                )),
                const SizedBox(width: 8),
                Expanded(child: TextFormField(
                  controller: line.price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Harga satuan'),
                  validator: (value) => _number(value) < 0
                      ? 'Harga tidak valid.' : null,
                )),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PurchaseLine {
  String? materialId;
  final received = TextEditingController(text: '1');
  final damaged = TextEditingController(text: '0');
  final price = TextEditingController(text: '0');

  void dispose() {
    received.dispose();
    damaged.dispose();
    price.dispose();
  }
}

class _PurchaseCard extends StatelessWidget {
  const _PurchaseCard({required this.row, required this.onPdf, required this.onVoid});

  final Map<String, dynamic> row;
  final VoidCallback onPdf;
  final VoidCallback? onVoid;

  @override
  Widget build(BuildContext context) {
    final confirmed = row['status'] == 'confirmed';
    final items = _rows(row['items']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(
                row['purchase_number']?.toString() ?? 'Pembelian',
                style: const TextStyle(fontWeight: FontWeight.w900))),
              _StatusTag(text: confirmed ? 'Terkonfirmasi' : 'Dibatalkan',
                  warning: !confirmed),
            ]),
            Text((row['project_title']?.toString() ?? 'Proyek') + ' · ' +
                (row['supplier_name']?.toString() ?? 'Supplier'),
                style: const TextStyle(fontSize: 11, color: Color(0xFF687970))),
            Text((row['purchase_date']?.toString() ?? '-') + ' · ' +
                (row['invoice_number']?.toString().isNotEmpty == true
                    ? 'Faktur ' + row['invoice_number'].toString()
                    : 'Tanpa nomor faktur'),
                style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
            const Divider(height: 18),
            ...items.map((item) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Expanded(child: Text(
                  item['material_name']?.toString() ?? 'Material',
                  style: const TextStyle(fontSize: 11))),
                Text(_qty(item['quantity_accepted']) + ' ' +
                    (item['unit']?.toString() ?? ''),
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
              ]),
            )),
            const Divider(height: 18),
            Row(children: [
              Expanded(child: Text(_money(row['total_amount']),
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15))),
              IconButton(tooltip: 'Bukti pembelian PDF', onPressed: onPdf,
                  icon: const Icon(Icons.picture_as_pdf_outlined,
                      color: Color(0xFFB64E42))),
              if (onVoid != null)
                IconButton(tooltip: 'Batalkan pembelian', onPressed: onVoid,
                    icon: const Icon(Icons.block_outlined,
                        color: Color(0xFFB64E42))),
            ]),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: const Color(0xFF2F7166)),
        const SizedBox(height: 9),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
        Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF687970))),
      ]),
    ),
  );
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFF0F5F2),
        borderRadius: BorderRadius.circular(12)),
    child: Text(text, style: const TextStyle(
        fontSize: 11, color: Color(0xFF53665D), height: 1.45)),
  );
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFFFEEEE),
        borderRadius: BorderRadius.circular(12)),
    child: Text(message, style: const TextStyle(
        fontSize: 12, color: Color(0xFF9D3636))),
  );
}

class _EmptyPurchase extends StatelessWidget {
  const _EmptyPurchase({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(22),
    child: Column(children: [
      const Icon(Icons.receipt_long_outlined, size: 38,
          color: Color(0xFF87958F)),
      const SizedBox(height: 8),
      Text(message, textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: Color(0xFF687970))),
    ]),
  );
}

class _StatusTag extends StatelessWidget {
  const _StatusTag({required this.text, required this.warning});
  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: warning ? const Color(0xFFFFEDEC) : const Color(0xFFEAF2EF),
      borderRadius: BorderRadius.circular(30)),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      child: Text(text, style: TextStyle(fontSize: 9,
          fontWeight: FontWeight.w800,
          color: warning ? const Color(0xFFB64E42) : const Color(0xFF285F52))),
    ),
  );
}

class _PurchaseError extends StatelessWidget {
  const _PurchaseError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off_outlined, size: 40),
        const SizedBox(height: 10),
        const Text('Data pembelian belum dapat dimuat',
            style: TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh),
            label: const Text('Coba lagi')),
      ]),
    ),
  );
}

List<Map<String, dynamic>> _rows(dynamic value) {
  if (value is! List) return <Map<String, dynamic>>[];
  return value.whereType<Map>()
      .map((row) => Map<String, dynamic>.from(row)).toList();
}

double _number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString().replaceAll(',', '.') ?? '') ?? 0;
}

String _qty(dynamic value) {
  final number = _number(value);
  return number == number.roundToDouble()
      ? number.toStringAsFixed(0) : number.toStringAsFixed(2);
}

String _money(dynamic value) {
  final digits = _number(value).round().toString();
  final buffer = StringBuffer();
  for (var index = 0; index < digits.length; index++) {
    buffer.write(digits[index]);
    final remaining = digits.length - index - 1;
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

bool _validDate(String? value) {
  if (value == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
    return false;
  }
  return DateTime.tryParse(value) != null;
}

String _friendlyError(Object error) {
  final raw = error.toString().replaceFirst('Exception: ', '').trim();
  if (raw.contains('42501') ||
      raw.toLowerCase().contains('permission denied') ||
      raw.toLowerCase().contains('row-level security')) {
    return 'Akun ini belum memiliki permission pembelian material langsung.';
  }
  return raw.isEmpty
      ? 'Terjadi kesalahan. Periksa koneksi lalu coba kembali.'
      : raw;
}
