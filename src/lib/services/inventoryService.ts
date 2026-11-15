import { supabase } from '@/lib/supabase';
import type {
  MaterialReceiptInput,
  PurchaseOrderForReceipt,
  RecentMaterialReceipt,
} from '@/types/inventory';

type RawPurchaseOrder = {
  id: string;
  project_id: string;
  po_number: string;
  status: PurchaseOrderForReceipt['status'];
  order_date: string;
  expected_date: string | null;
  project: { title: string } | { title: string }[] | null;
  supplier: { name: string } | { name: string }[] | null;
  items: Array<{
    id: string;
    material_id: string | null;
    material_code: string | null;
    material_name: string;
    unit: string;
    quantity_ordered: number | string;
    unit_price: number | string;
  }> | null;
};

type RawReceipt = {
  id: string;
  receipt_number: string;
  received_at: string;
  delivery_note_no: string | null;
  project: { title: string } | { title: string }[] | null;
  purchase_order: {
    po_number: string;
    supplier: { name: string } | { name: string }[] | null;
  } | {
    po_number: string;
    supplier: { name: string } | { name: string }[] | null;
  }[] | null;
  items: Array<{
    quantity_received: number | string;
    quantity_damaged: number | string;
  }> | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function dbErrorMessage(error: { message?: string; code?: string }, context: string): string {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return `${context}. Struktur database penerimaan belum tersedia. Jalankan migration 202611150002_warehouse_receiving.sql di Supabase SQL Editor.`;
  }
  return `${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`;
}

export async function fetchPurchaseOrdersAwaitingReceipt(): Promise<PurchaseOrderForReceipt[]> {
  const { data: orderRows, error: orderError } = await supabase
    .from('project_purchase_orders')
    .select(`
      id,
      project_id,
      po_number,
      status,
      order_date,
      expected_date,
      project:projects(title),
      supplier:suppliers(name),
      items:project_purchase_order_items(
        id,
        material_id,
        material_code,
        material_name,
        unit,
        quantity_ordered,
        unit_price
      )
    `)
    .in('status', ['approved', 'ordered', 'partially_received'])
    .order('created_at', { ascending: false });

  if (orderError) throw new Error(dbErrorMessage(orderError, 'Gagal memuat PO yang menunggu penerimaan'));

  const rows = (orderRows ?? []) as unknown as RawPurchaseOrder[];
  if (rows.length === 0) return [];

  const { data: receiptRows, error: receiptError } = await supabase
    .from('project_material_receipts')
    .select('purchase_order_id, items:project_material_receipt_items(purchase_order_item_id, quantity_received)')
    .eq('status', 'confirmed');

  if (receiptError) throw new Error(dbErrorMessage(receiptError, 'Gagal menghitung penerimaan sebelumnya'));

  const receivedByItem = new Map<string, number>();
  for (const receipt of (receiptRows ?? []) as Array<{
    purchase_order_id: string;
    items: Array<{ purchase_order_item_id: string; quantity_received: number | string }> | null;
  }>) {
    for (const item of receipt.items ?? []) {
      receivedByItem.set(
        item.purchase_order_item_id,
        (receivedByItem.get(item.purchase_order_item_id) ?? 0) + Number(item.quantity_received ?? 0),
      );
    }
  }

  return rows.map((row) => {
    const project = first(row.project);
    const supplier = first(row.supplier);
    const items = (row.items ?? []).map((item) => {
      const ordered = Number(item.quantity_ordered ?? 0);
      const received = receivedByItem.get(item.id) ?? 0;
      return {
        id: item.id,
        material_id: item.material_id,
        material_code: item.material_code,
        material_name: item.material_name,
        unit: item.unit,
        quantity_ordered: ordered,
        unit_price: Number(item.unit_price ?? 0),
        quantity_received: received,
        quantity_remaining: Math.max(0, ordered - received),
      };
    }).filter((item) => item.quantity_remaining > 0.000001);

    return {
      id: row.id,
      project_id: row.project_id,
      po_number: row.po_number,
      status: row.status,
      order_date: row.order_date,
      expected_date: row.expected_date,
      project_name: project?.title ?? 'Proyek tidak ditemukan',
      supplier_name: supplier?.name ?? 'Supplier tidak tersedia',
      items,
    };
  }).filter((row) => row.items.length > 0);
}

export async function fetchRecentMaterialReceipts(limit = 10): Promise<RecentMaterialReceipt[]> {
  const { data, error } = await supabase
    .from('project_material_receipts')
    .select(`
      id,
      receipt_number,
      received_at,
      delivery_note_no,
      project:projects(title),
      purchase_order:project_purchase_orders(
        po_number,
        supplier:suppliers(name)
      ),
      items:project_material_receipt_items(quantity_received, quantity_damaged)
    `)
    .eq('status', 'confirmed')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(dbErrorMessage(error, 'Gagal memuat riwayat penerimaan'));

  return ((data ?? []) as unknown as RawReceipt[]).map((row) => {
    const project = first(row.project);
    const po = first(row.purchase_order);
    const supplier = first(po?.supplier);
    const items = row.items ?? [];
    return {
      id: row.id,
      receipt_number: row.receipt_number,
      received_at: row.received_at,
      delivery_note_no: row.delivery_note_no,
      project_name: project?.title ?? 'Proyek tidak ditemukan',
      po_number: po?.po_number ?? '-',
      supplier_name: supplier?.name ?? '-',
      item_count: items.length,
      quantity_received: items.reduce((sum, item) => sum + Number(item.quantity_received ?? 0), 0),
      quantity_damaged: items.reduce((sum, item) => sum + Number(item.quantity_damaged ?? 0), 0),
    };
  });
}

export async function recordMaterialReceipt(input: MaterialReceiptInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_project_material_receipt', {
    p_purchase_order_id: input.purchase_order_id,
    p_received_at: input.received_at,
    p_delivery_note_no: input.delivery_note_no || null,
    p_notes: input.notes || null,
    p_items: input.items,
  });

  if (error) throw new Error(`Penerimaan gagal disimpan: ${error.message}`);
  if (typeof data !== 'string' || !data) {
    throw new Error('Database tidak mengembalikan ID penerimaan. Periksa fungsi record_project_material_receipt.');
  }
  return data;
}
