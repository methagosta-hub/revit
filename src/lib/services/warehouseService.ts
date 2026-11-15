import { supabase } from '@/lib/supabase';
import type { WarehouseStockRow } from '@/types/warehouse';

type RawStockRow = {
  project_id: string;
  material_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_on_hand: number | string;
};

type ProjectIdentity = {
  id: string;
  title: string;
  client: string | null;
};

function describeDatabaseError(error: { code?: string; message?: string }): string {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
    return 'View stok belum tersedia. Pastikan migration 202611150002_warehouse_receiving.sql sudah dijalankan di Supabase.';
  }
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')) {
    return 'Akun Anda belum memiliki izin membaca persediaan. Periksa peran Gudang atau Direktur dan permission warehouse.manage.';
  }
  return error.message ?? 'Kesalahan database tidak diketahui.';
}

/**
 * Mengambil stok diterima dan layak pakai dari v_project_material_stock.
 * Nama proyek diambil terpisah karena view stok tidak memuat identitas proyek.
 */
export async function fetchWarehouseStock(): Promise<WarehouseStockRow[]> {
  const { data: stockData, error: stockError } = await supabase
    .from('v_project_material_stock')
    .select('project_id, material_id, material_code, material_name, unit, quantity_on_hand')
    .gt('quantity_on_hand', 0)
    .order('material_name', { ascending: true });

  if (stockError) {
    throw new Error(`Gagal memuat persediaan: ${describeDatabaseError(stockError)}`);
  }

  const stockRows = (stockData ?? []) as RawStockRow[];
  if (stockRows.length === 0) return [];

  const projectIds = Array.from(new Set(stockRows.map((row) => row.project_id).filter(Boolean)));
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('id, title, client')
    .in('id', projectIds);

  if (projectError) {
    throw new Error(`Stok berhasil dibaca, tetapi identitas proyek gagal dimuat: ${describeDatabaseError(projectError)}`);
  }

  const projectById = new Map<string, ProjectIdentity>(
    ((projects ?? []) as ProjectIdentity[]).map((project) => [project.id, project]),
  );

  return stockRows.map((row) => {
    const project = projectById.get(row.project_id);
    return {
      project_id: row.project_id,
      project_title: project?.title ?? 'Proyek tidak ditemukan',
      project_client: project?.client ?? null,
      material_id: row.material_id,
      material_code: row.material_code,
      material_name: row.material_name,
      unit: row.unit,
      quantity_on_hand: Number(row.quantity_on_hand ?? 0),
    };
  });
}
