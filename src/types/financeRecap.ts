export type FinanceRecapScope = 'company' | 'consolidated' | 'project' | 'division';
export type FinanceRecapStatus = 'active' | 'void';

export interface FinanceRecapProject {
  id: string;
  title: string;
  client: string | null;
  total_value: number;
}

export interface FinanceRecapDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
}

export interface FinanceRecapCashRow {
  id: string;
  transaction_number: string;
  transaction_date: string;
  direction: 'in' | 'out';
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  status: 'confirmed' | 'void';
  project_id: string | null;
  project_title: string | null;
  client: string | null;
  rab_division_id: string | null;
  division_name: string | null;
  supplier_payment_number: string | null;
  purchase_order_number: string | null;
  supplier_name: string | null;
  created_at: string;
}

export interface FinanceRecapPoItem {
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_ordered: number | string;
  unit_price: number | string;
  line_total: number | string;
}

export interface FinanceRecapPoRow {
  id: string;
  po_number: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  project_title: string;
  client: string;
  division_name: string | null;
  supplier_name: string;
  subtotal: number | string;
  paid_total: number | string;
  remaining: number | string;
  items: FinanceRecapPoItem[];
}

export interface FinanceRecapPaymentRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number | string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  status: string;
  po_number: string;
  supplier_name: string;
  project_title: string;
  division_name: string | null;
}

export interface FinanceRecapSnapshot {
  report_title: string;
  scope_type: FinanceRecapScope;
  scope_label: string;
  project_title: string | null;
  client: string | null;
  project_value: number;
  division_name: string | null;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: string;
  summary: {
    cash_in: number;
    cash_out: number;
    net_cash: number;
    confirmed_transaction_count: number;
    void_transaction_count: number;
    po_commitment: number;
    supplier_paid: number;
    transaction_detail_count: number;
    po_count: number;
    payment_detail_count: number;
    unallocated_cash_count: number;
    unallocated_po_count: number;
  };
  cash_transactions: FinanceRecapCashRow[];
  purchase_orders: FinanceRecapPoRow[];
  supplier_payments: FinanceRecapPaymentRow[];
  unallocated_cash_transactions: Array<{
    transaction_number: string;
    transaction_date: string;
    direction: string;
    category: string;
    description: string;
    amount: number | string;
    status: string;
  }>;
  unallocated_purchase_orders: Array<{
    po_number: string;
    order_date: string;
    status: string;
    supplier_name: string;
    subtotal: number | string;
  }>;
  accounting_notes: string[];
}

export interface FinanceRecapDocument {
  id: string;
  recap_number: string;
  scope_type: FinanceRecapScope;
  project_id: string | null;
  rab_division_id: string | null;
  period_start: string;
  period_end: string;
  report_title: string;
  snapshot: FinanceRecapSnapshot;
  status: FinanceRecapStatus;
  created_at: string;
  reused_existing?: boolean;
  replaces_recap_id?: string | null;
  replacement_reason?: string | null;
  previous_recap_number?: string | null;
}

export interface UnallocatedFinanceReference {
  id: string;
  document_type: 'po' | 'cash';
  document_number: string;
  document_date: string;
  description: string;
  amount: number;
}
