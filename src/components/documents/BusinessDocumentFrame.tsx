'use client';

import { useRef, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { getBusinessDocumentDefinition } from '@/lib/documents/catalog';
import { buildBusinessDocumentFilename, escapeDocumentHtml } from '@/lib/documents/filename';
import type { BusinessDocumentIdentity, BusinessDocumentSignature } from '@/types/businessDocument';

const statusLabels: Record<string, string> = {
  draft: 'DRAFT · BELUM DISAHKAN', submitted: 'DIAJUKAN · MENUNGGU PERSETUJUAN',
  approved: 'DISETUJUI', confirmed: 'DIKONFIRMASI', active: 'AKTIF', locked: 'DIKUNCI',
  paid: 'DIBAYAR', cancelled: 'DIBATALKAN', void: 'DIBATALKAN',
};

const dateTime = (value: string) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date(value));

const printStyles = (documentCode: string, revision: string) => `
  @page {
    size: A4 portrait;
    margin: 14mm 13mm 16mm;
    @bottom-left { content: "JAVAWASTHU MANAGEMENT · ${documentCode} · R${revision}"; color: #87928e; font: 6.5pt Arial, sans-serif; }
    @bottom-right { content: "Halaman " counter(page) " / " counter(pages); color: #87928e; font: 6.5pt Arial, sans-serif; }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #eef2f1; color: #172723; font: 10pt/1.48 Arial, Helvetica, sans-serif; }
  .javawasthu-document-actions { display: flex; align-items: center; gap: 12px; max-width: 210mm; margin: 20px auto 10px; color: #52635e; font: 12px/1.45 Arial, sans-serif; }
  .javawasthu-document-actions button { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 9px; padding: 10px 14px; background: #075c45; color: white; font-weight: 700; cursor: pointer; }
  .javawasthu-business-document { width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 14mm 13mm 16mm; background: white; box-shadow: 0 12px 40px #203d3420; }
  .javawasthu-doc-accent { height: 7px; margin: -14mm -13mm 12mm; background: linear-gradient(90deg,#064e3b,#10b981,#d6a84f); }
  .javawasthu-doc-brand { display:flex; align-items:center; gap:11px; padding-bottom:11px; border-bottom:1px solid #dbe5e1; }
  .javawasthu-doc-monogram { display:grid; place-items:center; width:42px; height:42px; border-radius:12px; background:#073f32; color:white; font-size:18pt; font-weight:800; }
  .javawasthu-doc-brand-name { color:#0b4235; font-size:10pt; font-weight:800; letter-spacing:1.1px; }
  .javawasthu-doc-brand-line { margin-top:3px; color:#75827e; font-size:7pt; letter-spacing:.7px; }
  .javawasthu-doc-classification { margin-left:auto; color:#77837f; font-size:7pt; text-align:right; letter-spacing:.8px; text-transform:uppercase; }
  .javawasthu-doc-title-row { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding:18px 0 13px; }
  .javawasthu-doc-eyebrow { color:#087557; font-size:7pt; font-weight:800; letter-spacing:1.3px; text-transform:uppercase; }
  .javawasthu-doc-title { margin:4px 0 0; color:#102b25; font-size:21pt; line-height:1.15; }
  .javawasthu-doc-number { min-width:175px; padding:9px 11px; border:1px solid #cbded7; border-radius:9px; background:#f3faf6; text-align:right; }
  .javawasthu-doc-number-label, .javawasthu-doc-number-status { display:block; color:#678077; font-size:6.5pt; letter-spacing:.7px; text-transform:uppercase; }
  .javawasthu-doc-number-value { display:block; margin:4px 0; color:#065f46; font-size:10pt; font-weight:800; overflow-wrap:anywhere; }
  .javawasthu-doc-meta { display:grid; grid-template-columns:1fr 1fr; gap:9px 14px; padding:11px 12px; border:1px solid #dce7e2; border-radius:9px; background:#fbfdfc; }
  .javawasthu-doc-meta-label { display:block; color:#82908c; font-size:6.5pt; letter-spacing:.5px; text-transform:uppercase; }
  .javawasthu-doc-meta-value { display:block; margin-top:2px; color:#263c36; font-size:8.5pt; font-weight:700; overflow-wrap:anywhere; }
  .javawasthu-doc-authority { margin:12px 0; padding:9px 11px; border-left:3px solid #0b8060; background:#f1f8f4; color:#344a42; font-size:8pt; }
  .javawasthu-doc-authority strong { display:block; margin-bottom:2px; color:#075c45; }
  .javawasthu-doc-section { margin-top:14px; break-inside:auto; }
  .javawasthu-doc-section-title { margin:0 0 7px; padding-bottom:5px; border-bottom:1.5px solid #0d7759; color:#153a30; font-size:10pt; }
  .javawasthu-doc-table { width:100%; border-collapse:collapse; font-size:8pt; }
  .javawasthu-doc-table th { padding:7px 6px; background:#103e32; color:white; text-align:left; font-size:7pt; }
  .javawasthu-doc-table td { padding:6px; border-bottom:1px solid #e6ece9; vertical-align:top; overflow-wrap:anywhere; }
  .javawasthu-doc-table tr { break-inside:avoid; }
  .javawasthu-doc-signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:24px; break-inside:avoid; }
  .javawasthu-doc-signature { min-height:92px; padding:8px; border:1px solid #dce7e2; border-radius:8px; }
  .javawasthu-doc-signature-label { color:#687873; font-size:7pt; font-weight:700; }
  .javawasthu-doc-signature-space { height:47px; }
  .javawasthu-doc-signature-name { border-top:1px solid #8e9b96; padding-top:4px; color:#263c36; font-size:7.5pt; font-weight:700; }
  .javawasthu-doc-signature-role { color:#77837f; font-size:7pt; }
  .javawasthu-doc-legal { margin-top:14px; padding-top:8px; border-top:1px solid #dce7e2; color:#74817c; font-size:7pt; }
  .javawasthu-doc-footer { display:flex; justify-content:space-between; gap:12px; margin-top:18px; padding-top:8px; border-top:1px solid #dce7e2; color:#87928e; font-size:6.5pt; }
  .javawasthu-doc-break { break-before:page; page-break-before:always; }
  @media print { html,body { background:white; } .javawasthu-document-actions { display:none!important; } .javawasthu-business-document { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; } .javawasthu-doc-accent { margin-top:0; } }
`;

export function BusinessDocumentFrame({
  identity,
  children,
  signatures = [],
  showPrintButton = true,
}: {
  identity: BusinessDocumentIdentity;
  children: ReactNode;
  signatures?: BusinessDocumentSignature[];
  showPrintButton?: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const definition = getBusinessDocumentDefinition(identity.type);
  const fileName = buildBusinessDocumentFilename(identity);
  const status = statusLabels[identity.sourceStatus] ?? identity.sourceStatus.toUpperCase();
  const revisionLabel = String(Math.max(1, Math.trunc(identity.revision ?? 1))).padStart(2, '0');
  const footerCode = identity.code.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 80);

  const print = () => {
    if (!articleRef.current) return;
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) {
      window.alert('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu ulangi.');
      return;
    }
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeDocumentHtml(fileName.replace(/\.pdf$/i, ''))}</title><style>${printStyles(footerCode, revisionLabel)}</style></head><body>${articleRef.current.outerHTML}<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});</script></body></html>`);
    popup.document.close();
  };

  return (
    <div>
      {showPrintButton && (
        <div className="javawasthu-document-actions">
          <button type="button" onClick={print}><Printer size={16} /> Cetak / Simpan sebagai PDF</button>
          <span>Nama file: <strong>{fileName}</strong></span>
        </div>
      )}
      <article ref={articleRef} className="javawasthu-business-document">
        <div className="javawasthu-doc-accent" />
        <header className="javawasthu-doc-brand">
          <div className="javawasthu-doc-monogram">D</div>
          <div>
            <div className="javawasthu-doc-brand-name">JAVAWASTHU MANAGEMENT</div>
            <div className="javawasthu-doc-brand-line">PROJECT · PROCUREMENT · PEOPLE · FINANCIAL CONTROL</div>
          </div>
          <div className="javawasthu-doc-classification">{identity.classification ?? 'Dokumen internal'}<br />{definition.domain}</div>
        </header>

        <div className="javawasthu-doc-title-row">
          <div><div className="javawasthu-doc-eyebrow">{definition.title}</div><h1 className="javawasthu-doc-title">{identity.title}</h1></div>
          <div className="javawasthu-doc-number">
            <span className="javawasthu-doc-number-label">Nomor dokumen sumber</span>
            <span className="javawasthu-doc-number-value">{identity.code}</span>
            <span className="javawasthu-doc-number-status">{status} · R{revisionLabel}</span>
          </div>
        </div>

        <section className="javawasthu-doc-meta" aria-label="Identitas dokumen">
          {identity.projectName && <div><span className="javawasthu-doc-meta-label">Proyek</span><span className="javawasthu-doc-meta-value">{identity.projectName}{identity.projectCode ? ` · ${identity.projectCode}` : ''}</span></div>}
          {identity.period && <div><span className="javawasthu-doc-meta-label">Periode</span><span className="javawasthu-doc-meta-value">{identity.period}</span></div>}
          <div><span className="javawasthu-doc-meta-label">Status sumber</span><span className="javawasthu-doc-meta-value">{status}</span></div>
          <div><span className="javawasthu-doc-meta-label">Diterbitkan / dicetak</span><span className="javawasthu-doc-meta-value">{dateTime(identity.generatedAt)}</span></div>
          {identity.issuerName && <div><span className="javawasthu-doc-meta-label">Penerbit</span><span className="javawasthu-doc-meta-value">{identity.issuerName}</span></div>}
        </section>

        <aside className="javawasthu-doc-authority">
          <strong>Dasar dan batas kewenangan</strong>
          <div>{definition.effectWhenIssued}</div>
          <div>{definition.doesNotAuthorize}</div>
          <div><b>Langkah berikut:</b> {definition.nextAuthority}</div>
        </aside>
        <div className="javawasthu-doc-content">{children}</div>

        {signatures.length > 0 && <section className="javawasthu-doc-signatures" aria-label="Kolom tanda tangan">
          {signatures.map((signature, index) => <div className="javawasthu-doc-signature" key={`${signature.label}-${index}`}>
            <div className="javawasthu-doc-signature-label">{signature.label}</div><div className="javawasthu-doc-signature-space" />
            <div className="javawasthu-doc-signature-name">{signature.personName || 'Nama dan tanda tangan'}</div>
            {signature.roleName && <div className="javawasthu-doc-signature-role">{signature.roleName}</div>}
            {signature.signedAt && <div className="javawasthu-doc-signature-role">{dateTime(signature.signedAt)}</div>}
          </div>)}
        </section>}

        <p className="javawasthu-doc-legal">Cetakan ini adalah representasi data sumber pada status dan waktu yang tercantum. Kepemilikan file tidak memberikan permission, persetujuan, hak tagih, ataupun bukti penerimaan dana di luar alur kerja dan catatan transaksi resmi.</p>
        <footer className="javawasthu-doc-footer"><span>JAVAWASTHU MANAGEMENT · {identity.classification ?? 'Dokumen internal'}</span><span>{identity.code} · R{revisionLabel}</span></footer>
      </article>
    </div>
  );
}
