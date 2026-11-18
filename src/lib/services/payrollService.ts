import { supabase } from '@/lib/supabase';
import type {
  ExecutionSegmentForPayment,
  InternalPieceworkProgress,
  PaymentObligation,
  PaymentTransaction,
  PayrollCostAllocation,
  PayrollPackageOption,
  PayrollProjectOption,
  PayrollItem,
  PayrollLine,
  PayrollRun,
  PayrollWorkspace,
  PieceworkShare,
  SubcontractPaymentRequest,
  SubcontractContractOption,
  SubcontractPaymentTerm,
  SubcontractRetentionBalance,
  SubcontractTermFinancialSummary,
  SubcontractUnitProgressOption,
} from '@/types/payroll';

type DbError = { code?: string; message?: string };

function explain(error: DbError, context: string): Error {
  const message = error.message ?? 'Kesalahan database tidak diketahui.';
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    return new Error(`${context}. Pastikan Migration 013, 014, 015, dan 016 sudah dijalankan berurutan.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(`${context}. Akun Anda belum memiliki kewenangan untuk tindakan ini.`);
  }
  if (error.code === '23505') return new Error(`${context}. Data sudah tercatat atau terjadi duplikasi. Segarkan data sebelum mencoba kembali.`);
  if (error.code === '23503') return new Error(`${context}. Referensi karyawan, proyek, paket, progres, atau kewajiban tidak ditemukan.`);
  if (error.code === '23514' || error.code === '22023') return new Error(`${context}. ${message}`);
  return new Error(`${context}: ${message}`);
}

export async function fetchPayrollWorkspace(): Promise<PayrollWorkspace> {
  const [employees, runs, shares, segments, contracts, terms, termSummaries, unitProgress, requests, obligations, payments, progressItems, retentionBalances, projects, packages, costAllocations] = await Promise.all([
    supabase.from('employees').select('id, employee_number, full_name').eq('status', 'active').order('full_name'),
    supabase.from('payroll_runs')
      .select('id, run_number, period_id, status, total_employees, total_gross, total_deductions, total_net, created_at, submitted_at, approved_at, period:payroll_periods(period_code, period_start, period_end, status)')
      .order('created_at', { ascending: false }).limit(24),
    supabase.from('execution_piecework_shares')
      .select('id, share_number, progress_entry_id, employee_id, quantity_share, unit_rate_snapshot, amount, status, notes, rejection_reason, employee:employees(employee_number, full_name)')
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('execution_segments')
      .select('id, segment_number, package_id, execution_method, agreed_amount, unit_rate, retention_percent, status, subcontractor_id, subcontractor:subcontractors(legal_name), package:project_work_packages(package_name, project_id, project:projects(title))')
      .eq('executor_type', 'subcontractor').in('status', ['active', 'planned', 'closed']).order('created_at', { ascending: false }),
    supabase.from('execution_contract_register')
      .select('id, contract_number, segment_id, project_id, package_id, subcontractor_id, contract_reference, contract_title, signed_date, contract_start_date, contract_end_date, contract_value_snapshot, contract_status')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.from('subcontract_payment_terms')
      .select('id, term_number, segment_id, term_name, calculation_basis, percentage, fixed_amount, due_date, trigger_description, status')
      .order('sort_order', { ascending: true }),
    supabase.from('subcontract_term_financial_summary')
      .select('term_id, term_number, segment_id, contract_register_id, term_name, calculation_basis, percentage, fixed_amount, base_amount_snapshot, term_amount_snapshot, due_date, trigger_description, status, reserved_gross, approved_gross, obligation_amount, paid_amount, available_to_claim')
      .order('due_date', { ascending: true }),
    supabase.from('subcontract_unit_progress_available')
      .select('progress_entry_id, report_date, quantity_approved, segment_item_id, segment_id, segment_number, unit_rate, project_id, project_title, package_id, package_name, item_name, unit, claimed_quantity, available_quantity, available_value')
      .gt('available_quantity', 0).order('report_date', { ascending: false }),
    supabase.from('subcontract_payment_requests')
      .select('id, request_number, segment_id, term_id, contract_register_id, legacy_unlinked_progress, legacy_reconciled_at, request_date, gross_amount, retention_amount, deduction_amount, net_amount, status, notes, rejection_reason')
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('payment_obligations')
      .select('id, obligation_number, source_type, subcontract_retention_id, payee_type, employee_id, subcontractor_id, project_id, package_id, obligation_date, due_date, description, amount, paid_amount, status, employee:employees(employee_number, full_name), subcontractor:subcontractors(legal_name), project:projects(title)')
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('payment_transactions')
      .select('id, payment_number, payment_date, payment_method, amount, project_id, reference_number, notes, status, created_at')
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('execution_segment_items')
      .select('id, segment_id, package_item_id, allocated_quantity, segment:execution_segments!inner(id, execution_method, unit_rate, package:project_work_packages(package_name, project_id, project:projects(title))), package_item:project_work_package_items(item_name, unit)')
      .eq('segment.execution_method', 'internal_piecework'),
    supabase.from('subcontract_retention_balances')
      .select('id, request_id, segment_id, retention_amount, released_amount, release_due_date, status, segment:execution_segments(segment_number, subcontractor:subcontractors(legal_name), package:project_work_packages(package_name, project:projects(title)))')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, title').eq('status', 'DIKERJAKAN').order('title'),
    supabase.from('project_work_packages').select('id, project_id, package_name').order('package_name'),
    supabase.from('payroll_cost_allocations')
      .select('id, payroll_line_id, project_id, package_id, amount, notes, status, created_at, project:projects(title), package:project_work_packages(package_name)')
      .order('created_at', { ascending: false }).limit(500),
  ]);
  const firstError = employees.error ?? runs.error ?? shares.error ?? segments.error ?? contracts.error ?? terms.error ?? termSummaries.error ?? unitProgress.error ?? requests.error ?? obligations.error ?? payments.error ?? progressItems.error ?? retentionBalances.error ?? projects.error ?? packages.error ?? costAllocations.error;
  if (firstError) throw explain(firstError, 'Gagal memuat pusat penggajian dan pembayaran');

  const segmentItemIds = (progressItems.data ?? []).map((row: any) => row.id as string);
  let progressRows: InternalPieceworkProgress[] = [];
  if (segmentItemIds.length) {
    const progressResult = await supabase.from('execution_progress_entries')
      .select('id, report_date, quantity_approved, segment_item_id')
      .in('segment_item_id', segmentItemIds).eq('status', 'approved').order('report_date', { ascending: false });
    if (progressResult.error) throw explain(progressResult.error, 'Gagal memuat progres borongan internal');
    const itemMap = new Map((progressItems.data ?? []).map((row: any) => [row.id, row]));
    progressRows = (progressResult.data ?? []).map((row: any) => {
      const item: any = itemMap.get(row.segment_item_id);
      const segment: any = item?.segment;
      const pkg: any = segment?.package;
      const project: any = pkg?.project;
      const packageItem: any = item?.package_item;
      return {
        ...row,
        item_label: packageItem ? `${packageItem.item_name} (${packageItem.unit})` : 'Item pekerjaan',
        package_label: pkg?.package_name ?? 'Paket pekerjaan',
        project_label: project?.title ?? 'Proyek',
        unit_rate: segment?.unit_rate ?? undefined,
      };
    });
  }

  return {
    employees: (employees.data ?? []) as PayrollWorkspace['employees'],
    runs: (runs.data ?? []) as unknown as PayrollRun[],
    items: [],
    lines: [],
    pieceworkShares: (shares.data ?? []) as unknown as PieceworkShare[],
    pieceworkProgress: progressRows,
    subcontractSegments: (segments.data ?? []) as unknown as ExecutionSegmentForPayment[],
    subcontractContracts: (contracts.data ?? []) as SubcontractContractOption[],
    subcontractTerms: (terms.data ?? []) as unknown as SubcontractPaymentTerm[],
    subcontractTermSummaries: (termSummaries.data ?? []) as unknown as SubcontractTermFinancialSummary[],
    subcontractUnitProgress: (unitProgress.data ?? []) as unknown as SubcontractUnitProgressOption[],
    subcontractRequests: (requests.data ?? []) as unknown as SubcontractPaymentRequest[],
    obligations: (obligations.data ?? []) as unknown as PaymentObligation[],
    payments: (payments.data ?? []) as unknown as PaymentTransaction[],
    retentionBalances: (retentionBalances.data ?? []) as unknown as SubcontractRetentionBalance[],
    projects: (projects.data ?? []) as PayrollProjectOption[],
    packages: (packages.data ?? []) as PayrollPackageOption[],
    costAllocations: (costAllocations.data ?? []) as unknown as PayrollCostAllocation[],
  };
}

export async function fetchPayrollRunItems(runId: string): Promise<{ items: PayrollItem[]; lines: PayrollLine[] }> {
  const itemsResult = await supabase.from('payroll_items')
    .select('id, item_number, payroll_run_id, employee_id, pay_basis, work_units, unit_label, base_amount, earning_total, deduction_total, net_amount, calculation_status, warnings, review_note, employee:employees(employee_number, full_name)')
    .eq('payroll_run_id', runId).order('created_at', { ascending: true });
  if (itemsResult.error) throw explain(itemsResult.error, 'Gagal memuat rincian payroll');
  const items = (itemsResult.data ?? []) as unknown as PayrollItem[];
  const ids = items.map((item) => item.id);
  if (!ids.length) return { items, lines: [] };
  const linesResult = await supabase.from('payroll_lines')
    .select('id, payroll_item_id, line_kind, line_code, line_label, quantity, unit_label, rate, amount, source_type, notes')
    .in('payroll_item_id', ids).order('created_at', { ascending: true });
  if (linesResult.error) throw explain(linesResult.error, 'Gagal memuat komponen payroll');
  return { items, lines: (linesResult.data ?? []) as PayrollLine[] };
}

export async function buildPayrollRun(periodStart: string, periodEnd: string): Promise<PayrollRun> {
  const { data, error } = await supabase.rpc('dahlia_build_payroll_run', { p_period_start: periodStart, p_period_end: periodEnd });
  if (error) throw explain(error, 'Gagal membangun payroll periode');
  return data as PayrollRun;
}

export async function addPayrollLine(input: {
  payrollItemId: string; lineKind: 'earning' | 'deduction'; lineCode: string; lineLabel: string;
  quantity: number; unitLabel: string | null; rate: number | null; amount: number; notes: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_add_payroll_line', {
    p_payroll_item_id: input.payrollItemId, p_line_kind: input.lineKind, p_line_code: input.lineCode,
    p_line_label: input.lineLabel, p_quantity: input.quantity, p_unit_label: input.unitLabel,
    p_rate: input.rate, p_amount: input.amount, p_notes: input.notes,
  });
  if (error) throw explain(error, 'Gagal menambahkan komponen payroll');
}

export async function markPayrollItemReviewed(itemId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_mark_payroll_item_reviewed', { p_payroll_item_id: itemId, p_review_note: note });
  if (error) throw explain(error, 'Gagal menyelesaikan pemeriksaan item payroll');
}

export async function submitPayrollRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_submit_payroll_run', { p_run_id: runId });
  if (error) throw explain(error, 'Gagal mengajukan payroll');
}

export async function approvePayrollRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_approve_payroll_run', { p_run_id: runId });
  if (error) throw explain(error, 'Gagal menyetujui payroll');
}

export async function createPieceworkShare(input: { progressId: string; employeeId: string; quantity: number; notes: string }): Promise<void> {
  const { error } = await supabase.rpc('dahlia_create_piecework_share', {
    p_progress_entry_id: input.progressId, p_employee_id: input.employeeId,
    p_quantity_share: input.quantity, p_notes: input.notes || null,
  });
  if (error) throw explain(error, 'Gagal membuat pembagian hasil borongan internal');
}

export async function reviewPieceworkShare(id: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_review_piecework_share', {
    p_share_id: id, p_decision: decision, p_rejection_reason: reason || null,
  });
  if (error) throw explain(error, 'Gagal memeriksa pembagian hasil borongan');
}

export async function createSubcontractTerm(input: {
  segmentId: string; termName: string; basis: 'percentage' | 'fixed_amount'; percentage: number | null;
  fixedAmount: number | null; dueDate: string | null; triggerDescription: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_create_subcontract_payment_term', {
    p_segment_id: input.segmentId, p_term_name: input.termName, p_calculation_basis: input.basis,
    p_percentage: input.percentage, p_fixed_amount: input.fixedAmount,
    p_due_date: input.dueDate, p_trigger_description: input.triggerDescription,
  });
  if (error) throw explain(error, 'Gagal menyimpan termin subkontraktor');
}

export async function submitSubcontractRequest(input: {
  segmentId: string; termId: string | null; requestDate: string; grossAmount: number | null;
  retentionAmount: number; deductionAmount: number; notes: string;
  progressLines?: Array<{ progressEntryId: string; quantity: number }>;
}): Promise<void> {
  const progressLines = (input.progressLines ?? []).map((row) => ({
    progress_entry_id: row.progressEntryId,
    quantity: row.quantity,
  }));
  const { error } = await supabase.rpc('dahlia_submit_subcontract_payment_request_v2', {
    p_segment_id: input.segmentId,
    p_term_id: input.termId,
    p_request_date: input.requestDate,
    p_gross_amount: input.grossAmount,
    p_retention_amount: input.retentionAmount,
    p_deduction_amount: input.deductionAmount,
    p_notes: input.notes || null,
    p_progress_lines: progressLines,
  });
  if (error) throw explain(error, 'Gagal mengajukan tagihan subkontraktor');
}

export async function reviewSubcontractRequest(id: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_review_subcontract_payment_request', {
    p_request_id: id, p_decision: decision, p_rejection_reason: reason || null,
  });
  if (error) throw explain(error, 'Gagal memeriksa permintaan pembayaran subkontraktor');
}


export async function createPayrollCostAllocation(input: {
  payrollLineId: string; projectId: string | null; packageId: string | null; amount: number; notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_create_payroll_cost_allocation', {
    p_payroll_line_id: input.payrollLineId,
    p_project_id: input.projectId,
    p_package_id: input.packageId,
    p_amount: input.amount,
    p_notes: input.notes || null,
  });
  if (error) throw explain(error, 'Gagal mengalokasikan biaya payroll');
}

export async function voidPayrollCostAllocation(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_void_payroll_cost_allocation', {
    p_allocation_id: id, p_reason: reason,
  });
  if (error) throw explain(error, 'Gagal mengoreksi alokasi biaya payroll');
}

export async function createRetentionReleaseObligation(input: {
  retentionBalanceId: string; amount: number; dueDate: string | null; notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_create_subcontract_retention_obligation', {
    p_retention_balance_id: input.retentionBalanceId,
    p_amount: input.amount,
    p_due_date: input.dueDate,
    p_notes: input.notes || null,
  });
  if (error) throw explain(error, 'Gagal membuat kewajiban pelepasan retensi');
}

export async function recordPayment(input: {
  paymentDate: string; paymentMethod: 'cash' | 'bank_transfer' | 'other';
  referenceNumber: string; notes: string; obligationId: string; amount: number;
}): Promise<void> {
  const { error } = await supabase.rpc('dahlia_record_payment_transaction', {
    p_payment_date: input.paymentDate, p_payment_method: input.paymentMethod,
    p_reference_number: input.referenceNumber || null, p_notes: input.notes || null,
    p_allocations: [{ obligation_id: input.obligationId, amount: input.amount }],
  });
  if (error) throw explain(error, 'Gagal mencatat pembayaran');
}

export async function voidPayment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_void_payment_transaction', { p_payment_transaction_id: id, p_reason: reason });
  if (error) throw explain(error, 'Gagal membatalkan transaksi pembayaran');
}


export async function reconcileLegacySubcontractRequest(
  requestId: string,
  progressLines: Array<{ progressEntryId: string; quantity: number }>,
): Promise<void> {
  if (!requestId) throw new Error('Tagihan historis belum dipilih.');
  if (!progressLines.length || progressLines.some((line) => !line.progressEntryId || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    throw new Error('Pilih progres disetujui dan volume rekonsiliasi yang valid.');
  }
  const { error } = await supabase.rpc('dahlia_reconcile_legacy_subcontract_request', {
    p_request_id: requestId,
    p_progress_lines: progressLines.map((line) => ({ progress_entry_id: line.progressEntryId, quantity: line.quantity })),
  });
  if (error) throw explain(error, 'Gagal merekonsiliasi tagihan historis');
}
