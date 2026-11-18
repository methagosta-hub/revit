import { supabase } from '@/lib/supabase';
import type {
  AssignmentMovementInput,
  AttendanceInput,
  AttendancePageData,
  AttendanceRecord,
  AttendanceApprovalStatus,
} from '@/types/attendance';

type DbError = { code?: string; message?: string };

function explain(error: DbError, context: string): Error {
  const message = error.message ?? 'Kesalahan database tidak diketahui.';
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    return new Error(`${context}. Jalankan migration 202611150011_personnel_attendance.sql terlebih dahulu.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(`${context}. Akun Anda belum memiliki izin untuk mengakses atau mengubah absensi.`);
  }
  if (error.code === '23505') {
    return new Error('Absensi karyawan pada tanggal tersebut sudah dibuat. Segarkan data, lalu periksa catatan yang ada.');
  }
  if (error.code === '23503') return new Error(`${context}. Karyawan, jadwal, atau proyek yang dipilih tidak ditemukan.`);
  if (error.code === '23514') return new Error(`${context}. ${message}`);
  return new Error(`${context}: ${message}`);
}

export async function fetchAttendancePageData(date: string): Promise<AttendancePageData> {
  const [employees, records, assignments, mainPlacements, projectPlacements, projects, divisions, schedules] = await Promise.all([
    supabase.from('employees')
      .select('id, employee_number, full_name, preferred_name, department, position_title, employment_type, status')
      .order('full_name'),
    supabase.from('attendance_records')
      .select('id, attendance_number, employee_id, attendance_date, employee_schedule_id, attendance_status, approval_status, check_in_at, check_out_at, break_minutes, record_source, record_origin_project_id, notes, rejection_reason, correction_reason, submitted_at, verified_at, verified_by, created_at, updated_at')
      .eq('attendance_date', date),
    supabase.from('employee_daily_assignments')
      .select('id, assignment_number, employee_id, assignment_date, assignment_type, project_id, division_id, location_name, task_title, start_time, end_time, status, notes')
      .eq('assignment_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true, nullsFirst: false }),
    supabase.from('employee_placements')
      .select('employee_id, unit_type, unit_name, base_location')
      .eq('status', 'active'),
    supabase.from('project_work_assignments')
      .select('id, employee_id, project_id, assignment_title, start_date, end_date, status')
      .eq('status', 'active')
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`),
    supabase.from('projects').select('id, title, client').eq('status', 'DIKERJAKAN').order('title'),
    supabase.from('rab_divisions').select('id, project_id, code, name, sort_order').order('sort_order', { ascending: true }),
    supabase.from('employee_work_schedules')
      .select('id, employee_id, schedule_id, effective_from, effective_to, schedule:work_schedules(schedule_name, schedule_code, weekdays, start_time, end_time, break_minutes, grace_minutes)')
      .lte('effective_from', date)
      .or(`effective_to.is.null,effective_to.gte.${date}`),
  ]);

  const firstError = employees.error ?? records.error ?? assignments.error ?? mainPlacements.error
    ?? projectPlacements.error ?? projects.error ?? divisions.error ?? schedules.error;
  if (firstError) throw explain(firstError, 'Gagal memuat dashboard absensi');

  return {
    employees: (employees.data ?? []) as AttendancePageData['employees'],
    records: (records.data ?? []) as AttendanceRecord[],
    dailyAssignments: (assignments.data ?? []) as AttendancePageData['dailyAssignments'],
    mainPlacements: (mainPlacements.data ?? []) as AttendancePageData['mainPlacements'],
    projectPlacements: (projectPlacements.data ?? []) as AttendancePageData['projectPlacements'],
    projects: (projects.data ?? []) as AttendancePageData['projects'],
    divisions: (divisions.data ?? []) as AttendancePageData['divisions'],
    schedules: (schedules.data ?? []) as unknown as AttendancePageData['schedules'],
  };
}

export async function saveAttendance(input: AttendanceInput): Promise<AttendanceRecord> {
  if (!input.employee_id || !input.attendance_date) throw new Error('Pilih karyawan dan tanggal absensi.');
  if (input.check_out_at && !input.check_in_at) {
    throw new Error('Jam masuk harus diisi jika jam pulang dicatat.');
  }
  if (input.check_in_at && input.check_out_at && input.check_out_at < input.check_in_at) {
    throw new Error('Jam pulang tidak boleh lebih awal daripada jam masuk.');
  }
  const existingResult = await supabase.from('attendance_records')
    .select('id, approval_status')
    .eq('employee_id', input.employee_id)
    .eq('attendance_date', input.attendance_date)
    .maybeSingle();
  if (existingResult.error) throw explain(existingResult.error, 'Gagal memeriksa absensi sebelumnya');

  const existing = existingResult.data as { id: string; approval_status: AttendanceRecord['approval_status'] } | null;
  if (existing?.approval_status === 'verified' && !input.correction_reason?.trim()) {
    throw new Error('Absensi sudah diverifikasi. Isi alasan koreksi sebelum mengubahnya.');
  }

  const payload = {
    ...input,
    approval_status: existing?.approval_status === 'verified' ? 'submitted' : input.approval_status,
    correction_reason: input.correction_reason?.trim() || null,
  };

  const query = existing
    ? supabase.from('attendance_records').update(payload).eq('id', existing.id)
    : supabase.from('attendance_records').insert(payload);
  const { data, error } = await query
    .select('id, attendance_number, employee_id, attendance_date, employee_schedule_id, attendance_status, approval_status, check_in_at, check_out_at, break_minutes, record_source, record_origin_project_id, notes, rejection_reason, correction_reason, submitted_at, verified_at, verified_by, created_at, updated_at')
    .single();
  if (error) throw explain(error, 'Gagal menyimpan absensi');
  return data as AttendanceRecord;
}

export async function submitAttendance(id: string): Promise<void> {
  if (!id) throw new Error('ID absensi tidak ditemukan.');
  const { error } = await supabase.from('attendance_records')
    .update({ approval_status: 'submitted', rejection_reason: null })
    .eq('id', id);
  if (error) throw explain(error, 'Gagal mengajukan absensi untuk verifikasi');
}

export async function updateAttendanceApproval(
  id: string,
  status: Extract<AttendanceApprovalStatus, 'verified' | 'rejected'>,
  rejectionReason?: string,
): Promise<void> {
  if (!id) throw new Error('ID absensi tidak ditemukan.');
  if (status === 'rejected' && !rejectionReason?.trim()) throw new Error('Alasan penolakan wajib diisi.');
  const { error } = await supabase.from('attendance_records').update({
    approval_status: status,
    rejection_reason: status === 'rejected' ? rejectionReason?.trim() : null,
  }).eq('id', id);
  if (error) throw explain(error, status === 'verified' ? 'Gagal memverifikasi absensi' : 'Gagal menolak absensi');
}

export async function recordAssignmentMovement(input: AssignmentMovementInput): Promise<void> {
  if (!input.employee_id || !input.assignment_date || !input.task_title.trim()) {
    throw new Error('Karyawan, tanggal, dan nama pekerjaan wajib diisi.');
  }
  if ((input.start_time && !input.end_time) || (!input.start_time && input.end_time)) {
    throw new Error('Jam mulai dan jam selesai harus diisi berpasangan, atau keduanya dikosongkan.');
  }
  if (input.start_time && input.end_time && input.end_time <= input.start_time) {
    throw new Error('Jam selesai harus lebih besar daripada jam mulai.');
  }
  const { error } = await supabase.rpc('dahlia_record_assignment_movement', {
    p_employee_id: input.employee_id,
    p_assignment_date: input.assignment_date,
    p_assignment_type: input.assignment_type,
    p_project_id: input.project_id,
    p_division_id: input.division_id,
    p_location_name: input.location_name,
    p_task_title: input.task_title.trim(),
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw explain(error, 'Gagal mencatat perpindahan penugasan');
}

export async function completeDailyAssignment(
  assignment: AttendancePageData['dailyAssignments'][number],
  actualEndTime: string | null,
): Promise<void> {
  const update: { status: 'completed'; end_time?: string | null } = { status: 'completed' };
  if (assignment.start_time && actualEndTime) update.end_time = actualEndTime;
  const { error } = await supabase.from('employee_daily_assignments')
    .update(update)
    .eq('id', assignment.id)
    .eq('status', 'in_progress');
  if (error) throw explain(error, 'Gagal mengakhiri penugasan berjalan');
}
