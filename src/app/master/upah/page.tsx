'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Layers, Users, Search, Plus, Trash2, Pencil, Copy, Check, X, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';
import { useAppAccess } from '@/hooks/useAppAccess';

type MasterUpah = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  category: string | null;
};

type FormMode = 'create' | 'edit' | 'copy';
const TABLE = 'master_upah';
const CATEGORY = 'Tenaga Kerja';
const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Terjadi kesalahan yang tidak diketahui.';
}

function nextCode(rows: MasterUpah[]): string {
  const used = new Set(rows.map((row) => row.code.trim().toUpperCase()));
  let number = 1;
  while (used.has(`UPAH-${String(number).padStart(3, '0')}`)) number += 1;
  return `UPAH-${String(number).padStart(3, '0')}`;
}

function uniqueCopyCode(code: string, rows: MasterUpah[]): string {
  const used = new Set(rows.map((row) => row.code.trim().toUpperCase()));
  const base = `${code}-COPY`;
  if (!used.has(base.toUpperCase())) return base;
  let n = 2;
  while (used.has(`${base}-${n}`.toUpperCase())) n += 1;
  return `${base}-${n}`;
}

export default function MasterUpahPage() {
  const { loading: accessLoading, hasCompanyPermission } = useAppAccess();
  const canManageMaster = !accessLoading && hasCompanyPermission('rab.manage');
  const [rows, setRows] = useState<MasterUpah[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>('create');
  const [editing, setEditing] = useState<MasterUpah | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('oh');
  const [unitPrice, setUnitPrice] = useState('0');

  async function loadRows() {
    setLoading(true);
    setPageError('');
    try {
      const { data, error } = await supabase
        .schema('public')
        .from(TABLE)
        .select('id, code, name, unit, unit_price, category')
        .order('code', { ascending: true });
      if (error) throw error;
      setRows((data ?? []) as MasterUpah[]);
    } catch (error) {
      console.error('Gagal memuat public.master_upah:', error);
      setPageError(`Gagal membaca public.master_upah: ${getErrorMessage(error)}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.code, row.name, row.unit, row.category ?? ''].some((value) => value.toLocaleLowerCase('id').includes(keyword)),
    );
  }, [rows, search]);

  function openCreate() {
    if (!canManageMaster) return;
    setMode('create');
    setEditing(null);
    setCode(nextCode(rows));
    setName('');
    setUnit('oh');
    setUnitPrice('0');
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: MasterUpah) {
    if (!canManageMaster) return;
    setMode('edit');
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setUnit(row.unit);
    setUnitPrice(String(row.unit_price ?? 0));
    setFormError('');
    setModalOpen(true);
  }

  function openCopy(row: MasterUpah) {
    if (!canManageMaster) return;
    setMode('copy');
    setEditing(null);
    setCode(uniqueCopyCode(row.code, rows));
    setName(`${row.name} (Salinan)`);
    setUnit(row.unit);
    setUnitPrice(String(row.unit_price ?? 0));
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMaster) { setFormError('Hanya Direktur/Administrator perusahaan yang dapat mengubah Master Upah.'); return; }
    if (saving) return;
    const cleanCode = code.trim();
    const cleanName = name.trim();
    const cleanUnit = unit.trim();
    const price = Number(unitPrice);

    if (!cleanCode || !cleanName || !cleanUnit) {
      setFormError('Kode, nama tenaga kerja, dan satuan wajib diisi.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Harga harus berupa angka nol atau lebih.');
      return;
    }
    const duplicate = rows.find((row) => row.code.trim().toLowerCase() === cleanCode.toLowerCase() && row.id !== editing?.id);
    if (duplicate) {
      setFormError(`Kode ${cleanCode} sudah digunakan. Gunakan kode lain.`);
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      code: cleanCode,
      name: cleanName,
      unit: cleanUnit,
      unit_price: price,
      category: CATEGORY,
    };

    try {
      if (mode === 'edit' && editing) {
        const { data, error } = await supabase
          .schema('public')
          .from(TABLE)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Data tidak berubah. Periksa izin UPDATE/SELECT (RLS) pada public.master_upah.');
      } else {
        const { data, error } = await supabase
          .schema('public')
          .from(TABLE)
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!data?.id) throw new Error('Supabase tidak mengembalikan ID data upah yang baru.');
      }
      await loadRows();
      setModalOpen(false);
      setEditing(null);
    } catch (error) {
      console.error('Gagal menyimpan public.master_upah:', error);
      setFormError(`Gagal menyimpan ke public.master_upah: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: MasterUpah) {
    if (!canManageMaster) return;
    if (!window.confirm(`Hapus upah “${row.code} - ${row.name}” dari public.master_upah?`)) return;
    setPageError('');
    try {
      const { data, error } = await supabase
        .schema('public')
        .from(TABLE)
        .delete()
        .eq('id', row.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Data tidak terhapus. Periksa izin DELETE/SELECT (RLS) pada public.master_upah.');
      await loadRows();
    } catch (error) {
      console.error('Gagal menghapus public.master_upah:', error);
      setPageError(`Gagal menghapus data upah: ${getErrorMessage(error)}`);
    }
  }

  const modalTitle = mode === 'edit' ? 'Edit Master Upah' : mode === 'copy' ? 'Duplikasi Master Upah' : 'Tambah Master Upah';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Layers className="h-4 w-4" /> Database Pusat · Master Upah
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Master Database Upah / Tenaga Kerja</h1>
          <p className="mt-1 text-sm text-slate-500">Data disimpan ke public.master_upah. Perubahan harga otomatis disinkronkan ke seluruh komponen AHSP yang terhubung dengan upah_id.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadRows()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Segarkan
          </button>
          {canManageMaster && (
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Tambah Upah
            </button>
          )}
        </div>
      </header>

      {!canManageMaster && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">Mode lihat saja. Perubahan Master Upah hanya tersedia untuk Direktur/Administrator perusahaan.</div>}

      {pageError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{pageError}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode atau nama tenaga kerja..." className={`${INPUT} bg-slate-50 pl-9`} /></div>
          <span className="text-xs text-slate-500">Menampilkan {filteredRows.length} dari {rows.length} data upah</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama Tenaga Kerja</th><th className="px-4 py-3 text-center">Satuan</th><th className="px-5 py-3 text-right">Harga Satuan</th><th className="px-5 py-3 text-center">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat public.master_upah...</td></tr> : filteredRows.length ? filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-semibold text-slate-600">{row.code}</td><td className="px-5 py-3.5"><div className="flex items-center gap-2 font-medium text-slate-900"><Users className="h-4 w-4 shrink-0 text-emerald-600" />{row.name}</div></td><td className="px-4 py-3.5 text-center text-xs text-slate-500">{row.unit}</td><td className="whitespace-nowrap px-5 py-3.5 text-right font-bold tabular-nums text-slate-900">{formatRupiah(Number(row.unit_price || 0))}</td><td className="px-5 py-3.5">{canManageMaster ? <div className="flex justify-center gap-1"><button type="button" onClick={() => openCopy(row)} title="Duplikasi" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => openEdit(row)} title="Edit" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void handleDelete(row)} title="Hapus" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div> : <span className="block text-center text-xs text-slate-400">Lihat saja</span>}</td></tr>
              )) : <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-500">Belum ada data pada public.master_upah. Tambahkan data upah melalui tombol di atas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && canManageMaster && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setModalOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="upah-modal-title" className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4"><div><h2 id="upah-modal-title" className="font-bold text-slate-900">{modalTitle}</h2><p className="mt-0.5 text-xs text-slate-500">Tujuan penyimpanan: public.master_upah</p></div><button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 disabled:opacity-40"><X className="h-5 w-5" /></button></div>
          <form onSubmit={handleSave} className="space-y-4 p-5">
            {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{formError}</div>}
            {mode === 'copy' && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Data disalin sebagai baris baru. Data upah asal tidak diubah.</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-700">Kode Upah *</span><input required maxLength={50} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: U.01" className={INPUT} /></label><label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-700">Satuan *</span><input required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="oh, jam, hari" className={INPUT} /></label></div>
            <label className="block space-y-1.5"><span className="block text-xs font-semibold text-slate-700">Nama Tenaga Kerja *</span><input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Pekerja, Tukang Batu, Mandor" className={INPUT} /></label>
            <label className="block space-y-1.5"><span className="block text-xs font-semibold text-slate-700">Harga per Satuan (Rp) *</span><input required type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={`${INPUT} tabular-nums`} /></label>
            <p className="text-xs text-slate-500">Kategori disimpan sebagai <strong>{CATEGORY}</strong>.</p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Upah'}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
