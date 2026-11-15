export interface Supplier {
  id: string;
  supplier_code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  client: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderItemInput {
  material_code?: string | null;
  material_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
  notes?: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
  line_total: number;
}

export interface PurchaseOrder {
  id: string;
  project_id: string;
  supplier_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  subtotal: number;
  created_at: string;
  project: { title: string; client: string } | null;
  supplier: { name: string } | null;
  items: PurchaseOrderItem[];
}

export interface SupplierInput {
  supplier_code?: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}
