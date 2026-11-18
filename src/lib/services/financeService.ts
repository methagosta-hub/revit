import { supabase } from '@/lib/supabase';
import type {
  CashTransaction,
  CashTransactionInput,
  FinanceProject,
  PayablePurchaseOrder,
  ProjectFinanceSummary,
  SupplierPayment,
} from '@/types/finance';

type DbError = { message?: string; code?: string };
function fail(error: DbError, context: string): never {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error(`${context}. Struktur Keuangan belum tersedia. Jalankan migration 202611150005_finance_operations.sql terlebih dahulu.`);
  }
  throw new Error(`${context}: ${error.message ?? 'Kesalahan database tidak diketahui.'}`);
}
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchFinanceProjects(): Promise<FinanceProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, client, total_value')
    .eq('status', 'DIKERJAKAN')
    .order('title', { ascending: true });
  if (error) fail(error, 'Gagal memuat proyek');
  return (data ?? []).map((row: any) => ({ ...row, total_value: Number(row.total_value ?? 0) }));
}

export async function fetchCashTransactions(limit = 200): Promise<CashTransaction[]> {
  const { data, error } = await supabase
    .from('company_cash_transactions')
    .select('id, transaction_number, transaction_date, direction, category, project_id, description, amount, payment_method, reference_number, supplier_payment_id, status, created_at, project:projects(title)')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Gagal memuat transaksi kas');
  return (data ?? []).map((row: any) => ({
    ...row,
    amount: Number(row.amount ?? 0),
    project_name: first(row.project)?.title ?? null,
  }));
}

export async function recordCashTransaction(input: CashTransactionInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_company_cash_transaction', {
    p_transaction_date: input.transaction_date,
    p_direction: input.direction,
    p_category: input.category,
    p_project_id: input.project_id || null,
    p_description: input.description,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_reference_number: input.reference_number || null,
  });
  if (error) fail(error, 'Gagal menyimpan transaksi kas');
  if (typeof data !== 'string' || !data) throw new Error('Database tidak mengembalikan ID transaksi kas.');
  return data;
}

export async function voidCashTransaction(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_company_cash_transaction', {
    p_transaction_id: id,
    p_reason: reason,
  });
  if (error) fail(error, 'Gagal membatalkan transaksi kas');
}

export async function fetchSupplierPayments(limit = 200): Promise<SupplierPayment[]> {
  const { data, error } = await supabase
    .from('project_supplier_payments')
    .select(`
      id, payment_number, project_id, purchase_order_id, payment_date, amount,
      payment_method, reference_number, notes, status, created_at,
      project:projects(title),
      supplier:suppliers(name),
      purchase_order:project_purchase_orders(po_number)
    `)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Gagal memuat pembayaran supplier');
  return (data ?? []).map((row: any) => ({
    ...row,
    amount: Number(row.amount ?? 0),
    project_name: first(row.project)?.title ?? 'Proyek tidak ditemukan',
    supplier_name: first(row.supplier)?.name ?? 'Supplier tidak ditemukan',
    po_number: first(row.purchase_order)?.po_number ?? '-',
  }));
}

export async function fetchPayablePurchaseOrders(): Promise<PayablePurchaseOrder[]> {
  const { data, error } = await supabase
    .from('project_purchase_orders')
    .select('id, project_id, po_number, status, order_date, subtotal, project:projects!inner(title,status,project_category), supplier:suppliers(name)')
    .eq('project.status', 'DIKERJAKAN')
    .in('status', ['approved', 'ordered', 'partially_received', 'received'])
    .order('order_date', { ascending: false });
  if (error) fail(error, 'Gagal memuat PO untuk pembayaran');
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((row: any) => row.id);
  const { data: paymentRows, error: paymentError } = await supabase
    .from('project_supplier_payments')
    .select('purchase_order_id, amount')
    .in('purchase_order_id', ids)
    .eq('status', 'paid');
  if (paymentError) fail(paymentError, 'Gagal menghitung pembayaran PO');
  const paid = new Map<string, number>();
  for (const row of paymentRows ?? []) paid.set(row.purchase_order_id, (paid.get(row.purchase_order_id) ?? 0) + Number(row.amount ?? 0));
  return rows.map((row: any) => {
    const project = first(row.project);
    const supplier = first(row.supplier);
    const subtotal = Number(row.subtotal ?? 0);
    const paidTotal = paid.get(row.id) ?? 0;
    return {
      id: row.id,
      project_id: row.project_id,
      project_name: project?.title ?? 'Proyek tidak ditemukan',
      supplier_name: supplier?.name ?? 'Supplier tidak ditemukan',
      po_number: row.po_number,
      status: row.status,
      order_date: row.order_date,
      subtotal,
      paid_total: paidTotal,
      remaining: Math.max(0, subtotal - paidTotal),
    };
  }).filter((row) => row.remaining > 0.000001);
}

export async function recordSupplierPayment(input: {
  purchase_order_id: string;
  payment_date: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'other';
  reference_number?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_project_supplier_payment', {
    p_purchase_order_id: input.purchase_order_id,
    p_payment_date: input.payment_date,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_reference_number: input.reference_number || null,
    p_notes: input.notes || null,
  });
  if (error) fail(error, 'Gagal menyimpan pembayaran supplier');
  if (typeof data !== 'string' || !data) throw new Error('Database tidak mengembalikan ID pembayaran.');
  return data;
}

export async function voidSupplierPayment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_project_supplier_payment', {
    p_payment_id: id,
    p_reason: reason,
  });
  if (error) fail(error, 'Gagal membatalkan pembayaran supplier');
}

export async function fetchProjectFinanceSummary(): Promise<ProjectFinanceSummary[]> {
  const [projects, orders, payments, cash] = await Promise.all([
    fetchFinanceProjects(),
    supabase.from('project_purchase_orders').select('project_id, subtotal, status'),
    supabase.from('project_supplier_payments').select('project_id, amount, status'),
    supabase.from('company_cash_transactions').select('project_id, direction, amount, status'),
  ]);
  if (orders.error) fail(orders.error, 'Gagal memuat komitmen PO');
  if (payments.error) fail(payments.error, 'Gagal memuat realisasi pembayaran');
  if (cash.error) fail(cash.error, 'Gagal memuat mutasi kas');
  return projects.map((project) => {
    const projectOrders = (orders.data ?? []).filter((row: any) => row.project_id === project.id && !['draft', 'pending_approval', 'cancelled'].includes(row.status));
    const projectPayments = (payments.data ?? []).filter((row: any) => row.project_id === project.id && row.status === 'paid');
    const projectCash = (cash.data ?? []).filter((row: any) => row.project_id === project.id && row.status === 'confirmed');
    const committed = projectOrders.reduce((sum: number, row: any) => sum + Number(row.subtotal ?? 0), 0);
    const paid = projectPayments.reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
    const cashIn = projectCash.filter((row: any) => row.direction === 'in').reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
    const cashOut = projectCash.filter((row: any) => row.direction === 'out').reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
    return {
      project_id: project.id,
      project_name: project.title,
      client: project.client,
      project_value: project.total_value,
      committed_po: committed,
      paid_supplier: paid,
      cash_in: cashIn,
      cash_out: cashOut,
      remaining_po: Math.max(0, committed - paid),
    };
  });
}
