import { supabase } from '@/lib/supabase';
import type {
  DailyReportDivision,
  DailyReportPackageItem,
  DailyReportRecord,
} from '@/types/projectDailyReport';

type DbError = { code?: string; message?: string; details?: string; hint?: string };

function explain(error: DbError, context: string): Error {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' · ')
    || 'Kesalahan database tidak diketahui.';

  if (error.code === '42P01' || error.code === '42703') {
    return new Error(
      `${context}. Struktur database belum lengkap. Jalankan ulang Migration 017 dan pastikan Migration 012, 009, serta 011 sudah berhasil. Detail: ${message}`,
    );
  }

  if (error.code === 'PGRST202' || error.code === 'PGRST203' || error.code === 'PGRST205') {
    return new Error(
      `${context}. Fungsi/tabel belum dikenali API Supabase. Jalankan migration terkait, lalu muat ulang schema cache PostgREST (NOTIFY pgrst, 'reload schema'). Detail: ${message}`,
    );
  }

  if (error.code === '42501' || /row-level security|permission denied|tidak memiliki akses/i.test(message)) {
    return new Error(`${context}. Akun tidak memiliki hak akses pada proyek/divisi ini. Detail: ${message}`);
  }

  if (error.code === '23503' || error.code === '23514' || error.code === '23505') {
    return new Error(`${context}. Data tidak lolos validasi database: ${message}`);
  }

  return new Error(`${context}: ${message}`);
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

export interface DailyReportEmployee {
  id: string;
  employee_number: string | null;
  full_name: string;
  position_title: string | null;
  assignment_source: 'daily_assignment' | 'project_assignment' | string;
  daily_assignment_id: string | null;
}

export interface DailyReportWorkspace {
  project: {
    id: string;
    title: string;
    client: string | null;
    location: string | null;
  } | null;
  divisions: DailyReportDivision[];
  packageItems: DailyReportPackageItem[];
  reports: DailyReportRecord[];
}

export async function fetchDailyReportWorkspace(projectId: string): Promise<DailyReportWorkspace> {
  if (!projectId) throw new Error('ID proyek tidak ditemukan pada URL.');

  const [contextResult, reportsResult] = await Promise.all([
    supabase.rpc('dahlia_daily_report_context', { p_project_id: projectId }),
    supabase
      .from('project_daily_reports')
      .select('id,report_number,project_id,division_id,report_date,weather,field_condition,work_summary,start_time,end_time,obstacles,follow_up,status,created_by,submitted_at,reviewed_at,review_notes,created_at')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(150),
  ]);

  if (contextResult.error) throw explain(contextResult.error, 'Gagal memuat konteks proyek, divisi, dan paket/RAB');
  if (reportsResult.error) throw explain(reportsResult.error, 'Gagal memuat arsip laporan harian');

  const context = (contextResult.data ?? {}) as Record<string, unknown>;
  const packageRows = asArray<Record<string, unknown>>(context.package_items);
  const packageItems = packageRows.map((row) => ({
    id: String(row.id ?? ''),
    package_id: String(row.package_id ?? ''),
    rab_item_id: row.rab_item_id ? String(row.rab_item_id) : null,
    rab_division_id: row.rab_division_id ? String(row.rab_division_id) : null,
    package_division_id: row.package_division_id ? String(row.package_division_id) : null,
    rab_code: row.rab_code ? String(row.rab_code) : null,
    item_name: String(row.item_name ?? ''),
    unit: String(row.unit ?? ''),
    planned_quantity: Number(row.planned_quantity ?? 0),
    reference_unit_price: Number(row.reference_unit_price ?? 0),
    package_name: String(row.package_name ?? 'Paket pekerjaan'),
    package_number: String(row.package_number ?? ''),
    package_status: String(row.package_status ?? 'active'),
    components_snapshot: Array.isArray(row.components_snapshot) ? row.components_snapshot : [],
  })) as DailyReportPackageItem[];

  return {
    project: (context.project ?? null) as DailyReportWorkspace['project'],
    divisions: asArray<DailyReportDivision>(context.divisions),
    packageItems,
    reports: (reportsResult.data ?? []) as DailyReportRecord[],
  };
}

export async function fetchProjectReportEmployees(
  projectId: string,
  reportDate: string,
  divisionId: string | null,
): Promise<DailyReportEmployee[]> {
  const { data, error } = await supabase.rpc('dahlia_daily_report_employees', {
    p_project_id: projectId,
    p_report_date: reportDate,
    p_division_id: divisionId || null,
  });

  if (error) throw explain(error, 'Gagal memuat daftar karyawan proyek. Jalankan Migration 018 setelah Migration 017.');

  return asArray<DailyReportEmployee>(data).filter((row) => row.id && row.full_name);
}

export async function fetchDailyReportDetails(reportId: string) {
  const [report, work, labor, materials, equipment] = await Promise.all([
    supabase.from('project_daily_reports').select('*').eq('id', reportId).single(),
    supabase
      .from('project_daily_report_work_items')
      .select('id,package_item_id,segment_item_id,rab_code,item_name,unit,rab_quantity,quantity_today,ahsp_components_snapshot,notes')
      .eq('report_id', reportId),
    supabase
      .from('project_daily_report_labor')
      .select('id,employee_id,daily_assignment_id,attendance_record_id,employee_name_snapshot,position_snapshot,attendance_status,hours_worked,hok,overtime_hours,notes')
      .eq('report_id', reportId),
    supabase
      .from('project_daily_report_materials')
      .select('id,material_id,material_name,unit,quantity_used,source_issue_item_id,estimated_waste_quantity,notes')
      .eq('report_id', reportId),
    supabase
      .from('project_daily_report_equipment')
      .select('id,equipment_name,quantity,hours_used,condition_status,cost_estimate,notes')
      .eq('report_id', reportId),
  ]);

  if (report.error) throw explain(report.error, 'Gagal memuat identitas laporan');
  if (work.error) throw explain(work.error, 'Gagal memuat volume pekerjaan');
  if (labor.error) throw explain(labor.error, 'Gagal memuat tenaga kerja');
  if (materials.error) throw explain(materials.error, 'Gagal memuat material');
  if (equipment.error) throw explain(equipment.error, 'Gagal memuat peralatan');

  return {
    report: report.data,
    work: work.data ?? [],
    labor: labor.data ?? [],
    materials: materials.data ?? [],
    equipment: equipment.data ?? [],
  };
}

export interface SaveDailyReportInput {
  report_id: string | null;
  project_id: string;
  division_id: string;
  report_date: string;
  weather: string;
  field_condition: string;
  work_summary: string;
  start_time: string;
  end_time: string;
  obstacles: string;
  follow_up: string;
  submit: boolean;
  work_items: unknown[];
  labor: unknown[];
  materials: unknown[];
  equipment: unknown[];
}

export async function saveDailyReport(input: SaveDailyReportInput): Promise<string> {
  const { data, error } = await supabase.rpc('dahlia_save_daily_report', {
    p_report_id: input.report_id,
    p_project_id: input.project_id,
    p_division_id: input.division_id,
    p_report_date: input.report_date,
    p_weather: input.weather,
    p_field_condition: input.field_condition,
    p_work_summary: input.work_summary,
    p_start_time: input.start_time || null,
    p_end_time: input.end_time || null,
    p_obstacles: input.obstacles,
    p_follow_up: input.follow_up,
    p_submit: input.submit,
    p_work_items: input.work_items,
    p_labor: input.labor,
    p_materials: input.materials,
    p_equipment: input.equipment,
  });

  if (error) throw explain(error, 'Gagal menyimpan laporan harian');
  if (typeof data !== 'string') throw new Error('Database tidak mengembalikan ID laporan. Periksa signature RPC Migration 017.');
  return data;
}

export async function reviewDailyReport(
  reportId: string,
  decision: 'approved' | 'rejected',
  notes: string,
): Promise<void> {
  const { error } = await supabase.rpc('dahlia_review_daily_report', {
    p_report_id: reportId,
    p_decision: decision,
    p_review_notes: notes || null,
  });
  if (error) throw explain(error, 'Gagal memeriksa laporan harian');
}

export async function fetchDailyReportPrintData(reportId: string) {
  const detail = await fetchDailyReportDetails(reportId);
  const report = detail.report as Record<string, unknown>;

  const [projectResult, divisionResult, authorResult, reviewerResult] = await Promise.all([
    supabase.from('projects').select('id,title,client,location').eq('id', report.project_id as string).single(),
    supabase.from('rab_divisions').select('id,code,name').eq('id', report.division_id as string).single(),
    supabase.from('user_profiles').select('id,full_name,employee_code').eq('id', report.created_by as string).maybeSingle(),
    report.reviewed_by
      ? supabase.from('user_profiles').select('id,full_name,employee_code').eq('id', report.reviewed_by as string).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  if (projectResult.error) throw explain(projectResult.error, 'Gagal memuat identitas proyek untuk PDF');
  if (divisionResult.error) throw explain(divisionResult.error, 'Gagal memuat divisi untuk PDF');
  if (authorResult.error) throw explain(authorResult.error, 'Gagal memuat nama pelapor untuk PDF');
  if (reviewerResult.error) throw explain(reviewerResult.error, 'Gagal memuat nama pemeriksa untuk PDF');

  return {
    ...detail,
    project: projectResult.data,
    division: divisionResult.data,
    author: authorResult.data,
    reviewer: reviewerResult.data,
  };
}
