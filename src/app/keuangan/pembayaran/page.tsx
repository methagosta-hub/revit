'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, ArrowUpRight, Banknote, Ban, CheckCircle2, ChevronRight,
  ClipboardList, FileCheck2, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck,
  Wallet, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import {
  fetchPayablePurchaseOrders, fetchSupplierPayments, recordSupplierPayment, voidSupplierPayment,
} from '@/lib/services/financeService';
import type { PayablePurchaseOrder, SupplierPayment } from '@/types/finance';

const DRAFT_KEY = 'dahlia:finance:supplier-payment-draft:v1';
const money = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
type PaymentForm = {
  purchase_order_id: string;
  payment_date: string;
  amount: string;
  payment_method: 'bank_transfer' | 'cash' | 'other';
  reference_number: string;
  notes: string;
};
const emptyForm = (): PaymentForm => ({
  purchase_order_id: '', payment_date: today(), amount: '', payment_method: 'bank_transfer',
  reference_number: '', notes: '',
});
const inputClass = 'mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10';
const labelClass = 'block text-sm font-semibold text-slate-700';

function Metric({ title, value, helper, icon: Icon, tone }: {
  title: string; value: string; helper: string; icon: typeof Wallet; tone: 'indigo' | 'amber' | 'green';
}) {
  const colors = { indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100', amber: 'bg-amber-50 text-amber-700 ring-amber-100', green: 'bg-emerald-50 text-emerald-700 ring-emerald-100' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div><span className={`rounded-xl p-3 ring-1 ${colors[tone]}`}><Icon className="h-5 w-5" /></span></div></div>;
}

function PaymentContent() {
  const [orders, setOrders] = useState<PayablePurchaseOrder[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [form, setForm] = useState<PaymentForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'orders' | 'history'>('orders');
  const [poQuery, setPoQuery] = useState('');
  const [paymentQuery, setPaymentQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelTarget, setCancelTarget] = useState<SupplierPayment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [poRows, paymentRows] = await Promise.all([fetchPayablePurchaseOrders(), fetchSupplierPayments()]);
      setOrders(poRows); setPayments(paymentRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data pembayaran gagal dimuat.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Draft lokal dipulihkan saat halaman dibuka ulang agar form pembayaran tidak perlu diisi dari awal.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { form?: PaymentForm; showForm?: boolean };
        if (draft.form) setForm({ ...emptyForm(), ...draft.form });
        setShowForm(Boolean(draft.showForm));
        if (draft.form) setDraftRestored(true);
      }
    } catch { /* Draft rusak diabaikan. */ }
    finally { setDraftReady(true); }
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    try {
      const hasContent = Boolean(form.purchase_order_id || form.amount || form.reference_number || form.notes);
      if (showForm || hasContent) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, showForm }));
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* Browser mungkin menonaktifkan penyimpanan sesi. */ }
  }, [draftReady, form, showForm]);

  const selected = orders.find(x => x.id === form.purchase_order_id);
  const paidRows = payments.filter(x => x.status === 'paid');
  const totalPaid = paidRows.reduce((sum, x) => sum + x.amount, 0);
  const outstanding = orders.reduce((sum, x) => sum + x.remaining, 0);
  const canSave = Boolean(selected) && Number.isSafeInteger(Number(form.amount)) && Number(form.amount) > 0 && Number(form.amount) <= ((selected?.remaining ?? 0) + 0.000001);
  const filteredOrders = useMemo(() => orders.filter(po => [po.po_number, po.project_name, po.supplier_name].join(' ').toLowerCase().includes(poQuery.toLowerCase().trim())), [orders, poQuery]);
  const filteredPayments = useMemo(() => payments.filter(item => [item.payment_number, item.project_name, item.po_number, item.supplier_name].join(' ').toLowerCase().includes(paymentQuery.toLowerCase().trim())), [payments, paymentQuery]);
  const update = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) => setForm(old => ({ ...old, [key]: value }));

  function chooseOrder(order: PayablePurchaseOrder) {
    setForm(old => ({ ...old, purchase_order_id: order.id, amount: String(Math.floor(order.remaining)) }));
    setShowForm(true); setTab('orders'); setError(''); setSuccess('');
  }
  function discardDraft() {
    setForm(emptyForm()); setShowForm(false); setDraftRestored(false);
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) { setError('Pilih Purchase Order terlebih dahulu.'); return; }
    const amount = Number(form.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > selected.remaining) {
      setError('Nominal harus berupa Rupiah bulat dan tidak boleh melebihi sisa nilai PO.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      await recordSupplierPayment({
        purchase_order_id: form.purchase_order_id,
        payment_date: form.payment_date,
        amount,
        payment_method: form.payment_method,
        reference_number: form.reference_number.trim(),
        notes: form.notes.trim(),
      });
      setSuccess('Pembayaran supplier berhasil dicatat dan otomatis masuk ke mutasi kas keluar.');
      setForm(emptyForm()); setShowForm(false); setDraftRestored(false);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal disimpan.'); }
    finally { setSaving(false); }
  }

  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCanceling(true); setError(''); setSuccess('');
    try {
      await voidSupplierPayment(cancelTarget.id, cancelReason.trim());
      setSuccess(`${cancelTarget.payment_number} dibatalkan. Mutasi kas terkait ikut dibatalkan.`);
      setCancelTarget(null); setCancelReason(''); await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal dibatalkan.'); }
    finally { setCanceling(false); }
  }

  return <div className="min-h-full space-y-6 pb-8">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 text-white shadow-lg sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-indigo-400/15 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-200"><Banknote className="h-3.5 w-3.5" /> KEUANGAN · UTANG PEMBELIAN</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pembayaran Supplier</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Pilih PO yang akan dibayar, masukkan nominal, dan catat bukti pembayaran. Pembukuan kas keluar dibuat otomatis oleh sistem.</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang</button>
      </div>
    </header>

    {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span><button type="button" onClick={() => setError('')} className="ml-auto rounded-lg p-1 hover:bg-rose-100" aria-label="Tutup pesan"><X className="h-4 w-4" /></button></div>}
    {success && <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span>{success}</span><button type="button" onClick={() => setSuccess('')} className="ml-auto rounded-lg p-1 hover:bg-emerald-100" aria-label="Tutup pesan"><X className="h-4 w-4" /></button></div>}
    {draftRestored && !showForm && <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-amber-900">Ada draft pembayaran yang belum selesai</p><p className="mt-1 text-xs text-amber-800">Isian sebelumnya masih tersimpan di sesi browser ini.</p></div><div className="flex gap-2"><button type="button" onClick={discardDraft} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900">Buang draft</button><button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white">Lanjutkan draft</button></div></div>}

    <section className="grid gap-4 sm:grid-cols-3">
      <Metric title="Total pembayaran aktif" value={money(totalPaid)} helper={`${paidRows.length} pembayaran berstatus dibayar`} icon={Wallet} tone="green" />
      <Metric title="PO perlu dibayar" value={String(orders.length)} helper="PO dengan sisa pembayaran" icon={ClipboardList} tone="amber" />
      <Metric title="Total sisa kewajiban PO" value={money(outstanding)} helper="Akumulasi sisa nilai PO tersedia" icon={ArrowUpRight} tone="indigo" />
    </section>

    {showForm && <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-indigo-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><div className="flex items-center gap-2"><span className="rounded-lg bg-indigo-100 p-2 text-indigo-800"><FileCheck2 className="h-4 w-4" /></span><h2 className="text-lg font-bold text-slate-900">Form pembayaran PO</h2></div><p className="mt-2 text-xs text-slate-600">Ikuti urutan: pilih PO, periksa sisa tagihan, lalu isi detail pembayaran.</p></div><div className="flex items-center gap-2">{draftRestored && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Draft dipulihkan</span>}<button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Tutup formulir"><X className="h-5 w-5" /></button></div></div>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">1 · Pilih Purchase Order</p><label className={labelClass}>PO yang akan dibayar *<select required value={form.purchase_order_id} onChange={e => { const po = orders.find(x => x.id === e.target.value); setForm(old => ({ ...old, purchase_order_id: e.target.value, amount: po ? String(Math.floor(po.remaining)) : '' })); }} className={inputClass}><option value="">Pilih PO dengan sisa pembayaran</option>{orders.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.supplier_name} — Sisa {money(po.remaining)}</option>)}</select></label></div>
        {selected ? <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">PO terpilih</p><h3 className="mt-1 text-lg font-bold text-slate-900">{selected.po_number}</h3><p className="mt-1 text-sm text-slate-600">{selected.supplier_name} · {selected.project_name}</p></div><span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700">Siap dibayar</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white/80 p-3"><p className="text-[11px] text-slate-500">Nilai PO</p><p className="mt-1 text-sm font-bold text-slate-800">{money(selected.subtotal)}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-[11px] text-slate-500">Sudah dibayar</p><p className="mt-1 text-sm font-bold text-slate-800">{money(selected.paid_total)}</p></div><div className="rounded-xl bg-white p-3 ring-1 ring-indigo-200"><p className="text-[11px] font-semibold text-indigo-600">Sisa PO</p><p className="mt-1 text-sm font-bold text-indigo-800">{money(selected.remaining)}</p></div></div></div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><ClipboardList className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700">Belum ada PO yang dipilih</p><p className="mt-1 text-xs text-slate-500">Pilih PO pada daftar di atas untuk melihat sisa yang harus dibayar.</p></div>}
        <div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">2 · Detail pembayaran</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className={labelClass}>Tanggal pembayaran *<input required type="date" value={form.payment_date} onChange={e => update('payment_date', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Jumlah dibayar (Rupiah) *<div className="relative"><span className="absolute left-3.5 top-3 text-sm font-bold text-slate-400">Rp</span><input required type="number" min="1" step="1" inputMode="numeric" max={selected?.remaining ?? undefined} value={form.amount} onChange={e => update('amount', e.target.value)} className={`${inputClass} pl-10`} placeholder="0" /></div><span className="mt-1 block text-xs font-normal text-slate-400">Batas pembayaran: {money(selected?.remaining ?? 0)}</span></label>
          <label className={labelClass}>Metode pembayaran *<select required value={form.payment_method} onChange={e => update('payment_method', e.target.value as PaymentForm['payment_method'])} className={inputClass}><option value="bank_transfer">Transfer bank</option><option value="cash">Tunai</option><option value="other">Lainnya</option></select></label>
          <label className={labelClass}>Nomor referensi<input maxLength={120} value={form.reference_number} onChange={e => update('reference_number', e.target.value)} className={inputClass} placeholder="Nomor bukti transfer" /></label>
          <label className={`${labelClass} md:col-span-2`}>Catatan<textarea rows={2} maxLength={1000} value={form.notes} onChange={e => update('notes', e.target.value)} className={inputClass} placeholder="Catatan tambahan (opsional)" /></label>
        </div></div>
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-slate-500">Pratinjau pembayaran</p><p className="mt-1 text-xl font-bold text-indigo-700">{money(Number(form.amount) || 0)}</p><p className="text-xs text-slate-500">{selected ? `${selected.po_number} · ${selected.supplier_name}` : 'Pilih PO untuk melanjutkan'}</p>{selected && Number(form.amount) > selected.remaining && <p className="mt-1 text-xs font-semibold text-rose-600">Nominal melebihi sisa PO.</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={discardDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Buang draft</button><button disabled={saving || !canSave} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan pembayaran'}</button></div></div>
        <p className="text-xs leading-5 text-slate-500">Setelah tersimpan, pembayaran otomatis membentuk mutasi kas keluar. Jangan mencatat nominal yang sama lagi di menu Kas & Operasional.</p>
      </form>
    </section>}

    {tab === 'history' && filteredPayments.length > 0 ? <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><h2 className="font-bold text-slate-900">Cetak bukti pembayaran supplier</h2><p className="mb-3 text-xs text-slate-600">Nomor dan status mengikuti transaksi pembayaran yang tersimpan.</p><div className="grid gap-3 lg:grid-cols-2">{filteredPayments.map((payment) => <article key={`pdf-${payment.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm"><div><p className="font-bold text-emerald-800">{payment.payment_number}</p><p className="text-xs text-slate-600">{payment.supplier_name} · {payment.project_name} · {money(payment.amount)}</p></div><BusinessDocumentPdfButton identity={{ type: 'payment_voucher', code: payment.payment_number, title: 'Bukti Pembayaran Supplier', sourceStatus: payment.status, generatedAt: new Date().toISOString(), projectName: payment.project_name, period: dateLabel(payment.payment_date), classification: 'Dokumen keuangan terbatas' }} sections={[
      { title: 'Identitas pembayaran', details: [
        { label: 'Nomor pembayaran', value: payment.payment_number }, { label: 'Tanggal', value: dateLabel(payment.payment_date) },
        { label: 'Supplier', value: payment.supplier_name }, { label: 'Proyek', value: payment.project_name },
        { label: 'Nomor PO', value: payment.po_number }, { label: 'Jumlah dibayar', value: money(payment.amount) },
        { label: 'Metode', value: payment.payment_method }, { label: 'Referensi', value: payment.reference_number ?? '—' }, { label: 'Status', value: payment.status },
      ] },
      { title: 'Catatan pembayaran', paragraphs: [payment.notes?.trim() || 'Tidak ada catatan tambahan pada transaksi sumber.'] },
    ]} /></article>)}</div></section> : null}

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-bold text-slate-900">Kelola pembayaran supplier</h2><p className="mt-1 text-sm text-slate-500">Pilih daftar PO yang belum lunas atau telusuri dokumen pembayaran.</p></div><button type="button" onClick={() => { setForm(old => old.purchase_order_id ? old : emptyForm()); setShowForm(true); setTab('orders'); setError(''); }} className="inline-flex w-fit items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-800"><Plus className="h-4 w-4" /> Pembayaran baru</button></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setTab('orders')} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>PO perlu dibayar <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{orders.length}</span></button><button type="button" onClick={() => setTab('history')} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Riwayat pembayaran</button></div>
          <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input value={tab === 'orders' ? poQuery : paymentQuery} onChange={e => tab === 'orders' ? setPoQuery(e.target.value) : setPaymentQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" placeholder={tab === 'orders' ? 'Cari PO, supplier, proyek...' : 'Cari nomor pembayaran, supplier...'} /></div>
        </div></div>
      {loading ? <div className="flex items-center justify-center gap-3 p-14 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat data pembayaran...</div> : tab === 'orders' ? filteredOrders.length === 0 ? <div className="p-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-3 font-semibold text-slate-800">Tidak ada PO yang perlu dibayar</p><p className="mt-1 text-sm text-slate-500">Semua PO yang tersedia sudah lunas atau tidak ada yang sesuai pencarian.</p></div> : <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">{filteredOrders.map(po => <article key={po.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-indigo-600">{po.po_number}</p><h3 className="mt-1 font-bold text-slate-900">{po.supplier_name}</h3><p className="mt-1 text-xs text-slate-500">{po.project_name}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Belum lunas</span></div><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-[11px] text-slate-500">Nilai PO</p><p className="mt-1 text-sm font-semibold text-slate-800">{money(po.subtotal)}</p></div><div><p className="text-[11px] text-slate-500">Sudah dibayar</p><p className="mt-1 text-sm font-semibold text-slate-800">{money(po.paid_total)}</p></div><div className="col-span-2 border-t border-slate-200 pt-3"><p className="text-[11px] font-semibold text-slate-500">Sisa tagihan</p><p className="mt-1 text-lg font-bold text-indigo-700">{money(po.remaining)}</p></div></div><button type="button" onClick={() => chooseOrder(po)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">Pilih untuk dibayar <ChevronRight className="h-4 w-4" /></button></article>)}</div> : filteredPayments.length === 0 ? <div className="p-12 text-center"><FileCheck2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 font-semibold text-slate-800">Riwayat tidak ditemukan</p><p className="mt-1 text-sm text-slate-500">Ubah kata kunci pencarian atau periksa kembali data pembayaran.</p></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Nomor / tanggal</th><th className="px-5 py-4">Proyek</th><th className="px-5 py-4">PO / supplier</th><th className="px-5 py-4">Metode</th><th className="px-5 py-4 text-right">Jumlah</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredPayments.map(item => <tr key={item.id} className="transition hover:bg-slate-50/80"><td className="px-5 py-4 font-semibold text-slate-800">{item.payment_number}<p className="mt-1 text-xs font-normal text-slate-400">{item.payment_date}</p></td><td className="px-5 py-4 text-slate-600">{item.project_name}</td><td className="px-5 py-4 font-medium text-slate-800">{item.po_number}<p className="mt-1 text-xs font-normal text-slate-500">{item.supplier_name}</p></td><td className="px-5 py-4 text-slate-600">{item.payment_method === 'bank_transfer' ? 'Transfer bank' : item.payment_method === 'cash' ? 'Tunai' : 'Lainnya'}</td><td className={`px-5 py-4 text-right font-bold ${item.status === 'void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{money(item.amount)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.status === 'paid' ? 'Dibayar' : 'Dibatalkan'}</span></td><td className="px-5 py-4">{item.status === 'paid' ? <button type="button" onClick={() => { setCancelTarget(item); setCancelReason(''); }} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Batalkan</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-100 md:hidden">{filteredPayments.map(item => <article key={item.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{item.payment_number}</p><p className="mt-1 text-xs text-slate-500">{item.payment_date} · {item.po_number}</p><p className="mt-1 text-xs text-slate-500">{item.supplier_name} · {item.project_name}</p></div><p className={`text-sm font-bold ${item.status === 'void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{money(item.amount)}</p></div><div className="flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.status === 'paid' ? 'Dibayar' : 'Dibatalkan'}</span>{item.status === 'paid' && <button type="button" onClick={() => { setCancelTarget(item); setCancelReason(''); }} className="text-xs font-bold text-rose-700">Batalkan pembayaran</button>}</div></article>)}</div>
      </>}
    </section>

    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p><strong className="text-slate-800">Kontrol pencatatan:</strong> Sistem memeriksa sisa nilai PO di database saat pembayaran disimpan. Pembayaran yang dibatalkan juga membatalkan mutasi kas pasangannya agar rekap tidak menghitungnya sebagai realisasi aktif.</p></div>

    {cancelTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-payment-title"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><span className="rounded-xl bg-rose-50 p-3 text-rose-700"><Ban className="h-5 w-5" /></span><button type="button" onClick={() => setCancelTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button></div><h3 id="cancel-payment-title" className="mt-4 text-lg font-bold text-slate-900">Batalkan pembayaran?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Dokumen <strong>{cancelTarget.payment_number}</strong> dan mutasi kas pasangannya akan dibatalkan. Tindakan ini memerlukan alasan.</p><label className={`${labelClass} mt-4`}>Alasan pembatalan *<textarea required rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} className={inputClass} placeholder="Tuliskan alasan yang jelas..." /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCancelTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Kembali</button><button type="button" disabled={!cancelReason.trim() || canceling} onClick={() => void confirmCancel()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{canceling ? 'Memproses...' : 'Ya, batalkan'}</button></div></div></div>}
  </div>;
}

export default function PaymentsPage() {
  return <RequireAuth permission="finance.payment.manage"><PaymentContent /></RequireAuth>;
}
