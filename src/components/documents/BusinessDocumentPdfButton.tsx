'use client';

import { Printer } from 'lucide-react';
import { BUSINESS_DOCUMENT_CATALOG } from '@/lib/documents/catalog';
import { buildBusinessDocumentFilename, escapeDocumentHtml } from '@/lib/documents/filename';
import type { BusinessDocumentIdentity, BusinessDocumentType } from '@/types/businessDocument';

export interface BusinessDocumentSection {
  title: string;
  description?: string;
  details?: Array<{ label: string; value: string | number | null | undefined }>;
  columns?: string[];
  rows?: Array<Array<string | number | null | undefined>>;
  paragraphs?: string[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'DRAFT', pending_approval: 'MENUNGGU PERSETUJUAN', submitted: 'DIAJUKAN',
  approved: 'DISETUJUI', confirmed: 'DIKONFIRMASI', active: 'AKTIF', locked: 'DIKUNCI',
  ordered: 'SUDAH DIPESAN', partially_received: 'DITERIMA SEBAGIAN', received: 'SELESAI DITERIMA',
  paid: 'DIBAYAR', cancelled: 'DIBATALKAN', void: 'DIBATALKAN', issued: 'DITERBITKAN',
  planned: 'DIRENCANAKAN', in_progress: 'BERJALAN', completed: 'SELESAI', verified: 'TERVERIFIKASI',
};

const REQUIRED_STATUS: Partial<Record<BusinessDocumentType, string[]>> = {
  rab: ['approved', 'final', 'final rab'],
  purchase_order: ['approved', 'ordered', 'partially_received', 'received'],
  goods_receipt: ['confirmed'],
  goods_issue: ['confirmed'],
  direct_purchase: ['confirmed', 'paid'],
  daily_assignment: ['planned', 'in_progress'],
  attendance_register: ['verified', 'locked'],
  payroll_register: ['approved', 'partially_paid', 'paid'],
  payslip: ['approved', 'partially_paid', 'paid'],
  employment_agreement: ['active'],
  employee_placement: ['active'],
  daily_report: ['approved'],
  progress_certificate: ['approved', 'confirmed'],
  subcontract_contract: ['active'],
  subcontract_claim: ['submitted', 'approved', 'partially_paid', 'paid'],
  payment_voucher: ['confirmed', 'paid'],
  finance_recap: ['active', 'issued'],
  external_report: ['issued', 'active'],
  s_curve: ['issued', 'active'],
};

const STYLES = `
  @page{size:A4 portrait;margin:13mm 13mm 17mm;@bottom-left{content:"JAVAWASTHU MANAGEMENT · ${'${footerCode}'} · R${'${revisionLabel}'}";color:#87928e;font:6.5pt Arial,sans-serif}@bottom-right{content:"Halaman " counter(page) " / " counter(pages);color:#87928e;font:6.5pt Arial,sans-serif}}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;background:#fff;color:#172723;font:9pt/1.45 Arial,Helvetica,sans-serif}
  .pdf-actions{display:flex;align-items:center;gap:8px}
  .pdf-action{display:inline-flex;align-items:center;gap:7px;border:1px solid #047857;border-radius:9px;background:#047857;color:#fff;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
  .pdf-page{width:100%;min-height:265mm;position:relative;padding-bottom:12mm}
  .pdf-brand{display:flex;align-items:center;gap:10px;padding-bottom:9px;border-bottom:1px solid #dbe5e1}
  .pdf-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#073f32;color:#fff;font-size:17pt;font-weight:800}
  .pdf-brand-name{color:#0b4235;font-size:9pt;font-weight:800;letter-spacing:1px}
  .pdf-brand-line{margin-top:2px;color:#75827e;font-size:6.5pt;letter-spacing:.6px}
  .pdf-classification{margin-left:auto;color:#788581;font-size:6.5pt;text-align:right;letter-spacing:.6px;text-transform:uppercase}
  .pdf-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:15px 0 10px}
  .pdf-eyebrow{color:#087557;font-size:7pt;font-weight:800;letter-spacing:1px;text-transform:uppercase}
  .pdf-title{margin:4px 0;color:#102b25;font-size:20pt;line-height:1.12}
  .pdf-subtitle{margin:0;color:#62716f;font-size:8pt}
  .pdf-code{min-width:160px;max-width:190px;padding:8px 10px;border:1px solid #cbded7;border-radius:8px;background:#f3faf6;text-align:right;overflow-wrap:anywhere}
  .pdf-code label,.pdf-code small{display:block;color:#678077;font-size:6pt;letter-spacing:.5px;text-transform:uppercase}
  .pdf-code strong{display:block;margin:4px 0;color:#065f46;font-size:9pt}
  .pdf-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;padding:9px 11px;border:1px solid #dce7e2;border-radius:8px;background:#fbfdfc}
  .pdf-meta label{display:block;color:#82908c;font-size:6pt;letter-spacing:.4px;text-transform:uppercase}
  .pdf-meta strong{display:block;margin-top:2px;color:#263c36;font-size:8pt}
  .pdf-notice{margin:10px 0;padding:8px 10px;border-left:3px solid #0b8060;background:#f1f8f4;color:#344a42;font-size:7.2pt}
  .pdf-dummy{margin:9px 0;padding:8px 10px;border:1px solid #e9c46a;border-radius:6px;background:#fff8df;color:#704f00;font-size:7pt;font-weight:700;text-align:center;letter-spacing:.6px}
  .pdf-section{margin-top:11px;break-inside:auto}
  .pdf-section h2{margin:0 0 6px;padding-bottom:4px;border-bottom:1.3px solid #0d7759;color:#153a30;font-size:9pt}
  .pdf-description{margin:0 0 5px;color:#71817a;font-size:7pt}
  .pdf-table{width:100%;border-collapse:collapse;font-size:7.1pt;table-layout:auto}
  .pdf-table th{padding:5px;background:#103e32;color:#fff;text-align:left;font-size:6.3pt;text-transform:uppercase;letter-spacing:.2px}
  .pdf-table td{padding:5px;border-bottom:1px solid #e6ece9;vertical-align:top;overflow-wrap:anywhere}
  .pdf-table tr{break-inside:avoid}
  .pdf-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
  .pdf-detail{padding:5px 7px;border:1px solid #e3ebe7;border-radius:5px}
  .pdf-detail label{display:block;color:#81908b;font-size:6pt;text-transform:uppercase}
  .pdf-detail strong{display:block;margin-top:2px;font-size:7.5pt}
  .pdf-paragraph{margin:4px 0;color:#42564e;font-size:7pt}
  .pdf-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px;break-inside:avoid}
  .pdf-signature{height:65px;padding:6px;border:1px solid #dce7e2;border-radius:6px}
  .pdf-signature label{color:#687873;font-size:6.2pt;font-weight:700}
  .pdf-signature span{display:block;margin-top:37px;padding-top:3px;border-top:1px solid #8e9b96;color:#687873;font-size:6pt;text-align:center}
  .pdf-legal{margin-top:9px;padding-top:6px;border-top:1px solid #dce7e2;color:#74817c;font-size:6.3pt}
  .pdf-footer{position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;border-top:1px solid #dce7e2;padding-top:5px;color:#87928e;font-size:6pt}
  @media print{.pdf-actions{display:none!important}.pdf-page{min-height:0;padding-bottom:0}}
`;

function isAuthorityReady(type: BusinessDocumentType, status: string): boolean {
  const accepted = REQUIRED_STATUS[type] ?? [];
  return accepted.includes(status.trim().toLowerCase());
}

function renderSection(section: BusinessDocumentSection): string {
  const details = section.details?.length
    ? `<div class="pdf-detail-grid">${section.details.map((item) => `<div class="pdf-detail"><label>${escapeDocumentHtml(item.label)}</label><strong>${escapeDocumentHtml(item.value ?? '—')}</strong></div>`).join('')}</div>`
    : '';
  const table = section.columns?.length
    ? `<table class="pdf-table"><thead><tr>${section.columns.map((column) => `<th>${escapeDocumentHtml(column)}</th>`).join('')}</tr></thead><tbody>${(section.rows ?? []).map((row) => `<tr>${section.columns!.map((_, index) => `<td>${escapeDocumentHtml(row[index] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';
  const paragraphs = (section.paragraphs ?? []).map((paragraph) => `<p class="pdf-paragraph">${escapeDocumentHtml(paragraph)}</p>`).join('');
  return `<section class="pdf-section"><h2>${escapeDocumentHtml(section.title)}</h2>${section.description ? `<p class="pdf-description">${escapeDocumentHtml(section.description)}</p>` : ''}${details}${table}${paragraphs}</section>`;
}

export function BusinessDocumentPdfButton({
  identity,
  sections,
  className,
  label = 'Cetak / PDF',
}: {
  identity: BusinessDocumentIdentity;
  sections: BusinessDocumentSection[];
  className?: string;
  label?: string;
}) {
  const definition = BUSINESS_DOCUMENT_CATALOG[identity.type];
  const fileName = buildBusinessDocumentFilename(identity);

  function printDocument() {
    const statusKey = identity.sourceStatus.trim().toLowerCase();
    const statusLabel = STATUS_LABELS[statusKey] ?? identity.sourceStatus.toUpperCase();
    const safeStatusLabel = escapeDocumentHtml(statusLabel);
    const printedAt = new Date();
    const revisionLabel = String(Math.max(1, Math.trunc(identity.revision ?? 1))).padStart(2, '0');
    const footerCode = identity.code.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 80);
    const authorityReady = isAuthorityReady(identity.type, identity.sourceStatus);
    const authorityText = authorityReady
      ? definition.effectWhenIssued
      : `Status ${statusLabel} belum memenuhi syarat dokumen resmi. ${definition.officialIssueCondition} Cetakan ini tidak memberi kewenangan transaksi.`;
    const meta = [
      identity.projectName ? ['Proyek', `${identity.projectName}${identity.projectCode ? ` · ${identity.projectCode}` : ''}`] : null,
      identity.period ? ['Periode', identity.period] : null,
      ['Status sumber', statusLabel],
      ['Dicetak pada', new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(printedAt)],
      identity.issuerName ? ['Penerbit', identity.issuerName] : null,
    ].filter((item): item is [string, string] => Boolean(item));
    const body = `<main class="pdf-page">
      <header class="pdf-brand"><div class="pdf-mark">D</div><div><div class="pdf-brand-name">JAVAWASTHU MANAGEMENT</div><div class="pdf-brand-line">PROJECT · PROCUREMENT · PEOPLE · FINANCIAL CONTROL</div></div><div class="pdf-classification">${escapeDocumentHtml(identity.classification ?? 'Dokumen internal')}<br>${escapeDocumentHtml(definition.domain)}</div></header>
      <div class="pdf-heading"><div><div class="pdf-eyebrow">${escapeDocumentHtml(definition.title)}</div><h1 class="pdf-title">${escapeDocumentHtml(identity.title)}</h1><p class="pdf-subtitle">${escapeDocumentHtml(definition.title)} · Salinan berdasarkan status data sumber</p></div><div class="pdf-code"><label>Nomor sumber</label><strong>${escapeDocumentHtml(identity.code)}</strong><small>${safeStatusLabel} · R${revisionLabel}</small></div></div>
      <section class="pdf-meta">${meta.map(([labelText, value]) => `<div><label>${escapeDocumentHtml(labelText)}</label><strong>${escapeDocumentHtml(value)}</strong></div>`).join('')}</section>
      <div class="pdf-notice"><strong>Dasar dan batas kewenangan</strong><br>${escapeDocumentHtml(authorityText)}<br>${escapeDocumentHtml(definition.doesNotAuthorize)}<br><strong>Langkah berikut:</strong> ${escapeDocumentHtml(definition.nextAuthority)}</div>
      ${sections.map(renderSection).join('')}
      <div class="pdf-signatures"><div class="pdf-signature"><label>Dibuat oleh</label><span>Nama dan tanda tangan</span></div><div class="pdf-signature"><label>Diperiksa oleh</label><span>Nama dan tanda tangan</span></div><div class="pdf-signature"><label>Disetujui oleh</label><span>Nama dan tanda tangan</span></div></div>
      <p class="pdf-legal">Cetakan merekam data pada status dan waktu yang tercantum. Kepemilikan file tidak menambahkan permission, persetujuan, hak tagih, atau bukti penerimaan dana.</p>
      <footer class="pdf-footer"><span>JAVAWASTHU MANAGEMENT · ${escapeDocumentHtml(identity.classification ?? 'Dokumen internal')}</span><span>${escapeDocumentHtml(identity.code)} · R${revisionLabel}</span></footer>
    </main>`;
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) {
      window.alert('Jendela cetak diblokir browser. Izinkan pop-up untuk localhost, lalu ulangi.');
      return;
    }
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeDocumentHtml(fileName.replace(/\.pdf$/i, ''))}</title><style>${STYLES.replaceAll('${footerCode}', footerCode).replaceAll('${revisionLabel}', revisionLabel)}</style></head><body>${body}<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});</script></body></html>`);
    popup.document.close();
  }

  return <button type="button" onClick={printDocument} className={className ?? 'inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800'} title={`Simpan sebagai ${fileName}`}><Printer className="h-3.5 w-3.5" />{label}</button>;
}
