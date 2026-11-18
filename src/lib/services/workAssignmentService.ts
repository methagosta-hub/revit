import { supabase } from '@/lib/supabase';
import type {
  ActiveEmployeeOption,
  DivisionOption,
  ProjectOption,
  WorkAssignment,
  WorkAssignmentInput,
  WorkAssignmentStatus,
} from '@/types/workAssignment';

type DbError = { code?: string; message?: string };

function describeError(error: DbError, context: string): Error {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return new Error(`${context}. Pastikan migration 202611150007_personnel_employees.sql dan 202611150008_personnel_work_assignments.sql sudah dijalankan.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')) {
    return new Error(`${context}. Akun Anda belum memiliki hak akses Personalia untuk data ini.`);
  }
  if (error.code === '23503') return new Error(`${context}. Karyawan, proyek, atau lokasi pekerjaan yang dipilih tidak ditemukan.`);
  if (error.code === '23514') return new Error(`${context}. ${error.message ?? 'Data penempatan tidak memenuhi aturan.'}`);
  if (error.code === '23505') return new Error('Nomor penempatan sudah digunakan. Segarkan halaman, lalu coba kembali.');
  return new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}

const ASSIGNMENT_SELECT = `
  id, assignment_number, employee_id, project_id, division_id,
  assignment_title, start_date, end_date, status, notes, created_at, updated_at,
  employee:employees(employee_number, full_name, employment_type, status),
  project:projects(title, client),
  division:rab_divisions(name)
`;

export interface WorkAssignmentPageData {
  assignments: WorkAssignment[];
  employees: ActiveEmployeeOption[];
  projects: ProjectOption[];
  divisions: DivisionOption[];
}

export async function fetchWorkAssignmentPageData(): Promise<WorkAssignmentPageData> {
  const [assignmentResult, employeeResult, projectResult, divisionResult] = await Promise.all([
    supabase.from('project_work_assignments')
      .select(ASSIGNMENT_SELECT)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('employees')
      .select('id, employee_number, full_name, position_title, department, employment_type')
      .eq('status', 'active')
      .order('full_name'),
    supabase.from('projects')
      .select('id, title, client')
      .eq('status', 'DIKERJAKAN')
      .order('title'),
    supabase.from('rab_divisions')
      .select('id, project_id, name, code, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  if (assignmentResult.error) throw describeError(assignmentResult.error, 'Gagal memuat penempatan tenaga kerja');
  if (employeeResult.error) throw describeError(employeeResult.error, 'Gagal memuat pilihan karyawan aktif');
  if (projectResult.error) throw describeError(projectResult.error, 'Gagal memuat daftar proyek');
  if (divisionResult.error) throw describeError(divisionResult.error, 'Gagal memuat lokasi pekerjaan RAB');

  return {
    assignments: (assignmentResult.data ?? []) as unknown as WorkAssignment[],
    employees: (employeeResult.data ?? []) as ActiveEmployeeOption[],
    projects: (projectResult.data ?? []) as ProjectOption[],
    divisions: (divisionResult.data ?? []) as DivisionOption[],
  };
}

function normalizeInput(input: WorkAssignmentInput): WorkAssignmentInput {
  const title = input.assignment_title.trim();
  if (!input.employee_id) throw new Error('Pilih karyawan terlebih dahulu.');
  if (!input.project_id) throw new Error('Pilih proyek penempatan.');
  if (!title) throw new Error('Jabatan atau peran pada proyek wajib diisi.');
  if (!input.start_date) throw new Error('Tanggal mulai penempatan wajib diisi.');
  if (input.end_date && input.end_date < input.start_date) {
    throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  return {
    ...input,
    assignment_title: title,
    division_id: input.division_id || null,
    end_date: input.end_date || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createWorkAssignment(input: WorkAssignmentInput): Promise<WorkAssignment> {
  const payload = normalizeInput(input);
  const { data, error } = await supabase
    .from('project_work_assignments')
    .insert(payload)
    .select(ASSIGNMENT_SELECT)
    .single();
  if (error) throw describeError(error, 'Gagal membuat penempatan tenaga kerja');
  return data as unknown as WorkAssignment;
}

export async function updateWorkAssignment(id: string, input: WorkAssignmentInput): Promise<WorkAssignment> {
  if (!id) throw new Error('ID penempatan tidak ditemukan.');
  const payload = normalizeInput(input);
  const { data, error } = await supabase
    .from('project_work_assignments')
    .update(payload)
    .eq('id', id)
    .select(ASSIGNMENT_SELECT)
    .single();
  if (error) throw describeError(error, 'Gagal memperbarui penempatan tenaga kerja');
  return data as unknown as WorkAssignment;
}

export async function updateWorkAssignmentStatus(
  id: string,
  status: WorkAssignmentStatus,
): Promise<WorkAssignment> {
  const { data, error } = await supabase
    .from('project_work_assignments')
    .update({ status })
    .eq('id', id)
    .select(ASSIGNMENT_SELECT)
    .single();
  if (error) throw describeError(error, 'Gagal mengubah status penempatan');
  return data as unknown as WorkAssignment;
}
