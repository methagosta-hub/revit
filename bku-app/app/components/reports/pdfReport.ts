import type { Book, SignatoryRole, Transaction, ExportTheme, Worker, WorkerAttendance } from "@/app/lib/bku/types";
import { calculateBalances, sortTransactions } from "@/app/lib/bku/balances";
import { escapeHtml, exportThemes, money, dateLabel, dateKey } from "@/app/lib/bku/formatters";

export type PdfReportOptions = {
  book: Book;
  transactions: Transaction[];
  startDate: string;
  endDate: string;
  themeId: string;
  font: string;
  signatoryRoles: SignatoryRole[];
  workers?: Worker[];
  attendance?: WorkerAttendance[];
};

export function buildBkuPdfHtml(options: PdfReportOptions) {
  const { book, transactions, startDate, endDate, themeId, font, signatoryRoles } = options;
  const workers = options.workers || [];
  const attendance = options.attendance || [];
  const theme = exportThemes.find((item) => item.id === themeId) || exportThemes[0];
  const ordered = sortTransactions(transactions);
  const before = ordered.filter((tx) => tx.transaction_date < startDate);
  const period = ordered.filter((tx) => tx.transaction_date >= startDate && tx.transaction_date <= endDate);
  const opening = calculateBalances(book, before);
  const periodOpeningBook = { opening_cash: opening.cash, opening_bank: opening.bank };
  const periodBalances = calculateBalances(periodOpeningBook, period);
  const closing = periodBalances;

  const signatureLabels: Record<SignatoryRole, string> = {
    school_head: "Kepala Sekolah",
    p2sp: "P2SP",
    supervisor: "Pengawas",
    planner: "Perencana",
  };
  const signatureNames: Record<SignatoryRole, string> = {
    school_head: book.school_head,
    p2sp: book.p2sp,
    supervisor: book.supervisor,
    planner: book.planner,
  };
  const signatures = signatoryRoles.map((role) => `
    <div class="signature"><strong>${signatureLabels[role]}</strong><div class="signature-space"></div><div class="signature-name">${escapeHtml(signatureNames[role] || "Nama & tanda tangan")}</div></div>
  `).join("");

  const rows = period.map((tx) => {
    const details = (tx.details || []).map((line) => `
      <div class="detail-line"><span>${escapeHtml(line.name)}</span><span>${Number(line.volume).toLocaleString("id-ID")} ${escapeHtml(line.unit || "")} × ${money(Number(line.unit_price))}</span><strong>${money(Number(line.line_total ?? Number(line.unit_price) * Number(line.volume)))}</strong></div>
    `).join("");
    const typeLabel = tx.transaction_type === "IN" ? "Kas masuk" : tx.transaction_type === "OUT" ? "Kas keluar" : "Transfer";
    const method = tx.transaction_type === "TRANSFER"
      ? `${tx.from_account === "BANK" ? "Bank" : "Tunai"} → ${tx.to_account === "BANK" ? "Bank" : "Tunai"}`
      : tx.account === "BANK" ? "Bank / non-tunai" : "Tunai";
    const movement = periodBalances.rows[tx.id];
    return `<tr>
      <td class="nowrap">${dateLabel(tx.transaction_date, { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td><strong>${escapeHtml(tx.receipt_number || `#${tx.entry_no}`)}</strong><div class="muted">${typeLabel} · ${method}${tx.store_name ? ` · ${escapeHtml(tx.store_name)}` : ""}</div>${tx.split_group_id ? `<div class="muted">Kelompok: ${escapeHtml(tx.split_group_label || "Nota terpisah")} · Total kelompok ${money(Number(tx.split_group_total || 0))}</div>` : ""}</td>
      <td><strong class="description">${escapeHtml(tx.description || "—")}</strong>${details ? `<div class="details">${details}</div>` : ""}</td>
      <td class="number incoming">${tx.transaction_type === "IN" ? money(Number(tx.amount)) : "—"}</td>
      <td class="number outgoing">${tx.transaction_type === "OUT" ? money(Number(tx.amount)) : "—"}</td>
      <td class="number balance">${money(movement?.total || 0)}</td>
    </tr>`;
  }).join("");

  const addDays = (value: string, days: number) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };
  const mondayOf = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return dateKey(date);
  };
  const workerAttendanceMap = new Map(attendance.map((item) => [`${item.worker_id}|${item.work_date}`, item]));
  const attendanceWeeks: string[] = [];
  for (let cursor = mondayOf(startDate), last = mondayOf(endDate); cursor <= last; cursor = addDays(cursor, 7)) attendanceWeeks.push(cursor);
  const attendanceSection = workers.length && attendanceWeeks.length ? `
    <section class="attendance-section">
      <div class="section">Matriks absensi dan upah pekerja</div>
      <div class="range-note">Daftar nama mencakup seluruh pekerja yang sudah bergabung sampai akhir periode. Pekerja yang baru masuk pada minggu berikutnya tetap ditampilkan dengan sel kosong pada minggu sebelumnya.</div>
      ${attendanceWeeks.map((weekStart) => {
        const weekDates = Array.from({ length: 6 }, (_, index) => addDays(weekStart, index));
        const weekEnd = weekDates[5];
        const weekTotal = attendance.filter((item) => item.work_date >= weekDates[0] && item.work_date <= weekEnd && item.work_date >= startDate && item.work_date <= endDate).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const workerRows = [...workers].sort((a, b) => a.worker_type.localeCompare(b.worker_type) || a.name.localeCompare(b.name)).map((worker) => {
          const workerWeekRows = attendance.filter((item) => item.worker_id === worker.id && item.work_date >= weekDates[0] && item.work_date <= weekEnd && item.work_date >= startDate && item.work_date <= endDate);
          const displayName = workerWeekRows[0]?.worker_name_snapshot || worker.name;
          const cells = weekDates.map((date) => {
            if (date < startDate || date > endDate || date < worker.joined_on) return `<td class="attendance-empty"></td>`;
            const item = workerAttendanceMap.get(`${worker.id}|${date}`);
            return `<td class="attendance-cell">${item && Number(item.hok) > 0 ? Number(item.hok).toLocaleString("id-ID", { maximumFractionDigits: 2 }) : ""}</td>`;
          }).join("");
          const rows = workerWeekRows;
          const totalHok = rows.reduce((sum, item) => sum + Number(item.hok || 0), 0);
          const totalPay = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
          const historicalRates = Array.from(new Set(rows.map((item) => Number(item.daily_rate_snapshot || 0))));
          const rateLabel = historicalRates.length > 1 ? "Bervariasi" : money(historicalRates[0] ?? Number(worker.daily_rate || 0));
          return `<tr><td>${workerWeekRows[0]?.worker_type_snapshot === "TUKANG" || (!workerWeekRows.length && worker.worker_type === "TUKANG") ? "Tukang" : "Pekerja"}</td><td class="worker-name">${escapeHtml(displayName)}</td><td class="number">${rateLabel}</td>${cells}<td class="number">${totalHok ? totalHok.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : ""}</td><td class="number attendance-pay">${totalPay ? money(totalPay) : ""}</td></tr>`;
        }).join("");
        return `<div class="attendance-week"><div class="attendance-week-title"><strong>Minggu ${dateLabel(weekStart, { day: "numeric", month: "short", year: "numeric" })} – ${dateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}</strong><span>Total nilai upah berdasarkan absensi: ${money(weekTotal)}</span></div><table class="attendance-table"><thead><tr><th>Jenis</th><th>Nama pekerja</th><th>Upah/hari</th>${["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"].map((day) => `<th>${day}</th>`).join("")}<th>Total HOK</th><th>Jumlah upah</th></tr></thead><tbody>${workerRows || `<tr><td colspan="11">Belum ada pekerja pada periode ini.</td></tr>`}</tbody></table></div>`;
      }).join("")}
    </section>` : `<section class="attendance-section"><div class="section">Matriks absensi dan upah pekerja</div><p class="range-note">Belum ada data daftar pekerja atau absensi pada rentang laporan ini.</p></section>`;

  return `<!doctype html><html lang="id"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Laporan BKU ${escapeHtml(book.name)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      @page{size:A4 portrait;margin:13mm 11mm 15mm}@page attendance{size:A4 landscape;margin:9mm 10mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:${theme.ink};font-family:"${font}",Arial,sans-serif;font-size:9px;line-height:1.45}.sheet{max-width:210mm;margin:20px auto;padding:12mm;background:#fff;box-shadow:0 10px 36px rgba(15,23,42,.12)}
      .toolbar{max-width:210mm;margin:12px auto;display:flex;justify-content:flex-end;gap:8px}.toolbar button{border:0;border-radius:8px;background:${theme.primary};color:#fff;padding:10px 15px;font:700 12px inherit;cursor:pointer}.toolbar .secondary{background:#475569}
      .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid ${theme.primary};padding-bottom:14px}.brand{font-size:8px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:${theme.primary}}h1{font-size:22px;line-height:1.1;margin:5px 0}.subtitle{font-size:9px;color:#64748b}.pill{border-radius:7px;background:${theme.soft};color:${theme.primary};padding:7px 10px;font-size:8px;font-weight:800;white-space:nowrap}
      .identity{display:grid;grid-template-columns:1fr 1fr;gap:6px 15px;padding:12px 0;border-bottom:1px solid ${theme.border}}.identity div{min-width:0}.identity span{display:inline-block;min-width:95px;color:#64748b}.identity strong{overflow-wrap:anywhere}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:13px 0}.stat{border:1px solid ${theme.border};border-radius:8px;background:${theme.soft};padding:8px}.stat small{display:block;color:#64748b;font-size:7px}.stat strong{display:block;margin-top:4px;color:${theme.primary};font-size:10px;overflow-wrap:anywhere}
      .section{margin:15px 0 7px;font-size:11px;font-weight:800;color:${theme.primary}}.range-note{margin-top:3px;color:#64748b;font-size:8px}table{width:100%;border-collapse:collapse;font-size:7.6px}thead{display:table-header-group}th{padding:7px 5px;background:${theme.primary};color:#fff;text-align:left;font-size:7px;letter-spacing:.25px;text-transform:uppercase}td{padding:6px 5px;border-bottom:1px solid ${theme.border};vertical-align:top}tbody tr:nth-child(even){background:${theme.soft}}.nowrap{white-space:nowrap}.number{text-align:right;white-space:nowrap;font-weight:700}.incoming{color:#047857}.outgoing{color:#be123c}.balance{color:${theme.primary}}.muted{margin-top:2px;color:#64748b;font-size:6.7px}.description{display:block;overflow-wrap:anywhere}.details{margin-top:4px}.detail-line{display:grid;grid-template-columns:minmax(70px,1fr) auto auto;gap:5px;padding:2px 0;border-bottom:1px dotted ${theme.border}}.detail-line span:first-child{overflow-wrap:anywhere}.detail-line span:nth-child(2){color:#64748b;font-size:6.5px;white-space:nowrap}.detail-line strong{font-size:7px;white-space:nowrap}
      .closing{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.closing div{border:1px solid ${theme.border};border-radius:8px;padding:8px}.closing small{display:block;color:#64748b}.closing strong{display:block;margin-top:3px;color:${theme.primary};font-size:10px}
      .signatures{display:grid;grid-template-columns:repeat(${Math.max(1, signatoryRoles.length)},minmax(0,1fr));gap:12px;margin-top:28px;text-align:center;font-size:7.5px}.signature{min-width:0}.signature-space{height:42px}.signature-name{border-top:1px solid #94a3b8;padding-top:4px;overflow-wrap:anywhere}.foot{display:flex;justify-content:space-between;gap:10px;margin-top:16px;border-top:1px solid ${theme.border};padding-top:7px;color:#64748b;font-size:7px}
      .attendance-section{page:attendance;break-before:page;page-break-before:always}.attendance-week{break-after:page;page-break-after:always;margin:0 0 8mm}.attendance-week:last-child{break-after:auto;page-break-after:auto}.attendance-week-title{display:flex;justify-content:space-between;gap:12px;margin:10px 0 7px;color:${theme.primary};font-size:10px}.attendance-table{font-size:7.4px}.attendance-table th{font-size:7px;padding:6px 4px}.attendance-table td{padding:5px 4px}.attendance-table .worker-name{font-weight:700;min-width:34mm}.attendance-table .attendance-cell{text-align:center;font-weight:700}.attendance-table .attendance-empty{background:#fff}.attendance-table .attendance-pay{font-weight:800;color:${theme.primary};white-space:nowrap}
      @media screen and (max-width:700px){.sheet{margin:0;padding:16px}.summary{grid-template-columns:1fr 1fr}.identity{grid-template-columns:1fr}table{min-width:800px}.table-wrap{overflow-x:auto}}
      @media print{body{background:#fff}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.toolbar{display:none}tr,.stat,.closing div,.identity{break-inside:avoid}.section{break-after:avoid}}
    </style></head><body>
    <div class="toolbar"><button class="secondary" onclick="window.close()">Tutup</button><button onclick="window.print()">Cetak / Simpan PDF</button></div>
    <main class="sheet">
      <header class="top"><div><div class="brand">Dahlia Management System · Buku Kas Eksternal</div><h1>Laporan Buku Kas Umum</h1><div class="subtitle">Periode ${dateLabel(startDate)} – ${dateLabel(endDate)}</div></div><div class="pill">REKAP PERIODE</div></header>
      <section class="identity">
        <div><span>Nama Sekolah</span><strong>${escapeHtml(book.name)}</strong></div><div><span>NPSN</span><strong>${escapeHtml(book.npsn || "—")}</strong></div>
        <div><span>Alamat</span><strong>${escapeHtml(book.address || "—")}</strong></div><div><span>Telepon</span><strong>${escapeHtml(book.phone || "—")}</strong></div>
        <div><span>Kepala Sekolah</span><strong>${escapeHtml(book.school_head || "—")}</strong></div><div><span>Perencana</span><strong>${escapeHtml(book.planner || "—")}</strong></div>
        <div><span>Pengawas</span><strong>${escapeHtml(book.supervisor || "—")}</strong></div><div><span>P2SP</span><strong>${escapeHtml(book.p2sp || "—")}</strong></div>
        <div><span>Tanggal cetak</span><strong>${dateLabel(dateKey(new Date()))}</strong></div><div><span>Jumlah transaksi</span><strong>${period.length} transaksi</strong></div>
      </section>
      <section class="summary">
        <div class="stat"><small>Saldo awal periode</small><strong>${money(opening.total)}</strong></div>
        <div class="stat"><small>Kas masuk periode</small><strong>${money(periodBalances.incoming)}</strong></div>
        <div class="stat"><small>Kas keluar periode</small><strong>${money(periodBalances.outgoing)}</strong></div>
        <div class="stat"><small>Saldo akhir periode</small><strong>${money(closing.total)}</strong></div>
      </section>
      <div class="section">Rincian transaksi dan nota</div><div class="range-note">Hanya transaksi bertanggal ${dateLabel(startDate)} sampai ${dateLabel(endDate)} yang ditampilkan. Saldo awal dihitung dari saldo pembukaan dan seluruh transaksi sebelum tanggal awal.</div>
      <div class="table-wrap"><table><thead><tr><th style="width:11%">Tanggal</th><th style="width:15%">Nomor / jenis</th><th style="width:36%">Uraian dan rincian material</th><th style="width:12%;text-align:right">Masuk</th><th style="width:12%;text-align:right">Keluar</th><th style="width:14%;text-align:right">Saldo</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">Tidak ada transaksi pada rentang tanggal ini.</td></tr>'}</tbody></table></div>
      <div class="section">Posisi saldo akhir periode</div><section class="closing"><div><small>Saldo tunai</small><strong>${money(closing.cash)}</strong></div><div><small>Saldo bank / non-tunai</small><strong>${money(closing.bank)}</strong></div><div><small>Total saldo</small><strong>${money(closing.total)}</strong></div></section>
      ${attendanceSection}
      <section class="signatures">${signatures}</section>
      <footer class="foot"><span>BKU Eksternal · Database terpisah</span><span>Periode ${dateLabel(startDate)} – ${dateLabel(endDate)}</span></footer>
    </main></body></html>`;
}

export function openBkuPdfReport(options: PdfReportOptions, targetWindow?: Window | null) {
  if (!options.startDate || !options.endDate || options.startDate > options.endDate) {
    throw new Error("Tanggal awal harus sama dengan atau lebih awal dari tanggal akhir.");
  }
  const popup = targetWindow || window.open("", "_blank");
  if (!popup || popup.closed) throw new Error("Jendela laporan tidak tersedia. Izinkan pop-up untuk localhost lalu coba kembali.");
  popup.document.open();
  popup.document.write(buildBkuPdfHtml(options));
  popup.document.close();
  popup.focus();
}
