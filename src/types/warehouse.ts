export interface WarehouseStockRow {
  project_id: string;
  project_title: string;
  project_client: string | null;
  material_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_on_hand: number;
}

export interface WarehouseStockSummary {
  project_count: number;
  material_count: number;
  stock_lines: number;
}
