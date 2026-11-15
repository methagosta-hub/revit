'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownToLine,
  Boxes,
  Building2,
  Package,
  RefreshCw,
  Search,
  Warehouse,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { fetchWarehouseStock } from '@/lib/services/warehouseService';
import type { WarehouseStockRow } from '@/types/warehouse';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value);
}

function escapeCsv(value: string | number | null | undefined): string {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function downloadCsv(rows: WarehouseStockRow[]) {
  const header = ['Proyek', 'Pemilik / Instansi', 'Kode Material', 'Nama Material', 'Satuan', 'Stok Tersedia'];
  const body = rows.map((row) => [
    row.project_title,
    row.project_client ?? '',
    row.material_code ?? '',
    row.material_name,
    row.unit,
    row.quantity_on_hand,
  ]);
  const csv = [header, ...body].map((line) => line.map(escapeCsv).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `persediaan-material-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function WarehouseInventoryPage() {
  const [rows, setRows] = useState<WarehouseStockRow[]>([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadStock = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseStock();
      setRows(data);
    } catch (err) {
      console.error('Gagal memuat persediaan material:', err);
      setError(err instanceof Error ? err.message : 'Persediaan belum dapat dimuat.');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => map.set(row.project_id, row.project_title));
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return rows.filter((row) => {
      const matchProject = projectFilter === 'all' || row.project_id === projectFilter;
      const matchSearch = !keyword || [
        row.project_title,
        row.project_client ?? '',
        row.material_code ?? '',
        row.material_name,
        row.unit,
      ].some((value) => value.toLocaleLowerCase('id').includes(keyword));
      return matchProject && matchSearch;
    });
  }, [rows, search, projectFilter]);

  const totalMaterials = useMemo(
    () => new Set(filteredRows.map((row) => `${row.material_id ?? row.material_code ?? row.material_name}|${row.unit}`)).size,
    [filteredRows],
  );

  const totalProjects = useMemo(
    () => new Set(filteredRows.map((row) => row.project_id)).size,
    [filteredRows],
  );

  return (
    <RequireAuth permission="warehouse.manage">
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Gudang & Persediaan</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Persediaan Material</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Pantau jumlah material layak pakai yang sudah diterima pada setiap proyek.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(filteredRows)}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownToLine className="h-4 w-4" /> Ekspor CSV
              </button>
              <button
                type="button"
                onClick={() => void loadStock(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
              </button>
            </div>
          </header>

          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">{error}</div>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Jenis material</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(totalMaterials)}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package className="h-5 w-5" /></span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Proyek dengan stok</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(totalProjects)}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-5 w-5" /></span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Baris persediaan</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(filteredRows.length)}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Boxes className="h-5 w-5" /></span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Daftar stok material</h2>
                <p className="mt-1 text-xs text-slate-500">Stok ditampilkan per proyek dan satuan material.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:w-[560px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cari proyek, kode atau material..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="all">Semua proyek</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[850px] w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-y border-slate-200 px-3 py-3 font-bold">No.</th>
                    <th className="border-y border-slate-200 px-3 py-3 font-bold">Proyek</th>
                    <th className="border-y border-slate-200 px-3 py-3 font-bold">Kode</th>
                    <th className="border-y border-slate-200 px-3 py-3 font-bold">Nama Material</th>
                    <th className="border-y border-slate-200 px-3 py-3 text-center font-bold">Satuan</th>
                    <th className="border-y border-slate-200 px-3 py-3 text-right font-bold">Stok Tersedia</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-500">Memuat data persediaan...</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center">
                        <Warehouse className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 font-semibold text-slate-700">Belum ada stok material</p>
                        <p className="mt-1 text-xs text-slate-500">Stok akan muncul setelah ada transaksi penerimaan barang yang dikonfirmasi.</p>
                        <Link href="/gudang/penerimaan" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
                          Lihat Penerimaan Material
                        </Link>
                      </td>
                    </tr>
                  ) : filteredRows.map((row, index) => (
                    <tr key={`${row.project_id}-${row.material_id ?? row.material_code ?? row.material_name}-${row.unit}`} className="text-slate-700 hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-3 py-3 text-slate-500">{index + 1}</td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-semibold text-slate-800">{row.project_title}</p>
                        {row.project_client ? <p className="mt-0.5 text-xs text-slate-500">{row.project_client}</p> : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-500">{row.material_code || '—'}</td>
                      <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{row.material_name}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-center">{row.unit}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{formatNumber(row.quantity_on_hand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Menampilkan {filteredRows.length} dari {rows.length} baris persediaan.</span>
              <span>Barang rusak tidak dihitung sebagai stok layak pakai.</span>
            </div>
          </section>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <strong>Catatan:</strong> angka stok saat ini mencerminkan total barang layak pakai yang telah diterima. Pengurangan stok berdasarkan pemakaian atau pengeluaran material akan terhubung ketika modul Pengeluaran Gudang selesai dibangun.
          </div>
        </div>
      </main>
    </RequireAuth>
  );
}
