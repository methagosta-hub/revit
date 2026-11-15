'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { approvePurchaseOrder, fetchPurchaseOrders } from '@/lib/services/procurementService';
import type { PurchaseOrder } from '@/types/procurement';

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));

function ApprovalContent() {
  const { access } = useAuth();
  const canApprove = access?.roles.some((role) => ['director', 'admin'].includes(role.code) && role.scope === 'company') ?? false;
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setOrders(await fetchPurchaseOrders(['pending_approval'])); }
    catch (err) { setError(err instanceof Error ? err.message : 'Antrean persetujuan gagal dimuat.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(po: PurchaseOrder) {
    const confirmed = window.confirm(`Setujui Purchase Order ${po.po_number} senilai ${money(po.subtotal)}?`);
    if (!confirmed) return;
    setProcessingId(po.id); setError(''); setSuccess('');
    try {
      await approvePurchaseOrder(po.id);
      setSuccess(`PO ${po.po_number} telah disetujui.`);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Persetujuan gagal diproses.'); }
    finally { setProcessingId(''); }
  }

  if (!canApprove) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Persetujuan PO hanya tersedia bagi Direktur atau Admin perusahaan.</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Pengadaan & Purchasing</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Persetujuan Pembelian</h1><p className="mt-1 text-sm text-slate-500">Periksa rincian dan nilai PO sebelum memberikan persetujuan.</p></div><button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang</button></div>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
    {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><div className="rounded-xl bg-amber-50 p-2 text-amber-700"><ClipboardCheck className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Menunggu persetujuan</h2><p className="text-xs text-slate-500">{orders.length} PO dalam antrean</p></div></div>
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Memuat antrean...</div> : orders.length === 0 ? <div className="p-12 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-2 font-semibold text-slate-800">Tidak ada PO yang menunggu</p><p className="mt-1 text-sm text-slate-500">Semua pengajuan pembelian sudah ditindaklanjuti.</p></div> : <div className="divide-y divide-slate-100">{orders.map((po) => <article key={po.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{po.po_number}</h3><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Menunggu persetujuan</span></div><p className="mt-1 text-sm text-slate-600">{po.project?.title ?? 'Proyek tidak diketahui'} · {po.project?.client ?? ''}</p><p className="text-sm text-slate-600">Supplier: {po.supplier?.name ?? '—'} · Tanggal: {dateLabel(po.order_date)}</p>{po.expected_date && <p className="text-xs text-slate-500">Perkiraan tiba: {dateLabel(po.expected_date)}</p>}</div><div className="text-right"><p className="text-xs text-slate-500">Subtotal PO</p><p className="text-xl font-bold tabular-nums text-slate-900">{money(po.subtotal)}</p><button onClick={() => void approve(po)} disabled={processingId === po.id} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{processingId === po.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Setujui PO</button></div></div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[500px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Barang</th><th className="px-3 py-2">Kuantitas</th><th className="px-3 py-2">Harga</th><th className="px-3 py-2">Jumlah</th></tr></thead><tbody className="divide-y divide-slate-100">{po.items.map((item) => <tr key={item.id}><td className="px-3 py-2 font-medium text-slate-800">{item.material_name}{item.material_code && <span className="ml-1 text-slate-400">({item.material_code})</span>}</td><td className="px-3 py-2 text-slate-600">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(item.quantity_ordered)} {item.unit}</td><td className="px-3 py-2 text-slate-600">{money(item.unit_price)}</td><td className="px-3 py-2 font-semibold text-slate-800">{money(item.line_total)}</td></tr>)}</tbody></table></div>
        {po.notes && <p className="mt-3 text-xs text-slate-600">Catatan: {po.notes}</p>}
      </article>)}</div>}
    </div>
    <p className="text-xs text-slate-500">Persetujuan ini mengubah status PO menjadi <strong>Disetujui</strong>. Purchasing kemudian dapat menandainya sebagai sudah dipesan. Gudang dapat mencatat penerimaan setelah PO disetujui.</p>
    <Link href="/pengadaan/purchasing" className="text-sm font-semibold text-emerald-700 hover:underline">Kembali ke Proses Purchasing</Link>
  </div>;
}

export default function ProcurementApprovalPage() {
  return <RequireAuth permission="procurement.purchase.approve"><ApprovalContent /></RequireAuth>;
}
