export type SpjStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected' | 'paid';

export interface ProjectSpj {
  id: string;
  project_id: string;
  spj_number: string;
  category: 'material' | 'labor' | 'operational' | 'other';
  status: SpjStatus;
  transaction_date: string;
  total_amount: number;
}

export interface ProjectSpjItem {
  id: string;
  spj_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}
