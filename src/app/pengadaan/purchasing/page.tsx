'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowRight, ClipboardList, LoaderCircle, Plus, RefreshCw,
  Save, Send, ShoppingCart, Trash2,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  createPurchaseOrder, fetchProjectsForProcurement, fetchPurchaseOrders, fetchSuppliers,
} from '@/lib/services/procurementService';
import type { ProjectOption, PurchaseOrder, PurchaseOrderItemInput, Supplier } from '@/types/procurement';

const money = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value || 0);
const dateLabel = (value?: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : '—';
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function statusLabel(status: PurchaseOrder['status']) {
  const labels: Record<PurchaseOrder['status'], string> = {
    draft: 'Draft', pending_approval: 'Menunggu persetujuan', approved: 'Disetujui',
    ordered: 'Sudah dipesan', partially_received: 'Diterima sebagian',
    received: 'Selesai diterima', cancelled: 'Dibatalkan',
  };
  return labels[status] ?? status;
}

function statusStyle(status: PurchaseOrder['status']) {
  if (status === 'pending_approval') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'approved' || status === 'ordered') return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (status === 'partially_received') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (status === 'received') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'cancelled') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

type DraftLine = { material_code: string; material_name: string; unit: string; quantity_ordered: string; unit_price: string; notes: string };
const emptyLine = (): DraftLine => ({ material_code: '', material_name: '', unit: 'pcs', quantity_ordered: '1', unit_price: '0', notes: '' });

function PurchasingContent() {
  const { access } = useAuth();
  const hasPurchasingRole = access?.roles.some((role) =>
    ['director', 'admin', 'purchasing'].includes(role.code) && role.scope === 'company',
  ) ?? false;
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const loadData = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [poRows, projectRows, supplierRows] = await Promise.all([
        fetchPurchaseOrders(), fetchProjectsForProcurement(), fetchSuppliers(true),
      ]);
      setOrders(poRows);
      setProjects(projectRows);
      setSuppliers(supplierRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data pengadaan gagal dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return orders;
    return orders.filter((po) => [po.po_number, po.project?.title ?? '', po.supplier?.name ?? '', po.status]
      .some((value) => value.toLocaleLowerCase('id').includes(keyword)));
  }, [orders, search]);

  const draftSubtotal = useMemo(() => lines.reduce((sum, line) => {
    const qty = Number(line.quantity_ordered) || 0;
    const price = Number(line.unit_price) || 0;
    return sum + qty * price;
  }, 0), [lines]);

  const resetForm = () => {
    setShowForm(false); setProjectId(''); setSupplierId(''); setOrderDate(today());
    setExpectedDate(''); setNotes(''); setLines([emptyLine()]);
  };

  const updateLine = (index: number, field: keyof DraftLine, value: string) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSuccess('');
    if (!projectId || !supplierId) { setError('Proyek dan supplier wajib dipilih.'); return; }
    if (expectedDate && expectedDate < orderDate) { setError('Perkiraan tiba tidak boleh sebelum tanggal PO.'); return; }
    const validLines = lines.filter((line) => line.material_name.trim() && line.unit.trim());
    if (validLines.length === 0) { setError('Minimal satu rincian barang harus diisi.'); return; }
    const invalid = validLines.some((line) => !(Number(line.quantity_ordered) > 0) || Number(line.unit_price) < 0 || !Number.isFinite(Number(line.unit_price)));
    if (invalid) { setError('Periksa kuantitas dan harga. Kuantitas harus lebih dari nol dan harga tidak boleh negatif.'); return; }

    setSaving(true);
    try {
      await createPurchaseOrder({
        project_id: projectId,
        supplier_id: supplierId,
        order_date: orderDate,
        expected_date: expectedDate || null,
        notes,
        items: validLines.map((line): PurchaseOrderItemInput => ({
          material_code: line.material_code.trim() || null,
          material_name: line.material_name.trim(),
          unit: line.unit.trim(),
          quantity_ordered: Number(line.quantity_ordered),
          unit_price: Number(line.unit_price),
          notes: line.notes.trim() || null,
        })),
      });
      setSuccess('Purchase Order berhasil diajukan dan masuk antrean persetujuan Direktur.');
      resetForm();
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase Order gagal disimpan.');
    } finally { setSaving(false); }
  }

  if (!hasPurchasingRole) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Halaman pembuatan Purchase Order hanya untuk peran Purchasing, Direktur, atau Admin perusahaan.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Pengadaan & Purchasing</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Proses Purchasing</h1>
          <p className="mt-1 text-sm text-slate-500">Susun Purchase Order dari kebutuhan proyek dan ajukan untuk persetujuan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pengadaan/persetujuan" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Antrean Persetujuan <ArrowRight className="h-4 w-4" /></Link>
          <button onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Buat PO</button>
        </div>
      </div>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

      {showForm && <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Buat Purchase Order</h2><p className="text-xs text-slate-500">PO akan berstatus Menunggu Persetujuan setelah disimpan.</p></div><button type="button" onClick={resetForm} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Tutup</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Proyek <select required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Pilih proyek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title} — {project.client}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700">Supplier <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Pilih supplier aktif</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{suppliers.length === 0 && <span className="mt-1 block text-xs text-amber-700">Belum ada supplier aktif. <Link href="/pengadaan/supplier" className="font-semibold underline">Tambah supplier</Link>.</span>}</label>
          <label className="block text-sm font-medium text-slate-700">Tanggal PO <input required type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">Perkiraan tiba <input type="date" min={orderDate} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">Rincian barang</h3><button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Tambah baris</button></div>
          {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-12">
            <label className="text-xs font-medium text-slate-600 md:col-span-2">Kode<input value={line.material_code} onChange={(e) => updateLine(index, 'material_code', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" placeholder="Opsional" /></label>
            <label className="text-xs font-medium text-slate-600 md:col-span-4">Nama barang/material<input required value={line.material_name} onChange={(e) => updateLine(index, 'material_name', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" placeholder="Contoh: Semen Portland 40 kg" /></label>
            <label className="text-xs font-medium text-slate-600 md:col-span-1">Satuan<input required value={line.unit} onChange={(e) => updateLine(index, 'unit', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" placeholder="zak" /></label>
            <label className="text-xs font-medium text-slate-600 md:col-span-2">Kuantitas<input required type="number" min="0.001" step="0.001" value={line.quantity_ordered} onChange={(e) => updateLine(index, 'quantity_ordered', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
            <label className="text-xs font-medium text-slate-600 md:col-span-2">Harga satuan<input required type="number" min="0" step="1" value={line.unit_price} onChange={(e) => updateLine(index, 'unit_price', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
            <div className="flex items-end justify-end md:col-span-1"><button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Hapus baris" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
            <div className="md:col-span-12"><label className="text-xs font-medium text-slate-600">Catatan barang<input value={line.notes} onChange={(e) => updateLine(index, 'notes', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" placeholder="Spesifikasi/merk (opsional)" /></label></div>
          </div>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:items-end"><label className="block text-sm font-medium text-slate-700">Catatan PO<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Catatan tambahan untuk supplier atau tim internal" /></label><div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-300">Estimasi subtotal</p><p className="mt-1 text-2xl font-bold">{money(draftSubtotal)}</p><p className="mt-1 text-[11px] text-slate-300">Belum termasuk biaya lain atau pajak.</p></div></div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button><button disabled={saving || !suppliers.length || !projects.length} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{saving ? 'Mengirim...' : 'Ajukan untuk Persetujuan'}</button></div>
      </form>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-emerald-700" /><div><h2 className="font-bold text-slate-900">Daftar Purchase Order</h2><p className="text-xs text-slate-500">{orders.length} dokumen PO tercatat</p></div></div><div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor, proyek, supplier..." className="w-60 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button onClick={() => void loadData(true)} disabled={refreshing} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Muat ulang"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Memuat Purchase Order...</div> : filteredOrders.length === 0 ? <div className="p-12 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-700">Belum ada Purchase Order</p><p className="mt-1 text-sm text-slate-500">Buat PO pertama setelah supplier dan proyek tersedia.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nomor / Tanggal</th><th className="px-4 py-3">Proyek</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Subtotal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Rincian</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredOrders.map((po) => <tr key={po.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-bold text-slate-900">{po.po_number}</p><p className="text-xs text-slate-500">{dateLabel(po.order_date)}</p></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{po.project?.title ?? '—'}</p><p className="text-xs text-slate-500">{po.project?.client ?? ''}</p></td><td className="px-4 py-3 text-slate-700">{po.supplier?.name ?? '—'}</td><td className="px-4 py-3 font-semibold tabular-nums text-slate-800">{money(po.subtotal)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(po.status)}`}>{statusLabel(po.status)}</span></td><td className="px-4 py-3 text-slate-600">{po.items.length} baris</td></tr>)}</tbody></table></div>}
      </div>
      <p className="text-xs text-slate-500">PO baru dibuat dengan status <strong>Menunggu persetujuan</strong>. Setelah disetujui Direktur, tandai sebagai dipesan pada halaman <Link href="/pengadaan/purchase-order" className="font-semibold text-emerald-700 underline">Purchase Order</Link> agar dapat diproses Gudang saat barang tiba.</p>
    </div>
  );
}

export default function PurchasingPage() {
  return <RequireAuth permission="procurement.purchase.create"><PurchasingContent /></RequireAuth>;
}
