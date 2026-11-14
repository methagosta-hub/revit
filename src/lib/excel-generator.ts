import ExcelJS from 'exceljs';
import type { Project } from '@/types/rab';

export async function generateRABExcel(project: Project): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RAB-REVIT-SYSTEM';
  workbook.created = new Date();

  // ==========================================
  // 1. SHEET REKAPITULASI RAB
  // ==========================================
  const wsRekap = workbook.addWorksheet('Rekapitulasi RAB');
  wsRekap.columns = [
    { header: 'NO', key: 'no', width: 6 },
    { header: 'URAIAN PEKERJAAN', key: 'name', width: 45 },
    { header: 'JUMLAH HARGA (IDR)', key: 'amount', width: 25 },
  ];

  wsRekap.addRow({ no: '', name: `REKAPITULASI RAB - ${project.title.toUpperCase()}`, amount: '' });
  wsRekap.addRow({ no: '', name: `Klien: ${project.client} | Lokasi: ${project.location}`, amount: '' });
  wsRekap.addRow({});

  project.divisions.forEach((div, idx) => {
    const divTotal = div.items.reduce((acc, item) => acc + item.totalPrice, 0);
    const row = wsRekap.addRow({
      no: toRoman(idx + 1),
      name: div.name,
      amount: divTotal,
    });
    row.getCell('amount').numFmt = '#,##0';
  });

  // ==========================================
  // 2. SHEET RINCIAN RAB
  // ==========================================
  const wsRAB = workbook.addWorksheet('Rincian RAB');
  wsRAB.columns = [
    { header: 'NO', key: 'no', width: 6 },
    { header: 'KODE', key: 'code', width: 14 },
    { header: 'URAIAN KEGIATAN', key: 'name', width: 45 },
    { header: 'VOL', key: 'volume', width: 12 },
    { header: 'SAT', key: 'unit', width: 8 },
    { header: 'HARGA SATUAN (IDR)', key: 'unitPrice', width: 20 },
    { header: 'TOTAL HARGA (IDR)', key: 'totalPrice', width: 22 },
  ];

  project.divisions.forEach((div, divIdx) => {
    // Baris Judul Divisi
    const divRow = wsRAB.addRow({
      no: toRoman(divIdx + 1),
      name: div.name.toUpperCase(),
    });
    divRow.font = { bold: true };

    // Baris Item Pekerjaan
    div.items.forEach((item, itemIdx) => {
      const r = wsRAB.addRow({
        no: itemIdx + 1,
        code: item.code,
        name: item.name,
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.unitPrice,
        // Menggunakan rumus Excel aktif (Vol * Harga Satuan)
        totalPrice: { formula: `D${wsRAB.rowCount + 1}*F${wsRAB.rowCount + 1}`, result: item.totalPrice },
      });
      r.getCell('volume').numFmt = '#,##0.00';
      r.getCell('unitPrice').numFmt = '#,##0';
      r.getCell('totalPrice').numFmt = '#,##0';
    });
  });

  // ==========================================
  // 3. SHEET BACKUP VOLUME (TRANSPARANSI AUDIT)
  // ==========================================
  const wsBackup = workbook.addWorksheet('Backup Volume');
  wsBackup.columns = [
    { header: 'KODE ITEM', key: 'code', width: 14 },
    { header: 'PEKERJAAN / URAIAN LOKASI', key: 'desc', width: 42 },
    { header: 'REF GAMBAR', key: 'ref', width: 16 },
    { header: 'FAKTOR', key: 'mult', width: 10 },
    { header: 'MODE RUMUS', key: 'mode', width: 16 },
    { header: 'SUBTOTAL VOL', key: 'subtotal', width: 15 },
    { header: 'SAT', key: 'unit', width: 8 },
  ];

  project.divisions.forEach((div) => {
    div.items.forEach((item) => {
      if (item.backupDetails && item.backupDetails.length > 0) {
        const headerItem = wsBackup.addRow({
          code: item.code,
          desc: item.name.toUpperCase(),
          unit: item.unit,
        });
        headerItem.font = { bold: true };

        item.backupDetails.forEach((det) => {
          const detRow = wsBackup.addRow({
            code: '',
            desc: `   - ${det.description}`,
            ref: det.drawingRef || '-',
            mult: det.multiplier === -1 ? 'Pengurang (-)' : 'Penambah (+)',
            mode: det.calcMode,
            subtotal: det.subtotal,
            unit: item.unit,
          });
          detRow.getCell('subtotal').numFmt = '#,##0.00';
        });
      }
    });
  });

  // Trigger Download File di Browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `RAB_${project.id.toUpperCase()}_${project.title.replace(/\s+/g, '_')}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function toRoman(num: number): string {
  const lookup: { [key: string]: number } = {
    M: 1000, CM: 900, D: 500, CD: 400,
    C: 100, XC: 90, L: 50, XL: 40,
    X: 10, IX: 9, V: 5, IV: 4, I: 1,
  };
  let roman = '';
  for (const i in lookup) {
    while (num >= lookup[i]) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
}