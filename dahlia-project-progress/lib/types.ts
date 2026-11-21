export type Project = {
  id: string;
  owner_id: string;
  name: string;
  client_name: string;
  location: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  current_boq_version: number;
  created_at: string;
  updated_at: string;
  school_head: string;
  planner: string;
  supervisor: string;
  p2sp: string;
  address: string;
  phone: string;
  npsn: string;
};

export type WorkMenu = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  sort_order: number;
  current_boq_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BoqItem = {
  id: string;
  project_id: string;
  menu_id: string;
  boq_version: number;
  item_code: string;
  work_group: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Report = {
  id: string;
  project_id: string;
  menu_id: string;
  boq_version: number;
  report_date: string;
  notes: string;
  status: "draft" | "approved";
  created_at: string;
  updated_at: string;
};

export type ReportItem = {
  id: string;
  report_id: string;
  boq_item_id: string;
  cumulative_percent: number;
  boq_amount_snapshot: number;
  weight_snapshot: number;
  weighted_progress_snapshot: number;
};

export type CurvePoint = {
  date: string;
  planned: number;
  actual: number | null;
};
