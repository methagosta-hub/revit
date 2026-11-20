import type { BalanceAtTransaction, Transaction } from "@/app/lib/bku/types";
import { EmptyState } from "@/app/components/layout/EmptyState";
import { TransactionCard } from "./TransactionCard";
import { ReceiptText } from "lucide-react";

export function TransactionList({
  transactions,
  balances,
  onEdit,
  onCopy,
  onExport,
  onDelete,
  onEvidence,
}: {
  transactions: Transaction[];
  balances: Record<string, BalanceAtTransaction>;
  onEdit: (transaction: Transaction) => void;
  onCopy: (transaction: Transaction) => void;
  onExport: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onEvidence: (path: string) => void;
}) {
  if (!transactions.length) return <EmptyState icon={<ReceiptText size={22} />} title="Belum ada transaksi" description="Nota yang dicatat pada tanggal ini akan muncul di sini." />;
  return <div className="space-y-3">{transactions.map((tx) => <TransactionCard key={tx.id} tx={tx} balance={balances[tx.id]} onEdit={onEdit} onCopy={onCopy} onExport={onExport} onDelete={onDelete} onEvidence={onEvidence} />)}</div>;
}
