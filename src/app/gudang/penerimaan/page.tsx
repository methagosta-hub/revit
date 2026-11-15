'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileText,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import {
  fetchPurchaseOrdersAwaitingReceipt,
  fetchRecentMaterialReceipts,
  recordMaterialReceipt,
} from '@/lib/services/inventoryService';
import type {
  MaterialReceiptItemInput,
  PurchaseOrderForReceipt,
  RecentMaterialReceipt,
} from '@/types/inventory';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value);
}

function statusLabel(status: PurchaseOrderForReceipt['status']): string {
  if (status === 'partially_received') return 'Diterima sebagian';
  if (status === 'approved') return 'Disetujui';
  if (status === 'ordered') return 'Dalam pengiriman';
  return status;
}

function statusClass(status: PurchaseOrderForReceipt['status']): string {
  if (status === 'partially_received') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  if (status === 'approved') return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
}

type ReceiptDraft = {
  received: string;
  damaged: string;
  notes: string;
};

function localDateTimeValue(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function WarehouseReceivingPage() {
  const [orders, setOrders] = useState<PurchaseOrderForReceipt[]>([]);
  const [receipts, setReceipts] = useState<RecentMaterialReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderForReceipt | null>(null);
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ReceiptDraft>>({});

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [orderRows, receiptRows] = await Promise.all([
        fetchPurchaseOrdersAwaitingReceipt(),
        fetchRecentMaterialReceipts(10),
      ]);
      setOrders(orderRows);
      setReceipts(receiptRows);
    } catch (err) {
      console.error('Gagal memuat data penerimaan:', err);
      setError(err instanceof Error ? err.message : 'Data penerimaan belum dapat dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return orders;
    return orders.filter((order) => [
      order.po_number,
      order.project_name,
      order.supplier_name,
      ...order.items.map((item) => item.material_name),
    ].some((value) => value.toLocaleLowerCase('id').includes(keyword)));
  }, [orders, search]);

  const totalOutstandingLines = useMemo(
    () => orders.reduce((sum, order) => sum + order.items.length, 0),
    [orders],
  );

  const totalOutstandingMaterials = useMemo(
    () => orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity_remaining, 0),
      0,
    ),
    [orders],
  );

  const openReceiptForm = (order: PurchaseOrderForReceipt) => {
    setSelectedOrder(order);
    setReceivedAt(localDateTimeValue());
    setDeliveryNoteNo('');
    setReceiptNotes('');
    setDrafts(Object.fromEntries(order.items.map((item) => [item.id, {
      received: '',
      damaged: '0',
      notes: '',
    }])));
    setError('');
    setSuccess('');
  };

  const closeReceiptForm = () => {
    if (saving) return;
    setSelectedOrder(null);
    setDrafts({});
    setError('');
  };

  const updateDraft = (itemId: string, field: keyof ReceiptDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? { received: '', damaged: '0', notes: '' }), [field]: value },
    }));
  };

  const handleSaveReceipt = async () => {
    if (!selectedOrder || saving) return;
    setError('');
    setSuccess('');

    const items: MaterialReceiptItemInput[] = [];
    for (const item of selectedOrder.items) {
      const draft = drafts[item.id];
      const received = Number(draft?.received ?? 0);
      const damaged = Number(draft?.damaged ?? 0);
      if (!draft?.received.trim()) continue;
      if (!Number.isFinite(received) || received <= 0) {
        setError(`Jumlah diterima untuk ${item.material_name} harus lebih besar dari nol.`);
        return;
      }
      if (!Number.isFinite(damaged) || damaged < 0 || damaged > received) {
        setError(`Jumlah rusak untuk ${item.material_name} tidak valid.`);
        return;
      }
      if (received - item.quantity_remaining > 0.000001) {
        setError(`Jumlah diterima untuk ${item.material_name} melebihi sisa PO (${formatNumber(item.quantity_remaining)} ${item.unit}).`);
        return;
      }
      items.push({
        purchase_order_item_id: item.id,
        quantity_received: received,
        quantity_damaged: damaged,
        notes: draft.notes.trim() || null,
      });
    }

    if (items.length === 0) {
      setError('Masukkan jumlah barang yang benar-benar diterima minimal pada satu baris.');
      return;
    }

    const date = new Date(receivedAt);
    if (Number.isNaN(date.getTime())) {
      setError('Tanggal dan waktu penerimaan tidak valid.');
      return;
    }

    setSaving(true);
    try {
      const receiptId = await recordMaterialReceipt({
        purchase_order_id: selectedOrder.id,
        received_at: date.toISOString(),
        delivery_note_no: deliveryNoteNo.trim() || null,
        notes: receiptNotes.trim() || null,
        items,
      });
      setSelectedOrder(null);
      setDrafts({});
      setSuccess(`Penerimaan berhasil disimpan. Nomor ID: ${receiptId.slice(0, 8).toUpperCase()}`);
      await loadData(true);
    } catch (err) {
      console.error('Gagal menyimpan penerimaan:', err);
      setError(err instanceof Error ? err.message : 'Penerimaan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth permission="warehouse.receive">
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Gudang & Persediaan</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Penerimaan Material</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Catat kedatangan barang berdasarkan Purchase Order, periksa kuantitas dan pisahkan barang yang rusak.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Segarkan
            </button>
          </header>

          {error && !selectedOrder ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>{success}</div>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold text-slate-500">PO menunggu penerimaan</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{loading ? '—' : orders.length}</p></div>
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><ClipboardList className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold text-slate-500">Baris material belum lengkap</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{loading ? '—' : totalOutstandingLines}</p></div>
                <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><PackageCheck className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold text-slate-500">Jumlah sisa barang dalam PO</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{loading ? '—' : formatNumber(totalOutstandingMaterials)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Truck className="h-5 w-5" /></div>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Gabungan kuantitas; satuan mengikuti masing-masing material.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="font-bold text-slate-900">Purchase Order menunggu barang</h2>
                <p className="mt-1 text-xs text-slate-500">Hanya PO yang sudah disetujui atau dipesan yang dapat diterima.</p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari PO, proyek, supplier..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-500"><RefreshCw className="h-5 w-5 animate-spin text-emerald-600" /> Memuat Purchase Order...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><PackageCheck className="h-7 w-7" /></div>
                <h3 className="mt-4 font-bold text-slate-800">Belum ada PO yang menunggu penerimaan</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">PO yang sudah disetujui Direktur atau berstatus dalam pengiriman akan muncul di sini. Pastikan proses pengadaan dan Purchase Order sudah dicatat.</p>
                <Link href="/pengadaan/purchase-order" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4" /> Lihat Purchase Order</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3 font-bold">Nomor PO</th><th className="px-5 py-3 font-bold">Proyek</th><th className="px-5 py-3 font-bold">Supplier</th><th className="px-5 py-3 font-bold">Tgl. Pesan</th><th className="px-5 py-3 font-bold">Item tersisa</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 text-right font-bold">Tindakan</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-900">{order.po_number}</td>
                        <td className="max-w-[220px] px-5 py-4"><div className="truncate font-medium text-slate-800">{order.project_name}</div><div className="mt-0.5 text-xs text-slate-400">{order.project_id.slice(0, 8).toUpperCase()}</div></td>
                        <td className="px-5 py-4 text-slate-600">{order.supplier_name}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(order.order_date)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-700">{order.items.length} baris</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></td>
                        <td className="px-5 py-4 text-right"><button type="button" onClick={() => openReceiptForm(order)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-3.5 w-3.5" /> Catat penerimaan</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <h2 className="font-bold text-slate-900">Riwayat penerimaan terbaru</h2>
              <p className="mt-1 text-xs text-slate-500">Penerimaan yang sudah dikonfirmasi dan menambah stok proyek.</p>
            </div>
            {receipts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Belum ada riwayat penerimaan.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-bold">No. Penerimaan</th><th className="px-5 py-3 font-bold">Tanggal</th><th className="px-5 py-3 font-bold">Proyek</th><th className="px-5 py-3 font-bold">PO / Supplier</th><th className="px-5 py-3 font-bold">Baris</th><th className="px-5 py-3 font-bold">Qty rusak</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-slate-800">{receipt.receipt_number}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{formatDateTime(receipt.received_at)}</td>
                        <td className="px-5 py-3.5 text-slate-700">{receipt.project_name}</td>
                        <td className="px-5 py-3.5"><div className="font-medium text-slate-700">{receipt.po_number}</div><div className="text-xs text-slate-400">{receipt.supplier_name}</div></td>
                        <td className="px-5 py-3.5 text-slate-600">{receipt.item_count} baris</td>
                        <td className="px-5 py-3.5 text-slate-600">{formatNumber(receipt.quantity_damaged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedOrder ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReceiptForm(); }}>
              <section role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
                <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Form penerimaan barang</p><h2 id="receipt-dialog-title" className="mt-1 text-lg font-extrabold text-slate-900">{selectedOrder.po_number}</h2><p className="mt-1 text-sm text-slate-500">{selectedOrder.project_name} · {selectedOrder.supplier_name}</p></div>
                  <button type="button" onClick={closeReceiptForm} disabled={saving} aria-label="Tutup" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
                </header>
                <div className="space-y-5 p-4 sm:p-5">
                  {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Tanggal dan waktu diterima</span><input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Nomor surat jalan / delivery note</span><input value={deliveryNoteNo} onChange={(event) => setDeliveryNoteNo(event.target.value)} maxLength={100} placeholder="Contoh: SJ-001/11/2026" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></label>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-[850px] w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Material</th><th className="px-3 py-3 text-right">Dipesan</th><th className="px-3 py-3 text-right">Sudah diterima</th><th className="px-3 py-3 text-right">Sisa PO</th><th className="px-3 py-3">Qty datang</th><th className="px-3 py-3">Qty rusak</th><th className="px-3 py-3">Catatan</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrder.items.map((item) => {
                          const draft = drafts[item.id] ?? { received: '', damaged: '0', notes: '' };
                          return (
                            <tr key={item.id}>
                              <td className="px-3 py-3"><div className="font-semibold text-slate-800">{item.material_name}</div><div className="text-xs text-slate-400">{item.material_code || 'Tanpa kode'} · {item.unit}</div></td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatNumber(item.quantity_ordered)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatNumber(item.quantity_received)}</td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{formatNumber(item.quantity_remaining)}</td>
                              <td className="px-3 py-3"><input type="number" min="0" max={item.quantity_remaining} step="0.001" value={draft.received} onChange={(event) => updateDraft(item.id, 'received', event.target.value)} placeholder="0" className="w-24 rounded-lg border border-slate-200 px-2.5 py-2 text-right text-sm outline-none focus:border-emerald-500" /></td>
                              <td className="px-3 py-3"><input type="number" min="0" max={draft.received || item.quantity_remaining} step="0.001" value={draft.damaged} onChange={(event) => updateDraft(item.id, 'damaged', event.target.value)} className="w-24 rounded-lg border border-slate-200 px-2.5 py-2 text-right text-sm outline-none focus:border-emerald-500" /></td>
                              <td className="px-3 py-3"><input value={draft.notes} onChange={(event) => updateDraft(item.id, 'notes', event.target.value)} placeholder="Opsional" className="w-36 rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Catatan penerimaan</span><textarea rows={2} value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} maxLength={2000} placeholder="Kondisi pengiriman, selisih, atau informasi lainnya..." className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></label>
                  <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                    <button type="button" onClick={closeReceiptForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                    <button type="button" onClick={() => void handleSaveReceipt()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? 'Menyimpan...' : 'Konfirmasi penerimaan'}</button>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </main>
    </RequireAuth>
  );
}
