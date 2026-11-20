"use client";

import { useState } from "react";
import { Check, Clipboard, Database, RefreshCw } from "lucide-react";
import type { ReportCategory } from "@/app/lib/bku/types";

const requestedCategorySql = `insert into public.bku_report_categories (transaction_type, code, label, sort_order)
values
  ('OUT', 'upah', 'Gaji Harian Tukang', 20),
  ('OUT', 'ape', 'APE', 60),
  ('OUT', 'meubeler', 'Meubeler', 70),
  ('OUT', 'smkk', 'SMKK', 80),
  ('OUT', 'lainnya', 'Lain-lain', 90)
on conflict (transaction_type, code) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true;`;

const extensionSql = `insert into public.bku_report_categories (transaction_type, code, label, sort_order)
values ('OUT', 'kode_baru', 'Nama Kategori Baru', 100)
on conflict (transaction_type, code) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true;`;

export function ReportCategoryMasterView({
  categories,
  loading,
  error,
  onRefresh,
}: {
  categories: ReportCategory[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState<"requested" | "extension" | "">("");

  const outgoing = categories.filter((item) => item.transaction_type === "OUT");
  const incoming = categories.filter((item) => item.transaction_type === "IN");

  async function copySql(kind: "requested" | "extension") {
    const value = kind === "requested" ? requestedCategorySql : extensionSql;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied("");
    }
  }

  return (
    <section className="mt-4 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Database size={19}/></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Master Rekap Data</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Kategori transaksi dan laporan</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Kategori dibaca langsung dari database BKU. Tambah, ubah nama, urutan, atau nonaktifkan kategori melalui Supabase → SQL Editor.</p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Muat ulang</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Master kategori belum dapat dibaca. Jalankan migrasi <strong>20261120_bku_report_categories.sql</strong> pada proyek Supabase BKU, kemudian muat ulang. Kategori bawaan aplikasi tetap tersedia sebagai cadangan.</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-black text-slate-800">Kas keluar</h4><span className="text-[10px] text-slate-400">{outgoing.length} kategori</span></div>
          {loading ? <p className="py-4 text-center text-xs text-slate-400">Memuat kategori…</p> : outgoing.length ? <div className="divide-y divide-slate-100">{outgoing.map((item) => <div key={item.code} className="flex items-center justify-between gap-3 py-2"><span className="text-xs font-semibold text-slate-700">{item.label}</span><code className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{item.code}</code></div>)}</div> : <p className="py-4 text-center text-xs text-slate-400">Kategori database belum tersedia.</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-black text-slate-800">Kas masuk</h4><span className="text-[10px] text-slate-400">{incoming.length} kategori</span></div>
          {loading ? <p className="py-4 text-center text-xs text-slate-400">Memuat kategori…</p> : incoming.length ? <div className="divide-y divide-slate-100">{incoming.map((item) => <div key={item.code} className="flex items-center justify-between gap-3 py-2"><span className="text-xs font-semibold text-slate-700">{item.label}</span><code className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{item.code}</code></div>)}</div> : <p className="py-4 text-center text-xs text-slate-400">Kategori database belum tersedia.</p>}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-black text-emerald-950">SQL kategori yang diminta</h4><p className="mt-1 text-[10px] text-emerald-800">Bisa dijalankan ulang dengan aman.</p></div><button type="button" onClick={() => void copySql("requested")} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">{copied === "requested" ? <Check size={13}/> : <Clipboard size={13}/ >}{copied === "requested" ? "Tersalin" : "Salin SQL"}</button></div>
          <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-emerald-200">{requestedCategorySql}</pre>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-black text-slate-800">Template kategori tambahan</h4><p className="mt-1 text-[10px] text-slate-500">Ganti kode, nama, dan urutan sesuai kategori baru.</p></div><button type="button" onClick={() => void copySql("extension")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700">{copied === "extension" ? <Check size={13}/> : <Clipboard size={13}/ >}{copied === "extension" ? "Tersalin" : "Salin template"}</button></div>
          <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{extensionSql}</pre>
        </div>
      </div>
      <p className="text-[10px] leading-5 text-slate-400">Catatan: kode <strong>upah</strong> sengaja dipertahankan agar transaksi penggajian mingguan lama tetap terhubung ke kategori Gaji Harian Tukang. Kategori yang sudah dipakai transaksi sebaiknya dinonaktifkan, bukan dihapus.</p>
    </section>
  );
}
