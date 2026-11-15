'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Package,
  PackageCheck,
  RefreshCw,
  Truck,
  Warehouse,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { fetchWarehouseDashboardData } from '@/lib/services/warehouseDashboardService';
import type {
  WarehouseActivityKind,
  WarehouseDashboardActivity,
  WarehouseDashboardData,
  WarehousePendingOrder,
} from '@/lib/services/warehouseDashboardService';
import type { WarehouseStockRow } from '@/types/warehouse';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Belum dijadwalkan';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Belum dijadwalkan';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(parsed);
}

function monthLabel(): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date());
}

function materialIdentity(row: WarehouseStockRow): string {
  return `${row.material_id ?? row.material_code ?? row.material_name}|${row.unit}`;
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Package;
  tone: 'blue' | 'emerald' | 'amber' | 'violet';
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: WarehouseActivityKind }) {
  return kind === 'receipt'
    ? <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ArrowDownLeft className="h-4 w-4" /></span>
    : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ArrowUpRight className="h-4 w-4" /></span>;
}

function ActivityRow({ activity }: { activity: WarehouseDashboardActivity }) {
  const isReceipt = activity.kind === 'receipt';
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <ActivityIcon kind={activity.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">
              {isReceipt ? 'Penerimaan material' : 'Pengeluaran material'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{activity.document_number} · {activity.project_title}</p>
          </div>
          <time className="shrink-0 text-[11px] text-slate-400">{formatDateTime(activity.occurred_at)}</time>
        </div>
        <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{activity.summary}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">{activity.item_count} baris material</p>
      </div>
    </div>
  );
}

function statusLabel(status: WarehousePendingOrder['status']): string {
  if (status === 'partially_received') return 'Diterima sebagian';
  if (status === 'ordered') return 'Dalam pengiriman';
  return 'Disetujui';
}

function statusClass(status: WarehousePendingOrder['status']): string {
  if (status === 'partially_received') return 'bg-amber-50 text-amber-700';
  if (status === 'ordered') return 'bg-blue-50 text-blue-700';
  return 'bg-violet-50 text-violet-700';
}

export default function WarehouseDashboardPage() {
  const [data, setData] = useState<WarehouseDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const result = await fetchWarehouseDashboardData();
      setData(result);
    } catch (err) {
      console.error('Gagal memuat Dashboard Gudang:', err);
      setError(err instanceof Error ? err.message : 'Dashboard Gudang belum dapat dimuat.');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const stockSummary = useMemo(() => {
    const stocks = data?.stocks ?? [];
    const projectMap = new Map<string, { title: string; client: string | null; lineCount: number; materialKeys: Set<string> }>();

    stocks.forEach((row) => {
      const existing = projectMap.get(row.project_id) ?? {
        title: row.project_title,
        client: row.project_client,
        lineCount: 0,
        materialKeys: new Set<string>(),
      };
      existing.lineCount += 1;
      existing.materialKeys.add(materialIdentity(row));
      projectMap.set(row.project_id, existing);
    });

    return Array.from(projectMap.entries())
      .map(([id, summary]) => ({
        id,
        title: summary.title,
        client: summary.client,
        lineCount: summary.lineCount,
        materialCount: summary.materialKeys.size,
      }))
      .sort((a, b) => b.lineCount - a.lineCount || a.title.localeCompare(b.title, 'id'));
  }, [data?.stocks]);

  const materialCount = useMemo(
    () => new Set((data?.stocks ?? []).map(materialIdentity)).size,
    [data?.stocks],
  );
  const projectCount = stockSummary.length;
  const stockLineCount = data?.stocks.length ?? 0;
  const activityCount = data?.recent_activities.length ?? 0;

  const currentMonth = monthLabel();

  return (
    <RequireAuth permission="warehouse.manage">
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Gudang & Persediaan</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Dashboard Gudang</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Pantau stok material, penerimaan, pengeluaran, dan pesanan yang masih menunggu kedatangan.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Segarkan data
            </button>
          </header>

          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">{error}</div>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Jenis material tersedia"
              value={loading ? '—' : formatNumber(materialCount)}
              note="Jenis material dengan stok positif"
              icon={Package}
              tone="blue"
            />
            <StatCard
              label="Proyek dengan stok"
              value={loading ? '—' : formatNumber(projectCount)}
              note="Proyek yang memiliki persediaan"
              icon={Building2}
              tone="emerald"
            />
            <StatCard
              label="Penerimaan bulan ini"
              value={loading ? '—' : formatNumber(data?.receipt_count_this_month ?? 0)}
              note={currentMonth}
              icon={ArrowDownLeft}
              tone="blue"
            />
            <StatCard
              label="Pengeluaran bulan ini"
              value={loading ? '—' : formatNumber(data?.issue_count_this_month ?? 0)}
              note={currentMonth}
              icon={ArrowUpRight}
              tone="amber"
            />
            <StatCard
              label="PO menunggu barang"
              value={loading ? '—' : formatNumber(data?.pending_order_count ?? 0)}
              note="Disetujui, dikirim, atau diterima sebagian"
              icon={Truck}
              tone="violet"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-bold text-slate-900">Ringkasan persediaan per proyek</h2>
                  <p className="mt-1 text-xs text-slate-500">Jumlah jenis material dan baris stok yang masih tersedia.</p>
                </div>
                <Link href="/gudang/persediaan" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                  Lihat persediaan <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-bold">Proyek</th>
                      <th className="px-3 py-3 text-center font-bold">Jenis material</th>
                      <th className="px-3 py-3 text-right font-bold">Baris stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={3} className="px-3 py-10 text-center text-sm text-slate-500">Memuat ringkasan stok...</td></tr>
                    ) : stockSummary.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-10 text-center">
                          <Warehouse className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="mt-2 text-sm font-semibold text-slate-700">Belum ada persediaan</p>
                          <p className="mt-1 text-xs text-slate-500">Ringkasan muncul setelah penerimaan barang dikonfirmasi.</p>
                        </td>
                      </tr>
                    ) : stockSummary.slice(0, 8).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800">{row.title}</p>
                          {row.client ? <p className="mt-0.5 text-xs text-slate-500">{row.client}</p> : null}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">{formatNumber(row.materialCount)}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{formatNumber(row.lineCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>{formatNumber(stockLineCount)} baris stok tersedia pada {formatNumber(projectCount)} proyek.</span>
                <Link href="/gudang/persediaan" className="font-semibold text-emerald-700 hover:underline">Buka daftar stok</Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">PO menunggu kedatangan</h2>
                  <p className="mt-1 text-xs text-slate-500">Pesanan yang belum diterima seluruhnya.</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><CalendarClock className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {loading ? (
                  <p className="py-8 text-center text-sm text-slate-500">Memuat PO...</p>
                ) : (data?.pending_orders.length ?? 0) === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada PO tertunda</p>
                    <p className="mt-1 text-xs text-slate-500">Belum ada pesanan yang menunggu barang.</p>
                  </div>
                ) : data?.pending_orders.map((order) => (
                  <div key={order.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{order.po_number}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{order.project_title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{order.supplier_name} · Perkiraan: {formatDate(order.expected_date)}</p>
                  </div>
                ))}
              </div>
              <Link href="/pengadaan/purchase-order" className="mt-4 inline-flex items-center gap-1 border-t border-slate-100 pt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                Buka daftar Purchase Order <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">Aktivitas gudang terbaru</h2>
                  <p className="mt-1 text-xs text-slate-500">Penerimaan dan pengeluaran material yang telah dikonfirmasi.</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ClipboardList className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {loading ? (
                  <p className="py-10 text-center text-sm text-slate-500">Memuat aktivitas...</p>
                ) : activityCount === 0 ? (
                  <div className="py-10 text-center">
                    <Boxes className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">Belum ada aktivitas gudang</p>
                    <p className="mt-1 text-xs text-slate-500">Transaksi yang dikonfirmasi akan muncul di sini.</p>
                  </div>
                ) : data?.recent_activities.map((activity) => <ActivityRow key={`${activity.kind}-${activity.id}`} activity={activity} />)}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs font-semibold">
                <Link href="/gudang/penerimaan" className="text-emerald-700 hover:underline">Riwayat penerimaan</Link>
                <Link href="/gudang/pengeluaran" className="text-emerald-700 hover:underline">Riwayat pengeluaran</Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-bold text-slate-900">Akses cepat gudang</h2>
              <p className="mt-1 text-xs text-slate-500">Buka modul operasional yang dibutuhkan.</p>
              <div className="mt-4 space-y-2">
                <Link href="/gudang/penerimaan" className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><PackageCheck className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Penerimaan Material</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Catat barang yang datang dari supplier.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </Link>
                <Link href="/gudang/persediaan" className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Persediaan Material</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Lihat saldo material per proyek.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </Link>
                <Link href="/gudang/pengeluaran" className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ArrowUpRight className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Pengeluaran Material</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Distribusikan material ke divisi pekerjaan.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </Link>
                <Link href="/pengadaan/purchase-order" className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Truck className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Purchase Order</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Pantau pesanan yang menunggu kedatangan.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </section>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
            <strong className="text-slate-700">Catatan perhitungan:</strong> jumlah material dari satuan berbeda tidak dijumlahkan menjadi satu angka total. Saldo diambil dari barang diterima layak pakai dikurangi pengeluaran yang telah dikonfirmasi pada view persediaan proyek.
          </div>
        </div>
      </main>
    </RequireAuth>
  );
}
