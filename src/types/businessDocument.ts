export type BusinessDocumentDomain =
  | 'project'
  | 'procurement'
  | 'warehouse'
  | 'personnel'
  | 'payroll'
  | 'execution'
  | 'finance'
  | 'external';

export type BusinessDocumentType =
  | 'rab'
  | 'purchase_order'
  | 'goods_receipt'
  | 'goods_issue'
  | 'direct_purchase'
  | 'daily_assignment'
  | 'attendance_register'
  | 'payroll_register'
  | 'payslip'
  | 'employment_agreement'
  | 'employee_placement'
  | 'daily_report'
  | 'progress_certificate'
  | 'subcontract_contract'
  | 'subcontract_claim'
  | 'payment_voucher'
  | 'finance_recap'
  | 'external_report'
  | 's_curve';

export type BusinessDocumentSourceStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'confirmed'
  | 'active'
  | 'locked'
  | 'paid'
  | 'cancelled'
  | 'void'
  | string;

export interface BusinessDocumentIdentity {
  type: BusinessDocumentType;
  code: string;
  title: string;
  sourceStatus: BusinessDocumentSourceStatus;
  generatedAt: string;
  revision?: number;
  projectCode?: string | null;
  projectName?: string | null;
  period?: string | null;
  issuerName?: string | null;
  classification?: string;
}

export interface BusinessDocumentSignature {
  label: string;
  personName?: string | null;
  roleName?: string | null;
  signedAt?: string | null;
}

export interface BusinessDocumentCatalogEntry {
  type: BusinessDocumentType;
  domain: BusinessDocumentDomain;
  title: string;
  currentCode: string;
  recommendedCode: string;
  exportState: 'existing' | 'planned';
  officialIssueCondition: string;
  effectWhenIssued: string;
  doesNotAuthorize: string;
  nextAuthority: string;
  governingPermission: string;
}

export interface BusinessDocumentArchiveRecord {
  id: string;
  document_type: BusinessDocumentType;
  document_domain: BusinessDocumentDomain;
  document_code: string;
  revision: number;
  source_table: string;
  source_id: string;
  project_id: string | null;
  source_status_at_issue: string;
  issued_at: string;
  issued_by: string;
  period_start: string | null;
  period_end: string | null;
  content_snapshot: Record<string, unknown>;
  storage_bucket: string | null;
  storage_path: string | null;
  pdf_sha256: string | null;
  supersedes_document_id: string | null;
  created_at: string;
}
