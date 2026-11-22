import { supabase } from '@/lib/supabase';

export type DirectPurchaseMethod = 'cash' | 'bank_transfer' | 'other';

export interface DirectPurchaseProject {
  id: string;
  title: string;
}

export interface DirectPurchaseSupplier {
  id: string;
  name: string;
}

export interface DirectPurchaseMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  category: string | null;
}

export interface DirectPurchaseDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
}

export interface DirectMaterialPurchaseLineInput {
  material_id?: string | null;
  material_code?: string | null;
  material_name: string;
  unit: string;
  quantity_received: number;
  quantity_damaged: number;
  unit_price: number;
  notes?: string | null;
}

export interface DirectMaterialPurchaseInput {
  project_id: string;
  purchase_date: string;
  supplier_id: string | null;
  supplier_name: string;
  rab_division_id: string | null;
  invoice_number: string;
  payment_method: DirectPurchaseMethod;
  reference_number: string;
  notes: string;
  items: DirectMaterialPurchaseLineInput[];
}

export interface DirectMaterialPurchaseItem extends DirectMaterialPurchaseLineInput {
  id: string;
  quantity_accepted: number;
  line_total: number;
}

export interface DirectMaterialPurchase {
  id: string;
  purchase_number: string;
  project_id: string;
  project_title: string;
  rab_division_id: string | null;
  division_name: string | null;
  supplier_id: string | null;
  supplier_name: string;
  purchase_date: string;
  invoice_number: string | null;
  payment_method: DirectPurchaseMethod;
  reference_number: string | null;
  total_amount: number;
  notes: string | null;
  status: 'confirmed' | 'void';
  created_at: string;
  items: DirectMaterialPurchaseItem[];
}

export interface DirectMaterialPurchaseReceipt {
  id: string;
  purchase_number: string;
  cash_transaction_id: string;
  cash_transaction_number: string;
  total_amount: number;
  item_count: number;
}

function fail(error: { message?: string; code?: string }, context: string): never {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    throw new Error(`${context}. Pastikan migration 202611160005_direct_material_purchases.sql sudah dijalankan dan schema Supabase sudah dimuat ulang.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')) {
    throw new Error(`${context}. Akun ini belum memiliki peran Keuangan, Direktur/Owner, atau Admin untuk pembelian langsung.`);
  }
  throw new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}

export async function fetchDirectPurchaseSetup(): Promise<{
  projects: DirectPurchaseProject[];
  suppliers: DirectPurchaseSupplier[];
  materials: DirectPurchaseMaterial[];
}> {
  const [projectsResult, suppliersResult, materialsResult] = await Promise.all([
    supabase.from('projects').select('id,title').order('title', { ascending: true }),
    supabase.from('suppliers').select('id,name').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('master_materials').select('id,code,name,unit,unit_price,category').order('name', { ascending: true }),
  ]);
  if (projectsResult.error) fail(projectsResult.error, 'Gagal memuat proyek');
  if (suppliersResult.error) fail(suppliersResult.error, 'Gagal memuat supplier');
  if (materialsResult.error) fail(materialsResult.error, 'Gagal memuat master material');
  return {
    projects: (projectsResult.data ?? []) as DirectPurchaseProject[],
    suppliers: (suppliersResult.data ?? []) as DirectPurchaseSupplier[],
    materials: (materialsResult.data ?? []).map((row) => ({ ...row, unit_price: Number(row.unit_price ?? 0) })) as DirectPurchaseMaterial[],
  };
}

export async function fetchDirectPurchaseDivisions(projectId: string): Promise<DirectPurchaseDivision[]> {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('rab_divisions')
    .select('id,project_id,code,name,sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) fail(error, 'Gagal memuat divisi/lokasi proyek');
  return (data ?? []) as DirectPurchaseDivision[];
}

export async function fetchDirectMaterialPurchases(limit = 100): Promise<DirectMaterialPurchase[]> {
  const { data: headers, error: headerError } = await supabase
    .from('project_direct_material_purchases')
    .select('id,purchase_number,project_id,rab_division_id,supplier_id,supplier_name,purchase_date,invoice_number,payment_method,reference_number,total_amount,notes,status,created_at')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (headerError) fail(headerError, 'Gagal memuat riwayat pembelian langsung');

  const rows = headers ?? [];
  if (!rows.length) return [];
  const purchaseIds = rows.map((row) => row.id);
  const projectIds = [...new Set(rows.map((row) => row.project_id))];
  const divisionIds = [...new Set(rows.map((row) => row.rab_division_id).filter(Boolean))] as string[];

  const [itemsResult, projectsResult, divisionsResult] = await Promise.all([
    supabase.from('project_direct_material_purchase_items')
      .select('id,purchase_id,material_id,material_code,material_name,unit,quantity_received,quantity_damaged,quantity_accepted,unit_price,line_total,notes')
      .in('purchase_id', purchaseIds)
      .order('created_at', { ascending: true }),
    supabase.from('projects').select('id,title').in('id', projectIds),
    divisionIds.length
      ? supabase.from('rab_divisions').select('id,name').in('id', divisionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) fail(itemsResult.error, 'Gagal memuat rincian material');
  if (projectsResult.error) fail(projectsResult.error, 'Gagal memuat nama proyek');
  if (divisionsResult.error) fail(divisionsResult.error, 'Gagal memuat nama divisi');

  const projectMap = new Map((projectsResult.data ?? []).map((row) => [row.id, row.title]));
  const divisionMap = new Map((divisionsResult.data ?? []).map((row) => [row.id, row.name]));
  const itemsMap = new Map<string, DirectMaterialPurchaseItem[]>();
  for (const item of itemsResult.data ?? []) {
    const current = itemsMap.get(item.purchase_id) ?? [];
    current.push({
      ...item,
      quantity_received: Number(item.quantity_received),
      quantity_damaged: Number(item.quantity_damaged),
      quantity_accepted: Number(item.quantity_accepted),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    } as DirectMaterialPurchaseItem);
    itemsMap.set(item.purchase_id, current);
  }

  return rows.map((row) => ({
    ...row,
    project_title: projectMap.get(row.project_id) ?? 'Proyek tidak ditemukan',
    division_name: row.rab_division_id ? divisionMap.get(row.rab_division_id) ?? null : null,
    total_amount: Number(row.total_amount),
    items: itemsMap.get(row.id) ?? [],
  })) as DirectMaterialPurchase[];
}

export async function recordDirectMaterialPurchase(
  input: DirectMaterialPurchaseInput,
): Promise<DirectMaterialPurchaseReceipt> {
  const { data, error } = await supabase.rpc('record_direct_material_purchase', {
    p_project_id: input.project_id,
    p_purchase_date: input.purchase_date,
    p_supplier_id: input.supplier_id,
    p_supplier_name: input.supplier_name,
    p_rab_division_id: input.rab_division_id,
    p_invoice_number: input.invoice_number,
    p_payment_method: input.payment_method,
    p_reference_number: input.reference_number,
    p_notes: input.notes,
    p_items: input.items,
  });
  if (error) fail(error, 'Gagal menyimpan pembelian material langsung');
  if (!data || typeof data !== 'object' || !('purchase_number' in data)) {
    throw new Error('Database tidak mengembalikan nomor pembelian yang valid.');
  }
  return data as DirectMaterialPurchaseReceipt;
}

export async function voidDirectMaterialPurchase(id: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('Alasan pembatalan wajib diisi.');
  const { error } = await supabase.rpc('void_direct_material_purchase', {
    p_purchase_id: id,
    p_reason: reason.trim(),
  });
  if (error) fail(error, 'Gagal membatalkan pembelian material langsung');
}
