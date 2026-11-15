import { supabase } from '@/lib/supabase';
import { fetchWarehouseStock } from '@/lib/services/warehouseService';
import type { WarehouseStockRow } from '@/types/warehouse';
import type {
  RecentWarehouseIssue,
  WarehouseIssueDivision,
  WarehouseIssueInput,
  WarehouseIssueProject,
} from '@/types/warehouseIssue';

type RawDivision = {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
  items: Array<{ id: string; code: string | null; name: string; unit: string | null }> | null;
};

type Related<T> = T | T[] | null;

function first<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value as T | null;
}

function databaseError(error: { code?: string; message?: string }, context: string): string {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return `${context}. Jalankan migration 202611150003_warehouse_issue.sql di Supabase.`;
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) {
    return `${context}. Akun Anda belum memiliki akses Gudang/Pengeluaran Material.`;
  }
  return `${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`;
}

export interface WarehouseIssuePageData {
  stocks: WarehouseStockRow[];
  projects: WarehouseIssueProject[];
  divisions: WarehouseIssueDivision[];
  recentIssues: RecentWarehouseIssue[];
}

export async function fetchWarehouseIssuePageData(): Promise<WarehouseIssuePageData> {
  // Daftar proyek tidak boleh diturunkan dari daftar stok. Proyek yang belum
  // menerima material tetap harus muncul agar lokasi RAB dan status stoknya
  // dapat diperiksa dari formulir Pengeluaran.
  const [stocks, projectResult, issueResult] = await Promise.all([
    fetchWarehouseStock(),
    supabase
      .from('projects')
      .select('id, title, client')
      .order('title', { ascending: true }),
    supabase
      .from('project_material_issues')
      .select(`
        id,
        issue_number,
        project_id,
        issued_at,
        recipient_name,
        status,
        project:projects(title),
        items:project_material_issue_items(
          id,
          material_name,
          unit,
          quantity_issued,
          division:rab_divisions(name)
        )
      `)
      .order('issued_at', { ascending: false })
      .limit(20),
  ]);

  if (projectResult.error) {
    throw new Error(databaseError(projectResult.error, 'Gagal memuat daftar proyek'));
  }
  if (issueResult.error) {
    throw new Error(databaseError(issueResult.error, 'Gagal memuat riwayat pengeluaran material'));
  }

  const projects = ((projectResult.data ?? []) as Array<{
    id: string;
    title: string;
    client: string | null;
  }>).map((project) => ({
    id: project.id,
    title: project.title,
    client: project.client,
  }));
  const projectMap = new Map<string, WarehouseIssueProject>(
    projects.map((project) => [project.id, project]),
  );
  const projectIds = projects.map((project) => project.id);

  // Muat divisi RAB untuk semua proyek yang terlihat oleh akun saat ini,
  // bukan hanya proyek yang kebetulan memiliki saldo persediaan.
  let divisions: WarehouseIssueDivision[] = [];
  if (projectIds.length > 0) {
    const { data, error } = await supabase
      .from('rab_divisions')
      .select(`
        id,
        project_id,
        code,
        name,
        sort_order,
        items:rab_items(id, code, name, unit)
      `)
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(databaseError(error, 'Gagal memuat divisi/lokasi pekerjaan'));
    divisions = ((data ?? []) as unknown as RawDivision[]).map((row) => ({
      id: row.id,
      project_id: row.project_id,
      code: row.code,
      name: row.name,
      sort_order: Number(row.sort_order ?? 0),
      items: (row.items ?? []).map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
      })),
    }));
  }

  const recentIssues: RecentWarehouseIssue[] = ((issueResult.data ?? []) as unknown as Array<{
    id: string;
    issue_number: string;
    project_id: string;
    issued_at: string;
    recipient_name: string | null;
    status: 'confirmed' | 'void';
    project: Related<{ title: string }>;
    items: Array<{
      material_name: string;
      unit: string;
      quantity_issued: number | string;
      division: Related<{ name: string }>;
    }> | null;
  }>).map((row) => {
    const project = first(row.project);
    const items = row.items ?? [];
    return {
      id: row.id,
      issue_number: row.issue_number,
      project_id: row.project_id,
      project_title: project?.title ?? projectMap.get(row.project_id)?.title ?? 'Proyek tidak ditemukan',
      issued_at: row.issued_at,
      recipient_name: row.recipient_name,
      status: row.status,
      item_count: items.length,
      allocations: items.map((item) => {
        const division = first(item.division);
        const quantity = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(item.quantity_issued ?? 0));
        return `${item.material_name}: ${quantity} ${item.unit} → ${division?.name ?? 'Divisi tidak diketahui'}`;
      }),
    };
  });

  return {
    stocks,
    projects,
    divisions,
    recentIssues,
  };
}

export async function recordWarehouseMaterialIssue(input: WarehouseIssueInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_project_material_issue', {
    p_project_id: input.project_id,
    p_issued_at: input.issued_at,
    p_recipient_name: input.recipient_name ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items,
  });

  if (error) {
    const message = error.code === '23514'
      ? error.message
      : databaseError(error, 'Pengeluaran material gagal disimpan');
    throw new Error(message);
  }
  if (typeof data !== 'string' || !data) {
    throw new Error('Database tidak mengembalikan ID transaksi pengeluaran.');
  }
  return data;
}
