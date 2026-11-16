export type ExternalReportType = 'spj_dinas' | 'tax_support' | 'client_report' | 'other';
export type ExternalReportStatus = 'draft' | 'frozen' | 'issued' | 'void';
export type ExternalReportScope = 'company' | 'consolidated' | 'project' | 'division';
export type CashDirection = 'in' | 'out';

export interface ExternalReportSource {
  id: string;
  recap_number: string;
  scope_type: ExternalReportScope;
  project_id: string | null;
  project_title: string;
  rab_division_id: string | null;
  period_start: string;
  period_end: string;
  report_title: string;
  created_at: string;
}

export interface ExternalReportBook {
  id: string;
  report_number: string;
  report_type: ExternalReportType;
  scope_type: ExternalReportScope;
  project_id: string | null;
  rab_division_id: string | null;
  source_finance_recap_id: string;
  source_recap_number: string;
  period_start: string;
  period_end: string;
  report_title: string;
  recipient_name: string;
  recipient_reference: string | null;
  source_snapshot_hash: string;
  status: ExternalReportStatus;
  created_at: string;
  frozen_at: string | null;
  issued_at: string | null;
  void_reason: string | null;
}

export interface ExternalReportLedgerEntry {
  id: string;
  report_id: string;
  entry_number: number;
  source_record_id: string;
  transaction_number: string | null;
  transaction_date: string;
  direction: CashDirection;
  category: string;
  description: string;
  amount: number | string;
  payment_method: string | null;
  reference_number: string | null;
  project_name_snapshot: string | null;
  division_name_snapshot: string | null;
  status: 'confirmed' | 'void';
}

export interface ExternalReportWageSnapshot {
  id: string;
  report_id: string;
  employee_number_snapshot: string | null;
  employee_name_snapshot: string;
  payroll_period_code: string;
  payroll_period_start: string;
  payroll_period_end: string;
  line_label_snapshot: string;
  base_amount: number | string;
  project_name_snapshot: string | null;
  package_name_snapshot: string | null;
}

export interface ExternalReportAdjustment {
  id: string;
  report_id: string;
  wage_snapshot_id: string;
  presentation_label: string;
  classification: 'non_cash_disclosure';
  base_amount_snapshot: number | string;
  rate_percent: number | string;
  adjustment_amount: number | string;
  reason: string;
  supporting_reference: string;
  status: 'active' | 'void';
  created_at: string;
}

export interface ExternalReportDetail {
  book: ExternalReportBook;
  ledgerEntries: ExternalReportLedgerEntry[];
  wageSnapshots: ExternalReportWageSnapshot[];
  adjustments: ExternalReportAdjustment[];
}

export interface CreateExternalReportInput {
  source_recap_id: string;
  report_type: ExternalReportType;
  recipient_name: string;
  recipient_reference?: string;
  report_title?: string;
}
