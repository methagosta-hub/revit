"use client";

import type { SignatoryRole } from "@/app/lib/bku/types";
import type { PdfExportSection } from "@/app/components/reports/exportFilename";
import { exportFonts, exportThemes, fieldClass } from "@/app/lib/bku/formatters";
import { AppModal } from "@/app/components/layout/AppModal";
import { FormField } from "@/app/components/layout/FormField";
import { Download, FileText } from "lucide-react";

const exportSections: { id: PdfExportSection; label: string; description: string }[] = [
  { id: "bku", label: "Buku Kas Umum (BKU)", description: "Saldo awal, transaksi masuk/keluar, rincian nota, dan saldo akhir." },
  { id: "attendance", label: "Matriks Absensi", description: "Kehadiran Minggu–Sabtu, total HOK, dan nilai upah per pekerja." },
  { id: "materials", label: "Rekap Total Material", description: "Total belanja per kelompok dan rincian total per item." },
];

const roles: { id: SignatoryRole; label: string }[] = [
  { id: "school_head", label: "Kepala Sekolah" },
  { id: "p2sp", label: "P2SP" },
  { id: "supervisor", label: "Pengawas" },
  { id: "planner", label: "Perencana" },
];

export function ExportPdfModal({
  open,
  startDate,
  endDate,
  themeId,
  font,
  financialSignatoryRoles,
  attendanceSignatoryRoles,
  selectedSections,
  onSelectedSectionsChange,
  onStartDateChange,
  onEndDateChange,
  onThemeChange,
  onFontChange,
  onFinancialSignatoryChange,
  onAttendanceSignatoryChange,
  onClose,
  onExport,
}: {
  open: boolean;
  startDate: string;
  endDate: string;
  themeId: string;
  font: string;
  financialSignatoryRoles: SignatoryRole[];
  attendanceSignatoryRoles: SignatoryRole[];
  selectedSections: PdfExportSection[];
  onSelectedSectionsChange: (sections: PdfExportSection[]) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onThemeChange: (value: string) => void;
  onFontChange: (value: string) => void;
  onFinancialSignatoryChange: (roles: SignatoryRole[]) => void;
  onAttendanceSignatoryChange: (roles: SignatoryRole[]) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  if (!open) return null;
  const theme = exportThemes.find((item) => item.id === themeId) || exportThemes[0];
  return (
    <AppModal title="Export laporan BKU ke PDF" subtitle="Pilih jenis laporan dan rentang tanggal. Semua bagian yang dicentang akan digabung ke dalam satu PDF." onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2"><FileText className="text-emerald-700" size={18}/><h3 className="text-sm font-black text-slate-800">Rentang laporan</h3></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Tanggal awal"><input type="date" required value={startDate} max={endDate || undefined} onChange={(event) => onStartDateChange(event.target.value)} className={fieldClass}/></FormField>
              <FormField label="Tanggal akhir"><input type="date" required value={endDate} min={startDate || undefined} onChange={(event) => onEndDateChange(event.target.value)} className={fieldClass}/></FormField>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Saldo awal laporan dihitung otomatis berdasarkan transaksi sebelum tanggal awal. Saldo akhir dihitung sampai transaksi terakhir pada tanggal akhir.</p>
          </section>
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-800">Pilih bagian yang akan diekspor</h3>
              <span className="text-[10px] font-semibold text-emerald-700">{selectedSections.length} dari 3 dipilih</span>
            </div>
            <div className="space-y-2">
              {exportSections.map((section) => (
                <label key={section.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-emerald-300">
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(section.id)}
                    onChange={(event) => onSelectedSectionsChange(
                      event.target.checked
                        ? [...selectedSections, section.id]
                        : selectedSections.filter((item) => item !== section.id)
                    )}
                    className="mt-0.5 h-4 w-4 accent-emerald-700"
                  />
                  <span className="min-w-0">
                    <strong className="block text-xs text-slate-800">{section.label}</strong>
                    <span className="mt-0.5 block text-[10px] leading-5 text-slate-500">{section.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Bagian terpilih dibuat sebagai satu dokumen PDF. Nama file dibuat otomatis dan diberi kode unik pada setiap ekspor.</p>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <FormField label="Tema dokumen"><select value={themeId} onChange={(event) => onThemeChange(event.target.value)} className={fieldClass}>{exportThemes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></FormField>
            <FormField label="Jenis font"><select value={font} onChange={(event) => onFontChange(event.target.value)} className={fieldClass}>{exportFonts.map((item) => <option key={item} value={item}>{item}</option>)}</select></FormField>
          </section>
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-800">Tanda tangan rekap keuangan</h3><span className="text-[10px] font-semibold text-slate-400">{financialSignatoryRoles.length} dipilih</span></div>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">Blok tanda tangan ini ditempatkan tepat di bawah saldo akhir periode pada rekap keuangan.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{roles.map((role) => <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={financialSignatoryRoles.includes(role.id)} onChange={(event) => onFinancialSignatoryChange(event.target.checked ? [...financialSignatoryRoles, role.id] : financialSignatoryRoles.filter((item) => item !== role.id))} className="accent-emerald-700"/>{role.label}</label>)}</div>
          </section>
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-800">Tanda tangan matriks absensi</h3><span className="text-[10px] font-semibold text-slate-400">{attendanceSignatoryRoles.length} dipilih</span></div>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">Pilihan ini terpisah dari rekap keuangan dan ditempatkan setelah seluruh matriks absensi pekerja.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{roles.map((role) => <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={attendanceSignatoryRoles.includes(role.id)} onChange={(event) => onAttendanceSignatoryChange(event.target.checked ? [...attendanceSignatoryRoles, role.id] : attendanceSignatoryRoles.filter((item) => item !== role.id))} className="accent-emerald-700"/>{role.label}</label>)}</div>
          </section>
        </div>
        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pratinjau tampilan</p>
            <div className="mt-3 rounded-xl border p-4" style={{ background: theme.soft, borderColor: theme.border }}>
              <div className="h-1.5 w-12 rounded-full" style={{ background: theme.primary }}/>
              <p className="mt-4 text-lg font-black" style={{ color: theme.primary }}>Laporan Buku Kas Umum</p>
              <p className="mt-1 text-xs text-slate-500">Rekapitulasi sesuai rentang tanggal</p>
              <div className="mt-4 space-y-2"><div className="h-2 w-full rounded bg-white/80"/><div className="h-2 w-4/5 rounded bg-white/80"/><div className="h-2 w-3/5 rounded bg-white/80"/></div>
              <div className="mt-5 border-t pt-3" style={{ borderColor: theme.border }}><p className="text-[10px] font-bold" style={{ color: theme.primary }}>{theme.label}</p><p className="mt-1 text-[10px] text-slate-500" style={{ fontFamily: font }}>Font {font}</p></div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-700">Isi laporan</p><ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-500"><li>Identitas sekolah dan periode</li><li>Saldo awal sebelum periode</li><li>Daftar nota dan rincian material</li><li>Rekap kas masuk dan kas keluar</li><li>Saldo akhir tunai dan bank</li><li>Matriks absensi pekerja per minggu, nama, HOK, dan nilai upah</li><li>Kolom tanda tangan</li></ul></div>
        </aside>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="button" onClick={onExport} disabled={!startDate || !endDate || startDate > endDate || selectedSections.length === 0} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Download size={15}/>Buat PDF</button></div>
    </AppModal>
  );
}
