"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, UserRoundX, Users, X } from "lucide-react";
import type { Worker, WorkerInput, WorkerType } from "@/app/lib/bku/types";
import { fieldClass, money } from "@/app/lib/bku/formatters";

export function WorkerRosterEditor({
  workers,
  defaultJoinedOn,
  onSave,
  onSetActive,
}: {
  workers: Worker[];
  defaultJoinedOn: string;
  onSave: (input: WorkerInput) => Promise<void>;
  onSetActive: (worker: Worker, active: boolean) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<WorkerType>("TUKANG");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("140000");
  const [joinedOn, setJoinedOn] = useState(defaultJoinedOn);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function startNew() {
    setEditingId(null);
    setType("TUKANG");
    setName("");
    setRate("140000");
    setJoinedOn(defaultJoinedOn);
    setActive(true);
    setMessage("");
  }

  function startEdit(worker: Worker) {
    setEditingId(worker.id);
    setType(worker.worker_type);
    setName(worker.name);
    setRate(String(worker.daily_rate));
    setJoinedOn(worker.joined_on);
    setActive(worker.is_active);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSave({
        id: editingId || undefined,
        worker_type: type,
        name,
        daily_rate: Number(rate.replace(/[^0-9]/g, "")) || 0,
        joined_on: joinedOn,
        is_active: active,
      });
      const successMessage = editingId ? "Data pekerja diperbarui." : "Pekerja ditambahkan.";
      startNew();
      setMessage(successMessage);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Data pekerja gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!editingId) setJoinedOn(defaultJoinedOn);
  }, [defaultJoinedOn, editingId]);

  async function toggle(worker: Worker) {
    const next = !worker.is_active;
    if (worker.is_active && !window.confirm(`Nonaktifkan ${worker.name}? Data absensi dan riwayat gaji lama tetap tersimpan.`)) return;
    try {
      await onSetActive(worker, next);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Status pekerja gagal diubah.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Users size={17}/></span><div><h3 className="text-sm font-black text-slate-900">Daftar induk pekerja</h3><p className="text-[10px] text-slate-500">Tambah, ubah nama/tarif, atau nonaktifkan pekerja tanpa menghapus riwayat.</p></div></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{workers.length} pekerja terdaftar</span>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_1fr_auto] xl:items-end">
        <label className="block text-[11px] font-bold text-slate-600">Jenis<select value={type} onChange={(event) => { const next = event.target.value as WorkerType; setType(next); if (!editingId) setRate(next === "TUKANG" ? "140000" : "120000"); }} className={fieldClass}><option value="TUKANG">Tukang</option><option value="PEKERJA">Pekerja</option></select></label>
        <label className="block text-[11px] font-bold text-slate-600">Nama pekerja<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Asep / Tukang 1" className={fieldClass}/></label>
        <label className="block text-[11px] font-bold text-slate-600">Upah per hari (Rp)<input required inputMode="numeric" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="140000" className={fieldClass}/></label>
        <label className="block text-[11px] font-bold text-slate-600">Mulai bergabung<input type="date" required value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} className={fieldClass}/></label>
        <div className="flex gap-2">{editingId && <button type="button" onClick={startNew} className="flex h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><X size={14}/></button>}<button type="submit" disabled={saving} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-50">{editingId ? <Check size={14}/> : <Plus size={14}/>}{saving ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Tambah pekerja"}</button></div>
      </form>
      {message && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-600">{message}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Jenis</th><th className="px-3 py-3">Nama pekerja</th><th className="px-3 py-3 text-right">Tarif harian</th><th className="px-3 py-3">Mulai</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {workers.map((worker) => <tr key={worker.id} className={!worker.is_active ? "bg-slate-50/70 text-slate-400" : ""}>
              <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${worker.worker_type === "TUKANG" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{worker.worker_type === "TUKANG" ? "Tukang" : "Pekerja"}</span></td>
              <td className="px-3 py-2.5 font-semibold">{worker.name}</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums">{money(Number(worker.daily_rate))}</td>
              <td className="px-3 py-2.5">{worker.joined_on}</td>
              <td className="px-3 py-2.5">{worker.is_active ? <span className="text-emerald-700">Aktif</span> : <span>Nonaktif</span>}</td>
              <td className="px-3 py-2.5"><div className="flex justify-end gap-1"><button type="button" onClick={() => startEdit(worker)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white" title="Ubah"><Pencil size={13}/></button><button type="button" onClick={() => void toggle(worker)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white" title={worker.is_active ? "Nonaktifkan" : "Aktifkan"}><UserRoundX size={13}/></button></div></td>
            </tr>)}
            {!workers.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Belum ada pekerja. Tambahkan pekerja pertama melalui formulir di atas.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-slate-400">Tarif tukang baru otomatis diisi Rp140.000/hari dan pekerja Rp120.000/hari sebagai nilai awal. Anda dapat mengubahnya sesuai kesepakatan aktual.</p>
    </section>
  );
}
