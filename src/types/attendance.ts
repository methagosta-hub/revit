export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half_day'
  | 'field_duty'
  | 'sick'
  | 'permission'
  | 'leave'
  | 'absent'
  | 'holiday'
  | 'off_day';

export type AttendanceApprovalStatus = 'draft' | 'submitted' | 'verified' | 'rejected';
export type AttendanceRecordSource = 'web' | 'flutter' | 'import';

export interface AttendanceEmployee {
  id: string;
  employee_number: string;
  full_name: string;
  preferred_name: string | null;
  department: string | null;
  position_title: string | null;
  employment_type: string;
  status: string;
}

export interface AttendanceRecord {
  id: string;
  attendance_number: string;
  employee_id: string;
  attendance_date: string;
  employee_schedule_id: string | null;
  attendance_status: AttendanceStatus;
  approval_status: AttendanceApprovalStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  break_minutes: number;
  record_source: AttendanceRecordSource;
  record_origin_project_id: string | null;
  notes: string | null;
  rejection_reason: string | null;
  correction_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceProject {
  id: string;
  title: string;
  client: string | null;
}

export interface AttendanceDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
}

export interface AttendanceDailyAssignment {
  id: string;
  assignment_number: string;
  employee_id: string;
  assignment_date: string;
  assignment_type: 'project' | 'office' | 'warehouse' | 'workshop' | 'other';
  project_id: string | null;
  division_id: string | null;
  location_name: string | null;
  task_title: string;
  start_time: string | null;
  end_time: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
}

export interface AttendanceMainPlacement {
  employee_id: string;
  unit_type: string;
  unit_name: string;
  base_location: string | null;
}

export interface AttendanceProjectPlacement {
  id: string;
  employee_id: string;
  project_id: string;
  assignment_title: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

export interface AttendanceSchedule {
  id: string;
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  schedule: {
    schedule_name: string;
    schedule_code: string;
    weekdays: number[];
    start_time: string;
    end_time: string;
    break_minutes: number;
    grace_minutes: number;
  } | null;
}

export interface AttendancePageData {
  employees: AttendanceEmployee[];
  records: AttendanceRecord[];
  dailyAssignments: AttendanceDailyAssignment[];
  mainPlacements: AttendanceMainPlacement[];
  projectPlacements: AttendanceProjectPlacement[];
  projects: AttendanceProject[];
  divisions: AttendanceDivision[];
  schedules: AttendanceSchedule[];
}

export interface AttendanceInput {
  employee_id: string;
  attendance_date: string;
  employee_schedule_id: string | null;
  attendance_status: AttendanceStatus;
  approval_status: 'draft' | 'submitted';
  check_in_at: string | null;
  check_out_at: string | null;
  break_minutes: number;
  record_origin_project_id: string | null;
  record_source: 'web';
  notes: string | null;
  correction_reason: string | null;
}

export interface AssignmentMovementInput {
  employee_id: string;
  assignment_date: string;
  assignment_type: 'project' | 'office' | 'warehouse' | 'workshop' | 'other';
  project_id: string | null;
  division_id: string | null;
  location_name: string | null;
  task_title: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
}
