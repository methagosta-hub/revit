"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Database, Pencil, Plus, Power, RefreshCw, X } from "lucide-react";
import type { ReportCategory, ReportCategoryInput } from "@/app/lib/bku/types";
import { fieldClass } from "@/app/lib/bku/formatters";
import { FormField } from "@/app/components/layout/FormField";

type CategoryForm = {
  code: string | null;
  transaction_type: "IN" | "OUT";
  label: string;
  sort_order: string;
};

function makeCategoryCode(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function ReportCategoryMasterView({
  categories,
  loading,
  error,
  onRefresh,
  onSave,
  onSetActive,
}: {
  categories: ReportCategory[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onSave: (input: ReportCategoryInput, isNew: boolean) => Promise<void>;
  onSetActive: (category: ReportCategory, isActive: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const outgoing = useMemo(
    () => categories
      .filter((item) => item.transaction_type === "OUT" && (showInactive || item.is_active))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "id-ID")),
    [categories, showInactive],
  );
  const incoming = useMemo(
    () => categories
      .filter((item) => item.transaction_type === "IN" && (showInactive || item.is_active))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "id-ID")),
    [categories, showInactive],
  );
  const activeCount = categories.filter((item) => item.is_active).length;
  const inactiveCount = categories.length - activeCount;

  function startNew(transaction_type: "IN" | "OUT") {
    const current = categories.filter((item) => item.transaction_type === transaction_type);
    const nextOrder = current.reduce((maximum, item) => Math.max(maximum, item.sort_order), 0) + 10;
    setForm({ code: null, transaction_type, label: "", sort_order: String(nextOrder) });
    setFormError("");
    setMessage("");
  }

  function startEdit(category: ReportCategory) {
    setForm({
      code: category.code,
      transaction_type: category.transaction_type,
      label: category.label,
      sort_order: String(category.sort_order),
    });
    setFormError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const label = form.label.trim();
    const sortOrder = Number(form.sort_order);
    const code = form.code || makeCategoryCode(label);

    if (!label) {
      setFormError("Nama kategori wajib diisi.");
      return;
    }
    if (!code) {
      setFormError("Nama kategori harus memuat huruf atau angka agar dapat dibuatkan kode.");
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      setFormError("Urutan harus berupa angka bulat antara 0 sampai 9999.");
      return;
    }
    if (!form.code && categories.some((item) => item.transaction_type === form.transaction_type && item.code === code)) {
      setFormError("Kategori dengan nama serupa sudah ada. Gunakan nama yang berbeda atau ubah kategori yang tersedia.");
      return;
    }

    const input: ReportCategoryInput = {
      transaction_type: form.transaction_type,
      code,
      label,
      sort_order: sortOrder,
    };

    setSaving(true);
    setFormError("");
    setMessage("");
    try {
      await onSave(input, !form.code);
      setForm(null);
      setMessage(form.code
        ? "Kategori berhasil diperbarui. Kode internal tetap dipertahankan agar transaksi lama tidak terputus."
        : "Kategori baru berhasil ditambahkan.");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Kategori gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function changeActive(category: ReportCategory) {
    const nextActive = !category.is_active;
    const key = `${category.transaction_type}:${category.code}`;
    setBusyKey(key);
    setFormError("");
    setMessage("");
    try {
      await onSetActive(category, nextActive);
      setMessage(nextActive
        ? `Kategori "${category.label}" berhasil diaktifkan kembali.`
        : `Kategori "${category.label}" dinonaktifkan. Riwayat transaksi tetap tersimpan.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Status kategori gagal diubah.");
    } finally {
      setBusyKey("");
    }
  }

  function renderCategoryList(items: ReportCategory[], transactionType: "IN" | "OUT") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-900">{transactionType === "OUT" ? "Kas keluar" : "Kas masuk"}</h4>
            <p className="mt-0.5 text-[10px] text-slate-500">{categories.filter((item) => item.transaction_type === transactionType && item.is_active).length} kategori aktif</p>
          </div>
          <button type="button" onClick={() => startNew(transactionType)} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-800">
            <Plus size={14} />Tambah
          </button>
        </div>
        {loading ? <p className="py-5 text-center text-xs text-slate-400">Memuat kategori…</p>
          : items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center"><p className="text-xs font-semibold text-slate-600">Belum ada kategori {transactionType === "OUT" ? "kas keluar" : "kas masuk"}.</p><p className="mt-1 text-[10px] text-slate-400">Gunakan tombol Tambah untuk membuat kategori pertama.</p></div>
          : <div className="divide-y divide-slate-100">
            {items.map((item, index) => {
              const key = `${item.transaction_type}:${item.code}`;
              const protectedCategory = item.transaction_type === "OUT" && item.code === "upah";
              return <article key={key} className={`flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1 ${item.is_active ? "" : "opacity-65"}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[11px] font-bold text-slate-500">{item.sort_order}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-xs font-bold text-slate-800">{item.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "Aktif" : "Nonaktif"}</span>
                      {protectedCategory && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">Terhubung ke penggajian</span>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{item.is_active ? "Tersedia untuk transaksi baru" : "Disembunyikan dari pilihan transaksi baru"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => startEdit(item)} aria-label={`Ubah kategori ${item.label}`} title="Ubah kategori" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={12}/>Ubah</button>
                  <button type="button" disabled={busyKey === key || protectedCategory} onClick={() => void changeActive(item)} title={protectedCategory ? "Kategori ini dipakai otomatis oleh modul Absensi & Gaji" : item.is_active ? "Nonaktifkan kategori" : "Aktifkan kategori"} className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${item.is_active ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`}><Power size={12}/>{busyKey === key ? "Memproses…" : item.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                </div>
              </article>;
            })}
          </div>}
      </div>
    );
  }

  return (
    <section className="mt-4 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Database size={20}/></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Master Rekap Data</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Kategori transaksi dan laporan</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Kelola kategori kas masuk dan kas keluar langsung dari aplikasi. Kategori yang dinonaktifkan tidak muncul pada transaksi baru, tetapi riwayat lama tetap tersimpan.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowInactive((value) => !value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{showInactive ? "Sembunyikan nonaktif" : `Tampilkan nonaktif (${inactiveCount})`}</button>
          <button type="button" onClick={onRefresh} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""}/>Muat ulang</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Master kategori belum dapat dibaca.</strong> Pengelola sistem perlu memastikan tabel kategori BKU sudah diaktifkan. Kategori bawaan aplikasi tetap digunakan sebagai cadangan. <span className="block break-words text-[10px] text-amber-800">{error}</span></div>}
      {(formError || message) && <div role={formError ? "alert" : "status"} className={`rounded-xl border px-3 py-2.5 text-xs leading-5 ${formError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{formError || message}</div>}

      {form && <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h4 className="text-sm font-black text-slate-900">{form.code ? "Ubah kategori" : "Tambah kategori baru"}</h4><p className="mt-1 text-[10px] leading-5 text-slate-500">{form.code ? "Kode internal tidak diubah agar transaksi lama tetap terhubung." : "Kode kategori akan dibuat otomatis dari nama yang Anda masukkan."}</p></div>
          <button type="button" onClick={() => setForm(null)} disabled={saving} aria-label="Tutup formulir" className="rounded-lg p-2 text-slate-500 hover:bg-white disabled:opacity-50"><X size={16}/></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Jenis transaksi">
            <select value={form.transaction_type} disabled={Boolean(form.code) || saving} onChange={(event) => setForm((current) => current ? { ...current, transaction_type: event.target.value as "IN" | "OUT" } : current)} className={fieldClass}>
              <option value="OUT">Kas keluar</option><option value="IN">Kas masuk</option>
            </select>
          </FormField>
          <div className="sm:col-span-2"><FormField label="Nama kategori">
            <input required autoFocus maxLength={80} value={form.label} onChange={(event) => setForm((current) => current ? { ...current, label: event.target.value } : current)} placeholder="Contoh: Sewa alat kerja" className={fieldClass}/>
          </FormField></div>
          <FormField label="Urutan tampil">
            <input type="number" required min={0} max={9999} step={1} value={form.sort_order} onChange={(event) => setForm((current) => current ? { ...current, sort_order: event.target.value } : current)} className={fieldClass}/>
          </FormField>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-emerald-100 pt-3">
          <button type="button" onClick={() => setForm(null)} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button>
          <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Check size={14}/>{saving ? "Menyimpan…" : form.code ? "Simpan perubahan" : "Simpan kategori"}</button>
        </div>
      </form>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kategori aktif</p><p className="mt-1 text-2xl font-black text-slate-900">{activeCount}</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kategori nonaktif</p><p className="mt-1 text-2xl font-black text-slate-900">{inactiveCount}</p></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {renderCategoryList(outgoing, "OUT")}
        {renderCategoryList(incoming, "IN")}
      </div>

      <p className="text-[10px] leading-5 text-slate-400">Kode kategori dijaga tetap stabil agar transaksi lama dan integrasi penggajian tidak terputus. Kategori Gaji Harian Tukang terhubung otomatis dengan modul Absensi &amp; Gaji sehingga tidak dapat dinonaktifkan. Untuk kategori lain, gunakan Nonaktifkan alih-alih menghapus data.</p>
    </section>
  );
}
