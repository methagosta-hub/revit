"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type {
  Account, Book, Worker, WorkerAttendance, WorkerAttendanceDraft,
  WorkerInput, WeeklyPayroll,
} from "@/app/lib/bku/types";
import { dateKey, isValidDateKey } from "@/app/lib/bku/formatters";

const WORKER_SELECT = "id,book_id,worker_type,name,daily_rate,joined_on,is_active,created_at";
const ATTENDANCE_SELECT = "id,book_id,worker_id,work_date,hok,daily_rate_snapshot,amount,worker_name_snapshot,worker_type_snapshot";
const PAYROLL_SELECT = "id,book_id,week_start,week_end,pay_date,total_hok,total_amount,transaction_id,account";

function safeLocalDate(value: string): Date {
  if (isValidDateKey(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  // Fallback defensif untuk input yang masih kosong/tidak lengkap.
  return new Date();
}

export function getSundayDate(value: string) {
  const date = safeLocalDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return dateKey(date);
}

export function addCalendarDays(value: string, days: number) {
  const date = safeLocalDate(value);
  date.setDate(date.getDate() + (Number.isFinite(days) ? days : 0));
  return dateKey(date);
}

export function useBkuPayroll(
  supabase: SupabaseClient | null,
  session: Session | null,
  book: Book | null,
  weekStart: string,
) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<WorkerAttendance[]>([]);
  const [weeklyPayroll, setWeeklyPayroll] = useState<WeeklyPayroll | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadWorkers = useCallback(async () => {
    if (!supabase || !book) { setWorkers([]); return []; }
    const { data, error: queryError } = await supabase.from("bku_workers")
      .select(WORKER_SELECT).eq("book_id", book.id)
      .order("is_active", { ascending: false }).order("worker_type").order("name");
    if (queryError) throw queryError;
    const rows = (data || []) as Worker[];
    setWorkers(rows);
    return rows;
  }, [supabase, book?.id]);

  const loadWeek = useCallback(async (targetWeekStart = weekStart) => {
    if (!supabase || !book) { setAttendance([]); setWeeklyPayroll(null); return; }
    if (!isValidDateKey(targetWeekStart)) {
      setAttendance([]);
      setWeeklyPayroll(null);
      return;
    }
    const sunday = getSundayDate(targetWeekStart);
    const saturday = addCalendarDays(sunday, 6);
    setAttendance([]);
    setWeeklyPayroll(null);
    const [attendanceResult, payrollResult] = await Promise.all([
      supabase.from("bku_worker_attendance").select(ATTENDANCE_SELECT)
        .eq("book_id", book.id).gte("work_date", sunday).lte("work_date", saturday)
        .order("work_date"),
      supabase.from("bku_payroll_weeks").select(PAYROLL_SELECT)
        .eq("book_id", book.id).eq("week_start", sunday).maybeSingle(),
    ]);
    if (attendanceResult.error) throw attendanceResult.error;
    if (payrollResult.error) throw payrollResult.error;
    setAttendance((attendanceResult.data || []) as WorkerAttendance[]);
    setWeeklyPayroll((payrollResult.data || null) as WeeklyPayroll | null);
  }, [supabase, book?.id, weekStart]);

  const refresh = useCallback(async () => {
    if (!supabase || !book || !session?.user) {
      setWorkers([]); setAttendance([]); setWeeklyPayroll(null); return;
    }
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadWorkers(), loadWeek()]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Data pekerja dan absensi gagal dimuat.";
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [supabase, book?.id, session?.user?.id, loadWorkers, loadWeek]);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const saveWorker = useCallback(async (input: WorkerInput) => {
    if (!supabase || !book || !session?.user) throw new Error("Sesi akun atau buku kas tidak tersedia.");
    const payload = {
      book_id: book.id,
      worker_type: input.worker_type,
      name: input.name.trim(),
      daily_rate: input.daily_rate,
      joined_on: input.joined_on,
      is_active: input.is_active,
      created_by: session.user.id,
      updated_at: new Date().toISOString(),
    };
    if (!payload.name) throw new Error("Nama pekerja harus diisi.");
    if (!Number.isFinite(payload.daily_rate) || payload.daily_rate <= 0) throw new Error("Tarif harian harus lebih besar dari nol.");
    const result = input.id
      ? await supabase.from("bku_workers").update(payload).eq("id", input.id).eq("book_id", book.id)
      : await supabase.from("bku_workers").insert(payload);
    if (result.error) throw result.error;
    await loadWorkers();
  }, [supabase, book?.id, session?.user?.id, loadWorkers]);

  const setWorkerActive = useCallback(async (worker: Worker, isActive: boolean) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const { error: updateError } = await supabase.from("bku_workers")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", worker.id).eq("book_id", book.id);
    if (updateError) throw updateError;
    await loadWorkers();
  }, [supabase, book?.id, loadWorkers]);

  const copyWeekAttendance = useCallback(async (sourceWeekStart: string, targetWeekStart = weekStart) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    if (!isValidDateKey(sourceWeekStart) || !isValidDateKey(targetWeekStart)) throw new Error("Tanggal minggu sumber dan tujuan harus valid.");
    const sourceSunday = getSundayDate(sourceWeekStart);
    const sourceSaturday = addCalendarDays(sourceSunday, 6);
    const { data, error: queryError } = await supabase.from("bku_worker_attendance")
      .select(ATTENDANCE_SELECT).eq("book_id", book.id)
      .gte("work_date", sourceSunday).lte("work_date", sourceSaturday);
    if (queryError) throw queryError;
    const mapped: Record<string, number[]> = {};
    for (const row of (data || []) as WorkerAttendance[]) {
      const offset = Math.round((new Date(`${row.work_date}T00:00:00`).getTime() - new Date(`${sourceSunday}T00:00:00`).getTime()) / 86400000);
      if (offset < 0 || offset > 6) continue;
      mapped[row.worker_id] ||= [0, 0, 0, 0, 0, 0, 0];
      mapped[row.worker_id][offset] = Number(row.hok || 0);
    }
    return mapped;
  }, [supabase, book?.id, weekStart]);

  const saveWeeklyPayroll = useCallback(async (
    targetWeekStart: string,
    payDate: string,
    account: Account,
    rows: WorkerAttendanceDraft[],
  ) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    if (!isValidDateKey(targetWeekStart) || !isValidDateKey(payDate)) throw new Error("Tanggal minggu dan tanggal pembayaran harus valid.");
    const normalizedSunday = getSundayDate(targetWeekStart);
    const normalizedSaturday = addCalendarDays(normalizedSunday, 6);
    if (payDate !== normalizedSaturday) throw new Error("Pembayaran gaji mingguan wajib dicatat pada hari Sabtu.");
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("bku_save_weekly_payroll", {
        p_book_id: book.id,
        p_week_start: normalizedSunday,
        p_pay_date: payDate,
        p_account: account,
        p_attendance: rows,
      });
      if (rpcError) throw rpcError;
      await Promise.all([loadWorkers(), loadWeek(targetWeekStart)]);
      return data as { transaction_id: string; total_amount: number; total_hok: number; workers_paid: number };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Penggajian mingguan gagal disimpan.";
      setError(message);
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [supabase, book?.id, loadWorkers, loadWeek]);

  const loadAttendanceReport = useCallback(async (startDate: string, endDate: string) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const [workerResult, attendanceResult] = await Promise.all([
      supabase.from("bku_workers").select(WORKER_SELECT).eq("book_id", book.id)
        .lte("joined_on", endDate).order("worker_type").order("name"),
      supabase.from("bku_worker_attendance").select(ATTENDANCE_SELECT).eq("book_id", book.id)
        .gte("work_date", startDate).lte("work_date", endDate).order("work_date"),
    ]);
    if (workerResult.error) throw workerResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    return {
      workers: (workerResult.data || []) as Worker[],
      attendance: (attendanceResult.data || []) as WorkerAttendance[],
    };
  }, [supabase, book?.id]);

  return {
    workers,
    activeWorkers: workers.filter((worker) => worker.is_active),
    attendance,
    weeklyPayroll,
    loading,
    saving,
    error,
    setError,
    refresh,
    loadWorkers,
    loadWeek,
    saveWorker,
    setWorkerActive,
    copyWeekAttendance,
    saveWeeklyPayroll,
    loadAttendanceReport,
  };
}
