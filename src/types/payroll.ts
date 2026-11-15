export type PayrollRunStatus = 'draft' | 'submitted' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';
export type PaymentObligationStatus = 'open' | 'partially_paid' | 'paid' | 'void';
export type PayrollLineKind = 'earning' | 'deduction';

export interface PayrollPeriod {
  period_code: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
}

export interface PayrollRun {
  id: string;
  run_number: string;
  period_id: string;
  status: PayrollRunStatus;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  period?: PayrollPeriod | null;
}

export interface PayrollEmployeeSummary {
  employee_number: string;
  full_name: string;
}

export interface PayrollItem {
  id: string;
  item_number: string;
  payroll_run_id: string;
  employee_id: string;
  pay_basis: 'monthly' | 'daily' | 'hourly' | 'piecework' | 'mixed';
  work_units: number;
  unit_label: string;
  base_amount: number;
  earning_total: number;
  deduction_total: number;
  net_amount: number;
  calculation_status: 'ready' | 'needs_review' | 'reviewed';
  warnings: Array<{ code?: string; message?: string }>;
  review_note: string | null;
  employee?: PayrollEmployeeSummary | null;
}

export interface PayrollLine {
  id: string;
  payroll_item_id: string;
  line_kind: PayrollLineKind;
  line_code: string;
  line_label: string;
  quantity: number;
  unit_label: string | null;
  rate: number | null;
  amount: number;
  source_type: string;
  notes: string | null;
}

export interface PieceworkShare {
  id: string;
  share_number: string;
  progress_entry_id: string;
  employee_id: string;
  quantity_share: number;
  unit_rate_snapshot: number;
  amount: number;
  status: 'submitted' | 'approved' | 'rejected';
  notes: string | null;
  rejection_reason: string | null;
  employee?: PayrollEmployeeSummary | null;
}

export interface InternalPieceworkProgress {
  id: string;
  report_date: string;
  quantity_approved: number;
  segment_item_id: string;
  item_label?: string;
  package_label?: string;
  project_label?: string;
  unit_rate?: number;
}

export interface ExecutionSegmentForPayment {
  id: string;
  segment_number: string;
  package_id: string;
  execution_method: string;
  agreed_amount: number | null;
  unit_rate: number | null;
  retention_percent?: number;
  status: string;
  subcontractor_id: string;
  subcontractor?: { legal_name: string } | null;
  package?: { package_name: string; project_id: string; project?: { title: string } | null } | null;
}

export interface SubcontractPaymentTerm {
  id: string;
  term_number: string;
  segment_id: string;
  term_name: string;
  calculation_basis: 'percentage' | 'fixed_amount';
  percentage: number | null;
  fixed_amount: number | null;
  due_date: string | null;
  trigger_description: string | null;
  status: 'active' | 'inactive';
  contract_register_id?: string;
  base_amount_snapshot?: number;
  term_amount_snapshot?: number;
}


/**
 * Baris dari view public.subcontract_term_financial_summary.
 * Berbeda dari SubcontractPaymentTerm (tabel), view menggunakan term_id,
 * bukan id, dan menyertakan agregat finansial.
 */
export interface SubcontractTermFinancialSummary {
  term_id: string;
  term_number: string;
  segment_id: string;
  contract_register_id: string | null;
  term_name: string;
  calculation_basis: 'percentage' | 'fixed_amount';
  percentage: number | null;
  fixed_amount: number | null;
  base_amount_snapshot: number;
  term_amount_snapshot: number;
  due_date: string | null;
  trigger_description: string | null;
  status: 'active' | 'inactive';
  reserved_gross: number;
  approved_gross: number;
  obligation_amount: number;
  paid_amount: number;
  available_to_claim: number;
}

export interface SubcontractUnitProgressOption {
  progress_entry_id: string;
  report_date: string;
  quantity_approved: number;
  segment_item_id: string;
  segment_id: string;
  segment_number: string;
  unit_rate: number;
  project_id: string;
  project_title: string;
  package_id: string;
  package_name: string;
  item_name: string;
  unit: string;
  claimed_quantity: number;
  available_quantity: number;
  available_value: number;
}

export interface SubcontractContractOption {
  id: string;
  contract_number: string;
  segment_id: string;
  project_id: string;
  package_id: string;
  subcontractor_id: string;
  contract_reference: string | null;
  contract_title: string;
  signed_date: string | null;
  contract_start_date: string;
  contract_end_date: string | null;
  contract_value_snapshot: number | null;
  contract_status: 'planned' | 'active' | 'closed' | 'terminated' | 'cancelled';
}

export interface SubcontractPaymentRequest {
  id: string;
  request_number: string;
  segment_id: string;
  term_id: string | null;
  request_date: string;
  gross_amount: number;
  retention_amount: number;
  deduction_amount: number;
  net_amount: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  notes: string | null;
  rejection_reason: string | null;
  contract_register_id?: string;
  legacy_unlinked_progress?: boolean;
  legacy_reconciled_at?: string | null;
  segment?: ExecutionSegmentForPayment | null;
}

export interface SubcontractRetentionBalance {
  id: string;
  request_id: string;
  segment_id: string;
  retention_amount: number;
  released_amount: number;
  release_due_date: string | null;
  status: 'held' | 'partially_released' | 'released';
  segment?: {
    segment_number: string;
    subcontractor?: { legal_name: string } | null;
    package?: { package_name: string; project?: { title: string } | null } | null;
  } | null;
}

export interface PayrollProjectOption { id: string; title: string; }
export interface PayrollPackageOption { id: string; project_id: string; package_name: string; }
export interface PayrollCostAllocation {
  id: string;
  payroll_line_id: string;
  project_id: string | null;
  package_id: string | null;
  amount: number;
  notes: string | null;
  status: 'active' | 'void';
  created_at: string;
  project?: { title: string } | null;
  package?: { package_name: string } | null;
}

export interface PaymentObligation {
  id: string;
  obligation_number: string;
  source_type: 'payroll_item' | 'subcontract_request' | 'subcontract_retention';
  subcontract_retention_id: string | null;
  payee_type: 'employee' | 'subcontractor';
  employee_id: string | null;
  subcontractor_id: string | null;
  project_id: string | null;
  package_id: string | null;
  obligation_date: string;
  due_date: string | null;
  description: string;
  amount: number;
  paid_amount: number;
  status: PaymentObligationStatus;
  employee?: PayrollEmployeeSummary | null;
  subcontractor?: { legal_name: string } | null;
  project?: { title: string } | null;
}

export interface PaymentTransaction {
  id: string;
  payment_number: string;
  payment_date: string;
  payment_method: 'cash' | 'bank_transfer' | 'other';
  amount: number;
  project_id: string | null;
  reference_number: string | null;
  notes: string | null;
  status: 'confirmed' | 'void';
  created_at: string;
}

export interface PayrollEmployeeOption {
  id: string;
  employee_number: string;
  full_name: string;
}

export interface PayrollWorkspace {
  employees: PayrollEmployeeOption[];
  runs: PayrollRun[];
  items: PayrollItem[];
  lines: PayrollLine[];
  pieceworkShares: PieceworkShare[];
  pieceworkProgress: InternalPieceworkProgress[];
  subcontractSegments: ExecutionSegmentForPayment[];
  subcontractContracts: SubcontractContractOption[];
  subcontractTerms: SubcontractPaymentTerm[];
  subcontractTermSummaries: SubcontractTermFinancialSummary[];
  subcontractUnitProgress: SubcontractUnitProgressOption[];
  subcontractRequests: SubcontractPaymentRequest[];
  obligations: PaymentObligation[];
  payments: PaymentTransaction[];
  retentionBalances: SubcontractRetentionBalance[];
  projects: PayrollProjectOption[];
  packages: PayrollPackageOption[];
  costAllocations: PayrollCostAllocation[];
}
