export type CashDirection = 'in' | 'out';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'other';
export type CashStatus = 'confirmed' | 'void';
export type SupplierPaymentStatus = 'paid' | 'void';

export interface FinanceProject {
  id: string;
  title: string;
  client: string | null;
  total_value: number;
}

export interface CashTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  direction: CashDirection;
  category: string;
  project_id: string | null;
  project_name: string | null;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  supplier_payment_id: string | null;
  status: CashStatus;
  created_at: string;
}

export interface CashTransactionInput {
  transaction_date: string;
  direction: CashDirection;
  category: string;
  project_id?: string | null;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string | null;
}

export interface SupplierPayment {
  id: string;
  payment_number: string;
  project_id: string;
  project_name: string;
  purchase_order_id: string;
  po_number: string;
  supplier_name: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  status: SupplierPaymentStatus;
  created_at: string;
}

export interface PayablePurchaseOrder {
  id: string;
  project_id: string;
  project_name: string;
  supplier_name: string;
  po_number: string;
  status: string;
  order_date: string;
  subtotal: number;
  paid_total: number;
  remaining: number;
}

export interface ProjectFinanceSummary {
  project_id: string;
  project_name: string;
  client: string | null;
  project_value: number;
  committed_po: number;
  paid_supplier: number;
  cash_in: number;
  cash_out: number;
  remaining_po: number;
}
