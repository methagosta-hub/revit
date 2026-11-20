"use client";

import { CalendarClock, FolderOutput, ReceiptText } from "lucide-react";
import type { Book, Transaction } from "@/app/lib/bku/types";
import { categoryLabel, dateLabel, fieldClass, money } from "@/app/lib/bku/formatters";
import { AppModal } from "@/app/components/layout/AppModal";
import { FormField } from "@/app/components/layout/FormField";

export function TransactionExportDialog({
  transaction,
  sourceBookName,
  destinationBooks,
  selectedBookId,
  targetDate,
  busy,
  onBookChange,
  onDateChange,
  onClose,
  onConfirm,
}: {
  transaction: Transaction | null;
  sourceBookName: string;
  destinationBooks: Book[];
  selectedBookId: string;
  targetDate: string;
  busy: boolean;
  onBookChange: (bookId: string) => void;
  onDateChange: (date: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const destination = destinationBooks.find((item) => item.id === selectedBookId);

  if (!transaction) return null;

  const typeLabel = transaction.transaction_type === "OUT"
    ? "Kas keluar"
    : transaction.transaction_type === "IN"
      ? "Kas masuk"
      : "Transfer";

  const dateInvalid = !destination || !targetDate || targetDate < destination.start_date;

  return (
    <AppModal
      title="Ekspor nota ke proyek lain"
      subtitle="Salin satu nota ke buku kas proyek tujuan dan tentukan tanggal pencatatannya."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-sm text-[10px] leading-5 text-slate-500">Nota asli di proyek asal tidak akan dihapus atau diubah.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-50">Batal</button>
            <button type="button" onClick={onConfirm} disabled={busy || dateInvalid} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <FolderOutput size={15} />{busy ? "Mengekspor…" : "Ekspor nota"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm"><ReceiptText size={19} /></span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold text-slate-900">{transaction.description || "Transaksi tanpa uraian"}</p>
              <p className="mt-1 text-[10px] text-slate-500">{typeLabel} · {categoryLabel(transaction.category)} · {dateLabel(transaction.transaction_date)}</p>
              {transaction.receipt_number && <p className="mt-1 text-[10px] font-semibold text-slate-600">Nomor nota: {transaction.receipt_number}</p>}
              {transaction.store_name && <p className="mt-1 text-[10px] text-slate-500">Toko / pihak: {transaction.store_name}</p>}
              {transaction.details?.length ? <p className="mt-1 text-[10px] text-slate-500">{transaction.details.length} rincian material / barang</p> : null}
            </div>
            <strong className="shrink-0 text-sm font-black tabular-nums text-slate-900">{money(Number(transaction.amount))}</strong>
          </div>
          <p className="mt-3 border-t border-slate-200 pt-3 text-[10px] text-slate-500">Proyek asal: <strong className="text-slate-700">{sourceBookName}</strong></p>
        </div>

        <FormField label="Pilih proyek tujuan">
          <select value={selectedBookId} onChange={(event) => onBookChange(event.target.value)} className={fieldClass} required>
            <option value="">Pilih buku kas proyek tujuan</option>
            {destinationBooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
          </select>
        </FormField>

        <FormField label="Tanggal pencatatan di proyek tujuan">
          <input
            type="date"
            value={targetDate}
            min={destination?.start_date}
            disabled={!destination || busy}
            onChange={(event) => onDateChange(event.target.value)}
            className={fieldClass}
            required
          />
        </FormField>

        {destination && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-emerald-700" />
            <p className="text-[10px] leading-5 text-emerald-900">Nota akan dicatat pada <strong>{destination.name}</strong>, tanggal <strong>{targetDate ? dateLabel(targetDate) : "belum dipilih"}</strong>. Nomor urut akan dibuat otomatis mengikuti transaksi lain pada tanggal tersebut.</p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 px-3 py-3 text-[10px] leading-5 text-slate-500">
          Rincian material, volume, harga satuan, total, nomor nota, dan bukti transaksi akan ikut disalin. Referensi master toko/material akan disesuaikan untuk proyek tujuan; data nota sumber tetap aman.
        </div>
      </div>
    </AppModal>
  );
}
