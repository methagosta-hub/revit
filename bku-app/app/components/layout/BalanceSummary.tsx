import { ArrowLeftRight, ArrowUpRight, Banknote, Wallet } from "lucide-react";
import type { BalanceSummary as BalanceSummaryType } from "@/app/lib/bku/types";
import { money } from "@/app/lib/bku/formatters";

export function BalanceSummary({ summary }: { summary: BalanceSummaryType }) {
  const cards = [
    { label: "Saldo keseluruhan", value: money(summary.total), icon: <Wallet size={18} />, tone: "bg-emerald-50 text-emerald-800" },
    { label: "Saldo tunai", value: money(summary.cash), icon: <Banknote size={18} />, tone: "bg-sky-50 text-sky-800" },
    { label: "Saldo bank / non-tunai", value: money(summary.bank), icon: <ArrowLeftRight size={18} />, tone: "bg-violet-50 text-violet-800" },
    { label: "Total kas masuk / keluar", value: `${money(summary.incoming)} / ${money(summary.outgoing)}`, icon: <ArrowUpRight size={18} />, tone: "bg-amber-50 text-amber-800", compact: true },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500">{card.label}</p>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>{card.icon}</span>
          </div>
          <p className={`mt-3 break-words font-black tracking-tight text-slate-900 ${card.compact ? "text-base sm:text-lg" : "text-xl sm:text-2xl"}`}>{card.value}</p>
        </article>
      ))}
    </section>
  );
}
