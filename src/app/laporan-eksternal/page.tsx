'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  FileDown,
  FileText,
  LockKeyhole,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { supabase } from '@/lib/supabase';
import {
  addExternalWageAllocation,
  createExternalReportSnapshot,
  fetchExternalReportBooks,
  fetchExternalReportDetail,
  fetchExternalReportSources,
  freezeExternalReport,
  issueExternalReport,
  voidExternalReport,
  voidExternalWageAllocation,
} from '@/lib/services/externalReportingService';
import type {
  ExternalReportAdjustment,
  ExternalReportBook,
  ExternalReportDetail,
  ExternalReportSource,
  ExternalReportType,
} from '@/types/externalReporting';

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value ?? 0));

const dateText = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const reportTypeLabel: Record<ExternalReportType, string> = {
  spj_dinas: 'SPJ / Laporan Dinas',
  tax_support: 'Dokumen Pendukung Pajak',
  client_report: 'Laporan Klien',
  other: 'Laporan Eksternal Lainnya',
};

const statusLabel: Record<ExternalReportBook['status'], string> = {
  draft: 'Draft',
  frozen: 'Terkunci',
  issued: 'Diterbitkan',
  void: 'Dibatalkan',
};

const statusClass: Record<ExternalReportBook['status'], string> = {
  draft: 'bg-amber-50 text-amber-800 border-amber-200',
  frozen: 'bg-blue-50 text-blue-800 border-blue-200',
  issued: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  void: 'bg-slate-100 text-slate-600 border-slate-200',
};

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function ExternalReportingContent() {
  const [sources, setSources] = useState<ExternalReportSource[]>([]);
  const [books, setBooks] = useState<ExternalReportBook[]>([]);
  const [detail, setDetail] = useState<ExternalReportDetail | null>(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDirectorAdmin, setIsDirectorAdmin] = useState(false);
  const [canExport, setCanExport] = useState(false);

  const [sourceId, setSourceId] = useState('');
  const [reportType, setReportType] = useState<ExternalReportType>('spj_dinas');
  const [recipientName, setRecipientName] = useState('');
  const [recipientReference, setRecipientReference] = useState('');
  const [reportTitle, setReportTitle] = useState('');

  const [wageSnapshotId, setWageSnapshotId] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [adjustmentLabel, setAdjustmentLabel] = useState('Alokasi biaya layanan/tenaga kerja');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [supportingReference, setSupportingReference] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sourceRows, reportRows, accessResult] = await Promise.all([
        fetchExternalReportSources(),
        fetchExternalReportBooks(),
        supabase.rpc('get_my_access'),
      ]);
      setSources(sourceRows);
      setBooks(reportRows);
      const access = (accessResult.data ?? {}) as { roles?: Array<{ code?: string }>; permissions?: Array<{ code?: string }> };
      const isAdminRole = (access.roles ?? []).some((role) => role.code === 'director' || role.code === 'admin');
      setIsDirectorAdmin(isAdminRole);
      setCanExport(isAdminRole || (access.permissions ?? []).some((permission) => permission.code === 'external.report.export'));
      if (!sourceId && sourceRows.length > 0) setSourceId(sourceRows[0].id);
      if (selectedReportId && reportRows.some((row) => row.id === selectedReportId)) {
        const next = await fetchExternalReportDetail(selectedReportId);
        setDetail(next);
      } else if (!selectedReportId) {
        setDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data laporan eksternal gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [selectedReportId, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReport = useCallback(async (id: string) => {
    setSelectedReportId(id);
    setError('');
    setNotice('');
    try {
      setDetail(await fetchExternalReportDetail(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detail laporan gagal dimuat.');
    }
  }, []);

  const totals = useMemo(() => {
    const entries = detail?.ledgerEntries ?? [];
    const active = entries.filter((row) => row.status === 'confirmed');
    const cashIn = active.filter((row) => row.direction === 'in').reduce((sum, row) => sum + Number(row.amount), 0);
    const cashOut = active.filter((row) => row.direction === 'out').reduce((sum, row) => sum + Number(row.amount), 0);
    const wageAllocated = (detail?.wageSnapshots ?? []).reduce((sum, row) => sum + Number(row.base_amount), 0);
    const additionalAllocation = (detail?.adjustments ?? []).filter((row) => row.status === 'active').reduce((sum, row) => sum + Number(row.adjustment_amount), 0);
    return { cashIn, cashOut, netCash: cashIn - cashOut, wageAllocated, additionalAllocation };
  }, [detail]);

  async function handleCreateSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceId || !recipientName.trim()) {
      setError('Pilih sumber rekap internal dan isi nama penerima laporan.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await createExternalReportSnapshot({
        source_recap_id: sourceId,
        report_type: reportType,
        recipient_name: recipientName,
        recipient_reference: recipientReference,
        report_title: reportTitle,
      });
      setNotice(`Snapshot ${created.report_number} berhasil dibuat. Data sumber sudah disalin dan tidak mengikuti perubahan internal berikutnya.`);
      setRecipientName('');
      setRecipientReference('');
      setReportTitle('');
      await load();
      await openReport(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot gagal dibuat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !wageSnapshotId || !ratePercent || !adjustmentReason.trim() || !supportingReference.trim()) {
      setError('Lengkapi sumber alokasi upah, persentase, alasan, dan referensi pendukung.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await addExternalWageAllocation({
        report_id: detail.book.id,
        wage_snapshot_id: wageSnapshotId,
        rate_percent: Number(ratePercent),
        presentation_label: adjustmentLabel,
        reason: adjustmentReason,
        supporting_reference: supportingReference,
      });
      setNotice('Komponen alokasi non-kas berhasil ditambahkan secara terpisah. Nilai upah aktual dan buku kas tidak berubah.');
      setRatePercent('');
      setAdjustmentReason('');
      setSupportingReference('');
      setDetail(await fetchExternalReportDetail(detail.book.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Penyesuaian gagal ditambahkan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoidAdjustment(row: ExternalReportAdjustment) {
    const reason = window.prompt('Tuliskan alasan pembatalan penyesuaian ini:');
    if (!reason?.trim() || !detail) return;
    setSaving(true);
    setError('');
    try {
      await voidExternalWageAllocation(row.id, reason);
      setNotice('Penyesuaian dibatalkan dan riwayatnya tetap tersimpan.');
      setDetail(await fetchExternalReportDetail(detail.book.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Penyesuaian gagal dibatalkan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFreeze() {
    if (!detail) return;
    if (!window.confirm('Kunci laporan ini? Snapshot dan penyesuaiannya tidak dapat diedit lagi.')) return;
    setSaving(true);
    setError('');
    try {
      await freezeExternalReport(detail.book.id);
      setNotice('Laporan berhasil dikunci.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laporan gagal dikunci.');
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    if (!detail) return;
    if (!window.confirm('Terbitkan laporan ini? Pastikan isi, penerima, dan periode sudah diperiksa.')) return;
    setSaving(true);
    setError('');
    try {
      await issueExternalReport(detail.book.id);
      setNotice('Laporan berhasil diterbitkan.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laporan gagal diterbitkan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoidReport() {
    if (!detail) return;
    const reason = window.prompt('Tuliskan alasan pembatalan laporan:');
    if (!reason?.trim()) return;
    setSaving(true);
    setError('');
    try {
      await voidExternalReport(detail.book.id, reason);
      setNotice('Laporan dibatalkan. Snapshot lama tetap tersimpan sebagai jejak audit.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laporan gagal dibatalkan.');
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!detail) return;
    const lines: string[][] = [
      ['BUKU KAS SNAPSHOT', detail.book.report_number, detail.book.report_title],
      ['Tanggal', 'Nomor Transaksi', 'Kategori', 'Uraian', 'Arah', 'Nominal', 'Status', 'Proyek', 'Divisi'],
      ...detail.ledgerEntries.map((row) => [
        row.transaction_date,
        row.transaction_number ?? row.source_record_id,
        row.category,
        row.description,
        row.direction === 'in' ? 'Kas Masuk' : 'Kas Keluar',
        String(row.amount),
        row.status,
        row.project_name_snapshot ?? '',
        row.division_name_snapshot ?? '',
      ]),
      [],
      ['ALOKASI BIAYA PAYROLL - BUKAN BUKTI KAS DIBAYAR'],
      ['Periode', 'Nomor Karyawan', 'Nama Karyawan', 'Rincian', 'Proyek', 'Paket', 'Alokasi Aktual'],
      ...detail.wageSnapshots.map((row) => [
        `${row.payroll_period_start} - ${row.payroll_period_end}`,
        row.employee_number_snapshot ?? '',
        row.employee_name_snapshot,
        row.line_label_snapshot,
        row.project_name_snapshot ?? '',
        row.package_name_snapshot ?? '',
        String(row.base_amount),
      ]),
      [],
      ['PENYESUAIAN NON-KAS - TERPISAH DARI UPAH AKTUAL'],
      ['Label', 'Dasar Alokasi', 'Persentase', 'Nilai Tambahan', 'Klasifikasi', 'Alasan', 'Referensi', 'Status'],
      ...detail.adjustments.map((row) => [
        row.presentation_label,
        String(row.base_amount_snapshot),
        String(row.rate_percent),
        String(row.adjustment_amount),
        row.classification,
        row.reason,
        row.supporting_reference,
        row.status,
      ]),
    ];
    const csv = '\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${detail.book.report_number.toLowerCase()}-snapshot.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activeAdjustmentWageIds = new Set(
    (detail?.adjustments ?? []).filter((row) => row.status === 'active').map((row) => row.wage_snapshot_id),
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Pelaporan Eksternal</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Laporan Eksternal &amp; SPJ</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Buat salinan beku dari rekap internal untuk dinas, pajak, dan klien. Arsip eksternal memiliki nomor, status, rincian, dan penyesuaian sendiri.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => void load()} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Segarkan
          </button>
          {detail && canExport && <button className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`} onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Cetak
          </button>}
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] print:hidden">
        <form onSubmit={handleCreateSnapshot} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Plus className="h-5 w-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900">Buat snapshot laporan baru</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Sumber dipilih dari arsip Rekap Keuangan Internal yang sudah dibuat dan berstatus aktif.</p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Sumber rekap internal *</label>
            <select className={inputClass} value={sourceId} onChange={(event) => setSourceId(event.target.value)} required>
              <option value="">Pilih rekap internal</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.recap_number} · {source.project_title} · {dateText(source.period_start)}–{dateText(source.period_end)}
                </option>
              ))}
            </select>
            {sources.length === 0 && <p className="mt-1 text-xs text-amber-700">Belum ada rekap internal aktif. Buat rekap terlebih dahulu pada modul Keuangan → Rekap.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Jenis laporan *</label>
              <select className={inputClass} value={reportType} onChange={(event) => setReportType(event.target.value as ExternalReportType)}>
                <option value="spj_dinas">SPJ / Laporan Dinas</option>
                <option value="tax_support">Dokumen Pendukung Pajak</option>
                <option value="client_report">Laporan Klien</option>
                <option value="other">Laporan Eksternal Lainnya</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nomor referensi penerima</label>
              <input className={inputClass} value={recipientReference} onChange={(event) => setRecipientReference(event.target.value)} placeholder="No. surat / kontrak / SPK" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Dituju kepada *</label>
            <input className={inputClass} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nama dinas, instansi, kantor pajak, atau klien" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Judul laporan</label>
            <input className={inputClass} value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} placeholder="Contoh: Buku Kas dan SPJ Pekerjaan" />
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
            Snapshot menyimpan salinan data sumber, rincian kas, dan alokasi biaya payroll pada saat dibuat. Perubahan pada rekap internal setelah itu tidak memperbarui laporan eksternal ini.
          </div>

          <button type="submit" disabled={saving || loading || !sources.length} className={`${buttonClass} w-full bg-indigo-700 text-white hover:bg-indigo-800`}>
            <BookOpen className="h-4 w-4" /> {saving ? 'Membuat snapshot...' : 'Buat Snapshot Eksternal'}
          </button>
        </form>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Archive className="h-5 w-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900">Arsip laporan eksternal</h2>
              <p className="mt-1 text-xs text-slate-500">Pilih nomor laporan untuk melihat snapshot dan buku kasnya.</p>
            </div>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Memuat arsip...</p> : books.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada laporan eksternal.</p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {books.map((book) => (
                <button key={book.id} onClick={() => void openReport(book.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedReportId === book.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{book.report_number}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass[book.status]}`}>{statusLabel[book.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{book.report_title}</p>
                  <p className="mt-1 text-xs text-slate-500">{reportTypeLabel[book.report_type]} · {book.recipient_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{dateText(book.period_start)} – {dateText(book.period_end)} · Sumber {book.source_recap_number}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>

      {detail ? (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">{reportTypeLabel[detail.book.report_type]}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{detail.book.report_title}</h2>
              <p className="mt-1 text-sm text-slate-600">{detail.book.report_number} · Ditujukan kepada {detail.book.recipient_name}</p>
              <p className="mt-1 text-xs text-slate-500">Periode {dateText(detail.book.period_start)} – {dateText(detail.book.period_end)} · Sumber {detail.book.source_recap_number}</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass[detail.book.status]}`}>{statusLabel[detail.book.status]}</span>
              {canExport && <button onClick={exportCsv} className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}><FileDown className="h-4 w-4"/> Ekspor CSV</button>}
              {isDirectorAdmin && detail.book.status === 'draft' && <button disabled={saving} onClick={() => void handleFreeze()} className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}><LockKeyhole className="h-4 w-4"/> Kunci</button>}
              {isDirectorAdmin && detail.book.status === 'frozen' && <button disabled={saving} onClick={() => void handleIssue()} className={`${buttonClass} bg-emerald-700 text-white hover:bg-emerald-800`}><BadgeCheck className="h-4 w-4"/> Terbitkan</button>}
              {isDirectorAdmin && detail.book.status !== 'void' && <button disabled={saving} onClick={() => void handleVoidReport()} className={`${buttonClass} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}>Batalkan</button>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Kas masuk aktual', value: money(totals.cashIn), icon: ArrowDownLeft },
              { label: 'Kas keluar aktual', value: money(totals.cashOut), icon: ArrowUpRight },
              { label: 'Arus kas bersih', value: money(totals.netCash), icon: Wallet },
              { label: 'Alokasi biaya payroll', value: money(totals.wageAllocated), icon: FileText },
              { label: 'Alokasi tambahan non-kas', value: money(totals.additionalAllocation), icon: Plus },
            ].map((card) => {
              const Icon = card.icon;
              return <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Icon className="h-4 w-4 text-slate-500" />
                <p className="mt-2 text-xs text-slate-500">{card.label}</p>
                <p className="mt-1 text-base font-bold text-slate-900">{card.value}</p>
              </div>;
            })}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-bold text-slate-900">Buku Kas Snapshot — seluruh transaksi</h3><p className="text-xs text-slate-500">{detail.ledgerEntries.length} baris disalin dari buku kas internal pada saat snapshot dibuat.</p></div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
                  <th className="px-3 py-3">No / Tanggal</th><th className="px-3 py-3">Kategori / Referensi</th><th className="px-3 py-3">Uraian</th><th className="px-3 py-3">Proyek / Divisi</th><th className="px-3 py-3 text-right">Kas Masuk</th><th className="px-3 py-3 text-right">Kas Keluar</th><th className="px-3 py-3">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.ledgerEntries.map((row) => <tr key={row.id} className={row.status === 'void' ? 'bg-slate-50 text-slate-400' : ''}>
                    <td className="px-3 py-3"><span className="font-semibold text-slate-800">{row.entry_number}</span><p className="text-xs text-slate-500">{dateText(row.transaction_date)}</p></td>
                    <td className="px-3 py-3"><p className="font-medium text-slate-800">{row.category}</p><p className="text-xs text-slate-500">{row.transaction_number ?? row.source_record_id}</p></td>
                    <td className="max-w-[280px] whitespace-normal px-3 py-3">{row.description}</td>
                    <td className="px-3 py-3 text-xs">{row.project_name_snapshot ?? 'Perusahaan'}<p className="text-slate-500">{row.division_name_snapshot ?? '—'}</p></td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">{row.direction === 'in' && row.status === 'confirmed' ? money(row.amount) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-rose-700">{row.direction === 'out' && row.status === 'confirmed' ? money(row.amount) : '—'}</td>
                    <td className="px-3 py-3 text-xs">{row.status === 'void' ? 'Dibatalkan' : 'Terkonfirmasi'}</td>
                  </tr>)}
                  {detail.ledgerEntries.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Tidak ada transaksi kas pada snapshot ini.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div><h3 className="font-bold text-slate-900">Rincian Alokasi Upah Internal</h3><p className="text-xs leading-5 text-slate-500">Salinan alokasi payroll yang disetujui untuk proyek/paket. Ini adalah atribusi biaya, bukan bukti pembayaran kas kepada karyawan.</p></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Periode</th><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Komponen</th><th className="px-3 py-3">Proyek / Paket</th><th className="px-3 py-3 text-right">Alokasi Aktual</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.wageSnapshots.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.payroll_period_code}<p className="text-xs text-slate-500">{dateText(row.payroll_period_start)} – {dateText(row.payroll_period_end)}</p></td><td className="px-3 py-3 font-medium">{row.employee_name_snapshot}<p className="text-xs text-slate-500">{row.employee_number_snapshot ?? '—'}</p></td><td className="px-3 py-3">{row.line_label_snapshot}</td><td className="px-3 py-3">{row.project_name_snapshot ?? 'Overhead perusahaan'}<p className="text-xs text-slate-500">{row.package_name_snapshot ?? '—'}</p></td><td className="px-3 py-3 text-right font-semibold">{money(row.base_amount)}</td></tr>)}
                  {detail.wageSnapshots.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Tidak ada alokasi payroll yang disetujui dan sesuai periode/cakupan snapshot.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {detail.book.report_type === 'client_report' && detail.book.status === 'draft' && (
            <section className="grid gap-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 lg:grid-cols-[1fr_1fr] print:hidden">
              <form onSubmit={handleAddAllocation} className="space-y-3">
                <div><h3 className="font-bold text-slate-900">Alokasi tambahan untuk laporan klien</h3><p className="text-xs leading-5 text-slate-600">Komponen ini ditampilkan terpisah sebagai non-kas, bukan upah aktual dan bukan transaksi pembayaran.</p></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-700">Sumber alokasi payroll</label><select className={inputClass} value={wageSnapshotId} onChange={(event) => setWageSnapshotId(event.target.value)} required><option value="">Pilih alokasi upah</option>{detail.wageSnapshots.filter((row) => !activeAdjustmentWageIds.has(row.id)).map((row) => <option key={row.id} value={row.id}>{row.employee_name_snapshot} · {row.line_label_snapshot} · {money(row.base_amount)}</option>)}</select></div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-semibold text-slate-700">Persentase alokasi (%)</label><input className={inputClass} type="number" min="0.001" max="100" step="0.001" value={ratePercent} onChange={(event) => setRatePercent(event.target.value)} placeholder="Contoh: 10" required/></div><div><label className="mb-1 block text-xs font-semibold text-slate-700">Label komponen</label><input className={inputClass} value={adjustmentLabel} onChange={(event) => setAdjustmentLabel(event.target.value)} required/></div></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-700">Alasan / dasar perhitungan</label><textarea className={inputClass} rows={2} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} required/></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-700">Referensi dokumen pendukung</label><input className={inputClass} value={supportingReference} onChange={(event) => setSupportingReference(event.target.value)} placeholder="No. kontrak / klausul / dokumen" required/></div>
                <button type="submit" disabled={saving || detail.wageSnapshots.length === activeAdjustmentWageIds.size} className={`${buttonClass} w-full bg-indigo-700 text-white hover:bg-indigo-800`}><Plus className="h-4 w-4"/> Tambahkan sebagai komponen terpisah</button>
              </form>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <strong>Batas penggunaan:</strong> alokasi tambahan hanya diaktifkan pada laporan klien. Sistem menolak markup upah untuk SPJ dinas dan dukungan pajak. Nilai tambah ini tidak menambah kas keluar, tidak mengubah payroll internal, dan harus memiliki alasan serta referensi pendukung.
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div><h3 className="font-bold text-slate-900">Penyesuaian non-kas</h3><p className="text-xs text-slate-500">Penyesuaian ditampilkan terpisah dan tidak digabungkan ke kas masuk, kas keluar, atau upah aktual.</p></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Komponen</th><th className="px-3 py-3 text-right">Dasar</th><th className="px-3 py-3 text-right">Persentase</th><th className="px-3 py-3 text-right">Nilai Tambahan</th><th className="px-3 py-3">Alasan / Referensi</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 print:hidden">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">
                {detail.adjustments.map((row) => <tr key={row.id}><td className="px-3 py-3 font-medium">{row.presentation_label}<p className="text-xs text-slate-500">Non-cash disclosure</p></td><td className="px-3 py-3 text-right">{money(row.base_amount_snapshot)}</td><td className="px-3 py-3 text-right">{row.rate_percent}%</td><td className="px-3 py-3 text-right font-semibold">{money(row.adjustment_amount)}</td><td className="max-w-[260px] whitespace-normal px-3 py-3 text-xs">{row.reason}<p className="mt-1 text-slate-500">{row.supporting_reference}</p></td><td className="px-3 py-3 text-xs">{row.status === 'active' ? 'Aktif' : 'Dibatalkan'}</td><td className="px-3 py-3 print:hidden">{row.status === 'active' && detail.book.status === 'draft' && <button onClick={() => void handleVoidAdjustment(row)} className="text-xs font-semibold text-rose-700 hover:underline">Batalkan</button>}</td></tr>)}
                {detail.adjustments.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Belum ada penyesuaian non-kas.</td></tr>}
              </tbody></table>
            </div>
          </section>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <p><strong>Identitas snapshot:</strong> {detail.book.source_snapshot_hash}</p>
            <p><strong>Sumber internal:</strong> {detail.book.source_recap_number}. Snapshot disalin pada {new Date(detail.book.created_at).toLocaleString('id-ID')}.</p>
            <p>Dokumen ini merupakan salinan snapshot dari sumber internal. Buku kas menunjukkan transaksi kas yang tercatat; alokasi payroll dan penyesuaian non-kas ditampilkan terpisah. Rekap ini belum otomatis membentuk jurnal akuntansi berpasangan (double-entry) atau menentukan perlakuan pajak.</p>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center print:hidden">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 font-semibold text-slate-800">Pilih arsip laporan eksternal</h2>
          <p className="mt-1 text-sm text-slate-500">Detail snapshot, buku kas, alokasi upah, dan penyesuaian akan tampil di sini.</p>
        </div>
      )}
    </main>
  );
}

export default function ExternalReportingPage() {
  return (
    <RequireAuth permission="external.report.read">
      <ExternalReportingContent />
    </RequireAuth>
  );
}
