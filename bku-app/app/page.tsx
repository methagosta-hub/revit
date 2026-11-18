"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarDays,
  ChevronLeft, ChevronRight, Copy, Download, FileUp, LockKeyhole, LogOut, Plus,
  RefreshCw, Settings, ShieldCheck, Trash2, Wallet, X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getBkuSupabase } from "@/lib/supabase";

type Account = "CASH" | "BANK";
type TxType = "IN" | "OUT" | "TRANSFER";
type Book = {
  id: string;
  name: string;
  school_head: string;
  planner: string;
  supervisor: string;
  p2sp: string;
  address: string;
  phone: string;
  npsn: string;
  start_date: string;
  opening_cash: number;
  opening_bank: number;
};
type DetailLine = {
  name: string;
  unit_price: string;
  volume: string;
  unit: string;
  material_id: string;
};
type StoredDetail = {
  material_id?: string | null;
  name: string;
  unit_price: number;
  volume: number;
  unit: string;
  line_total: number;
};
type Transaction = {
  id: string;
  book_id: string;
  transaction_date: string;
  created_at: string;
  entry_no: number;
  transaction_type: TxType;
  category: string;
  description: string;
  amount: number;
  account: Account | null;
  from_account: Account | null;
  to_account: Account | null;
  receipt_number: string | null;
  evidence_path: string | null;
  details: StoredDetail[] | null;
  store_id: string | null;
  store_name: string;
};
type Material = {
  id: string; book_id: string | null; category: string; name: string; unit: string;
  unit_price: number; price_basis: string; is_seed: boolean; is_active: boolean;
};
type SchoolStore = {
  id: string; book_id: string; name: string; address: string; phone: string;
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
  store_id: string;
  store_name: string;
  details: DetailLine[];
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
  receipt_number: "", file: null, store_id: "", store_name: "",
  details: [{ name: "", unit_price: "", volume: "", unit: "pcs", material_id: "" }],
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
const exportThemes = [
  { id: "emerald", label: "Emerald Modern", primary: "#047857", soft: "#ecfdf5", ink: "#102f2c", accent: "#34d399", border: "#cdeee1" },
  { id: "ocean", label: "Ocean Blue", primary: "#0369a1", soft: "#f0f9ff", ink: "#0c2940", accent: "#38bdf8", border: "#ccecff" },
  { id: "midnight", label: "Midnight Navy", primary: "#1e3a8a", soft: "#eff6ff", ink: "#172554", accent: "#60a5fa", border: "#dbeafe" },
  { id: "royal", label: "Royal Blue", primary: "#3730a3", soft: "#eef2ff", ink: "#1e1b4b", accent: "#818cf8", border: "#dfe3ff" },
  { id: "violet", label: "Violet Luxe", primary: "#6d28d9", soft: "#f5f3ff", ink: "#2e1065", accent: "#a78bfa", border: "#e9ddff" },
  { id: "plum", label: "Plum", primary: "#7e22ce", soft: "#faf5ff", ink: "#3b0764", accent: "#c084fc", border: "#efdafa" },
  { id: "rose", label: "Rose", primary: "#be123c", soft: "#fff1f2", ink: "#4c0519", accent: "#fb7185", border: "#ffe0e5" },
  { id: "coral", label: "Coral", primary: "#c2410c", soft: "#fff7ed", ink: "#431407", accent: "#fb923c", border: "#ffdfc7" },
  { id: "amber", label: "Amber", primary: "#b45309", soft: "#fffbeb", ink: "#451a03", accent: "#fbbf24", border: "#f8e9c7" },
  { id: "gold", label: "Champagne Gold", primary: "#92702c", soft: "#fbf7ec", ink: "#3f321b", accent: "#d6b56d", border: "#eadfbe" },
  { id: "slate", label: "Slate Minimal", primary: "#475569", soft: "#f8fafc", ink: "#0f172a", accent: "#94a3b8", border: "#e2e8f0" },
  { id: "charcoal", label: "Charcoal", primary: "#334155", soft: "#f1f5f9", ink: "#111827", accent: "#64748b", border: "#dbe1e8" },
  { id: "forest", label: "Forest Green", primary: "#166534", soft: "#f0fdf4", ink: "#052e16", accent: "#4ade80", border: "#d2f2d9" },
  { id: "sage", label: "Sage", primary: "#5f7664", soft: "#f4f7f2", ink: "#26352b", accent: "#a3b18a", border: "#dce5d8" },
  { id: "mint", label: "Mint Fresh", primary: "#0f766e", soft: "#f0fdfa", ink: "#134e4a", accent: "#5eead4", border: "#c8f2eb" },
  { id: "teal", label: "Teal Executive", primary: "#0f6b78", soft: "#effbfc", ink: "#12343b", accent: "#5dc8d4", border: "#ccecef" },
  { id: "sky", label: "Sky Light", primary: "#0284c7", soft: "#f0f9ff", ink: "#082f49", accent: "#7dd3fc", border: "#d5efff" },
  { id: "cobalt", label: "Cobalt", primary: "#1d4ed8", soft: "#eff6ff", ink: "#172554", accent: "#93c5fd", border: "#d8e7ff" },
  { id: "burgundy", label: "Burgundy Elegant", primary: "#881337", soft: "#fff1f2", ink: "#3f0a1c", accent: "#d18a9e", border: "#f2d8e0" },
  { id: "monochrome", label: "Black & White", primary: "#18181b", soft: "#f4f4f5", ink: "#18181b", accent: "#a1a1aa", border: "#e4e4e7" },
] as const;
const exportFonts = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat",
  "Poppins", "Nunito Sans", "Manrope", "DM Sans", "Plus Jakarta Sans",
  "Work Sans", "Source Sans 3", "Ubuntu", "Rubik", "Outfit",
  "Space Grotesk", "Urbanist", "Mulish", "Figtree", "IBM Plex Sans",
] as const;
const parseDecimal = (value: string) => Number(value.trim().replace(",", ".")) || 0;
const parseUnitPrice = (value: string) => Number(value.trim().replace(/\\./g, "").replace(",", ".")) || 0;
const detailLineTotal = (line: DetailLine) => Math.round(parseUnitPrice(line.unit_price) * parseDecimal(line.volume));
const draftDetailsTotal = (draft: Draft) => draft.details.reduce((sum, line) => sum + detailLineTotal(line), 0);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return replacements[char] || char;
});
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
  const [schoolHead, setSchoolHead] = useState("");
  const [planner, setPlanner] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [p2sp, setP2sp] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileNpsn, setProfileNpsn] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stores, setStores] = useState<SchoolStore[]>([]);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<Transaction | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState(() => dateKey(new Date()));
  const [view, setView] = useState<"calendar" | "ledger" | "profile">("calendar");
  const [shiftingSchedule, setShiftingSchedule] = useState(false);
  const [signatureCount, setSignatureCount] = useState("4");
  const [signatoryRoles, setSignatoryRoles] = useState<string[]>(["school_head", "p2sp", "supervisor", "planner"]);
  const [startDate, setStartDate] = useState(() => dateKey(new Date()));
  const [openingCash, setOpeningCash] = useState("0");
  const [openingBank, setOpeningBank] = useState("0");
  const [showExport, setShowExport] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => dateKey(new Date()));
  const [exportEndDate, setExportEndDate] = useState(() => dateKey(new Date()));
  const [exportTheme, setExportTheme] = useState<string>("emerald");
  const [exportFont, setExportFont] = useState<string>("Inter");
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const [saving, setSaving] = useState(false);

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
      .select("id,name,school_head,planner,supervisor,p2sp,address,phone,npsn,start_date,opening_cash,opening_bank")
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
      .select("id,book_id,transaction_date,created_at,entry_no,transaction_type,category,description,amount,account,from_account,to_account,receipt_number,evidence_path,details,store_id,store_name")
      .eq("book_id", bookId)
      .order("transaction_date", { ascending: true })
      .order("entry_no", { ascending: true });
    if (error) setPageError(error.message);
    setTransactions((data || []) as Transaction[]);
  }, [supabase]);

  const loadSchoolResources = useCallback(async (bookId: string) => {
    if (!supabase) return;
    const [materialResult, storeResult] = await Promise.all([
      supabase.from("bku_materials").select("id,book_id,category,name,unit,unit_price,price_basis,is_seed,is_active")
        .eq("is_active", true).or(`book_id.is.null,book_id.eq.${bookId}`).order("category").order("name"),
      supabase.from("bku_stores").select("id,book_id,name,address,phone").eq("book_id", bookId).order("name"),
    ]);
    if (materialResult.error) setPageError(materialResult.error.message);
    if (storeResult.error) setPageError(storeResult.error.message);
    setMaterials((materialResult.data || []) as Material[]);
    setStores((storeResult.data || []) as SchoolStore[]);
  }, [supabase]);

  useEffect(() => { void loadBooks(); }, [loadBooks]);
  useEffect(() => {
    if (book?.id) {
      void loadTransactions(book.id);
      void loadSchoolResources(book.id);
      setProfileAddress(book.address || "");
      setProfilePhone(book.phone || "");
      setProfileNpsn(book.npsn || "");
    } else {
      setTransactions([]);
      setMaterials([]);
      setStores([]);
    }
  }, [book?.id, loadTransactions, loadSchoolResources]);

  const ordered = useMemo(() => [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date) ||
    a.entry_no - b.entry_no || a.created_at.localeCompare(b.created_at)
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
    try {
      const { data, error } = await supabase.from("bku_books").insert({
        name: bookName.trim(),
        school_head: schoolHead.trim(),
        planner: planner.trim(),
        supervisor: supervisor.trim(),
        p2sp: p2sp.trim(),
        address: "",
        phone: "",
        npsn: "",
        start_date: startDate,
        opening_cash: amountValue(openingCash),
        opening_bank: amountValue(openingBank),
        created_by: session.user.id,
      }).select("id,name,school_head,planner,supervisor,p2sp,address,phone,npsn,start_date,opening_cash,opening_bank").single();
      if (error) throw error;
      const created = data as Book;
      setBooks((current) => [created, ...current]);
      setBook(created);
      setTransactions([]);
      await loadSchoolResources(created.id);
      setView("calendar");
      setShowNewBook(false);
      setBookName("");
      setSchoolHead("");
      setPlanner("");
      setSupervisor("");
      setP2sp("");
      setOpeningCash("0");
      setOpeningBank("0");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Buku kas gagal dibuat.");
    } finally {
      setSaving(false);
    }
  }

  function transactionToDraft(tx: Transaction): Draft {
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
      details: (tx.details || []).length
        ? (tx.details || []).map((line) => ({
            material_id: line.material_id || "",
            name: line.name,
            unit_price: String(line.unit_price),
            volume: String(line.volume),
            unit: line.unit || "pcs",
          }))
        : [{ name: "", unit_price: "", volume: "", unit: "pcs", material_id: "" }],
    };
  }

  function openEditTransaction(tx: Transaction) {
    setSelectedDate(tx.transaction_date);
    setEditingTransactionId(tx.id);
    setDrafts([transactionToDraft(tx)]);
    setShowEntry(true);
  }

  function openCopyTransaction(tx: Transaction) {
    setCopySource(tx);
    setCopyTargetDate(tx.transaction_date);
  }

  async function confirmCopyTransaction() {
    if (!copySource) return;
    setSelectedDate(copyTargetDate);
    setEditingTransactionId(null);
    setDrafts([transactionToDraft(copySource)]);
    setShowEntry(true);
    setCopySource(null);
  }

  async function deleteTransaction(tx: Transaction) {
    if (!supabase || !book) return;
    if (!window.confirm(`Hapus nota ${tx.receipt_number || tx.description}? Tindakan ini tidak dapat dibatalkan.`)) return;
    const { error } = await supabase.from("bku_transactions").delete().eq("id", tx.id).eq("book_id", book.id);
    if (error) {
      setPageError(error.message);
      return;
    }
    await loadTransactions(book.id);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !book) return;
    setSaving(true);
    setPageError("");
    try {
      const update = {
        name: book.name.trim(),
        school_head: book.school_head.trim(),
        planner: book.planner.trim(),
        supervisor: book.supervisor.trim(),
        p2sp: book.p2sp.trim(),
        address: profileAddress.trim(),
        phone: profilePhone.trim(),
        npsn: profileNpsn.trim(),
      };
      const { data, error } = await supabase.from("bku_books").update(update).eq("id", book.id)
        .select("id,name,school_head,planner,supervisor,p2sp,address,phone,npsn,start_date,opening_cash,opening_bank").single();
      if (error) throw error;
      const updated = data as Book;
      setBook(updated);
      setBooks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setPageError("");
      setView("calendar");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Profil lembaga gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function shiftProjectStart(targetDate: string) {
    if (!supabase || !book || targetDate === book.start_date || shiftingSchedule) return;
    const affected = transactions.filter((tx) => tx.transaction_date >= book.start_date).length;
    const oldDate = new Date(book.start_date + "T00:00:00Z");
    const newDate = new Date(targetDate + "T00:00:00Z");
    const delta = Math.round((newDate.getTime() - oldDate.getTime()) / 86400000);
    const deltaLabel = `${Math.abs(delta)} hari ${delta >= 0 ? "lebih lambat" : "lebih awal"}`;
    if (!window.confirm(`Geser tanggal mulai proyek ${deltaLabel}? ${affected} nota pada / setelah ${book.start_date} akan ikut bergeser dengan jumlah hari yang sama. Saldo dan urutan nota akan dihitung ulang.`)) return;
    setShiftingSchedule(true);
    setPageError("");
    try {
      const { data, error } = await supabase.rpc("bku_shift_project_schedule", {
        p_book_id: book.id,
        p_new_start_date: targetDate,
      });
      if (error) throw error;
      const updated = { ...book, start_date: targetDate };
      setBook(updated);
      setBooks((current) => current.map((item) => item.id === updated.id ? updated : item));
      await loadTransactions(book.id);
      setMonth(new Date(targetDate + "T00:00:00"));
      setSelectedDate(targetDate);
      window.alert(`Tanggal mulai dan ${Number(data ?? affected)} nota berhasil digeser.`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Jadwal proyek gagal digeser. Pastikan SQL migrasi terbaru sudah dijalankan.");
    } finally {
      setShiftingSchedule(false);
    }
  }

  async function updateDraftMaterial(index: number, lineIndex: number, materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    setDrafts((current) => current.map((draft, i) => {
      if (i !== index) return draft;
      return {
        ...draft,
        details: draft.details.map((line, j) => j !== lineIndex ? line : material
          ? { ...line, material_id: material.id, name: material.name, unit_price: String(material.unit_price), unit: material.unit }
          : { ...line, material_id: "" }),
      };
    }));
  }

  async function saveEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !book || !session?.user) return;
    if (editingTransactionId && drafts.length !== 1) {
      setPageError("Mode edit hanya untuk satu nota. Simpan satu nota pada satu waktu.");
      return;
    }
    const valid = drafts.filter((draft) => draft.transaction_type === "OUT"
      ? draft.details.some((line) => line.name.trim() && parseUnitPrice(line.unit_price) > 0 && parseDecimal(line.volume) > 0)
      : draft.description.trim() && amountValue(draft.amount) > 0);
    if (!valid.length) {
      setPageError("Isi minimal satu rincian material untuk nota pengeluaran, atau uraian dan nominal untuk pemasukan / transfer.");
      return;
    }
    const hasIncompleteDetail = valid.some((draft) => draft.transaction_type === "OUT" && draft.details.some((line) =>
      (line.name.trim() || line.unit_price.trim() || line.volume.trim()) &&
      (!line.name.trim() || parseUnitPrice(line.unit_price) <= 0 || parseDecimal(line.volume) <= 0)
    ));
    if (hasIncompleteDetail) {
      setPageError("Lengkapi nama material, harga satuan, dan volume pada setiap baris nota yang digunakan.");
      return;
    }
    if (valid.some((draft) => draft.transaction_type === "OUT" && !draft.store_name.trim())) {
      setPageError("Pilih toko yang sudah terdaftar atau tulis nama toko / pemasok untuk nota pengeluaran.");
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
      const resolvedStores = new Map<string, SchoolStore>(stores.map((item) => [item.name.toLowerCase(), item] as [string, SchoolStore]));
      const resolvedMaterials = new Map<string, Material>(materials.map((item) => [item.name.toLowerCase() + "|" + item.unit, item] as [string, Material]));
      const original = editingTransactionId ? transactions.find((tx) => tx.id === editingTransactionId) : null;
      const firstEntryNo = original?.entry_no ?? (ordered.filter((tx) => tx.transaction_date === selectedDate).length + 1);
      for (const [index, draft] of valid.entries()) {
        let storeId = draft.store_id || null;
        let storeName = draft.store_name.trim();
        if (storeId) {
          storeName = stores.find((item) => item.id === storeId)?.name || storeName;
        } else if (storeName) {
          const existingStore = resolvedStores.get(storeName.toLowerCase());
          if (existingStore) {
            storeId = existingStore.id;
            storeName = existingStore.name;
          } else {
            const { data: newStore, error: storeError } = await supabase.from("bku_stores").insert({
              book_id: book.id, name: storeName, created_by: session.user.id,
            }).select("id,book_id,name,address,phone").single();
            if (storeError) throw storeError;
            const createdStore = newStore as SchoolStore;
            resolvedStores.set(createdStore.name.toLowerCase(), createdStore);
            setStores((current) => current.some((item) => item.id === createdStore.id) ? current : [...current, createdStore].sort((a, b) => a.name.localeCompare(b.name)));
            storeId = createdStore.id;
            storeName = createdStore.name;
          }
        }

        const detailRows: StoredDetail[] = [];
        if (draft.transaction_type === "OUT") {
          for (const line of draft.details.filter((item) => item.name.trim() && parseDecimal(item.unit_price) > 0 && parseDecimal(item.volume) > 0)) {
            let materialId = line.material_id || null;
            const matching = resolvedMaterials.get(line.name.trim().toLowerCase() + "|" + line.unit);
            if (!materialId && matching) materialId = matching.id;
            if (!materialId && !matching) {
              const { data: customMaterial, error: materialError } = await supabase.from("bku_materials").insert({
                book_id: book.id, category: "Material tambahan", name: line.name.trim(),
                unit: line.unit.trim() || "pcs", unit_price: parseUnitPrice(line.unit_price),
                price_basis: "Harga aktual dari nota", is_seed: false, created_by: session.user.id,
              }).select("id,book_id,category,name,unit,unit_price,price_basis,is_seed,is_active").single();
              if (materialError && !materialError.message.toLowerCase().includes("duplicate")) throw materialError;
              if (customMaterial) {
                const savedMaterial = customMaterial as Material;
                materialId = savedMaterial.id;
                resolvedMaterials.set(savedMaterial.name.toLowerCase() + "|" + savedMaterial.unit, savedMaterial);
                setMaterials((current) => current.some((item) => item.id === savedMaterial.id) ? current : [...current, savedMaterial]);
              }
            }
            detailRows.push({
              material_id: materialId,
              name: line.name.trim(),
              unit_price: parseUnitPrice(line.unit_price),
              volume: parseDecimal(line.volume),
              unit: line.unit.trim() || "pcs",
              line_total: detailLineTotal(line),
            });
          }
        }

        let evidencePath = original?.evidence_path || null;
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
          entry_no: firstEntryNo + index,
          transaction_type: draft.transaction_type,
          category: draft.category,
          description: draft.transaction_type === "OUT"
            ? (draft.description.trim() || detailRows.map((line) => line.name).join(", ").slice(0, 250))
            : draft.description.trim(),
          amount: draft.transaction_type === "OUT" ? detailRows.reduce((sum, line) => sum + line.line_total, 0) : amountValue(draft.amount),
          details: detailRows,
          account: draft.transaction_type === "TRANSFER" ? null : draft.account,
          from_account: draft.transaction_type === "TRANSFER" ? draft.from_account : null,
          to_account: draft.transaction_type === "TRANSFER" ? draft.to_account : null,
          receipt_number: draft.receipt_number.trim() || null,
          evidence_path: evidencePath,
          store_id: storeId,
          store_name: storeName,
          created_by: original?.created_at ? undefined : session.user.id,
        });
      }
      if (editingTransactionId) {
        const { error } = await supabase.from("bku_transactions").update(records[0]).eq("id", editingTransactionId).eq("book_id", book.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bku_transactions").insert(records);
        if (error) throw error;
      }
      setDrafts([blankDraft()]);
      setEditingTransactionId(null);
      setShowEntry(false);
      await loadTransactions(book.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Transaksi tidak berhasil disimpan.");
    } finally {
      setSaving(false);
    }
  }

  function exportBkuPdf() {
    if (!book) return;
    if (signatoryRoles.length !== Number(signatureCount)) {
      setPageError(`Pilih tepat ${signatureCount} orang untuk menandatangani PDF.`);
      return;
    }
    if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
      setPageError("Tanggal awal dan tanggal akhir PDF tidak valid. Pastikan tanggal akhir tidak lebih awal dari tanggal awal.");
      return;
    }
    const popup = window.open("", "_blank");
    if (!popup) {
      setPageError("Jendela PDF diblokir browser. Izinkan pop-up untuk situs BKU lalu coba kembali.");
      return;
    }
    const theme = exportThemes.find((item) => item.id === exportTheme) || exportThemes[0];
    const font = exportFonts.find((item) => item === exportFont) || "Inter";
    const dateFormat = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value + "T00:00:00"));
    const reportTransactions = ordered.filter((tx) =>
      tx.transaction_date >= exportStartDate && tx.transaction_date <= exportEndDate
    );
    let openingCashValue = Number(book.opening_cash || 0);
    let openingBankValue = Number(book.opening_bank || 0);
    let closingCashValue = Number(book.opening_cash || 0);
    let closingBankValue = Number(book.opening_bank || 0);
    let periodIncoming = 0;
    let periodOutgoing = 0;
    for (const tx of ordered) {
      if (tx.transaction_date < exportStartDate) {
        const amount = Number(tx.amount || 0);
        if (tx.transaction_type === "IN") {
          if (tx.account === "BANK") openingBankValue += amount;
          else openingCashValue += amount;
        } else if (tx.transaction_type === "OUT") {
          if (tx.account === "BANK") openingBankValue -= amount;
          else openingCashValue -= amount;
        } else {
          if (tx.from_account === "BANK") openingBankValue -= amount;
          else openingCashValue -= amount;
          if (tx.to_account === "BANK") openingBankValue += amount;
          else openingCashValue += amount;
        }
      }
      if (tx.transaction_date <= exportEndDate) {
        const amount = Number(tx.amount || 0);
        if (tx.transaction_type === "IN") {
          periodIncoming += tx.transaction_date >= exportStartDate ? amount : 0;
          if (tx.account === "BANK") closingBankValue += amount;
          else closingCashValue += amount;
        } else if (tx.transaction_type === "OUT") {
          periodOutgoing += tx.transaction_date >= exportStartDate ? amount : 0;
          if (tx.account === "BANK") closingBankValue -= amount;
          else closingCashValue -= amount;
        } else {
          if (tx.from_account === "BANK") closingBankValue -= amount;
          else closingCashValue -= amount;
          if (tx.to_account === "BANK") closingBankValue += amount;
          else closingCashValue += amount;
        }
      }
    }
    const transactionRows = reportTransactions.map((tx) => {
      const balance = balances.rows[tx.id];
      const detailRows = (tx.details || []).map((line) =>
        `<div class="line"><span>${escapeHtml(line.name)}</span><span>${money(Number(line.unit_price))} × ${Number(line.volume).toLocaleString("id-ID")} ${escapeHtml(line.unit || "")}</span><strong>${money(Number(line.line_total ?? Number(line.unit_price) * Number(line.volume)))}</strong></div>`
      ).join("");
      const description = tx.transaction_type === "OUT"
        ? (detailRows || `<div class="desc">${escapeHtml(tx.description)}</div>`)
        : `<div class="desc">${escapeHtml(tx.description)}</div>`;
      const type = tx.transaction_type === "IN" ? "Pemasukan" : tx.transaction_type === "OUT" ? "Pengeluaran" : "Transfer";
      const method = tx.transaction_type === "TRANSFER" ? `${tx.from_account === "BANK" ? "Bank" : "Tunai"} → ${tx.to_account === "BANK" ? "Bank" : "Tunai"}` : tx.account === "BANK" ? "Bank" : "Tunai";
      return `<tr><td class="nowrap">${dateFormat(tx.transaction_date)}</td><td><strong>${escapeHtml(tx.receipt_number || "—")}</strong><div class="muted">${type} · ${method}${tx.store_name ? " · Toko: " + escapeHtml(tx.store_name) : ""}</div></td><td>${description}</td><td class="num in">${tx.transaction_type === "IN" ? money(Number(tx.amount)) : "—"}</td><td class="num out">${tx.transaction_type === "OUT" ? money(Number(tx.amount)) : "—"}</td><td class="num balance">${money(balance?.total || 0)}</td></tr>`;
    }).join("");
    const rangeEnd = exportEndDate;
    const openingTotal = money(openingCashValue + openingBankValue);
    const closingCash = money(closingCashValue);
    const closingBank = money(closingBankValue);
    const closingTotal = money(closingCashValue + closingBankValue);
    const signatureNames: Record<string, string> = {
      school_head: "Kepala Sekolah", p2sp: "P2SP", supervisor: "Pengawas", planner: "Perencana",
    };
    const signaturePeople: Record<string, string> = {
      school_head: book.school_head, p2sp: book.p2sp, supervisor: book.supervisor, planner: book.planner,
    };
    const signatureHtml = signatoryRoles.map((role) =>
      `<div><strong>${signatureNames[role]}</strong><div class="line-sign">${escapeHtml(signaturePeople[role] || "Nama & tanda tangan")}</div></div>`
    ).join("");
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan BKU - ${escapeHtml(book.name)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        @page{size:A4 portrait;margin:14mm 12mm 16mm}
        *{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:${theme.ink};font-family:"${font}",Arial,sans-serif;font-size:10px;line-height:1.45}
        .sheet{max-width:210mm;margin:22px auto;background:#fff;padding:13mm;box-shadow:0 8px 36px rgba(15,23,42,.12)}
        .top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:3px solid ${theme.primary};padding-bottom:15px}
        .brand{font-size:9px;font-weight:800;letter-spacing:2px;color:${theme.primary};text-transform:uppercase}.title{font-size:24px;line-height:1.1;font-weight:800;margin:5px 0 4px}.subtitle{font-size:10px;color:#64748b}
        .pill{background:${theme.soft};color:${theme.primary};padding:7px 10px;border-radius:8px;font-size:9px;font-weight:700;white-space:nowrap}
        .identity{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px;padding:13px 0;border-bottom:1px solid ${theme.border};font-size:9px}.identity span{color:#64748b;display:inline-block;min-width:98px}.identity strong{color:${theme.ink}}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:15px 0}.stat{background:${theme.soft};border:1px solid ${theme.border};border-radius:9px;padding:10px}.stat small{display:block;color:#64748b;font-size:8px}.stat strong{display:block;color:${theme.primary};font-size:12px;margin-top:3px}
        .section{margin:17px 0 8px;font-size:12px;font-weight:800;color:${theme.primary}}.table-wrap{width:100%}table{width:100%;border-collapse:collapse;font-size:8.5px}thead{display:table-header-group}th{background:${theme.primary};color:#fff;text-align:left;padding:8px 6px;font-size:8px;text-transform:uppercase;letter-spacing:.3px}td{border-bottom:1px solid ${theme.border};padding:7px 6px;vertical-align:top}tbody tr:nth-child(even){background:${theme.soft}}.nowrap{white-space:nowrap}.num{text-align:right;white-space:nowrap;font-weight:700}.in{color:#047857}.out{color:#be123c}.balance{color:${theme.primary}}.muted{color:#64748b;font-size:7.5px;margin-top:2px}.desc{font-weight:600}.line{display:grid;grid-template-columns:minmax(90px,1fr) auto auto;gap:6px;padding:2px 0;border-bottom:1px dotted ${theme.border}}.line:last-child{border:0}.line span:nth-child(2){color:#64748b;font-size:7.5px}.line strong{white-space:nowrap;font-size:8px}
        .closing{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}.closing div{border:1px solid ${theme.border};border-radius:8px;padding:9px}.closing small{display:block;color:#64748b}.closing strong{display:block;margin-top:3px;color:${theme.primary};font-size:11px}
        .signatures{display:grid;grid-template-columns:repeat(${signatoryRoles.length},minmax(0,1fr));gap:16px;margin-top:34px;text-align:center;font-size:8.5px}.signatures div{min-height:64px}.signatures .line-sign{margin-top:42px;border-top:1px solid #94a3b8;padding-top:5px}
        .foot{margin-top:20px;border-top:1px solid ${theme.border};padding-top:8px;color:#64748b;font-size:8px;display:flex;justify-content:space-between}
        .printbar{display:flex;justify-content:flex-end;max-width:210mm;margin:12px auto}.printbar button{border:0;border-radius:8px;padding:10px 16px;background:${theme.primary};color:white;font-weight:700;cursor:pointer}
        @media print{body{background:#fff}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.printbar{display:none}tr,.stat,.closing div,.identity{break-inside:avoid}.section{break-after:avoid}}
        @media screen and (max-width:700px){.sheet{margin:0;padding:18px}.summary{grid-template-columns:1fr 1fr}.identity{grid-template-columns:1fr}.table-wrap{overflow-x:auto}table{min-width:720px}}
      </style></head><body>
      <div class="printbar"><button onclick="window.print()">Cetak / Simpan sebagai PDF</button></div>
      <main class="sheet">
        <header class="top"><div><div class="brand">Dahlia Management System · Buku Kas Eksternal</div><h1 class="title">Laporan Buku Kas Umum</h1><div class="subtitle">Periode ${dateFormat(exportStartDate)} – ${dateFormat(rangeEnd)}</div></div><div class="pill">DOKUMEN PEMBUKUAN</div></header>
        <section class="identity">
          <div><span>Nama Sekolah</span><strong>${escapeHtml(book.name)}</strong></div>
          <div><span>NPSN</span><strong>${escapeHtml(book.npsn || "—")}</strong></div>
          <div><span>Alamat</span><strong>${escapeHtml(book.address || "—")}</strong></div>
          <div><span>Telepon</span><strong>${escapeHtml(book.phone || "—")}</strong></div>
          <div><span>Kepala Sekolah</span><strong>${escapeHtml(book.school_head || "—")}</strong></div>
          <div><span>Perencana</span><strong>${escapeHtml(book.planner || "—")}</strong></div>
          <div><span>Pengawas</span><strong>${escapeHtml(book.supervisor || "—")}</strong></div>
          <div><span>P2SP</span><strong>${escapeHtml(book.p2sp || "—")}</strong></div>
          <div><span>Tanggal cetak</span><strong>${dateFormat(dateKey(new Date()))}</strong></div>
        </section>
        <section class="summary">
          <div class="stat"><small>Saldo awal periode</small><strong>${openingTotal}</strong></div>
          <div class="stat"><small>Pemasukan periode</small><strong>${money(periodIncoming)}</strong></div>
          <div class="stat"><small>Pengeluaran periode</small><strong>${money(periodOutgoing)}</strong></div>
          <div class="stat"><small>Saldo akhir periode</small><strong>${closingTotal}</strong></div>
        </section>
        <div class="section">Rincian transaksi dan nota</div>
        <div class="table-wrap"><table><thead><tr><th style="width:12%">Tanggal</th><th style="width:13%">No. Nota / Jenis</th><th style="width:38%">Uraian / Rincian Material</th><th style="width:12%;text-align:right">Masuk</th><th style="width:12%;text-align:right">Keluar</th><th style="width:13%;text-align:right">Saldo</th></tr></thead><tbody>${transactionRows || '<tr><td colspan="6" style="text-align:center;padding:22px;color:#64748b">Belum ada transaksi pada buku kas ini.</td></tr>'}</tbody></table></div>
        <div class="section">Posisi saldo akhir</div>
        <section class="closing"><div><small>Saldo tunai akhir periode</small><strong>${closingCash}</strong></div><div><small>Saldo bank / non-tunai akhir periode</small><strong>${closingBank}</strong></div><div><small>Total saldo akhir periode</small><strong>${closingTotal}</strong></div></section>
        <section class="signatures">${signatureHtml}</section>
        <footer class="foot"><span>BKU Eksternal · Database terpisah</span><span>Dicetak ${dateFormat(dateKey(new Date()))}</span></footer>
      </main></body></html>`;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 900);
    setShowExport(false);
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
          <div><p className="text-sm text-slate-500">Pembukuan sekolah / proyek eksternal</p><h2 className="mt-1 text-2xl font-black">{book?.name || "Belum ada buku kas"}</h2>{book && <p className="mt-1 text-xs leading-5 text-slate-500">Kepala Sekolah: {book.school_head || "—"} · Perencana: {book.planner || "—"} · Pengawas: {book.supervisor || "—"} · P2SP: {book.p2sp || "—"}</p>}</div>
          <div className="flex flex-wrap gap-2">
            {books.length > 0 && <select value={book?.id || ""} onChange={(e) => setBook(books.find((item) => item.id === e.target.value) || null)} className="h-11 max-w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="">Pilih buku kas</option>{books.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            <button onClick={() => setShowNewBook(true)} className="flex h-11 items-center gap-2 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50"><Plus size={17} />Buku kas baru</button>
            {book && <button onClick={() => { setExportStartDate(book.start_date); setExportEndDate(ordered.reduce((latest, tx) => tx.transaction_date > latest ? tx.transaction_date : latest, dateKey(new Date()))); setShowExport(true); }} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download size={17} />Export PDF</button>}
            {book && <button onClick={() => { setEditingTransactionId(null); setDrafts([blankDraft()]); setShowEntry(true); }} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"><Plus size={17} />Catat transaksi</button>}
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
              <div className="flex flex-wrap rounded-xl bg-slate-200/70 p-1">
                <button onClick={() => setView("calendar")} className={"rounded-lg px-4 py-2 text-sm font-bold " + (view === "calendar" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600")}>Kalender</button>
                <button onClick={() => setView("ledger")} className={"rounded-lg px-4 py-2 text-sm font-bold " + (view === "ledger" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600")}>Buku transaksi</button>
                <button onClick={() => setView("profile")} className={"flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-bold " + (view === "profile" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600")}><Settings size={14}/>Profil lembaga</button>
              </div>
              <p className="text-xs text-slate-500">{view === "calendar" ? "Geser penanda tanggal mulai ke tanggal target untuk memindahkan seluruh jadwal nota." : view === "ledger" ? "Daftar seluruh nota dan transaksi yang sudah dicatat." : "Perbarui identitas dan informasi lembaga."}</p>
            </div>

            {view === "calendar" ? (
              <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kalender pembukuan</p><h3 className="mt-1 text-xl font-black capitalize">{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(month)}</h3><p className="mt-1 text-[11px] text-slate-500">Tanggal mulai: {new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"long",year:"numeric"}).format(new Date(book.start_date+"T00:00:00"))}</p></div>
                    <div draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", "bku-project-start")} className="cursor-grab rounded-xl border border-dashed border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 active:cursor-grabbing" title="Seret penanda ini ke tanggal target pada kalender">{shiftingSchedule ? "Memindahkan jadwal..." : "↕ Seret tanggal mulai proyek"}</div>
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
                        <button key={key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.getData("text/plain") === "bku-project-start") void shiftProjectStart(key); }} onClick={() => { setSelectedDate(key); if (!dayTotals[key]?.count) { setEditingTransactionId(null); setDrafts([blankDraft()]); setShowEntry(true); } else { setShowEntry(false); } }} className={"min-h-[88px] rounded-xl border p-1.5 text-left transition sm:min-h-[110px] sm:p-2 " + (active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-slate-50")}>
                          <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold " + (active ? "bg-emerald-700 text-white" : "text-slate-700")}>{day}</span>{key === book.start_date && <span className="ml-1 rounded bg-emerald-700 px-1 py-0.5 text-[8px] font-bold text-white">MULAI</span>}
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
                    {selectedRows.length === 0 ? <div className="rounded-xl bg-slate-50 p-6 text-center"><CalendarDays className="mx-auto text-slate-300" size={26} /><p className="mt-2 text-sm font-semibold text-slate-600">Belum ada transaksi</p><p className="mt-1 text-xs text-slate-400">Tambah beberapa nota sekaligus untuk tanggal ini.</p></div> : selectedRows.map((tx) => <TransactionCard key={tx.id} tx={tx} balance={balances.rows[tx.id]} onEvidence={openEvidence} onEdit={openEditTransaction} onCopy={openCopyTransaction} onDelete={deleteTransaction} />)}
                  </div>
                  {lastSelectedBalance && <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-400">Saldo setelah transaksi terakhir hari ini</p><p className="mt-1 text-xl font-black">{money(lastSelectedBalance.total)}</p><p className="mt-1 text-xs text-slate-400">Tunai {money(lastSelectedBalance.cash)} · Bank {money(lastSelectedBalance.bank)}</p></div>}
                </div>
              </section>
            ) : view === "ledger" ? (
              <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="font-black">Buku transaksi</h3><p className="text-xs text-slate-500">Urut berdasarkan tanggal dan waktu pencatatan</p></div><span className="text-xs font-semibold text-slate-500">{ordered.length} transaksi</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Uraian</th><th className="px-4 py-3">Metode</th><th className="px-4 py-3 text-right">Kas masuk</th><th className="px-4 py-3 text-right">Kas keluar</th><th className="px-4 py-3 text-right">Saldo akhir</th><th className="px-4 py-3">Tindakan</th></tr></thead>
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
                          <td className="whitespace-nowrap px-4 py-3"><div className="flex gap-1"><button onClick={() => openEditTransaction(tx)} className="rounded border border-slate-200 px-2 py-1 text-xs">Ubah</button><button onClick={() => openCopyTransaction(tx)} className="rounded border border-slate-200 px-2 py-1 text-xs">Salin</button><button onClick={() => void deleteTransaction(tx)} className="rounded border border-rose-100 px-2 py-1 text-xs text-rose-700">Hapus</button></div></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Pengaturan lembaga</p><h3 className="mt-1 text-xl font-black">Profil sekolah / lembaga</h3><p className="mt-1 text-sm text-slate-500">Identitas ini digunakan pada header laporan dan dokumen PDF BKU.</p></div>
                <form onSubmit={saveProfile} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nama Sekolah / Lembaga"><input required value={book.name} onChange={(e) => setBook((current) => current ? {...current,name:e.target.value} : current)} className={fieldClass}/></Field>
                    <Field label="NPSN (opsional)"><input value={profileNpsn} onChange={(e) => setProfileNpsn(e.target.value)} className={fieldClass} placeholder="Nomor Pokok Sekolah Nasional"/></Field>
                    <Field label="Nama Kepala Sekolah"><input value={book.school_head} onChange={(e) => setBook((current) => current ? {...current,school_head:e.target.value} : current)} className={fieldClass}/></Field>
                    <Field label="Nama Perencana"><input value={book.planner} onChange={(e) => setBook((current) => current ? {...current,planner:e.target.value} : current)} className={fieldClass}/></Field>
                    <Field label="Nama Pengawas"><input value={book.supervisor} onChange={(e) => setBook((current) => current ? {...current,supervisor:e.target.value} : current)} className={fieldClass}/></Field>
                    <Field label="Nama P2SP"><input value={book.p2sp} onChange={(e) => setBook((current) => current ? {...current,p2sp:e.target.value} : current)} className={fieldClass}/></Field>
                    <Field label="Nomor telepon lembaga"><input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className={fieldClass} placeholder="Nomor kontak"/></Field>
                    <Field label="Alamat lembaga"><input value={profileAddress} onChange={(e) => setProfileAddress(e.target.value)} className={fieldClass} placeholder="Alamat lengkap"/></Field>
                  </div>
                  <div className="flex justify-end border-t border-slate-100 pt-4"><button disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan profil lembaga"}</button></div>
                </form>
              </section>
            )}
          </>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <span className="font-black">!</span>
          <p>Pengingat nota Rp2.000.000 ditampilkan saat input melebihi batas. Nilai transaksi tetap dicatat sesuai nominal dan bukti yang sebenarnya; sistem tidak memecah satu pembelian menjadi nota semu.</p>
        </div>
      </div>

      {showExport && book && <Modal title="Export laporan BKU ke PDF" subtitle="Pilih gaya dokumen sebelum mencetak atau menyimpan sebagai PDF." onClose={() => setShowExport(false)}>
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-sm font-bold text-emerald-900">Periode laporan BKU</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">Atur tanggal awal dan tanggal akhir. PDF hanya memuat nota dalam rentang ini, sementara saldo awal dihitung dari transaksi sebelum tanggal awal.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Dari tanggal"><input type="date" required value={exportStartDate} max={exportEndDate} onChange={(e) => setExportStartDate(e.target.value)} className={fieldClass}/></Field>
              <Field label="Sampai tanggal"><input type="date" required value={exportEndDate} min={exportStartDate} onChange={(e) => setExportEndDate(e.target.value)} className={fieldClass}/></Field>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <button type="button" onClick={() => {setExportStartDate(book.start_date);setExportEndDate(ordered.reduce((latest, tx) => tx.transaction_date > latest ? tx.transaction_date : latest, dateKey(new Date())));}} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-semibold text-emerald-800">Seluruh periode</button>
              <button type="button" onClick={() => {const now = new Date();setExportStartDate(dateKey(new Date(now.getFullYear(), now.getMonth(), 1)));setExportEndDate(dateKey(now));}} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-semibold text-emerald-800">Bulan ini</button>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">Transaksi yang masuk laporan: {ordered.filter((tx) => tx.transaction_date >= exportStartDate && tx.transaction_date <= exportEndDate).length} nota / transaksi.</p>
          </div>
          <Field label="Tema dokumen (20 pilihan)"><select value={exportTheme} onChange={(e) => setExportTheme(e.target.value)} className={fieldClass}>{exportThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}</select></Field>
          <Field label="Font dokumen (20 pilihan)"><select value={exportFont} onChange={(e) => setExportFont(e.target.value)} className={fieldClass}>{exportFonts.map((font) => <option key={font} value={font}>{font}</option>)}</select></Field>
          <Field label="Jumlah penandatangan"><select value={signatureCount} onChange={(e) => { setSignatureCount(e.target.value); setSignatoryRoles((current) => current.slice(0, Number(e.target.value))); }} className={fieldClass}><option value="1">1 orang</option><option value="2">2 orang</option><option value="3">3 orang</option><option value="4">4 orang</option></select></Field>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-700">Pilih pihak yang menandatangani (tepat {signatureCount} orang)</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {([{id:"school_head",label:"Kepala Sekolah"},{id:"p2sp",label:"P2SP"},{id:"supervisor",label:"Pengawas"},{id:"planner",label:"Perencana"}]).map((role) => {
                const checked = signatoryRoles.includes(role.id);
                return <label key={role.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={checked} disabled={!checked && signatoryRoles.length >= Number(signatureCount)} onChange={(e) => setSignatoryRoles((current) => e.target.checked ? [...current, role.id] : current.filter((item) => item !== role.id))} />
                  {role.label}
                </label>;
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">Terpilih {signatoryRoles.length} dari {signatureCount} penandatangan.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold text-slate-700">Pratinjau gaya</p><div className="mt-2 flex items-center gap-3 rounded-lg p-3" style={{ background: exportThemes.find((item) => item.id === exportTheme)?.soft }}><span className="h-9 w-2 rounded-full" style={{ background: exportThemes.find((item) => item.id === exportTheme)?.primary }} /><div><p className="text-sm font-bold" style={{ color: exportThemes.find((item) => item.id === exportTheme)?.primary }}>Laporan Buku Kas Umum</p><p className="text-xs text-slate-500" style={{ fontFamily: exportFont }}>Font: {exportFont} · Tema: {exportThemes.find((item) => item.id === exportTheme)?.label}</p></div></div></div>
          <p className="text-xs leading-5 text-slate-500">PDF memuat identitas sekolah, ringkasan saldo, seluruh transaksi, rincian material per nota, dan kolom tanda tangan. Pada dialog cetak, pilih tujuan “Save as PDF / Simpan sebagai PDF”.</p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowExport(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button><button type="button" onClick={exportBkuPdf} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white"><Download size={16} />Buat PDF</button></div>
        </div>
      </Modal>}
      {showNewBook && <Modal title="Buat buku kas baru" onClose={() => setShowNewBook(false)}>
        <form onSubmit={createBook} className="space-y-4">
          <Field label="Nama Sekolah"><input required autoFocus value={bookName} onChange={(e) => setBookName(e.target.value)} placeholder="Nama sekolah" className={fieldClass} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama Kepala Sekolah"><input required value={schoolHead} onChange={(e) => setSchoolHead(e.target.value)} placeholder="Nama kepala sekolah" className={fieldClass} /></Field>
            <Field label="Nama Perencana"><input required value={planner} onChange={(e) => setPlanner(e.target.value)} placeholder="Nama perencana" className={fieldClass} /></Field>
            <Field label="Nama Pengawas"><input required value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Nama pengawas" className={fieldClass} /></Field>
            <Field label="Nama P2SP"><input required value={p2sp} onChange={(e) => setP2sp(e.target.value)} placeholder="Nama P2SP" className={fieldClass} /></Field>
          </div>
          <Field label="Tanggal mulai pembukuan"><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Saldo awal tunai (Rp)"><input inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className={fieldClass} /></Field>
            <Field label="Saldo awal bank (Rp)"><input inputMode="numeric" value={openingBank} onChange={(e) => setOpeningBank(e.target.value)} className={fieldClass} /></Field>
          </div>
          <ModalActions busy={saving} onCancel={() => setShowNewBook(false)} submitLabel="Buat buku kas" />
        </form>
      </Modal>}

      {copySource && <Modal title="Salin nota ke tanggal lain" subtitle={`Salinan nota ${copySource.receipt_number || copySource.description}`} onClose={() => setCopySource(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Rincian nota akan disalin sebagai nota baru. Nota asli tetap utuh, dan Anda dapat mengubah sedikit perbedaannya sebelum menyimpan.</p>
          <Field label="Tanggal tujuan"><input type="date" value={copyTargetDate} onChange={(e) => setCopyTargetDate(e.target.value)} className={fieldClass}/></Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setCopySource(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button><button type="button" onClick={() => void confirmCopyTransaction()} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white">Salin dan edit nota</button></div>
        </div>
      </Modal>}
      {showEntry && book && <Modal title={editingTransactionId ? "Ubah nota / transaksi" : "Catat transaksi harian"} subtitle={new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(selectedDate + "T00:00:00"))} onClose={() => setShowEntry(false)} wide>
        <form onSubmit={saveEntries} className="space-y-4">
          {drafts.map((draft, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-black text-slate-800">Nota / transaksi {index + 1}</p>{drafts.length > 1 && <button type="button" onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} className="text-xs font-semibold text-rose-600">Hapus baris</button>}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Jenis transaksi"><select value={draft.transaction_type} onChange={(e) => updateDraft(index, { transaction_type: e.target.value as TxType, category: e.target.value === "IN" ? "modal" : e.target.value === "TRANSFER" ? "transfer" : "material" })} className={fieldClass}><option value="OUT">Kas keluar</option><option value="IN">Kas masuk</option><option value="TRANSFER">Transfer tunai ↔ bank</option></select></Field>
              <Field label="Kategori"><select value={draft.category} onChange={(e) => updateDraft(index, { category: e.target.value })} className={fieldClass}>{(draft.transaction_type === "IN" ? incomeCategories : draft.transaction_type === "OUT" ? expenseCategories : [["transfer", "Pemindahan saldo"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              {draft.transaction_type !== "OUT" ? <Field label="Nominal (Rp)"><input required inputMode="numeric" value={draft.amount} onChange={(e) => updateDraft(index, { amount: e.target.value })} placeholder="0" className={fieldClass} />{amountValue(draft.amount) > 2000000 && <span className="mt-1 block text-[11px] font-semibold text-amber-700">Pengingat: periksa nota dan nominal sebenarnya (di atas Rp2 juta).</span>}</Field> : <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Jumlah nota otomatis</p><p className="mt-1 text-lg font-black text-emerald-900">{money(draftDetailsTotal(draft))}</p>{draftDetailsTotal(draft) > 2000000 && <p className="mt-1 text-[11px] font-semibold text-amber-800">Pengingat: jumlah nota melebihi Rp2 juta. Pencatatan tetap dapat dilanjutkan sesuai nominal sebenarnya.</p>}</div>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={draft.transaction_type === "OUT" ? "Nama toko / uraian nota (opsional)" : "Uraian transaksi"}><input required={draft.transaction_type !== "OUT"} value={draft.description} onChange={(e) => updateDraft(index, { description: e.target.value })} placeholder={draft.transaction_type === "OUT" ? "Nama toko / pemasok" : "Contoh: Dana bantuan masuk"} className={fieldClass} /></Field>
              <Field label="Nomor nota / referensi"><input value={draft.receipt_number} onChange={(e) => updateDraft(index, { receipt_number: e.target.value })} placeholder="Opsional" className={fieldClass} /></Field>
            </div>
            {draft.transaction_type === "OUT" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Pilih toko yang pernah digunakan"><select value={draft.store_id} onChange={(e) => { const store = stores.find((item) => item.id === e.target.value); updateDraft(index, { store_id: e.target.value, store_name: store?.name || "" }); }} className={fieldClass}><option value="">Tambah / tulis nama toko baru</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>
              <Field label="Nama toko (otomatis tersimpan per sekolah)"><input value={draft.store_name} onChange={(e) => updateDraft(index, { store_name: e.target.value, store_id: "" })} placeholder="Nama toko / supplier" className={fieldClass}/></Field>
            </div>}
            {draft.transaction_type === "OUT" && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-slate-800">Rincian nota pengeluaran</p><p className="text-[11px] text-slate-500">Masukkan setiap material / barang sebagai baris tersendiri.</p></div>
                <button type="button" onClick={() => updateDraft(index, { details: [...draft.details, { name: "", unit_price: "", volume: "", unit: "pcs", material_id: "" }] })} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><Plus size={14} className="mr-1 inline" />Tambah material</button>
              </div>
              <div className="space-y-3">
                {draft.details.map((line, lineIndex) => <div key={lineIndex} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold text-slate-500">Material {lineIndex + 1}</span>{draft.details.length > 1 && <button type="button" onClick={() => updateDraft(index, { details: draft.details.filter((_, i) => i !== lineIndex) })} className="text-[11px] font-semibold text-rose-600">Hapus</button>}</div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(220px,1.8fr)_minmax(170px,1.4fr)_1fr_.7fr_.7fr_1fr]">
                    <Field label="Pilih material dari katalog"><select value={line.material_id || ""} onChange={(e) => void updateDraftMaterial(index, lineIndex, e.target.value)} className={fieldClass}><option value="">Material baru / ketik manual</option>{Array.from(new Set(materials.map((item) => item.category))).map((category) => <optgroup key={category} label={category}>{materials.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit} · {money(Number(item.unit_price))}</option>)}</optgroup>)}</select></Field>
                    <Field label="Nama material"><input value={line.name} onChange={(e) => updateDraft(index, { details: draft.details.map((item, i) => i === lineIndex ? { ...item, name: e.target.value, material_id: "" } : item) })} placeholder="Cari / ketik nama material baru" className={fieldClass} /></Field>
                    <Field label="Harga satuan (Rp)"><input inputMode="numeric" value={line.unit_price} onChange={(e) => updateDraft(index, { details: draft.details.map((item, i) => i === lineIndex ? { ...item, unit_price: e.target.value } : item) })} placeholder="0" className={fieldClass} /></Field>
                    <Field label="Volume"><input inputMode="decimal" value={line.volume} onChange={(e) => updateDraft(index, { details: draft.details.map((item, i) => i === lineIndex ? { ...item, volume: e.target.value } : item) })} placeholder="0" className={fieldClass} /></Field>
                    <Field label="Satuan"><input value={line.unit} onChange={(e) => updateDraft(index, { details: draft.details.map((item, i) => i === lineIndex ? { ...item, unit: e.target.value } : item) })} placeholder="sak/m³" className={fieldClass} /></Field>
                    <div className="self-end pb-1"><p className="text-[10px] font-bold text-slate-400">TOTAL</p><p className="mt-1 text-sm font-black text-slate-800">{money(detailLineTotal(line))}</p></div>
                  </div>
                </div>)}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-600">Jumlah seluruh rincian nota</span><strong className="text-base font-black text-emerald-800">{money(draftDetailsTotal(draft))}</strong></div>
            </div>}
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
          <ModalActions busy={saving} onCancel={() => { setShowEntry(false); setEditingTransactionId(null); }} submitLabel={editingTransactionId ? "Simpan perubahan nota" : "Simpan semua transaksi"} />
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
function TransactionCard({
  tx, balance, onEvidence, onEdit, onCopy, onDelete,
}: {
  tx: Transaction;
  balance?: { cash: number; bank: number; total: number };
  onEvidence: (path: string) => void;
  onEdit: (tx: Transaction) => void;
  onCopy: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const incoming = tx.transaction_type === "IN";
  const transfer = tx.transaction_type === "TRANSFER";
  return <article className="rounded-xl border border-slate-100 p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + (transfer ? "bg-blue-50 text-blue-700" : incoming ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{transfer ? <ArrowLeftRight size={16} /> : incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-800">{tx.description}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{categoryLabel(tx.category)} · {transfer ? tx.from_account + " → " + tx.to_account : tx.account === "BANK" ? "Bank / non-tunai" : "Tunai"}</p>
          {tx.store_name && <p className="mt-1 text-[11px] font-semibold text-slate-600">Toko / pihak: {tx.store_name}</p>}
          {tx.receipt_number && <p className="mt-1 text-[11px] text-slate-500">Nota: {tx.receipt_number}</p>}
          {tx.details?.length ? <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">{tx.details.slice(0, 5).map((line, i) => <p key={i}>{line.name} · {Number(line.volume).toLocaleString("id-ID")} {line.unit} × {money(Number(line.unit_price))} = <strong>{money(Number(line.line_total || line.volume * line.unit_price))}</strong></p>)}{tx.details.length > 5 && <p>+ {tx.details.length - 5} material lainnya</p>}</div> : null}
        </div>
      </div>
      <div className="shrink-0 text-right"><p className={"text-sm font-black " + (transfer ? "text-blue-700" : incoming ? "text-emerald-700" : "text-rose-700")}>{incoming ? "+" : transfer ? "↔" : "-"}{money(Number(tx.amount))}</p>{balance && <p className="mt-1 text-[10px] text-slate-400">Saldo {money(balance.total)}</p>}</div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      {tx.evidence_path && <button onClick={() => onEvidence(tx.evidence_path as string)} className="mr-auto text-xs font-semibold text-emerald-700 hover:underline">Lihat bukti</button>}
      {!tx.evidence_path && <span className="mr-auto text-[10px] text-slate-400">Nota #{tx.entry_no}</span>}
      <button onClick={() => onEdit(tx)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Ubah</button>
      <button onClick={() => onCopy(tx)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Copy size={13}/>Salin</button>
      <button onClick={() => onDelete(tx)} className="flex items-center gap-1 rounded-lg border border-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={13}/>Hapus</button>
    </div>
  </article>;
}
