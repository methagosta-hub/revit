import { supabase } from '@/lib/supabase';
import type {
  AgreementInput, CompensationInput, ComponentInput, EmployeeComponentInput,
  EmployeeScheduleInput, PayrollFoundationData, SchemeInput, WorkAgreement,
  PayrollScheme, CompensationProfile, PayrollComponent, EmployeePayrollComponent,
  WorkSchedule, EmployeeWorkSchedule, WorkScheduleInput,
} from '@/types/payrollFoundation';

type DbError = { code?: string; message?: string };

function explain(error: DbError, context: string): Error {
  const message = error.message ?? 'Kesalahan database tidak diketahui.';
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return new Error(`${context}. Jalankan migration 202611150010_personnel_contracts_compensation_schedules.sql terlebih dahulu.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(`${context}. Akun Anda tidak memiliki izin untuk mengakses atau mengubah data ini.`);
  }
  if (error.code === '23505') return new Error(`${context}. Kode atau nomor data sudah digunakan.`);
  if (error.code === '23503') return new Error(`${context}. Karyawan, skema, komponen, perjanjian, atau jadwal yang dipilih tidak ditemukan.`);
  if (error.code === '23514') return new Error(`${context}. ${message}`);
  return new Error(`${context}: ${message}`);
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  if (!match || Number(match[1]) < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const AGREEMENT_SELECT = `id, agreement_number, employee_id, agreement_type, agreement_title, signed_date, start_date, end_date, status, document_reference, work_description, notes, employee:employees(employee_number, full_name)`;
const PROFILE_SELECT = `id, employee_id, agreement_id, payroll_scheme_id, base_rate, currency_code, effective_from, effective_to, notes, employee:employees(employee_number, full_name), scheme:payroll_schemes(scheme_name, pay_basis), agreement:employee_work_agreements(agreement_number, agreement_title)`;
const EMPLOYEE_COMPONENT_SELECT = `id, employee_id, component_id, amount, percentage, effective_from, effective_to, notes, employee:employees(employee_number, full_name), component:payroll_components(component_name, component_type, calculation_method)`;
const EMPLOYEE_SCHEDULE_SELECT = `id, employee_id, schedule_id, effective_from, effective_to, notes, employee:employees(employee_number, full_name), schedule:work_schedules(schedule_name, schedule_code)`;

export async function fetchPayrollFoundationData(): Promise<PayrollFoundationData> {
  const [employees, agreements, schemes, profiles, components, employeeComponents, schedules, employeeSchedules] = await Promise.all([
    supabase.from('employees').select('id, employee_number, full_name, position_title, department, status').order('full_name'),
    supabase.from('employee_work_agreements').select(AGREEMENT_SELECT).order('start_date', { ascending: false }),
    supabase.from('payroll_schemes').select('*').order('sort_order').order('scheme_name'),
    supabase.from('employee_compensation_profiles').select(PROFILE_SELECT).order('effective_from', { ascending: false }),
    supabase.from('payroll_components').select('*').order('sort_order').order('component_name'),
    supabase.from('employee_payroll_components').select(EMPLOYEE_COMPONENT_SELECT).order('effective_from', { ascending: false }),
    supabase.from('work_schedules').select('*').order('schedule_name'),
    supabase.from('employee_work_schedules').select(EMPLOYEE_SCHEDULE_SELECT).order('effective_from', { ascending: false }),
  ]);
  const firstError = employees.error ?? agreements.error ?? schemes.error ?? profiles.error ?? components.error ?? employeeComponents.error ?? schedules.error ?? employeeSchedules.error;
  if (firstError) throw explain(firstError, 'Gagal memuat pengaturan kontrak dan pengupahan');
  return {
    employees: (employees.data ?? []) as PayrollFoundationData['employees'],
    agreements: (agreements.data ?? []) as unknown as WorkAgreement[],
    schemes: (schemes.data ?? []) as PayrollScheme[],
    compensationProfiles: (profiles.data ?? []) as unknown as CompensationProfile[],
    components: (components.data ?? []) as PayrollComponent[],
    employeeComponents: (employeeComponents.data ?? []) as unknown as EmployeePayrollComponent[],
    schedules: (schedules.data ?? []) as WorkSchedule[],
    employeeSchedules: (employeeSchedules.data ?? []) as unknown as EmployeeWorkSchedule[],
  };
}

export async function createWorkAgreement(input: AgreementInput): Promise<void> {
  if (!input.employee_id || !input.agreement_title.trim() || !input.start_date) throw new Error('Karyawan, judul perjanjian, dan tanggal mulai wajib diisi.');
  const { error } = await supabase.from('employee_work_agreements').insert({
    ...input,
    agreement_title: input.agreement_title.trim(),
    document_reference: input.document_reference?.trim() || null,
    work_description: input.work_description?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) throw explain(error, 'Gagal menyimpan perjanjian kerja');
}

export async function updateAgreementStatus(id: string, status: WorkAgreement['status']): Promise<void> {
  const { error } = await supabase.from('employee_work_agreements').update({ status }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengubah status perjanjian');
}

export async function closeWorkAgreement(id: string, endDate: string): Promise<void> {
  if (!endDate) throw new Error('Tanggal akhir perjanjian wajib diisi.');
  const { error } = await supabase.from('employee_work_agreements')
    .update({ status: 'ended', end_date: endDate }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengakhiri perjanjian kerja');
}

export async function createPayrollScheme(input: SchemeInput): Promise<void> {
  if (!input.scheme_code.trim() || !input.scheme_name.trim()) throw new Error('Kode dan nama skema wajib diisi.');
  const { error } = await supabase.from('payroll_schemes').insert({ ...input, scheme_code: input.scheme_code.trim().toUpperCase(), scheme_name: input.scheme_name.trim() });
  if (error) throw explain(error, 'Gagal menyimpan skema upah');
}

export async function setPayrollSchemeActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('payroll_schemes').update({ is_active }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengubah status skema upah');
}

export async function createCompensationProfile(input: CompensationInput): Promise<void> {
  if (!input.employee_id || !input.payroll_scheme_id || !input.effective_from) throw new Error('Karyawan, skema upah, dan tanggal berlaku wajib diisi.');
  const { error } = await supabase.from('employee_compensation_profiles').insert(input);
  if (error) throw explain(error, 'Gagal menyimpan tarif karyawan');
}

export async function closeCompensationProfile(id: string, effective_to: string): Promise<void> {
  if (!id) throw new Error('Tarif karyawan tidak ditemukan.');
  if (!isValidDateOnly(effective_to)) {
    throw new Error('Tanggal akhir tarif harus menggunakan tanggal yang valid dengan format YYYY-MM-DD.');
  }

  const current = await supabase.from('employee_compensation_profiles')
    .select('effective_from, effective_to').eq('id', id).maybeSingle();
  if (current.error) throw explain(current.error, 'Gagal memeriksa periode tarif');
  if (!current.data) throw new Error('Tarif karyawan tidak ditemukan atau tidak dapat diakses.');
  if (current.data.effective_to) throw new Error('Periode tarif ini sudah berakhir.');
  if (effective_to < current.data.effective_from) {
    throw new Error(`Tanggal akhir tarif tidak boleh sebelum tanggal mulai berlaku (${current.data.effective_from}).`);
  }

  const { data, error } = await supabase.from('employee_compensation_profiles')
    .update({ effective_to }).eq('id', id).is('effective_to', null).select('id').maybeSingle();
  if (error) throw explain(error, 'Gagal mengakhiri periode tarif');
  if (!data) throw new Error('Periode tarif berubah saat diproses. Muat ulang halaman lalu coba lagi.');
}

export async function createPayrollComponent(input: ComponentInput): Promise<void> {
  if (!input.component_code.trim() || !input.component_name.trim()) throw new Error('Kode dan nama komponen wajib diisi.');
  const { error } = await supabase.from('payroll_components').insert({ ...input, component_code: input.component_code.trim().toUpperCase(), component_name: input.component_name.trim() });
  if (error) throw explain(error, 'Gagal menyimpan komponen upah');
}

export async function setPayrollComponentActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('payroll_components').update({ is_active }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengubah status komponen');
}

export async function assignEmployeePayrollComponent(input: EmployeeComponentInput): Promise<void> {
  if (!input.employee_id || !input.component_id || !input.effective_from) throw new Error('Karyawan, komponen, dan tanggal berlaku wajib diisi.');
  const { error } = await supabase.from('employee_payroll_components').insert(input);
  if (error) throw explain(error, 'Gagal menetapkan komponen kepada karyawan');
}

export async function closeEmployeePayrollComponent(id: string, effective_to: string): Promise<void> {
  if (!effective_to) throw new Error('Tanggal akhir komponen wajib diisi.');
  const { error } = await supabase.from('employee_payroll_components').update({ effective_to }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengakhiri komponen karyawan');
}

export async function createWorkSchedule(input: WorkScheduleInput): Promise<void> {
  if (!input.schedule_code.trim() || !input.schedule_name.trim() || input.weekdays.length === 0) throw new Error('Kode, nama jadwal, dan minimal satu hari kerja wajib diisi.');
  if (input.end_time <= input.start_time) throw new Error('Jam selesai harus lebih besar daripada jam mulai. Jadwal lintas tengah malam belum didukung pada fondasi ini.');
  const { error } = await supabase.from('work_schedules').insert({ ...input, schedule_code: input.schedule_code.trim().toUpperCase(), schedule_name: input.schedule_name.trim() });
  if (error) throw explain(error, 'Gagal menyimpan master jadwal kerja');
}

export async function setWorkScheduleActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('work_schedules').update({ is_active }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengubah status jadwal kerja');
}

export async function assignEmployeeWorkSchedule(input: EmployeeScheduleInput): Promise<void> {
  if (!input.employee_id || !input.schedule_id || !input.effective_from) throw new Error('Karyawan, pola jadwal, dan tanggal berlaku wajib diisi.');
  const { error } = await supabase.from('employee_work_schedules').insert(input);
  if (error) throw explain(error, 'Gagal menetapkan jadwal kepada karyawan');
}

export async function closeEmployeeWorkSchedule(id: string, effective_to: string): Promise<void> {
  if (!effective_to) throw new Error('Tanggal akhir jadwal wajib diisi.');
  const { error } = await supabase.from('employee_work_schedules').update({ effective_to }).eq('id', id);
  if (error) throw explain(error, 'Gagal mengakhiri jadwal karyawan');
}
