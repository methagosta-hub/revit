"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Copy, Eye, FolderOutput, Pencil, Trash2 } from "lucide-react";
import type { BalanceAtTransaction, ReportCategory, Transaction } from "@/app/lib/bku/types";
import { categoryLabel, money, numberFormat } from "@/app/lib/bku/formatters";

export function TransactionCard({
  tx,
  balance,
  onEvidence,
  onEdit,
  onCopy,
  onExport,
  onDelete,
  reportCategories,
}: {
  tx: Transaction;
  reportCategories: ReportCategory[];
  balance?: BalanceAtTransaction;
  onEvidence: (path: string) => void;
  onEdit: (transaction: Transaction) => void;
  onCopy: (transaction: Transaction) => void;
  onExport: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const incoming = tx.transaction_type === "IN";
  const transfer = tx.transaction_type === "TRANSFER";
  const Icon = transfer ? ArrowLeftRight : incoming ? ArrowDownLeft : ArrowUpRight;
  const amountTone = transfer ? "text-blue-700" : incoming ? "text-emerald-700" : "text-rose-700";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${transfer ? "bg-blue-50 text-blue-700" : incoming ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><Icon size={17} /></span>
          <div className="min-w-0">
            <p className="break-words text-sm font-black text-slate-800">{tx.description || "Transaksi tanpa uraian"}</p>
            <p className="mt-1 text-[10px] text-slate-400">{categoryLabel(tx.category, reportCategories, tx.transaction_type)} · {transfer ? `${tx.from_account === "BANK" ? "Bank" : "Tunai"} → ${tx.to_account === "BANK" ? "Bank" : "Tunai"}` : tx.account === "BANK" ? "Bank / non-tunai" : "Tunai"}</p>
            {tx.store_name && <p className="mt-1 text-[11px] font-semibold text-slate-600">Toko / pihak: {tx.store_name}</p>}
            {tx.receipt_number && <p className="mt-1 text-[11px] text-slate-500">Nomor nota: {tx.receipt_number}</p>}
            {tx.split_group_id && <p className="mt-1 inline-flex rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Kelompok: {tx.split_group_label || "Nota terpisah"} · Total kelompok {money(Number(tx.split_group_total || 0))}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right"><p className={`text-sm font-black ${amountTone}`}>{incoming ? "+" : transfer ? "↔ " : "−"}{money(Number(tx.amount))}</p>{balance && <p className="mt-1 text-[10px] text-slate-400">Saldo {money(balance.total)}</p>}</div>
      </div>
      {tx.details?.length ? <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Rincian material / barang</p>
        <div className="space-y-1.5">{tx.details.map((line, index) => <div key={`${tx.id}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-[10px] sm:text-xs"><span className="min-w-0 break-words text-slate-600">{line.name}<span className="ml-1 text-slate-400">{numberFormat(Number(line.volume))} {line.unit} × {money(Number(line.unit_price))}</span></span><strong className="whitespace-nowrap text-right text-slate-800">{money(Number(line.line_total ?? Number(line.unit_price) * Number(line.volume)))}</strong></div>)}</div>
      </div> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="mr-auto text-[10px] text-slate-400">Nomor urut #{tx.entry_no}</span>
        {tx.evidence_path && <button type="button" onClick={() => onEvidence(tx.evidence_path as string)} className="flex items-center gap-1 rounded-lg border border-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"><Eye size={13} />Bukti</button>}
        <button type="button" onClick={() => onEdit(tx)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} />Ubah</button>
        <button type="button" onClick={() => onCopy(tx)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Copy size={13} />Salin</button>
        <button type="button" onClick={() => onExport(tx)} className="flex items-center gap-1 rounded-lg border border-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"><FolderOutput size={13} />Ekspor</button>
        <button type="button" onClick={() => onDelete(tx)} className="flex items-center gap-1 rounded-lg border border-rose-100 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={13} />Hapus</button>
      </div>
    </article>
  );
}
