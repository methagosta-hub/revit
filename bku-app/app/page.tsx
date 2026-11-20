"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, LockKeyhole, Plus, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { getBkuSupabase } from "@/lib/supabase";
import type { AppView, Draft, ProfileInput, SignatoryRole, Transaction, WorkerAttendanceDraft } from "@/app/lib/bku/types";
import { amountValue, blankDetail, blankDraft, dateKey, dateLabel, detailLineTotal, fieldClass, isValidDateKey, money } from "@/app/lib/bku/formatters";
import { buildDaySummaries, calculateBalances, sortTransactions } from "@/app/lib/bku/balances";
import { calendarDateDelta } from "@/app/lib/bku/transaction-movement";
import { useBkuBooks } from "@/app/hooks/useBkuBooks";
import { useBkuTransactions } from "@/app/hooks/useBkuTransactions";
import { getMondayDate, useBkuPayroll } from "@/app/hooks/useBkuPayroll";
import { AppHeader } from "@/app/components/layout/AppHeader";
import { AppModal } from "@/app/components/layout/AppModal";
import { BalanceSummary } from "@/app/components/layout/BalanceSummary";
import { FormField } from "@/app/components/layout/FormField";
import { LoadingOverlay } from "@/app/components/layout/LoadingOverlay";
import { ToastNotice } from "@/app/components/layout/ToastNotice";
import { CalendarView } from "@/app/components/calendar/CalendarView";
import { DayTransactionsDialog } from "@/app/components/calendar/DayTransactionsDialog";
import { MoveTransactionsDialog } from "@/app/components/calendar/MoveTransactionsDialog";
import { TransactionFormModal } from "@/app/components/transactions/TransactionFormModal";
import { TransactionLedger } from "@/app/components/transactions/TransactionLedger";
import { WorkerPayrollView } from "@/app/components/workers/WorkerPayrollView";
import { StoreMasterView } from "@/app/components/stores/StoreMasterView";
import { ExportPdfModal } from "@/app/components/reports/ExportPdfModal";
import { openBkuPdfReport } from "@/app/components/reports/pdfReport";

function transactionToDraft(tx: Transaction): Draft {
  const details = tx.details || [];
  return {
    transaction_type: tx.transaction_type,
    category: tx.category,
    description: tx.description,
    amount: String(tx.amount),
    account: tx.account || "CASH",
    from_account: tx.from_account || "CASH",
    to_account: tx.to_account || "BANK",
    receipt_number: tx.receipt_number || "",
    file: null,
    store_id: tx.store_id || "",
    store_name: tx.store_name || "",
    split_group_id: tx.split_group_id || undefined,
    split_group_label: tx.split_group_label || undefined,
    split_group_total: tx.split_group_total || undefined,
    details: details.length ? details.map((line) => ({
      material_id: line.material_id || "",
      name: line.name,
      unit_price: String(line.unit_price),
      volume: String(line.volume),
      unit: line.unit || "pcs",
    })) : [blankDetail()],
  };
}

type ToastState = { message: string; tone: "success" | "error" | "info" } | null;
type MoveRequest = { sourceDate: string; targetDate: string; initialTransactionIds: string[] };

export default function BkuPage() {
  const supabase = useMemo(() => getBkuSupabase(), []);
  const booksApi = useBkuBooks(supabase);
  const transactionsApi = useBkuTransactions(supabase, booksApi.session, booksApi.book);
  const [payrollWeekStart, setPayrollWeekStart] = useState(() => getMondayDate(dateKey(new Date())));
  const payrollApi = useBkuPayroll(supabase, booksApi.session, booksApi.book, payrollWeekStart);

  const [view, setView] = useState<AppView>("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [dayDialogDate, setDayDialogDate] = useState<string | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [moving, setMoving] = useState(false);

  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookSaving, setNewBookSaving] = useState(false);
  const [newBookName, setNewBookName] = useState("");
  const [schoolHead, setSchoolHead] = useState("");
  const [planner, setPlanner] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [p2sp, setP2sp] = useState("");
  const [startDate, setStartDate] = useState(() => dateKey(new Date()));
  const [openingCash, setOpeningCash] = useState("0");
  const [openingBank, setOpeningBank] = useState("0");

  const [profileAddress, setProfileAddress] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileNpsn, setProfileNpsn] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [showEntry, setShowEntry] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editTargetDate, setEditTargetDate] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState("");

  const [copySource, setCopySource] = useState<Transaction | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState(() => dateKey(new Date()));

  const [showExport, setShowExport] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportTheme, setExportTheme] = useState("emerald");
  const [exportFont, setExportFont] = useState("Inter");
  const [signatoryRoles, setSignatoryRoles] = useState<SignatoryRole[]>(["school_head", "p2sp", "supervisor", "planner"]);
  const [toast, setToast] = useState<ToastState>(null);

  const closeToast = useCallback(() => setToast(null), []);
  const ordered = useMemo(() => sortTransactions(transactionsApi.transactions), [transactionsApi.transactions]);
  const balances = useMemo(() => calculateBalances(booksApi.book, ordered), [booksApi.book, ordered]);
  const daySummaries = useMemo(() => buildDaySummaries(ordered, month), [ordered, month]);
  const selectedRows = useMemo(() => ordered.filter((tx) => tx.transaction_date === (dayDialogDate || selectedDate)), [ordered, dayDialogDate, selectedDate]);

  useEffect(() => {
    if (!booksApi.book) return;
    setPayrollWeekStart(getMondayDate(booksApi.book.start_date || dateKey(new Date())));
    setProfileAddress(booksApi.book.address || "");
    setProfilePhone(booksApi.book.phone || "");
    setProfileNpsn(booksApi.book.npsn || "");
    setSelectedDate(booksApi.book.start_date || dateKey(new Date()));
    setMonth(new Date(`${booksApi.book.start_date || dateKey(new Date())}T00:00:00`));
    setExportStartDate(booksApi.book.start_date || dateKey(new Date()));
    const latest = ordered.reduce((max, tx) => tx.transaction_date > max ? tx.transaction_date : max, booksApi.book.start_date || dateKey(new Date()));
    const today = dateKey(new Date());
    setExportEndDate(latest > today ? latest : today);
  }, [booksApi.book?.id, ordered.length]);

  useEffect(() => {
    if (booksApi.error) setToast({ message: booksApi.error, tone: "error" });
  }, [booksApi.error]);

  useEffect(() => {
    if (transactionsApi.error) setToast({ message: transactionsApi.error, tone: "error" });
  }, [transactionsApi.error]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await booksApi.signInOrRegister();
    } catch {
      // Pesan autentikasi disimpan oleh hook dan ditampilkan di form.
    }
  }

  async function handleSignOut() {
    try {
      await booksApi.signOut();
      setToast({ message: "Anda sudah keluar dari akun BKU.", tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Gagal keluar dari akun.", tone: "error" });
    }
  }

  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewBookSaving(true);
    try {
      await booksApi.createBook({
        name: newBookName,
        school_head: schoolHead,
        planner,
        supervisor,
        p2sp,
        start_date: startDate,
        opening_cash: amountValue(openingCash),
        opening_bank: amountValue(openingBank),
      });
      setShowNewBook(false);
      setNewBookName("");
      setSchoolHead("");
      setPlanner("");
      setSupervisor("");
      setP2sp("");
      setOpeningCash("0");
      setOpeningBank("0");
      setView("calendar");
      setToast({ message: "Buku kas baru berhasil dibuat.", tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Buku kas gagal dibuat.", tone: "error" });
    } finally {
      setNewBookSaving(false);
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booksApi.book) return;
    setProfileSaving(true);
    try {
      const updated: ProfileInput = {
        name: booksApi.book.name,
        school_head: booksApi.book.school_head,
        planner: booksApi.book.planner,
        supervisor: booksApi.book.supervisor,
        p2sp: booksApi.book.p2sp,
        address: profileAddress,
        phone: profilePhone,
        npsn: profileNpsn,
      };
      await booksApi.saveProfile(updated);
      setView("calendar");
      setToast({ message: "Profil lembaga berhasil disimpan.", tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Profil lembaga gagal disimpan.", tone: "error" });
    } finally {
      setProfileSaving(false);
    }
  }

  function openNewEntry(date = selectedDate) {
    setSelectedDate(date);
    setEditTargetDate(date);
    setEditingTransactionId(null);
    setDrafts([blankDraft()]);
    setEntryError("");
    setDayDialogDate(null);
    setShowEntry(true);
  }

  function openEditTransaction(tx: Transaction) {
    setEntryError("");
    setSelectedDate(tx.transaction_date);
    setEditTargetDate(tx.transaction_date);
    setEditingTransactionId(tx.id);
    setDrafts([transactionToDraft(tx)]);
    setDayDialogDate(null);
    setShowEntry(true);
  }

  function openCopyTransaction(tx: Transaction) {
    setCopySource(tx);
    setCopyTargetDate(tx.transaction_date);
  }

  function confirmCopyTransaction() {
    if (!copySource) return;
    setSelectedDate(copyTargetDate);
    setEditTargetDate(copyTargetDate);
    setEditingTransactionId(null);
    const copiedDraft = transactionToDraft(copySource);
    copiedDraft.split_group_id = undefined;
    copiedDraft.split_group_label = undefined;
    copiedDraft.split_group_total = undefined;
    setDrafts([copiedDraft]);
    setEntryError("");
    setCopySource(null);
    setDayDialogDate(null);
    setShowEntry(true);
    setMonth(new Date(`${copyTargetDate}T00:00:00`));
  }

  async function handleSaveEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booksApi.session) return;
    const targetDate = editingTransactionId ? (editTargetDate || selectedDate) : selectedDate;
    setEntrySaving(true);
    setEntryError("");
    try {
      await transactionsApi.saveEntries({
        drafts,
        targetDate,
        editingTransactionId,
        session: booksApi.session,
      });
      setShowEntry(false);
      setEditingTransactionId(null);
      setEditTargetDate("");
      setDrafts([blankDraft()]);
      setSelectedDate(targetDate);
      setMonth(new Date(`${targetDate}T00:00:00`));
      setDayDialogDate(targetDate);
      setToast({
        message: editingTransactionId
          ? (drafts.length > 1 ? `Nota utama diperbarui dan ${drafts.length - 1} nota baru berhasil dibuat.` : "Nota berhasil diperbarui.")
          : "Transaksi berhasil disimpan.",
        tone: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Transaksi tidak berhasil disimpan.";
      setEntryError(message);
    } finally {
      setEntrySaving(false);
    }
  }

  function updateDraft(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, currentIndex) => currentIndex === index ? { ...draft, ...patch } : draft));
  }

  function updateDraftLine(draftIndex: number, lineIndex: number, patch: Partial<Draft["details"][number]>) {
    setDrafts((current) => current.map((draft, index) => index !== draftIndex ? draft : {
      ...draft,
      details: draft.details.map((line, currentLineIndex) => currentLineIndex === lineIndex ? { ...line, ...patch } : line),
    }));
  }

  function handleSplitDetails(draftIndex: number, lineIndexes: number[]) {
    const selected = Array.from(new Set(lineIndexes)).sort((a, b) => a - b);
    if (!selected.length) return;
    setDrafts((current) => {
      const source = current[draftIndex];
      if (!source || source.transaction_type !== "OUT" || source.details.length < 2) return current;
      if (selected.some((index) => index < 0 || index >= source.details.length)) return current;
      if (selected.length >= source.details.length) return current;

      const selectedSet = new Set(selected);
      const movedLines = source.details.filter((_line, index) => selectedSet.has(index));
      if (!movedLines.length) return current;

      const splitId = source.split_group_id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
            const random = Math.floor(Math.random() * 16);
            return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
          }));
      const groupLabel = source.split_group_label || source.receipt_number.trim() || source.description.trim() || "Kelompok nota terpisah";
      const sourceNext = {
        ...source,
        details: source.details.filter((_line, index) => !selectedSet.has(index)),
        split_group_id: splitId,
        split_group_label: groupLabel,
      };
      const child: Draft = {
        ...source,
        description: `${source.description.trim() || groupLabel} · bagian ${current.length + 1}`,
        receipt_number: "",
        file: null,
        details: movedLines,
        split_group_id: splitId,
        split_group_label: groupLabel,
      };
      const next = current.map((draft, index) => index === draftIndex ? sourceNext : draft).concat(child);
      const total = next.filter((draft) => draft.split_group_id === splitId)
        .reduce((sum, draft) => sum + draft.details.reduce((lineSum, line) => lineSum + detailLineTotal(line), 0), 0);
      return next.map((draft) => draft.split_group_id === splitId ? { ...draft, split_group_total: Math.round(total) } : draft);
    });
    setEntryError("");
    setToast({ message: editingTransactionId
      ? `${selected.length} rincian dipindahkan bersama ke 1 draft nota baru. Periksa nota utama dan nota baru, lalu simpan perubahan.`
      : `${selected.length} rincian digabung ke 1 draft nota baru. Isi nomor bukti sesuai bukti transaksi riil.`, tone: "info" });
  }

  async function handleSaveWeeklyPayroll(weekStart: string, payDate: string, account: "CASH" | "BANK", rows: WorkerAttendanceDraft[]) {
    const result = await payrollApi.saveWeeklyPayroll(weekStart, payDate, account, rows);
    if (booksApi.book?.id) await transactionsApi.loadTransactions(booksApi.book.id);
    setSelectedDate(payDate);
    setMonth(new Date(`${payDate}T00:00:00`));
    setDayDialogDate(payDate);
    setToast({ message: `Penggajian minggu berhasil dicatat sebagai kas keluar sebesar ${money(Number(result.total_amount || 0))}.`, tone: "success" });
    return result;
  }

  function handleCalendarDrop(sourceDate: string, targetDate: string) {
    if (!booksApi.book || sourceDate === targetDate) return;
    const sourceRows = ordered.filter((tx) => tx.transaction_date === sourceDate);
    if (!sourceRows.length) return;
    setMoveRequest({ sourceDate, targetDate, initialTransactionIds: [] });
  }

  async function handleMoveTransactions(ids: string[]) {
    if (!moveRequest) return;
    setMoving(true);
    try {
      const result = await transactionsApi.moveTransactions(ids, moveRequest.targetDate);
      setMoveRequest(null);
      setSelectedDate(moveRequest.targetDate);
      setMonth(new Date(`${moveRequest.targetDate}T00:00:00`));
      setDayDialogDate(moveRequest.targetDate);
      setToast({ message: `${result.moved} nota berhasil dipindahkan ke ${dateLabel(result.targetDate)}.`, tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Pemindahan nota gagal.", tone: "error" });
    } finally {
      setMoving(false);
    }
  }

  async function handleShiftProjectStart(targetDate: string) {
    const book = booksApi.book;
    if (!book || targetDate === book.start_date) return;
    const affected = ordered.filter((tx) => tx.transaction_date >= book.start_date).length;
    const delta = calendarDateDelta(book.start_date, targetDate);
    const label = `${Math.abs(delta)} hari ${delta >= 0 ? "lebih lambat" : "lebih awal"}`;
    if (!window.confirm(`Geser tanggal mulai proyek ${label}? ${affected} transaksi pada atau setelah ${book.start_date} akan ikut bergeser. Tindakan ini mengubah jadwal semua transaksi terkait.`)) return;
    try {
      const moved = await transactionsApi.shiftProjectSchedule(targetDate);
      const updated = { ...book, start_date: targetDate };
      booksApi.setBook(updated);
      booksApi.setBooks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedDate(targetDate);
      setMonth(new Date(`${targetDate}T00:00:00`));
      setToast({ message: `Tanggal mulai proyek dan ${moved || affected} transaksi berhasil digeser.`, tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Jadwal proyek gagal digeser. Pastikan fungsi SQL migrasi tersedia.", tone: "error" });
    }
  }

  async function handleDeleteTransaction(tx: Transaction) {
    if (!window.confirm(`Hapus nota ${tx.receipt_number || tx.description}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await transactionsApi.deleteTransaction(tx);
      setToast({ message: "Transaksi berhasil dihapus.", tone: "success" });
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Transaksi gagal dihapus.", tone: "error" });
    }
  }

  async function handleOpenEvidence(path: string) {
    try {
      const url = await transactionsApi.createEvidenceUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setToast({ message: cause instanceof Error ? cause.message : "Bukti transaksi tidak dapat dibuka.", tone: "error" });
    }
  }

  async function handleExportPdf() {
    const reportBook = booksApi.book;
    if (!reportBook) return;
    if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
      setToast({ message: "Tanggal awal harus sama dengan atau lebih awal dari tanggal akhir.", tone: "error" });
      return;
    }
    // Buka tab secara sinkron dari klik pengguna agar tidak diblokir popup blocker
    // ketika data absensi masih dimuat secara asynchronous.
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setToast({ message: "Jendela laporan diblokir browser. Izinkan pop-up untuk localhost lalu coba kembali.", tone: "error" });
      return;
    }
    reportWindow.document.write('<!doctype html><html><body style="font-family:Arial;padding:32px;color:#475569">Menyiapkan laporan BKU…</body></html>');
    try {
      const attendanceReport = await payrollApi.loadAttendanceReport(exportStartDate, exportEndDate);
      openBkuPdfReport({
        book: reportBook,
        transactions: ordered,
        startDate: exportStartDate,
        endDate: exportEndDate,
        themeId: exportTheme,
        font: exportFont,
        signatoryRoles,
        workers: attendanceReport.workers,
        attendance: attendanceReport.attendance,
      }, reportWindow);
      setShowExport(false);
    } catch (cause) {
      reportWindow.close();
      setToast({ message: cause instanceof Error ? cause.message : "Laporan PDF gagal dibuat.", tone: "error" });
    }
  }

  if (!supabase) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5"><section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck size={28}/></div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">BKU Eksternal</p><h1 className="mt-2 text-2xl font-black text-slate-900">Database mandiri belum dihubungkan</h1><p className="mt-3 text-sm leading-7 text-slate-600">Hubungkan aplikasi ke proyek Supabase BKU tersendiri melalui environment variables berikut.</p><div className="mt-5 space-y-2 rounded-xl bg-slate-950 p-4 font-mono text-xs text-emerald-300"><p>NEXT_PUBLIC_BKU_SUPABASE_URL</p><p>NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY</p></div><p className="mt-4 text-xs leading-5 text-slate-500">Gunakan anon / publishable key, bukan service_role key. Jalankan database/setup.sql pada proyek Supabase BKU.</p></section></main>;
  }

  if (booksApi.authLoading && !booksApi.session) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500"><RefreshCw className="mr-2 animate-spin" size={17}/>Memeriksa akun BKU…</div>;
  }

  if (!booksApi.session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,#d6f5e9,transparent_35%),linear-gradient(135deg,#f4f8f7,#eef2f8)] p-4 sm:p-6">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-2xl shadow-slate-300/60 md:grid-cols-[1fr_420px]">
          <div className="hidden flex-col justify-between bg-[#0d2b2a] p-10 text-white md:flex"><div><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-300 text-emerald-950"><Wallet size={30}/></div><p className="mt-8 text-xs font-black uppercase tracking-[.24em] text-emerald-300">Dahlia · aplikasi mandiri</p><h1 className="mt-3 text-4xl font-black leading-tight">Buku Kas Umum<br/>Proyek Eksternal</h1><p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/75">Catat kas masuk, kas keluar, rincian nota, dan saldo setiap transaksi dalam satu pembukuan yang tertib.</p></div><div className="text-xs text-emerald-100/60">Database dan akun terpisah dari Dahlia Management System.</div></div>
          <div className="p-7 sm:p-10"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">BKU Eksternal</p><h2 className="mt-3 text-2xl font-black text-slate-900">{booksApi.authMode === "login" ? "Masuk ke akun BKU" : "Daftar akun BKU"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Gunakan akun khusus BKU, bukan akun Dahlia.</p>
            <form onSubmit={handleAuth} className="mt-7 space-y-4"><FormField label="Email"><input type="email" required value={booksApi.email} onChange={(event) => booksApi.setEmail(event.target.value)} className={fieldClass} placeholder="nama@email.com"/></FormField><FormField label="Kata sandi"><input type="password" required minLength={8} value={booksApi.password} onChange={(event) => booksApi.setPassword(event.target.value)} className={fieldClass} placeholder="Minimal 8 karakter"/></FormField>
              {booksApi.authError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{booksApi.authError}</p>}
              <button type="submit" disabled={booksApi.authLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{booksApi.authLoading ? <RefreshCw className="animate-spin" size={17}/> : <LockKeyhole size={17} />}{booksApi.authMode === "login" ? "Masuk" : "Daftar akun"}</button>
            </form>
            <button type="button" onClick={() => { booksApi.setAuthMode(booksApi.authMode === "login" ? "register" : "login"); booksApi.setAuthError(""); }} className="mt-5 w-full text-sm font-semibold text-emerald-800 hover:underline">{booksApi.authMode === "login" ? "Belum punya akun? Daftar akun BKU" : "Sudah punya akun? Kembali masuk"}</button>
          </div>
        </section>
      </main>
    );
  }

  const book = booksApi.book;
  const currentDayRows = dayDialogDate ? ordered.filter((tx) => tx.transaction_date === dayDialogDate) : [];

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <AppHeader
        userEmail={booksApi.session.user.email || ""}
        books={booksApi.books}
        selectedBookId={book?.id || ""}
        onSelectBook={(id) => { const selected = booksApi.books.find((item) => item.id === id) || null; booksApi.setBook(selected); if (selected) setPayrollWeekStart(getMondayDate(selected.start_date)); setView("calendar"); setDayDialogDate(null); }}
        onNewBook={() => setShowNewBook(true)}
        onExport={() => setShowExport(true)}
        onNewTransaction={() => openNewEntry(selectedDate)}
        onSignOut={() => void handleSignOut()}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {toast && <ToastNotice message={toast.message} tone={toast.tone} onClose={closeToast}/>}

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold text-slate-500">Pembukuan sekolah / proyek eksternal</p><h2 className="mt-1 break-words text-2xl font-black tracking-tight text-slate-900">{book?.name || "Belum ada buku kas"}</h2>{book && <p className="mt-1 max-w-4xl text-[11px] leading-5 text-slate-500">Kepala Sekolah: {book.school_head || "—"} · Perencana: {book.planner || "—"} · Pengawas: {book.supervisor || "—"} · P2SP: {book.p2sp || "—"}</p>}</div>
          {book && <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-500"><CalendarDays size={14} className="text-emerald-700"/>Mulai {dateLabel(book.start_date)}</div>}
        </div>

        {!book ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CalendarDays size={30}/></div><h3 className="mt-4 text-xl font-black">Mulai buku kas pertama</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Buat buku kas dengan identitas lembaga, tanggal mulai, dan saldo awal tunai serta rekening bank.</p><button type="button" onClick={() => setShowNewBook(true)} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800"><Plus className="mr-1 inline" size={16}/>Buat buku kas</button></section>
        ) : (
          <>
            <BalanceSummary summary={balances}/>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap rounded-xl bg-slate-200/70 p-1">
                {(["calendar", "ledger", "payroll", "stores", "profile"] as AppView[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition sm:px-4 ${view === item ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{item === "calendar" ? "Kalender" : item === "ledger" ? "Buku transaksi" : item === "payroll" ? "Absensi & gaji" : item === "stores" ? "Master Data" : "Profil lembaga"}</button>)}
              </div>
              <p className="text-[10px] text-slate-400">{view === "calendar" ? "Klik tanggal untuk membuka nota · Seret tanggal untuk menata jadwal" : view === "ledger" ? "Daftar seluruh transaksi dalam buku kas" : view === "payroll" ? "Kelola roster pekerja, absensi HOK, dan penggajian mingguan" : view === "stores" ? "Master data toko, pemasok, dan riwayat transaksi terkait" : "Kelola identitas lembaga untuk laporan PDF"}</p>
            </div>

            {view === "calendar" && <section className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div><p className="text-xs font-black text-slate-800">Penataan jadwal proyek</p><p className="mt-0.5 text-[10px] text-slate-500">Seret penanda tanggal mulai ke hari tujuan untuk menggeser seluruh jadwal dengan jumlah hari yang sama.</p></div>
                <div draggable onDragStart={(event) => { if (!event.dataTransfer) return; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-bku-project-start", "true"); }} className="cursor-grab rounded-xl border border-dashed border-emerald-500 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 active:cursor-grabbing">↕ Seret tanggal mulai · {dateLabel(book.start_date, { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <CalendarView
                month={month}
                summaries={daySummaries}
                selectedDate={selectedDate}
                onSelectDate={(date) => { setSelectedDate(date); setDayDialogDate(date); }}
                onDropDate={handleCalendarDrop}
                onDropProjectStart={(date) => void handleShiftProjectStart(date)}
                onPrevious={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                onToday={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dateKey(today)); }}
              />
            </section>}

            {view === "ledger" && <TransactionLedger transactions={ordered} balances={balances.rows} onEdit={openEditTransaction} onCopy={openCopyTransaction} onDelete={(tx) => void handleDeleteTransaction(tx)}/>}

            {view === "payroll" && <WorkerPayrollView
              workers={payrollApi.workers}
              attendance={payrollApi.attendance}
              weeklyPayroll={payrollApi.weeklyPayroll}
              weekStart={payrollWeekStart}
              loading={payrollApi.loading}
              saving={payrollApi.saving}
              error={payrollApi.error}
              onWeekStartChange={(value) => { if (isValidDateKey(value)) setPayrollWeekStart(getMondayDate(value)); }}
              onSaveWorker={payrollApi.saveWorker}
              onSetWorkerActive={payrollApi.setWorkerActive}
              onCopyWeek={payrollApi.copyWeekAttendance}
              onSavePayroll={handleSaveWeeklyPayroll}
              onClearError={() => payrollApi.setError("")}
            />}

            {view === "stores" && <StoreMasterView stores={transactionsApi.stores} loading={transactionsApi.loading} onSave={transactionsApi.saveStore} />}

            {view === "profile" && <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Pengaturan lembaga</p><h3 className="mt-1 text-xl font-black text-slate-900">Profil sekolah / lembaga</h3><p className="mt-1 text-xs text-slate-500">Identitas ini digunakan pada header laporan dan dokumen PDF BKU.</p></div>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Nama sekolah / lembaga"><input required value={book.name} onChange={(event) => booksApi.setBook((current) => current ? { ...current, name: event.target.value } : current)} className={fieldClass}/></FormField>
                  <FormField label="NPSN (opsional)"><input value={profileNpsn} onChange={(event) => setProfileNpsn(event.target.value)} placeholder="Nomor Pokok Sekolah Nasional" className={fieldClass}/></FormField>
                  <FormField label="Nama kepala sekolah"><input value={book.school_head} onChange={(event) => booksApi.setBook((current) => current ? { ...current, school_head: event.target.value } : current)} className={fieldClass}/></FormField>
                  <FormField label="Nama perencana"><input value={book.planner} onChange={(event) => booksApi.setBook((current) => current ? { ...current, planner: event.target.value } : current)} className={fieldClass}/></FormField>
                  <FormField label="Nama pengawas"><input value={book.supervisor} onChange={(event) => booksApi.setBook((current) => current ? { ...current, supervisor: event.target.value } : current)} className={fieldClass}/></FormField>
                  <FormField label="Nama P2SP"><input value={book.p2sp} onChange={(event) => booksApi.setBook((current) => current ? { ...current, p2sp: event.target.value } : current)} className={fieldClass}/></FormField>
                  <FormField label="Nomor telepon lembaga"><input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="Nomor kontak" className={fieldClass}/></FormField>
                  <FormField label="Alamat lembaga"><input value={profileAddress} onChange={(event) => setProfileAddress(event.target.value)} placeholder="Alamat lengkap" className={fieldClass}/></FormField>
                </div>
                <div className="flex justify-end border-t border-slate-100 pt-4"><button type="submit" disabled={profileSaving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{profileSaving ? "Menyimpan…" : "Simpan profil lembaga"}</button></div>
              </form>
            </section>}
          </>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-900"><span className="font-black">!</span><p>Pengingat nota Rp2.000.000 ditampilkan saat input melebihi batas. Catat nilai sesuai pembelian dan bukti yang sebenarnya. Sistem tidak memecah satu pembelian menjadi nota semu.</p></div>
      </div>

      <DayTransactionsDialog
        date={dayDialogDate}
        transactions={currentDayRows}
        balances={balances.rows}
        onClose={() => setDayDialogDate(null)}
        onAdd={openNewEntry}
        onEdit={openEditTransaction}
        onCopy={openCopyTransaction}
        onDelete={(tx) => void handleDeleteTransaction(tx)}
        onEvidence={(path) => void handleOpenEvidence(path)}
      />

      <MoveTransactionsDialog
        sourceDate={moveRequest?.sourceDate || null}
        targetDate={moveRequest?.targetDate || null}
        transactions={ordered}
        initialTransactionIds={moveRequest?.initialTransactionIds || []}
        busy={moving}
        onClose={() => setMoveRequest(null)}
        onConfirm={(ids) => void handleMoveTransactions(ids)}
      />

      <TransactionFormModal
        open={showEntry}
        date={editingTransactionId ? editTargetDate : selectedDate}
        onDateChange={(date) => editingTransactionId ? setEditTargetDate(date) : setSelectedDate(date)}
        drafts={drafts}
        materials={transactionsApi.materials}
        stores={transactionsApi.stores}
        editing={Boolean(editingTransactionId)}
        saving={entrySaving}
        error={entryError}
        onClearError={() => setEntryError("")}
        onClose={() => { setShowEntry(false); setEditingTransactionId(null); setEditTargetDate(""); setEntryError(""); }}
        onSave={handleSaveEntries}
        onDraftChange={updateDraft}
        onLineChange={updateDraftLine}
        onAddDetail={(draftIndex, line) => updateDraft(draftIndex, { details: [...drafts[draftIndex].details, line] })}
        onRemoveDetail={(draftIndex, lineIndex) => updateDraft(draftIndex, { details: drafts[draftIndex].details.filter((_line, index) => index !== lineIndex) })}
        onAddDraft={() => setDrafts((current) => [...current, blankDraft()])}
        onRemoveDraft={(index) => setDrafts((current) => current.filter((_draft, currentIndex) => currentIndex !== index))}
        onSplitDetails={handleSplitDetails}
      />

      {showNewBook && <AppModal title="Buat buku kas baru" subtitle="Identitas dan saldo awal pembukuan lembaga / proyek." onClose={() => setShowNewBook(false)}>
        <form onSubmit={handleCreateBook} className="space-y-4">
          <FormField label="Nama sekolah / proyek"><input required autoFocus value={newBookName} onChange={(event) => setNewBookName(event.target.value)} placeholder="Nama sekolah atau proyek" className={fieldClass}/></FormField>
          <div className="grid gap-3 sm:grid-cols-2"><FormField label="Nama kepala sekolah"><input required value={schoolHead} onChange={(event) => setSchoolHead(event.target.value)} placeholder="Nama kepala sekolah" className={fieldClass}/></FormField><FormField label="Nama perencana"><input required value={planner} onChange={(event) => setPlanner(event.target.value)} placeholder="Nama perencana" className={fieldClass}/></FormField><FormField label="Nama pengawas"><input required value={supervisor} onChange={(event) => setSupervisor(event.target.value)} placeholder="Nama pengawas" className={fieldClass}/></FormField><FormField label="Nama P2SP"><input required value={p2sp} onChange={(event) => setP2sp(event.target.value)} placeholder="Nama P2SP" className={fieldClass}/></FormField></div>
          <FormField label="Tanggal mulai pembukuan"><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass}/></FormField>
          <div className="grid gap-3 sm:grid-cols-2"><FormField label="Saldo awal tunai (Rp)"><input inputMode="numeric" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className={fieldClass}/></FormField><FormField label="Saldo awal bank (Rp)"><input inputMode="numeric" value={openingBank} onChange={(event) => setOpeningBank(event.target.value)} className={fieldClass}/></FormField></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowNewBook(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="submit" disabled={newBookSaving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{newBookSaving ? "Membuat…" : "Buat buku kas"}</button></div>
        </form>
      </AppModal>}

      {copySource && <AppModal title="Salin nota ke tanggal lain" subtitle={`Salinan nota ${copySource.receipt_number || copySource.description}`} onClose={() => setCopySource(null)}>
        <div className="space-y-4"><p className="text-xs leading-5 text-slate-500">Rincian nota akan disalin sebagai transaksi baru. Nota asli tetap utuh dan tanggal salinan dapat diubah kembali sebelum disimpan.</p><FormField label="Tanggal tujuan"><input type="date" value={copyTargetDate} onChange={(event) => setCopyTargetDate(event.target.value)} className={fieldClass}/></FormField><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setCopySource(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="button" onClick={confirmCopyTransaction} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white">Salin dan edit nota</button></div></div>
      </AppModal>}

      <ExportPdfModal
        open={showExport && Boolean(book)}
        startDate={exportStartDate}
        endDate={exportEndDate}
        themeId={exportTheme}
        font={exportFont}
        signatoryRoles={signatoryRoles}
        onStartDateChange={setExportStartDate}
        onEndDateChange={setExportEndDate}
        onThemeChange={setExportTheme}
        onFontChange={setExportFont}
        onSignatoryChange={setSignatoryRoles}
        onClose={() => setShowExport(false)}
        onExport={() => { void handleExportPdf(); }}
      />

      {(booksApi.loading || transactionsApi.loading || payrollApi.loading) && <LoadingOverlay label="Memuat pembukuan…"/>}
    </main>
  );
}
