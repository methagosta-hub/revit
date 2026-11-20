"use client";

import type { BalanceAtTransaction, Transaction } from "@/app/lib/bku/types";
import { categoryLabel, dateLabel, money } from "@/app/lib/bku/formatters";
import { EmptyState } from "@/app/components/layout/EmptyState";
import { BookOpen } from "lucide-react";

export function TransactionLedger({
  transactions,
  balances,
  onEdit,
  onCopy,
  onExport,
  onDelete,
}: {
  transactions: Transaction[];
  balances: Record<string, BalanceAtTransaction>;
  onEdit: (transaction: Transaction) => void;
  onCopy: (transaction: Transaction) => void;
  onExport: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5"><div><h3 className="font-black text-slate-900">Buku transaksi</h3><p className="mt-1 text-xs text-slate-500">Daftar seluruh nota, tanggal, metode pembayaran, dan saldo berjalan.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{transactions.length} transaksi</span></div>
      {!transactions.length ? <div className="p-4"><EmptyState icon={<BookOpen size={22} />} title="Belum ada transaksi" description="Catatan kas masuk, pengeluaran, dan transfer akan tercantum di sini." /></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Nomor / uraian</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Metode</th><th className="px-4 py-3 text-right">Kas masuk</th><th className="px-4 py-3 text-right">Kas keluar</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Tindakan</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((tx) => <tr key={tx.id} className="align-top transition hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{dateLabel(tx.transaction_date, { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td className="max-w-[320px] px-4 py-3"><p className="break-words font-semibold text-slate-800">{tx.description}</p><p className="mt-1 text-[10px] text-slate-400">{tx.receipt_number ? `Nota ${tx.receipt_number}` : `Nomor urut #${tx.entry_no}`}</p>{tx.store_name ? <p className="mt-1 text-[10px] font-semibold text-slate-500">Toko: {tx.store_name}</p> : null}{tx.details?.length ? <p className="mt-1 text-[10px] text-slate-400">{tx.details.map((line) => line.name).join(" · ")}</p> : null}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{categoryLabel(tx.category)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{tx.transaction_type === "TRANSFER" ? `${tx.from_account} → ${tx.to_account}` : tx.account === "BANK" ? "Bank" : "Tunai"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold text-emerald-700">{tx.transaction_type === "IN" ? money(Number(tx.amount)) : "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold text-rose-700">{tx.transaction_type === "OUT" ? money(Number(tx.amount)) : "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-black text-slate-800">{money(balances[tx.id]?.total || 0)}</td>
              <td className="whitespace-nowrap px-4 py-3"><div className="flex gap-1"><button type="button" onClick={() => onEdit(tx)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold">Ubah</button><button type="button" onClick={() => onCopy(tx)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold">Salin</button><button type="button" onClick={() => onExport(tx)} className="rounded-lg border border-emerald-100 px-2 py-1.5 text-[10px] font-semibold text-emerald-700">Ekspor</button><button type="button" onClick={() => onDelete(tx)} className="rounded-lg border border-rose-100 px-2 py-1.5 text-[10px] font-semibold text-rose-700">Hapus</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  );
}
