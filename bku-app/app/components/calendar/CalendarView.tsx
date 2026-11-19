"use client";

import { useMemo } from "react";
import type { DaySummary } from "@/app/lib/bku/types";
import { dateKey } from "@/app/lib/bku/formatters";
import { CalendarDayCard } from "./CalendarDayCard";
import { CalendarToolbar } from "./CalendarToolbar";

export function CalendarView({
  month,
  summaries,
  selectedDate,
  onSelectDate,
  onDropDate,
  onDropProjectStart,
  onPrevious,
  onNext,
  onToday,
}: {
  month: Date;
  summaries: Record<string, DaySummary>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onDropDate: (sourceDate: string, targetDate: string) => void;
  onDropProjectStart: (targetDate: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const cells = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const result: Array<number | null> = [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [month]);
  const today = dateKey(new Date());

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <CalendarToolbar month={month} onPrevious={onPrevious} onNext={onNext} onToday={onToday} />
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-400 sm:text-xs">{day}</div>)}
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="min-h-[112px] rounded-2xl bg-slate-50/60 sm:min-h-[132px]" />;
          const date = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
          return <CalendarDayCard key={date} day={day} date={date} summary={summaries[date]} selected={date === selectedDate} today={date === today} onClick={() => onSelectDate(date)} onDropDate={onDropDate} onDropProjectStart={onDropProjectStart} />;
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500 sm:text-xs">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Kas masuk</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Kas keluar</span>
        <span className="ml-auto flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-400" />Hari ini</span>
      </div>
      <p className="mt-2 text-[10px] leading-5 text-slate-400">Klik sebuah tanggal untuk membuka seluruh nota. Seret kartu tanggal yang memiliki transaksi untuk memindahkan nota, atau seret penanda tanggal mulai proyek untuk menggeser keseluruhan jadwal.</p>
    </section>
  );
}
