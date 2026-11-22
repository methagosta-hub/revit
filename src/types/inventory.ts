export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderItemForReceipt {
  id: string;
  material_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
  quantity_received: number;
  quantity_remaining: number;
}

export interface PurchaseOrderForReceipt {
  id: string;
  project_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  project_name: string;
  supplier_name: string;
  items: PurchaseOrderItemForReceipt[];
}

export interface MaterialReceiptItemInput {
  purchase_order_item_id: string;
  quantity_received: number;
  quantity_damaged: number;
  notes?: string | null;
}

export interface MaterialReceiptInput {
  purchase_order_id: string;
  received_at: string;
  delivery_note_no?: string | null;
  notes?: string | null;
  items: MaterialReceiptItemInput[];
}

export interface RecentMaterialReceipt {
  id: string;
  receipt_number: string;
  received_at: string;
  delivery_note_no: string | null;
  project_name: string;
  po_number: string;
  supplier_name: string;
  item_count: number;
  quantity_received: number;
  quantity_damaged: number;
  notes: string | null;
  items: Array<{
    material_code: string | null;
    material_name: string;
    unit: string;
    quantity_received: number;
    quantity_damaged: number;
    quantity_accepted: number;
    notes: string | null;
  }>;
}

export type StockMovementType = 'receipt' | 'issue' | 'return' | 'adjustment';

export interface MaterialStockBalance {
  project_id: string;
  material_id: string | null;
  material_name: string;
  unit: string;
  quantity_on_hand: number;
}

export interface MaterialReceipt {
  id: string;
  project_id: string;
  purchase_order_id: string;
  receipt_number: string;
  received_at: string;
  received_by: string;
  status: 'confirmed' | 'void';
}
