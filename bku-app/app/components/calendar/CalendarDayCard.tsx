"use client";

import { ArrowDownLeft, ArrowUpRight, GripVertical } from "lucide-react";
import type { DaySummary } from "@/app/lib/bku/types";
import { shortMoney } from "@/app/lib/bku/formatters";

export function CalendarDayCard({
  day,
  date,
  summary,
  selected,
  today,
  onClick,
  onDropDate,
  onDropProjectStart,
}: {
  day: number;
  date: string;
  summary?: DaySummary;
  selected: boolean;
  today: boolean;
  onClick: () => void;
  onDropDate: (sourceDate: string, targetDate: string) => void;
  onDropProjectStart: (targetDate: string) => void;
}) {
  return (
    <button
      type="button"
      draggable={Boolean(summary?.count)}
      onDragStart={(event) => {
        if (!summary?.count || !event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-bku-date", date);
        event.dataTransfer.setData("text/plain", `bku-date:${date}`);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!event.dataTransfer) return;
        if (event.dataTransfer.getData("application/x-bku-project-start") === "true") {
          onDropProjectStart(date);
          return;
        }
        const source = event.dataTransfer.getData("application/x-bku-date") || event.dataTransfer.getData("text/plain");
        const sourceDate = source.startsWith("bku-date:") ? source.slice("bku-date:".length) : source;
        if (sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) && sourceDate !== date) onDropDate(sourceDate, date);
      }}
      onClick={onClick}
      title={summary?.count ? "Klik untuk melihat nota. Seret tanggal ini ke tanggal lain untuk menata ulang nota." : "Klik untuk melihat tanggal atau menambah transaksi."}
      className={`group relative flex min-h-[112px] min-w-0 flex-col rounded-2xl border p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:min-h-[132px] sm:p-3 ${selected ? "border-emerald-500 bg-emerald-50/80 shadow-sm ring-2 ring-emerald-100" : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-slate-50"} ${today ? "ring-1 ring-sky-300" : ""}`}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${selected ? "bg-emerald-700 text-white" : today ? "bg-sky-100 text-sky-800" : "text-slate-700"}`}>{day}</span>
        {summary?.count ? <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-800"><GripVertical size={11} />{summary.count}</span> : <span className="text-[9px] text-slate-300">—</span>}
      </div>
      {summary?.count ? (
        <div className="mt-2 w-full space-y-1">
          {summary.incoming > 0 && <p className="flex min-w-0 items-center gap-1 truncate rounded-lg bg-emerald-50 px-1.5 py-1 text-[9px] font-bold text-emerald-800 sm:text-[10px]"><ArrowDownLeft size={11} className="shrink-0" />{shortMoney(summary.incoming)}</p>}
          {summary.outgoing > 0 && <p className="flex min-w-0 items-center gap-1 truncate rounded-lg bg-rose-50 px-1.5 py-1 text-[9px] font-bold text-rose-800 sm:text-[10px]"><ArrowUpRight size={11} className="shrink-0" />{shortMoney(summary.outgoing)}</p>}
        </div>
      ) : <span className="mt-3 block text-[10px] font-medium text-slate-300 group-hover:text-emerald-600">+ Catat nota</span>}
      {summary?.count && <span className="mt-auto pt-2 text-[9px] text-slate-400">Klik untuk rincian nota</span>}
    </button>
  );
}
