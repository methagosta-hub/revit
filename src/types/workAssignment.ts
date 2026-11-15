export type WorkAssignmentStatus = 'active' | 'completed' | 'cancelled';

export interface WorkAssignment {
  id: string;
  assignment_number: string;
  employee_id: string;
  project_id: string;
  division_id: string | null;
  assignment_title: string;
  start_date: string;
  end_date: string | null;
  status: WorkAssignmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee: {
    employee_number: string;
    full_name: string;
    employment_type: string;
    status: string;
  } | null;
  project: {
    title: string;
    client: string | null;
  } | null;
  division: { name: string } | null;
}

export interface WorkAssignmentInput {
  employee_id: string;
  project_id: string;
  division_id: string | null;
  assignment_title: string;
  start_date: string;
  end_date: string | null;
  status: WorkAssignmentStatus;
  notes: string | null;
}

export interface ActiveEmployeeOption {
  id: string;
  employee_number: string;
  full_name: string;
  position_title: string | null;
  department: string | null;
  employment_type: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  client: string | null;
}

export interface DivisionOption {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  sort_order: number | null;
}
