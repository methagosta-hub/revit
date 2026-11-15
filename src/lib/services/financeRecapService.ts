import { supabase } from '@/lib/supabase';
import type {
  FinanceRecapDivision,
  FinanceRecapDocument,
  FinanceRecapProject,
  FinanceRecapScope,
  UnallocatedFinanceReference,
} from '@/types/financeRecap';

type DbError = { message?: string; code?: string };
function fail(error: DbError, context: string): never {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error(`${context}. Jalankan migration 202611150006_finance_detailed_recaps.sql terlebih dahulu.`);
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) {
    throw new Error(`${context}. Akun Anda belum memiliki hak akses Keuangan.`);
  }
  throw new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchRecapProjects(): Promise<FinanceRecapProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id,title,client,total_value')
    .order('title', { ascending: true });
  if (error) fail(error, 'Gagal memuat daftar proyek');
  return (data ?? []).map((row: any) => ({ ...row, total_value: Number(row.total_value ?? 0) }));
}

export async function fetchRecapDivisions(projectId: string): Promise<FinanceRecapDivision[]> {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('rab_divisions')
    .select('id,project_id,code,name,sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) fail(error, 'Gagal memuat divisi/lokasi RAB');
  return (data ?? []) as FinanceRecapDivision[];
}

export async function fetchUnallocatedFinanceReferences(projectId: string): Promise<UnallocatedFinanceReference[]> {
  if (!projectId) return [];
  const [poResult, cashResult] = await Promise.all([
    supabase
      .from('project_purchase_orders')
      .select('id,po_number,order_date,status,subtotal,supplier:suppliers(name)')
      .eq('project_id', projectId)
      .is('rab_division_id', null)
      .in('status', ['approved', 'ordered', 'partially_received', 'received'])
      .order('order_date', { ascending: false }),
    supabase
      .from('company_cash_transactions')
      .select('id,transaction_number,transaction_date,direction,description,amount,status')
      .eq('project_id', projectId)
      .is('rab_division_id', null)
      .order('transaction_date', { ascending: false }),
  ]);
  if (poResult.error) fail(poResult.error, 'Gagal memuat PO yang belum dialokasikan');
  if (cashResult.error) fail(cashResult.error, 'Gagal memuat transaksi kas yang belum dialokasikan');
  const poRows: UnallocatedFinanceReference[] = (poResult.data ?? []).map((row: any) => ({
    id: row.id,
    document_type: 'po',
    document_number: row.po_number,
    document_date: row.order_date,
    description: `PO · ${first(row.supplier)?.name ?? 'Supplier tidak diketahui'} · ${row.status}`,
    amount: Number(row.subtotal ?? 0),
  }));
  const cashRows: UnallocatedFinanceReference[] = (cashResult.data ?? []).map((row: any) => ({
    id: row.id,
    document_type: 'cash',
    document_number: row.transaction_number,
    document_date: row.transaction_date,
    description: `${row.direction === 'in' ? 'Kas masuk' : 'Kas keluar'} · ${row.description}${row.status === 'void' ? ' · Dibatalkan' : ''}`,
    amount: Number(row.amount ?? 0),
  }));
  return [...poRows, ...cashRows].sort((a, b) => b.document_date.localeCompare(a.document_date));
}

export async function assignFinanceDivision(documentType: 'po' | 'cash', documentId: string, divisionId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_finance_document_division', {
    p_document_type: documentType,
    p_document_id: documentId,
    p_rab_division_id: divisionId,
  });
  if (error) fail(error, 'Gagal mengalokasikan dokumen ke divisi');
}

export async function createFinanceRecap(input: {
  scope_type: FinanceRecapScope;
  project_id: string | null;
  rab_division_id: string | null;
  period_start: string;
  period_end: string;
  report_title: string;
}): Promise<FinanceRecapDocument> {
  const { data, error } = await supabase.rpc('create_finance_recap_document', {
    p_scope_type: input.scope_type,
    p_project_id: input.project_id,
    p_rab_division_id: input.rab_division_id,
    p_period_start: input.period_start,
    p_period_end: input.period_end,
    p_report_title: input.report_title || null,
  });
  if (error) fail(error, 'Gagal membuat dokumen rekap');
  if (!data || typeof data !== 'object' || !('recap_number' in data)) {
    throw new Error('Database tidak mengembalikan nomor dan snapshot rekap.');
  }
  return data as FinanceRecapDocument;
}

export async function fetchFinanceRecapDocuments(limit = 50): Promise<FinanceRecapDocument[]> {
  const { data, error } = await supabase
    .from('finance_recap_documents')
    .select('id,recap_number,scope_type,project_id,rab_division_id,period_start,period_end,report_title,snapshot,status,created_at,replaces_recap_id,replacement_reason,previous_recap_number')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Gagal memuat arsip rekap');
  return (data ?? []) as FinanceRecapDocument[];
}


export async function replaceFinanceRecap(id: string, reason: string): Promise<FinanceRecapDocument> {
  if (!reason.trim()) throw new Error('Alasan penerbitan rekap pengganti wajib diisi.');
  const { data, error } = await supabase.rpc('replace_finance_recap_document', {
    p_recap_id: id,
    p_reason: reason.trim(),
  });
  if (error) fail(error, 'Gagal menerbitkan rekap pengganti');
  const document = data && typeof data === 'object' && 'document' in data
    ? (data as { document?: unknown }).document
    : null;
  if (!document || typeof document !== 'object' || !('recap_number' in document)) {
    throw new Error('Database tidak mengembalikan dokumen rekap pengganti yang valid.');
  }
  return document as FinanceRecapDocument;
}

export async function voidFinanceRecap(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_finance_recap_document', {
    p_recap_id: id,
    p_reason: reason,
  });
  if (error) fail(error, 'Gagal membatalkan rekap');
}
