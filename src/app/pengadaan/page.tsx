'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { fetchFieldMaterialRequestsForReview, type FieldMaterialRequest } from '@/lib/services/fieldMaterialRequestService';

type Related<T> = T | T[] | null;

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  subtotal: number | string;
  created_at: string;
  project: Related<{ title: string }>;
  supplier: Related<{ name: string }>;
  items: Array<{ id: string; material_name: string; quantity_ordered: number | string; unit: string }> | null;
};

type ActivityRow = {
  id: string;
  event_type: string;
  actor_name: string;
  project_name: string;
  title: string;
  summary: string;
  target_url: string | null;
  created_at: string;
};

type DashboardData = {
  requests: FieldMaterialRequest[];
  purchaseOrders: PurchaseOrderRow[];
  activities: ActivityRow[];
};

const EMPTY_DATA: DashboardData = { requests: [], purchaseOrders: [], activities: [] };

function first<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value as T | null;
}

function money(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function numberLabel(value: number | string): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function dateTime(value?: string | null): string {
  if (!value) return 'Belum dijadwalkan';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum dijadwalkan';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: 'Menunggu tinjauan',
    under_review: 'Sedang ditinjau',
    approved: 'Disetujui',
    rejected: 'Belum disetujui',
    converted: 'Menjadi PO',
    cancelled: 'Dibatalkan',
    draft: 'Draft',
    pending_approval: 'Menunggu persetujuan',
    ordered: 'Dipesan',
    partially_received: 'Diterima sebagian',
    received: 'Diterima penuh',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

function statusClass(status: string): string {
  if (['approved', 'converted', 'received'].includes(status)) return 'bg-emerald-50 text-emerald-800 ring-emerald-600/15';
  if (['submitted', 'under_review', 'pending_approval', 'partially_received'].includes(status)) return 'bg-amber-50 text-amber-800 ring-amber-600/15';
  if (['rejected', 'cancelled'].includes(status)) return 'bg-rose-50 text-rose-800 ring-rose-600/15';
  if (status === 'ordered') return 'bg-sky-50 text-sky-800 ring-sky-600/15';
  return 'bg-slate-100 text-slate-600 ring-slate-500/15';
}

function eventTone(type: string): string {
  if (type.includes('stock_low')) return 'bg-rose-100 text-rose-700';
  if (type.includes('material_request')) return 'bg-amber-100 text-amber-800';
  if (type.includes('warehouse')) return 'bg-sky-100 text-sky-800';
  if (type.includes('subcontract')) return 'bg-violet-100 text-violet-800';
  return 'bg-emerald-100 text-emerald-800';
}

function MetricCard({ label, value, note, icon: Icon, tone }: {
  label: string;
  value: string;
  note: string;
  icon: typeof Activity;
  tone: 'emerald' | 'amber' | 'blue' | 'violet';
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 tabular-nums">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">{note}</p>
    </article>
  );
}

function ProcurementContent() {
  const { user, access, can } = useAuth();
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'request' | 'po'>('all');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const canReviewRequests = can('procurement.request.review');
  const canCreatePurchase = can('procurement.purchase.create');
  const canApprovePurchase = can('procurement.purchase.approve');
  const isDirector = access?.roles.some((role) => role.code === 'director' || role.code === 'admin') ?? false;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const tasks: Promise<unknown>[] = [
        Promise.resolve(supabase
          .from('activity_feed')
          .select('id, event_type, actor_name, project_name, title, summary, target_url, created_at')
          .order('created_at', { ascending: false })
          .limit(14)
          .then(({ data: rows, error: queryError }) => {
            if (queryError) throw queryError;
            return rows ?? [];
          })),
        Promise.resolve(supabase
          .from('project_purchase_orders')
          .select(`
            id, po_number, status, order_date, expected_date, subtotal, created_at,
            project:projects(title), supplier:suppliers(name),
            items:project_purchase_order_items(id, material_name, quantity_ordered, unit)
          `)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data: rows, error: queryError }) => {
            if (queryError) throw queryError;
            return rows ?? [];
          })),
        canReviewRequests ? fetchFieldMaterialRequestsForReview() : Promise.resolve([]),
      ];

      const [activityRows, orderRows, requestRows] = await Promise.all(tasks);
      setData({
        activities: activityRows as ActivityRow[],
        purchaseOrders: orderRows as unknown as PurchaseOrderRow[],
        requests: requestRows as FieldMaterialRequest[],
      });
      setUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      console.error('Gagal memuat dashboard Pengadaan:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Data operasional belum dapat dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canReviewRequests]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('dahlia-procurement-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, () => {
        void load(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'field_material_requests' }, () => {
        void load(true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'field_material_requests' }, () => {
        void load(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_purchase_orders' }, () => {
        void load(true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, load]);

  const requestPending = data.requests.filter((item) => ['submitted', 'under_review'].includes(item.status));
  const requestApproved = data.requests.filter((item) => item.status === 'approved');
  const poPendingApproval = data.purchaseOrders.filter((item) => item.status === 'pending_approval');
  const poInProgress = data.purchaseOrders.filter((item) => ['approved', 'ordered', 'partially_received'].includes(item.status));
  const lowStockAlerts = data.activities.filter((item) => item.event_type === 'stock_low');

  const recentOrders = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return data.purchaseOrders.filter((item) => {
      if (filter === 'request') return false;
      if (!keyword) return true;
      return [
        item.po_number,
        first(item.project)?.title,
        first(item.supplier)?.name,
        ...(item.items ?? []).map((line) => line.material_name),
      ].some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword));
    }).slice(0, 7);
  }, [data.purchaseOrders, filter, search]);

  const recentRequests = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return data.requests.filter((item) => {
      if (filter === 'po') return false;
      if (!keyword) return true;
      return [
        item.request_number,
        item.project_title,
        item.created_by,
        ...(item.items ?? []).map((line) => line.item_name),
      ].some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword));
    }).slice(0, 7);
  }, [data.requests, filter, search]);

  const recentActivity = data.activities.slice(0, 9);

  return (
    <main className="min-h-screen bg-[#f4f7f8] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="relative overflow-hidden rounded-[28px] bg-[#071827] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-130px] left-[36%] h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Live Operations Terminal
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold text-slate-300">DAHLIA · PROCUREMENT CONTROL</span>
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">Pusat Kendali Pengadaan</h1>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300 sm:text-sm">
                Pantau arus kebutuhan material, keputusan pembelian, Purchase Order, dan koordinasi Gudang dalam satu ruang kendali operasional.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-emerald-300" /> Pembaruan aktivitas melalui Supabase Realtime</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" /> Tampilan mengikuti izin akun</span>
                {updatedAt ? <span>Sinkron terakhir {dateTime(updatedAt)}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/[0.13] disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
              </button>
              {canCreatePurchase ? (
                <Link href="/pengadaan/purchasing" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2.5 text-xs font-extrabold text-[#062719] transition hover:bg-emerald-300">
                  <ShoppingCart className="h-4 w-4" /> Buat pembelian <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-4">
            <div className="rounded-xl bg-white/[0.045] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Permintaan lapangan</p>
              <p className="mt-1 text-xl font-black tabular-nums">{loading ? '—' : requestPending.length}</p>
              <p className="mt-1 text-[9px] text-amber-200">Butuh pemeriksaan</p>
            </div>
            <div className="rounded-xl bg-white/[0.045] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Siap dibuat PO</p>
              <p className="mt-1 text-xl font-black tabular-nums">{loading ? '—' : requestApproved.length}</p>
              <p className="mt-1 text-[9px] text-emerald-200">Permintaan disetujui</p>
            </div>
            <div className="rounded-xl bg-white/[0.045] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Menunggu persetujuan</p>
              <p className="mt-1 text-xl font-black tabular-nums">{loading ? '—' : poPendingApproval.length}</p>
              <p className="mt-1 text-[9px] text-amber-200">PO belum disahkan</p>
            </div>
            <div className="rounded-xl bg-white/[0.045] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">PO berjalan</p>
              <p className="mt-1 text-xl font-black tabular-nums">{loading ? '—' : poInProgress.length}</p>
              <p className="mt-1 text-[9px] text-sky-200">Dalam proses pemenuhan</p>
            </div>
          </div>
        </header>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-bold">Data pengadaan belum seluruhnya tersinkron.</p><p className="mt-1 text-xs leading-5">{error}</p></div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="PR menunggu proses" value={loading ? '—' : String(requestPending.length)} note="Permintaan material baru dan yang sedang ditinjau." icon={FileText} tone="amber" />
          <MetricCard label="PO menunggu persetujuan" value={loading ? '—' : String(poPendingApproval.length)} note="Dokumen pembelian yang menunggu otorisasi." icon={ShieldCheck} tone="violet" />
          <MetricCard label="PO dalam pemenuhan" value={loading ? '—' : String(poInProgress.length)} note="Sudah disetujui atau dikirim, belum seluruhnya diterima." icon={Truck} tone="blue" />
          <MetricCard label="Sinyal stok minimum" value={loading ? '—' : String(lowStockAlerts.length)} note="Peringatan stok yang tercatat pada aktivitas terbaru." icon={AlertTriangle} tone="emerald" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Field requisition stream</p></div>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-950">Permintaan material lapangan</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Kebutuhan yang diajukan dari proyek melalui Dahlia Field.</p>
                </div>
                {canReviewRequests ? <Link href="/pengadaan/permintaan" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline">Kelola seluruh PR <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
              </div>
              {!canReviewRequests ? (
                <div className="p-8 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-800">Akses pemeriksaan tidak tersedia</p><p className="mt-1 text-xs text-slate-500">Akun Anda hanya menampilkan modul yang sesuai dengan kewenangannya.</p></div>
              ) : recentRequests.length ? (
                <div className="divide-y divide-slate-100">
                  {recentRequests.map((item) => (
                    <article key={item.request_id} className="px-4 py-4 transition hover:bg-slate-50/80 sm:px-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] font-extrabold text-emerald-800">{item.request_number}</span>
                            <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ring-1 ring-inset ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                            {item.priority === 'urgent' ? <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-extrabold text-rose-700">PRIORITAS TINGGI</span> : null}
                          </div>
                          <p className="mt-1.5 text-sm font-extrabold text-slate-900">{item.project_title}</p>
                          <p className="mt-1 text-[10px] text-slate-500">Diajukan {dateTime(item.created_at)} · Dibutuhkan {item.required_date}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link href="/pengadaan/permintaan" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-800">Tinjau <ArrowUpRight className="h-3 w-3" /></Link>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.items.slice(0, 4).map((line) => (
                          <span key={line.id} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-600">{line.item_name} <strong className="text-slate-900">{numberLabel(line.quantity)} {line.unit}</strong></span>
                        ))}
                        {item.items.length > 4 ? <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">+{item.items.length - 4} item lain</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" /><p className="mt-2 text-sm font-bold text-slate-900">Tidak ada permintaan yang menunggu</p><p className="mt-1 text-xs text-slate-500">PR baru dari lapangan akan muncul pada aliran ini secara realtime.</p></div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-800">Purchase order flow</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Pesanan pembelian terbaru</h2><p className="mt-1 text-[11px] text-slate-500">Status pesanan, supplier, dan progres penerimaan dari Gudang.</p></div>
                <Link href="/pengadaan/purchase-order" className="text-xs font-bold text-emerald-800 hover:underline">Buka register PO <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
              </div>
              {recentOrders.length ? (
                <div className="divide-y divide-slate-100">
                  {recentOrders.map((item) => (
                    <article key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-extrabold text-slate-800">{item.po_number}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ring-1 ring-inset ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                        <p className="mt-1.5 text-xs font-bold text-slate-900">{first(item.project)?.title ?? 'Proyek tidak tersedia'}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{first(item.supplier)?.name ?? 'Supplier belum tersedia'} · {item.items?.length ?? 0} jenis material · {dateTime(item.created_at)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="sm:text-right"><p className="text-[9px] uppercase tracking-wide text-slate-400">Nilai PO</p><p className="text-sm font-extrabold tabular-nums text-slate-900">{money(item.subtotal)}</p></div>
                        <Link href="/pengadaan/purchase-order" aria-label={`Buka PO ${item.po_number}`} className="rounded-lg border border-slate-200 p-2.5 text-slate-500 transition hover:border-emerald-300 hover:text-emerald-800"><ArrowUpRight className="h-4 w-4" /></Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <div className="px-5 py-9 text-center text-xs text-slate-500">Belum ada Purchase Order yang dapat ditampilkan untuk akun ini.</div>}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Control shortcuts</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Ruang kerja</h2></div><Boxes className="h-5 w-5 text-emerald-700" /></div>
              <div className="grid gap-2 p-3">
                <Link href="/pengadaan/permintaan" className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><FileText className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">Permintaan Barang</strong><span className="mt-0.5 block text-[10px] text-slate-500">Validasi kebutuhan proyek</span></span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-700" />
                </Link>
                {canCreatePurchase ? <Link href="/pengadaan/purchasing" className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><ShoppingCart className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">Purchasing</strong><span className="mt-0.5 block text-[10px] text-slate-500">Buat PO dan kelola pemasok</span></span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-700" /></Link> : null}
                {canApprovePurchase ? <Link href="/pengadaan/persetujuan" className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><BadgeCheck className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">Otorisasi Pembelian</strong><span className="mt-0.5 block text-[10px] text-slate-500">Persetujuan PO sesuai kewenangan</span></span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-700" /></Link> : null}
                <Link href="/pengadaan/supplier" className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Users className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">Mitra Supplier</strong><span className="mt-0.5 block text-[10px] text-slate-500">Data pemasok dan hubungan kerja</span></span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-700" /></Link>
                <Link href="/gudang" className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><PackageCheck className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">Gudang & Persediaan</strong><span className="mt-0.5 block text-[10px] text-slate-500">Penerimaan dan pengeluaran barang</span></span><ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-700" /></Link>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/70 p-4"><AlertTriangle className="h-4 w-4 text-rose-700" /><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-800">Supply risk monitor</p><h2 className="mt-0.5 text-sm font-extrabold text-slate-950">Sinyal stok minimum</h2></div></div>
              {lowStockAlerts.length ? <div className="divide-y divide-slate-100">{lowStockAlerts.slice(0, 4).map((item) => <article key={item.id} className="p-4"><p className="text-xs font-bold text-slate-900">{item.title}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{item.summary}</p><p className="mt-1 text-[9px] text-slate-400">{item.project_name} · {dateTime(item.created_at)}</p></article>)}</div> : <div className="p-4"><p className="text-xs font-semibold text-slate-700">Belum ada pelanggaran batas stok minimum pada aliran aktivitas terbaru.</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Aturan awal memantau semen 50 kg pada batas 10 sak. Ambang material lain dapat dikelola oleh petugas yang berwenang melalui pengaturan persediaan.</p><Link href="/gudang/persediaan" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 hover:underline">Periksa persediaan <ArrowRight className="h-3 w-3" /></Link></div>}
            </section>
          </aside>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Market tape · realtime</p></div><h2 className="mt-1 text-lg font-extrabold text-slate-950">Aktivitas lintas operasional</h2><p className="mt-1 text-[11px] text-slate-500">Aliran kejadian terbaru dari lapangan, Gudang, dan mitra pelaksana.</p></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <label className="relative block min-w-0 sm:w-64"><span className="sr-only">Cari aktivitas</span><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari proyek, aktivitas, atau nomor..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white" /></label>
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"><option value="all">Semua data</option><option value="request">Permintaan material</option><option value="po">Purchase Order</option></select>
            </div>
          </div>
          {recentActivity.length ? <div className="divide-y divide-slate-100">{recentActivity.filter((item) => !search.trim() || [item.actor_name,item.project_name,item.title,item.summary].some((v)=>String(v??'').toLowerCase().includes(search.trim().toLowerCase()))).map((item) => <article key={item.id} className="flex gap-3 px-4 py-3.5 sm:px-5"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${eventTone(item.event_type)}`}><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-extrabold text-slate-900">{item.title}</p><span className="text-[9px] text-slate-400">{dateTime(item.created_at)}</span></div><p className="mt-1 text-[11px] leading-5 text-slate-600">{item.summary}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">{item.actor_name} · {item.project_name}</p></div>{item.target_url ? <Link href={item.target_url} aria-label={`Buka aktivitas ${item.title}`} className="self-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-800"><ArrowUpRight className="h-4 w-4" /></Link> : null}</article>)}</div> : <div className="px-5 py-10 text-center"><Zap className="mx-auto h-7 w-7 text-emerald-600" /><p className="mt-2 text-sm font-bold text-slate-900">Terminal siap menerima aktivitas</p><p className="mt-1 text-xs text-slate-500">Kejadian operasional yang tercatat akan muncul otomatis di aliran ini.</p></div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-[9px] text-slate-500 sm:px-5"><span>Stream perusahaan tersedia untuk pengguna yang telah login.</span><span>Informasi personal dan angka sensitif hanya tersedia pada panel sesuai otoritas.</span></div>
        </section>

        <footer className="flex flex-col gap-1 border-t border-slate-200 pt-3 text-[10px] text-slate-400 sm:flex-row sm:justify-between"><span>DAHLIA Procurement Control · Sistem pengadaan terintegrasi</span><span>{isDirector ? 'Akses perusahaan / otorisasi' : 'Akses dibatasi sesuai penugasan dan peran akun'}</span></footer>
      </div>
    </main>
  );
}

export default function ProcurementDashboardPage() {
  return <RequireAuth permission="procurement.purchase.create"><ProcurementContent /></RequireAuth>;
}
