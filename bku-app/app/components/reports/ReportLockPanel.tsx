"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, LockOpen, ShieldCheck } from "lucide-react";
import { dateLabel, fieldClass } from "@/app/lib/bku/formatters";

export function ReportLockPanel({
  startDate,
  defaultDate,
  lockedThroughDate,
  loading,
  saving,
  onSave,
  onUnlock,
}: {
  startDate: string;
  defaultDate: string;
  lockedThroughDate: string | null;
  loading: boolean;
  saving: boolean;
  onSave: (date: string) => Promise<void>;
  onUnlock: () => Promise<void>;
}) {
  const [targetDate, setTargetDate] = useState(lockedThroughDate || defaultDate || startDate);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTargetDate(lockedThroughDate || defaultDate || startDate);
  }, [lockedThroughDate, defaultDate, startDate]);

  async function handleSave() {
    setMessage("");
    try {
      await onSave(targetDate);
      setMessage("Batas penguncian berhasil disimpan.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Penguncian gagal disimpan.");
    }
  }

  async function handleUnlock() {
    if (!window.confirm("Buka seluruh penguncian tanggal pada proyek ini? Data lama akan dapat diubah kembali.")) return;
    setMessage("");
    try {
      await onUnlock();
      setMessage("Semua tanggal berhasil dibuka kembali.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Penguncian gagal dibuka.");
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${lockedThroughDate ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
            {lockedThroughDate ? <LockKeyhole size={19}/> : <ShieldCheck size={19}/>}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900">Pengamanan laporan berdasarkan tanggal</h3>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">
              {lockedThroughDate
                ? <>Data sampai dengan <strong className="text-amber-800">{dateLabel(lockedThroughDate)}</strong> termasuk tanggal tersebut sedang terkunci. Nota, absensi, dan transaksi pada tanggal-tanggal itu tidak dapat ditambah, disalin ke sana, dipindahkan, diubah, atau dihapus.</>
                : "Belum ada tanggal yang dikunci. Kunci laporan setelah rekap final agar transaksi dan absensi sebelumnya terlindungi."}
            </p>
          </div>
        </div>
        {lockedThroughDate && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold text-amber-800">Terkunci sampai {dateLabel(lockedThroughDate)}</span>}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
        <div className="min-w-[210px] flex-1">
          <label className="mb-1.5 block text-[10px] font-bold text-slate-600">{lockedThroughDate ? "Atur batas penguncian" : "Kunci laporan sampai tanggal"}</label>
          <input type="date" min={startDate} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={fieldClass}/>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={saving || loading || !targetDate || targetDate < startDate} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
          <LockKeyhole size={14}/>{saving ? "Menyimpan…" : lockedThroughDate ? "Simpan batas kunci" : "Kunci sampai tanggal ini"}
        </button>
        {lockedThroughDate && <button type="button" onClick={() => void handleUnlock()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">
          <LockOpen size={14}/>Buka semua kunci
        </button>}
      </div>
      {message && <p role="status" className="mt-3 text-[11px] font-semibold text-slate-600">{message}</p>}
      <p className="mt-2 text-[10px] leading-5 text-slate-400">Penguncian dapat diubah atau dibuka kembali kapan saja oleh pemilik buku kas.</p>
    </section>
  );
}
