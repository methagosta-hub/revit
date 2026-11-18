"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarDays,
  ChevronLeft, ChevronRight, FileUp, LockKeyhole, LogOut, Plus,
  RefreshCw, ShieldCheck, Wallet, X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getBkuSupabase } from "@/lib/supabase";

type Account = "CASH" | "BANK";
type TxType = "IN" | "OUT" | "TRANSFER";
type Book = {
  id: string;
  name: string;
  start_date: string;
  opening_cash: number;
  opening_bank: number;
};
type Transaction = {
  id: string;
  book_id: string;
  transaction_date: string;
  created_at: string;
  transaction_type: TxType;
  category: string;
  description: string;
  amount: number;
  account: Account | null;
  from_account: Account | null;
  to_account: Account | null;
  receipt_number: string | null;
  evidence_path: string | null;
};
type Draft = {
  transaction_type: TxType;
  category: string;
  description: string;
  amount: string;
  account: Account;
  from_account: Account;
  to_account: Account;
  receipt_number: string;
  file: File | null;
};

const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value || 0);
const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");
const amountValue = (value: string) => Number(value.replace(/[^0-9]/g, ""));
const blankDraft = (): Draft => ({
  transaction_type: "OUT", category: "material", description: "",
  amount: "", account: "CASH", from_account: "CASH", to_account: "BANK",
  receipt_number: "", file: null,
});
const expenseCategories = [
  ["material", "Pembelian material"],
  ["upah", "Gaji / upah pekerja"],
  ["operasional", "Operasional proyek"],
  ["transportasi", "Transportasi"],
  ["konsumsi", "Konsumsi"],
  ["lainnya", "Pengeluaran lainnya"],
];
const incomeCategories = [
  ["modal", "Modal / dana proyek"],
  ["termin", "Penerimaan termin"],
  ["pengembalian", "Pengembalian dana"],
  ["lainnya", "Pemasukan lainnya"],
];
const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50";

function categoryLabel(value: string) {
  const options = [...expenseCategories, ...incomeCategories, ["transfer", "Pemindahan saldo"]];
  return options.find(([key]) => key === value)?.[1] || value;
}
function shortMoney(value: number) {
  if (value >= 1000000) return "Rp" + (value / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  if (value >= 1000) return "Rp" + (value / 1000).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb";
  return "Rp" + value.toLocaleString("id-ID");
}
function isInMonth(value: string, month: Date) {
  const date = new Date(value + "T00:00:00");
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

export default function BkuPage() {
  const supabase = useMemo(() => getBkuSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [showNewBook, setShowNewBook] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [bookName, setBookName] = useState("");
  const [startDate, setStartDate] = useState(() => dateKey(new Date()));
  const [openingCash, setOpeningCash] = useState("0");
  const [openingBank, setOpeningBank] = useState("0");
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"calendar" | "ledger">("calendar");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setLoading(true);
    setPageError("");
    const { data, error } = await supabase
      .from("bku_books")
      .select("id,name,start_date,opening_cash,opening_bank")
      .order("created_at", { ascending: false });
    if (error) setPageError(error.message);
    const nextBooks = (data || []) as Book[];
    setBooks(nextBooks);
    setBook((current) => nextBooks.find((item) => item.id === current?.id) || nextBooks[0] || null);
    setLoading(false);
  }, [supabase, session?.user]);

  const loadTransactions = useCallback(async (bookId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("bku_transactions")
      .select("id,book_id,transaction_date,created_at,transaction_type,category,description,amount,account,from_account,to_account,receipt_number,evidence_path")
      .eq("book_id", bookId)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) setPageError(error.message);
    setTransactions((data || []) as Transaction[]);
  }, [supabase]);

  useEffect(() => { void loadBooks(); }, [loadBooks]);
  useEffect(() => {
    if (book?.id) void loadTransactions(book.id);
    else setTransactions([]);
  }, [book?.id, loadTransactions]);

  const ordered = useMemo(() => [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date) ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  ), [transactions]);

  const balances = useMemo(() => {
    let cash = Number(book?.opening_cash || 0);
    let bank = Number(book?.opening_bank || 0);
    let incoming = 0;
    let outgoing = 0;
    const rows: Record<string, { cash: number; bank: number; total: number }> = {};
    for (const tx of ordered) {
      const value = Number(tx.amount || 0);
      if (tx.transaction_type === "IN") {
        incoming += value;
        if (tx.account === "BANK") bank += value;
        else cash += value;
      } else if (tx.transaction_type === "OUT") {
        outgoing += value;
        if (tx.account === "BANK") bank -= value;
        else cash -= value;
      } else {
        if (tx.from_account === "BANK") bank -= value;
        else cash -= value;
        if (tx.to_account === "BANK") bank += value;
        else cash += value;
      }
      rows[tx.id] = { cash, bank, total: cash + bank };
    }
    return { cash, bank, total: cash + bank, incoming, outgoing, rows };
  }, [book, ordered]);

  const monthRows = useMemo(() => ordered.filter((tx) => isInMonth(tx.transaction_date, month)), [ordered, month]);
  const dayTotals = useMemo(() => {
    const result: Record<string, { incoming: number; outgoing: number; count: number }> = {};
    for (const tx of monthRows) {
      const current = result[tx.transaction_date] || { incoming: 0, outgoing: 0, count: 0 };
      if (tx.transaction_type === "IN") current.incoming += Number(tx.amount);
      if (tx.transaction_type === "OUT") current.outgoing += Number(tx.amount);
      current.count += 1;
      result[tx.transaction_date] = current;
    }
    return result;
  }, [monthRows]);
  const selectedRows = ordered.filter((tx) => tx.transaction_date === selectedDate);
  const lastSelectedBalance = selectedRows.length ? balances.rows[selectedRows[selectedRows.length - 1].id] : null;

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (authMode === "register" && !result.data.session) {
        setAuthError("Pendaftaran diterima. Periksa email untuk konfirmasi sebelum masuk.");
      }
      setSession(result.data.session);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Autentikasi gagal.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setBooks([]);
    setBook(null);
    setTransactions([]);
  }

  async function createBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user || !bookName.trim()) return;
    setSaving(true);
    setPageError("");
    const { data, error } = await supabase.from("bku_books").insert({
      name: bookName.trim(),
      start_date: startDate,
      opening_cash: amountValue(openingCash),
      opening_bank: amountValue(openingBank),
      created_by: session.user.id,
    }).select("id,name,start_date,opening_cash,opening_bank").single();
    setSaving(false);
    if (error) {
      setPageError(error.message);
      return;
    }
    const created = data as Book;
    setBooks((current) => [created, ...current]);
    setBook(created);
    setTransactions([]);
    setShowNewBook(false);
    setBookName("");
    setOpeningCash("0");
    setOpeningBank("0");
  }

  async function saveEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !book || !session?.user) return;
    const valid = drafts.filter((draft) => draft.description.trim() && amountValue(draft.amount) > 0);
    if (!valid.length) {
      setPageError("Isi minimal satu uraian dan nominal transaksi.");
      return;
    }
    if (valid.some((draft) => draft.transaction_type === "TRANSFER" && draft.from_account === draft.to_account)) {
      setPageError("Rekening asal dan tujuan transfer harus berbeda.");
      return;
    }
    setSaving(true);
    setPageError("");
    try {
      const records = [];
      for (const draft of valid) {
        let evidencePath: string | null = null;
        if (draft.file) {
          const safeName = draft.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const path = session.user.id + "/" + book.id + "/" + Date.now() + "-" + safeName;
          const { error: uploadError } = await supabase.storage.from("bku-evidence").upload(path, draft.file, {
            cacheControl: "3600", upsert: false,
          });
          if (uploadError) throw uploadError;
          evidencePath = path;
        }
        records.push({
          book_id: book.id,
          transaction_date: selectedDate,
          transaction_type: draft.transaction_type,
          category: draft.category,
          description: draft.description.trim(),
          amount: amountValue(draft.amount),
          account: draft.transaction_type === "TRANSFER" ? null : draft.account,
          from_account: draft.transaction_type === "TRANSFER" ? draft.from_account : null,
          to_account: draft.transaction_type === "TRANSFER" ? draft.to_account : null,
          receipt_number: draft.receipt_number.trim() || null,
          evidence_path: evidencePath,
          created_by: session.user.id,
        });
      }
      const { error } = await supabase.from("bku_transactions").insert(records);
      if (error) throw error;
      setDrafts([blankDraft()]);
      setShowEntry(false);
      await loadTransactions(book.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Transaksi tidak berhasil disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function openEvidence(path: string) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("bku-evidence").createSignedUrl(path, 60);
    if (error) {
      setPageError(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function updateDraft(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  }

  if (!supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck size={28} /></div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">BKU Eksternal</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Database mandiri belum dihubungkan</h1>
          <p className="mt-3 leading-7 text-slate-600">Aplikasi BKU dipisahkan dari database Dahlia. Hubungkan ke proyek Supabase BKU tersendiri dengan environment variables berikut:</p>
          <div className="mt-5 space-y-2 rounded-xl bg-slate-950 p-4 font-mono text-sm text-emerald-300">
            <p>NEXT_PUBLIC_BKU_SUPABASE_URL</p>
            <p>NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY</p>
          </div>
          <p className="mt-4 text-sm text-slate-500">Gunakan URL dan anon/publishable key dari proyek Supabase BKU baru, bukan dari proyek utama Dahlia. Jalankan juga database/setup.sql pada proyek BKU tersebut.</p>
        </section>
      </main>
    );
  }

  if (authLoading && !session) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500"><RefreshCw className="mr-2 animate-spin" />Memeriksa akun BKU…</div>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,#d6f5e9,transparent_35%),linear-gradient(135deg,#f4f8f7,#eef2f8)] p-5">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[30px] bg-white shadow-2xl shadow-slate-300/60 md:grid-cols-[1fr_420px]">
          <div className="hidden flex-col justify-between bg-[#0d2b2a] p-10 text-white md:flex">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-300 text-emerald-950"><Wallet size={30} /></div>
              <p className="mt-8 text-xs font-bold uppercase tracking-[.24em] text-emerald-300">Dahlia · aplikasi mandiri</p>
              <h1 className="mt-3 text-4xl font-black leading-tight">Buku Kas Umum<br />Proyek Eksternal</h1>
              <p className="mt-5 max-w-sm leading-7 text-emerald-50/75">Catat kas masuk, kas keluar, dan saldo setiap transaksi dalam satu pembukuan yang tertib.</p>
            </div>
            <div className="text-sm text-emerald-100/60">Database dan akun terpisah dari Dahlia Management System.</div>
          </div>
          <div className="p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">BKU Eksternal</p>
            <h2 className="mt-3 text-2xl font-black text-slate-900">{authMode === "login" ? "Masuk ke akun BKU" : "Daftar akun BKU"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan akun khusus BKU, bukan akun Dahlia.</p>
            <form onSubmit={handleAuth} className="mt-7 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="nama@email.com" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Kata sandi
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} placeholder="Minimal 8 karakter" />
              </label>
              {authError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{authError}</p>}
              <button disabled={authLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">
                {authLoading ? <RefreshCw className="animate-spin" size={17} /> : <LockKeyhole size={17} />}
                {authMode === "login" ? "Masuk" : "Daftar akun"}
              </button>
            </form>
            <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }} className="mt-5 w-full text-sm font-semibold text-emerald-800 hover:underline">
              {authMode === "login" ? "Belum punya akun? Daftar akun BKU" : "Sudah punya akun? Kembali masuk"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white"><Wallet size={22} /></div>
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Dahlia · BKU mandiri</p><h1 className="text-xl font-black">Buku Kas Umum</h1></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{session.user.email}</span>
            <button onClick={signOut} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><LogOut size={16} />Keluar</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        {pageError && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span>{pageError}</span><button onClick={() => setPageError("")} aria-label="Tutup pesan"><X size={17} /></button></div>}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm text-slate-500">Pembukuan proyek eksternal</p><h2 className="mt-1 text-2xl font-black">{book?.name || "Belum ada buku kas"}</h2></div>
          <div className="flex flex-wrap gap-2">
            {books.length > 0 && <select value={book?.id || ""} onChange={(e) => setBook(books.find((item) => item.id === e.target.value) || null)} className="h-11 max-w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="">Pilih buku kas</option>{books.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            <button onClick={() => setShowNewBook(true)} className="flex h-11 items-center gap-2 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50"><Plus size={17} />Buku kas baru</button>
            {book && <button onClick={() => { setDrafts([blankDraft()]); setShowEntry(true); }} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"><Plus size={17} />Catat transaksi</button>}
          </div>
        </div>

        {!book ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CalendarDays size={30} /></div>
            <h3 className="mt-4 text-xl font-bold">Mulai buku kas pertama</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Buat buku kas dengan nama proyek dan saldo awal tunai serta rekening bank.</p>
            <button onClick={() => setShowNewBook(true)} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">Buat buku kas</button>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Saldo keseluruhan" value={money(balances.total)} icon={<Wallet size={18} />} color="green" />
              <StatCard label="Saldo tunai" value={money(balances.cash)} icon={<Banknote size={18} />} color="blue" />
              <StatCard label="Saldo bank / non-tunai" value={money(balances.bank)} icon={<ArrowLeftRight size={18} />} color="violet" />
              <StatCard label="Total kas masuk / keluar" value={money(balances.incoming) + " / " + money(balances.outgoing)} icon={<ArrowUpRight size={18} />} color="amber" compact />
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-xl bg-slate-200/70 p-1">
                <button onClick={() => setTab("calendar")} className={"rounded-lg px-4 py-2 text-sm font-bold " + (tab === "calendar" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600")}>Kalender</button>
                <button onClick={() => setTab("ledger")} className={"rounded-lg px-4 py-2 text-sm font-bold " + (tab === "ledger" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600")}>Buku transaksi</button>
              </div>
              <p className="text-xs text-slate-500">Satu baris untuk setiap nota / transaksi sebenarnya.</p>
            </div>

            {tab === "calendar" ? (
              <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kalender pembukuan</p><h3 className="mt-1 text-xl font-black capitalize">{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(month)}</h3></div>
                    <div className="flex gap-1">
                      <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Bulan sebelumnya"><ChevronLeft size={18} /></button>
                      <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Bulan berikutnya"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map((day) => <div key={day} className="py-2 text-center text-xs font-bold text-slate-400">{day}</div>)}
                    {calendarCells.map((day, index) => {
                      if (!day) return <div key={"blank-" + index} className="min-h-[88px] rounded-xl bg-slate-50/60 sm:min-h-[110px]" />;
                      const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
                      const totals = dayTotals[key];
                      const active = key === selectedDate;
                      return (
                        <button key={key} onClick={() => setSelectedDate(key)} className={"min-h-[88px] rounded-xl border p-1.5 text-left transition sm:min-h-[110px] sm:p-2 " + (active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-slate-50")}>
                          <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold " + (active ? "bg-emerald-700 text-white" : "text-slate-700")}>{day}</span>
                          {totals ? <div className="mt-2 space-y-1">
                            {totals.incoming > 0 && <p className="truncate rounded-md bg-emerald-50 px-1 py-0.5 text-[9px] font-bold text-emerald-800 sm:text-[10px]">+{shortMoney(totals.incoming)}</p>}
                            {totals.outgoing > 0 && <p className="truncate rounded-md bg-rose-50 px-1 py-0.5 text-[9px] font-bold text-rose-800 sm:text-[10px]">-{shortMoney(totals.outgoing)}</p>}
                            <p className="text-[9px] text-slate-400">{totals.count} transaksi</p>
                          </div> : <span className="mt-2 block text-[10px] text-slate-300">+ Catat</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Kas masuk</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Kas keluar</span></div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Transaksi tanggal</p><h3 className="mt-1 text-lg font-black">{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(selectedDate + "T00:00:00"))}</h3></div>
                    <button onClick={() => { setDrafts([blankDraft()]); setShowEntry(true); }} className="flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white"><Plus size={14} />Tambah</button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {selectedRows.length === 0 ? <div className="rounded-xl bg-slate-50 p-6 text-center"><CalendarDays className="mx-auto text-slate-300" size={26} /><p className="mt-2 text-sm font-semibold text-slate-600">Belum ada transaksi</p><p className="mt-1 text-xs text-slate-400">Tambah beberapa nota sekaligus untuk tanggal ini.</p></div> : selectedRows.map((tx) => <TransactionCard key={tx.id} tx={tx} balance={balances.rows[tx.id]} onEvidence={openEvidence} />)}
                  </div>
                  {lastSelectedBalance && <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-400">Saldo setelah transaksi terakhir hari ini</p><p className="mt-1 text-xl font-black">{money(lastSelectedBalance.total)}</p><p className="mt-1 text-xs text-slate-400">Tunai {money(lastSelectedBalance.cash)} · Bank {money(lastSelectedBalance.bank)}</p></div>}
                </div>
              </section>
            ) : (
              <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="font-black">Buku transaksi</h3><p className="text-xs text-slate-500">Urut berdasarkan tanggal dan waktu pencatatan</p></div><span className="text-xs font-semibold text-slate-500">{ordered.length} transaksi</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Uraian</th><th className="px-4 py-3">Metode</th><th className="px-4 py-3 text-right">Kas masuk</th><th className="px-4 py-3 text-right">Kas keluar</th><th className="px-4 py-3 text-right">Saldo akhir</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ordered.map((tx) => {
                        const balance = balances.rows[tx.id];
                        return <tr key={tx.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Intl.DateTimeFormat("id-ID").format(new Date(tx.transaction_date + "T00:00:00"))}</td>
                          <td className="px-4 py-3"><p className="font-semibold text-slate-800">{tx.description}</p><p className="text-xs text-slate-400">{categoryLabel(tx.category)}{tx.receipt_number ? " · Nota " + tx.receipt_number : ""}</p></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{tx.transaction_type === "TRANSFER" ? "Transfer " + tx.from_account + " → " + tx.to_account : tx.account === "BANK" ? "Bank" : "Tunai"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{tx.transaction_type === "IN" ? money(Number(tx.amount)) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-rose-700">{tx.transaction_type === "OUT" ? money(Number(tx.amount)) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{money(balance?.total || 0)}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <span className="font-black">!</span>
          <p>Pengingat nota Rp2.000.000 ditampilkan saat input melebihi batas. Nilai transaksi tetap dicatat sesuai nominal dan bukti yang sebenarnya; sistem tidak memecah satu pembelian menjadi nota semu.</p>
        </div>
      </div>

      {showNewBook && <Modal title="Buat buku kas baru" onClose={() => setShowNewBook(false)}>
        <form onSubmit={createBook} className="space-y-4">
          <Field label="Nama proyek / buku kas"><input required autoFocus value={bookName} onChange={(e) => setBookName(e.target.value)} placeholder="Contoh: Renovasi Rumah" className={fieldClass} /></Field>
          <Field label="Tanggal mulai pembukuan"><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Saldo awal tunai (Rp)"><input inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className={fieldClass} /></Field>
            <Field label="Saldo awal bank (Rp)"><input inputMode="numeric" value={openingBank} onChange={(e) => setOpeningBank(e.target.value)} className={fieldClass} /></Field>
          </div>
          <ModalActions busy={saving} onCancel={() => setShowNewBook(false)} submitLabel="Buat buku kas" />
        </form>
      </Modal>}

      {showEntry && book && <Modal title="Catat transaksi harian" subtitle={new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(selectedDate + "T00:00:00"))} onClose={() => setShowEntry(false)} wide>
        <form onSubmit={saveEntries} className="space-y-4">
          {drafts.map((draft, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-black text-slate-800">Nota / transaksi {index + 1}</p>{drafts.length > 1 && <button type="button" onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} className="text-xs font-semibold text-rose-600">Hapus baris</button>}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Jenis transaksi"><select value={draft.transaction_type} onChange={(e) => updateDraft(index, { transaction_type: e.target.value as TxType, category: e.target.value === "IN" ? "modal" : e.target.value === "TRANSFER" ? "transfer" : "material" })} className={fieldClass}><option value="OUT">Kas keluar</option><option value="IN">Kas masuk</option><option value="TRANSFER">Transfer tunai ↔ bank</option></select></Field>
              <Field label="Kategori"><select value={draft.category} onChange={(e) => updateDraft(index, { category: e.target.value })} className={fieldClass}>{(draft.transaction_type === "IN" ? incomeCategories : draft.transaction_type === "OUT" ? expenseCategories : [["transfer", "Pemindahan saldo"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Nominal (Rp)"><input required inputMode="numeric" value={draft.amount} onChange={(e) => updateDraft(index, { amount: e.target.value })} placeholder="0" className={fieldClass} />{amountValue(draft.amount) > 2000000 && <span className="mt-1 block text-[11px] font-semibold text-amber-700">Periksa nominal dan nota sebenarnya (di atas Rp2 juta).</span>}</Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Uraian transaksi"><input required value={draft.description} onChange={(e) => updateDraft(index, { description: e.target.value })} placeholder="Contoh: Pembelian semen 20 sak" className={fieldClass} /></Field>
              <Field label="Nomor nota / referensi"><input value={draft.receipt_number} onChange={(e) => updateDraft(index, { receipt_number: e.target.value })} placeholder="Opsional" className={fieldClass} /></Field>
            </div>
            {draft.transaction_type === "TRANSFER" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Dari rekening"><select value={draft.from_account} onChange={(e) => updateDraft(index, { from_account: e.target.value as Account })} className={fieldClass}><option value="CASH">Tunai</option><option value="BANK">Bank</option></select></Field>
              <Field label="Ke rekening"><select value={draft.to_account} onChange={(e) => updateDraft(index, { to_account: e.target.value as Account })} className={fieldClass}><option value="BANK">Bank</option><option value="CASH">Tunai</option></select></Field>
            </div> : <div className="mt-3 max-w-sm"><Field label="Sumber / metode pembayaran"><select value={draft.account} onChange={(e) => updateDraft(index, { account: e.target.value as Account })} className={fieldClass}><option value="CASH">Tunai</option><option value="BANK">Non-tunai / rekening bank</option></select></Field></div>}
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-600">
              <FileUp size={17} className="text-emerald-700" />{draft.file ? draft.file.name : "Lampirkan foto nota / bukti transfer (opsional)"}
              <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => updateDraft(index, { file: e.target.files?.[0] || null })} />
            </label>
          </div>)}
          <button type="button" onClick={() => setDrafts((current) => [...current, blankDraft()])} className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-400 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50"><Plus size={17} />Tambah nota / transaksi lain</button>
          <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Semua baris disimpan sebagai transaksi terpisah pada tanggal yang sama. Saldo berjalan dihitung otomatis mengikuti urutan tanggal dan waktu pencatatan.</div>
          <ModalActions busy={saving} onCancel={() => setShowEntry(false)} submitLabel="Simpan semua transaksi" />
        </form>
      </Modal>}
      {loading && <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xl"><RefreshCw className="animate-spin" size={14} />Memuat pembukuan…</div>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-slate-600">{label}{children}</label>;
}
function Modal({ title, subtitle, onClose, wide, children }: { title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={"max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6 " + (wide ? "max-w-3xl" : "max-w-xl")}>
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}
function ModalActions({ busy, onCancel, submitLabel }: { busy: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button><button disabled={busy} type="submit" className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Menyimpan..." : submitLabel}</button></div>;
}
function StatCard({ label, value, icon, color, compact }: { label: string; value: string; icon: ReactNode; color: string; compact?: boolean }) {
  const colors: Record<string, string> = { green: "bg-emerald-50 text-emerald-800", blue: "bg-sky-50 text-sky-800", violet: "bg-violet-50 text-violet-800", amber: "bg-amber-50 text-amber-800" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{label}</p><span className={"flex h-9 w-9 items-center justify-center rounded-xl " + colors[color]}>{icon}</span></div><p className={"mt-3 font-black tracking-tight text-slate-900 " + (compact ? "text-base sm:text-lg" : "text-xl sm:text-2xl")}>{value}</p></div>;
}
function TransactionCard({ tx, balance, onEvidence }: { tx: Transaction; balance?: { cash: number; bank: number; total: number }; onEvidence: (path: string) => void }) {
  const incoming = tx.transaction_type === "IN";
  const transfer = tx.transaction_type === "TRANSFER";
  return <article className="rounded-xl border border-slate-100 p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + (transfer ? "bg-blue-50 text-blue-700" : incoming ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{transfer ? <ArrowLeftRight size={16} /> : incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
        <div className="min-w-0"><p className="break-words text-sm font-bold text-slate-800">{tx.description}</p><p className="mt-0.5 text-[11px] text-slate-400">{categoryLabel(tx.category)} · {transfer ? tx.from_account + " → " + tx.to_account : tx.account === "BANK" ? "Bank / non-tunai" : "Tunai"}</p>{tx.receipt_number && <p className="mt-1 text-[11px] text-slate-500">Nota: {tx.receipt_number}</p>}</div>
      </div>
      <div className="shrink-0 text-right"><p className={"text-sm font-black " + (transfer ? "text-blue-700" : incoming ? "text-emerald-700" : "text-rose-700")}>{incoming ? "+" : transfer ? "↔" : "-"}{money(Number(tx.amount))}</p>{balance && <p className="mt-1 text-[10px] text-slate-400">Saldo {money(balance.total)}</p>}</div>
    </div>
    {tx.evidence_path && <button onClick={() => onEvidence(tx.evidence_path as string)} className="mt-2 text-xs font-semibold text-emerald-700 hover:underline">Lihat bukti</button>}
  </article>;
}