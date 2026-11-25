export type PdfExportSection = "bku" | "attendance" | "materials";

const sectionNames: Record<PdfExportSection, string> = {
  bku: "BKU",
  attendance: "Matriks-Absensi",
  materials: "Rekap-Material",
};

function safeFilenamePart(value: string, maxLength = 42) {
  const safe = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return safe || "Dokumen";
}

function localTimestamp(date: Date) {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join("");
}

function uniqueToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Membentuk judul dokumen yang juga dipakai browser sebagai nama saran file PDF.
 * Timestamp milidetik + UUID acak menjaga nama file tetap unik pada ekspor berulang.
 */
export function buildUniquePdfFilename(input: {
  projectName: string;
  startDate: string;
  endDate: string;
  sections: PdfExportSection[];
  now?: Date;
}) {
  if (!input.sections.length) throw new Error("Pilih minimal satu jenis laporan untuk diekspor.");
  const uniqueSections = Array.from(new Set(input.sections));
  const reports = uniqueSections.map((section) => sectionNames[section]).join("+");
  const timestamp = localTimestamp(input.now || new Date());
  return [
    "JAVAWASTHU_MANAGEMENT",
    safeFilenamePart(input.projectName),
    reports,
    input.startDate,
    input.endDate,
    timestamp,
    uniqueToken(),
  ].join("-");
}
