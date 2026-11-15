import { supabase } from '@/lib/supabase';
import type { Employee, EmployeeInput } from '@/types/employee';

const EMPLOYEE_COLUMNS = [
  'id',
  'employee_number',
  'full_name',
  'preferred_name',
  'phone',
  'email',
  'address',
  'department',
  'position_title',
  'employment_type',
  'hire_date',
  'contract_end_date',
  'status',
  'work_notes',
  'created_at',
  'updated_at',
].join(', ');

type DbError = { code?: string; message?: string };

function describeError(error: DbError, context: string): Error {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return new Error(`${context}. Jalankan migration 202611150007_personnel_employees.sql di Supabase.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')) {
    return new Error(`${context}. Akun Anda belum memiliki hak akses Personalia yang sesuai.`);
  }
  if (error.code === '23505') {
    return new Error('Data dengan nomor atau identitas tersebut sudah tercatat. Periksa kembali data karyawan.');
  }
  return new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_COLUMNS)
    .order('full_name', { ascending: true });
  if (error) throw describeError(error, 'Gagal memuat data karyawan');
  return (data ?? []) as unknown as Employee[];
}

function normalizeInput(input: EmployeeInput): EmployeeInput {
  const fullName = input.full_name.trim();
  if (!fullName) throw new Error('Nama lengkap wajib diisi.');
  if (input.hire_date && input.contract_end_date && input.contract_end_date < input.hire_date) {
    throw new Error('Tanggal akhir kontrak tidak boleh sebelum tanggal mulai bekerja.');
  }
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Format email belum benar.');
  }
  return {
    ...input,
    full_name: fullName,
    preferred_name: input.preferred_name?.trim() || null,
    phone: input.phone?.trim() || null,
    email,
    address: input.address?.trim() || null,
    department: input.department?.trim() || null,
    position_title: input.position_title?.trim() || null,
    work_notes: input.work_notes?.trim() || null,
  };
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const payload = normalizeInput(input);
  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select(EMPLOYEE_COLUMNS)
    .single();
  if (error) throw describeError(error, 'Gagal menambahkan karyawan');
  return data as unknown as Employee;
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<Employee> {
  if (!id) throw new Error('ID karyawan tidak ditemukan.');
  const payload = normalizeInput(input);
  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select(EMPLOYEE_COLUMNS)
    .single();
  if (error) throw describeError(error, 'Gagal memperbarui data karyawan');
  return data as unknown as Employee;
}

export async function updateEmployeeStatus(
  id: string,
  status: Employee['status'],
): Promise<Employee> {
  const { data, error } = await supabase
    .from('employees')
    .update({ status })
    .eq('id', id)
    .select(EMPLOYEE_COLUMNS)
    .single();
  if (error) throw describeError(error, 'Gagal mengubah status karyawan');
  return data as unknown as Employee;
}
