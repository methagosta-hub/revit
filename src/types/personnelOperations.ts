export type UnitType = 'office' | 'warehouse' | 'workshop' | 'field' | 'other';
export type MainPlacementStatus = 'active' | 'completed' | 'cancelled';
export type DailyAssignmentType = 'project' | 'office' | 'warehouse' | 'workshop' | 'other';
export type DailyAssignmentStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name: string;
  department: string | null;
  position_title: string | null;
  employment_type: string;
  status: string;
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

export interface MainPlacement {
  id: string;
  placement_number: string;
  employee_id: string;
  unit_type: UnitType;
  unit_name: string;
  base_location: string | null;
  start_date: string;
  end_date: string | null;
  status: MainPlacementStatus;
  notes: string | null;
  created_at: string;
  employee: Pick<EmployeeOption, 'employee_number' | 'full_name' | 'department' | 'position_title' | 'employment_type' | 'status'> | null;
}

export interface MainPlacementInput {
  employee_id: string;
  unit_type: UnitType;
  unit_name: string;
  base_location: string | null;
  start_date: string;
  end_date: string | null;
  status: MainPlacementStatus;
  notes: string | null;
}

export interface DailyAssignment {
  id: string;
  assignment_number: string;
  employee_id: string;
  assignment_date: string;
  assignment_type: DailyAssignmentType;
  project_id: string | null;
  division_id: string | null;
  location_name: string | null;
  task_title: string;
  start_time: string | null;
  end_time: string | null;
  status: DailyAssignmentStatus;
  notes: string | null;
  created_at: string;
  employee: Pick<EmployeeOption, 'employee_number' | 'full_name' | 'department' | 'position_title' | 'employment_type' | 'status'> | null;
  project: Pick<ProjectOption, 'title' | 'client'> | null;
  division: { name: string } | null;
}

export interface DailyAssignmentInput {
  employee_id: string;
  assignment_date: string;
  assignment_type: DailyAssignmentType;
  project_id: string | null;
  division_id: string | null;
  location_name: string | null;
  task_title: string;
  start_time: string | null;
  end_time: string | null;
  status: DailyAssignmentStatus;
  notes: string | null;
}
