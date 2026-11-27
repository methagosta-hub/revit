import { supabase } from '@/lib/supabase';

type DivisionTotalRow = {
  project_id: string;
  items?: Array<{ total_price?: number | string | null }> | null;
};

function sumDivisionItems(rows: DivisionTotalRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const division of rows) {
    const subtotal = (division.items ?? []).reduce(
      (sum, item) => sum + Number(item.total_price ?? 0),
      0,
    );
    totals.set(division.project_id, (totals.get(division.project_id) ?? 0) + subtotal);
  }
  return totals;
}

/**
 * Hitung nilai proyek dari sumber transaksi RAB (rab_items.total_price),
 * simpan ke projects.total_value, lalu kembalikan nilainya.
 */
export async function recalculateProjectTotal(projectId: string): Promise<number> {
  const { data: divisions, error: divisionError } = await supabase
    .from('rab_divisions')
    .select('project_id, items:rab_items(total_price)')
    .eq('project_id', projectId);

  if (divisionError) throw divisionError;

  const total = Number(
    ((divisions ?? []) as DivisionTotalRow[]).reduce(
      (projectSum, division) =>
        projectSum + (division.items ?? []).reduce(
          (itemSum, item) => itemSum + Number(item.total_price ?? 0),
          0,
        ),
      0,
    ).toFixed(2),
  );

  const { error: updateError } = await supabase
    .from('projects')
    .update({ total_value: total, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (updateError) throw updateError;
  return total;
}

/** Temukan proyek dari sebuah rab_item, kemudian hitung ulang total proyeknya. */
export async function recalculateProjectTotalFromRabItem(rabItemId: string): Promise<number> {
  const { data: rabItem, error: itemError } = await supabase
    .from('rab_items')
    .select('division_id')
    .eq('id', rabItemId)
    .single();

  if (itemError) throw itemError;

  const { data: division, error: divisionError } = await supabase
    .from('rab_divisions')
    .select('project_id')
    .eq('id', rabItem.division_id)
    .single();

  if (divisionError) throw divisionError;
  return recalculateProjectTotal(division.project_id);
}

// Proyek dibatalkan disembunyikan dari daftar operasional secara default.
// Layar manajemen dapat meminta semuanya agar owner dapat memulihkan status.
export async function fetchProjects(includeCancelled = false) {
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (projectError) {
    console.error('Gagal mengambil data proyek:', projectError.message);
    return [];
  }

  const visibleProjects = (projects ?? []).filter(
    (project) => includeCancelled || project.status !== 'DIBATALKAN',
  );

  if (!visibleProjects.length) return [];

  const { data: divisions, error: divisionError } = await supabase
    .from('rab_divisions')
    .select('project_id, items:rab_items(total_price)');

  if (divisionError) {
    console.error('Gagal menghitung nilai RAB proyek:', divisionError.message);
    return visibleProjects;
  }

  const totals = sumDivisionItems((divisions ?? []) as DivisionTotalRow[]);
  const normalizedProjects = visibleProjects.map((project) => ({
    ...project,
    total_value: Number((totals.get(project.id) ?? 0).toFixed(2)),
  }));

  // Sinkronkan kolom ringkasan agar juga benar saat dibaca halaman lain.
  await Promise.all(
    normalizedProjects
      .filter((project) => project.status !== 'DIBATALKAN')
      .filter((project) => Math.abs(Number(project.total_value ?? 0) - Number(visibleProjects.find((p) => p.id === project.id)?.total_value ?? 0)) >= 0.005)
      .map(async (project) => {
        const { error } = await supabase
          .from('projects')
          .update({ total_value: project.total_value, updated_at: new Date().toISOString() })
          .eq('id', project.id);
        if (error) console.warn(`Gagal menyimpan total RAB proyek ${project.id}:`, error.message);
      }),
  );

  return normalizedProjects;
}

// Ambil detail proyek beserta divisi, item RAB, dan backup volume.
export async function fetchProjectDetail(
  projectId: string,
  options: { syncTotalValue?: boolean } = {},
) {
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projError) {
    console.error('Proyek tidak ditemukan:', projError.message);
    return null;
  }

  if (project.status === 'DIBATALKAN') return null;

  const { data: divisions, error: divError } = await supabase
    .from('rab_divisions')
    .select(`
      id,
      project_id,
      code,
      name,
      sort_order,
      workCategories:rab_work_categories(
        id,
        division_id,
        name,
        sort_order,
        legacy_key,
        subcategories:rab_work_subcategories(
          id,
          division_id,
          category_id,
          name,
          sort_order,
          legacy_key
        )
      ),
      items:rab_items(
        id,
        division_id,
        master_ahsp_id,
        code,
        name,
        unit,
        volume,
        is_volume_from_backup,
        unit_price,
        total_price,
        components_snapshot,
        subitems_snapshot,
        work_group_id,
        work_group_name,
        rab_subcategory_id,
        sort_order,
        backupDetails:volume_details(
          id,
          rab_item_id,
          subitem_path,
          description,
          drawing_ref,
          multiplier,
          calc_mode,
          parameters,
          subtotal
        )
      )
    `)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (divError) {
    console.error('Gagal mengambil divisi RAB:', divError.message);
  }

  const formattedDivisions = (divisions || []).map((div: any) => ({
    ...div,
    items: (div.items || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
  }));

  const calculatedTotal = Number(
    formattedDivisions.reduce(
      (sum: number, division: any) => sum + (division.items ?? []).reduce(
        (itemSum: number, item: any) => itemSum + Number(item.total_price ?? 0),
        0,
      ),
      0,
    ).toFixed(2),
  );

  // Layar ekspor dapat meminta mode read-only agar perhitungan sementara
  // tidak memicu penulisan ke tabel projects.
  if (options.syncTotalValue !== false && Math.abs(calculatedTotal - Number(project.total_value ?? 0)) >= 0.005) {
    const { error: syncError } = await supabase
      .from('projects')
      .update({ total_value: calculatedTotal, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if (syncError) console.warn('Gagal menyinkronkan total proyek:', syncError.message);
  }

  return {
    ...project,
    total_value: calculatedTotal,
    divisions: formattedDivisions,
  };
}
