export type EmployeeStatus = 'active' | 'inactive' | 'resigned' | 'terminated';
export type EmploymentType = 'permanent' | 'contract' | 'daily' | 'freelance' | 'intern';

export interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  department: string | null;
  position_title: string | null;
  employment_type: EmploymentType;
  hire_date: string | null;
  contract_end_date: string | null;
  status: EmployeeStatus;
  work_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeInput {
  full_name: string;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  department: string | null;
  position_title: string | null;
  employment_type: EmploymentType;
  hire_date: string | null;
  contract_end_date: string | null;
  status: EmployeeStatus;
  work_notes: string | null;
}
