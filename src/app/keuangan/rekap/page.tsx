'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, Archive, ArrowDownLeft, ArrowUpRight, BadgeCheck, Building2,
  CalendarDays, Check, Download, FileBarChart2, FileText,
  Layers3, LoaderCircle, RefreshCw, Save, ShieldCheck, Wallet,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { buildBusinessDocumentFilename } from '@/lib/documents/filename';
import {
  assignFinanceDivision,
  createFinanceRecap,
  replaceFinanceRecap,
  fetchFinanceRecapDocuments,
  fetchRecapDivisions,
  fetchRecapProjects,
  fetchUnallocatedFinanceReferences,
  voidFinanceRecap,
} from '@/lib/services/financeRecapService';
import type {
  FinanceRecapDocument,
  FinanceRecapDivision,
  FinanceRecapProject,
  FinanceRecapScope,
  FinanceRecapSnapshot,
  UnallocatedFinanceReference,
} from '@/types/financeRecap';

const money = (value: number | string | null | undefined) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(value ?? 0));
const dateOnly = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const dateTime = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthStart = () => `${today().slice(0, 7)}-01`;
const paymentLabel = (value: string) => value === 'bank_transfer' ? 'Transfer bank' : value === 'cash' ? 'Tunai' : 'Lainnya';
const statusLabel = (value: string) => ({
  confirmed: 'Terkonfirmasi', paid: 'Dibayar', void: 'Dibatalkan',
  approved: 'Disetujui', ordered: 'Dipesan', partially_received: 'Diterima sebagian', received: 'Diterima',
}[value] ?? value);

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';
const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

type ScopeForm = {
  scope_type: FinanceRecapScope;
  project_id: string;
  rab_division_id: string;
  period_start: string;
  period_end: string;
  report_title: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

function filenamePart(value: unknown, maxLength = 48): string {
  const clean = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return clean || 'TANPA-KETERANGAN';
}

function buildPdfFilename(document: FinanceRecapDocument): string {
  const report = document.snapshot;
  let scopePart = 'GLOBAL-PERUSAHAAN';
  if (document.scope_type === 'consolidated') {
    scopePart = 'KONSOLIDASI-SELURUH-PERUSAHAAN';
  } else if (document.scope_type === 'project') {
    scopePart = `PROYEK-${filenamePart(report.project_title || report.scope_label, 52)}`;
  } else if (document.scope_type === 'division') {
    scopePart = `DIVISI-${filenamePart(report.project_title || 'PROYEK', 34)}-${filenamePart(report.division_name || report.scope_label, 34)}`;
  }

  return buildBusinessDocumentFilename({
    code: document.recap_number,
    title: `${scopePart}-${report.report_title}`,
    revision: 1,
  });
}

function renderPdfHtml(document: FinanceRecapDocument, suggestedFilename: string): string {
  const report = document.snapshot;
  const s = report.summary;
  const amount = (value: number | string | null | undefined) => money(value);
  const cell = (value: unknown) => `<td>${escapeHtml(value ?? '-')}</td>`;
  const cashRows = report.cash_transactions.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      ${cell(dateOnly(row.transaction_date))}
      <td><strong>${escapeHtml(row.transaction_number)}</strong><small>${escapeHtml(row.category)}</small></td>
      <td>${escapeHtml(row.description)}${row.purchase_order_number ? `<small>PO ${escapeHtml(row.purchase_order_number)} · ${escapeHtml(row.supplier_name ?? '')}</small>` : ''}${row.reference_number ? `<small>Ref: ${escapeHtml(row.reference_number)}</small>` : ''}</td>
      <td>${escapeHtml(row.project_title ?? 'Perusahaan')}${row.division_name ? `<small>${escapeHtml(row.division_name)}</small>` : ''}</td>
      <td class="right">${row.direction === 'in' ? escapeHtml(amount(row.amount)) : '—'}</td>
      <td class="right">${row.direction === 'out' ? escapeHtml(amount(row.amount)) : '—'}</td>
      <td><span class="status ${row.status === 'void' ? 'void' : 'active'}">${escapeHtml(statusLabel(row.status))}</span></td>
    </tr>`).join('');
  const poRows = report.purchase_orders.map((po, index) => {
    const itemRows = (po.items ?? []).map((item) => `<tr class="item-row"><td colspan="2">${escapeHtml(item.material_code ?? '')} · ${escapeHtml(item.material_name)} (${escapeHtml(item.unit)})</td><td class="right">${escapeHtml(item.quantity_ordered)}</td><td class="right">${escapeHtml(amount(item.unit_price))}</td><td class="right">${escapeHtml(amount(item.line_total))}</td></tr>`).join('');
    return `<tr><td class="center">${index + 1}</td><td><strong>${escapeHtml(po.po_number)}</strong><small>${escapeHtml(dateOnly(po.order_date))} · ${escapeHtml(statusLabel(po.status))}</small></td><td>${escapeHtml(po.project_title)}${po.division_name ? `<small>${escapeHtml(po.division_name)}</small>` : ''}</td><td>${escapeHtml(po.supplier_name)}</td><td class="right">${escapeHtml(amount(po.subtotal))}</td><td class="right">${escapeHtml(amount(po.paid_total))}</td><td class="right">${escapeHtml(amount(po.remaining))}</td></tr>${itemRows}`;
  }).join('');
  const paymentRows = report.supplier_payments.map((payment, index) => `<tr><td class="center">${index + 1}</td><td><strong>${escapeHtml(payment.payment_number)}</strong><small>${escapeHtml(dateOnly(payment.payment_date))}</small></td><td>${escapeHtml(payment.po_number)}</td><td>${escapeHtml(payment.supplier_name)}<small>${escapeHtml(payment.project_title)}${payment.division_name ? ` · ${escapeHtml(payment.division_name)}` : ''}</small></td><td>${escapeHtml(paymentLabel(payment.payment_method))}${payment.reference_number ? `<small>Ref: ${escapeHtml(payment.reference_number)}</small>` : ''}</td><td class="right">${escapeHtml(amount(payment.amount))}</td><td>${escapeHtml(statusLabel(payment.status))}</td></tr>`).join('');
  const unallocatedCash = report.unallocated_cash_transactions.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${escapeHtml(row.transaction_number)}<small>${escapeHtml(dateOnly(row.transaction_date))}</small></td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.direction === 'in' ? 'Kas masuk' : 'Kas keluar')}</td><td class="right">${escapeHtml(amount(row.amount))}</td></tr>`).join('');
  const unallocatedPo = report.unallocated_purchase_orders.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${escapeHtml(row.po_number)}<small>${escapeHtml(dateOnly(row.order_date))}</small></td><td>${escapeHtml(row.supplier_name)}</td><td>${escapeHtml(statusLabel(row.status))}</td><td class="right">${escapeHtml(amount(row.subtotal))}</td></tr>`).join('');
  const unallocatedCount = s.unallocated_cash_count + s.unallocated_po_count;
  const accountingNotes = [
    `Laporan ini mencakup ${report.scope_label} untuk periode ${dateOnly(report.period_start)} sampai ${dateOnly(report.period_end)}.`,
    'Kas masuk dan kas keluar yang telah dikonfirmasi dihitung dalam ringkasan arus kas.',
    'Transaksi yang dibatalkan tetap dicantumkan sebagai riwayat, tetapi tidak diperhitungkan dalam jumlah kas aktif.',
    'Pembayaran supplier sudah tercatat sebagai kas keluar. Rincian pembayaran ditampilkan kembali sebagai informasi pendukung dan tidak dijumlahkan untuk kedua kalinya.',
    'Nilai Purchase Order menunjukkan komitmen pembelian. Nilai tersebut bukan pengeluaran kas sampai pembayaran benar-benar dilakukan.',
    ...(document.scope_type === 'company' ? ['Rekap Global Perusahaan hanya mencakup pemasukan dan pengeluaran operasional yang tidak dibebankan kepada proyek tertentu.'] : []),
    ...(document.scope_type === 'consolidated' ? ['Rekap konsolidasi menggabungkan transaksi operasional perusahaan dan seluruh proyek.'] : []),
    ...(document.scope_type === 'division' ? ['Rekap divisi hanya memuat transaksi yang telah ditetapkan ke divisi atau lokasi pekerjaan yang dipilih. Dokumen yang belum mendapat pembagian ditampilkan secara terpisah.'] : []),
    ...(unallocatedCount > 0 ? [`Terdapat ${unallocatedCount} dokumen proyek yang belum ditetapkan ke divisi pekerjaan. Dokumen tersebut tidak dimasukkan ke jumlah divisi terpilih agar tidak salah pembebanan.`] : []),
    `Laporan ini menggambarkan catatan yang tersedia saat diterbitkan pada ${dateTime(document.created_at)}. Perubahan atau transaksi yang dicatat setelah waktu tersebut tidak mengubah dokumen ini.`,
    'Cetakan rekap ini tidak memberikan permission baru dan bukan instruksi pencairan. Otorisasi tetap mengikuti status transaksi sumber dan persetujuan pengguna yang berwenang.',
    ...(document.replaces_recap_id ? [`Dokumen ini merupakan rekap pengganti dari ${document.previous_recap_number ?? document.replaces_recap_id}. Alasan penerbitan: ${document.replacement_reason ?? 'Tidak dicantumkan'}.`] : []),
  ];
  const noteRows = accountingNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(suggestedFilename)}</title>
  <style>
    @page{size:A4 portrait;margin:14mm 13mm 16mm}
    *{box-sizing:border-box}html,body{margin:0;padding:0;color:#162231;font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.42;background:#fff}
    .topline{height:7px;background:linear-gradient(90deg,#064e3b,#10b981,#d6a84f);margin-bottom:15px}
    .brand{display:flex;align-items:center;gap:10px;border-bottom:1px solid #dbe4e1;padding-bottom:10px}
    .monogram{width:42px;height:42px;border-radius:12px;background:#073f32;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17pt;letter-spacing:-1px}
    .brandname{font-weight:800;font-size:10pt;letter-spacing:1.2px;color:#0b4235}.brandline{font-size:7pt;color:#6b7b79;letter-spacing:1px;margin-top:2px}
    .confidential{margin-left:auto;font-size:7pt;color:#788581;text-align:right;letter-spacing:.7px}
    .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:18px 0 13px}
    .eyebrow{font-size:7pt;letter-spacing:1.5px;color:#0b8767;font-weight:800;text-transform:uppercase}
    h1{font-size:22pt;line-height:1.1;margin:4px 0 5px;color:#102b25;letter-spacing:-.5px}
    .subtitle{font-size:8pt;color:#62716f}
    .numberbox{min-width:170px;border:1px solid #cbded7;background:#f3faf6;padding:9px 11px;border-radius:9px;text-align:right}
    .numberbox span{display:block;color:#678077;font-size:6.5pt;text-transform:uppercase;letter-spacing:1px}.numberbox strong{display:block;color:#065f46;font-size:10pt;margin-top:4px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;padding:10px 12px;border:1px solid #dce7e2;border-radius:9px;background:#fbfdfc}
    .meta label{display:block;font-size:6.5pt;text-transform:uppercase;color:#82908c;letter-spacing:.6px}.meta strong{display:block;font-size:8.5pt;color:#263c36;margin-top:2px}
    .section{margin-top:16px;break-inside:auto}.sectionhead{display:flex;align-items:center;gap:8px;border-bottom:1.5px solid #0d7759;padding-bottom:6px;margin-bottom:8px}.sectionnum{width:20px;height:20px;border-radius:6px;background:#e2f4ec;color:#087456;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:8pt}.sectionhead h2{font-size:10pt;margin:0;color:#153a30}.sectionhead p{margin:1px 0 0;color:#81908b;font-size:7pt}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.metric{border:1px solid #dce7e2;border-radius:8px;padding:9px 10px;background:#fff}.metric label{font-size:6.5pt;text-transform:uppercase;letter-spacing:.5px;color:#81908b}.metric strong{display:block;font-size:11pt;color:#143c30;margin-top:5px}.metric.in strong{color:#047857}.metric.out strong{color:#be3434}
    table{width:100%;border-collapse:collapse;font-size:7.4pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#103e32;color:#fff;text-align:left;padding:7px 5px;font-size:6.5pt;text-transform:uppercase;letter-spacing:.35px}td{border-bottom:1px solid #e6ece9;padding:6px 5px;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fbf9}td small{display:block;color:#81908b;font-size:6.5pt;margin-top:2px}.center{text-align:center}.right{text-align:right;white-space:nowrap}.status{display:inline-block;padding:2px 5px;border-radius:10px;font-size:6pt;font-weight:700}.status.active{background:#e7f7ef;color:#08724f}.status.void{background:#f1f2f3;color:#737b81}.item-row td{font-size:6.8pt;color:#65756f;background:#fbfcfc;padding-top:4px;padding-bottom:4px}
    .summaryline{display:flex;justify-content:flex-end;gap:15px;margin-top:8px;padding:9px 11px;background:#edf7f2;border:1px solid #d2e9dd;border-radius:8px;font-weight:700;color:#124a39}.summaryline span{color:#0b7654}
    .warning{border:1px solid #efdaa5;background:#fffaf0;border-radius:8px;padding:10px 12px;color:#77531a;font-size:7.5pt;margin:8px 0}.warning strong{display:block;margin-bottom:3px}
    .notes{padding-left:15px;color:#687873;font-size:7pt}.notes li{margin:3px 0}.footer{border-top:1px solid #dce7e2;margin-top:20px;padding-top:8px;display:flex;justify-content:space-between;color:#8a9691;font-size:6.5pt}
    .empty{color:#88958f;text-align:center;padding:12px;border:1px dashed #d5dfda;border-radius:7px;font-size:8pt}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.section{break-inside:auto}thead{display:table-header-group}}
  </style></head><body>
  <div class="topline"></div>
  <header class="brand"><div class="monogram">D</div><div><div class="brandname">JAVAWASTHU MANAGEMENT</div><div class="brandline">PROJECT · PROCUREMENT · FINANCIAL CONTROL</div></div><div class="confidential">DOKUMEN INTERNAL<br>FINANCIAL REPORT</div></header>
  <div class="hero"><div><div class="eyebrow">Laporan keuangan terverifikasi</div><h1>${escapeHtml(report.report_title)}</h1><div class="subtitle">Rekap transaksi dan komitmen keuangan berdasarkan cakupan dan periode yang dipilih.</div></div><div class="numberbox"><span>Nomor rekap resmi</span><strong>${escapeHtml(document.recap_number)}</strong><span style="margin-top:5px">${document.status === 'active' ? 'DOKUMEN AKTIF' : 'DIBATALKAN'}</span></div></div>
  <div class="meta"><div><label>Cakupan laporan</label><strong>${escapeHtml(report.scope_label)}</strong></div><div><label>Periode laporan</label><strong>${escapeHtml(dateOnly(report.period_start))} — ${escapeHtml(dateOnly(report.period_end))}</strong></div><div><label>Klien / pemilik</label><strong>${escapeHtml(report.client ?? 'Laporan perusahaan')}</strong></div><div><label>Dibuat pada</label><strong>${escapeHtml(dateTime(document.created_at))}</strong></div></div>
  <div class="metrics"><div class="metric in"><label>Kas masuk aktif</label><strong>${escapeHtml(amount(s.cash_in))}</strong></div><div class="metric out"><label>Kas keluar aktif</label><strong>${escapeHtml(amount(s.cash_out))}</strong></div><div class="metric"><label>Arus kas bersih</label><strong>${escapeHtml(amount(s.net_cash))}</strong></div><div class="metric"><label>Komitmen PO</label><strong>${escapeHtml(amount(s.po_commitment))}</strong></div></div>
  <div class="section"><div class="sectionhead"><div class="sectionnum">01</div><div><h2>Buku Kas — Rincian Seluruh Transaksi</h2><p>${s.transaction_detail_count} baris transaksi, termasuk dokumen yang dibatalkan untuk jejak audit</p></div></div>
  ${cashRows ? `<table><thead><tr><th style="width:4%">No</th><th style="width:10%">Tanggal</th><th style="width:16%">Nomor / Kategori</th><th style="width:25%">Uraian / Referensi</th><th style="width:16%">Proyek / Divisi</th><th style="width:11%" class="right">Kas masuk</th><th style="width:11%" class="right">Kas keluar</th><th style="width:9%">Status</th></tr></thead><tbody>${cashRows}</tbody></table>` : '<div class="empty">Tidak ada transaksi kas pada periode ini.</div>'}
  <div class="summaryline"><div>Kas masuk: <span>${escapeHtml(amount(s.cash_in))}</span></div><div>Kas keluar: <span>${escapeHtml(amount(s.cash_out))}</span></div><div>Bersih: <span>${escapeHtml(amount(s.net_cash))}</span></div></div></div>
  <div class="section"><div class="sectionhead"><div class="sectionnum">02</div><div><h2>Komitmen Pengadaan — Purchase Order</h2><p>${s.po_count} PO aktif dalam periode; bukan arus kas sampai dibayar</p></div></div>
  ${poRows ? `<table><thead><tr><th style="width:5%">No</th><th style="width:16%">Nomor / Tanggal PO</th><th style="width:20%">Proyek / Divisi</th><th style="width:17%">Supplier</th><th class="right" style="width:14%">Nilai PO</th><th class="right" style="width:14%">Dibayar</th><th class="right" style="width:14%">Sisa</th></tr></thead><tbody>${poRows}</tbody></table>` : '<div class="empty">Tidak ada PO aktif pada periode ini.</div>'}
  <div class="summaryline">Total komitmen PO: <span>${escapeHtml(amount(s.po_commitment))}</span></div></div>
  <div class="section"><div class="sectionhead"><div class="sectionnum">03</div><div><h2>Rincian Pembayaran Supplier</h2><p>Informasi pendukung atas mutasi kas keluar, tidak dijumlahkan kembali</p></div></div>
  ${paymentRows ? `<table><thead><tr><th style="width:5%">No</th><th style="width:17%">Nomor / Tanggal</th><th style="width:12%">Nomor PO</th><th style="width:24%">Supplier / Proyek</th><th style="width:18%">Metode / Referensi</th><th style="width:15%" class="right">Jumlah</th><th style="width:9%">Status</th></tr></thead><tbody>${paymentRows}</tbody></table>` : '<div class="empty">Tidak ada pembayaran supplier dalam periode ini.</div>'}</div>
  ${unallocatedCount > 0 ? `<div class="section"><div class="sectionhead"><div class="sectionnum">04</div><div><h2>Transaksi Belum Dialokasikan ke Divisi</h2><p>Ditampilkan agar tidak hilang dari penelusuran; tidak masuk total divisi terpilih</p></div></div><div class="warning"><strong>Perhatian klasifikasi</strong>${unallocatedCount} dokumen proyek belum dikaitkan ke divisi RAB. Tetapkan divisi di halaman Rekap Keuangan agar dapat masuk ke rekap divisi yang tepat.</div>
  ${unallocatedCash ? `<h3 style="font-size:8pt;margin:8px 0 5px">Mutasi kas belum teralokasi</h3><table><thead><tr><th style="width:6%">No</th><th style="width:22%">Nomor / Tanggal</th><th>Uraian</th><th style="width:15%">Jenis</th><th style="width:18%" class="right">Jumlah</th></tr></thead><tbody>${unallocatedCash}</tbody></table>` : ''}
  ${unallocatedPo ? `<h3 style="font-size:8pt;margin:8px 0 5px">PO belum teralokasi</h3><table><thead><tr><th style="width:6%">No</th><th style="width:22%">Nomor / Tanggal</th><th>Supplier</th><th style="width:18%">Status</th><th style="width:18%" class="right">Nilai</th></tr></thead><tbody>${unallocatedPo}</tbody></table>` : ''}</div>` : ''}
  <div class="section"><div class="sectionhead"><div class="sectionnum">${unallocatedCount > 0 ? '05' : '04'}</div><div><h2>Catatan & Metodologi Pembukuan</h2><p>Dasar pembacaan dan batasan laporan</p></div></div><ul class="notes">${noteRows}</ul><ul class="notes"><li>Setiap laporan memiliki nomor dokumen tersendiri. Apabila laporan dengan cakupan dan periode yang sama sudah aktif, sistem akan membuka laporan tersebut agar tidak terjadi penerbitan ganda.</li><li>Jika diperlukan laporan pengganti setelah ada koreksi atau transaksi baru, gunakan aksi Terbitkan Rekap Pengganti. Sistem membatalkan dokumen lama dan membuat snapshot baru dalam satu proses transaksi database, dengan alasan serta hubungan dokumen tersimpan untuk audit.</li></ul></div>
  <footer class="footer"><span>JAVAWASTHU MANAGEMENT · Dokumen internal</span><span>${escapeHtml(document.recap_number)} · Halaman dicetak ${escapeHtml(dateTime(new Date().toISOString()))}</span></footer>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});</script>
  </body></html>`;
}

function exportPdf(document: FinanceRecapDocument) {
  const popup = window.open('', '_blank', 'width=1100,height=850');
  if (!popup) throw new Error('Jendela cetak diblokir browser. Izinkan pop-up untuk localhost, lalu ulangi.');
  const suggestedFilename = buildPdfFilename(document);
  popup.document.open();
  popup.document.write(renderPdfHtml(document, suggestedFilename));
  popup.document.close();
  return suggestedFilename;
}

function RecapContent() {
  const [projects, setProjects] = useState<FinanceRecapProject[]>([]);
  const [divisions, setDivisions] = useState<FinanceRecapDivision[]>([]);
  const [documents, setDocuments] = useState<FinanceRecapDocument[]>([]);
  const [unallocated, setUnallocated] = useState<UnallocatedFinanceReference[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ScopeForm>({
    scope_type: 'company', project_id: '', rab_division_id: '',
    period_start: monthStart(), period_end: today(), report_title: 'Rekap Keuangan',
  });
  const [selected, setSelected] = useState<FinanceRecapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [assigningId, setAssigningId] = useState('');

  const loadBase = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [projectRows, recapRows] = await Promise.all([fetchRecapProjects(), fetchFinanceRecapDocuments()]);
      setProjects(projectRows);
      setDocuments(recapRows);
      setSelected((current) => current ? recapRows.find((row) => row.id === current.id) ?? current : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data rekap.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadProjectMeta = useCallback(async (projectId: string) => {
    if (!projectId) { setDivisions([]); setUnallocated([]); return; }
    try {
      const [divisionRows, pendingRows] = await Promise.all([
        fetchRecapDivisions(projectId),
        fetchUnallocatedFinanceReferences(projectId),
      ]);
      setDivisions(divisionRows);
      setUnallocated(pendingRows);
      setAssignments({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat divisi dan alokasi.');
    }
  }, []);

  useEffect(() => {
    if (form.scope_type === 'company' || form.scope_type === 'consolidated') {
      setDivisions([]); setUnallocated([]); setForm((old) => ({ ...old, rab_division_id: '' }));
      return;
    }
    void loadProjectMeta(form.project_id);
  }, [form.project_id, form.scope_type, loadProjectMeta]);

  const selectedProject = projects.find((project) => project.id === form.project_id);
  const projectScoped = form.scope_type === 'project' || form.scope_type === 'division';
  const activeDocs = documents.filter((doc) => doc.status === 'active');
  const totalUnallocatedValue = useMemo(() => unallocated.reduce((sum, item) => sum + item.amount, 0), [unallocated]);

  function updateForm<K extends keyof ScopeForm>(key: K, value: ScopeForm[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    if (projectScoped && !form.project_id) { setError('Pilih proyek terlebih dahulu.'); return; }
    if (form.scope_type === 'division' && !form.rab_division_id) { setError('Pilih divisi/lokasi RAB.'); return; }
    if (form.period_end < form.period_start) { setError('Tanggal akhir tidak boleh sebelum tanggal awal.'); return; }
    setSaving(true);
    try {
      const doc = await createFinanceRecap({
        scope_type: form.scope_type,
        project_id: projectScoped ? form.project_id : null,
        rab_division_id: form.scope_type === 'division' ? form.rab_division_id : null,
        period_start: form.period_start,
        period_end: form.period_end,
        report_title: form.report_title.trim() || 'Rekap Keuangan',
      });
      setSelected(doc);
      setNotice(doc.reused_existing
        ? `Rekap dengan nomor ${doc.recap_number} sudah tersedia untuk cakupan dan periode yang sama. Dokumen tersebut dibuka kembali agar tidak terbit dua kali.`
        : `Rekap ${doc.recap_number} berhasil dibuat. Rincian transaksi disimpan sesuai keadaan pada saat laporan diterbitkan.`);
      await loadBase(true);
      setSelected(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat rekap.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(item: UnallocatedFinanceReference) {
    const divisionId = assignments[item.id];
    if (!divisionId) { setError('Pilih divisi tujuan sebelum menyimpan alokasi.'); return; }
    setAssigningId(item.id); setError(''); setNotice('');
    try {
      await assignFinanceDivision(item.document_type, item.id, divisionId);
      setNotice(`${item.document_number} berhasil dialokasikan ke ${divisions.find((d) => d.id === divisionId)?.name ?? 'divisi'}.`);
      const pendingRows = await fetchUnallocatedFinanceReferences(form.project_id);
      setUnallocated(pendingRows);
      setAssignments((old) => { const next = { ...old }; delete next[item.id]; return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengalokasikan dokumen.');
    } finally {
      setAssigningId('');
    }
  }

  async function handleVoid(doc: FinanceRecapDocument) {
    const reason = window.prompt(`Alasan pembatalan dokumen ${doc.recap_number}:`);
    if (!reason?.trim()) return;
    setError(''); setNotice('');
    try {
      await voidFinanceRecap(doc.id, reason);
      setNotice(`${doc.recap_number} telah dibatalkan. Anda dapat menerbitkan laporan pengganti untuk cakupan dan periode yang sama.`);
      setSelected(null);
      await loadBase(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membatalkan rekap.');
    }
  }

  async function handleReplace(doc: FinanceRecapDocument) {
    const reason = window.prompt(
      `Alasan penerbitan rekap pengganti untuk ${doc.recap_number}:\nContoh: terdapat transaksi baru/koreksi data setelah laporan diterbitkan.`
    );
    if (!reason?.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const newDoc = await replaceFinanceRecap(doc.id, reason.trim());
      await loadBase(true);
      setSelected(newDoc);
      setNotice(
        `Rekap pengganti ${newDoc.recap_number} berhasil diterbitkan untuk menggantikan ${doc.recap_number}. Snapshot dibuat ulang berdasarkan data transaksi terbaru.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerbitkan rekap pengganti.');
    } finally {
      setSaving(false);
    }
  }

  function handlePdf(doc: FinanceRecapDocument) {
    try {
      const filename = exportPdf(doc);
      setNotice(`Nama file PDF yang disarankan: ${filename}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF gagal dibuka.');
    }
  }

  const scopeName = (doc: FinanceRecapDocument) => doc.snapshot?.scope_label ?? (doc.scope_type === 'company' ? 'Seluruh Perusahaan' : doc.report_title);
  const summary = selected?.snapshot.summary;

  return <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-12">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#073f32] via-[#0b5f49] to-[#0c8060] p-6 text-white shadow-lg sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
      <div className="pointer-events-none absolute -bottom-24 right-40 h-52 w-52 rounded-full border-[18px] border-emerald-200/10" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100"><FileBarChart2 className="h-3.5 w-3.5"/> Financial Control Center</div><h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Rekap Keuangan Terperinci</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">Susun dokumen keuangan perusahaan, proyek, atau divisi RAB dengan rincian transaksi, jejak dokumen, dan arsip PDF A4 bernomor unik.</p></div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-800"><FileText className="h-5 w-5"/></div><div><p className="text-xs text-emerald-100">Dokumen rekap aktif</p><p className="text-2xl font-bold tabular-nums">{activeDocs.length}</p></div></div>
      </div>
    </header>

    {(error || notice) && <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0"/>}<p className="min-w-0 flex-1">{error || notice}</p><button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup pesan">×</button>
    </div>}

    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CalendarDays className="h-5 w-5"/></div><div><h2 className="font-bold text-slate-900">Buat Dokumen Rekap Baru</h2><p className="text-xs text-slate-500">Pilih ruang lingkup dan periode, lalu simpan rincian laporan ke arsip.</p></div></div><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nomor dibuat otomatis oleh sistem</span></div>
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">Cakupan laporan<select value={form.scope_type} onChange={(e) => setForm((old) => ({ ...old, scope_type: e.target.value as FinanceRecapScope, project_id: '', rab_division_id: '' }))} className={inputClass}><option value="company">Global perusahaan · biaya operasional umum</option><option value="consolidated">Konsolidasi seluruh perusahaan</option><option value="project">Per proyek</option><option value="division">Per divisi / lokasi pekerjaan</option></select></label>
          {projectScoped && <label className="text-xs font-semibold text-slate-600">Pilih proyek *<select required value={form.project_id} onChange={(e) => setForm((old) => ({ ...old, project_id: e.target.value, rab_division_id: '' }))} className={inputClass}><option value="">Pilih proyek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>}
          {form.scope_type === 'division' && <label className="text-xs font-semibold text-slate-600">Divisi / lokasi pekerjaan *<select required value={form.rab_division_id} onChange={(e) => updateForm('rab_division_id', e.target.value)} disabled={!form.project_id} className={inputClass}><option value="">Pilih divisi</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} · ` : ''}{division.name}</option>)}</select></label>}
          <label className="text-xs font-semibold text-slate-600">Tanggal awal *<input required type="date" value={form.period_start} onChange={(e) => updateForm('period_start', e.target.value)} className={inputClass}/></label>
          <label className="text-xs font-semibold text-slate-600">Tanggal akhir *<input required type="date" min={form.period_start} value={form.period_end} onChange={(e) => updateForm('period_end', e.target.value)} className={inputClass}/></label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">Judul laporan<input maxLength={180} value={form.report_title} onChange={(e) => updateForm('report_title', e.target.value)} placeholder="Contoh: Laporan Keuangan Proyek Bulan November" className={inputClass}/></label>
        </div>
        {form.scope_type === 'company' && <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><Building2 className="mt-0.5 h-4 w-4 shrink-0"/><p><strong>Rekap Global Perusahaan.</strong> Memuat pemasukan dan pengeluaran untuk kebutuhan perusahaan yang tidak dibebankan kepada proyek tertentu, seperti biaya kantor dan operasional umum.</p></div>}
        {form.scope_type === 'consolidated' && <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><Building2 className="mt-0.5 h-4 w-4 shrink-0"/><p><strong>Konsolidasi Seluruh Perusahaan.</strong> Menggabungkan transaksi operasional perusahaan dan seluruh proyek dalam satu laporan menyeluruh.</p></div>}
        {form.scope_type === 'division' && form.project_id && divisions.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Proyek ini belum memiliki divisi/lokasi RAB. Rekap per divisi belum dapat dibuat.</div>}
        {form.scope_type === 'division' && <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><p>Rekap divisi hanya menghitung transaksi dan PO yang telah ditetapkan ke divisi tersebut. Dokumen yang belum mendapat pembagian akan ditampilkan secara terpisah agar tidak salah dimasukkan.</p></div>}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Satu dokumen aktif untuk ruang lingkup dan periode yang sama. Membuat ulang laporan dengan pilihan yang sama akan membuka dokumen aktif, bukan menerbitkan nomor ganda.</p><button type="submit" disabled={saving || (form.scope_type === 'division' && divisions.length === 0)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saving ? 'Menyimpan dokumen...' : 'Simpan & Buat Rekap'}</button></div>
      </form>
    </section>

    {projectScoped && form.project_id && <section className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Layers3 className="h-5 w-5"/></div><div><h2 className="font-bold text-slate-900">Klasifikasi Transaksi ke Divisi</h2><p className="text-xs text-slate-500">{selectedProject?.title ?? 'Proyek'} · {unallocated.length} dokumen belum dialokasikan</p></div></div><div className="text-sm font-bold tabular-nums text-slate-700">{money(totalUnallocatedValue)}</div></div>
      {loading ? <div className="p-6 text-sm text-slate-500">Memuat transaksi...</div> : unallocated.length === 0 ? <div className="flex items-center gap-2 p-5 text-sm text-emerald-700"><Check className="h-4 w-4"/> Semua PO dan transaksi kas aktif sudah memiliki klasifikasi divisi atau memang tidak ada dokumen yang menunggu alokasi.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Jenis / Nomor</th><th className="px-4 py-3">Tanggal / Keterangan</th><th className="px-4 py-3 text-right">Nilai</th><th className="px-4 py-3">Alokasikan ke</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{unallocated.map((item) => <tr key={`${item.document_type}-${item.id}`}><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{item.document_type === 'po' ? 'Purchase Order' : 'Kas'}</span><p className="mt-1 font-semibold text-slate-900">{item.document_number}</p></td><td className="px-4 py-3"><p>{dateOnly(item.document_date)}</p><p className="max-w-sm text-xs text-slate-500">{item.description}</p></td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(item.amount)}</td><td className="px-4 py-3"><select value={assignments[item.id] ?? ''} onChange={(e) => setAssignments((old) => ({ ...old, [item.id]: e.target.value }))} disabled={divisions.length === 0} className="w-full min-w-48 rounded-lg border border-slate-300 px-2.5 py-2 text-xs"><option value="">Pilih divisi tujuan</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></td><td className="px-4 py-3"><button type="button" onClick={() => void handleAssign(item)} disabled={!assignments[item.id] || assigningId === item.id} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{assigningId === item.id ? 'Menyimpan...' : 'Simpan'}</button></td></tr>)}</tbody></table></div>}
      {divisions.length === 0 && <p className="border-t border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">Belum ada lokasi RAB untuk proyek ini sehingga dokumen belum dapat dialokasikan.</p>}
    </section>}

    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Archive className="h-5 w-5"/></div><div><h2 className="font-bold text-slate-900">Arsip Dokumen Rekap</h2><p className="text-xs text-slate-500">{documents.length} dokumen tersimpan</p></div></div><button type="button" onClick={() => void loadBase(true)} disabled={refreshing} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/></button></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin"/> Memuat arsip...</div> : documents.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-700">Belum ada dokumen rekap</p><p className="mt-1 text-xs text-slate-500">Buat rekap pertama melalui formulir di atas.</p></div> : <div className="divide-y divide-slate-100">{documents.map((doc) => <button key={doc.id} type="button" onClick={() => setSelected(doc)} className={`block w-full p-4 text-left transition hover:bg-slate-50 ${selected?.id === doc.id ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold tracking-wide text-emerald-800">{doc.recap_number}</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{doc.report_title}</p><p className="mt-1 text-xs text-slate-500">{scopeName(doc)}</p><p className="mt-1 text-[11px] text-slate-400">{dateOnly(doc.period_start)} — {dateOnly(doc.period_end)} · Dibuat {dateTime(doc.created_at)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${doc.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{doc.status === 'active' ? 'Aktif' : 'Dibatalkan'}</span></div></button>)}</div>}
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><FileBarChart2 className="h-5 w-5"/></div><div><h2 className="font-bold text-slate-900">Pratinjau Dokumen</h2><p className="text-xs text-slate-500">Rincian laporan tersimpan, bukan data yang berubah langsung.</p></div></div>{selected && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => handlePdf(selected)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><Download className="h-3.5 w-3.5"/> Cetak / Simpan PDF A4</button>{selected.status === 'active' && <><button type="button" disabled={saving} onClick={() => void handleReplace(selected)} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Terbitkan Rekap Pengganti</button><button type="button" disabled={saving} onClick={() => void handleVoid(selected)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Batalkan Rekap</button></>}</div>}</div>
        {!selected ? <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><FileText className="h-10 w-10 text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-700">Pilih dokumen dari arsip</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Setelah rekap dibuat, pratinjau nomor dokumen, ringkasan, dan semua rincian transaksi akan tampil di sini.</p></div> : <div className="max-h-[900px] space-y-5 overflow-y-auto p-5">
          <div className="rounded-2xl bg-gradient-to-br from-[#073f32] to-[#087353] p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">JAVAWASTHU MANAGEMENT Hub · Financial Report</p><h3 className="mt-2 text-xl font-bold">{selected.report_title}</h3><p className="mt-1 text-sm text-emerald-50">{scopeName(selected)}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-3"><span className="text-xs text-emerald-100">{dateOnly(selected.period_start)} — {dateOnly(selected.period_end)}</span><strong className="text-sm tracking-wide">{selected.recap_number}</strong></div></div>
          {summary && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><ArrowDownLeft className="h-4 w-4"/> Kas masuk aktif</p><p className="mt-2 text-lg font-bold text-emerald-900">{money(summary.cash_in)}</p></div><div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-rose-800"><ArrowUpRight className="h-4 w-4"/> Kas keluar aktif</p><p className="mt-2 text-lg font-bold text-rose-900">{money(summary.cash_out)}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Wallet className="h-4 w-4"/> Arus kas bersih</p><p className="mt-2 text-lg font-bold text-slate-900">{money(summary.net_cash)}</p></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-blue-800"><FileBarChart2 className="h-4 w-4"/> Komitmen PO</p><p className="mt-2 text-lg font-bold text-blue-900">{money(summary.po_commitment)}</p></div></div>}
          <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Buku Kas</h3><span className="text-xs text-slate-500">{selected.snapshot.cash_transactions.length} transaksi</span></div>{selected.snapshot.cash_transactions.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">Tidak ada mutasi kas.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Tanggal / Nomor</th><th className="px-3 py-2">Uraian</th><th className="px-3 py-2">Proyek / Divisi</th><th className="px-3 py-2 text-right">Jumlah</th><th className="px-3 py-2">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{selected.snapshot.cash_transactions.map((row) => <tr key={row.id}><td className="px-3 py-2 font-semibold">{dateOnly(row.transaction_date)}<p className="font-normal text-slate-400">{row.transaction_number}</p></td><td className="px-3 py-2">{row.description}<p className="text-slate-400">{row.category}{row.purchase_order_number ? ` · ${row.purchase_order_number}` : ''}</p></td><td className="px-3 py-2">{row.project_title ?? 'Perusahaan'}<p className="text-slate-400">{row.division_name ?? 'Tanpa divisi'}</p></td><td className={`px-3 py-2 text-right font-bold ${row.status === 'void' ? 'text-slate-400 line-through' : row.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{row.direction === 'in' ? '+' : '-'}{money(row.amount)}</td><td className="px-3 py-2">{statusLabel(row.status)}</td></tr>)}</tbody></table></div>}</div>
          <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Komitmen Purchase Order</h3><span className="text-xs text-slate-500">{selected.snapshot.purchase_orders.length} PO</span></div>{selected.snapshot.purchase_orders.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">Tidak ada PO dalam periode ini.</p> : <div className="space-y-2">{selected.snapshot.purchase_orders.map((po) => <div key={po.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-bold text-slate-800">{po.po_number}</p><p className="text-xs text-slate-500">{po.supplier_name} · {dateOnly(po.order_date)}</p><p className="text-xs text-slate-500">{po.project_title}{po.division_name ? ` / ${po.division_name}` : ''}</p></div><div className="text-right"><p className="font-bold text-slate-900">{money(Number(po.subtotal))}</p><p className="text-xs text-slate-500">Dibayar {money(Number(po.paid_total))} · Sisa {money(Number(po.remaining))}</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 text-left">Barang</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Jumlah</th></tr></thead><tbody>{(po.items ?? []).map((item, index) => <tr key={`${po.id}-${index}`} className="border-t border-slate-100"><td className="p-2">{item.material_name}<span className="ml-1 text-slate-400">{item.material_code ?? ''}</span></td><td className="p-2 text-right">{item.quantity_ordered} {item.unit}</td><td className="p-2 text-right">{money(Number(item.unit_price))}</td><td className="p-2 text-right font-medium">{money(Number(item.line_total))}</td></tr>)}</tbody></table></div></div>)}</div>}</div>
          <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Pembayaran Supplier (Rincian Pendukung)</h3><span className="text-xs text-slate-500">{selected.snapshot.supplier_payments.length} pembayaran</span></div>{selected.snapshot.supplier_payments.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">Tidak ada pembayaran supplier.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Nomor / Tanggal</th><th className="px-3 py-2">PO / Supplier</th><th className="px-3 py-2">Metode</th><th className="px-3 py-2 text-right">Jumlah</th><th className="px-3 py-2">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{selected.snapshot.supplier_payments.map((payment) => <tr key={payment.id}><td className="px-3 py-2 font-semibold">{payment.payment_number}<p className="font-normal text-slate-400">{dateOnly(payment.payment_date)}</p></td><td className="px-3 py-2">{payment.po_number}<p className="text-slate-400">{payment.supplier_name}</p></td><td className="px-3 py-2">{paymentLabel(payment.payment_method)}</td><td className="px-3 py-2 text-right font-bold">{money(payment.amount)}</td><td className="px-3 py-2">{statusLabel(payment.status)}</td></tr>)}</tbody></table></div>}<p className="mt-2 text-[11px] leading-5 text-amber-800">Pembayaran supplier juga memiliki mutasi kas keluar yang tertaut. Nilai pada tabel ini adalah rincian pendukung dan tidak ditambahkan lagi ke total kas keluar.</p></div>
          {(selected.snapshot.unallocated_cash_transactions.length > 0 || selected.snapshot.unallocated_purchase_orders.length > 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertCircle className="h-4 w-4"/> Belum dialokasikan ke divisi</h3><p className="mt-1 text-xs leading-5 text-amber-800">{selected.snapshot.unallocated_cash_transactions.length + selected.snapshot.unallocated_purchase_orders.length} dokumen pada proyek ini tidak masuk total divisi terpilih karena belum dipetakan. Klasifikasikan pada bagian Klasifikasi Transaksi ke Divisi, batalkan laporan ini terlebih dahulu, kemudian terbitkan laporan baru agar perubahan ikut tercatat.</p></div>}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><strong>Catatan dokumen.</strong> Diterbitkan {dateTime(selected.created_at)}. Rincian di dalam laporan ini menggambarkan catatan yang tersedia pada saat diterbitkan. {selected.replaces_recap_id ? <>Dokumen ini menggantikan {selected.previous_recap_number ?? selected.replaces_recap_id}. Alasan: {selected.replacement_reason ?? '—'}.</> : 'Jika ada perubahan setelah itu, terbitkan rekap pengganti melalui aksi pada dokumen aktif.'}</div>
        </div>}
      </section>
    </div>
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/> Ringkasan kas menggunakan transaksi yang telah dikonfirmasi. Pembayaran supplier ditampilkan sebagai rincian pendukung karena nilainya sudah tercatat di kas keluar. Nilai Purchase Order merupakan komitmen pembelian dan baru menjadi pengeluaran kas ketika dibayar. Setiap dokumen rekap memiliki nomor unik yang dibuat otomatis oleh sistem.</p>
  </div>;
}

export default function FinanceRecapPage() {
  return <RequireAuth permission="finance.read"><RecapContent /></RequireAuth>;
}
