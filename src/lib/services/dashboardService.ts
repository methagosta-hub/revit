import { supabase } from '@/lib/supabase';

export interface ExecutiveProject {
  id: string;
  title: string;
  client: string | null;
  location: string | null;
  status: string;
  total_value: number;
  updated_at: string;
  school_npsn: string | null;
  project_category: string;
}

export interface DashboardPurchaseOrder {
  id: string;
  po_number: string;
  project_id: string;
  project_name: string;
  subtotal: number;
  order_date: string;
}

export interface DashboardPayableOrder extends DashboardPurchaseOrder {
  status: string;
  paid_total: number;
  remaining: number;
}

export interface DashboardStockLine {
  project_id: string;
  project_name: string;
  material_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity_on_hand: number;
  minimum_quantity: number | null;
}

export interface DashboardPaymentObligation {
  id: string;
  obligation_number: string;
  source_type: string;
  payee_type: string;
  project_id: string | null;
  project_name: string;
  description: string;
  amount: number;
  paid_amount: number;
  remaining: number;
  due_date: string | null;
  status: string;
}

export interface DashboardSubcontractSummary {
  term_count: number;
  term_value: number;
  reserved_gross: number;
  approved_gross: number;
  obligation_amount: number;
  paid_amount: number;
  remaining_amount: number;
  available_to_claim: number;
  available_progress_rows: number;
}

export interface DashboardActivity {
  id: string;
  event_type: string;
  actor_name: string;
  project_name: string;
  title: string;
  summary: string;
  target_url: string | null;
  created_at: string;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  target_url: string | null;
  created_at: string;
  priority: 'normal' | 'high' | 'critical';
}

export interface DashboardCurvePoint {
  label: string;
  date: string;
  planned_percent: number;
  actual_percent: number | null;
}

export interface DashboardExecutionSummary {
  package_count: number;
  active_segment_count: number;
  approved_progress_count: number;
  weighted_progress_percent: number | null;
  actual_weighted_value: number;
  allocated_weighted_value: number;
  scheduled_value: number;
  curve: DashboardCurvePoint[];
}

export interface ExecutiveDashboardSnapshot {
  projects: ExecutiveProject[];
  pending_approval_count: number;
  pending_approvals: DashboardPurchaseOrder[];
  payable_po_count: number;
  payable_po_remaining: number;
  payable_orders: DashboardPayableOrder[];
  stock_line_count: number;
  low_stock_count: number;
  stock_rules_configured: number | null;
  stock_lines: DashboardStockLine[];
  low_stock_lines: DashboardStockLine[];
  payment_obligations: DashboardPaymentObligation[];
  outstanding_obligation_count: number;
  outstanding_obligation_total: number;
  subcontract: DashboardSubcontractSummary | null;
  activities: DashboardActivity[];
  notifications: DashboardNotification[];
  execution: DashboardExecutionSummary;
  warnings: string[];
}

export interface ExecutiveDashboardAccess {
  userId: string;
  canViewProcurement: boolean;
  canApprovePurchase: boolean;
  canViewWarehouse: boolean;
  canManageWarehouse: boolean;
  canViewFinance: boolean;
  canViewSubcontractFinance: boolean;
  canAccessExecutionProject: (projectId: string) => boolean;
}

const EMPTY_EXECUTION: DashboardExecutionSummary = {
  package_count: 0,
  active_segment_count: 0,
  approved_progress_count: 0,
  weighted_progress_percent: null,
  actual_weighted_value: 0,
  allocated_weighted_value: 0,
  scheduled_value: 0,
  curve: [],
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Kesalahan pembacaan data';
}

async function optionalSection<T>(
  label: string,
  fallback: T,
  warnings: string[],
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.warn(`Dashboard: ${label} tidak dapat dimuat`, error);
    warnings.push(label);
    return fallback;
  }
}

function sqlLike(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(value);
  } catch {
    return false;
  }
}

function monthEndUtc(year: number, month: number): string {
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

function buildCurve(
  packages: Array<{ id: string; planned_start_date: string | null; planned_end_date: string | null }>,
  packageValues: Map<string, number>,
  segmentItems: Array<{ id: string; package_item_id: string; allocated_quantity: number }>,
  unitPrices: Map<string, number>,
  progressEntries: Array<{ segment_item_id: string; report_date: string; quantity_approved: number }>,
): DashboardExecutionSummary {
  const scheduled = packages
    .filter((row) => row.planned_start_date && row.planned_end_date && row.planned_end_date >= row.planned_start_date)
    .map((row) => ({ ...row, value: packageValues.get(row.id) ?? 0 }))
    .filter((row) => row.value > 0);

  const scheduledValue = scheduled.reduce((sum, row) => sum + row.value, 0);
  const progressByItem = new Map<string, Array<{ date: string; quantity: number }>>();
  for (const row of progressEntries) {
    const list = progressByItem.get(row.segment_item_id) ?? [];
    list.push({ date: row.report_date, quantity: numeric(row.quantity_approved) });
    progressByItem.set(row.segment_item_id, list);
  }
  for (const list of progressByItem.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const allocatedWeightedValue = segmentItems.reduce((sum, row) => {
    return sum + numeric(row.allocated_quantity) * (unitPrices.get(row.package_item_id) ?? 0);
  }, 0);

  function actualAt(cutoff: string): number {
    return segmentItems.reduce((sum, item) => {
      const price = unitPrices.get(item.package_item_id) ?? 0;
      const approved = (progressByItem.get(item.id) ?? [])
        .filter((entry) => entry.date <= cutoff)
        .reduce((quantity, entry) => quantity + entry.quantity, 0);
      return sum + Math.min(Math.max(0, approved), numeric(item.allocated_quantity)) * price;
    }, 0);
  }

  const approvedProgressCount = progressEntries.length;
  const actualWeightedValue = actualAt('9999-12-31');
  const weightedProgressPercent = approvedProgressCount > 0 && allocatedWeightedValue > 0
    ? Math.min(100, (actualWeightedValue / allocatedWeightedValue) * 100)
    : null;

  let curve: DashboardCurvePoint[] = [];
  if (scheduled.length > 0 && scheduledValue > 0) {
    const firstDate = scheduled.map((row) => row.planned_start_date as string).sort()[0];
    const lastDate = scheduled.map((row) => row.planned_end_date as string).sort().at(-1) as string;
    const [startYear, startMonth] = firstDate.split('-').map(Number);
    const [endYear, endMonth] = lastDate.split('-').map(Number);
    const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
    const finalMonth = new Date(Date.UTC(endYear, endMonth - 1, 1));
    const boundaries: string[] = [];
    while (cursor <= finalMonth && boundaries.length < 18) {
      boundaries.push(monthEndUtc(cursor.getUTCFullYear(), cursor.getUTCMonth()));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    curve = boundaries.map((cutoff) => {
      const plannedValue = scheduled.reduce((sum, row) => {
        const start = row.planned_start_date as string;
        const end = row.planned_end_date as string;
        let fraction = 0;
        if (cutoff >= end) fraction = 1;
        else if (cutoff > start) {
          const startMs = Date.parse(`${start}T00:00:00Z`);
          const endMs = Date.parse(`${end}T00:00:00Z`);
          const cutoffMs = Date.parse(`${cutoff}T23:59:59Z`);
          fraction = endMs <= startMs ? 1 : Math.max(0, Math.min(1, (cutoffMs - startMs) / (endMs - startMs)));
        }
        return sum + row.value * fraction;
      }, 0);
      const actualValue = actualAt(cutoff);
      const date = new Date(`${cutoff}T00:00:00Z`);
      return {
        label: new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date),
        date: cutoff,
        planned_percent: Math.min(100, (plannedValue / scheduledValue) * 100),
        actual_percent: approvedProgressCount > 0 ? Math.min(100, (actualValue / scheduledValue) * 100) : null,
      };
    });
  }

  return {
    package_count: packages.length,
    active_segment_count: segmentItems.length,
    approved_progress_count: approvedProgressCount,
    weighted_progress_percent: weightedProgressPercent,
    actual_weighted_value: actualWeightedValue,
    allocated_weighted_value: allocatedWeightedValue,
    scheduled_value: scheduledValue,
    curve,
  };
}

async function loadProcurement(
  projectNames: Map<string, string>,
  canApprovePurchase: boolean,
): Promise<{
  pendingCount: number;
  pendingRows: DashboardPurchaseOrder[];
}> {
  if (!canApprovePurchase) return { pendingCount: 0, pendingRows: [] };
  const [countResult, rowsResult] = await Promise.all([
    supabase.from('project_purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('project_purchase_orders')
      .select('id,po_number,project_id,subtotal,order_date')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
      .limit(5),
  ]);
  if (countResult.error) throw new Error(countResult.error.message);
  if (rowsResult.error) throw new Error(rowsResult.error.message);
  return {
    pendingCount: countResult.count ?? 0,
    pendingRows: (rowsResult.data ?? []).map((row) => ({
      id: row.id,
      po_number: row.po_number,
      project_id: row.project_id,
      project_name: projectNames.get(row.project_id) ?? 'Proyek terkait',
      subtotal: numeric(row.subtotal),
      order_date: row.order_date,
    })),
  };
}

async function loadWarehouse(
  projectNames: Map<string, string>,
  canManageWarehouse: boolean,
): Promise<{
  lineCount: number;
  ruleCount: number | null;
  lowRows: DashboardStockLine[];
  stockRows: DashboardStockLine[];
}> {
  const stockResult = await supabase.from('v_project_material_stock')
    .select('project_id,material_id,material_code,material_name,unit,quantity_on_hand', { count: 'exact' })
    .order('quantity_on_hand', { ascending: true })
    .limit(500);
  if (stockResult.error) throw new Error(stockResult.error.message);

  const rulesResult = canManageWarehouse
    ? await supabase.from('warehouse_stock_alert_rules')
      .select('id,material_id,material_name_pattern,unit,minimum_quantity')
      .eq('is_active', true)
    : { data: [], error: null };
  if (rulesResult.error) throw new Error(rulesResult.error.message);

  const rules = rulesResult.data ?? [];
  const stockRows: DashboardStockLine[] = (stockResult.data ?? []).map((row) => {
    const rule = rules.find((candidate) => {
      if (candidate.material_id) return candidate.material_id === row.material_id;
      return sqlLike(row.material_name ?? '', candidate.material_name_pattern ?? '')
        && (!candidate.unit || candidate.unit.toLowerCase() === String(row.unit ?? '').toLowerCase());
    });
    return {
      project_id: row.project_id,
      project_name: projectNames.get(row.project_id) ?? 'Proyek terkait',
      material_id: row.material_id,
      material_code: row.material_code,
      material_name: row.material_name,
      unit: row.unit,
      quantity_on_hand: numeric(row.quantity_on_hand),
      minimum_quantity: rule ? numeric(rule.minimum_quantity) : null,
    };
  });

  const lowRows = stockRows
    .filter((row) => row.minimum_quantity !== null && row.quantity_on_hand < (row.minimum_quantity ?? 0))
    .sort((a, b) => {
      const aRatio = a.minimum_quantity ? a.quantity_on_hand / a.minimum_quantity : 1;
      const bRatio = b.minimum_quantity ? b.quantity_on_hand / b.minimum_quantity : 1;
      return aRatio - bRatio;
    });

  return {
    lineCount: stockResult.count ?? stockRows.length,
    ruleCount: canManageWarehouse ? rules.length : null,
    lowRows: lowRows.slice(0, 5),
    stockRows: stockRows.slice(0, 8),
  };
}

async function loadFinance(
  projects: ExecutiveProject[],
): Promise<{
  payableCount: number;
  payableRemaining: number;
  payableOrders: DashboardPayableOrder[];
  obligations: DashboardPaymentObligation[];
}> {
  const activeProjectIds = projects.filter((row) => row.status === 'DIKERJAKAN').map((row) => row.id);
  const [obligationResult, orderResult] = await Promise.all([
    supabase.from('payment_obligations')
      .select('id,obligation_number,source_type,payee_type,project_id,description,amount,paid_amount,due_date,status')
      .neq('status', 'paid')
      .neq('status', 'void')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100),
    activeProjectIds.length
      ? supabase.from('project_purchase_orders')
        .select('id,project_id,po_number,status,order_date,subtotal')
        .in('project_id', activeProjectIds)
        .in('status', ['approved', 'ordered', 'partially_received', 'received'])
        .order('order_date', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (obligationResult.error) throw new Error(obligationResult.error.message);
  if (orderResult.error) throw new Error(orderResult.error.message);

  const orders = orderResult.data ?? [];
  let payments: Array<{ purchase_order_id: string; amount: number | string }> = [];
  if (orders.length) {
    const paymentResult = await supabase.from('project_supplier_payments')
      .select('purchase_order_id,amount')
      .in('purchase_order_id', orders.map((row) => row.id))
      .eq('status', 'paid');
    if (paymentResult.error) throw new Error(paymentResult.error.message);
    payments = paymentResult.data ?? [];
  }

  const paidByOrder = new Map<string, number>();
  for (const row of payments) {
    paidByOrder.set(row.purchase_order_id, (paidByOrder.get(row.purchase_order_id) ?? 0) + numeric(row.amount));
  }
  const payableOrders = orders.map((row) => {
    const subtotal = numeric(row.subtotal);
    const paid = paidByOrder.get(row.id) ?? 0;
    return {
      id: row.id,
      po_number: row.po_number,
      project_id: row.project_id,
      project_name: projects.find((project) => project.id === row.project_id)?.title ?? 'Proyek terkait',
      subtotal,
      order_date: row.order_date,
      status: row.status,
      paid_total: paid,
      remaining: Math.max(0, subtotal - paid),
    };
  }).filter((row) => row.remaining > 0.000001);

  const obligations = (obligationResult.data ?? []).map((row) => ({
    id: row.id,
    obligation_number: row.obligation_number,
    source_type: row.source_type,
    payee_type: row.payee_type,
    project_id: row.project_id,
    project_name: projects.find((project) => project.id === row.project_id)?.title ?? 'Perusahaan',
    description: row.description,
    amount: numeric(row.amount),
    paid_amount: numeric(row.paid_amount),
    remaining: Math.max(0, numeric(row.amount) - numeric(row.paid_amount)),
    due_date: row.due_date,
    status: row.status,
  })).filter((row) => row.remaining > 0.000001);

  return {
    payableCount: payableOrders.length,
    payableRemaining: payableOrders.reduce((sum, row) => sum + row.remaining, 0),
    payableOrders: payableOrders.slice(0, 5),
    obligations,
  };
}

async function loadSubcontractSummary(): Promise<DashboardSubcontractSummary> {
  const [termsResult, progressResult] = await Promise.all([
    supabase.from('subcontract_term_financial_summary')
      .select('term_id,term_amount_snapshot,reserved_gross,approved_gross,obligation_amount,paid_amount,available_to_claim')
      .limit(500),
    supabase.from('subcontract_unit_progress_available')
      .select('progress_entry_id,available_quantity,available_value')
      .gt('available_quantity', 0)
      .limit(500),
  ]);
  if (termsResult.error) throw new Error(termsResult.error.message);
  if (progressResult.error) throw new Error(progressResult.error.message);
  const terms = termsResult.data ?? [];
  const available = progressResult.data ?? [];
  return {
    term_count: terms.length,
    term_value: terms.reduce((sum, row) => sum + numeric(row.term_amount_snapshot), 0),
    reserved_gross: terms.reduce((sum, row) => sum + numeric(row.reserved_gross), 0),
    approved_gross: terms.reduce((sum, row) => sum + numeric(row.approved_gross), 0),
    obligation_amount: terms.reduce((sum, row) => sum + numeric(row.obligation_amount), 0),
    paid_amount: terms.reduce((sum, row) => sum + numeric(row.paid_amount), 0),
    remaining_amount: terms.reduce((sum, row) => sum + Math.max(0, numeric(row.obligation_amount) - numeric(row.paid_amount)), 0),
    available_to_claim: available.reduce((sum, row) => sum + numeric(row.available_value), 0),
    available_progress_rows: available.length,
  };
}

async function loadExecution(
  projectIds: string[],
): Promise<DashboardExecutionSummary> {
  if (!projectIds.length) return EMPTY_EXECUTION;

  const packagesResult = await supabase.from('project_work_packages')
    .select('id,planned_start_date,planned_end_date')
    .in('project_id', projectIds)
    .eq('status', 'active')
    .order('planned_start_date', { ascending: true })
    .limit(200);
  if (packagesResult.error) throw new Error(packagesResult.error.message);
  const packages = packagesResult.data ?? [];
  if (!packages.length) return EMPTY_EXECUTION;
  const packageIds = packages.map((row) => row.id);

  const [itemsResult, segmentsResult] = await Promise.all([
    supabase.from('project_work_package_items')
      .select('id,package_id,reference_unit_price,reference_total_amount')
      .in('package_id', packageIds)
      .limit(2000),
    supabase.from('execution_segments')
      .select('id,package_id')
      .in('package_id', packageIds)
      .eq('status', 'active')
      .limit(500),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (segmentsResult.error) throw new Error(segmentsResult.error.message);

  const packageValues = new Map<string, number>();
  const unitPrices = new Map<string, number>();
  for (const item of itemsResult.data ?? []) {
    packageValues.set(item.package_id, (packageValues.get(item.package_id) ?? 0) + numeric(item.reference_total_amount));
    unitPrices.set(item.id, numeric(item.reference_unit_price));
  }

  const segmentIds = (segmentsResult.data ?? []).map((row) => row.id);
  let segmentItems: Array<{ id: string; package_item_id: string; allocated_quantity: number | string }> = [];
  let progressEntries: Array<{ segment_item_id: string; report_date: string; quantity_approved: number | string | null }> = [];
  if (segmentIds.length) {
    const segmentItemsResult = await supabase.from('execution_segment_items')
      .select('id,package_item_id,allocated_quantity')
      .in('segment_id', segmentIds)
      .limit(2000);
    if (segmentItemsResult.error) throw new Error(segmentItemsResult.error.message);
    segmentItems = segmentItemsResult.data ?? [];
    const segmentItemIds = segmentItems.map((row) => row.id);
    if (segmentItemIds.length) {
      const progressResult = await supabase.from('execution_progress_entries')
        .select('id,segment_item_id,report_date,quantity_approved,status')
        .in('segment_item_id', segmentItemIds)
        .eq('status', 'approved')
        .order('report_date', { ascending: true })
        .limit(5000);
      if (progressResult.error) throw new Error(progressResult.error.message);
      progressEntries = (progressResult.data ?? []).map((row) => ({
        segment_item_id: row.segment_item_id,
        report_date: row.report_date,
        quantity_approved: row.quantity_approved === null ? null : numeric(row.quantity_approved),
      })).filter((row) => row.quantity_approved !== null) as Array<{ segment_item_id: string; report_date: string; quantity_approved: number }>;
    }
  }

  return buildCurve(
    packages,
    packageValues,
    segmentItems.map((row) => ({
      id: row.id,
      package_item_id: row.package_item_id,
      allocated_quantity: numeric(row.allocated_quantity),
    })),
    unitPrices,
    progressEntries.map((row) => ({
      segment_item_id: row.segment_item_id,
      report_date: row.report_date,
      quantity_approved: numeric(row.quantity_approved),
    })),
  );
}

export async function fetchExecutiveDashboardSnapshot(access: ExecutiveDashboardAccess): Promise<ExecutiveDashboardSnapshot> {
  const warnings: string[] = [];
  const projectResult = await supabase.from('projects')
    .select('id,title,client,location,status,total_value,updated_at,school_npsn,project_category')
    .neq('status', 'DIBATALKAN')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (projectResult.error) throw new Error(`Gagal memuat portofolio proyek: ${messageOf(projectResult.error)}`);

  const projects: ExecutiveProject[] = (projectResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    client: row.client,
    location: row.location,
    status: row.status,
    total_value: numeric(row.total_value),
    updated_at: row.updated_at,
    school_npsn: row.school_npsn,
    project_category: row.project_category,
  }));
  const projectNames = new Map(projects.map((row) => [row.id, row.title]));

  const canViewPayments = access.canViewFinance;
  const canReadSubcontract = access.canViewSubcontractFinance;
  const executionProjectIds = projects.filter((row) => access.canAccessExecutionProject(row.id)).map((row) => row.id);

  const [
    procurement,
    warehouse,
    finance,
    subcontract,
    activities,
    notifications,
    execution,
  ] = await Promise.all([
    optionalSection('antrean persetujuan PO', { pendingCount: 0, pendingRows: [] }, warnings,
      () => access.canViewProcurement ? loadProcurement(projectNames, access.canApprovePurchase) : Promise.resolve({ pendingCount: 0, pendingRows: [] })),
    optionalSection('persediaan gudang', { lineCount: 0, ruleCount: null, lowRows: [], stockRows: [] }, warnings,
      () => access.canViewWarehouse ? loadWarehouse(projectNames, access.canManageWarehouse) : Promise.resolve({ lineCount: 0, ruleCount: null, lowRows: [], stockRows: [] })),
    optionalSection('ringkasan keuangan', { payableCount: 0, payableRemaining: 0, payableOrders: [], obligations: [] }, warnings,
      () => canViewPayments ? loadFinance(projects) : Promise.resolve({ payableCount: 0, payableRemaining: 0, payableOrders: [], obligations: [] })),
    optionalSection('ringkasan termin subkontraktor', null, warnings,
      () => canReadSubcontract ? loadSubcontractSummary() : Promise.resolve(null)),
    optionalSection('aktivitas perusahaan', [], warnings, async () => {
      const { data, error } = await supabase.from('activity_feed')
        .select('id,event_type,actor_name,project_name,title,summary,target_url,created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw new Error(error.message);
      return (data ?? []) as DashboardActivity[];
    }),
    optionalSection('notifikasi personal', [], warnings, async () => {
      if (!access.userId) return [];
      const { data, error } = await supabase.from('notifications')
        .select('id,title,message,target_url,created_at,priority')
        .eq('user_id', access.userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      return (data ?? []) as DashboardNotification[];
    }),
    optionalSection('monitoring progres pekerjaan', EMPTY_EXECUTION, warnings,
      () => loadExecution(executionProjectIds)),
  ]);

  const obligations = finance.obligations;
  return {
    projects,
    pending_approval_count: procurement.pendingCount,
    pending_approvals: procurement.pendingRows,
    payable_po_count: finance.payableCount,
    payable_po_remaining: finance.payableRemaining,
    payable_orders: finance.payableOrders,
    stock_line_count: warehouse.lineCount,
    low_stock_count: warehouse.lowRows.length,
    stock_rules_configured: warehouse.ruleCount,
    stock_lines: warehouse.stockRows,
    low_stock_lines: warehouse.lowRows,
    payment_obligations: obligations.slice(0, 5),
    outstanding_obligation_count: obligations.length,
    outstanding_obligation_total: obligations.reduce((sum, row) => sum + row.remaining, 0),
    subcontract,
    activities,
    notifications,
    execution,
    warnings,
  };
}
