"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CalendarClock } from "lucide-react";
import type { Transaction } from "@/app/lib/bku/types";
import { dateLabel, money } from "@/app/lib/bku/formatters";
import { AppModal } from "@/app/components/layout/AppModal";

export function MoveTransactionsDialog({
  sourceDate,
  targetDate,
  transactions,
  initialTransactionIds = [],
  busy = false,
  onClose,
  onConfirm,
}: {
  sourceDate: string | null;
  targetDate: string | null;
  transactions: Transaction[];
  initialTransactionIds?: string[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (transactionIds: string[]) => void;
}) {
  const [selectionMode, setSelectionMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const available = useMemo(() => sourceDate ? transactions.filter((tx) => tx.transaction_date === sourceDate) : [], [transactions, sourceDate]);

  useEffect(() => {
    setSelectionMode(initialTransactionIds.length ? "selected" : "all");
    setSelectedIds(initialTransactionIds.length ? initialTransactionIds : []);
  }, [sourceDate, targetDate, initialTransactionIds.join("|"), available]);

  if (!sourceDate || !targetDate) return null;
  const idsToMove = selectionMode === "all" ? available.map((tx) => tx.id) : selectedIds;
  const total = available.filter((tx) => idsToMove.includes(tx.id)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  return (
    <AppModal title="Atur pemindahan nota" subtitle="Pilih apakah seluruh nota atau hanya nota tertentu yang dipindahkan." onClose={onClose} wide footer={
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{idsToMove.length} nota · {money(total)}</p><div className="flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="button" onClick={() => onConfirm(idsToMove)} disabled={busy || !idsToMove.length} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "Memindahkan…" : "Pindahkan nota"}</button></div></div>
    }>
      <div className="mb-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dari tanggal</p><p className="mt-1 text-sm font-black text-slate-800">{dateLabel(sourceDate)}</p></div>
        <ArrowRightLeft className="hidden text-emerald-600 sm:block" size={20} />
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ke tanggal</p><p className="mt-1 text-sm font-black text-emerald-800">{dateLabel(targetDate)}</p></div>
      </div>
      {available.length === 0 ? <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Tidak ada transaksi pada tanggal asal.</div> : (
        <div className="space-y-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selectionMode === "all" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="move-mode" checked={selectionMode === "all"} onChange={() => setSelectionMode("all")} className="mt-1 accent-emerald-700" />
            <span><strong className="block text-sm text-slate-800">Pindahkan semua nota</strong><span className="mt-0.5 block text-xs text-slate-500">Seluruh {available.length} nota pada tanggal asal dipindahkan bersama.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selectionMode === "selected" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="move-mode" checked={selectionMode === "selected"} onChange={() => setSelectionMode("selected")} className="mt-1 accent-emerald-700" />
            <span><strong className="block text-sm text-slate-800">Pilih nota yang dipindahkan</strong><span className="mt-0.5 block text-xs text-slate-500">Centang satu atau beberapa nota. Nota yang tidak dipilih tetap pada tanggal asal.</span></span>
          </label>
          {selectionMode === "selected" && <div className="max-h-[42vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">
            {available.map((tx) => <label key={tx.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
              <input type="checkbox" checked={selectedIds.includes(tx.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, tx.id] : current.filter((id) => id !== tx.id))} className="mt-1 accent-emerald-700" />
              <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-slate-800">{tx.description || "Transaksi tanpa uraian"}</strong><span className="mt-0.5 block text-[11px] text-slate-500">{tx.receipt_number ? `Nota ${tx.receipt_number} · ` : ""}{tx.transaction_type === "OUT" ? "Kas keluar" : tx.transaction_type === "IN" ? "Kas masuk" : "Transfer"}</span>{tx.details?.length ? <span className="mt-1 block text-[10px] text-slate-400">{tx.details.slice(0, 3).map((line) => line.name).join(" · ")}{tx.details.length > 3 ? ` +${tx.details.length - 3} lainnya` : ""}</span> : null}</span>
              <strong className="shrink-0 text-xs text-slate-700">{money(Number(tx.amount))}</strong>
            </label>)}
          </div>}
          <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><CalendarClock className="mt-0.5 shrink-0" size={14} />Tanggal dan nomor urut transaksi akan diperbarui. ID transaksi, rincian material, dan bukti nota tetap dipertahankan. Saldo dihitung ulang berdasarkan tanggal baru.</p>
        </div>
      )}
    </AppModal>
  );
}
