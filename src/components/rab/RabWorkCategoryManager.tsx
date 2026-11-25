'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type RabWorkSubcategoryRecord = {
  id: string;
  division_id: string;
  category_id: string;
  name: string;
  sort_order: number;
  legacy_key?: string | null;
};

export type RabWorkCategoryRecord = {
  id: string;
  division_id: string;
  name: string;
  sort_order: number;
  legacy_key?: string | null;
  subcategories: RabWorkSubcategoryRecord[];
};

type FieldOption = { code: string; label: string };

type Props = {
  open: boolean;
  divisionId: string;
  divisionName: string;
  categories: RabWorkCategoryRecord[];
  fields: FieldOption[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';

function fieldCodeOf(category: RabWorkCategoryRecord): string {
  const match = String(category.legacy_key ?? '').match(/^field:([^:]+):/);
  return match?.[1] ?? 'OTHER';
}

export default function RabWorkCategoryManager({
  open, divisionId, divisionName, categories, fields, onClose, onChanged,
}: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [fieldCode, setFieldCode] = useState(fields[0]?.code ?? 'BG');
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (busyKey) return;
    setBusyKey(key);
    void success;
    setError('');
    try {
      const result = await action() as { error?: { message?: string } | null };
      if (result?.error) throw new Error(result.error.message || 'Permintaan tidak dapat disimpan.');
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan kategori.');
    } finally {
      setBusyKey('');
    }
  };

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name) { setError('Nama kategori wajib diisi.'); return; }
    await run('new-category', async () => {
      const { data: existing, error: readError } = await supabase
        .from('rab_work_categories').select('sort_order').eq('division_id', divisionId);
      if (readError) throw readError;
      const sort_order = Math.max(0, ...(existing ?? []).map((row: { sort_order?: number }) => Number(row.sort_order ?? 0))) + 1;
      const { error: insertError } = await supabase.from('rab_work_categories').insert({
        division_id: divisionId,
        name,
        sort_order,
        legacy_key: 'field:' + fieldCode + ':custom:' + crypto.randomUUID(),
      });
      if (insertError) throw insertError;
      setCategoryName('');
      return { error: null };
    }, 'Kategori ditambahkan.');
  };

  const addSubcategory = async (category: RabWorkCategoryRecord) => {
    const name = String(subcategoryDrafts[category.id] ?? '').trim();
    if (!name) { setError('Nama subkategori wajib diisi.'); return; }
    await run('new-subcategory-' + category.id, async () => {
      const sort_order = Math.max(0, ...category.subcategories.map((row) => Number(row.sort_order ?? 0))) + 1;
      const { error: insertError } = await supabase.from('rab_work_subcategories').insert({
        division_id: divisionId,
        category_id: category.id,
        name,
        sort_order,
        legacy_key: 'custom:' + crypto.randomUUID(),
      });
      if (insertError) throw insertError;
      setSubcategoryDrafts((current) => ({ ...current, [category.id]: '' }));
      return { error: null };
    }, 'Subkategori ditambahkan.');
  };

  const renameCategory = async (category: RabWorkCategoryRecord) => {
    const next = window.prompt('Nama kategori', category.name);
    if (next === null) return;
    const name = next.trim();
    if (!name) { setError('Nama kategori tidak boleh kosong.'); return; }
    if (name === category.name) return;
    await run('rename-category-' + category.id, async () => {
      const { error: updateError } = await supabase.from('rab_work_categories')
        .update({ name, updated_at: new Date().toISOString() }).eq('id', category.id);
      if (updateError) throw updateError;
      return { error: null };
    }, 'Nama kategori diperbarui.');
  };

  const renameSubcategory = async (subcategory: RabWorkSubcategoryRecord) => {
    const next = window.prompt('Nama subkategori', subcategory.name);
    if (next === null) return;
    const name = next.trim();
    if (!name) { setError('Nama subkategori tidak boleh kosong.'); return; }
    if (name === subcategory.name) return;
    await run('rename-subcategory-' + subcategory.id, async () => {
      const { error: updateError } = await supabase.from('rab_work_subcategories')
        .update({ name, updated_at: new Date().toISOString() }).eq('id', subcategory.id);
      if (updateError) throw updateError;
      return { error: null };
    }, 'Nama subkategori diperbarui.');
  };

  const deleteSubcategory = async (subcategory: RabWorkSubcategoryRecord) => {
    if (!window.confirm('Hapus subkategori "' + subcategory.name + '"? Subkategori yang masih dipakai item RAB tidak dapat dihapus.')) return;
    await run('delete-subcategory-' + subcategory.id, async () => {
      const { error: deleteError } = await supabase.from('rab_work_subcategories').delete().eq('id', subcategory.id);
      if (deleteError) throw deleteError;
      return { error: null };
    }, 'Subkategori dihapus.');
  };

  const deleteCategory = async (category: RabWorkCategoryRecord) => {
    if (!window.confirm('Hapus kategori "' + category.name + '" beserta subkategori kosongnya? Kategori yang masih dipakai item RAB tidak dapat dihapus.')) return;
    await run('delete-category-' + category.id, async () => {
      const { error: deleteError } = await supabase.from('rab_work_categories').delete().eq('id', category.id);
      if (deleteError) throw deleteError;
      return { error: null };
    }, 'Kategori dihapus.');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Kelola kategori dan subkategori RAB">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Pengaturan struktur RAB</p><h2 className="mt-1 text-lg font-bold text-slate-900">Kategori & Subkategori</h2><p className="mt-1 text-xs text-slate-500">Lokasi pekerjaan: {divisionName}. Perubahan hanya berlaku pada lokasi ini.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <h3 className="text-sm font-bold text-slate-800">Tambah kategori</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <select value={fieldCode} onChange={(event) => setFieldCode(event.target.value)} className={inputClass} aria-label="Bidang">
                {fields.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
              </select>
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={255} className={inputClass} placeholder="Nama kategori baru" />
              <button type="button" disabled={Boolean(busyKey)} onClick={() => void addCategory()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Tambah</button>
            </div>
          </section>
          <div className="space-y-3">
            {categories.length ? [...categories].sort((a,b)=>a.sort_order-b.sort_order).map((category) => {
              const parentField = fields.find((field) => field.code === fieldCodeOf(category));
              return (
                <section key={category.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 bg-indigo-50 px-4 py-3">
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">{parentField?.label ?? 'Bidang lainnya'}</p><p className="text-sm font-bold text-indigo-950">{category.name}</p></div>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void renameCategory(category)} className="rounded-lg border border-indigo-200 bg-white p-2 text-indigo-700 hover:bg-indigo-50" title="Ubah nama kategori"><Pencil className="h-4 w-4" /></button>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void deleteCategory(category)} className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50" title="Hapus kategori"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-2 p-3">
                    {[...category.subcategories].sort((a,b)=>a.sort_order-b.sort_order).map((subcategory) => (
                      <div key={subcategory.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                        <span className="min-w-0 flex-1 text-xs font-medium text-slate-800">{subcategory.name}</span>
                        <button type="button" disabled={Boolean(busyKey)} onClick={() => void renameSubcategory(subcategory)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah subkategori"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={Boolean(busyKey)} onClick={() => void deleteSubcategory(subcategory)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50" title="Hapus subkategori"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input value={subcategoryDrafts[category.id] ?? ''} onChange={(event) => setSubcategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))} maxLength={255} className={inputClass} placeholder="Nama subkategori baru" />
                      <button type="button" disabled={Boolean(busyKey)} onClick={() => void addSubcategory(category)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><Plus className="h-4 w-4" /> Tambah subkategori</button>
                    </div>
                  </div>
                </section>
              );
            }) : <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Belum ada kategori pada lokasi ini. Kategori lama akan disiapkan dari klasifikasi item yang sudah ada ketika lokasi dibuka.</p>}
          </div>
          {busyKey && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan perubahan…</div>}
        </div>
        <footer className="flex justify-end border-t border-slate-200 px-5 py-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Selesai</button></footer>
      </div>
    </div>
  );
}
