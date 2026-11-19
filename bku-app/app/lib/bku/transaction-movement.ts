import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction } from "./types";

export type MoveResult = { moved: number; targetDate: string };

/** Memindahkan satu atau beberapa transaksi tanpa mengubah isi/ID nota.
 * Nomor urut tujuan dimulai setelah entry_no terbesar pada tanggal tujuan.
 * Jika salah satu update gagal, aplikasi mencoba mengembalikan transaksi yang sudah dipindahkan.
 */
export async function moveTransactionsToDate(args: {
  supabase: SupabaseClient;
  bookId: string;
  transactions: Transaction[];
  transactionIds: string[];
  targetDate: string;
}): Promise<MoveResult> {
  const { supabase, bookId, transactions, transactionIds, targetDate } = args;
  const selected = transactions
    .filter((tx) => transactionIds.includes(tx.id) && tx.transaction_date !== targetDate)
    .sort((a, b) => a.entry_no - b.entry_no);

  if (!selected.length) return { moved: 0, targetDate };

  const { data: destinationRows, error: destinationError } = await supabase
    .from("bku_transactions")
    .select("entry_no")
    .eq("book_id", bookId)
    .eq("transaction_date", targetDate)
    .order("entry_no", { ascending: false })
    .limit(1);
  if (destinationError) throw destinationError;

  let nextEntryNo = Number(destinationRows?.[0]?.entry_no || 0) + 1;
  const moved: Transaction[] = [];

  try {
    for (const tx of selected) {
      const { error } = await supabase
        .from("bku_transactions")
        .update({ transaction_date: targetDate, entry_no: nextEntryNo })
        .eq("id", tx.id)
        .eq("book_id", bookId);
      if (error) throw error;
      moved.push(tx);
      nextEntryNo += 1;
    }
  } catch (error) {
    // Best-effort rollback agar tidak meninggalkan pemindahan parsial.
    for (const tx of [...moved].reverse()) {
      await supabase.from("bku_transactions")
        .update({ transaction_date: tx.transaction_date, entry_no: tx.entry_no })
        .eq("id", tx.id)
        .eq("book_id", bookId);
    }
    throw error;
  }

  return { moved: moved.length, targetDate };
}

export function calendarDateDelta(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function shiftDateByDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
