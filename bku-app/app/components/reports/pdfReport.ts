import type { Book, ReportCategory, SignatoryRole, Transaction, ExportTheme, Worker, WorkerAttendance, MaterialGroup, MaterialAlias, MaterialPurchaseRecord } from "@/app/lib/bku/types";
import type { PdfExportSection } from "@/app/components/reports/exportFilename";
import { calculateBalances, sortTransactions } from "@/app/lib/bku/balances";
import { categoryLabel, escapeHtml, exportThemes, money, dateLabel, dateKey } from "@/app/lib/bku/formatters";

export type PdfReportOptions = {
  book: Book;
  transactions: Transaction[];
  startDate: string;
  endDate: string;
  themeId: string;
  font: string;
  financialSignatoryRoles: SignatoryRole[];
  attendanceSignatoryRoles: SignatoryRole[];
  reportCategories?: ReportCategory[];
  workers?: Worker[];
  attendance?: WorkerAttendance[];
  sections?: PdfExportSection[];
  materialGroups?: MaterialGroup[];
  materialAliases?: MaterialAlias[];
  materialRecords?: MaterialPurchaseRecord[];
  filename?: string;
};

export function buildBkuPdfHtml(options: PdfReportOptions) {
  const { book, transactions, startDate, endDate, themeId, font, financialSignatoryRoles, attendanceSignatoryRoles } = options;
  const workers = options.workers || [];
  const attendance = options.attendance || [];
  const sections: PdfExportSection[] = options.sections?.length ? options.sections : ["bku", "attendance"];
  const includeBku = sections.includes("bku");
  const includeAttendance = sections.includes("attendance");
  const includeMaterials = sections.includes("materials");
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
  const buildSignatures = (roles: SignatoryRole[], className: string) => roles.length ? `
    <section class="signatures ${className}" style="grid-template-columns:repeat(${roles.length},minmax(0,1fr))">
      ${roles.map((role) => `
        <div class="signature"><strong>${signatureLabels[role]}</strong><div class="signature-space"></div><div class="signature-name">${escapeHtml(signatureNames[role] || "Nama & tanda tangan")}</div></div>
      `).join("")}
    </section>
  ` : "";
  const financialSignatures = buildSignatures(financialSignatoryRoles, "financial-signatures");
  const attendanceSignatures = buildSignatures(attendanceSignatoryRoles, "attendance-signatures");

  const rows = period.map((tx) => {
    const details = (tx.details || []).map((line) => `
      <div class="detail-line"><span>${escapeHtml(line.name)}</span><span>${Number(line.volume).toLocaleString("id-ID")} ${escapeHtml(line.unit || "")} × ${money(Number(line.unit_price))}</span><strong>${money(Number(line.line_total ?? Number(line.unit_price) * Number(line.volume)))}</strong></div>
    `).join("");
    const typeLabel = tx.transaction_type === "IN" ? "Kas masuk" : tx.transaction_type === "OUT" ? "Kas keluar" : "Transfer";
    const categoryText = categoryLabel(tx.category, options.reportCategories || [], tx.transaction_type);
    const method = tx.transaction_type === "TRANSFER"
      ? `${tx.from_account === "BANK" ? "Bank" : "Tunai"} → ${tx.to_account === "BANK" ? "Bank" : "Tunai"}`
      : tx.account === "BANK" ? "Bank / non-tunai" : "Tunai";
    const movement = periodBalances.rows[tx.id];
    return `<tr>
      <td class="nowrap">${dateLabel(tx.transaction_date, { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td><strong>${escapeHtml(tx.receipt_number || `#${tx.entry_no}`)}</strong><div class="muted">${typeLabel} · ${escapeHtml(categoryText)} · ${method}${tx.store_name ? ` · ${escapeHtml(tx.store_name)}` : ""}</div>${tx.split_group_id ? `<div class="muted">Kelompok: ${escapeHtml(tx.split_group_label || "Nota terpisah")} · Total kelompok ${money(Number(tx.split_group_total || 0))}</div>` : ""}</td>
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
  const sundayOf = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() - date.getDay());
    return dateKey(date);
  };
  const workerAttendanceMap = new Map(attendance.map((item) => [`${item.worker_id}|${item.work_date}`, item]));
  const attendanceWeeks: string[] = [];
  for (let cursor = sundayOf(startDate), last = sundayOf(endDate); cursor <= last; cursor = addDays(cursor, 7)) attendanceWeeks.push(cursor);
  const attendanceSection = workers.length && attendanceWeeks.length ? `
    <section class="attendance-section">
      <div class="section">Matriks absensi dan upah pekerja</div>
      <div class="range-note">Daftar nama mencakup seluruh pekerja yang sudah bergabung sampai akhir periode. Pekerja yang baru masuk pada minggu berikutnya tetap ditampilkan dengan sel kosong pada minggu sebelumnya.</div>
      ${attendanceWeeks.map((weekStart) => {
        const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
        const weekEnd = weekDates[6];
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
        return `<div class="attendance-week"><div class="attendance-week-title"><strong>Minggu ${dateLabel(weekStart, { day: "numeric", month: "short", year: "numeric" })} – ${dateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}</strong><span>Total nilai upah berdasarkan absensi: ${money(weekTotal)}</span></div><table class="attendance-table"><colgroup><col style="width:8%"><col style="width:15%"><col style="width:11%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:8%"><col style="width:12.5%"></colgroup><thead><tr><th>Jenis</th><th>Nama pekerja</th><th>Upah/hari</th>${["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"].map((day) => `<th>${day}</th>`).join("")}<th>Total HOK</th><th>Jumlah upah</th></tr></thead><tbody>${workerRows || `<tr><td colspan="12">Belum ada pekerja pada periode ini.</td></tr>`}</tbody></table></div>`;
      }).join("")}
      ${attendanceSignatures}
    </section>` : `<section class="attendance-section"><div class="section">Matriks absensi dan upah pekerja</div><p class="range-note">Belum ada data daftar pekerja atau absensi pada rentang laporan ini.</p>${attendanceSignatures}</section>`;

  const materialGroups = options.materialGroups || [];
  const materialAliases = options.materialAliases || [];
  const materialRecords = (options.materialRecords || []).filter((item) =>
    item.transaction_date >= startDate
    && item.transaction_date <= endDate
    && item.unit.trim().toLocaleLowerCase("id-ID") !== "hok"
  );
  const normalizeMaterial = (value: string) => value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
  const aliasMap = new Map(materialAliases.map((item) => [normalizeMaterial(item.normalized_name), item.group_id]));
  const groupById = new Map(materialGroups.map((item) => [item.id, item]));
  type MaterialTotalItem = {
    name: string;
    amount: number;
    units: Map<string, number>;
    receipts: Set<string>;
  };
  const itemMap = new Map<string, MaterialTotalItem>();
  const groupItems = new Map<string, Map<string, MaterialTotalItem>>();
  const unmappedItems = new Map<string, MaterialTotalItem>();

  for (const record of materialRecords) {
    const normalized = normalizeMaterial(record.normalized_name || record.name);
    const candidateGroupId = aliasMap.get(normalized) || null;
    const groupId = candidateGroupId && groupById.has(candidateGroupId) ? candidateGroupId : null;
    const key = `${groupId || "__unmapped__"}|${normalized}`;
    const item = itemMap.get(key) || {
      name: record.name,
      amount: 0,
      units: new Map<string, number>(),
      receipts: new Set<string>(),
    };
    const unit = record.unit.trim() || "satuan tidak diisi";
    item.amount += Number(record.amount || 0);
    item.units.set(unit, (item.units.get(unit) || 0) + Number(record.volume || 0));
    item.receipts.add(`${dateLabel(record.transaction_date, { day: "2-digit", month: "short", year: "numeric" })} · ${record.receipt_number || `#${record.entry_no}`}`);
    itemMap.set(key, item);
    if (groupId) {
      const items = groupItems.get(groupId) || new Map<string, MaterialTotalItem>();
      items.set(normalized, item);
      groupItems.set(groupId, items);
    } else {
      unmappedItems.set(normalized, item);
    }
  }

  const sortedItems = (items: MaterialTotalItem[]) => items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const totalMaterialAmount = Array.from(itemMap.values()).reduce((sum, item) => sum + item.amount, 0);
  const renderMaterialRow = (item: MaterialTotalItem) => {
    const volume = Array.from(item.units.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([unit, amount]) => `${amount.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${escapeHtml(unit)}`).join(" · ");
    const receipts = Array.from(item.receipts).sort().join(" · ");
    return `<tr class="material-item-row"><td><strong>${escapeHtml(item.name)}</strong><div class="material-source">${escapeHtml(receipts)}</div></td><td>${volume || "—"}</td><td class="number">${item.receipts.size}</td><td class="number material-amount">${money(item.amount)}</td></tr>`;
  };
  const sortedGroups = Array.from(groupItems.entries()).sort((a, b) =>
    Array.from(b[1].values()).reduce((sum, item) => sum + item.amount, 0)
    - Array.from(a[1].values()).reduce((sum, item) => sum + item.amount, 0)
  );
  const materialRows = [
    ...sortedGroups.flatMap(([groupId, itemsMap]) => {
      const group = groupById.get(groupId);
      if (!group) return [];
      const items = Array.from(itemsMap.values());
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      return [
        `<tr class="material-group-row"><td colspan="3"><strong>${escapeHtml(group.name)}</strong><span>${items.length} item</span></td><td class="number"><strong>${money(total)}</strong></td></tr>`,
        ...sortedItems(items).map(renderMaterialRow),
      ];
    }),
    ...(unmappedItems.size ? [
      `<tr class="material-group-row unmapped"><td colspan="3"><strong>Belum dipetakan ke kelompok</strong><span>${unmappedItems.size} item</span></td><td class="number"><strong>${money(Array.from(unmappedItems.values()).reduce((sum, item) => sum + item.amount, 0))}</strong></td></tr>`,
      ...sortedItems(Array.from(unmappedItems.values())).map(renderMaterialRow),
    ] : []),
  ].join("");
  const materialSection = `
    <section class="material-section">
      <div class="section">Rekap total material per kelompok dan per item</div>
      <p class="range-note">Rekap dihitung dari transaksi belanja material pada proyek dan rentang tanggal terpilih. Volume tetap dipisahkan menurut satuan agar tidak menjumlahkan satuan yang berbeda.</p>
      <div class="material-summary"><div><small>Total belanja material</small><strong>${money(totalMaterialAmount)}</strong></div><div><small>Kelompok material</small><strong>${groupItems.size}</strong></div><div><small>Item material</small><strong>${itemMap.size}</strong></div></div>
      <table class="material-table"><thead><tr><th style="width:36%">Kelompok / item material dan sumber nota</th><th style="width:34%">Total volume per satuan</th><th style="width:10%;text-align:right">Nota</th><th style="width:20%;text-align:right">Total belanja</th></tr></thead><tbody>${materialRows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b">Belum ada rincian material pada rentang tanggal ini.</td></tr>'}</tbody><tfoot><tr><th colspan="3">TOTAL MATERIAL</th><th class="number">${money(totalMaterialAmount)}</th></tr></tfoot></table>
    </section>`;

  const bkuSection = includeBku ? `
      <section class="summary">
        <div class="stat"><small>Saldo awal periode</small><strong>${money(opening.total)}</strong></div>
        <div class="stat"><small>Kas masuk periode</small><strong>${money(periodBalances.incoming)}</strong></div>
        <div class="stat"><small>Kas keluar periode</small><strong>${money(periodBalances.outgoing)}</strong></div>
        <div class="stat"><small>Saldo akhir periode</small><strong>${money(closing.total)}</strong></div>
      </section>
      <div class="section">Rincian transaksi dan nota</div><div class="range-note">Hanya transaksi bertanggal ${dateLabel(startDate)} sampai ${dateLabel(endDate)} yang ditampilkan. Saldo awal dihitung dari saldo pembukaan dan seluruh transaksi sebelum tanggal awal.</div>
      <div class="table-wrap"><table><thead><tr><th style="width:11%">Tanggal</th><th style="width:15%">Nomor / jenis</th><th style="width:36%">Uraian dan rincian material</th><th style="width:12%;text-align:right">Masuk</th><th style="width:12%;text-align:right">Keluar</th><th style="width:14%;text-align:right">Saldo</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">Tidak ada transaksi pada rentang tanggal ini.</td></tr>'}</tbody></table></div>
      <div class="section">Posisi saldo akhir periode</div><section class="closing"><div><small>Saldo tunai</small><strong>${money(closing.cash)}</strong></div><div><small>Saldo bank / non-tunai</small><strong>${money(closing.bank)}</strong></div><div><small>Total saldo</small><strong>${money(closing.total)}</strong></div></section>
      ${financialSignatures}
  ` : "";
  const reportBody = `${bkuSection}${includeAttendance ? attendanceSection : ""}${includeMaterials ? materialSection : ""}`;

  return `<!doctype html><html lang="id"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.filename || `Laporan BKU ${book.name}`)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      @page{size:A4 portrait;margin:13mm 11mm 15mm}@page attendance{size:A4 portrait;margin:13mm 11mm 15mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:${theme.ink};font-family:"${font}",Arial,sans-serif;font-size:9px;line-height:1.45}.sheet{max-width:210mm;margin:20px auto;padding:12mm;background:#fff;box-shadow:0 10px 36px rgba(15,23,42,.12)}
      .toolbar{max-width:210mm;margin:12px auto;display:flex;justify-content:flex-end;gap:8px}.toolbar button{border:0;border-radius:8px;background:${theme.primary};color:#fff;padding:10px 15px;font:700 12px inherit;cursor:pointer}.toolbar .secondary{background:#475569}
      .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid ${theme.primary};padding-bottom:14px}.brand{font-size:8px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:${theme.primary}}h1{font-size:22px;line-height:1.1;margin:5px 0}.subtitle{font-size:9px;color:#64748b}.pill{border-radius:7px;background:${theme.soft};color:${theme.primary};padding:7px 10px;font-size:8px;font-weight:800;white-space:nowrap}
      .identity{display:grid;grid-template-columns:1fr 1fr;gap:6px 15px;padding:12px 0;border-bottom:1px solid ${theme.border}}.identity div{min-width:0}.identity span{display:inline-block;min-width:95px;color:#64748b}.identity strong{overflow-wrap:anywhere}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:13px 0}.stat{border:1px solid ${theme.border};border-radius:8px;background:${theme.soft};padding:8px}.stat small{display:block;color:#64748b;font-size:7px}.stat strong{display:block;margin-top:4px;color:${theme.primary};font-size:10px;overflow-wrap:anywhere}
      .section{margin:15px 0 7px;font-size:11px;font-weight:800;color:${theme.primary}}.range-note{margin-top:3px;color:#64748b;font-size:8px}table{width:100%;border-collapse:collapse;font-size:7.6px}thead{display:table-header-group}th{padding:7px 5px;background:${theme.primary};color:#fff;text-align:left;font-size:7px;letter-spacing:.25px;text-transform:uppercase}td{padding:6px 5px;border-bottom:1px solid ${theme.border};vertical-align:top}tbody tr:nth-child(even){background:${theme.soft}}.nowrap{white-space:nowrap}.number{text-align:right;white-space:nowrap;font-weight:700}.incoming{color:#047857}.outgoing{color:#be123c}.balance{color:${theme.primary}}.muted{margin-top:2px;color:#64748b;font-size:6.7px}.description{display:block;overflow-wrap:anywhere}.details{margin-top:4px}.detail-line{display:grid;grid-template-columns:minmax(70px,1fr) auto auto;gap:5px;padding:2px 0;border-bottom:1px dotted ${theme.border}}.detail-line span:first-child{overflow-wrap:anywhere}.detail-line span:nth-child(2){color:#64748b;font-size:6.5px;white-space:nowrap}.detail-line strong{font-size:7px;white-space:nowrap}
      .closing{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.closing div{border:1px solid ${theme.border};border-radius:8px;padding:8px}.closing small{display:block;color:#64748b}.closing strong{display:block;margin-top:3px;color:${theme.primary};font-size:10px}
      .signatures{display:grid;gap:12px;text-align:center;font-size:7.5px;break-inside:avoid;page-break-inside:avoid}.financial-signatures{margin-top:12px}.attendance-signatures{margin-top:18px}.signature{min-width:0}.signature-space{height:42px}.signature-name{border-top:1px solid #94a3b8;padding-top:4px;overflow-wrap:anywhere}.foot{display:flex;justify-content:space-between;gap:10px;margin-top:16px;border-top:1px solid ${theme.border};padding-top:7px;color:#64748b;font-size:7px}
      .attendance-section{page:attendance;break-before:${includeBku ? "page" : "auto"};page-break-before:${includeBku ? "always" : "auto"}}.attendance-week{break-after:page;page-break-after:always;margin:0 0 8mm}.attendance-week:last-of-type{break-after:auto;page-break-after:auto}.attendance-week-title{display:flex;justify-content:space-between;gap:12px;margin:8px 0 6px;color:${theme.primary};font-size:8px}.attendance-table{width:100%;table-layout:fixed;font-size:6.4px}.attendance-table th{font-size:6.2px;line-height:1.15;padding:4px 2px;overflow-wrap:anywhere}.attendance-table td{padding:3.5px 2px;font-size:6.4px;overflow-wrap:anywhere}.attendance-table .worker-name{font-weight:700;min-width:0;overflow-wrap:anywhere}.attendance-table .attendance-cell{text-align:center;font-weight:700}.attendance-table .attendance-empty{background:#fff}.attendance-table .attendance-pay{font-size:6.1px;font-weight:800;color:${theme.primary};white-space:nowrap}.material-section{page:attendance;break-before:${includeBku || includeAttendance ? "page" : "auto"};page-break-before:${includeBku || includeAttendance ? "always" : "auto"}}.material-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.material-summary div{border:1px solid ${theme.border};border-radius:8px;background:${theme.soft};padding:8px}.material-summary small{display:block;color:#64748b;font-size:7px}.material-summary strong{display:block;margin-top:3px;color:${theme.primary};font-size:10px}.material-table{font-size:7.5px}.material-table th{font-size:7px}.material-table td{padding:6px 5px}.material-group-row{background:${theme.soft}!important;color:${theme.primary};break-after:avoid;page-break-after:avoid}.material-group-row td{padding-top:8px;padding-bottom:8px;border-top:1px solid ${theme.border}}.material-group-row span{float:right;color:#64748b;font-size:7px}.material-item-row td:first-child{padding-left:13px}.material-source{margin-top:3px;color:#64748b;font-size:6.2px;line-height:1.35;overflow-wrap:anywhere}.material-amount{color:${theme.primary};font-weight:800}.material-table tfoot th{background:${theme.primary};color:#fff}
      @media screen and (max-width:700px){.sheet{margin:0;padding:16px}.summary{grid-template-columns:1fr 1fr}.identity{grid-template-columns:1fr}table{min-width:800px}.table-wrap{overflow-x:auto}}
      @media print{body{background:#fff}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.toolbar{display:none}tr,.stat,.closing div,.identity{break-inside:avoid}.section{break-after:avoid}}
    </style></head><body>
    <div class="toolbar"><button class="secondary" onclick="window.close()">Tutup</button><button onclick="window.print()">Cetak / Simpan PDF</button></div>
    <main class="sheet">
      <header class="top"><div><div class="brand">Dahlia Management System · Buku Kas Eksternal</div><h1>${includeBku ? "Laporan Buku Kas Umum" : includeAttendance && includeMaterials ? "Laporan Rekapitulasi Proyek" : includeAttendance ? "Matriks Absensi Pekerja" : "Rekap Material Proyek"}</h1><div class="subtitle">Periode ${dateLabel(startDate)} – ${dateLabel(endDate)}</div></div><div class="pill">REKAP PERIODE</div></header>
      <section class="identity">
        <div><span>Nama Sekolah</span><strong>${escapeHtml(book.name)}</strong></div><div><span>NPSN</span><strong>${escapeHtml(book.npsn || "—")}</strong></div>
        <div><span>Alamat</span><strong>${escapeHtml(book.address || "—")}</strong></div><div><span>Telepon</span><strong>${escapeHtml(book.phone || "—")}</strong></div>
        <div><span>Kepala Sekolah</span><strong>${escapeHtml(book.school_head || "—")}</strong></div><div><span>Perencana</span><strong>${escapeHtml(book.planner || "—")}</strong></div>
        <div><span>Pengawas</span><strong>${escapeHtml(book.supervisor || "—")}</strong></div><div><span>P2SP</span><strong>${escapeHtml(book.p2sp || "—")}</strong></div>
        <div><span>Tanggal cetak</span><strong>${dateLabel(dateKey(new Date()))}</strong></div><div><span>Jumlah transaksi</span><strong>${period.length} transaksi</strong></div>
      </section>
      ${reportBody}
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
