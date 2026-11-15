import { supabase } from '@/lib/supabase';
import type {
  DailyAssignment,
  DailyAssignmentInput,
  DailyAssignmentStatus,
  DivisionOption,
  EmployeeOption,
  MainPlacement,
  MainPlacementInput,
  MainPlacementStatus,
  ProjectOption,
} from '@/types/personnelOperations';

type DbError = { code?: string; message?: string };

function explain(error: DbError, context: string): Error {
  const message = error.message ?? 'Kesalahan database tidak diketahui.';
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return new Error(`${context}. Jalankan migration 202611150009_personnel_placements_and_daily_assignments.sql terlebih dahulu.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(`${context}. Akun Anda belum memiliki izin Personalia untuk tindakan ini.`);
  }
  if (error.code === '23505') {
    return new Error('Karyawan tersebut masih memiliki penempatan utama aktif. Selesaikan penempatan yang lama sebelum membuat penempatan baru.');
  }
  if (error.code === '23503') return new Error(`${context}. Data karyawan, proyek, atau lokasi yang dipilih tidak ditemukan.`);
  if (error.code === '23514') return new Error(`${context}. ${message}`);
  return new Error(`${context}: ${message}`);
}

const MAIN_SELECT = `
  id, placement_number, employee_id, unit_type, unit_name, base_location,
  start_date, end_date, status, notes, created_at,
  employee:employees(employee_number, full_name, department, position_title, employment_type, status)
`;

const DAILY_SELECT = `
  id, assignment_number, employee_id, assignment_date, assignment_type,
  project_id, division_id, location_name, task_title, start_time, end_time,
  status, notes, created_at,
  employee:employees(employee_number, full_name, department, position_title, employment_type, status),
  project:projects(title, client),
  division:rab_divisions(name)
`;

export interface MainPlacementPageData {
  placements: MainPlacement[];
  employees: EmployeeOption[];
}

export interface DailyAssignmentPageData {
  assignments: DailyAssignment[];
  employees: EmployeeOption[];
  projects: ProjectOption[];
  divisions: DivisionOption[];
}

export async function fetchMainPlacementPageData(): Promise<MainPlacementPageData> {
  const [placementResult, employeeResult] = await Promise.all([
    supabase.from('employee_placements').select(MAIN_SELECT)
      .order('start_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('employees')
      .select('id, employee_number, full_name, department, position_title, employment_type, status')
      .order('full_name'),
  ]);
  if (placementResult.error) throw explain(placementResult.error, 'Gagal memuat riwayat penempatan utama');
  if (employeeResult.error) throw explain(employeeResult.error, 'Gagal memuat master karyawan');
  return {
    placements: (placementResult.data ?? []) as unknown as MainPlacement[],
    employees: (employeeResult.data ?? []) as EmployeeOption[],
  };
}

function normalizeMain(input: MainPlacementInput): MainPlacementInput {
  const unitName = input.unit_name.trim();
  if (!input.employee_id) throw new Error('Pilih karyawan terlebih dahulu.');
  if (!unitName) throw new Error('Nama unit atau tim wajib diisi.');
  if (!input.start_date) throw new Error('Tanggal mulai wajib diisi.');
  if (input.end_date && input.end_date < input.start_date) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return {
    ...input,
    unit_name: unitName,
    base_location: input.base_location?.trim() || null,
    end_date: input.end_date || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createMainPlacement(input: MainPlacementInput): Promise<MainPlacement> {
  const { data, error } = await supabase.from('employee_placements')
    .insert(normalizeMain(input)).select(MAIN_SELECT).single();
  if (error) throw explain(error, 'Gagal membuat penempatan utama');
  return data as unknown as MainPlacement;
}

export async function updateMainPlacement(id: string, input: MainPlacementInput): Promise<MainPlacement> {
  if (!id) throw new Error('ID penempatan utama tidak ditemukan.');
  const { data, error } = await supabase.from('employee_placements')
    .update(normalizeMain(input)).eq('id', id).select(MAIN_SELECT).single();
  if (error) throw explain(error, 'Gagal memperbarui penempatan utama');
  return data as unknown as MainPlacement;
}

export async function closeMainPlacement(row: MainPlacement, endDate: string): Promise<MainPlacement> {
  if (endDate < row.start_date) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return updateMainPlacement(row.id, {
    employee_id: row.employee_id,
    unit_type: row.unit_type,
    unit_name: row.unit_name,
    base_location: row.base_location,
    start_date: row.start_date,
    end_date: endDate,
    status: 'completed',
    notes: row.notes,
  });
}

export async function fetchDailyAssignmentPageData(): Promise<DailyAssignmentPageData> {
  const [assignmentResult, employeeResult, projectResult, divisionResult] = await Promise.all([
    supabase.from('employee_daily_assignments').select(DAILY_SELECT)
      .order('assignment_date', { ascending: false }).order('start_time', { ascending: true }),
    supabase.from('employees')
      .select('id, employee_number, full_name, department, position_title, employment_type, status')
      .order('full_name'),
    supabase.from('projects').select('id, title, client').order('title'),
    supabase.from('rab_divisions').select('id, project_id, name, code, sort_order')
      .order('sort_order', { ascending: true }),
  ]);
  if (assignmentResult.error) throw explain(assignmentResult.error, 'Gagal memuat penugasan harian');
  if (employeeResult.error) throw explain(employeeResult.error, 'Gagal memuat master karyawan');
  if (projectResult.error) throw explain(projectResult.error, 'Gagal memuat daftar proyek');
  if (divisionResult.error) throw explain(divisionResult.error, 'Gagal memuat lokasi pekerjaan RAB');
  return {
    assignments: (assignmentResult.data ?? []) as unknown as DailyAssignment[],
    employees: (employeeResult.data ?? []) as EmployeeOption[],
    projects: (projectResult.data ?? []) as ProjectOption[],
    divisions: (divisionResult.data ?? []) as DivisionOption[],
  };
}

function normalizeDaily(input: DailyAssignmentInput): DailyAssignmentInput {
  if (!input.employee_id) throw new Error('Pilih karyawan terlebih dahulu.');
  if (!input.assignment_date) throw new Error('Tanggal penugasan wajib diisi.');
  if (!input.task_title.trim()) throw new Error('Nama pekerjaan wajib diisi.');
  if (input.assignment_type === 'project' && !input.project_id) throw new Error('Pilih proyek untuk penugasan proyek.');
  if (input.assignment_type !== 'project' && !input.location_name?.trim()) {
    throw new Error('Isi nama lokasi atau unit untuk penugasan nonproyek.');
  }
  if ((input.start_time && !input.end_time) || (!input.start_time && input.end_time)) {
    throw new Error('Jam mulai dan jam selesai harus diisi berpasangan.');
  }
  if (input.start_time && input.end_time && input.end_time <= input.start_time) {
    throw new Error('Jam selesai harus lebih besar daripada jam mulai. Penugasan lintas tengah malam perlu dicatat terpisah.');
  }
  return {
    ...input,
    project_id: input.assignment_type === 'project' ? input.project_id : null,
    division_id: input.assignment_type === 'project' ? input.division_id : null,
    location_name: input.assignment_type === 'project' ? null : input.location_name?.trim() || null,
    task_title: input.task_title.trim(),
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createDailyAssignment(input: DailyAssignmentInput): Promise<DailyAssignment> {
  const { data, error } = await supabase.from('employee_daily_assignments')
    .insert(normalizeDaily(input)).select(DAILY_SELECT).single();
  if (error) throw explain(error, 'Gagal menyimpan penugasan harian');
  return data as unknown as DailyAssignment;
}

export async function updateDailyAssignment(id: string, input: DailyAssignmentInput): Promise<DailyAssignment> {
  if (!id) throw new Error('ID penugasan harian tidak ditemukan.');
  const { data, error } = await supabase.from('employee_daily_assignments')
    .update(normalizeDaily(input)).eq('id', id).select(DAILY_SELECT).single();
  if (error) throw explain(error, 'Gagal memperbarui penugasan harian');
  return data as unknown as DailyAssignment;
}

export async function updateDailyAssignmentStatus(
  row: DailyAssignment,
  status: DailyAssignmentStatus,
): Promise<DailyAssignment> {
  return updateDailyAssignment(row.id, {
    employee_id: row.employee_id,
    assignment_date: row.assignment_date,
    assignment_type: row.assignment_type,
    project_id: row.project_id,
    division_id: row.division_id,
    location_name: row.location_name,
    task_title: row.task_title,
    start_time: row.start_time,
    end_time: row.end_time,
    status,
    notes: row.notes,
  });
}
