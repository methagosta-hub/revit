'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, ArrowDownLeft, ArrowDownUp, ArrowUpRight, Ban, CheckCircle2,
  CirclePlus, FileText, Filter, LoaderCircle, Plus, RefreshCw,
  Save, Search, Wallet, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import {
  fetchCashTransactions, fetchFinanceProjects, recordCashTransaction, voidCashTransaction,
} from '@/lib/services/financeService';
import type { CashTransaction, CashTransactionInput, FinanceProject } from '@/types/finance';

const DRAFT_KEY = 'dahlia:finance:cash-transaction-draft:v1';
const money = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type CashForm = {
  transaction_date: string;
  direction: 'in' | 'out';
  category: string;
  project_id: string;
  description: string;
  amount: string;
  payment_method: 'bank_transfer' | 'cash' | 'other';
  reference_number: string;
};
const emptyForm = (): CashForm => ({
  transaction_date: today(), direction: 'out', category: 'Operasional', project_id: '',
  description: '', amount: '', payment_method: 'bank_transfer', reference_number: '',
});
const inputClass = 'mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const labelClass = 'block text-sm font-semibold text-slate-700';

function StatCard({ title, value, detail, icon: Icon, tone }: {
  title: string; value: string; detail: string; icon: typeof Wallet; tone: 'green' | 'rose' | 'slate';
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
      <span className={`rounded-xl p-3 ring-1 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
    </div>
  </div>;
}

function CashContent() {
  const [rows, setRows] = useState<CashTransaction[]>([]);
  const [projects, setProjects] = useState<FinanceProject[]>([]);
  const [form, setForm] = useState<CashForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'void'>('all');
  const [cancelTarget, setCancelTarget] = useState<CashTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [cash, projectRows] = await Promise.all([fetchCashTransactions(), fetchFinanceProjects()]);
      setRows(cash);
      setProjects(projectRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat transaksi kas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Simpan draft di session browser, bukan di database. Tidak ada polling yang mengubah formulir.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { form?: CashForm; showForm?: boolean };
        if (draft.form) setForm({ ...emptyForm(), ...draft.form });
        setShowForm(Boolean(draft.showForm));
        if (draft.form) setDraftRestored(true);
      }
    } catch { /* Draft yang rusak diabaikan agar halaman tetap dapat digunakan. */ }
    finally { setDraftReady(true); }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      const hasContent = Boolean(form.amount || form.description || form.reference_number || form.project_id);
      if (showForm || hasContent) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, showForm }));
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* Penyimpanan sesi dapat dinonaktifkan oleh browser. */ }
  }, [draftReady, form, showForm]);

  const active = useMemo(() => rows.filter(x => x.status === 'confirmed'), [rows]);
  const incoming = active.filter(x => x.direction === 'in').reduce((sum, x) => sum + x.amount, 0);
  const outgoing = active.filter(x => x.direction === 'out').reduce((sum, x) => sum + x.amount, 0);
  const visibleRows = useMemo(() => rows.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'void' ? item.status === 'void' : item.direction === filter && item.status === 'confirmed');
    const haystack = [item.transaction_number, item.description, item.project_name, item.category, item.reference_number].join(' ').toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase().trim());
  }), [rows, filter, query]);
  const setField = <K extends keyof CashForm>(key: K, value: CashForm[K]) => setForm(old => ({ ...old, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Nominal harus berupa angka Rupiah bulat yang lebih besar dari nol.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload: CashTransactionInput = {
        transaction_date: form.transaction_date,
        direction: form.direction,
        category: form.category,
        project_id: form.project_id || null,
        description: form.description.trim(),
        amount,
        payment_method: form.payment_method,
        reference_number: form.reference_number.trim(),
      };
      await recordCashTransaction(payload);
      setSuccess('Transaksi kas berhasil dicatat. Mutasi sudah diperbarui.');
      setForm(emptyForm()); setShowForm(false); setDraftRestored(false);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan transaksi.');
    } finally { setSaving(false); }
  }

  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCanceling(true); setError(''); setSuccess('');
    try {
      await voidCashTransaction(cancelTarget.id, cancelReason.trim());
      setSuccess(`Transaksi ${cancelTarget.transaction_number} berhasil dibatalkan.`);
      setCancelTarget(null); setCancelReason(''); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal membatalkan transaksi.'); }
    finally { setCanceling(false); }
  }

  function openForm() { setError(''); setSuccess(''); setShowForm(true); }
  function discardDraft() {
    setForm(emptyForm()); setShowForm(false); setDraftRestored(false); setError('');
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
  }

  return <div className="min-h-full space-y-6 pb-8">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-200"><Wallet className="h-3.5 w-3.5" /> KEUANGAN · PENCATATAN KAS</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Kas & Operasional</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Pantau arus kas perusahaan dan proyek, catat transaksi, lalu telusuri riwayatnya dari satu halaman.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang</button>
          <button type="button" onClick={openForm} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"><Plus className="h-4 w-4" /> Catat transaksi</button>
        </div>
      </div>
    </header>

    {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span><button type="button" onClick={() => setError('')} className="ml-auto rounded-lg p-1 hover:bg-rose-100" aria-label="Tutup pesan"><X className="h-4 w-4" /></button></div>}
    {success && <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span>{success}</span><button type="button" onClick={() => setSuccess('')} className="ml-auto rounded-lg p-1 hover:bg-emerald-100" aria-label="Tutup pesan"><X className="h-4 w-4" /></button></div>}
    {draftRestored && !showForm && <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-amber-900">Ada draft transaksi yang belum selesai</p><p className="mt-1 text-xs text-amber-800">Isian sebelumnya masih tersimpan di sesi browser ini.</p></div><div className="flex gap-2"><button type="button" onClick={discardDraft} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900">Buang draft</button><button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white">Lanjutkan draft</button></div></div>}

    <section className="grid gap-4 sm:grid-cols-3">
      <StatCard title="Total kas masuk" value={money(incoming)} detail="Akumulasi transaksi masuk aktif" icon={ArrowDownLeft} tone="green" />
      <StatCard title="Total kas keluar" value={money(outgoing)} detail="Akumulasi transaksi keluar aktif" icon={ArrowUpRight} tone="rose" />
      <StatCard title="Mutasi bersih" value={money(incoming - outgoing)} detail="Kas masuk dikurangi kas keluar" icon={ArrowDownUp} tone="slate" />
    </section>

    {showForm && <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-emerald-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div><div className="flex items-center gap-2"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-800"><CirclePlus className="h-4 w-4" /></span><h2 className="text-lg font-bold text-slate-900">Catat transaksi kas</h2></div><p className="mt-2 text-xs text-slate-600">Lengkapi informasi berikut. Tanda * wajib diisi.</p></div>
        <div className="flex items-center gap-2">{draftRestored && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Draft dipulihkan</span>}<button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Tutup formulir"><X className="h-5 w-5" /></button></div>
      </div>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">1 · Jenis transaksi</p><div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setField('direction', 'in')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${form.direction === 'in' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/15' : 'border-slate-200 hover:border-emerald-200'}`}><span className={`rounded-xl p-3 ${form.direction === 'in' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}><ArrowDownLeft className="h-5 w-5" /></span><span><span className="block font-bold text-slate-900">Kas masuk</span><span className="mt-0.5 block text-xs text-slate-500">Penerimaan dana perusahaan/proyek</span></span>{form.direction === 'in' && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" />}</button>
          <button type="button" onClick={() => setField('direction', 'out')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${form.direction === 'out' ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-400/15' : 'border-slate-200 hover:border-rose-200'}`}><span className={`rounded-xl p-3 ${form.direction === 'out' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}><ArrowUpRight className="h-5 w-5" /></span><span><span className="block font-bold text-slate-900">Kas keluar</span><span className="mt-0.5 block text-xs text-slate-500">Pengeluaran operasional/perusahaan</span></span>{form.direction === 'out' && <CheckCircle2 className="ml-auto h-5 w-5 text-rose-600" />}</button>
        </div></div>
        <div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">2 · Detail transaksi</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className={labelClass}>Tanggal transaksi *<input type="date" required value={form.transaction_date} onChange={e => setField('transaction_date', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Kategori *<select required value={form.category} onChange={e => setField('category', e.target.value)} className={inputClass}>{['Operasional', 'Transportasi', 'Konsumsi', 'Peralatan', 'Honorarium', 'Penerimaan proyek', 'Lainnya'].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label className={labelClass}>Proyek terkait<select value={form.project_id} onChange={e => setField('project_id', e.target.value)} className={inputClass}><option value="">Perusahaan / umum</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          <label className={labelClass}>Nominal (Rupiah) *<div className="relative"><span className="absolute left-3.5 top-3 text-sm font-bold text-slate-400">Rp</span><input required min="1" step="1" inputMode="numeric" type="number" value={form.amount} onChange={e => setField('amount', e.target.value)} className={`${inputClass} pl-10`} placeholder="0" /></div><span className="mt-1 block text-xs font-normal text-slate-400">Masukkan nominal utuh, tanpa titik atau koma.</span></label>
          <label className={labelClass}>Metode pembayaran *<select required value={form.payment_method} onChange={e => setField('payment_method', e.target.value as CashForm['payment_method'])} className={inputClass}><option value="bank_transfer">Transfer bank</option><option value="cash">Tunai</option><option value="other">Lainnya</option></select></label>
          <label className={labelClass}>Nomor referensi<input maxLength={120} value={form.reference_number} onChange={e => setField('reference_number', e.target.value)} className={inputClass} placeholder="Nomor bukti / referensi" /></label>
          <label className={`${labelClass} md:col-span-2 xl:col-span-3`}>Uraian transaksi *<input required maxLength={500} value={form.description} onChange={e => setField('description', e.target.value)} className={inputClass} placeholder="Contoh: pembelian ATK kantor, penerimaan termin proyek..." /></label>
        </div></div>
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-slate-500">Pratinjau pencatatan</p><p className={`mt-1 text-xl font-bold ${form.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{form.direction === 'in' ? '+' : '−'} {money(Number(form.amount) || 0)}</p><p className="text-xs text-slate-500">{form.category} · {projects.find(p => p.id === form.project_id)?.title || 'Perusahaan / umum'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={discardDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Buang draft</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan transaksi'}</button></div></div>
        <p className="text-xs leading-5 text-slate-500">Catatan: pembayaran Purchase Order dicatat melalui menu Pembayaran Supplier. Jangan masukkan ulang pembayaran PO di halaman kas.</p>
      </form>
    </section>}

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-bold text-slate-900">Riwayat mutasi kas</h2></div><p className="mt-1 text-sm text-slate-500">{visibleRows.length} dari {rows.length} transaksi ditampilkan</p></div><span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Data terbaru</span></div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">{([['all', 'Semua'], ['in', 'Kas masuk'], ['out', 'Kas keluar'], ['void', 'Dibatalkan']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${filter === key ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>
          <div className="relative w-full lg:max-w-sm"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" placeholder="Cari nomor, uraian, proyek..." /></div>
        </div>
      </div>
      {loading ? <div className="flex items-center justify-center gap-3 p-14 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat riwayat kas...</div> : visibleRows.length === 0 ? <div className="p-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Filter className="h-5 w-5" /></span><p className="mt-3 font-semibold text-slate-800">Tidak ada transaksi yang cocok</p><p className="mt-1 text-sm text-slate-500">Coba ubah kata kunci atau filter yang dipilih.</p></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Tanggal / nomor</th><th className="px-5 py-4">Uraian</th><th className="px-5 py-4">Proyek</th><th className="px-5 py-4">Kategori</th><th className="px-5 py-4 text-right">Nominal</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map(item => <tr key={item.id} className="transition hover:bg-slate-50/80"><td className="px-5 py-4 font-semibold text-slate-800">{item.transaction_date}<p className="mt-1 text-xs font-normal text-slate-400">{item.transaction_number}</p></td><td className="max-w-[260px] px-5 py-4 text-slate-700">{item.description}<p className="mt-1 text-xs text-slate-400">{item.reference_number || (item.payment_method === 'bank_transfer' ? 'Transfer bank' : item.payment_method === 'cash' ? 'Tunai' : 'Lainnya')}</p></td><td className="px-5 py-4 text-slate-600">{item.project_name ?? 'Perusahaan'}</td><td className="px-5 py-4 text-slate-600">{item.category}</td><td className={`px-5 py-4 text-right font-bold ${item.status === 'void' ? 'text-slate-400 line-through' : item.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.direction === 'in' ? '+' : '−'}{money(item.amount)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'void' ? 'bg-slate-100 text-slate-500' : item.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{item.status === 'void' ? 'Dibatalkan' : item.direction === 'in' ? 'Kas masuk' : 'Kas keluar'}</span></td><td className="px-5 py-4">{item.status === 'confirmed' && !item.supplier_payment_id ? <button type="button" onClick={() => { setCancelTarget(item); setCancelReason(''); }} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Batalkan</button> : item.supplier_payment_id ? <span className="text-xs text-slate-400">Dari pembayaran PO</span> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-100 md:hidden">{visibleRows.map(item => <article key={item.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{item.description}</p><p className="mt-1 text-xs text-slate-500">{item.transaction_number} · {item.transaction_date}</p></div><span className={`shrink-0 text-sm font-bold ${item.status === 'void' ? 'text-slate-400 line-through' : item.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.direction === 'in' ? '+' : '−'}{money(item.amount)}</span></div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{item.project_name ?? 'Perusahaan'}</span><span>·</span><span>{item.category}</span><span className={`rounded-full px-2 py-1 font-bold ${item.status === 'void' ? 'bg-slate-100 text-slate-500' : item.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{item.status === 'void' ? 'Dibatalkan' : item.direction === 'in' ? 'Kas masuk' : 'Kas keluar'}</span></div>{item.status === 'confirmed' && !item.supplier_payment_id && <button type="button" onClick={() => { setCancelTarget(item); setCancelReason(''); }} className="text-xs font-bold text-rose-700">Batalkan transaksi</button>}</article>)}</div>
      </>}
    </section>

    {cancelTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><span className="rounded-xl bg-rose-50 p-3 text-rose-700"><Ban className="h-5 w-5" /></span><button type="button" onClick={() => setCancelTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button></div><h3 id="cancel-title" className="mt-4 text-lg font-bold text-slate-900">Batalkan transaksi?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Transaksi <strong>{cancelTarget.transaction_number}</strong> akan ditandai dibatalkan. Tindakan ini memerlukan alasan.</p><label className={`${labelClass} mt-4`}>Alasan pembatalan *<textarea required rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} className={inputClass} placeholder="Tuliskan alasan yang jelas..." /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCancelTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Kembali</button><button type="button" disabled={!cancelReason.trim() || canceling} onClick={() => void confirmCancel()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{canceling ? 'Memproses...' : 'Ya, batalkan'}</button></div></div></div>}
  </div>;
}

export default function CashPage() {
  return <RequireAuth permission="finance.payment.manage"><CashContent /></RequireAuth>;
}
