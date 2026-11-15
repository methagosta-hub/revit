export type AgreementType = 'pkwtt' | 'pkwt' | 'daily' | 'internship' | 'freelance' | 'other';
export type AgreementStatus = 'draft' | 'active' | 'ended' | 'cancelled';
export type PayBasis = 'monthly' | 'daily' | 'hourly' | 'piecework';
export type ComponentType = 'earning' | 'deduction';
export type ComponentMethod = 'fixed' | 'percentage_of_base' | 'per_day' | 'per_hour' | 'manual';
export type TaxTreatment = 'taxable' | 'non_taxable' | 'review_required';

export interface FoundationEmployee {
  id: string;
  employee_number: string;
  full_name: string;
  position_title: string | null;
  department: string | null;
  status: string;
}

export interface WorkAgreement {
  id: string;
  agreement_number: string;
  employee_id: string;
  agreement_type: AgreementType;
  agreement_title: string;
  signed_date: string | null;
  start_date: string;
  end_date: string | null;
  status: AgreementStatus;
  document_reference: string | null;
  work_description: string | null;
  notes: string | null;
  employee: Pick<FoundationEmployee, 'employee_number' | 'full_name'> | null;
}

export interface PayrollScheme {
  id: string;
  scheme_code: string;
  scheme_name: string;
  pay_basis: PayBasis;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface CompensationProfile {
  id: string;
  employee_id: string;
  agreement_id: string | null;
  payroll_scheme_id: string;
  base_rate: number | null;
  currency_code: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  employee: Pick<FoundationEmployee, 'employee_number' | 'full_name'> | null;
  scheme: Pick<PayrollScheme, 'scheme_name' | 'pay_basis'> | null;
  agreement: Pick<WorkAgreement, 'agreement_number' | 'agreement_title'> | null;
}

export interface PayrollComponent {
  id: string;
  component_code: string;
  component_name: string;
  component_type: ComponentType;
  calculation_method: ComponentMethod;
  is_recurring: boolean;
  tax_treatment: TaxTreatment;
  is_active: boolean;
  sort_order: number;
  description: string | null;
}

export interface EmployeePayrollComponent {
  id: string;
  employee_id: string;
  component_id: string;
  amount: number | null;
  percentage: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  employee: Pick<FoundationEmployee, 'employee_number' | 'full_name'> | null;
  component: Pick<PayrollComponent, 'component_name' | 'component_type' | 'calculation_method'> | null;
}

export interface WorkSchedule {
  id: string;
  schedule_code: string;
  schedule_name: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  is_flexible: boolean;
  is_active: boolean;
  description: string | null;
}

export interface EmployeeWorkSchedule {
  id: string;
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  employee: Pick<FoundationEmployee, 'employee_number' | 'full_name'> | null;
  schedule: Pick<WorkSchedule, 'schedule_name' | 'schedule_code'> | null;
}

export interface PayrollFoundationData {
  employees: FoundationEmployee[];
  agreements: WorkAgreement[];
  schemes: PayrollScheme[];
  compensationProfiles: CompensationProfile[];
  components: PayrollComponent[];
  employeeComponents: EmployeePayrollComponent[];
  schedules: WorkSchedule[];
  employeeSchedules: EmployeeWorkSchedule[];
}

export interface AgreementInput {
  employee_id: string;
  agreement_type: AgreementType;
  agreement_title: string;
  signed_date: string | null;
  start_date: string;
  end_date: string | null;
  status: AgreementStatus;
  document_reference: string | null;
  work_description: string | null;
  notes: string | null;
}
export interface SchemeInput {
  scheme_code: string;
  scheme_name: string;
  pay_basis: PayBasis;
  description: string | null;
  sort_order: number;
}
export interface CompensationInput {
  employee_id: string;
  agreement_id: string | null;
  payroll_scheme_id: string;
  base_rate: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}
export interface ComponentInput {
  component_code: string;
  component_name: string;
  component_type: ComponentType;
  calculation_method: ComponentMethod;
  is_recurring: boolean;
  tax_treatment: TaxTreatment;
  description: string | null;
  sort_order: number;
}
export interface EmployeeComponentInput {
  employee_id: string;
  component_id: string;
  amount: number | null;
  percentage: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}
export interface WorkScheduleInput {
  schedule_code: string;
  schedule_name: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  is_flexible: boolean;
  description: string | null;
}
export interface EmployeeScheduleInput {
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}
