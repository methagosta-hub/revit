import { supabase } from '@/lib/supabase';

export type FieldMaterialRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'cancelled';

export type FieldMaterialRequestItem = {
  id: string;
  material_id: string | null;
  item_name: string;
  unit: string;
  quantity: number | string;
  notes: string | null;
  sort_order: number;
};

export type FieldMaterialRequest = {
  request_id: string;
  request_number: string;
  project_id: string;
  project_title: string;
  client: string;
  request_date: string;
  required_date: string;
  priority: 'normal' | 'urgent';
  status: FieldMaterialRequestStatus;
  notes: string | null;
  rejection_reason: string | null;
  created_by: string;
  created_at: string;
  reviewed_at: string | null;
  item_count: number | string;
  items: FieldMaterialRequestItem[];
};

function throwDbError(error: { message: string }, action: string): never {
  throw new Error(\`\${action}: \${error.message}\`);
}

export async function fetchFieldMaterialRequestsForReview(
  projectId?: string,
): Promise<FieldMaterialRequest[]> {
  const { data, error } = await supabase.rpc(
    'dahlia_field_list_material_requests_for_review',
    { p_project_id: projectId || null },
  );
  if (error) throwDbError(error, 'Gagal memuat permintaan material lapangan');

  return ((data ?? []) as unknown as FieldMaterialRequest[]).map((row) => ({
    ...row,
    item_count: Number(row.item_count ?? 0),
    items: Array.isArray(row.items) ? row.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    })) : [],
  }));
}

export async function reviewFieldMaterialRequest(
  requestId: string,
  decision: 'under_review' | 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<void> {
  if (!requestId) throw new Error('ID permintaan material tidak ditemukan.');
  if (decision === 'rejected' && !rejectionReason?.trim()) {
    throw new Error('Alasan penolakan wajib diisi.');
  }
  const { error } = await supabase.rpc('dahlia_field_review_material_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_rejection_reason: decision === 'rejected' ? rejectionReason?.trim() : null,
  });
  if (error) throwDbError(error, 'Gagal memperbarui status permintaan material');
}

export async function fetchApprovedFieldMaterialRequestsForPurchasing(): Promise<FieldMaterialRequest[]> {
  const { data, error } = await supabase.rpc(
    'dahlia_field_list_approved_requests_for_purchasing',
  );
  if (error) throwDbError(error, 'Gagal memuat PR yang siap dibuat menjadi PO');

  return ((data ?? []) as unknown as FieldMaterialRequest[]).map((row) => ({
    ...row,
    item_count: Number(row.item_count ?? 0),
    items: Array.isArray(row.items) ? row.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    })) : [],
  }));
}

export async function createPurchaseOrderFromFieldRequest(input: {
  requestId: string;
  supplierId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  itemPrices: Array<{ item_id: string; unit_price: number }>;
}): Promise<string> {
  if (!input.requestId || !input.supplierId) {
    throw new Error('PR dan supplier wajib dipilih.');
  }
  if (!input.itemPrices.length || input.itemPrices.some((item) =>
    !item.item_id || !Number.isFinite(item.unit_price) || item.unit_price <= 0,
  )) {
    throw new Error('Isi harga satuan positif untuk setiap item PR.');
  }

  const { data, error } = await supabase.rpc(
    'dahlia_field_create_purchase_order_from_request',
    {
      p_request_id: input.requestId,
      p_supplier_id: input.supplierId,
      p_order_date: input.orderDate,
      p_expected_date: input.expectedDate || null,
      p_notes: input.notes || null,
      p_item_prices: input.itemPrices,
    },
  );
  if (error) throwDbError(error, 'Gagal mengubah PR menjadi Purchase Order');
  if (typeof data !== 'string' || !data) {
    throw new Error('Database tidak mengembalikan ID PO. Periksa migration integrasi dashboard.');
  }
  return data;
}
