import type { BalanceAtTransaction, BalanceSummary, Book, Transaction } from "./types";
import { isInMonth } from "./formatters";

export function sortTransactions(transactions: Transaction[]) {
  return [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date) ||
    a.entry_no - b.entry_no ||
    a.created_at.localeCompare(b.created_at),
  );
}

export function calculateBalances(book: Pick<Book, "opening_cash" | "opening_bank"> | null, transactions: Transaction[]): BalanceSummary {
  let cash = Number(book?.opening_cash || 0);
  let bank = Number(book?.opening_bank || 0);
  let incoming = 0;
  let outgoing = 0;
  const rows: Record<string, BalanceAtTransaction> = {};

  for (const tx of sortTransactions(transactions)) {
    const amount = Number(tx.amount || 0);
    if (tx.transaction_type === "IN") {
      incoming += amount;
      if (tx.account === "BANK") bank += amount;
      else cash += amount;
    } else if (tx.transaction_type === "OUT") {
      outgoing += amount;
      if (tx.account === "BANK") bank -= amount;
      else cash -= amount;
    } else {
      if (tx.from_account === "BANK") bank -= amount;
      else cash -= amount;
      if (tx.to_account === "BANK") bank += amount;
      else cash += amount;
    }
    rows[tx.id] = { cash, bank, total: cash + bank };
  }

  return { cash, bank, total: cash + bank, incoming, outgoing, rows };
}

export function buildDaySummaries(transactions: Transaction[], month: Date) {
  const result: Record<string, { incoming: number; outgoing: number; count: number }> = {};
  for (const tx of transactions) {
    if (!isInMonth(tx.transaction_date, month)) continue;
    const current = result[tx.transaction_date] || { incoming: 0, outgoing: 0, count: 0 };
    if (tx.transaction_type === "IN") current.incoming += Number(tx.amount);
    if (tx.transaction_type === "OUT") current.outgoing += Number(tx.amount);
    current.count += 1;
    result[tx.transaction_date] = current;
  }
  return result;
}

export function balanceBeforeDate(book: Pick<Book, "opening_cash" | "opening_bank">, transactions: Transaction[], date: string) {
  const before = sortTransactions(transactions).filter((tx) => tx.transaction_date < date);
  const balance = calculateBalances(book, before);
  return { cash: balance.cash, bank: balance.bank, total: balance.total };
}
