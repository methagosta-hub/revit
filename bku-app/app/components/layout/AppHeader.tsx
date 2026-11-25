"use client";

import { Download, LogOut, Plus, Wallet } from "lucide-react";
import type { Book } from "@/app/lib/bku/types";

export function AppHeader({
  userEmail,
  books,
  selectedBookId,
  onSelectBook,
  onNewBook,
  onExport,
  onNewTransaction,
  onSignOut,
}: {
  userEmail?: string;
  books: Book[];
  selectedBookId: string;
  onSelectBook: (id: string) => void;
  onNewBook: () => void;
  onExport: () => void;
  onNewTransaction: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm"><Wallet size={21} /></div>
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">JAVAWASTHU MANAGEMENT</p><h1 className="text-lg font-black leading-tight text-slate-900">Buku Kas Umum</h1></div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {books.length > 0 && <select aria-label="Pilih buku kas" value={selectedBookId} onChange={(event) => onSelectBook(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 sm:max-w-[250px] sm:flex-none"><option value="">Pilih buku kas</option>{books.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <button type="button" onClick={onNewBook} className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-700 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"><Plus size={15} />Buku kas</button>
          <button type="button" onClick={onExport} disabled={!selectedBookId} className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Download size={15} />PDF</button>
          <button type="button" onClick={onNewTransaction} disabled={!selectedBookId} className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} />Catat nota</button>
          <div className="hidden h-8 w-px bg-slate-200 lg:block" />
          <div className="hidden max-w-[180px] truncate text-xs text-slate-500 xl:block">{userEmail || ""}</div>
          <button type="button" onClick={onSignOut} className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"><LogOut size={15} /><span className="sm:hidden lg:inline">Keluar</span></button>
        </div>
      </div>
    </header>
  );
}
