export type PackageStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ExecutorType = 'internal' | 'subcontractor';
export type ExecutionMethod =
  | 'daily'
  | 'hourly'
  | 'monthly'
  | 'internal_piecework'
  | 'subcontract_unit'
  | 'subcontract_lump_sum'
  | 'subcontract_all_in';
export type SegmentStatus = 'planned' | 'active' | 'closed' | 'cancelled';
export type ChangeType = 'completion' | 'executor_change' | 'method_change' | 'scope_reallocation' | 'termination' | 'other';
export type ProgressStatus = 'submitted' | 'approved' | 'rejected';

export interface ExecutionProject {
  id: string;
  title: string;
  client: string | null;
  location: string | null;
  status: string | null;
}

export interface ExecutionDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
}

export interface ExecutionRabItem {
  id: string;
  division_id: string;
  code: string | null;
  name: string;
  unit: string;
  volume: number;
  unit_price: number;
  total_price: number;
}

export interface Subcontractor {
  id: string;
  subcontractor_number: string;
  legal_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: 'active' | 'inactive';
}

export interface WorkPackage {
  id: string;
  package_number: string;
  project_id: string;
  division_id: string | null;
  package_name: string;
  description: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  status: PackageStatus;
  created_at: string;
}

export interface WorkPackageItem {
  id: string;
  package_id: string;
  rab_item_id: string | null;
  rab_division_id: string | null;
  rab_code: string | null;
  item_name: string;
  unit: string;
  planned_quantity: number;
  reference_unit_price: number;
  reference_total_amount: number;
  sort_order: number;
}

export interface ExecutionSegment {
  id: string;
  package_id: string;
  segment_number: string;
  change_order_id: string | null;
  segment_title: string;
  executor_type: ExecutorType;
  execution_method: ExecutionMethod;
  subcontractor_id: string | null;
  contract_reference: string | null;
  agreed_amount: number | null;
  unit_rate: number | null;
  retention_percent: number;
  included_components: string[];
  scope_exclusions: string | null;
  effective_from: string;
  effective_to: string | null;
  status: SegmentStatus;
  description: string | null;
  closure_reason: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ExecutionSegmentItem {
  id: string;
  segment_id: string;
  package_item_id: string;
  allocated_quantity: number;
}

export interface ExecutionProgressEntry {
  id: string;
  segment_item_id: string;
  report_date: string;
  quantity_submitted: number;
  quantity_approved: number | null;
  status: ProgressStatus;
  notes: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ExecutionChangeOrder {
  id: string;
  change_number: string;
  package_id: string;
  previous_segment_id: string | null;
  new_segment_id: string | null;
  change_type: ChangeType;
  effective_date: string;
  reason: string;
  status: 'approved' | 'void';
  created_at: string;
}


export interface ExecutionContractRegister {
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
  contract_notes: string | null;
  contract_status: 'planned' | 'active' | 'closed' | 'terminated' | 'cancelled';
}

export interface ExecutionContractDocument {
  id: string;
  document_number: string;
  contract_id: string;
  document_type: 'agreement' | 'addendum' | 'work_order' | 'handover_minutes' | 'progress_evidence' | 'other';
  document_title: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  document_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExecutionSubcontractTerm {
  id: string;
  term_number: string;
  segment_id: string;
  contract_register_id: string;
  term_name: string;
  calculation_basis: 'percentage' | 'fixed_amount';
  percentage: number | null;
  fixed_amount: number | null;
  base_amount_snapshot: number;
  term_amount_snapshot: number;
  due_date: string | null;
  trigger_description: string | null;
  status: 'active' | 'inactive';
}

/**
 * Baris dari view public.subcontract_term_financial_summary.
 * View memakai term_id (alias dari subcontract_payment_terms.id),
 * sedangkan ExecutionSubcontractTerm untuk tabel tetap memakai id.
 */
export interface ExecutionSubcontractTermSummary {
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

export interface ProjectExecutionWorkspace {
  project: ExecutionProject;
  divisions: ExecutionDivision[];
  rabItems: ExecutionRabItem[];
  packages: WorkPackage[];
  packageItems: WorkPackageItem[];
  segments: ExecutionSegment[];
  segmentItems: ExecutionSegmentItem[];
  progressEntries: ExecutionProgressEntry[];
  changeOrders: ExecutionChangeOrder[];
  subcontractors: Subcontractor[];
  contracts: ExecutionContractRegister[];
  contractDocuments: ExecutionContractDocument[];
  subcontractTerms: ExecutionSubcontractTerm[];
  subcontractTermSummaries: ExecutionSubcontractTermSummary[];
}

export interface CreatePackageInput {
  project_id: string;
  package_name: string;
  division_id: string | null;
  rab_item_ids: string[];
  description: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
}

export interface SegmentAllocationInput {
  package_item_id: string;
  allocated_quantity: number;
}

export interface CreateSegmentInput {
  package_id: string;
  segment_title: string;
  executor_type: ExecutorType;
  execution_method: ExecutionMethod;
  subcontractor_id: string | null;
  contract_reference: string | null;
  agreed_amount: number | null;
  unit_rate: number | null;
  retention_percent: number;
  included_components: string[];
  scope_exclusions: string | null;
  effective_from: string;
  change_order_id: string | null;
  description: string | null;
  allocations: SegmentAllocationInput[];
}
