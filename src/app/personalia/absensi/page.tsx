'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Filter,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import PersonnelWorkflowWizard from '@/components/personalia/PersonnelWorkflowWizard';
import { supabase } from '@/lib/supabase';
import {
  completeDailyAssignment,
  fetchAttendancePageData,
  recordAssignmentMovement,
  saveAttendance,
  submitAttendance,
  updateAttendanceApproval,
} from '@/lib/services/attendanceService';
import type {
  AttendanceDailyAssignment,
  AttendanceEmployee,
  AttendanceInput,
  AttendancePageData,
  AttendanceRecord,
  AttendanceStatus,
  AssignmentMovementInput,
} from '@/types/attendance';

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Hadir',
  late: 'Terlambat',
  half_day: 'Setengah hari',
  field_duty: 'Tugas lapangan',
  sick: 'Sakit',
  permission: 'Izin',
  leave: 'Cuti',
  absent: 'Tidak hadir',
  holiday: 'Hari libur',
  off_day: 'Tidak dijadwalkan',
};

const APPROVAL_LABELS: Record<AttendanceRecord['approval_status'], string> = {
  draft: 'Draft',
  submitted: 'Menunggu verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Perlu diperbaiki',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  permanent: 'Tetap', contract: 'Kontrak', daily: 'Harian', freelance: 'Freelance', intern: 'Magang',
};

const ASSIGNMENT_TYPE_LABELS: Record<AttendanceDailyAssignment['assignment_type'], string> = {
  project: 'Proyek', office: 'Kantor', warehouse: 'Gudang', workshop: 'Workshop', other: 'Lainnya',
};

const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50';
const LABEL = 'block text-xs font-semibold text-slate-600';

type RecordDraft = {
  employee_id: string;
  attendance_status: AttendanceStatus;
  check_in_local: string;
  check_out_local: string;
  break_minutes: string;
  notes: string;
  correction_reason: string;
  submit_status: 'draft' | 'submitted';
};

type MovementDraft = {
  employee_id: string;
  assignment_type: AssignmentDailyType;
  project_id: string;
  division_id: string;
  location_name: string;
  task_title: string;
  start_time: string;
  end_time: string;
  notes: string;
};

type AssignmentDailyType = AssignmentMovementInput['assignment_type'];

const EMPTY_RECORD: RecordDraft = {
  employee_id: '', attendance_status: 'present', check_in_local: '', check_out_local: '',
  break_minutes: '0', notes: '', correction_reason: '', submit_status: 'submitted',
};

const EMPTY_MOVEMENT: MovementDraft = {
  employee_id: '', assignment_type: 'project', project_id: '', division_id: '',
  location_name: '', task_title: '', start_time: '', end_time: '', notes: '',
};

function localDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Format tanggal dan jam tidak valid.');
  return date.toISOString();
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

function isPresent(status: AttendanceStatus): boolean {
  return ['present', 'late', 'half_day', 'field_duty'].includes(status);
}

function attendanceStatusClass(status: AttendanceStatus | null): string {
  if (!status) return 'bg-slate-100 text-slate-600';
  if (['present', 'field_duty'].includes(status)) return 'bg-emerald-50 text-emerald-700';
  if (status === 'late' || status === 'half_day') return 'bg-amber-50 text-amber-800';
  if (status === 'sick' || status === 'permission' || status === 'leave') return 'bg-sky-50 text-sky-700';
  if (status === 'absent') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function approvalClass(status: AttendanceRecord['approval_status'] | null): string {
  if (status === 'verified') return 'bg-emerald-50 text-emerald-700';
  if (status === 'submitted') return 'bg-amber-50 text-amber-800';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function assignmentLocation(
  assignment: AttendanceDailyAssignment,
  projects: AttendancePageData['projects'],
): string {
  if (assignment.assignment_type === 'project') {
    return projects.find((project) => project.id === assignment.project_id)?.title ?? 'Proyek tidak diketahui';
  }
  return assignment.location_name || ASSIGNMENT_TYPE_LABELS[assignment.assignment_type];
}

function currentAssignmentLabel(
  employeeId: string,
  data: AttendancePageData,
): { primary: string; secondary: string; count: number; projectIds: string[] } {
  const tasks = data.dailyAssignments
    .filter((assignment) => assignment.employee_id === employeeId && assignment.status !== 'cancelled')
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  if (tasks.length) {
    const active = tasks.find((task) => task.status === 'in_progress') ?? tasks[tasks.length - 1];
    const location = assignmentLocation(active, data.projects);
    return {
      primary: location,
      secondary: `${active.task_title}${active.start_time ? ` · ${active.start_time.slice(0, 5)}${active.end_time ? `–${active.end_time.slice(0, 5)}` : ''}` : ''}`,
      count: tasks.length,
      projectIds: Array.from(new Set([
        ...tasks.flatMap((task) => task.project_id ? [task.project_id] : []),
        ...data.projectPlacements.filter((placement) => placement.employee_id === employeeId).map((placement) => placement.project_id),
      ])),
    };
  }
  const projectPlacements = data.projectPlacements.filter((placement) => placement.employee_id === employeeId);
  if (projectPlacements.length) {
    const project = data.projects.find((item) => item.id === projectPlacements[0].project_id);
    return {
      primary: project?.title ?? 'Penempatan proyek',
      secondary: `${projectPlacements[0].assignment_title}${projectPlacements.length > 1 ? ` +${projectPlacements.length - 1} proyek lain` : ''}`,
      count: 0,
      projectIds: Array.from(new Set(projectPlacements.map((placement) => placement.project_id))),
    };
  }
  const main = data.mainPlacements.find((placement) => placement.employee_id === employeeId);
  if (main) return { primary: main.unit_name, secondary: main.base_location ?? 'Penempatan utama', count: 0, projectIds: [] };
  return { primary: 'Belum ada penempatan', secondary: 'Perlu diperiksa', count: 0, projectIds: [] };
}

function getEmployeeSchedule(employeeId: string, data: AttendancePageData) {
  return data.schedules.find((schedule) => schedule.employee_id === employeeId) ?? null;
}

function isScheduledOnDate(employeeId: string, date: string, data: AttendancePageData): boolean {
  const schedule = getEmployeeSchedule(employeeId, data);
  if (!schedule?.schedule) return false;
  // Migration 010 menyimpan hari kerja dengan ISO weekday: Senin=1 sampai Minggu=7.
  const parsed = new Date(`${date}T00:00:00`);
  const isoWeekday = ((parsed.getDay() + 6) % 7) + 1;
  return schedule.schedule.weekdays.includes(isoWeekday);
}

function hasDailyTask(employeeId: string, data: AttendancePageData): boolean {
  return data.dailyAssignments.some((assignment) =>
    assignment.employee_id === employeeId && assignment.status !== 'cancelled',
  );
}

function shouldRecordAttendance(employeeId: string, date: string, data: AttendancePageData): boolean {
  // Tugas aktual hari itu selalu membutuhkan kehadiran, termasuk bila jatuh pada hari nonjadwal.
  if (hasDailyTask(employeeId, data)) return true;
  return isScheduledOnDate(employeeId, date, data);
}

function AttendanceContent() {
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [data, setData] = useState<AttendancePageData>({
    employees: [], records: [], dailyAssignments: [], mainPlacements: [], projectPlacements: [], projects: [], divisions: [], schedules: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [recordDraft, setRecordDraft] = useState<RecordDraft>({ ...EMPTY_RECORD });
  const [movementDraft, setMovementDraft] = useState<MovementDraft>({ ...EMPTY_MOVEMENT });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);
  const [bulkAttendanceStatus, setBulkAttendanceStatus] = useState<AttendanceStatus>('present');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await fetchAttendancePageData(selectedDate);
      setData(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { void load(); }, [load]);

  // Realtime stream refreshes data without replacing the page or discarding form state. Manual refresh remains available if Realtime is unavailable.
  useEffect(() => {
    const channel = supabase
      .channel(`dahlia-attendance-${selectedDate}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'attendance_records', filter: `attendance_date=eq.${selectedDate}`,
      }, () => { void load(true); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'employee_daily_assignments', filter: `assignment_date=eq.${selectedDate}`,
      }, () => { void load(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_placements' }, () => { void load(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_work_assignments' }, () => { void load(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => { void load(true); })
      .subscribe((status) => setRealtimeConnected(status === 'SUBSCRIBED'));

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [selectedDate, load]);

  const recordsByEmployee = useMemo(() => new Map(data.records.map((record) => [record.employee_id, record])), [data.records]);

  const visibleEmployees = useMemo(() => {
    const dateIsTodayOrFuture = selectedDate >= localDate();
    const employees = data.employees.filter((employee) => {
      if (dateIsTodayOrFuture && employee.status !== 'active') return false;
      if (!dateIsTodayOrFuture && employee.status !== 'active'
          && !recordsByEmployee.has(employee.id)
          && !data.dailyAssignments.some((assignment) => assignment.employee_id === employee.id)) return false;
      const location = currentAssignmentLabel(employee.id, data);
      if (projectFilter !== 'all' && !location.projectIds.includes(projectFilter)) return false;
      const record = recordsByEmployee.get(employee.id);
      if (statusFilter !== 'all' && (record?.attendance_status ?? 'unrecorded') !== statusFilter) return false;
      if (approvalFilter !== 'all' && (record?.approval_status ?? 'unrecorded') !== approvalFilter) return false;
      const keyword = search.trim().toLocaleLowerCase('id');
      const match = !keyword || [employee.employee_number, employee.full_name, employee.position_title ?? '', employee.department ?? '', location.primary, location.secondary]
        .some((value) => value.toLocaleLowerCase('id').includes(keyword));
      return match;
    });
    return employees.sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));
  }, [data, recordsByEmployee, selectedDate, projectFilter, statusFilter, approvalFilter, search]);

  const activeEmployees = data.employees.filter((employee) => employee.status === 'active');
  const expectedEmployees = activeEmployees.filter((employee) =>
    shouldRecordAttendance(employee.id, selectedDate, data),
  );
  const scheduleMissingCount = activeEmployees.filter((employee) =>
    !getEmployeeSchedule(employee.id, data),
  ).length;
  const recordedCount = data.records.length;
  const presentCount = data.records.filter((record) => isPresent(record.attendance_status)).length;
  const verifiedCount = data.records.filter((record) => record.approval_status === 'verified').length;
  const pendingCount = data.records.filter((record) => record.approval_status === 'submitted').length;
  const unrecordedCount = expectedEmployees.filter((employee) => !recordsByEmployee.has(employee.id)).length;
  const projectCount = new Set([
    ...data.dailyAssignments.flatMap((assignment) => assignment.project_id ? [assignment.project_id] : []),
    ...data.projectPlacements.map((placement) => placement.project_id),
  ]).size;

  const openRecord = (employee: AttendanceEmployee, record?: AttendanceRecord) => {
    setEditingRecord(record ?? null);
    setRecordDraft(record ? {
      employee_id: employee.id,
      attendance_status: record.attendance_status,
      check_in_local: localDateTimeInput(record.check_in_at),
      check_out_local: localDateTimeInput(record.check_out_at),
      break_minutes: String(record.break_minutes ?? 0),
      notes: record.notes ?? '',
      correction_reason: '',
      submit_status: record.approval_status === 'draft' ? 'draft' : 'submitted',
    } : {
      ...EMPTY_RECORD,
      employee_id: employee.id,
      check_in_local: '',
      check_out_local: '',
      break_minutes: String(getEmployeeSchedule(employee.id, data)?.schedule?.break_minutes ?? 0),
    });
    setError('');
    setSuccess('');
    setRecordModalOpen(true);
  };

  const openNewRecord = () => {
    setEditingRecord(null);
    setRecordDraft({ ...EMPTY_RECORD });
    setError('');
    setSuccess('');
    setRecordModalOpen(true);
  };

  const openMovement = (employee?: AttendanceEmployee) => {
    setMovementDraft({ ...EMPTY_MOVEMENT, employee_id: employee?.id ?? '' });
    setError('');
    setSuccess('');
    setMovementModalOpen(true);
  };

  const handleSaveAttendance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!recordDraft.employee_id) { setError('Pilih karyawan terlebih dahulu.'); return; }
    if ((recordDraft.check_in_local && !recordDraft.check_in_local.startsWith(`${selectedDate}T`))
      || (recordDraft.check_out_local && !recordDraft.check_out_local.startsWith(`${selectedDate}T`))) {
      setError('Tanggal pada jam masuk dan jam pulang harus sama dengan tanggal absensi yang dipilih.');
      return;
    }
    if (editingRecord?.approval_status === 'verified' && !recordDraft.correction_reason.trim()) {
      setError('Absensi ini sudah diverifikasi. Isi alasan koreksi untuk mengubah data.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const schedule = getEmployeeSchedule(recordDraft.employee_id, data);
      const location = currentAssignmentLabel(recordDraft.employee_id, data);
      const originProject = location.projectIds[0] ?? null;
      const input: AttendanceInput = {
        employee_id: recordDraft.employee_id,
        attendance_date: selectedDate,
        employee_schedule_id: schedule?.id ?? null,
        attendance_status: recordDraft.attendance_status,
        approval_status: recordDraft.submit_status,
        check_in_at: localInputToIso(recordDraft.check_in_local),
        check_out_at: localInputToIso(recordDraft.check_out_local),
        break_minutes: Math.max(0, Number(recordDraft.break_minutes) || 0),
        record_origin_project_id: originProject,
        record_source: 'web',
        notes: recordDraft.notes.trim() || null,
        correction_reason: recordDraft.correction_reason.trim() || null,
      };
      await saveAttendance(input);
      setRecordModalOpen(false);
      setSuccess(recordDraft.submit_status === 'submitted' ? 'Absensi berhasil disimpan dan diajukan untuk verifikasi.' : 'Absensi berhasil disimpan sebagai draft.');
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAttendance = async () => {
    if (saving || !selectedAttendanceIds.length) return;
    const targets = selectedAttendanceIds.filter((id) => visibleEmployees.some((employee) => employee.id === id && employee.status === 'active') && !recordsByEmployee.has(id));
    if (!targets.length) { setError('Semua karyawan terpilih sudah memiliki catatan absensi. Gunakan tombol Edit pada baris terkait untuk koreksi.'); return; }
    if (!window.confirm(`Catat absensi ${targets.length} karyawan dengan status ${STATUS_LABELS[bulkAttendanceStatus]} untuk ${dateLabel(selectedDate)}? Jam masuk dan pulang akan dibiarkan kosong untuk dilengkapi kemudian.`)) return;
    setSaving(true); setError(''); setSuccess('');
    let saved = 0; const failures: string[] = [];
    try {
      for (const employeeId of targets) {
        const employee = data.employees.find((item) => item.id === employeeId);
        try {
          const schedule = getEmployeeSchedule(employeeId, data);
          const location = currentAssignmentLabel(employeeId, data);
          await saveAttendance({
            employee_id: employeeId,
            attendance_date: selectedDate,
            employee_schedule_id: schedule?.id ?? null,
            attendance_status: bulkAttendanceStatus,
            approval_status: 'submitted',
            check_in_at: null,
            check_out_at: null,
            break_minutes: Math.max(0, Number(schedule?.schedule?.break_minutes ?? 0)),
            record_origin_project_id: location.projectIds[0] ?? null,
            record_source: 'web',
            notes: 'Pencatatan massal melalui dashboard absensi.',
            correction_reason: null,
          });
          saved += 1;
        } catch (cause) { failures.push(`${employee?.full_name ?? employeeId}: ${errorText(cause)}`); }
      }
      await load(true);
      setSelectedAttendanceIds([]);
      setSuccess(`${saved} absensi berhasil dicatat dan diajukan untuk verifikasi${failures.length ? `; ${failures.length} perlu diperiksa` : ''}.`);
      if (failures.length) setError(failures.slice(0, 3).join(' | '));
    } finally { setSaving(false); }
  };

  const handleSaveMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const input: AssignmentMovementInput = {
        employee_id: movementDraft.employee_id,
        assignment_date: selectedDate,
        assignment_type: movementDraft.assignment_type,
        project_id: movementDraft.assignment_type === 'project' ? movementDraft.project_id || null : null,
        division_id: movementDraft.assignment_type === 'project' ? movementDraft.division_id || null : null,
        location_name: movementDraft.assignment_type === 'project' ? null : movementDraft.location_name.trim() || null,
        task_title: movementDraft.task_title,
        start_time: movementDraft.start_time || null,
        end_time: movementDraft.end_time || null,
        notes: movementDraft.notes.trim() || null,
      };
      await recordAssignmentMovement(input);
      setMovementModalOpen(false);
      setSuccess('Perpindahan penugasan berhasil dicatat. Penugasan aktif sebelumnya ditutup otomatis.');
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const verifyRecord = async (record: AttendanceRecord) => {
    if (!window.confirm(`Verifikasi absensi ${record.attendance_number}? Setelah diverifikasi, koreksi memerlukan alasan dan verifikasi ulang.`)) return;
    setBusyId(record.id);
    setError('');
    setSuccess('');
    try {
      await updateAttendanceApproval(record.id, 'verified');
      setSuccess(`Absensi ${record.attendance_number} berhasil diverifikasi.`);
      await load(true);
    } catch (err) { setError(errorText(err)); }
    finally { setBusyId(null); }
  };

  const rejectRecord = async (record: AttendanceRecord) => {
    const reason = window.prompt(`Tuliskan alasan perbaikan untuk ${record.attendance_number}:`);
    if (!reason?.trim()) return;
    setBusyId(record.id);
    setError('');
    setSuccess('');
    try {
      await updateAttendanceApproval(record.id, 'rejected', reason);
      setSuccess(`Absensi ${record.attendance_number} dikembalikan untuk diperbaiki.`);
      await load(true);
    } catch (err) { setError(errorText(err)); }
    finally { setBusyId(null); }
  };

  const submitRecord = async (record: AttendanceRecord) => {
    setBusyId(record.id);
    setError('');
    try {
      await submitAttendance(record.id);
      setSuccess(`Absensi ${record.attendance_number} diajukan untuk verifikasi.`);
      await load(true);
    } catch (err) { setError(errorText(err)); }
    finally { setBusyId(null); }
  };

  const finishAssignment = async (assignment: AttendanceDailyAssignment) => {
    if (!window.confirm(`Akhiri penugasan ${assignment.assignment_number} (${assignment.task_title})?`)) return;
    let actualEndTime: string | null = null;
    if (assignment.start_time) {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const suggested = selectedDate === localDate() ? nowTime : (assignment.end_time ?? '');
      const entered = window.prompt('Jam selesai aktual (HH:MM):', suggested);
      if (entered === null) return;
      actualEndTime = entered.trim() || null;
      if (actualEndTime && actualEndTime <= assignment.start_time.slice(0, 5)) {
        setError('Jam selesai harus lebih besar daripada jam mulai.');
        return;
      }
    }
    setBusyId(assignment.id);
    setError('');
    try {
      await completeDailyAssignment(assignment, actualEndTime);
      setSuccess(`Penugasan ${assignment.assignment_number} ditandai selesai.`);
      await load(true);
    } catch (err) { setError(errorText(err)); }
    finally { setBusyId(null); }
  };

  const downloadCsv = () => {
    const rows = visibleEmployees.map((employee) => {
      const record = recordsByEmployee.get(employee.id);
      const location = currentAssignmentLabel(employee.id, data);
      return [
        employee.employee_number, employee.full_name, employee.position_title ?? '', employee.department ?? '',
        location.primary, record ? STATUS_LABELS[record.attendance_status] : 'Belum diisi',
        record ? APPROVAL_LABELS[record.approval_status] : 'Belum diisi',
        timeLabel(record?.check_in_at), timeLabel(record?.check_out_at), record?.notes ?? '',
      ];
    });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [['Nomor Karyawan', 'Nama', 'Jabatan', 'Departemen', 'Penempatan', 'Kehadiran', 'Verifikasi', 'Masuk', 'Pulang', 'Catatan'], ...rows]
      .map((line) => line.map(escape).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `absensi-javawasthu-${selectedDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const currentAssignments = useMemo(() => [...data.dailyAssignments]
    .filter((assignment) => assignment.status !== 'cancelled')
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
  [data.dailyAssignments]);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <UserCheck className="h-4 w-4" /> Personalia · Monitoring Kehadiran
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Absensi Pekerja</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Pantau dan catat kehadiran seluruh pekerja lintas proyek, kantor, gudang, dan workshop. Perpindahan pekerjaan mengikuti penugasan harian tanpa menggandakan absensi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${realtimeConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <span className={`h-2 w-2 rounded-full ${realtimeConnected ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
            {realtimeConnected ? 'Realtime terhubung' : 'Pembaruan manual'}
          </div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
          </button>
          <button type="button" onClick={downloadCsv} disabled={!visibleEmployees.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Activity className="h-4 w-4" /> Ekspor CSV
          </button>
          <button type="button" onClick={openNewRecord} disabled={!activeEmployees.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Input Kehadiran
          </button>
          <button type="button" onClick={() => openMovement()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
            <ArrowLeftRight className="h-4 w-4" /> Catat Perpindahan
          </button>
        </div>
      </header>

      <PersonnelWorkflowWizard currentStep={5} />

      {(error || success) && (
        <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{error || success}</span>
          <button type="button" aria-label="Tutup notifikasi" onClick={() => { setError(''); setSuccess(''); }}><X className="h-4 w-4" /></button>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tanggal pemantauan</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{dateLabel(selectedDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <input aria-label="Tanggal absensi" type="date" max={localDate()} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none" />
          </label>
          <button type="button" onClick={() => setSelectedDate(localDate())} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Hari ini</button>
          <button type="button" onClick={() => setSelectedDate(localDate(new Date(new Date(`${selectedDate}T00:00:00`).getTime() - 86400000)))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Kemarin</button>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" /> Memuat data absensi seluruh proyek...
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Karyawan aktif</p><Users className="h-5 w-5 text-slate-400" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{activeEmployees.length}</p>
              <p className="mt-1 text-xs text-slate-500">Seluruh unit dan proyek</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terjadwal hari ini</p><CalendarDays className="h-5 w-5 text-slate-400" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{expectedEmployees.length}</p>
              <p className="mt-1 text-xs text-slate-500">Sesuai jadwal atau tugas aktual</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Hadir tercatat</p><UserCheck className="h-5 w-5 text-emerald-700" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-emerald-900">{presentCount}</p>
              <p className="mt-1 text-xs text-emerald-800/70">Termasuk terlambat dan setengah hari</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Belum diinput</p><Clock3 className="h-5 w-5 text-amber-700" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-amber-900">{unrecordedCount}</p>
              <p className="mt-1 text-xs text-amber-800/70">Dari pekerja yang dijadwalkan</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Menunggu verifikasi</p><ShieldCheck className="h-5 w-5 text-sky-700" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-sky-900">{pendingCount}</p>
              <p className="mt-1 text-xs text-sky-800/70">Sudah diajukan dan menunggu pemeriksaan</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proyek pada tanggal terpilih</p><MapPin className="h-5 w-5 text-slate-400" /></div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{projectCount}</p>
              <p className="mt-1 text-xs text-slate-500">Penempatan atau tugas proyek tercatat</p>
            </div>
          </section>

          {scheduleMissingCount > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span><strong>{scheduleMissingCount} karyawan aktif belum memiliki jadwal kerja efektif.</strong> Mereka tetap tampil di daftar, tetapi tidak otomatis dihitung sebagai absensi yang terlambat diinput kecuali memiliki penugasan aktual pada tanggal terpilih.</span>
              <span className="shrink-0 font-semibold">Periksa Kontrak &amp; Upah → Jadwal Kerja</span>
            </div>
          )}

          {data.records.length > 0 ? <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><div className="mb-3"><h2 className="font-bold text-slate-900">Cetak bukti kehadiran</h2><p className="text-xs text-slate-600">Pilih data absensi pada {dateLabel(selectedDate)}. Status belum terverifikasi akan dicetak sebagai draft/pending.</p></div><div className="grid gap-3 lg:grid-cols-2">{data.records.map((record) => {
            const employee = data.employees.find((row) => row.id === record.employee_id);
            const project = data.projects.find((row) => row.id === record.record_origin_project_id);
            return <article key={`pdf-${record.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm"><div><p className="font-bold text-emerald-800">{record.attendance_number}</p><p className="text-xs text-slate-600">{employee?.full_name ?? 'Karyawan'} · {dateLabel(record.attendance_date)}</p></div>
              <BusinessDocumentPdfButton identity={{ type: 'attendance_register', code: record.attendance_number, title: 'Bukti Kehadiran Pekerja', sourceStatus: record.approval_status, generatedAt: new Date().toISOString(), projectName: project?.title ?? null, period: dateLabel(record.attendance_date), classification: 'Dokumen personalia terbatas' }} sections={[
                { title: 'Identitas kehadiran', details: [
                  { label: 'Nomor absensi', value: record.attendance_number }, { label: 'Tanggal', value: dateLabel(record.attendance_date) },
                  { label: 'Nama pekerja', value: employee?.full_name ?? '—' }, { label: 'Nomor pekerja', value: employee?.employee_number ?? '—' },
                  { label: 'Status kehadiran', value: STATUS_LABELS[record.attendance_status] }, { label: 'Verifikasi', value: APPROVAL_LABELS[record.approval_status] },
                  { label: 'Jam masuk', value: record.check_in_at ? new Date(record.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—' },
                  { label: 'Jam pulang', value: record.check_out_at ? new Date(record.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—' },
                  { label: 'Proyek asal', value: project?.title ?? '—' }, { label: 'Sumber catatan', value: record.record_source },
                ] },
                { title: 'Catatan', paragraphs: [record.notes?.trim() || 'Tidak ada catatan tambahan pada data absensi sumber.'] },
              ]} />
            </article>;
          })}</div></section> : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Monitoring Kehadiran Seluruh Pekerja</h2>
                <p className="mt-1 text-xs text-slate-500">{visibleEmployees.length} karyawan ditampilkan · {recordedCount} absensi tercatat · {verifiedCount} sudah diverifikasi</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[900px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, nomor, unit..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" />
                </label>
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500">
                    <option value="all">Semua proyek / unit</option>
                    {data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                  </select>
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                  <option value="all">Semua kehadiran</option>
                  <option value="unrecorded">Belum diinput</option>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <select value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                  <option value="all">Semua verifikasi</option>
                  <option value="unrecorded">Belum ada data</option>
                  {Object.entries(APPROVAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-bold text-slate-900">Input massal absensi</p><p className="mt-1 text-xs text-slate-500">Pilih pekerja yang belum diinput, tentukan status umum, lalu catat sekaligus. Jam masuk/pulang dapat dilengkapi nanti per orang.</p></div><div className="flex flex-wrap items-center gap-2"><select value={bulkAttendanceStatus} onChange={(e)=>setBulkAttendanceStatus(e.target.value as AttendanceStatus)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{Object.entries(STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={()=>setSelectedAttendanceIds(visibleEmployees.filter((employee)=>!recordsByEmployee.has(employee.id)).map((employee)=>employee.id))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">Pilih belum diinput</button><button type="button" onClick={()=>setSelectedAttendanceIds([])} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">Bersihkan</button><button type="button" onClick={()=>void handleBulkAttendance()} disabled={saving||selectedAttendanceIds.length===0} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{saving?'Menyimpan...':`Catat ${selectedAttendanceIds.length} pekerja`}</button></div></div>
            {visibleEmployees.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="mx-auto h-10 w-10 text-slate-300" />
                <h3 className="mt-3 font-bold text-slate-800">Tidak ada karyawan yang sesuai</h3>
                <p className="mt-1 text-sm text-slate-500">Coba ubah tanggal, proyek, atau filter pencarian.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1220px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3"><span className="sr-only">Pilih</span></th>
                      <th className="px-4 py-3">Karyawan</th>
                      <th className="px-4 py-3">Penempatan / aktivitas saat ini</th>
                      <th className="px-4 py-3">Kehadiran</th>
                      <th className="px-4 py-3">Jam masuk / pulang</th>
                      <th className="px-4 py-3">Verifikasi</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleEmployees.map((employee) => {
                      const record = recordsByEmployee.get(employee.id);
                      const location = currentAssignmentLabel(employee.id, data);
                      const schedule = getEmployeeSchedule(employee.id, data);
                      const tasks = data.dailyAssignments.filter((assignment) => assignment.employee_id === employee.id && assignment.status !== 'cancelled');
                      return (
                        <tr key={employee.id} className="align-top hover:bg-slate-50/60">
                          <td className="px-3 py-3.5"><input aria-label={`Pilih ${employee.full_name}`} type="checkbox" checked={selectedAttendanceIds.includes(employee.id)} disabled={Boolean(record)||employee.status!=='active'} onChange={(event)=>setSelectedAttendanceIds((current)=>event.target.checked?[...current,employee.id]:current.filter((id)=>id!==employee.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700 disabled:opacity-25"/></td>
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-slate-900">{employee.full_name}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{employee.employee_number}</p>
                            <p className="mt-1 text-xs text-slate-500">{employee.position_title || employee.department || 'Jabatan belum diisi'}</p>
                            <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{EMPLOYMENT_LABELS[employee.employment_type] ?? employee.employment_type}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="flex items-center gap-1.5 font-semibold text-slate-800"><MapPin className="h-3.5 w-3.5 text-emerald-700" />{location.primary}</p>
                            <p className="mt-1 text-xs text-slate-500">{location.secondary}</p>
                            {tasks.length > 1 && <p className="mt-1 text-[11px] font-semibold text-indigo-700">{tasks.length} penugasan hari ini · perpindahan tercatat</p>}
                            {schedule?.schedule ? (
                              <p className="mt-1 text-[11px] text-slate-400">
                                Jadwal: {schedule.schedule.start_time.slice(0, 5)}–{schedule.schedule.end_time.slice(0, 5)} · {isScheduledOnDate(employee.id, selectedDate, data) ? 'Hari kerja' : (tasks.length ? 'Tugas di luar jadwal' : 'Hari nonkerja')}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] font-semibold text-amber-700">Jadwal belum ditetapkan</p>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${attendanceStatusClass(record?.attendance_status ?? null)}`}>
                              {record ? STATUS_LABELS[record.attendance_status] : 'Belum diinput'}
                            </span>
                            {record?.rejection_reason && <p className="mt-1 max-w-[200px] text-[11px] text-rose-700">Alasan: {record.rejection_reason}</p>}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600">
                            <p>Masuk: <span className="font-semibold text-slate-800">{timeLabel(record?.check_in_at)}</span></p>
                            <p className="mt-1">Pulang: <span className="font-semibold text-slate-800">{timeLabel(record?.check_out_at)}</span></p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${approvalClass(record?.approval_status ?? null)}`}>
                              {record ? APPROVAL_LABELS[record.approval_status] : 'Belum ada data'}
                            </span>
                            {record?.attendance_number && <p className="mt-1 font-mono text-[10px] text-slate-400">{record.attendance_number}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => openRecord(employee, record)} title={record ? 'Koreksi absensi' : 'Input absensi'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-white">
                                {record ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{record ? 'Edit' : 'Input'}
                              </button>
                              <button type="button" onClick={() => openMovement(employee)} title="Catat perpindahan kerja" className="rounded-lg border border-indigo-200 p-2 text-indigo-700 hover:bg-indigo-50"><ArrowLeftRight className="h-4 w-4" /></button>
                              {record && ['draft', 'rejected'].includes(record.approval_status) && <button type="button" onClick={() => void submitRecord(record)} disabled={busyId === record.id} title="Ajukan untuk verifikasi" className="rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-50 disabled:opacity-50"><ShieldCheck className="h-4 w-4" /></button>}
                              {record?.approval_status === 'submitted' && <><button type="button" onClick={() => void verifyRecord(record)} disabled={busyId === record.id} title="Verifikasi absensi" className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Check className="h-4 w-4" /></button><button type="button" onClick={() => void rejectRecord(record)} disabled={busyId === record.id} title="Kembalikan untuk perbaikan" className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /></button></>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Absensi dihitung satu kali per karyawan per tanggal. Perpindahan proyek dicatat pada penugasan harian; status belum diinput dihitung berdasarkan jadwal atau tugas aktual.</span>
              <span>{recordedCount} tercatat · {unrecordedCount} belum diinput · {verifiedCount} terverifikasi</span>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-700" /><h2 className="font-bold text-slate-900">Aktivitas Penugasan & Perpindahan pada Tanggal Terpilih</h2></div>
                <p className="mt-1 text-xs text-slate-500">Perubahan dari modul Penugasan Harian dan input halaman ini akan ikut diperbarui.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{currentAssignments.length} catatan aktivitas</span>
            </div>
            {currentAssignments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Belum ada penugasan harian pada tanggal ini.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {currentAssignments.map((assignment) => {
                  const employee = data.employees.find((item) => item.id === assignment.employee_id);
                  const isCurrent = assignment.status === 'in_progress';
                  return (
                    <div key={assignment.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isCurrent ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><MapPin className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{employee?.full_name ?? 'Karyawan tidak ditemukan'} <span className="font-normal text-slate-400">· {employee?.employee_number ?? '—'}</span></p>
                          <p className="mt-0.5 text-sm text-slate-700">{assignment.task_title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{ASSIGNMENT_TYPE_LABELS[assignment.assignment_type]} · {assignmentLocation(assignment, data.projects)}{assignment.start_time ? ` · ${assignment.start_time.slice(0, 5)}${assignment.end_time ? `–${assignment.end_time.slice(0, 5)}` : ''}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCurrent ? 'bg-emerald-50 text-emerald-700' : assignment.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                          {isCurrent ? 'Sedang berjalan' : assignment.status === 'completed' ? 'Selesai' : 'Direncanakan'}
                        </span>
                        {isCurrent && <button type="button" onClick={() => void finishAssignment(assignment)} disabled={busyId === assignment.id} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Akhiri tugas</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-blue-900">
            <strong>Catatan operasional:</strong> halaman ini merupakan pusat monitoring dan input oleh Personalia/HR. Aplikasi Flutter Mandor nantinya dapat mengirim absensi dengan sumber <code>flutter</code> dan proyek asal, sedangkan perpindahan tugas tetap tersimpan di <code>employee_daily_assignments</code>. Data yang belum diverifikasi tidak boleh menjadi dasar final penggajian.
          </section>
        </>
      )}

      {recordModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Absensi · {selectedDate}</p><h2 id="attendance-dialog-title" className="mt-0.5 text-lg font-bold text-slate-900">{editingRecord ? `Koreksi ${editingRecord.attendance_number}` : 'Input Kehadiran Karyawan'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">Satu karyawan hanya memiliki satu catatan absensi pada satu tanggal, meskipun berpindah proyek.</p></div>
              <button type="button" onClick={() => !saving && setRecordModalOpen(false)} aria-label="Tutup" disabled={saving}><X className="h-5 w-5 text-slate-400" /></button>
            </header>
            <form onSubmit={handleSaveAttendance} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`${LABEL} sm:col-span-2`}>Karyawan<select required value={recordDraft.employee_id} onChange={(event) => setRecordDraft((current) => ({ ...current, employee_id: event.target.value }))} className={INPUT}><option value="">Pilih karyawan</option>{data.employees.filter((employee) => employee.status === 'active' || employee.id === recordDraft.employee_id).map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_number} — {employee.full_name}</option>)}</select></label>
                <label className={LABEL}>Status kehadiran<select value={recordDraft.attendance_status} onChange={(event) => setRecordDraft((current) => ({ ...current, attendance_status: event.target.value as AttendanceStatus }))} className={INPUT}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className={LABEL}>Waktu istirahat (menit)<input type="number" min="0" max="600" value={recordDraft.break_minutes} onChange={(event) => setRecordDraft((current) => ({ ...current, break_minutes: event.target.value }))} className={INPUT} /></label>
                <label className={LABEL}>Jam masuk<input type="datetime-local" value={recordDraft.check_in_local} onChange={(event) => setRecordDraft((current) => ({ ...current, check_in_local: event.target.value }))} className={INPUT} /></label>
                <label className={LABEL}>Jam pulang<input type="datetime-local" value={recordDraft.check_out_local} onChange={(event) => setRecordDraft((current) => ({ ...current, check_out_local: event.target.value }))} className={INPUT} /></label>
              </div>
              {editingRecord?.approval_status === 'verified' && <label className={LABEL}>Alasan koreksi wajib diisi<textarea rows={2} value={recordDraft.correction_reason} onChange={(event) => setRecordDraft((current) => ({ ...current, correction_reason: event.target.value }))} placeholder="Contoh: koreksi jam pulang berdasarkan laporan pengawas..." className={INPUT} /></label>}
              <label className={LABEL}>Catatan<textarea rows={2} value={recordDraft.notes} onChange={(event) => setRecordDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Keterangan kehadiran atau bukti tindak lanjut..." className={INPUT} /></label>
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                <p className="font-semibold text-slate-700">Aturan pencatatan</p>
                Jam masuk dan pulang boleh belum diisi saat pencatatan awal. Status izin, sakit, cuti, libur, dan tidak hadir dicatat terpisah; perlakuan pembayarannya ditetapkan pada modul penggajian sesuai kebijakan dan ketentuan yang berlaku.
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={recordDraft.submit_status === 'submitted'} onChange={(event) => setRecordDraft((current) => ({ ...current, submit_status: event.target.checked ? 'submitted' : 'draft' }))} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500" /> Ajukan untuk verifikasi</label>
                <div className="flex gap-2"><button type="button" onClick={() => setRecordModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? 'Menyimpan...' : 'Simpan Absensi'}</button></div>
              </div>
            </form>
          </section>
        </div>
      )}

      {movementModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="movement-dialog-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-700">Penugasan Harian · {selectedDate}</p><h2 id="movement-dialog-title" className="mt-0.5 text-lg font-bold text-slate-900">Catat Perpindahan / Penugasan</h2><p className="mt-1 text-xs leading-5 text-slate-500">Penugasan berjalan sebelumnya akan ditutup otomatis dalam transaksi yang sama.</p></div>
              <button type="button" onClick={() => !saving && setMovementModalOpen(false)} aria-label="Tutup" disabled={saving}><X className="h-5 w-5 text-slate-400" /></button>
            </header>
            <form onSubmit={handleSaveMovement} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`${LABEL} sm:col-span-2`}>Karyawan<select required value={movementDraft.employee_id} onChange={(event) => setMovementDraft((current) => ({ ...current, employee_id: event.target.value }))} className={INPUT}><option value="">Pilih karyawan aktif</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_number} — {employee.full_name}</option>)}</select></label>
                <label className={LABEL}>Tujuan penugasan<select value={movementDraft.assignment_type} onChange={(event) => setMovementDraft((current) => ({ ...current, assignment_type: event.target.value as AssignmentDailyType, project_id: '', division_id: '', location_name: '' }))} className={INPUT}><option value="project">Proyek</option><option value="office">Kantor</option><option value="warehouse">Gudang</option><option value="workshop">Workshop</option><option value="other">Lainnya</option></select></label>
                {movementDraft.assignment_type === 'project' ? <label className={LABEL}>Proyek<select required value={movementDraft.project_id} onChange={(event) => setMovementDraft((current) => ({ ...current, project_id: event.target.value, division_id: '' }))} className={INPUT}><option value="">Pilih proyek</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label> : <label className={LABEL}>Nama lokasi / unit<input required maxLength={180} value={movementDraft.location_name} onChange={(event) => setMovementDraft((current) => ({ ...current, location_name: event.target.value }))} placeholder="Contoh: Kantor Pusat / Workshop Kusen" className={INPUT} /></label>}
                <label className={LABEL}>Nama pekerjaan<input required maxLength={160} value={movementDraft.task_title} onChange={(event) => setMovementDraft((current) => ({ ...current, task_title: event.target.value }))} placeholder="Contoh: Pemasangan kusen" className={INPUT} /></label>
                <label className={LABEL}>Jam mulai (opsional)<input type="time" value={movementDraft.start_time} onChange={(event) => setMovementDraft((current) => ({ ...current, start_time: event.target.value }))} className={INPUT} /></label>
                <label className={LABEL}>Jam selesai / estimasi (opsional)<input type="time" value={movementDraft.end_time} onChange={(event) => setMovementDraft((current) => ({ ...current, end_time: event.target.value }))} className={INPUT} /></label>
              </div>
              <label className={LABEL}>Lokasi RAB / bagian proyek<select disabled={movementDraft.assignment_type !== 'project' || !movementDraft.project_id} value={movementDraft.division_id} onChange={(event) => setMovementDraft((current) => ({ ...current, division_id: event.target.value }))} className={INPUT}><option value="">Umum / seluruh proyek</option>{data.divisions.filter((division) => division.project_id === movementDraft.project_id).map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} — ` : ''}{division.name}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-slate-400">Pilih lokasi RAB bila pekerjaan hanya berada di satu bagian proyek; kosongkan untuk penugasan umum.</span></label>
              <label className={LABEL}>Catatan<textarea rows={2} value={movementDraft.notes} onChange={(event) => setMovementDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Instruksi pekerjaan atau alasan perpindahan..." className={INPUT} /></label>
              <div className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">Jika jam diisi, jam mulai dan selesai harus lengkap. Penugasan sebelumnya yang sedang berjalan akan ditandai selesai; bila jam baru lebih awal daripada estimasi akhir sebelumnya, jam akhirnya disesuaikan ke waktu perpindahan.</div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setMovementModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}{saving ? 'Menyimpan...' : 'Simpan Perpindahan'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default function AttendancePage() {
  return <RequireAuth permission="attendance.manage"><AttendanceContent /></RequireAuth>;
}
