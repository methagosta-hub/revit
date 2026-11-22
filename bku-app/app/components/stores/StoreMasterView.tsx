"use client";

import { useMemo, useState, type FormEvent } from "react";
import { MapPin, Pencil, Phone, Plus, Power, Search, Store, X } from "lucide-react";
import type { SchoolStore, StoreInput } from "@/app/lib/bku/types";
import { fieldClass } from "@/app/lib/bku/formatters";
import { FormField } from "@/app/components/layout/FormField";

const emptyForm: StoreInput = {
  name: "",
  address: "",
  phone: "",
  notes: "",
  is_active: true,
};

export function StoreMasterView({
  stores,
  loading,
  onSave,
}: {
  stores: SchoolStore[];
  loading: boolean;
  onSave: (input: StoreInput) => Promise<SchoolStore>;
}) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [form, setForm] = useState<StoreInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyStoreId, setBusyStoreId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeCount = stores.filter((item) => item.is_active).length;
  const inactiveCount = stores.length - activeCount;
  const visibleStores = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    return stores
      .filter((item) => showInactive || item.is_active)
      .filter((item) => !needle || [item.name, item.address, item.phone, item.notes].some((value) => (value || "").toLocaleLowerCase("id-ID").includes(needle)))
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, "id-ID"));
  }, [stores, showInactive, query]);

  function startNew() {
    setForm({ ...emptyForm });
    setError("");
    setMessage("");
  }

  function startEdit(store: SchoolStore) {
    setForm({
      id: store.id,
      name: store.name,
      address: store.address || "",
      phone: store.phone || "",
      notes: store.notes || "",
      is_active: store.is_active,
    });
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      setError("Nama toko wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await onSave({ ...form, name: form.name.trim() });
      setForm(null);
      setMessage(form.id
        ? "Data toko berhasil diperbarui. Nama pada riwayat transaksi dan laporan BKU ikut disinkronkan."
        : "Toko baru berhasil ditambahkan ke database.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data toko gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(store: SchoolStore) {
    const nextActive = !store.is_active;
    setBusyStoreId(store.id);
    setError("");
    setMessage("");
    try {
      await onSave({
        id: store.id,
        name: store.name,
        address: store.address || "",
        phone: store.phone || "",
        notes: store.notes || "",
        is_active: nextActive,
      });
      setMessage(nextActive
        ? `Toko "${store.name}" diaktifkan kembali.`
        : `Toko "${store.name}" dinonaktifkan. Riwayat transaksinya tetap tersimpan.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status toko gagal diubah.");
    } finally {
      setBusyStoreId(null);
    }
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Store size={21} /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">Master Data</p>
            <h3 className="mt-1 text-xl font-black text-slate-900">Database Toko</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Kelola toko dan pemasok tanpa membuat transaksi. Perubahan nama akan disinkronkan ke riwayat transaksi serta ekspor PDF BKU.</p>
          </div>
        </div>
        <button type="button" onClick={startNew} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus size={15} />Tambah toko</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total toko</p><p className="mt-1 text-2xl font-black text-slate-900">{stores.length}</p></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Aktif</p><p className="mt-1 text-2xl font-black text-emerald-800">{activeCount}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Nonaktif</p><p className="mt-1 text-2xl font-black text-slate-700">{inactiveCount}</p></div>
      </div>

      {(message || error) && <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-xs leading-5 ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

      {form && <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h4 className="font-black text-slate-900">{form.id ? "Ubah data toko" : "Tambah toko baru"}</h4><p className="mt-1 text-[11px] text-slate-500">Nama toko menjadi referensi pada transaksi dan laporan.</p></div><button type="button" onClick={() => setForm(null)} disabled={saving} aria-label="Tutup formulir" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={17} /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nama toko / pemasok"><input required autoFocus maxLength={160} value={form.name} onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Contoh: Toko Bangunan Sumber Rezeki" className={fieldClass} /></FormField>
          <FormField label="Nomor telepon"><input value={form.phone} onChange={(event) => setForm((current) => current ? { ...current, phone: event.target.value } : current)} placeholder="Nomor kontak toko" className={fieldClass} /></FormField>
          <div className="sm:col-span-2"><FormField label="Alamat toko"><input value={form.address} onChange={(event) => setForm((current) => current ? { ...current, address: event.target.value } : current)} placeholder="Alamat lengkap toko" className={fieldClass} /></FormField></div>
          <div className="sm:col-span-2"><FormField label="Catatan (opsional)"><textarea rows={2} value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} placeholder="Catatan tambahan" className={fieldClass} /></FormField></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setForm(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="submit" disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? "Menyimpan…" : form.id ? "Simpan perubahan" : "Simpan toko"}</button></div>
      </form>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, alamat, atau telepon toko…" className={`${fieldClass} pl-9`} /></div>
        <button type="button" onClick={() => setShowInactive((value) => !value)} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${showInactive ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{showInactive ? "Sembunyikan nonaktif" : "Tampilkan nonaktif"}</button>
      </div>

      <div className="space-y-3">
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Memuat database toko…</div>
          : visibleStores.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Store className="mx-auto text-slate-300" size={25} /><p className="mt-2 text-sm font-bold text-slate-700">{query ? "Toko tidak ditemukan" : "Belum ada data toko"}</p><p className="mt-1 text-xs text-slate-500">Tambahkan toko pertama tanpa perlu mencatat transaksi.</p></div>
          : visibleStores.map((store) => <article key={store.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h4 className="break-words font-black text-slate-900">{store.name}</h4><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${store.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{store.is_active ? "Aktif" : "Nonaktif"}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">{store.address && <span className="flex items-center gap-1"><MapPin size={12} />{store.address}</span>}{store.phone && <span className="flex items-center gap-1"><Phone size={12} />{store.phone}</span>}</div>
                {store.notes && <p className="mt-1 text-[10px] text-slate-400">{store.notes}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => startEdit(store)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} />Ubah</button>
                <button type="button" disabled={busyStoreId === store.id} onClick={() => void toggleActive(store)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold disabled:opacity-50 ${store.is_active ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`}><Power size={13} />{busyStoreId === store.id ? "Memproses…" : store.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
              </div>
            </article>)}
      </div>
      <p className="text-[10px] leading-5 text-slate-400">Toko yang dinonaktifkan tidak muncul pada pilihan transaksi baru. Seluruh transaksi lama tetap tersimpan, dan nama toko yang diperbarui akan ikut berubah pada daftar transaksi serta PDF BKU.</p>
    </section>
  );
}
