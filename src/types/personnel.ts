export type PersonnelType = 'employee' | 'foreman' | 'skilled_worker' | 'daily_worker' | 'field_staff';
export type AttendanceStatus = 'present' | 'late' | 'permission' | 'sick' | 'leave' | 'absent' | 'overtime';

export interface PersonnelRecord {
  id: string;
  employee_code?: string | null;
  full_name: string;
  personnel_type: PersonnelType;
  phone?: string | null;
  is_active: boolean;
}

export interface AttendanceRecord {
  id: string;
  project_id: string;
  personnel_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  overtime_hours?: number;
}
