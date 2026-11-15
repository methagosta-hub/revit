import { supabase } from '@/lib/supabase';
import type {
  CreatePackageInput,
  CreateSegmentInput,
  ExecutionChangeOrder,
  ExecutionContractDocument,
  ExecutionContractRegister,
  ExecutionSubcontractTerm,
  ExecutionSubcontractTermSummary,
  ExecutionDivision,
  ExecutionProgressEntry,
  ExecutionProject,
  ExecutionRabItem,
  ExecutionSegment,
  ExecutionSegmentItem,
  ProjectExecutionWorkspace,
  Subcontractor,
  WorkPackage,
  WorkPackageItem,
} from '@/types/projectExecution';

type DbError = { code?: string; message?: string };

function explain(error: DbError, context: string): Error {
  const message = error.message ?? 'Kesalahan database tidak diketahui.';
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    return new Error(`${context}. Pastikan Migration 012 dan Migration 016 sudah dijalankan.`);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(`${context}. Akun Anda belum memiliki kewenangan untuk proyek atau tindakan ini.`);
  }
  if (error.code === '23505') return new Error(`${context}. Data terkait sudah digunakan atau terjadi duplikasi. Segarkan data lalu periksa kembali.`);
  if (error.code === '23503') return new Error(`${context}. Referensi proyek, item RAB, subkontraktor, atau paket tidak ditemukan.`);
  if (error.code === '23514') return new Error(`${context}. ${message}`);
  return new Error(`${context}: ${message}`);
}

export interface NewSubcontractorInput {
  legal_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  notes?: string | null;
}

export async function createSubcontractor(input: NewSubcontractorInput): Promise<Subcontractor> {
  if (!input.legal_name.trim()) throw new Error('Nama badan usaha/subkontraktor wajib diisi.');
  const { data, error } = await supabase.from('subcontractors').insert({
    legal_name: input.legal_name.trim(),
    contact_person: input.contact_person?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    tax_number: input.tax_number?.trim() || null,
    notes: input.notes?.trim() || null,
  }).select('id, subcontractor_number, legal_name, contact_person, phone, email, status').single();
  if (error) throw explain(error, 'Gagal menyimpan master subkontraktor');
  return data as Subcontractor;
}

export async function fetchProjectExecutionWorkspace(projectId: string): Promise<ProjectExecutionWorkspace> {
  if (!projectId) throw new Error('ID proyek tidak ditemukan.');
  const [projectResult, divisionResult, packagesResult, subcontractorResult] = await Promise.all([
    supabase.from('projects').select('id, title, client, location, status').eq('id', projectId).single(),
    supabase.from('rab_divisions').select('id, project_id, code, name, sort_order').eq('project_id', projectId).order('sort_order', { ascending: true }),
    supabase.from('project_work_packages').select('id, package_number, project_id, division_id, package_name, description, planned_start_date, planned_end_date, status, created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('subcontractors').select('id, subcontractor_number, legal_name, contact_person, phone, email, status').eq('status', 'active').order('legal_name'),
  ]);
  if (projectResult.error) throw explain(projectResult.error, 'Gagal memuat proyek');
  if (divisionResult.error && divisionResult.error.code !== '42501') throw explain(divisionResult.error, 'Gagal memuat lokasi RAB');
  if (packagesResult.error) throw explain(packagesResult.error, 'Gagal memuat paket pekerjaan');
  if (subcontractorResult.error) throw explain(subcontractorResult.error, 'Gagal memuat master subkontraktor');

  const project = projectResult.data as ExecutionProject;
  const divisions = (divisionResult.data ?? []) as ExecutionDivision[];
  const packages = (packagesResult.data ?? []) as WorkPackage[];
  const subcontractors = (subcontractorResult.data ?? []) as Subcontractor[];
  const divisionIds = divisions.map((item) => item.id);
  const packageIds = packages.map((item) => item.id);

  let rabItems: ExecutionRabItem[] = [];
  if (divisionIds.length) {
    const result = await supabase.from('rab_items')
      .select('id, division_id, code, name, unit, volume, unit_price, total_price')
      .in('division_id', divisionIds)
      .order('sort_order', { ascending: true });
    // Read-only execution roles may not have rab.read. They can still monitor
    // existing packages; only project managers with the proper RAB access can
    // create new packages from RAB lines.
    if (result.error && result.error.code !== '42501') throw explain(result.error, 'Gagal memuat item RAB');
    rabItems = (result.data ?? []) as ExecutionRabItem[];
  }

  if (!packageIds.length) {
    return { project, divisions, rabItems, packages, packageItems: [], segments: [], segmentItems: [], progressEntries: [], changeOrders: [], subcontractors, contracts: [], contractDocuments: [], subcontractTerms: [], subcontractTermSummaries: [] };
  }

  const [packageItemsResult, segmentsResult, changeOrdersResult] = await Promise.all([
    supabase.from('project_work_package_items').select('id, package_id, rab_item_id, rab_division_id, rab_code, item_name, unit, planned_quantity, reference_unit_price, reference_total_amount, sort_order').in('package_id', packageIds).order('sort_order', { ascending: true }),
    supabase.from('execution_segments').select('id, package_id, segment_number, change_order_id, segment_title, executor_type, execution_method, subcontractor_id, contract_reference, agreed_amount, unit_rate, retention_percent, effective_from, effective_to, status, description, closure_reason, closed_at, created_at').in('package_id', packageIds).order('effective_from', { ascending: false }),
    supabase.from('execution_change_orders').select('id, change_number, package_id, previous_segment_id, new_segment_id, change_type, effective_date, reason, status, created_at').in('package_id', packageIds).order('effective_date', { ascending: false }),
  ]);
  if (packageItemsResult.error) throw explain(packageItemsResult.error, 'Gagal memuat lingkup paket pekerjaan');
  if (segmentsResult.error) throw explain(segmentsResult.error, 'Gagal memuat riwayat pelaksanaan');
  if (changeOrdersResult.error) throw explain(changeOrdersResult.error, 'Gagal memuat riwayat perubahan');

  const packageItems = (packageItemsResult.data ?? []) as WorkPackageItem[];
  const segments = (segmentsResult.data ?? []) as ExecutionSegment[];
  const changeOrders = (changeOrdersResult.data ?? []) as ExecutionChangeOrder[];
  const segmentIds = segments.map((item) => item.id);
  const [contractsResult, termsResult, termSummaryResult] = segmentIds.length ? await Promise.all([
    supabase.from('execution_contract_register').select('id, contract_number, segment_id, project_id, package_id, subcontractor_id, contract_reference, contract_title, signed_date, contract_start_date, contract_end_date, contract_value_snapshot, contract_notes, contract_status').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('subcontract_payment_terms').select('id, term_number, segment_id, contract_register_id, term_name, calculation_basis, percentage, fixed_amount, base_amount_snapshot, term_amount_snapshot, due_date, trigger_description, status').in('segment_id', segmentIds).order('sort_order', { ascending: true }),
    supabase.from('subcontract_term_financial_summary').select('term_id, term_number, segment_id, contract_register_id, term_name, calculation_basis, percentage, fixed_amount, base_amount_snapshot, term_amount_snapshot, due_date, trigger_description, status, reserved_gross, approved_gross, obligation_amount, paid_amount, available_to_claim').in('segment_id', segmentIds).order('due_date', { ascending: true }),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (contractsResult.error) throw explain(contractsResult.error, 'Gagal memuat register kontrak subkontraktor. Pastikan Migration 016 sudah dijalankan.');
  if (termsResult.error) throw explain(termsResult.error, 'Gagal memuat jadwal termin subkontraktor.');
  // Financial aggregate may be hidden from a project viewer who has no payment-read
  // permission. Keep the contract/term page usable; sensitive balances remain hidden.
  if (termSummaryResult.error && termSummaryResult.error.code !== '42501') {
    throw explain(termSummaryResult.error, 'Gagal memuat ringkasan hak tagih termin.');
  }
  const contracts = (contractsResult.data ?? []) as ExecutionContractRegister[];
  const subcontractTerms = (termsResult.data ?? []) as ExecutionSubcontractTerm[];
  const subcontractTermSummaries = (termSummaryResult.data ?? []) as ExecutionSubcontractTermSummary[];
  const contractIds = contracts.map((row) => row.id);
  let contractDocuments: ExecutionContractDocument[] = [];
  if (contractIds.length) {
    const docsResult = await supabase.from('execution_contract_documents')
      .select('id, document_number, contract_id, document_type, document_title, file_name, storage_path, mime_type, file_size_bytes, document_date, notes, created_at')
      .in('contract_id', contractIds).order('document_date', { ascending: false });
    if (docsResult.error) throw explain(docsResult.error, 'Gagal memuat dokumen kontrak');
    contractDocuments = (docsResult.data ?? []) as ExecutionContractDocument[];
  }
  let segmentItems: ExecutionSegmentItem[] = [];
  let progressEntries: ExecutionProgressEntry[] = [];
  if (segmentIds.length) {
    const result = await supabase.from('execution_segment_items')
      .select('id, segment_id, package_item_id, allocated_quantity')
      .in('segment_id', segmentIds);
    if (result.error) throw explain(result.error, 'Gagal memuat alokasi lingkup segmen');
    segmentItems = (result.data ?? []) as ExecutionSegmentItem[];
    const segmentItemIds = segmentItems.map((item) => item.id);
    if (segmentItemIds.length) {
      const progressResult = await supabase.from('execution_progress_entries')
        .select('id, segment_item_id, report_date, quantity_submitted, quantity_approved, status, notes, rejection_reason, reviewed_at, created_at')
        .in('segment_item_id', segmentItemIds)
        .order('report_date', { ascending: false });
      if (progressResult.error) throw explain(progressResult.error, 'Gagal memuat laporan progres');
      progressEntries = (progressResult.data ?? []) as ExecutionProgressEntry[];
    }
  }

  return { project, divisions, rabItems, packages, packageItems, segments, segmentItems, progressEntries, changeOrders, subcontractors, contracts, contractDocuments, subcontractTerms, subcontractTermSummaries };
}

export async function createProjectWorkPackage(input: CreatePackageInput): Promise<WorkPackage> {
  if (!input.package_name.trim()) throw new Error('Nama paket pekerjaan wajib diisi.');
  if (!input.rab_item_ids.length) throw new Error('Pilih minimal satu item RAB.');
  const { data, error } = await supabase.rpc('dahlia_create_project_work_package', {
    p_project_id: input.project_id,
    p_package_name: input.package_name.trim(),
    p_division_id: input.division_id,
    p_rab_item_ids: input.rab_item_ids,
    p_description: input.description,
    p_planned_start_date: input.planned_start_date,
    p_planned_end_date: input.planned_end_date,
  });
  if (error) throw explain(error, 'Gagal membuat paket pekerjaan');
  return data as WorkPackage;
}

export async function createExecutionSegment(input: CreateSegmentInput): Promise<ExecutionSegment> {
  if (!input.segment_title.trim()) throw new Error('Nama/periode pelaksanaan wajib diisi.');
  if (!input.allocations.length) throw new Error('Pilih minimal satu lingkup item pekerjaan.');
  const { data, error } = await supabase.rpc('dahlia_create_execution_segment', {
    p_package_id: input.package_id,
    p_segment_title: input.segment_title.trim(),
    p_executor_type: input.executor_type,
    p_execution_method: input.execution_method,
    p_subcontractor_id: input.subcontractor_id,
    p_contract_reference: input.contract_reference,
    p_agreed_amount: input.agreed_amount,
    p_unit_rate: input.unit_rate,
    p_retention_percent: input.retention_percent,
    p_included_components: input.included_components,
    p_scope_exclusions: input.scope_exclusions,
    p_effective_from: input.effective_from,
    p_change_order_id: input.change_order_id,
    p_description: input.description,
    p_allocations: input.allocations,
  });
  if (error) throw explain(error, 'Gagal membuka periode pelaksanaan');
  return data as ExecutionSegment;
}

export async function activateExecutionSegment(segmentId: string): Promise<void> {
  const { error } = await supabase.rpc('dahlia_activate_execution_segment', { p_segment_id: segmentId });
  if (error) throw explain(error, 'Gagal mengaktifkan periode pelaksanaan');
}

export async function closeExecutionSegment(
  segmentId: string,
  effectiveTo: string,
  changeType: string,
  reason: string,
): Promise<string> {
  if (!reason.trim()) throw new Error('Alasan perubahan wajib diisi.');
  const { data, error } = await supabase.rpc('dahlia_close_execution_segment', {
    p_segment_id: segmentId,
    p_effective_to: effectiveTo,
    p_change_type: changeType,
    p_reason: reason.trim(),
  });
  if (error) throw explain(error, 'Gagal menutup periode pelaksanaan');
  return String(data);
}

export async function submitExecutionProgress(
  segmentItemId: string,
  reportDate: string,
  quantity: number,
  notes: string,
): Promise<void> {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Volume progres harus lebih besar dari nol.');
  const { error } = await supabase.rpc('dahlia_submit_execution_progress', {
    p_segment_item_id: segmentItemId,
    p_report_date: reportDate,
    p_quantity: quantity,
    p_notes: notes.trim() || null,
  });
  if (error) throw explain(error, 'Gagal mengajukan progres pekerjaan');
}

export async function reviewExecutionProgress(
  progressId: string,
  decision: 'approved' | 'rejected',
  approvedQuantity: number | null,
  rejectionReason: string | null,
): Promise<void> {
  if (decision === 'approved' && (!approvedQuantity || approvedQuantity <= 0)) throw new Error('Isi volume yang disetujui.');
  if (decision === 'rejected' && !rejectionReason?.trim()) throw new Error('Alasan penolakan wajib diisi.');
  const { error } = await supabase.rpc('dahlia_review_execution_progress', {
    p_progress_id: progressId,
    p_decision: decision,
    p_approved_quantity: approvedQuantity,
    p_rejection_reason: rejectionReason,
  });
  if (error) throw explain(error, 'Gagal memproses pemeriksaan progres');
}


export async function createExecutionSubcontractTerm(input: {
  segmentId: string; termName: string; basis: 'percentage' | 'fixed_amount'; percentage: number | null;
  fixedAmount: number | null; dueDate: string | null; triggerDescription: string | null;
}): Promise<ExecutionSubcontractTerm> {
  const { data, error } = await supabase.rpc('dahlia_create_subcontract_payment_term', {
    p_segment_id: input.segmentId,
    p_term_name: input.termName.trim(),
    p_calculation_basis: input.basis,
    p_percentage: input.percentage,
    p_fixed_amount: input.fixedAmount,
    p_due_date: input.dueDate,
    p_trigger_description: input.triggerDescription?.trim() || null,
  });
  if (error) throw explain(error, 'Gagal membuat jadwal termin kontrak');
  return data as ExecutionSubcontractTerm;
}

export async function updateExecutionContractMetadata(input: {
  segmentId: string; contractTitle: string; contractReference: string; signedDate: string | null;
  startDate: string; endDate: string | null; notes: string;
}): Promise<ExecutionContractRegister> {
  const { data, error } = await supabase.rpc('dahlia_update_execution_contract_metadata', {
    p_segment_id: input.segmentId,
    p_contract_title: input.contractTitle.trim(),
    p_contract_reference: input.contractReference.trim() || null,
    p_signed_date: input.signedDate || null,
    p_contract_start_date: input.startDate,
    p_contract_end_date: input.endDate || null,
    p_contract_notes: input.notes.trim() || null,
  });
  if (error) throw explain(error, 'Gagal menyimpan metadata kontrak');
  return data as ExecutionContractRegister;
}

export async function addExecutionContractDocument(input: {
  contractId: string; documentType: ExecutionContractDocument['document_type']; documentTitle: string;
  fileName: string; storagePath: string; mimeType: string; fileSizeBytes: number | null;
  documentDate: string | null; notes: string;
}): Promise<ExecutionContractDocument> {
  const { data, error } = await supabase.rpc('dahlia_add_execution_contract_document', {
    p_contract_id: input.contractId,
    p_document_type: input.documentType,
    p_document_title: input.documentTitle.trim(),
    p_file_name: input.fileName.trim(),
    p_storage_path: input.storagePath.trim(),
    p_mime_type: input.mimeType.trim() || null,
    p_file_size_bytes: input.fileSizeBytes,
    p_document_date: input.documentDate || null,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw explain(error, 'Gagal mendaftarkan dokumen kontrak');
  return data as ExecutionContractDocument;
}
