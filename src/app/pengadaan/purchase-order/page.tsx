'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, LoaderCircle, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { fetchPurchaseOrders, markPurchaseOrderOrdered } from '@/lib/services/procurementService';
import type { PurchaseOrder } from '@/types/procurement';

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
const statusText: Record<PurchaseOrder['status'], string> = {
  draft: 'Draft', pending_approval: 'Menunggu persetujuan', approved: 'Disetujui', ordered: 'Sudah dipesan',
  partially_received: 'Diterima sebagian', received: 'Selesai diterima', cancelled: 'Dibatalkan',
};

function PurchaseOrderContent() {
  const { access } = useAuth();
  const canManage = access?.roles.some((role) => ['director', 'admin', 'purchasing'].includes(role.code) && role.scope === 'company') ?? false;
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { setOrders(await fetchPurchaseOrders()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Data PO gagal dimuat.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markOrdered(po: PurchaseOrder) {
    if (!window.confirm(`Tandai ${po.po_number} sebagai sudah dipesan ke supplier?`)) return;
    setWorkingId(po.id); setError(''); setSuccess('');
    try { await markPurchaseOrderOrdered(po.id); setSuccess(`${po.po_number} sekarang berstatus Sudah dipesan.`); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Status PO gagal diperbarui.'); }
    finally { setWorkingId(''); }
  }

  if (!canManage) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Daftar PO perusahaan tersedia bagi Purchasing, Direktur, atau Admin.</div>;

  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Pengadaan & Purchasing</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Purchase Order</h1><p className="mt-1 text-sm text-slate-500">Pantau PO yang diajukan, disetujui, dipesan, hingga diterima Gudang.</p></div><div className="flex gap-2"><Link href="/pengadaan/purchasing" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><ArrowRight className="h-4 w-4" /> Proses Purchasing</Link><button onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button></div></div>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}{success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h2 className="font-bold text-slate-900">Seluruh PO</h2><p className="text-xs text-slate-500">{orders.length} dokumen tercatat</p></div>{loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Memuat PO...</div> : orders.length === 0 ? <div className="p-12 text-center"><PackageCheck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 font-semibold text-slate-800">Belum ada PO</p><p className="mt-1 text-sm text-slate-500">Mulai dari halaman Proses Purchasing.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nomor PO</th><th className="px-4 py-3">Proyek / Supplier</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Subtotal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((po) => <tr key={po.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-bold text-slate-900">{po.po_number}<p className="mt-0.5 text-xs font-normal text-slate-500">{po.items.length} baris barang</p></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{po.project?.title ?? '—'}</p><p className="text-xs text-slate-500">{po.supplier?.name ?? '—'}</p></td><td className="px-4 py-3 text-slate-600">{dateLabel(po.order_date)}{po.expected_date && <p className="text-xs text-slate-400">Tiba: {dateLabel(po.expected_date)}</p>}</td><td className="px-4 py-3 font-semibold text-slate-800">{money(po.subtotal)}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{statusText[po.status]}</span></td><td className="px-4 py-3">{po.status === 'approved' && <button onClick={() => void markOrdered(po)} disabled={workingId === po.id} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{workingId === po.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}Tandai dipesan</button>}{['ordered', 'partially_received', 'received'].includes(po.status) && <Link href="/gudang/penerimaan" className="text-xs font-semibold text-emerald-700 hover:underline">Ke Penerimaan Gudang</Link>}{po.status === 'pending_approval' && <span className="text-xs text-amber-700">Menunggu Direktur</span>}</td></tr>)}</tbody></table></div>}</div>
    <p className="text-xs text-slate-500">Status <strong>Disetujui</strong> dapat ditandai <strong>Sudah dipesan</strong>. Status <strong>Sudah dipesan</strong> dan <strong>Diterima sebagian</strong> akan muncul pada halaman Penerimaan Gudang.</p>
  </div>;
}

export default function PurchaseOrderPage() {
  return <RequireAuth permission="procurement.purchase.create"><PurchaseOrderContent /></RequireAuth>;
}
