import { supabase } from '@/lib/supabase';
import type {
  ProjectOption,
  PurchaseOrder,
  PurchaseOrderItemInput,
  Supplier,
  SupplierInput,
} from '@/types/procurement';

type RawPurchaseOrder = Omit<PurchaseOrder, 'project' | 'supplier' | 'items' | 'subtotal'> & {
  subtotal: number | string;
  project: PurchaseOrder['project'] | PurchaseOrder['project'][];
  supplier: PurchaseOrder['supplier'] | PurchaseOrder['supplier'][];
  items: Array<Omit<PurchaseOrder['items'][number], 'quantity_ordered' | 'unit_price' | 'line_total'> & {
    quantity_ordered: number | string;
    unit_price: number | string;
    line_total: number | string;
  }> | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function throwDbError(error: { message: string }, action: string): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function fetchProjectsForProcurement(): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, client')
    .order('title', { ascending: true });
  if (error) throwDbError(error, 'Gagal memuat daftar proyek');
  return (data ?? []) as ProjectOption[];
}

export async function fetchSuppliers(activeOnly = true): Promise<Supplier[]> {
  let query = supabase
    .from('suppliers')
    .select('id, supplier_code, name, contact_person, phone, email, address, notes, is_active, created_at, updated_at')
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throwDbError(error, 'Gagal memuat data supplier');
  return (data ?? []) as Supplier[];
}

export async function saveSupplier(input: SupplierInput, supplierId?: string): Promise<void> {
  const payload = {
    supplier_code: input.supplier_code?.trim() || null,
    name: input.name.trim(),
    contact_person: input.contact_person?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  if (!payload.name) throw new Error('Nama supplier wajib diisi.');

  const query = supplierId
    ? supabase.from('suppliers').update(payload).eq('id', supplierId)
    : supabase.from('suppliers').insert(payload);
  const { error } = await query;
  if (error) throwDbError(error, supplierId ? 'Gagal memperbarui supplier' : 'Gagal menambahkan supplier');
}

export async function setSupplierActive(supplierId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('suppliers').update({ is_active: isActive }).eq('id', supplierId);
  if (error) throwDbError(error, 'Gagal mengubah status supplier');
}

export async function fetchPurchaseOrders(statuses?: string[]): Promise<PurchaseOrder[]> {
  let query = supabase
    .from('project_purchase_orders')
    .select(`
      id, project_id, supplier_id, po_number, status, order_date,
      expected_date, notes, subtotal, created_at,
      project:projects(title, client),
      supplier:suppliers(name),
      items:project_purchase_order_items(
        id, material_code, material_name, unit,
        quantity_ordered, unit_price, line_total
      )
    `)
    .order('created_at', { ascending: false });
  if (statuses && statuses.length > 0) query = query.in('status', statuses);
  const { data, error } = await query;
  if (error) throwDbError(error, 'Gagal memuat Purchase Order');

  return ((data ?? []) as unknown as RawPurchaseOrder[]).map((row) => ({
    ...row,
    subtotal: Number(row.subtotal ?? 0),
    project: first(row.project),
    supplier: first(row.supplier),
    items: (row.items ?? []).map((item) => ({
      ...item,
      quantity_ordered: Number(item.quantity_ordered ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      line_total: Number(item.line_total ?? 0),
    })),
  }));
}

export async function createPurchaseOrder(input: {
  project_id: string;
  supplier_id: string;
  order_date: string;
  expected_date?: string | null;
  notes?: string | null;
  items: PurchaseOrderItemInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_project_purchase_order', {
    p_project_id: input.project_id,
    p_supplier_id: input.supplier_id,
    p_order_date: input.order_date,
    p_expected_date: input.expected_date || null,
    p_notes: input.notes || null,
    p_items: input.items,
  });
  if (error) throwDbError(error, 'Gagal membuat Purchase Order');
  if (typeof data !== 'string' || !data) {
    throw new Error('Database tidak mengembalikan ID PO. Pastikan migration fungsi Purchase Order sudah dijalankan.');
  }
  return data;
}

export async function approvePurchaseOrder(purchaseOrderId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_project_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
  });
  if (error) throwDbError(error, 'Gagal menyetujui Purchase Order');
}

export async function markPurchaseOrderOrdered(purchaseOrderId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_project_purchase_order_ordered', {
    p_purchase_order_id: purchaseOrderId,
  });
  if (error) throwDbError(error, 'Gagal memperbarui status Purchase Order');
}
