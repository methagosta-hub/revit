import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

class DahliaDocumentPdf {
  static Future<void> shareWarehouseReceipt(Map<String, dynamic> receipt) async {
    final project = _relatedTitle(receipt['project']);
    final po = _relatedTitle(receipt['purchase_order'], field: 'po_number');
    final items = _rows(receipt['items']);
    final rows = items.map((item) {
      final poItem = _first(item['purchase_order_item']);
      return [
        poItem?['material_code']?.toString() ?? '-',
        poItem?['material_name']?.toString() ?? 'Material',
        poItem?['unit']?.toString() ?? '-',
        _qty(item['quantity_received']),
        _qty(item['quantity_damaged']),
        _qty(item['quantity_accepted']),
      ];
    }).toList(growable: false);
    await _shareRecord(
      title: 'BERITA ACARA PENERIMAAN MATERIAL',
      number: receipt['receipt_number']?.toString() ?? '-',
      project: project,
      reference: 'Purchase Order: ' + po + ' | Surat Jalan: ' + (receipt['delivery_note_no']?.toString() ?? '-'),
      date: receipt['received_at']?.toString() ?? '',
      headers: const ['Kode', 'Nama Material', 'Satuan', 'Diterima', 'Rusak', 'Diterima Baik'],
      rows: rows,
      notes: receipt['notes']?.toString() ?? '',
      fileName: 'BA-Penerimaan-' + (receipt['receipt_number']?.toString() ?? 'material') + '.pdf',
      receiverLabel: 'Petugas Gudang',
      handoverLabel: 'Pengirim / Supplier',
    );
  }

  static Future<void> shareWarehouseIssue(Map<String, dynamic> issue) async {
    final items = _rows(issue['items']);
    final rows = items.map((item) {
      final division = _first(item['division']);
      return [
        item['material_name']?.toString() ?? 'Material',
        item['unit']?.toString() ?? '-',
        _qty(item['quantity_issued']),
        division?['name']?.toString() ?? '-',
      ];
    }).toList(growable: false);
    await _shareRecord(
      title: 'BERITA ACARA PENGELUARAN MATERIAL',
      number: issue['issue_number']?.toString() ?? '-',
      project: _relatedTitle(issue['project']),
      reference: 'Penerima: ' + (issue['recipient_name']?.toString() ?? '-'),
      date: issue['issued_at']?.toString() ?? '',
      headers: const ['Nama Material', 'Satuan', 'Jumlah Keluar', 'Divisi / Lokasi RAB'],
      rows: rows,
      notes: issue['notes']?.toString() ?? '',
      fileName: 'BA-Pengeluaran-' + (issue['issue_number']?.toString() ?? 'material') + '.pdf',
      receiverLabel: 'Penerima Material',
      handoverLabel: 'Petugas Gudang',
    );
  }

  static Future<void> shareFinanceRecap(Map<String, dynamic> document) async {
    final snapshot = _map(document['snapshot']);
    final summary = _map(snapshot['summary']);
    final cash = _rows(snapshot['cash_transactions']);
    final orders = _rows(snapshot['purchase_orders']);
    final payments = _rows(snapshot['supplier_payments']);
    final rows = <List<String>>[
      ['Kas Masuk', _money(summary['cash_in'])],
      ['Kas Keluar', _money(summary['cash_out'])],
      ['Saldo Arus Kas', _money(summary['net_cash'])],
      ['Komitmen PO', _money(summary['po_commitment'])],
      ['Pembayaran Supplier', _money(summary['supplier_paid'])],
      ['Jumlah Transaksi Kas', summary['transaction_detail_count']?.toString() ?? '0'],
      ['Jumlah Purchase Order', summary['po_count']?.toString() ?? '0'],
      ['Jumlah Pembayaran', summary['payment_detail_count']?.toString() ?? '0'],
    ];
    final pdf = pw.Document();
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => [
        _heading('REKAP KEUANGAN DAHLIA'),
        pw.SizedBox(height: 6),
        pw.Text(document['recap_number']?.toString() ?? '-', style: const pw.TextStyle(fontSize: 11)),
        pw.SizedBox(height: 12),
        _meta('Laporan', snapshot['report_title']?.toString() ?? document['report_title']?.toString() ?? 'Rekap Keuangan'),
        _meta('Cakupan', snapshot['scope_label']?.toString() ?? document['scope_type']?.toString() ?? '-'),
        _meta('Periode', (snapshot['period_start']?.toString() ?? '-') + ' s.d. ' + (snapshot['period_end']?.toString() ?? '-')),
        _meta('Proyek', snapshot['project_title']?.toString() ?? 'Seluruh perusahaan'),
        _meta('Dibuat', snapshot['generated_at']?.toString() ?? document['created_at']?.toString() ?? '-'),
        pw.SizedBox(height: 14),
        _section('Ringkasan'),
        _table(const ['Komponen', 'Nilai'], rows),
        pw.SizedBox(height: 14),
        _section('Mutasi Kas'),
        _table(
          const ['Tanggal', 'Nomor', 'Arah', 'Kategori', 'Jumlah', 'Status'],
          cash.map((row) => [
            row['transaction_date']?.toString() ?? '-',
            row['transaction_number']?.toString() ?? '-',
            row['direction']?.toString() == 'in' ? 'Masuk' : 'Keluar',
            row['category']?.toString() ?? '-',
            _money(row['amount']),
            row['status']?.toString() ?? '-',
          ]).toList(),
        ),
        pw.SizedBox(height: 14),
        _section('Purchase Order'),
        _table(
          const ['Nomor PO', 'Tanggal', 'Supplier', 'Nilai', 'Dibayar', 'Sisa'],
          orders.map((row) => [
            row['po_number']?.toString() ?? '-',
            row['order_date']?.toString() ?? '-',
            row['supplier_name']?.toString() ?? '-',
            _money(row['subtotal']),
            _money(row['paid_total']),
            _money(row['remaining']),
          ]).toList(),
        ),
        pw.SizedBox(height: 14),
        _section('Pembayaran Supplier'),
        _table(
          const ['Nomor', 'Tanggal', 'Supplier', 'PO', 'Jumlah', 'Status'],
          payments.map((row) => [
            row['payment_number']?.toString() ?? '-',
            row['payment_date']?.toString() ?? '-',
            row['supplier_name']?.toString() ?? '-',
            row['po_number']?.toString() ?? '-',
            _money(row['amount']),
            row['status']?.toString() ?? '-',
          ]).toList(),
        ),
        pw.SizedBox(height: 14),
        if (snapshot['accounting_notes'] is List)
          _section('Catatan Rekap'),
        if (snapshot['accounting_notes'] is List)
          ..._rowsFromList(snapshot['accounting_notes']).map((row) => pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 3),
            child: pw.Text('- ' + row.first, style: const pw.TextStyle(fontSize: 9)),
          )),
        pw.SizedBox(height: 24),
        pw.Text('Dokumen ini merupakan salinan PDF dari snapshot rekap yang tersimpan di Dahlia.',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
      ],
    ));
    await Printing.sharePdf(
      bytes: await pdf.save(),
      filename: 'Rekap-' + (document['recap_number']?.toString() ?? 'Keuangan') + '.pdf',
    );
  }

  static Future<void> _shareRecord({
    required String title,
    required String number,
    required String project,
    required String reference,
    required String date,
    required List<String> headers,
    required List<List<String>> rows,
    required String notes,
    required String fileName,
    required String receiverLabel,
    required String handoverLabel,
  }) async {
    final pdf = pw.Document();
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => [
        _heading('DAHLIA MANAGEMENT SYSTEM'),
        pw.SizedBox(height: 18),
        pw.Center(child: pw.Text(title, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold))),
        pw.SizedBox(height: 8),
        pw.Center(child: pw.Text('Nomor: ' + number, style: const pw.TextStyle(fontSize: 10))),
        pw.SizedBox(height: 18),
        _meta('Proyek', project),
        _meta('Tanggal', _dateTime(date)),
        _meta('Referensi', reference),
        pw.SizedBox(height: 16),
        _section('Rincian Material'),
        _table(headers, rows),
        if (notes.trim().isNotEmpty) ...[
          pw.SizedBox(height: 14),
          _section('Catatan'),
          pw.Text(notes, style: const pw.TextStyle(fontSize: 9)),
        ],
        pw.SizedBox(height: 36),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(child: _signature(receiverLabel)),
            pw.SizedBox(width: 24),
            pw.Expanded(child: _signature(handoverLabel)),
          ],
        ),
        pw.SizedBox(height: 20),
        pw.Text('Dokumen dibuat dari transaksi yang tersimpan di Dahlia. Tandatangani setelah pemeriksaan fisik.',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
      ],
    ));
    await Printing.sharePdf(bytes: await pdf.save(), filename: fileName);
  }

  static pw.Widget _heading(String value) => pw.Text(
    value,
    style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: PdfColors.teal800),
  );

  static pw.Widget _section(String value) => pw.Padding(
    padding: const pw.EdgeInsets.only(bottom: 7),
    child: pw.Text(value, style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
  );

  static pw.Widget _meta(String label, String value) => pw.Padding(
    padding: const pw.EdgeInsets.only(bottom: 4),
    child: pw.Row(children: [
      pw.SizedBox(width: 82, child: pw.Text(label, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
      pw.Expanded(child: pw.Text(value, style: const pw.TextStyle(fontSize: 9))),
    ]),
  );

  static pw.Widget _signature(String label) => pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.center,
    children: [
      pw.Text(label, style: const pw.TextStyle(fontSize: 9)),
      pw.SizedBox(height: 58),
      pw.Container(width: 150, height: 0.7, color: PdfColors.grey700),
      pw.SizedBox(height: 4),
      pw.Text('(Nama dan tanda tangan)', style: const pw.TextStyle(fontSize: 8)),
    ],
  );

  static pw.Widget _table(List<String> headers, List<List<String>> rows) {
    final normalized = rows.isEmpty ? [headers.map((_) => '-').toList()] : rows;
    return pw.Table(
      border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
      columnWidths: {
        for (var i = 0; i < headers.length; i++) i: const pw.FlexColumnWidth(),
      },
      children: [
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: PdfColors.grey200),
          children: headers.map((value) => pw.Padding(
            padding: const pw.EdgeInsets.all(5),
            child: pw.Text(value, style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold)),
          )).toList(),
        ),
        ...normalized.map((row) => pw.TableRow(
          children: List.generate(headers.length, (index) => pw.Padding(
            padding: const pw.EdgeInsets.all(5),
            child: pw.Text(index < row.length ? row[index] : '-', style: const pw.TextStyle(fontSize: 8)),
          )),
        )),
      ],
    );
  }

  static Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  static Map<String, dynamic>? _first(dynamic value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is List && value.isNotEmpty && value.first is Map) {
      return Map<String, dynamic>.from(value.first as Map);
    }
    return null;
  }

  static String _relatedTitle(dynamic value, {String field = 'title'}) =>
      _first(value)?[field]?.toString() ?? '-';

  static List<Map<String, dynamic>> _rows(dynamic value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  static List<List<String>> _rowsFromList(dynamic value) {
    if (value is! List) return <List<String>>[];
    return value.map((item) => [item.toString()]).toList();
  }

  static String _qty(dynamic value) {
    final number = _number(value);
    return number == number.roundToDouble() ? number.toStringAsFixed(0) : number.toStringAsFixed(2);
  }

  static String _money(dynamic value) => 'Rp ' + _number(value).toStringAsFixed(0);

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String _dateTime(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return value.isEmpty ? '-' : value;
    return parsed.toLocal().toString().substring(0, 16);
  }
}
