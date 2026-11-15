import { supabase } from '@/lib/supabase';
import { fetchWarehouseStock } from '@/lib/services/warehouseService';
import type { WarehouseStockRow } from '@/types/warehouse';

export type WarehouseActivityKind = 'receipt' | 'issue';

export interface WarehouseDashboardActivity {
  id: string;
  kind: WarehouseActivityKind;
  document_number: string;
  project_id: string;
  project_title: string;
  occurred_at: string;
  item_count: number;
  summary: string;
}

export interface WarehousePendingOrder {
  id: string;
  po_number: string;
  project_title: string;
  supplier_name: string;
  expected_date: string | null;
  status: 'approved' | 'ordered' | 'partially_received';
}

export interface WarehouseDashboardData {
  stocks: WarehouseStockRow[];
  receipt_count_this_month: number;
  issue_count_this_month: number;
  pending_order_count: number;
  pending_orders: WarehousePendingOrder[];
  recent_activities: WarehouseDashboardActivity[];
}

type Related<T> = T | T[] | null;

function first<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value as T | null;
}

function databaseError(error: { code?: string; message?: string }, context: string): string {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
    return `${context}. Pastikan migration 202611150002_warehouse_receiving.sql dan 202611150003_warehouse_issue.sql sudah dijalankan.`;
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) {
    return `${context}. Akun Anda belum memiliki izin Dashboard Gudang. Periksa peran Gudang/Direktur dan permission warehouse.manage.`;
  }
  return `${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`;
}

function currentMonthStartIso(): string {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return monthStart.toISOString();
}

function formatQuantity(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

export async function fetchWarehouseDashboardData(): Promise<WarehouseDashboardData> {
  const monthStart = currentMonthStartIso();

  const [
    stocks,
    receiptCountResult,
    issueCountResult,
    pendingCountResult,
    recentReceiptsResult,
    recentIssuesResult,
    pendingOrdersResult,
  ] = await Promise.all([
    fetchWarehouseStock(),
    supabase
      .from('project_material_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('received_at', monthStart),
    supabase
      .from('project_material_issues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('issued_at', monthStart),
    supabase
      .from('project_purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'ordered', 'partially_received']),
    supabase
      .from('project_material_receipts')
      .select(`
        id,
        receipt_number,
        project_id,
        received_at,
        status,
        project:projects(title),
        items:project_material_receipt_items(
          id,
          quantity_accepted,
          purchase_order_item:project_purchase_order_items(material_name, unit)
        )
      `)
      .eq('status', 'confirmed')
      .order('received_at', { ascending: false })
      .limit(8),
    supabase
      .from('project_material_issues')
      .select(`
        id,
        issue_number,
        project_id,
        issued_at,
        status,
        project:projects(title),
        items:project_material_issue_items(id, material_name, unit, quantity_issued)
      `)
      .eq('status', 'confirmed')
      .order('issued_at', { ascending: false })
      .limit(8),
    supabase
      .from('project_purchase_orders')
      .select(`
        id,
        po_number,
        status,
        expected_date,
        project:projects(title),
        supplier:suppliers(name)
      `)
      .in('status', ['approved', 'ordered', 'partially_received'])
      .order('expected_date', { ascending: true, nullsFirst: false })
      .limit(6),
  ]);

  if (receiptCountResult.error) {
    throw new Error(databaseError(receiptCountResult.error, 'Gagal menghitung penerimaan bulan ini'));
  }
  if (issueCountResult.error) {
    throw new Error(databaseError(issueCountResult.error, 'Gagal menghitung pengeluaran bulan ini'));
  }
  if (pendingCountResult.error) {
    throw new Error(databaseError(pendingCountResult.error, 'Gagal menghitung PO yang masih berjalan'));
  }
  if (recentReceiptsResult.error) {
    throw new Error(databaseError(recentReceiptsResult.error, 'Gagal memuat aktivitas penerimaan'));
  }
  if (recentIssuesResult.error) {
    throw new Error(databaseError(recentIssuesResult.error, 'Gagal memuat aktivitas pengeluaran'));
  }
  if (pendingOrdersResult.error) {
    throw new Error(databaseError(pendingOrdersResult.error, 'Gagal memuat PO yang menunggu kedatangan'));
  }

  type ReceiptRow = {
    id: string;
    receipt_number: string;
    project_id: string;
    received_at: string;
    project: Related<{ title: string }>;
    items: Array<{
      quantity_accepted: number | string;
      purchase_order_item: Related<{ material_name: string; unit: string }>;
    }> | null;
  };
  type IssueRow = {
    id: string;
    issue_number: string;
    project_id: string;
    issued_at: string;
    project: Related<{ title: string }>;
    items: Array<{
      material_name: string;
      unit: string;
      quantity_issued: number | string;
    }> | null;
  };
  type PendingOrderRow = {
    id: string;
    po_number: string;
    status: 'approved' | 'ordered' | 'partially_received';
    expected_date: string | null;
    project: Related<{ title: string }>;
    supplier: Related<{ name: string }>;
  };

  const receiptActivities: WarehouseDashboardActivity[] = (
    (recentReceiptsResult.data ?? []) as unknown as ReceiptRow[]
  ).map((row) => {
    const project = first(row.project);
    const items = row.items ?? [];
    const summary = items.slice(0, 2).map((item) => {
      const poItem = first(item.purchase_order_item);
      if (!poItem) return 'Rincian material';
      return `${poItem.material_name} · ${formatQuantity(item.quantity_accepted)} ${poItem.unit}`;
    }).join('; ');

    return {
      id: row.id,
      kind: 'receipt',
      document_number: row.receipt_number,
      project_id: row.project_id,
      project_title: project?.title ?? 'Proyek tidak ditemukan',
      occurred_at: row.received_at,
      item_count: items.length,
      summary: summary || 'Penerimaan material dikonfirmasi',
    };
  });

  const issueActivities: WarehouseDashboardActivity[] = (
    (recentIssuesResult.data ?? []) as unknown as IssueRow[]
  ).map((row) => {
    const project = first(row.project);
    const items = row.items ?? [];
    const summary = items.slice(0, 2).map((item) =>
      `${item.material_name} · ${formatQuantity(item.quantity_issued)} ${item.unit}`
    ).join('; ');

    return {
      id: row.id,
      kind: 'issue',
      document_number: row.issue_number,
      project_id: row.project_id,
      project_title: project?.title ?? 'Proyek tidak ditemukan',
      occurred_at: row.issued_at,
      item_count: items.length,
      summary: summary || 'Pengeluaran material dikonfirmasi',
    };
  });

  const recentActivities = [...receiptActivities, ...issueActivities]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 10);

  const pendingOrders: WarehousePendingOrder[] = (
    (pendingOrdersResult.data ?? []) as unknown as PendingOrderRow[]
  ).map((row) => ({
    id: row.id,
    po_number: row.po_number,
    status: row.status,
    expected_date: row.expected_date,
    project_title: first(row.project)?.title ?? 'Proyek tidak ditemukan',
    supplier_name: first(row.supplier)?.name ?? 'Supplier tidak ditemukan',
  }));

  return {
    stocks,
    receipt_count_this_month: receiptCountResult.count ?? 0,
    issue_count_this_month: issueCountResult.count ?? 0,
    pending_order_count: pendingCountResult.count ?? 0,
    pending_orders: pendingOrders,
    recent_activities: recentActivities,
  };
}
