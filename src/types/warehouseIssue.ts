export interface WarehouseIssueDivisionItem {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
}

export interface WarehouseIssueDivision {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  sort_order: number;
  items: WarehouseIssueDivisionItem[];
}

export interface WarehouseIssueProject {
  id: string;
  title: string;
  client: string | null;
}

export interface WarehouseIssueLineInput {
  material_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_issued: number;
  division_id: string;
  rab_item_id?: string | null;
  notes?: string | null;
}

export interface WarehouseIssueInput {
  project_id: string;
  issued_at: string;
  recipient_name?: string | null;
  notes?: string | null;
  items: WarehouseIssueLineInput[];
}

export interface RecentWarehouseIssue {
  id: string;
  issue_number: string;
  project_id: string;
  project_title: string;
  issued_at: string;
  recipient_name: string | null;
  status: 'confirmed' | 'void';
  item_count: number;
  allocations: string[];
}
