"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export function CalendarToolbar({
  month,
  onPrevious,
  onNext,
  onToday,
}: {
  month: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(month);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays size={19} /></span>
        <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Kalender pembukuan</p><h3 className="text-lg font-black capitalize text-slate-900">{label}</h3></div>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onToday} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Hari ini</button>
        <button type="button" onClick={onPrevious} aria-label="Bulan sebelumnya" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft size={17} /></button>
        <button type="button" onClick={onNext} aria-label="Bulan berikutnya" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight size={17} /></button>
      </div>
    </div>
  );
}
