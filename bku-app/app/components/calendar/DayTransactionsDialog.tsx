"use client";

import { CalendarDays, Plus } from "lucide-react";
import type { BalanceAtTransaction, Transaction } from "@/app/lib/bku/types";
import { dateLabel } from "@/app/lib/bku/formatters";
import { AppModal } from "@/app/components/layout/AppModal";
import { EmptyState } from "@/app/components/layout/EmptyState";
import { TransactionList } from "@/app/components/transactions/TransactionList";

export function DayTransactionsDialog({
  date,
  transactions,
  balances,
  onClose,
  onAdd,
  onEdit,
  onCopy,
  onDelete,
  onEvidence,
}: {
  date: string | null;
  transactions: Transaction[];
  balances: Record<string, BalanceAtTransaction>;
  onClose: () => void;
  onAdd: (date: string) => void;
  onEdit: (transaction: Transaction) => void;
  onCopy: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onEvidence: (path: string) => void;
}) {
  if (!date) return null;
  return (
    <AppModal
      title="Rincian transaksi harian"
      subtitle={dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      onClose={onClose}
      wide
      footer={<div className="flex justify-between gap-2"><span className="self-center text-xs text-slate-500">{transactions.length} nota / transaksi</span><button type="button" onClick={() => onAdd(date)} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Plus size={15} />Tambah nota pada tanggal ini</button></div>}
    >
      {transactions.length ? (
        <TransactionList transactions={transactions} balances={balances} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} onEvidence={onEvidence} />
      ) : (
        <EmptyState icon={<CalendarDays size={22} />} title="Belum ada nota pada tanggal ini" description="Tambahkan nota baru untuk mencatat kas masuk, pengeluaran, atau transfer." action={<button type="button" onClick={() => onAdd(date)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white">Catat nota</button>} />
      )}
    </AppModal>
  );
}
