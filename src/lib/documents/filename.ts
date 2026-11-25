import type { BusinessDocumentIdentity } from '@/types/businessDocument';

function filePart(value: string, maxLength = 56): string {
  const result = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return result || 'TANPA-KETERANGAN';
}

/** Use the authoritative number created by the source table; never mint a business number in the browser. */
export function buildBusinessDocumentFilename(identity: Pick<BusinessDocumentIdentity, 'code' | 'title' | 'projectCode' | 'revision'>): string {
  const code = identity.code.trim();
  if (!code) throw new Error('Nomor dokumen dari data sumber wajib tersedia sebelum PDF diterbitkan.');

  const projectPart = identity.projectCode ? `${filePart(identity.projectCode, 28)}__` : '';
  const revision = Math.max(1, Math.trunc(identity.revision ?? 1)).toString().padStart(2, '0');
  return `JAVAWASTHU MANAGEMENT__${filePart(code, 48)}__${projectPart}${filePart(identity.title, 48)}__R${revision}.pdf`;
}

export function escapeDocumentHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}
