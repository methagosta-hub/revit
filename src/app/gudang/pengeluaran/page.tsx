'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ClipboardList,
  PackageMinus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import { fetchWarehouseIssuePageData, recordWarehouseMaterialIssue } from '@/lib/services/materialIssueService';
import type { WarehouseStockRow } from '@/types/warehouse';
import type {
  RecentWarehouseIssue,
  WarehouseIssueDivision,
  WarehouseIssueLineInput,
  WarehouseIssueProject,
} from '@/types/warehouseIssue';

interface IssueDraftLine {
  key: string;
  stockKey: string;
  divisionId: string;
  rabItemId: string;
  quantity: string;
  notes: string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDateTimeLocalValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function stockKey(row: WarehouseStockRow): string {
  return [row.material_id ?? '', row.material_code ?? '', row.material_name, row.unit].join('¦');
}

function newDraftLine(): IssueDraftLine {
  return {
    key: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    stockKey: '',
    divisionId: '',
    rabItemId: '',
    quantity: '',
    notes: '',
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

function downloadCsv(rows: RecentWarehouseIssue[]) {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Nomor Pengeluaran', 'Tanggal', 'Proyek', 'Penerima', 'Jumlah Baris', 'Alokasi'],
    ...rows.map((row) => [
      row.issue_number,
      formatDate(row.issued_at),
      row.project_title,
      row.recipient_name ?? '',
      row.item_count,
      row.allocations.join(' | '),
    ]),
  ];
  const csv = lines.map((line) => line.map(escape).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pengeluaran-material-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function WarehouseIssuePage() {
  const [stocks, setStocks] = useState<WarehouseStockRow[]>([]);
  const [projects, setProjects] = useState<WarehouseIssueProject[]>([]);
  const [divisions, setDivisions] = useState<WarehouseIssueDivision[]>([]);
  const [recentIssues, setRecentIssues] = useState<RecentWarehouseIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [issuedAt, setIssuedAt] = useState(formatDateTimeLocalValue);
  const [recipientName, setRecipientName] = useState('');
  const [headerNotes, setHeaderNotes] = useState('');
  const [draftLines, setDraftLines] = useState<IssueDraftLine[]>([newDraftLine()]);

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseIssuePageData();
      setStocks(data.stocks);
      setProjects(data.projects);
      setDivisions(data.divisions);
      setRecentIssues(data.recentIssues);
    } catch (err) {
      console.error('Gagal memuat data pengeluaran material:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredStocks = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return stocks.filter((row) => {
      const projectMatch = projectFilter === 'all' || row.project_id === projectFilter;
      const searchMatch = !keyword || [
        row.project_title,
        row.project_client ?? '',
        row.material_code ?? '',
        row.material_name,
        row.unit,
      ].some((value) => value.toLocaleLowerCase('id').includes(keyword));
      return projectMatch && searchMatch;
    });
  }, [stocks, search, projectFilter]);

  const filteredRecentIssues = useMemo(() => recentIssues.filter((row) => (
    projectFilter === 'all' || row.project_id === projectFilter
  )), [recentIssues, projectFilter]);

  const totalDivisions = useMemo(
    () => new Set(divisions.filter((division) => projectFilter === 'all' || division.project_id === projectFilter).map((division) => division.id)).size,
    [divisions, projectFilter],
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectStocks = useMemo(
    () => stocks.filter((row) => row.project_id === selectedProjectId && row.quantity_on_hand > 0),
    [stocks, selectedProjectId],
  );
  const projectDivisions = useMemo(
    () => divisions.filter((division) => division.project_id === selectedProjectId),
    [divisions, selectedProjectId],
  );

  const openForm = () => {
    const initialProject = projectFilter !== 'all' && projects.some((project) => project.id === projectFilter)
      ? projectFilter
      : projects[0]?.id ?? '';
    setSelectedProjectId(initialProject);
    setIssuedAt(formatDateTimeLocalValue());
    setRecipientName('');
    setHeaderNotes('');
    setDraftLines([newDraftLine()]);
    setError('');
    setSuccess('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setError('');
  };

  const updateLine = (key: string, changes: Partial<IssueDraftLine>) => {
    setDraftLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  };

  const updateProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setDraftLines([newDraftLine()]);
  };

  const addLine = () => setDraftLines((current) => [...current, newDraftLine()]);
  const removeLine = (key: string) => setDraftLines((current) => current.length > 1 ? current.filter((line) => line.key !== key) : [newDraftLine()]);

  const handleSubmit = async () => {
    if (saving) return;
    setError('');
    setSuccess('');

    if (!selectedProjectId) {
      setError('Pilih proyek terlebih dahulu.');
      return;
    }
    if (!issuedAt || Number.isNaN(new Date(issuedAt).getTime())) {
      setError('Tanggal dan waktu pengeluaran tidak valid.');
      return;
    }

    const items: WarehouseIssueLineInput[] = [];
    const totalByStock = new Map<string, number>();

    for (const [index, line] of draftLines.entries()) {
      if (!line.stockKey) {
        setError(`Pilih material pada baris ${index + 1}.`);
        return;
      }
      if (!line.divisionId) {
        setError(`Pilih divisi/lokasi tujuan pada baris ${index + 1}.`);
        return;
      }
      const stock = projectStocks.find((row) => stockKey(row) === line.stockKey);
      if (!stock) {
        setError(`Material pada baris ${index + 1} tidak lagi tersedia. Segarkan data persediaan.`);
        return;
      }
      const quantity = Number(line.quantity);
      if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        setError(`Jumlah keluar pada baris ${index + 1} harus lebih besar dari nol.`);
        return;
      }

      totalByStock.set(line.stockKey, (totalByStock.get(line.stockKey) ?? 0) + quantity);
      items.push({
        material_id: stock.material_id,
        material_code: stock.material_code,
        material_name: stock.material_name,
        unit: stock.unit,
        quantity_issued: quantity,
        division_id: line.divisionId,
        rab_item_id: line.rabItemId || null,
        notes: line.notes.trim() || null,
      });
    }

    for (const [key, requested] of totalByStock.entries()) {
      const stock = projectStocks.find((row) => stockKey(row) === key);
      if (stock && requested > stock.quantity_on_hand + 0.000001) {
        setError(`Total pengeluaran ${stock.material_name} (${formatNumber(requested)} ${stock.unit}) melebihi stok tersedia (${formatNumber(stock.quantity_on_hand)} ${stock.unit}).`);
        return;
      }
    }

    if (items.length === 0) {
      setError('Tambahkan minimal satu material yang akan dikeluarkan.');
      return;
    }

    setSaving(true);
    try {
      const issueId = await recordWarehouseMaterialIssue({
        project_id: selectedProjectId,
        issued_at: new Date(issuedAt).toISOString(),
        recipient_name: recipientName.trim() || null,
        notes: headerNotes.trim() || null,
        items,
      });
      setFormOpen(false);
      setSuccess(`Pengeluaran berhasil dicatat. ID transaksi: ${issueId.slice(0, 8).toUpperCase()}`);
      await loadData(true);
    } catch (err) {
      console.error('Gagal menyimpan pengeluaran material:', err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth permission="warehouse.issue">
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Gudang & Persediaan</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Pengeluaran Material</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Catat distribusi material dari stok proyek ke Kelas A, Kelas B, atau lokasi pekerjaan lainnya.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/gudang/persediaan" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" /> Persediaan
              </Link>
              <button type="button" onClick={openForm} disabled={stocks.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <PackageMinus className="h-4 w-4" /> Catat Pengeluaran
              </button>
              <button type="button" onClick={() => void loadData(true)} disabled={refreshing || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
              </button>
            </div>
          </header>

          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div>{success}</div>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">Baris stok tersedia</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(filteredStocks.length)}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Boxes className="h-5 w-5" /></span></div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">Transaksi pengeluaran terbaru</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(filteredRecentIssues.length)}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Warehouse className="h-5 w-5" /></span></div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">Divisi/lokasi pekerjaan</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(totalDivisions)}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ClipboardList className="h-5 w-5" /></span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Stok yang dapat dikeluarkan</h2>
                <p className="mt-1 text-xs text-slate-500">Saldo dihitung dari penerimaan layak pakai dikurangi pengeluaran yang telah dikonfirmasi.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:w-[560px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari proyek, kode atau material..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                </label>
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
                  <option value="all">Semua proyek</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
                <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="border-y border-slate-200 px-3 py-3">No.</th><th className="border-y border-slate-200 px-3 py-3">Proyek</th><th className="border-y border-slate-200 px-3 py-3">Kode</th><th className="border-y border-slate-200 px-3 py-3">Material</th><th className="border-y border-slate-200 px-3 py-3 text-center">Satuan</th><th className="border-y border-slate-200 px-3 py-3 text-right">Stok tersedia</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-500">Memuat saldo material...</td></tr>
                    : filteredStocks.length === 0 ? <tr><td colSpan={6} className="px-3 py-12 text-center"><Warehouse className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-700">Belum ada stok yang dapat dikeluarkan</p><p className="mt-1 text-xs text-slate-500">Pastikan sudah ada penerimaan material yang dikonfirmasi.</p><Link href="/gudang/penerimaan" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Lihat Penerimaan</Link></td></tr>
                    : filteredStocks.map((row, index) => <tr key={`${row.project_id}-${stockKey(row)}`} className="text-slate-700 hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-3 py-3 text-slate-500">{index + 1}</td>
                      <td className="border-b border-slate-100 px-3 py-3"><p className="font-semibold text-slate-800">{row.project_title}</p>{row.project_client ? <p className="mt-0.5 text-xs text-slate-500">{row.project_client}</p> : null}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-500">{row.material_code || '—'}</td>
                      <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{row.material_name}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-center">{row.unit}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{formatNumber(row.quantity_on_hand)}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-bold text-slate-900">Riwayat pengeluaran material</h2><p className="mt-1 text-xs text-slate-500">Menampilkan hingga 20 transaksi terakhir.</p></div>
              <button type="button" onClick={() => downloadCsv(filteredRecentIssues)} disabled={filteredRecentIssues.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> Ekspor CSV</button>
            </div>
            {filteredRecentIssues.length > 0 ? <div className="mb-4 grid gap-3 lg:grid-cols-2">{filteredRecentIssues.map((issue) => (
              <article key={`pdf-${issue.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                <div><p className="font-bold text-emerald-800">{issue.issue_number}</p><p className="text-xs text-slate-600">{issue.project_title} · {formatDate(issue.issued_at)}</p></div>
                <BusinessDocumentPdfButton
                  identity={{ type: 'goods_issue', code: issue.issue_number, title: 'Bukti Pengeluaran Material', sourceStatus: issue.status, generatedAt: new Date().toISOString(), projectName: issue.project_title, period: formatDate(issue.issued_at), classification: 'Dokumen gudang' }}
                  sections={[
                    { title: 'Identitas pengeluaran', details: [
                      { label: 'Nomor pengeluaran', value: issue.issue_number }, { label: 'Proyek', value: issue.project_title },
                      { label: 'Tanggal', value: formatDate(issue.issued_at) }, { label: 'Penerima', value: issue.recipient_name ?? 'Tidak dicatat' },
                      { label: 'Status transaksi', value: issue.status === 'confirmed' ? 'Terkonfirmasi' : 'Dibatalkan' }, { label: 'Jumlah baris material', value: issue.item_count },
                    ] },
                    { title: 'Rincian material yang diserahkan', columns: ['Nama material', 'Kuantitas', 'Satuan', 'Divisi / lokasi'], rows: issue.items.map((item) => [item.material_name, formatNumber(item.quantity_issued), item.unit, item.division_name]) },
                    { title: 'Catatan pengeluaran', paragraphs: [issue.notes?.trim() || 'Tidak ada catatan tambahan pada pengeluaran sumber.', 'Cetakan ini tidak menjadi bukti kehadiran atau persetujuan upah.'] },
                  ]}
                />
              </article>
            ))}</div> : null}
            <div className="mt-4 space-y-3">
              {loading ? <p className="py-8 text-center text-sm text-slate-500">Memuat riwayat pengeluaran...</p>
                : filteredRecentIssues.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">Belum ada transaksi pengeluaran</p><p className="mt-1 text-xs text-slate-500">Transaksi pengeluaran yang sudah disimpan akan tampil di sini.</p></div>
                : filteredRecentIssues.map((issue) => <article key={issue.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{issue.issue_number}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${issue.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{issue.status === 'confirmed' ? 'Terkonfirmasi' : 'Dibatalkan'}</span></div><p className="mt-1 text-xs text-slate-500">{issue.project_title} · {formatDate(issue.issued_at)}</p></div>
                    <div className="text-left text-xs text-slate-500 sm:text-right"><p>{issue.item_count} baris material</p>{issue.recipient_name ? <p className="mt-1">Penerima: {issue.recipient_name}</p> : null}</div>
                  </div>
                  <ul className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:grid-cols-2">{issue.allocations.map((allocation, index) => <li key={`${issue.id}-${index}`}>• {allocation}</li>)}</ul>
                </article>)}
            </div>
          </section>

          {formOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
              <div role="dialog" aria-modal="true" aria-labelledby="issue-form-title" className="my-4 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                  <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">Transaksi Gudang</p><h2 id="issue-form-title" className="mt-1 text-xl font-extrabold text-slate-900">Catat Pengeluaran Material</h2><p className="mt-1 text-xs text-slate-500">Satu transaksi dapat mengalokasikan beberapa material ke divisi pekerjaan berbeda.</p></div>
                  <button type="button" onClick={closeForm} disabled={saving} aria-label="Tutup formulir" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-5 px-5 py-5 sm:px-6">
                  {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-1">Proyek
                      <select value={selectedProjectId} onChange={(event) => updateProject(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
                        <option value="">Pilih proyek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">Tanggal & waktu pengeluaran<input type="datetime-local" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
                    <label className="block text-xs font-semibold text-slate-600">Diserahkan kepada<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nama mandor / penerima" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
                  </div>

                  {!selectedProject ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Pilih proyek yang memiliki stok material.</div> : projectStocks.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Proyek ini belum memiliki stok material yang dapat dikeluarkan.</div> : projectDivisions.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Proyek ini belum memiliki divisi/lokasi pekerjaan. Buat lokasi pada modul Perencanaan terlebih dahulu.</div> : (
                    <section className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Rincian material dan alokasi</h3><p className="text-xs text-slate-500">Pilih material, jumlah keluar, dan divisi penerima pada setiap baris.</p></div><button type="button" onClick={addLine} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"><Plus className="h-4 w-4" /> Tambah baris</button></div>
                      <div className="space-y-3">
                        {draftLines.map((line, index) => {
                          const selectedStock = projectStocks.find((row) => stockKey(row) === line.stockKey) ?? null;
                          const lineDivisions = projectDivisions;
                          const selectedDivision = lineDivisions.find((division) => division.id === line.divisionId) ?? null;
                          return <div key={line.key} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                            <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Baris {index + 1}</p><button type="button" onClick={() => removeLine(line.key)} disabled={draftLines.length === 1} aria-label="Hapus baris" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block text-xs font-semibold text-slate-600 md:col-span-2">Material
                                <select value={line.stockKey} onChange={(event) => updateLine(line.key, { stockKey: event.target.value, quantity: '' })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500">
                                  <option value="">Pilih material dari stok proyek</option>{projectStocks.map((stock) => <option key={stockKey(stock)} value={stockKey(stock)}>{stock.material_code ? `${stock.material_code} · ` : ''}{stock.material_name} — stok {formatNumber(stock.quantity_on_hand)} {stock.unit}</option>)}
                                </select>
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">Divisi / lokasi tujuan
                                <select value={line.divisionId} onChange={(event) => updateLine(line.key, { divisionId: event.target.value, rabItemId: '' })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500">
                                  <option value="">Pilih Kelas / Divisi</option>{projectDivisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} · ` : ''}{division.name}</option>)}
                                </select>
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">Item pekerjaan RAB (opsional)
                                <select value={line.rabItemId} onChange={(event) => updateLine(line.key, { rabItemId: event.target.value })} disabled={!selectedDivision || selectedDivision.items.length === 0} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 disabled:bg-slate-50">
                                  <option value="">Tidak ditentukan</option>{(selectedDivision?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}
                                </select>
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">Jumlah dikeluarkan ({selectedStock?.unit ?? 'satuan'})
                                <input type="number" min="0.001" step="0.001" max={selectedStock?.quantity_on_hand} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} disabled={!selectedStock} placeholder="0,000" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 disabled:bg-slate-50" />
                                {selectedStock ? <span className="mt-1 block text-[11px] font-medium text-emerald-700">Stok tersedia: {formatNumber(selectedStock.quantity_on_hand)} {selectedStock.unit}</span> : null}
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">Catatan baris (opsional)
                                <input value={line.notes} onChange={(event) => updateLine(line.key, { notes: event.target.value })} placeholder="Contoh: untuk pekerjaan lantai lantai 1" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500" />
                              </label>
                            </div>
                          </div>;
                        })}
                      </div>
                    </section>
                  )}

                  <label className="block text-xs font-semibold text-slate-600">Catatan transaksi (opsional)<textarea value={headerNotes} onChange={(event) => setHeaderNotes(event.target.value)} rows={2} placeholder="Keterangan umum pengeluaran material" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900"><strong>Pengendalian stok:</strong> jumlah akan diperiksa kembali di database saat transaksi disimpan. Jika stok sudah berubah karena pengeluaran lain, transaksi yang melebihi saldo terakhir akan ditolak.</div>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                  <button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                  <button type="button" onClick={() => void handleSubmit()} disabled={saving || !selectedProject || projectStocks.length === 0 || projectDivisions.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? 'Menyimpan...' : 'Simpan Pengeluaran'}</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </RequireAuth>
  );
}
