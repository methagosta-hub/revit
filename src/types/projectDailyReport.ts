export type DailyReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type DailyWeather = 'clear' | 'cloudy' | 'rain_light' | 'rain_heavy' | 'other';

export interface DailyReportDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
}

export interface DailyAhspComponent {
  name: string;
  unit: string;
  coefficient: number;
  unit_price: number;
  type: string;
}

export interface DailyReportPackageItem {
  id: string;
  package_id: string;
  rab_item_id?: string | null;
  rab_division_id: string | null;
  package_division_id?: string | null;
  rab_code: string | null;
  item_name: string;
  unit: string;
  planned_quantity: number;
  reference_unit_price: number;
  package_name: string;
  package_number: string;
  package_status?: string;
  components_snapshot: DailyAhspComponent[];
}

export interface DailyReportRecord {
  id: string;
  report_number: string;
  project_id: string;
  division_id: string;
  report_date: string;
  weather: DailyWeather;
  field_condition: string | null;
  work_summary: string | null;
  start_time: string | null;
  end_time: string | null;
  obstacles: string | null;
  follow_up: string | null;
  status: DailyReportStatus;
  created_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by?: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface DailyWorkInput {
  package_item_id: string;
  segment_item_id: string;
  quantity_today: string;
  notes: string;
}

export interface DailyLaborInput {
  employee_id: string;
  employee_name: string;
  position: string;
  daily_assignment_id?: string;
  attendance_status: string;
  hours_worked: string;
  hok: string;
  overtime_hours: string;
  notes: string;
}

export interface DailyMaterialInput {
  material_name: string;
  unit: string;
  quantity_used: string;
  estimated_waste_quantity: string;
  notes: string;
}

export interface DailyEquipmentInput {
  equipment_name: string;
  quantity: string;
  hours_used: string;
  condition_status: string;
  cost_estimate: string;
  notes: string;
}
