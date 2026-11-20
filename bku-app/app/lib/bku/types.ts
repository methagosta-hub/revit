export type Account = "CASH" | "BANK";
export type TxType = "IN" | "OUT" | "TRANSFER";
export type AppView = "calendar" | "ledger" | "payroll" | "stores" | "materials" | "profile";

export type Book = {
  id: string;
  name: string;
  school_head: string;
  planner: string;
  supervisor: string;
  p2sp: string;
  address: string;
  phone: string;
  npsn: string;
  start_date: string;
  opening_cash: number;
  opening_bank: number;
};

export type DetailLine = {
  name: string;
  unit_price: string;
  volume: string;
  unit: string;
  material_id: string;
};

export type StoredDetail = {
  material_id?: string | null;
  name: string;
  unit_price: number;
  volume: number;
  unit: string;
  line_total: number;
};

export type Transaction = {
  id: string;
  book_id: string;
  transaction_date: string;
  created_at: string;
  entry_no: number;
  transaction_type: TxType;
  category: string;
  description: string;
  amount: number;
  account: Account | null;
  from_account: Account | null;
  to_account: Account | null;
  receipt_number: string | null;
  evidence_path: string | null;
  details: StoredDetail[] | null;
  store_id: string | null;
  store_name: string;
  split_group_id?: string | null;
  split_group_label?: string | null;
  split_group_total?: number | null;
};

export type Material = {
  id: string;
  book_id: string | null;
  category: string;
  name: string;
  unit: string;
  unit_price: number;
  price_basis: string;
  is_seed: boolean;
  is_active: boolean;
};

export type SchoolStore = {
  id: string;
  book_id: string;
  name: string;
  address: string;
  phone: string;
  notes: string;
  is_active: boolean;
};

export type StoreInput = {
  id?: string;
  name: string;
  address: string;
  phone: string;
  notes: string;
  is_active: boolean;
};

export type Draft = {
  transaction_type: TxType;
  category: string;
  description: string;
  amount: string;
  account: Account;
  from_account: Account;
  to_account: Account;
  receipt_number: string;
  file: File | null;
  store_id: string;
  store_name: string;
  details: DetailLine[];
  split_group_id?: string;
  split_group_label?: string;
  split_group_total?: number;
};

export type WorkerType = "TUKANG" | "PEKERJA";

export type Worker = {
  id: string;
  book_id: string;
  worker_type: WorkerType;
  name: string;
  daily_rate: number;
  joined_on: string;
  is_active: boolean;
  created_at: string;
};

export type WorkerAttendance = {
  id: string;
  book_id: string;
  worker_id: string;
  work_date: string;
  hok: number;
  daily_rate_snapshot: number;
  amount: number;
  worker_name_snapshot: string;
  worker_type_snapshot: WorkerType;
};

export type WorkerAttendanceDraft = {
  worker_id: string;
  daily_rate: number;
  worker_name_snapshot?: string;
  worker_type_snapshot?: WorkerType;
  days: number[];
};

export type WeeklyPayroll = {
  id: string;
  book_id: string;
  week_start: string;
  week_end: string;
  pay_date: string;
  total_hok: number;
  total_amount: number;
  transaction_id: string | null;
  account: Account;
};

export type WorkerInput = {
  id?: string;
  worker_type: WorkerType;
  name: string;
  daily_rate: number;
  joined_on: string;
  is_active: boolean;
};

export type BalanceAtTransaction = {
  cash: number;
  bank: number;
  total: number;
};

export type BalanceSummary = BalanceAtTransaction & {
  incoming: number;
  outgoing: number;
  rows: Record<string, BalanceAtTransaction>;
};

export type DaySummary = {
  incoming: number;
  outgoing: number;
  count: number;
};

export type ExportTheme = {
  id: string;
  label: string;
  primary: string;
  soft: string;
  ink: string;
  accent: string;
  border: string;
};

export type SignatoryRole = "school_head" | "p2sp" | "supervisor" | "planner";

export type NewBookInput = {
  name: string;
  school_head: string;
  planner: string;
  supervisor: string;
  p2sp: string;
  start_date: string;
  opening_cash: number;
  opening_bank: number;
};

export type ProfileInput = {
  name: string;
  school_head: string;
  planner: string;
  supervisor: string;
  p2sp: string;
  address: string;
  phone: string;
  npsn: string;
};

export type SaveEntriesInput = {
  drafts: Draft[];
  targetDate: string;
  editingTransactionId: string | null;
};


export type MaterialGroup = {
  id: string;
  created_by: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type MaterialAlias = {
  id: string;
  created_by: string;
  group_id: string;
  material_name: string;
  normalized_name: string;
  created_at: string;
};

export type MaterialPurchaseRecord = {
  transaction_id: string;
  book_id: string;
  book_name: string;
  transaction_date: string;
  entry_no: number;
  receipt_number: string | null;
  description: string;
  store_name: string;
  detail_index: number;
  name: string;
  normalized_name: string;
  unit: string;
  volume: number;
  unit_price: number;
  amount: number;
};
