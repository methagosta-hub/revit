"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardCopy, Save } from "lucide-react";
import type { Account, Worker, WorkerAttendance, WorkerAttendanceDraft, WorkerInput, WeeklyPayroll } from "@/app/lib/bku/types";
import { dateKey, dateLabel, fieldClass, isValidDateKey, money } from "@/app/lib/bku/formatters";
import { addCalendarDays, getMondayDate } from "@/app/hooks/useBkuPayroll";
import { WorkerRosterEditor } from "./WorkerRosterEditor";

const DAY_LABELS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type AttendanceMap = Record<string, number[]>;

export function WorkerPayrollView({
  workers,
  attendance,
  weeklyPayroll,
  weekStart,
  loading,
  saving,
  error,
  onWeekStartChange,
  onSaveWorker,
  onSetWorkerActive,
  onCopyWeek,
  onSavePayroll,
  onClearError,
}: {
  workers: Worker[];
  attendance: WorkerAttendance[];
  weeklyPayroll: WeeklyPayroll | null;
  weekStart: string;
  loading: boolean;
  saving: boolean;
  error: string;
  onWeekStartChange: (value: string) => void;
  onSaveWorker: (input: WorkerInput) => Promise<void>;
  onSetWorkerActive: (worker: Worker, active: boolean) => Promise<void>;
  onCopyWeek: (sourceWeekStart: string, targetWeekStart: string) => Promise<AttendanceMap>;
  onSavePayroll: (weekStart: string, payDate: string, account: Account, rows: WorkerAttendanceDraft[]) => Promise<unknown>;
  onClearError: () => void;
}) {
  // Gunakan minggu aman selama browser masih mengedit tanggal secara bertahap.
  const monday = getMondayDate(isValidDateKey(weekStart) ? weekStart : getMondayDate(dateKey(new Date())));
  const saturday = addCalendarDays(monday, 5);
  const eligibleWorkers = useMemo(() => workers.filter((worker) => worker.joined_on <= saturday && (worker.is_active || attendance.some((row) => row.worker_id === worker.id && row.work_date >= monday && row.work_date <= saturday))), [workers, attendance, monday, saturday]);
  const [daysByWorker, setDaysByWorker] = useState<AttendanceMap>({});
  const [payDate, setPayDate] = useState(saturday);
  const [account, setAccount] = useState<Account>("CASH");
  const [sourceWeek, setSourceWeek] = useState(addCalendarDays(monday, -7));
  const [copying, setCopying] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const weeklyRateByWorker = useMemo(() => Object.fromEntries(eligibleWorkers.map((worker) => {
    const savedRate = attendance.find((row) => row.worker_id === worker.id)?.daily_rate_snapshot;
    return [worker.id, Number(savedRate ?? worker.daily_rate)];
  })) as Record<string, number>, [eligibleWorkers, attendance]);

  useEffect(() => {
    const next: AttendanceMap = {};
    for (const worker of eligibleWorkers) next[worker.id] = [0, 0, 0, 0, 0, 0];
    for (const row of attendance) {
      const offset = Math.round((new Date(`${row.work_date}T00:00:00`).getTime() - new Date(`${monday}T00:00:00`).getTime()) / 86400000);
      if (offset < 0 || offset > 5) continue;
      next[row.worker_id] ||= [0, 0, 0, 0, 0, 0];
      next[row.worker_id][offset] = Number(row.hok || 0);
    }
    setDaysByWorker(next);
    setPayDate(weeklyPayroll?.week_start === monday ? weeklyPayroll.pay_date : (current => current >= monday && current <= saturday ? current : saturday)(payDate));
    if (weeklyPayroll?.week_start === monday) setAccount(weeklyPayroll.account);
    setSourceWeek(addCalendarDays(monday, -7));
  }, [monday, saturday, attendance, eligibleWorkers, weeklyPayroll?.week_start, weeklyPayroll?.pay_date, weeklyPayroll?.account]);

  const totals = useMemo(() => {
    const daily = [0, 0, 0, 0, 0, 0];
    const dailyAmount = [0, 0, 0, 0, 0, 0];
    let hok = 0;
    let amount = 0;
    for (const worker of eligibleWorkers) {
      const days = daysByWorker[worker.id] || [0, 0, 0, 0, 0, 0];
      for (let index = 0; index < 6; index++) {
        const value = Number(days[index] || 0);
        daily[index] += value;
        dailyAmount[index] += value * Number(weeklyRateByWorker[worker.id] ?? worker.daily_rate ?? 0);
        hok += value;
        amount += value * Number(weeklyRateByWorker[worker.id] ?? worker.daily_rate ?? 0);
      }
    }
    return { daily, dailyAmount, hok, amount: Math.round(amount) };
  }, [eligibleWorkers, daysByWorker, weeklyRateByWorker]);

  function updateCell(workerId: string, dayIndex: number, value: string) {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1 || Math.abs(parsed * 4 - Math.round(parsed * 4)) > 1e-9) return;
    setDaysByWorker((current) => {
      const days = [...(current[workerId] || [0, 0, 0, 0, 0, 0])];
      days[dayIndex] = parsed;
      return { ...current, [workerId]: days };
    });
  }

  async function handleCopy() {
    setCopying(true);
    setLocalError("");
    setNotice("");
    try {
      const copied = await onCopyWeek(sourceWeek, monday);
      const next: AttendanceMap = {};
      for (const worker of eligibleWorkers) next[worker.id] = [...(copied[worker.id] || [0, 0, 0, 0, 0, 0])];
      setDaysByWorker(next);
      setNotice(`Absensi ${dateLabel(getMondayDate(sourceWeek))} berhasil disalin ke minggu ${dateLabel(monday)}. Periksa kembali sebelum menyimpan.`);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Absensi minggu sumber gagal disalin.");
    } finally {
      setCopying(false);
    }
  }

  async function handleSave() {
    setLocalError("");
    setNotice("");
    if (totals.amount <= 0) {
      setLocalError("Isi kehadiran minimal satu pekerja sebelum menyimpan penggajian.");
      return;
    }
    const rows = eligibleWorkers.map((worker) => {
      const historical = attendance.find((row) => row.worker_id === worker.id);
      return {
        worker_id: worker.id,
        daily_rate: Number(weeklyRateByWorker[worker.id] ?? worker.daily_rate),
        worker_name_snapshot: historical?.worker_name_snapshot || worker.name,
        worker_type_snapshot: historical?.worker_type_snapshot || worker.worker_type,
        days: daysByWorker[worker.id] || [0, 0, 0, 0, 0, 0],
      };
    });
    try {
      const result = await onSavePayroll(monday, payDate, account, rows) as { total_amount?: number; workers_paid?: number };
      setNotice(`Absensi dan kas keluar upah berhasil disimpan. Total ${money(Number(result?.total_amount ?? totals.amount))}; ${Number(result?.workers_paid ?? eligibleWorkers.filter((worker) => (daysByWorker[worker.id] || []).some((value) => value > 0)).length)} pekerja.`);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Penggajian mingguan gagal disimpan.");
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Absensi & penggajian</p><h3 className="mt-1 text-lg font-black text-slate-900">Penggajian mingguan</h3><p className="mt-1 text-[11px] text-slate-500">Tentukan HOK setiap pekerja dari Senin sampai Sabtu. Kolom kosong atau 0 berarti tidak hadir.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => onWeekStartChange(addCalendarDays(monday, -7))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Minggu sebelumnya"><ArrowLeft size={16}/></button><button type="button" onClick={() => onWeekStartChange(addCalendarDays(monday, 7))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Minggu berikutnya"><ArrowRight size={16}/></button></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block text-[11px] font-bold text-slate-600">Pilih tanggal dalam minggu<input type="date" value={monday} onChange={(event) => { const value = event.currentTarget.value; if (isValidDateKey(value)) onWeekStartChange(getMondayDate(value)); }} className={fieldClass}/><span className="mt-1 block text-[10px] font-normal text-slate-400">Pilih melalui kalender atau ketik tanggal lengkap. Periode hanya berubah setelah tanggal valid.</span></label>
          <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold text-slate-400">PERIODE MINGGU</p><p className="mt-1 text-sm font-black text-slate-800">{dateLabel(monday, { day: "numeric", month: "short" })} – {dateLabel(saturday, { day: "numeric", month: "long", year: "numeric" })}</p></div>
          <label className="block text-[11px] font-bold text-slate-600">Tanggal kas keluar / pembayaran<select value={payDate} onChange={(event) => setPayDate(event.target.value)} className={fieldClass}>{Array.from({ length: 6 }, (_, index) => addCalendarDays(monday, index)).map((date, index) => <option key={date} value={date}>{DAY_LABELS[index]} · {dateLabel(date, { day: "numeric", month: "short" })}</option>)}</select></label>
          <label className="block text-[11px] font-bold text-slate-600">Sumber pembayaran<select value={account} onChange={(event) => setAccount(event.target.value as Account)} className={fieldClass}><option value="CASH">Tunai</option><option value="BANK">Rekening bank</option></select></label>
        </div>
      </section>

      {weeklyPayroll?.week_start === monday && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] text-emerald-900"><span><strong>Penggajian minggu ini sudah dibukukan.</strong> Tanggal pembayaran {dateLabel(weeklyPayroll.pay_date)} · {money(Number(weeklyPayroll.total_amount))}.</span><span className="font-semibold">Simpan ulang akan memperbarui transaksi upah yang sama, bukan menambah transaksi baru.</span></div>}
      <WorkerRosterEditor workers={workers} defaultJoinedOn={monday} onSave={onSaveWorker} onSetActive={onSetWorkerActive}/>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Matriks hadir pekerja</h3><p className="mt-1 text-[10px] text-slate-500">Isi 1 untuk satu hari penuh, 0,5 untuk setengah hari, 0,25 untuk seperempat hari, atau 0 bila tidak hadir. Tarif yang sudah tersimpan sebagai snapshot minggu ini tetap digunakan walaupun tarif master pekerja kemudian berubah.</p></div><div className="flex flex-wrap items-end gap-2"><label className="block text-[10px] font-bold text-slate-500">Salin dari minggu<input type="date" value={sourceWeek} onChange={(event) => setSourceWeek(getMondayDate(event.target.value))} className="mt-1 h-10 rounded-lg border border-slate-200 px-2 text-xs"/></label><button type="button" onClick={() => void handleCopy()} disabled={copying || loading} className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 px-3 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"><ClipboardCopy size={14}/>{copying ? "Menyalin…" : "Salin absensi"}</button></div></div>
        {error && <div role="alert" className="mb-3 flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><span>{error}</span><button type="button" onClick={onClearError} className="font-bold">Tutup</button></div>}
        {localError && <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{localError}</div>}
        {notice && <div role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="sticky left-0 z-10 bg-slate-50 px-3 py-3">Nama pekerja</th><th className="px-3 py-3">Jenis</th><th className="px-3 py-3 text-right">Upah/hari</th>{DAY_LABELS.map((day) => <th key={day} className="px-2 py-3 text-center">{day}</th>)}<th className="px-3 py-3 text-right">Total HOK</th><th className="px-3 py-3 text-right">Gaji minggu</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {eligibleWorkers.map((worker) => {
                const days = daysByWorker[worker.id] || [0, 0, 0, 0, 0, 0];
                const totalHok = days.reduce((sum, value) => sum + Number(value || 0), 0);
                const historical = attendance.find((row) => row.worker_id === worker.id);
                const displayName = historical?.worker_name_snapshot || worker.name;
                const displayType = historical?.worker_type_snapshot || worker.worker_type;
                return <tr key={worker.id} className="hover:bg-slate-50/60"><td className="sticky left-0 bg-white px-3 py-2.5 font-semibold text-slate-800">{displayName}</td><td className="px-3 py-2.5 text-[10px] text-slate-500">{displayType === "TUKANG" ? "Tukang" : "Pekerja"}</td><td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(Number(weeklyRateByWorker[worker.id] ?? worker.daily_rate))}</td>{days.map((value, dayIndex) => { const workDate = addCalendarDays(monday, dayIndex); const beforeJoin = workDate < worker.joined_on; return <td key={dayIndex} className="px-1 py-2"><input type="number" min="0" max="1" step="0.25" disabled={beforeJoin} aria-label={`${displayName} ${DAY_LABELS[dayIndex]}`} value={beforeJoin ? "" : value || ""} onChange={(event) => updateCell(worker.id, dayIndex, event.target.value)} placeholder={beforeJoin ? "—" : "–"} className="h-9 w-[66px] rounded-lg border border-slate-200 bg-white px-2 text-center text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 disabled:bg-slate-100 disabled:text-slate-300"/></td>; })}<td className="px-3 py-2.5 text-right font-semibold tabular-nums">{totalHok.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-black text-emerald-800 tabular-nums">{money(totalHok * Number(weeklyRateByWorker[worker.id] ?? worker.daily_rate))}</td></tr>;
              })}
              {!eligibleWorkers.length && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400">Belum ada pekerja aktif yang bergabung sampai minggu ini. Tambahkan pekerja pada Daftar Induk Pekerja.</td></tr>}
            </tbody>
            <tfoot className="bg-slate-50"><tr><th className="sticky left-0 bg-slate-50 px-3 py-3 text-left" colSpan={3}>Total HOK per hari</th>{totals.daily.map((value, index) => <th key={index} className="px-2 py-3 text-center tabular-nums">{value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</th>)}<th className="px-3 py-3 text-right tabular-nums">{totals.hok.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</th><th className="whitespace-nowrap px-3 py-3 text-right font-black text-emerald-800">{money(totals.amount)}</th></tr><tr><th className="sticky left-0 bg-slate-50 px-3 py-3 text-left" colSpan={3}>Total upah per hari</th>{totals.dailyAmount.map((value, index) => <th key={index} className="px-2 py-3 text-center text-[9px] tabular-nums">{value ? money(value) : "—"}</th>)}<th className="px-3 py-3 text-right">—</th><th className="px-3 py-3 text-right font-black text-emerald-800">{money(totals.amount)}</th></tr></tfoot>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Total kas keluar gaji minggu ini</p><p className="mt-1 text-2xl font-black text-emerald-900">{money(totals.amount)}</p><p className="mt-1 text-[10px] text-emerald-800">Dibukukan sebagai satu transaksi OUT kategori Upah pada {dateLabel(payDate)}.</p></div><button type="button" onClick={() => void handleSave()} disabled={saving || loading || totals.amount <= 0} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"><Save size={15}/>{saving ? "Menyimpan penggajian…" : "Simpan absensi & kas keluar"}</button></div>
      </section>
    </div>
  );
}
