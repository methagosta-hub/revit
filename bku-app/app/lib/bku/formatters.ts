import type { Draft, ExportTheme, Material, ReportCategory, TxType } from "./types";

export const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number.isFinite(value) ? value : 0);

export const numberFormat = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);

export const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

/**
 * Validasi tanggal kalender dalam format database/browser YYYY-MM-DD.
 * Tidak memakai Date.parse(string) agar parsing tanggal konsisten di semua browser.
 */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

/** Konversi YYYY-MM-DD ke Date lokal; null jika tanggal kosong/tidak valid. */
export function dateFromKey(value: unknown): Date | null {
  if (!isValidDateKey(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "long", year: "numeric",
}) => {
  const date = dateFromKey(value);
  // Input tanggal dapat kosong sesaat ketika pengguna mengetik lewat kontrol tanggal.
  // Jangan biarkan Intl.DateTimeFormat melempar RangeError dan merusak seluruh halaman.
  if (!date) return "—";
  return new Intl.DateTimeFormat("id-ID", options).format(date);
};

export const amountValue = (value: string) => Number(value.replace(/[^0-9]/g, "")) || 0;

export const parseDecimal = (value: string) => {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return 0;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : trimmed.replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseUnitPrice = (value: string) => {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return 0;
  // Harga rupiah lazim memakai titik sebagai pemisah ribuan; koma dipakai untuk desimal bila diperlukan.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : trimmed.replace(/\./g, "").replace(/[^0-9-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

export const detailLineTotal = (line: Pick<Draft["details"][number], "unit_price" | "volume">) =>
  Math.round(parseUnitPrice(line.unit_price) * parseDecimal(line.volume));

export const draftDetailsTotal = (draft: Draft) =>
  draft.details.reduce((sum, line) => sum + detailLineTotal(line), 0);

export const blankDetail = () => ({ name: "", unit_price: "", volume: "", unit: "pcs", material_id: "" });

export const blankDraft = (): Draft => ({
  transaction_type: "OUT",
  category: "material",
  description: "",
  amount: "",
  account: "CASH",
  from_account: "CASH",
  to_account: "BANK",
  receipt_number: "",
  file: null,
  store_id: "",
  store_name: "",
  details: [blankDetail()],
});

export const expenseCategories = [
  ["material", "Pembelian material"],
  ["upah", "Gaji Harian Tukang"],
  ["operasional", "Operasional proyek"],
  ["transportasi", "Transportasi"],
  ["konsumsi", "Konsumsi"],
  ["ape", "APE"],
  ["meubeler", "Meubeler"],
  ["smkk", "SMKK"],
  ["lainnya", "Lain-lain"],
] as const;

export const incomeCategories = [
  ["modal", "Modal / dana proyek"],
  ["termin", "Penerimaan termin"],
  ["pengembalian", "Pengembalian dana"],
  ["lainnya", "Pemasukan lainnya"],
] as const;

export function categoryLabel(value: string, categories: ReportCategory[] = [], transactionType?: TxType) {
  const dynamic = categories.find((item) => item.code === value && (!transactionType || item.transaction_type === transactionType));
  if (dynamic) return dynamic.label;
  const options = transactionType === "IN"
    ? incomeCategories
    : transactionType === "OUT"
      ? expenseCategories
      : [...expenseCategories, ...incomeCategories, ["transfer", "Pemindahan saldo"]] as const;
  return options.find(([key]) => key === value)?.[1] || value;
}

export function shortMoney(value: number) {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp${value.toLocaleString("id-ID")}`;
}

export function isInMonth(value: string, month: Date) {
  const date = dateFromKey(value);
  return Boolean(date && Number.isFinite(month.getTime()) && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth());
}

export const fieldClass = "mt-1.5 h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50";

export const exportThemes: ExportTheme[] = [
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
];

export const exportFonts = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito Sans", "Manrope", "DM Sans", "Plus Jakarta Sans",
  "Work Sans", "Source Sans 3", "Ubuntu", "Rubik", "Outfit", "Space Grotesk", "Urbanist", "Mulish", "Figtree", "IBM Plex Sans",
] as const;

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

export function materialOptionsByCategory(materials: Material[]) {
  return Array.from(new Set(materials.map((item) => item.category))).map((category) => ({
    category,
    items: materials.filter((item) => item.category === category),
  }));
}
