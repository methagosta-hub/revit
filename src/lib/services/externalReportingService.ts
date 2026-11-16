import { supabase } from '@/lib/supabase';
import type {
  CreateExternalReportInput,
  ExternalReportAdjustment,
  ExternalReportBook,
  ExternalReportDetail,
  ExternalReportLedgerEntry,
  ExternalReportSource,
  ExternalReportWageSnapshot,
} from '@/types/externalReporting';

type DbError = { message?: string; code?: string };

function fail(error: DbError, context: string): never {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error(`${context}. Jalankan migration 202611160001_external_reporting_snapshots.sql terlebih dahulu.`);
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) {
    throw new Error(`${context}. Akun Anda belum memiliki hak akses Laporan Eksternal.`);
  }
  throw new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}

export async function fetchExternalReportSources(): Promise<ExternalReportSource[]> {
  const { data, error } = await supabase.rpc('dahlia_list_external_report_sources');
  if (error) fail(error, 'Gagal memuat sumber rekap internal');
  return (data ?? []) as ExternalReportSource[];
}

export async function fetchExternalReportBooks(limit = 50): Promise<ExternalReportBook[]> {
  const { data, error } = await supabase
    .from('external_report_books')
    .select('id,report_number,report_type,scope_type,project_id,rab_division_id,source_finance_recap_id,source_recap_number,period_start,period_end,report_title,recipient_name,recipient_reference,source_snapshot_hash,status,created_at,frozen_at,issued_at,void_reason')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Gagal memuat arsip laporan eksternal');
  return (data ?? []) as ExternalReportBook[];
}

export async function createExternalReportSnapshot(input: CreateExternalReportInput): Promise<{ id: string; report_number: string; status: string }> {
  const { data, error } = await supabase.rpc('dahlia_create_external_report_snapshot', {
    p_source_recap_id: input.source_recap_id,
    p_report_type: input.report_type,
    p_recipient_name: input.recipient_name,
    p_recipient_reference: input.recipient_reference || null,
    p_report_title: input.report_title || null,
  });
  if (error) fail(error, 'Gagal membuat snapshot laporan eksternal');
  if (!data || typeof data !== 'object' || !('id' in data) || !('report_number' in data)) {
    throw new Error('Database tidak mengembalikan nomor laporan dan ID snapshot.');
  }
  return data as { id: string; report_number: string; status: string };
}

export async function fetchExternalReportDetail(reportId: string): Promise<ExternalReportDetail> {
  const [bookResult, ledgerResult, wageResult, adjustmentResult] = await Promise.all([
    supabase
      .from('external_report_books')
      .select('id,report_number,report_type,scope_type,project_id,rab_division_id,source_finance_recap_id,source_recap_number,period_start,period_end,report_title,recipient_name,recipient_reference,source_snapshot_hash,status,created_at,frozen_at,issued_at,void_reason')
      .eq('id', reportId)
      .single(),
    supabase
      .from('external_report_ledger_entries')
      .select('id,report_id,entry_number,source_record_id,transaction_number,transaction_date,direction,category,description,amount,payment_method,reference_number,project_name_snapshot,division_name_snapshot,status')
      .eq('report_id', reportId)
      .order('transaction_date', { ascending: true })
      .order('entry_number', { ascending: true }),
    supabase
      .from('external_report_wage_snapshots')
      .select('id,report_id,employee_number_snapshot,employee_name_snapshot,payroll_period_code,payroll_period_start,payroll_period_end,line_label_snapshot,base_amount,project_name_snapshot,package_name_snapshot')
      .eq('report_id', reportId)
      .order('employee_name_snapshot', { ascending: true }),
    supabase
      .from('external_report_adjustments')
      .select('id,report_id,wage_snapshot_id,presentation_label,classification,base_amount_snapshot,rate_percent,adjustment_amount,reason,supporting_reference,status,created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
  ]);

  if (bookResult.error) fail(bookResult.error, 'Gagal memuat header laporan');
  if (ledgerResult.error) fail(ledgerResult.error, 'Gagal memuat buku kas snapshot');
  if (wageResult.error) fail(wageResult.error, 'Gagal memuat snapshot alokasi upah');
  if (adjustmentResult.error) fail(adjustmentResult.error, 'Gagal memuat penyesuaian laporan');

  return {
    book: bookResult.data as ExternalReportBook,
    ledgerEntries: (ledgerResult.data ?? []) as ExternalReportLedgerEntry[],
    wageSnapshots: (wageResult.data ?? []) as ExternalReportWageSnapshot[],
    adjustments: (adjustmentResult.data ?? []) as ExternalReportAdjustment[],
  };
}

export async function addExternalWageAllocation(input: {
  report_id: string;
  wage_snapshot_id: string;
  rate_percent: number;
  presentation_label: string;
  reason: string;
  supporting_reference: string;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_add_external_wage_allocation', {
    p_report_id: input.report_id,
    p_wage_snapshot_id: input.wage_snapshot_id,
    p_rate_percent: input.rate_percent,
    p_presentation_label: input.presentation_label,
    p_reason: input.reason,
    p_supporting_reference: input.supporting_reference,
  });
  if (error) fail(error, 'Gagal menambahkan alokasi biaya tenaga kerja');
}

export async function voidExternalWageAllocation(adjustmentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_void_external_wage_allocation', {
    p_adjustment_id: adjustmentId,
    p_reason: reason,
  });
  if (error) fail(error, 'Gagal membatalkan penyesuaian');
}

export async function freezeExternalReport(reportId: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_freeze_external_report', { p_report_id: reportId });
  if (error) fail(error, 'Gagal mengunci laporan eksternal');
}

export async function issueExternalReport(reportId: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_issue_external_report', { p_report_id: reportId });
  if (error) fail(error, 'Gagal menerbitkan laporan eksternal');
}

export async function voidExternalReport(reportId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_void_external_report', {
    p_report_id: reportId,
    p_reason: reason,
  });
  if (error) fail(error, 'Gagal membatalkan laporan eksternal');
}
