'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, LoaderCircle, Plus, RefreshCw, Save, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { fetchSuppliers, saveSupplier, setSupplierActive } from '@/lib/services/procurementService';
import type { Supplier, SupplierInput } from '@/types/procurement';

type FormState = { supplier_code: string; name: string; contact_person: string; phone: string; email: string; address: string; notes: string };
const emptyForm = (): FormState => ({ supplier_code: '', name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });

type SupplierFormDraft = {
  form: FormState;
  editingId: string | null;
  showForm: boolean;
  savedAt: string;
};

function SupplierContent() {
  const { access, user } = useAuth();
  const draftKey = user?.id ? `dahlia:supplier-form-draft:${user.id}` : null;
  const canManage = access?.roles.some((role) => ['director', 'admin', 'purchasing'].includes(role.code) && role.scope === 'company') ?? false;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = window.sessionStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<SupplierFormDraft>;
        if (draft.showForm && draft.form && typeof draft.form.name === 'string') {
          setForm({ ...emptyForm(), ...draft.form });
          setEditingId(typeof draft.editingId === 'string' ? draft.editingId : null);
          setShowForm(true);
          setDraftRestored(true);
        }
      }
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  function persistDraft(nextForm: FormState, nextEditingId: string | null) {
    if (!draftKey) return;
    try {
      const draft: SupplierFormDraft = {
        form: nextForm,
        editingId: nextEditingId,
        showForm: true,
        savedAt: new Date().toISOString(),
      };
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Penyimpanan draft bersifat bantuan; kegagalan storage tidak boleh
      // menghalangi pengguna mengisi atau menyimpan supplier.
    }
  }

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { setSuppliers(await fetchSuppliers(false)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Data supplier gagal dimuat.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = suppliers.filter((supplier) => {
    if (!showInactive && !supplier.is_active) return false;
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return true;
    return [supplier.supplier_code ?? '', supplier.name, supplier.contact_person ?? '', supplier.phone ?? '', supplier.email ?? '']
      .some((value) => value.toLocaleLowerCase('id').includes(keyword));
  });

  function openNew() {
    const nextForm = emptyForm();
    setEditingId(null);
    setForm(nextForm);
    setShowForm(true);
    setDraftRestored(false);
    setError('');
    persistDraft(nextForm, null);
  }
  function openEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({ supplier_code: supplier.supplier_code ?? '', name: supplier.name, contact_person: supplier.contact_person ?? '', phone: supplier.phone ?? '', email: supplier.email ?? '', address: supplier.address ?? '', notes: supplier.notes ?? '' });
    setShowForm(true); setDraftRestored(false); setError('');
    persistDraft({ supplier_code: supplier.supplier_code ?? '', name: supplier.name, contact_person: supplier.contact_person ?? '', phone: supplier.phone ?? '', email: supplier.email ?? '', address: supplier.address ?? '', notes: supplier.notes ?? '' }, supplier.id);
  }
  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setDraftRestored(false);
    if (draftKey) window.sessionStorage.removeItem(draftKey);
  }
  function change(field: keyof FormState, value: string) {
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    persistDraft(nextForm, editingId);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    try {
      const input: SupplierInput = form;
      await saveSupplier(input, editingId ?? undefined);
      setSuccess(editingId ? 'Data supplier berhasil diperbarui.' : 'Supplier baru berhasil ditambahkan.');
      setShowForm(false); setEditingId(null); setForm(emptyForm());
      setDraftRestored(false);
      if (draftKey) window.sessionStorage.removeItem(draftKey);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Data supplier gagal disimpan.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(supplier: Supplier) {
    const action = supplier.is_active ? 'nonaktifkan' : 'aktifkan kembali';
    if (!window.confirm(`Yakin ingin ${action} supplier ${supplier.name}?`)) return;
    setError(''); setSuccess('');
    try { await setSupplierActive(supplier.id, !supplier.is_active); setSuccess(`Status ${supplier.name} berhasil diubah.`); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Status supplier gagal diubah.'); }
  }

  if (!canManage) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Pengelolaan data supplier hanya untuk Purchasing, Direktur, atau Admin perusahaan.</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Pengadaan & Purchasing</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Data Supplier</h1><p className="mt-1 text-sm text-slate-500">Kelola pemasok dan informasi kontak untuk pembelian proyek.</p></div><div className="flex gap-2"><Link href="/pengadaan/purchasing" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Proses Purchasing</Link><button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Tambah Supplier</button></div></div>
    {draftRestored && showForm && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">Draft formulir supplier dipulihkan dari penyimpanan sesi browser. Periksa kembali isian sebelum menyimpan.</div>}
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}{success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
    {showForm && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">{editingId ? 'Ubah Data Supplier' : 'Supplier Baru'}</h2><p className="text-xs text-slate-500">Nama supplier wajib diisi.</p></div><button type="button" onClick={closeForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-slate-700">Nama Supplier *<input required maxLength={255} value={form.name} onChange={(e) => change('name', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Nama toko/perusahaan" /></label><label className="text-sm font-medium text-slate-700">Kode Supplier<input maxLength={50} value={form.supplier_code} onChange={(e) => change('supplier_code', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Opsional dan harus unik" /></label><label className="text-sm font-medium text-slate-700">Nama Kontak<input maxLength={255} value={form.contact_person} onChange={(e) => change('contact_person', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label className="text-sm font-medium text-slate-700">Nomor Telepon<input maxLength={60} value={form.phone} onChange={(e) => change('phone', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label className="text-sm font-medium text-slate-700">Email<input type="email" maxLength={255} value={form.email} onChange={(e) => change('email', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label className="text-sm font-medium text-slate-700">Alamat<textarea rows={2} value={form.address} onChange={(e) => change('address', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Catatan<textarea rows={2} value={form.notes} onChange={(e) => change('notes', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Kategori barang, termin pembayaran, informasi tambahan" /></label></div>
      <div className="flex justify-end gap-2"><button type="button" onClick={closeForm} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button><button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Menyimpan...' : 'Simpan Supplier'}</button></div>
    </form>}
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-700" /><div><h2 className="font-bold text-slate-900">Daftar Supplier</h2><p className="text-xs text-slate-500">{filtered.length} supplier ditampilkan</p></div></div><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari supplier..." className="w-52 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" /></div><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tampilkan nonaktif</label><button onClick={() => void load(true)} disabled={refreshing} aria-label="Muat ulang" className="rounded-lg border border-slate-200 p-2 text-slate-600"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button></div></div>
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Memuat supplier...</div> : filtered.length === 0 ? <div className="p-12 text-center"><UserRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-800">Belum ada supplier</p><p className="mt-1 text-sm text-slate-500">Tambahkan supplier agar dapat dipilih pada pembuatan PO.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Kontak</th><th className="px-4 py-3">Alamat</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((supplier) => <tr key={supplier.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-bold text-slate-900">{supplier.name}</p><p className="text-xs text-slate-500">{supplier.supplier_code || 'Tanpa kode'}</p></td><td className="px-4 py-3 text-slate-600">{supplier.contact_person && <p>{supplier.contact_person}</p>}{supplier.phone && <p className="text-xs">{supplier.phone}</p>}{supplier.email && <p className="text-xs">{supplier.email}</p>}</td><td className="max-w-xs px-4 py-3 text-xs text-slate-600">{supplier.address || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{supplier.is_active ? 'Aktif' : 'Nonaktif'}</span></td><td className="px-4 py-3"><div className="flex items-center gap-3"><button onClick={() => openEdit(supplier)} className="text-xs font-semibold text-blue-700 hover:underline">Ubah</button><button onClick={() => void toggleActive(supplier)} className="text-xs font-semibold text-slate-600 hover:underline">{supplier.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td></tr>)}</tbody></table></div>}
    </section>
    <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0" />Supplier yang sudah dipakai pada PO tidak dihapus. Gunakan status nonaktif agar riwayat transaksi tetap utuh.</p>
  </div>;
}

export default function SupplierPage() {
  return <RequireAuth permission="procurement.purchase.create"><SupplierContent /></RequireAuth>;
}
