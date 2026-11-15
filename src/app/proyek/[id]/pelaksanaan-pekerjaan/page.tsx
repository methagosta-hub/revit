'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle, ArrowLeft, ArrowRightLeft, BadgeCheck, Building2,
  CalendarDays, CheckCircle2, ClipboardCheck, FilePlus2, Filter, HardHat,
  History, Layers3, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, X,
} from 'lucide-react';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import { submitSubcontractRequest } from '@/lib/services/payrollService';
import { supabase } from '@/lib/supabase';
import {
  activateExecutionSegment,
  addExecutionContractDocument,
  closeExecutionSegment,
  createExecutionSegment,
  createExecutionSubcontractTerm,
  createProjectWorkPackage,
  fetchProjectExecutionWorkspace,
  reviewExecutionProgress,
  submitExecutionProgress,
  updateExecutionContractMetadata,
  createSubcontractor,
} from '@/lib/services/projectExecutionService';
import type {
  ChangeType,
  CreateSegmentInput,
  ExecutionMethod,
  ExecutionContractDocument,
  ExecutionContractRegister,
  ExecutionProgressEntry,
  ExecutionSegment,
  ExecutionSegmentItem,
  ExecutionProject,
  ExecutorType,
  ProjectExecutionWorkspace,
  WorkPackage,
  WorkPackageItem,
} from '@/types/projectExecution';

const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';

const METHOD_LABELS: Record<ExecutionMethod, string> = {
  daily: 'Internal · Harian',
  hourly: 'Internal · Per jam',
  monthly: 'Internal · Bulanan',
  internal_piecework: 'Internal · Borongan satuan',
  subcontract_unit: 'Subkontraktor · Harga satuan',
  subcontract_lump_sum: 'Subkontraktor · Lump sum',
  subcontract_all_in: 'Subkontraktor · All-in',
};
const PACKAGE_STATUS: Record<string, string> = {
  planned: 'Direncanakan', active: 'Berjalan', on_hold: 'Ditahan', completed: 'Selesai', cancelled: 'Dibatalkan',
};
const SEGMENT_STATUS: Record<string, string> = {
  planned: 'Akan dimulai', active: 'Aktif', closed: 'Ditutup', cancelled: 'Dihentikan',
};
const PROGRESS_STATUS: Record<string, string> = {
  submitted: 'Menunggu pemeriksaan', approved: 'Disetujui', rejected: 'Ditolak',
};
type SubcontractClaimableProgress = {
  progress_entry_id: string; report_date: string; quantity_approved: number; segment_item_id: string;
  segment_id: string; segment_number: string; unit_rate: number; project_id: string; project_title: string;
  package_id: string; package_name: string; item_name: string; unit: string; claimed_quantity: number;
  available_quantity: number; available_value: number;
};

const INCLUDED_COMPONENTS: Array<{ code: string; label: string }> = [
  { code: 'labor', label: 'Tenaga kerja' },
  { code: 'materials', label: 'Material' },
  { code: 'equipment', label: 'Peralatan / alat kerja' },
  { code: 'transportation', label: 'Transportasi / mobilisasi' },
  { code: 'safety', label: 'Keselamatan kerja (K3)' },
  { code: 'testing_commissioning', label: 'Pengujian / commissioning' },
  { code: 'waste_disposal', label: 'Pembuangan limbah' },
  { code: 'cleaning', label: 'Pembersihan akhir' },
  { code: 'warranty', label: 'Pemeliharaan / garansi' },
  { code: 'other', label: 'Lainnya sesuai kontrak' },
];

function todayLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function rupiah(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
function numberLabel(value: number | null | undefined, digits = 3): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(Number(value ?? 0));
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

function packageRemaining(
  item: WorkPackageItem,
  data: ProjectExecutionWorkspace,
): number {
  const itemSegmentRows = data.segmentItems.filter((row) => row.package_item_id === item.id);
  const approvedTotal = data.progressEntries
    .filter((row) => row.status === 'approved' && itemSegmentRows.some((si) => si.id === row.segment_item_id))
    .reduce((sum, row) => sum + Number(row.quantity_approved ?? 0), 0);
  const activeReserved = itemSegmentRows.reduce((sum, row) => {
    const segment = data.segments.find((candidate) => candidate.id === row.segment_id);
    if (!segment || !['active', 'planned'].includes(segment.status)) return sum;
    const approvedOnSegmentItem = data.progressEntries
      .filter((progress) => progress.segment_item_id === row.id && progress.status === 'approved')
      .reduce((total, progress) => total + Number(progress.quantity_approved ?? 0), 0);
    return sum + Math.max(Number(row.allocated_quantity) - approvedOnSegmentItem, 0);
  }, 0);
  return Math.max(Number(item.planned_quantity) - approvedTotal - activeReserved, 0);
}

function projectExecutionLabel(project: ExecutionProject | null): string {
  return project ? `${project.title}${project.client ? ` · ${project.client}` : ''}` : 'Memuat proyek...';
}

function ProjectExecutionContent() {
  const params = useParams<{ id: string }>();
  const projectId = String(params?.id ?? '');
  const [data, setData] = useState<ProjectExecutionWorkspace | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canReport, setCanReport] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [canManageSubcontractors, setCanManageSubcontractors] = useState(false);
  const [canViewContractDetails, setCanViewContractDetails] = useState(false);
  const [canViewPaymentBalances, setCanViewPaymentBalances] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [packageModal, setPackageModal] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [packageDivisionId, setPackageDivisionId] = useState('all');
  const [packageStart, setPackageStart] = useState(todayLocal());
  const [packageEnd, setPackageEnd] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [selectedRabIds, setSelectedRabIds] = useState<string[]>([]);

  const [segmentModal, setSegmentModal] = useState(false);
  const [segmentTitle, setSegmentTitle] = useState('Pelaksanaan awal');
  const [executorType, setExecutorType] = useState<ExecutorType>('internal');
  const [executionMethod, setExecutionMethod] = useState<ExecutionMethod>('daily');
  const [subcontractorId, setSubcontractorId] = useState('');
  const [contractReference, setContractReference] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [unitRate, setUnitRate] = useState('');
  const [retentionPercent, setRetentionPercent] = useState('0');
  const [segmentStart, setSegmentStart] = useState(todayLocal());
  const [segmentDescription, setSegmentDescription] = useState('');
  const [includedComponents, setIncludedComponents] = useState<string[]>([]);
  const [scopeExclusions, setScopeExclusions] = useState('');
  const [changeOrderId, setChangeOrderId] = useState('');

  const [subcontractorModal, setSubcontractorModal] = useState(false);
  const [subcontractorName, setSubcontractorName] = useState('');
  const [subcontractorContact, setSubcontractorContact] = useState('');
  const [subcontractorPhone, setSubcontractorPhone] = useState('');
  const [subcontractorEmail, setSubcontractorEmail] = useState('');
  const [subcontractorTaxNumber, setSubcontractorTaxNumber] = useState('');
  const [subcontractorAddress, setSubcontractorAddress] = useState('');
  const [allocationRows, setAllocationRows] = useState<Record<string, { selected: boolean; quantity: string }>>({});

  const [closeModal, setCloseModal] = useState<ExecutionSegment | null>(null);
  const [closeDate, setCloseDate] = useState(todayLocal());
  const [closeType, setCloseType] = useState<ChangeType>('executor_change');
  const [closeReason, setCloseReason] = useState('');

  const [progressModal, setProgressModal] = useState<ExecutionSegmentItem | null>(null);
  const [progressDate, setProgressDate] = useState(todayLocal());
  const [progressQuantity, setProgressQuantity] = useState('');
  const [progressNotes, setProgressNotes] = useState('');
  const [reviewModal, setReviewModal] = useState<ExecutionProgressEntry | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewQuantity, setReviewQuantity] = useState('');
  const [reviewReason, setReviewReason] = useState('');

  // Progress-linked external subcontractor claims; approval and payment remain in Payroll.
  const [canSubmitClaims, setCanSubmitClaims] = useState(false);
  const [claimableProgress, setClaimableProgress] = useState<SubcontractClaimableProgress[]>([]);
  const [claimProgress, setClaimProgress] = useState<SubcontractClaimableProgress | null>(null);
  const [claimQuantity, setClaimQuantity] = useState('');
  const [claimRetention, setClaimRetention] = useState('0');
  const [claimDeduction, setClaimDeduction] = useState('0');
  const [claimNotes, setClaimNotes] = useState('');

  // Contract register editor (external subcontractor only).
  const [contractEditor, setContractEditor] = useState<ExecutionContractRegister | null>(null);
  const [contractTitle, setContractTitle] = useState('');
  const [metadataReference, setMetadataReference] = useState('');
  const [contractSignedDate, setContractSignedDate] = useState('');
  const [contractStartDate, setContractStartDate] = useState(todayLocal());
  const [contractEndDate, setContractEndDate] = useState('');
  const [contractNotes, setContractNotes] = useState('');

  // Register document metadata for a file already stored in the approved Storage bucket/repository.
  const [documentContract, setDocumentContract] = useState<ExecutionContractRegister | null>(null);
  const [documentType, setDocumentType] = useState<ExecutionContractDocument['document_type']>('agreement');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentFileName, setDocumentFileName] = useState('');
  const [documentStoragePath, setDocumentStoragePath] = useState('');
  const [documentMimeType, setDocumentMimeType] = useState('application/pdf');
  const [documentDate, setDocumentDate] = useState(todayLocal());
  const [documentNotes, setDocumentNotes] = useState('');

  // Payment terms are configured beside the subcontract contract, not in payroll.
  const [termSegment, setTermSegment] = useState<ExecutionSegment | null>(null);
  const [termName, setTermName] = useState('');
  const [termBasis, setTermBasis] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [termAmount, setTermAmount] = useState('');
  const [termDueDate, setTermDueDate] = useState('');
  const [termTrigger, setTermTrigger] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!projectId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const access = await getMyAccess();
      const hasProjectAccess = [
        'project.read', 'project.manage', 'execution.read',
        'execution.report.create', 'execution.progress.review',
      ].some((code) => hasPermission(access, code, projectId));
      if (!hasProjectAccess) {
        throw new Error('Akun Anda belum memiliki akses ke ruang pelaksanaan proyek ini. Periksa penugasan proyek dan permission Anda.');
      }
      const workspace = await fetchProjectExecutionWorkspace(projectId);
      setData(workspace);
      setSelectedPackageId((current) => current && workspace.packages.some((p) => p.id === current)
        ? current : workspace.packages[0]?.id ?? '');
      const manage = hasPermission(access, 'project.manage', projectId);
      const canPayDetails = hasPermission(access, 'payroll.read')
        || hasPermission(access, 'execution.payment.read')
        || hasPermission(access, 'execution.payment.manage');
      const canSeeContract = manage || canPayDetails;
      const review = hasPermission(access, 'execution.progress.review', projectId) || manage;
      const report = hasPermission(access, 'execution.report.create', projectId) || manage;
      setCanManage(manage);
      setCanReview(review);
      setCanReport(report);
      setCanManageSubcontractors(hasPermission(access, 'project.manage'));
      setCanViewContractDetails(canSeeContract);
      setCanViewPaymentBalances(canPayDetails);
      const submitClaims = manage || hasPermission(access, 'execution.payment.manage') || hasPermission(access, 'payroll.manage');
      setCanSubmitClaims(submitClaims);
      if (submitClaims) {
        const claimableResult = await supabase.from('subcontract_unit_progress_available')
          .select('progress_entry_id, report_date, quantity_approved, segment_item_id, segment_id, segment_number, unit_rate, project_id, project_title, package_id, package_name, item_name, unit, claimed_quantity, available_quantity, available_value')
          .eq('project_id', projectId).gt('available_quantity', 0).order('report_date', { ascending: false });
        if (claimableResult.error && claimableResult.error.code !== '42501') {
          throw new Error(`Gagal memuat sisa volume tagihan subkontraktor: ${claimableResult.error.message}`);
        }
        setClaimableProgress((claimableResult.data ?? []) as SubcontractClaimableProgress[]);
      } else {
        setClaimableProgress([]);
      }
    } catch (err) {
      console.error('Gagal memuat pusat pelaksanaan pekerjaan:', err);
      setError(errorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime menjadi jalur utama; refresh berkala menjadi cadangan bila koneksi terputus.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase.channel(`execution-project-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_work_packages' }, () => void load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_segments' }, () => void load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_segment_items' }, () => void load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_progress_entries' }, () => void load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'execution_change_orders' }, () => void load(true))
      .subscribe();
    const interval = window.setInterval(() => void load(true), 30000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [projectId, load]);

  const packages = data?.packages ?? [];
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const packageItems = (data?.packageItems ?? []).filter((item) => item.package_id === selectedPackageId);
  const segments = (data?.segments ?? []).filter((item) => item.package_id === selectedPackageId);
  const segmentItems = (data?.segmentItems ?? []).filter((item) => segments.some((segment) => segment.id === item.segment_id));
  const currentChangeOrders = (data?.changeOrders ?? []).filter((item) => item.package_id === selectedPackageId);

  const filteredPackages = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return packages.filter((item) => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchKeyword = !keyword || `${item.package_number} ${item.package_name} ${item.description ?? ''}`.toLocaleLowerCase('id').includes(keyword);
      return matchStatus && matchKeyword;
    });
  }, [packages, search, statusFilter]);

  const totalBudget = (data?.packageItems ?? []).reduce((sum, item) => sum + Number(item.reference_total_amount ?? 0), 0);
  const activeSegmentCount = (data?.segments ?? []).filter((item) => item.status === 'active').length;
  const subcontractSegmentCount = (data?.segments ?? []).filter((item) => item.executor_type === 'subcontractor' && ['active', 'planned'].includes(item.status)).length;
  const awaitingProgress = (data?.progressEntries ?? []).filter((item) => item.status === 'submitted').length;

  const resetMessages = () => { setError(''); setSuccess(''); };
  const openPackageModal = () => {
    resetMessages();
    setPackageName('');
    setPackageDivisionId('all');
    setPackageStart(todayLocal());
    setPackageEnd('');
    setPackageDescription('');
    const usedIds = new Set((data?.packageItems ?? []).map((item) => item.rab_item_id).filter((id): id is string => Boolean(id)));
    setSelectedRabIds((data?.rabItems ?? []).filter((item) => !usedIds.has(item.id)).map((item) => item.id));
    setPackageModal(true);
  };
  const usedRabIds = new Set((data?.packageItems ?? []).map((item) => item.rab_item_id).filter((id): id is string => Boolean(id)));
  const visibleRabItems = (data?.rabItems ?? []).filter((item) => packageDivisionId === 'all' || item.division_id === packageDivisionId);
  const toggleRabItem = (id: string, selected: boolean) => {
    setSelectedRabIds((current) => selected ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  };
  const toggleVisibleRabItems = (selected: boolean) => {
    const ids = visibleRabItems.map((item) => item.id);
    const availableIds = ids.filter((id) => !usedRabIds.has(id));
    setSelectedRabIds((current) => selected ? [...new Set([...current, ...availableIds])] : current.filter((id) => !availableIds.includes(id)));
  };

  const savePackage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || saving) return;
    setSaving(true); resetMessages();
    try {
      const selectedItems = data.rabItems.filter((item) => selectedRabIds.includes(item.id));
      if (selectedItems.length === 0) throw new Error('Pilih setidaknya satu item RAB untuk dijadikan lingkup paket.');
      const result = await createProjectWorkPackage({
        project_id: projectId,
        package_name: packageName,
        division_id: packageDivisionId === 'all' ? null : packageDivisionId,
        rab_item_ids: selectedItems.map((item) => item.id),
        description: packageDescription || null,
        planned_start_date: packageStart || null,
        planned_end_date: packageEnd || null,
      });
      setPackageModal(false);
      setSelectedPackageId(result.id);
      setSuccess(`Paket ${result.package_number} berhasil dibuat. Snapshot item RAB tersimpan dan akan menjadi acuan lingkup pelaksanaan.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const openSegmentModal = (pkg: WorkPackage) => {
    if (!data) return;
    resetMessages();
    setSelectedPackageId(pkg.id);
    setSegmentTitle('Pelaksanaan baru');
    setExecutorType('internal');
    setExecutionMethod('daily');
    setSubcontractorId('');
    setContractReference('');
    setAgreedAmount('');
    setUnitRate('');
    setRetentionPercent('0');
    setSegmentStart(todayLocal());
    setSegmentDescription('');
    setIncludedComponents([]);
    setScopeExclusions('');
    const previousChange = data.changeOrders.find((item) => item.package_id === pkg.id && item.status === 'approved' && !item.new_segment_id);
    setChangeOrderId(previousChange?.id ?? '');
    const previousSegment = previousChange
      ? data.segments.find((segment) => segment.id === previousChange.previous_segment_id)
      : null;
    if (previousChange) {
      const nextStart = new Date(`${previousChange.effective_date.slice(0, 10)}T00:00:00`);
      nextStart.setDate(nextStart.getDate() + 1);
      setSegmentStart(`${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}-${String(nextStart.getDate()).padStart(2, '0')}`);
    }
    const previousScopeIds = new Set(previousSegment
      ? data.segmentItems.filter((row) => row.segment_id === previousSegment.id).map((row) => row.package_item_id)
      : []);
    const rows: Record<string, { selected: boolean; quantity: string }> = {};
    data.packageItems.filter((item) => item.package_id === pkg.id).forEach((item) => {
      const inPreviousScope = !previousChange || previousScopeIds.has(item.id);
      const remaining = inPreviousScope ? packageRemaining(item, data) : 0;
      rows[item.id] = { selected: inPreviousScope && remaining > 0, quantity: remaining > 0 ? String(remaining) : '0' };
    });
    setAllocationRows(rows);
    setSegmentModal(true);
  };

  const allowedMethods: ExecutionMethod[] = executorType === 'internal'
    ? ['daily', 'hourly', 'monthly', 'internal_piecework']
    : ['subcontract_unit', 'subcontract_lump_sum', 'subcontract_all_in'];
  const isUnitRate = executionMethod === 'internal_piecework' || executionMethod === 'subcontract_unit';
  const isLumpSum = executionMethod === 'subcontract_lump_sum' || executionMethod === 'subcontract_all_in';

  const saveSegment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPackage || !data || saving) return;
    setSaving(true); resetMessages();
    try {
      const allocations = Object.entries(allocationRows)
        .filter(([, value]) => value.selected)
        .map(([package_item_id, value]) => ({ package_item_id, allocated_quantity: Number(value.quantity) }));
      if (!allocations.length) throw new Error('Pilih minimal satu lingkup item pekerjaan.');
      if (allocations.some((row) => !Number.isFinite(row.allocated_quantity) || row.allocated_quantity <= 0)) {
        throw new Error('Volume alokasi setiap item harus lebih besar dari nol.');
      }
      if (executorType === 'subcontractor' && includedComponents.length === 0) throw new Error('Tentukan minimal satu komponen yang termasuk dalam lingkup subkontrak.');
      const payload: CreateSegmentInput = {
        package_id: selectedPackage.id,
        segment_title: segmentTitle,
        executor_type: executorType,
        execution_method: executionMethod,
        subcontractor_id: executorType === 'subcontractor' ? subcontractorId || null : null,
        contract_reference: contractReference || null,
        agreed_amount: isLumpSum ? Number(agreedAmount) : null,
        unit_rate: isUnitRate ? Number(unitRate) : null,
        retention_percent: Number(retentionPercent || 0),
        included_components: executorType === 'subcontractor' ? includedComponents : [],
        scope_exclusions: executorType === 'subcontractor' ? scopeExclusions || null : null,
        effective_from: segmentStart,
        change_order_id: changeOrderId || null,
        description: segmentDescription || null,
        allocations,
      };
      const result = await createExecutionSegment(payload);
      setSegmentModal(false);
      setSuccess(`Segmen ${result.segment_number} berhasil dibuat. Metode: ${METHOD_LABELS[result.execution_method]}.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const saveCloseSegment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!closeModal || saving) return;
    setSaving(true); resetMessages();
    try {
      const changeId = await closeExecutionSegment(closeModal.id, closeDate, closeType, closeReason);
      setCloseModal(null);
      setSuccess(`Segmen ${closeModal.segment_number} ditutup dan change order ${changeId.slice(0, 8).toUpperCase()} tercatat. Lingkup tersisa dapat dialokasikan ke pelaksana berikutnya.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const activateSegment = async (segment: ExecutionSegment) => {
    if (saving) return;
    setSaving(true); resetMessages();
    try {
      await activateExecutionSegment(segment.id);
      setSuccess(`Segmen ${segment.segment_number} berhasil diaktifkan.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const saveSubcontractor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); resetMessages();
    try {
      const created = await createSubcontractor({
        legal_name: subcontractorName, contact_person: subcontractorContact, phone: subcontractorPhone,
        email: subcontractorEmail, tax_number: subcontractorTaxNumber, address: subcontractorAddress,
      });
      setSubcontractorId(created.id);
      setSubcontractorModal(false);
      setSubcontractorName(''); setSubcontractorContact(''); setSubcontractorPhone('');
      setSubcontractorEmail(''); setSubcontractorTaxNumber(''); setSubcontractorAddress('');
      setSuccess(`Subkontraktor ${created.legal_name} berhasil ditambahkan ke master.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const openSubcontractClaim = (progressId: string) => {
    const available = claimableProgress.find((row) => row.progress_entry_id === progressId);
    if (!available) {
      setError('Tidak ada sisa volume yang dapat ditagihkan pada progres ini.');
      return;
    }
    setClaimProgress(available);
    setClaimQuantity(String(available.available_quantity));
    setClaimRetention('0');
    setClaimDeduction('0');
    setClaimNotes('');
    resetMessages();
  };

  const submitProgressLinkedClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!claimProgress || saving) return;
    const quantity = Number(claimQuantity);
    const gross = Math.round(quantity * Number(claimProgress.unit_rate) * 100) / 100;
    const segment = data?.segments.find((row) => row.id === claimProgress.segment_id);
    const retention = Number(claimRetention || 0);
    const deduction = Number(claimDeduction || 0);
    const maxRetention = gross * Number(segment?.retention_percent ?? 0) / 100;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > claimProgress.available_quantity + 0.000001) {
      setError(`Volume tagihan harus lebih dari nol dan tidak melebihi sisa ${numberLabel(claimProgress.available_quantity)} ${claimProgress.unit}.`);
      return;
    }
    if (!Number.isFinite(retention) || retention < 0 || retention > maxRetention + 0.01) {
      setError(`Retensi tidak boleh melebihi ${rupiah(maxRetention)} sesuai persentase kontrak.`);
      return;
    }
    if (!Number.isFinite(deduction) || deduction < 0 || retention + deduction >= gross) {
      setError('Retensi dan potongan harus valid serta lebih kecil dari nilai bruto tagihan.');
      return;
    }
    if (!claimNotes.trim()) {
      setError('Catatan atau referensi berita acara/bukti progres wajib diisi.');
      return;
    }
    setSaving(true); resetMessages();
    try {
      await submitSubcontractRequest({
        segmentId: claimProgress.segment_id,
        termId: null,
        requestDate: todayLocal(),
        grossAmount: null,
        retentionAmount: retention,
        deductionAmount: deduction,
        notes: claimNotes.trim(),
        progressLines: [{ progressEntryId: claimProgress.progress_entry_id, quantity }],
      });
      setClaimProgress(null);
      setSuccess('Tagihan subkontraktor berhasil diajukan. Permintaan dapat diperiksa, disetujui, dan dibayar melalui Personalia → Penggajian.');
      await load(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSaving(false); }
  };

  const saveProgress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!progressModal || saving) return;
    setSaving(true); resetMessages();
    try {
      await submitExecutionProgress(progressModal.id, progressDate, Number(progressQuantity), progressNotes);
      setProgressModal(null);
      setSuccess('Laporan progres berhasil diajukan dan menunggu pemeriksaan.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const saveReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewModal || saving) return;
    setSaving(true); resetMessages();
    try {
      await reviewExecutionProgress(
        reviewModal.id,
        reviewDecision,
        reviewDecision === 'approved' ? Number(reviewQuantity) : null,
        reviewDecision === 'rejected' ? reviewReason : null,
      );
      setReviewModal(null);
      setSuccess(reviewDecision === 'approved' ? 'Volume progres berhasil disetujui.' : 'Laporan progres ditolak dan alasan tersimpan.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const openContractEditor = (segment: ExecutionSegment) => {
    const contract = data?.contracts.find((row) => row.segment_id === segment.id);
    if (!contract) { setError('Register kontrak belum tersedia. Pastikan Migration 016 telah dijalankan dan segmen subkontraktor tersinkron.'); return; }
    setContractEditor(contract);
    setContractTitle(contract.contract_title);
    setMetadataReference(contract.contract_reference ?? '');
    setContractSignedDate(contract.signed_date ?? '');
    setContractStartDate(contract.contract_start_date);
    setContractEndDate(contract.contract_end_date ?? '');
    setContractNotes(contract.contract_notes ?? '');
    resetMessages();
  };

  const saveContractMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contractEditor || saving) return;
    setSaving(true); resetMessages();
    try {
      await updateExecutionContractMetadata({
        segmentId: contractEditor.segment_id,
        contractTitle,
        contractReference: metadataReference,
        signedDate: contractSignedDate || null,
        startDate: contractStartDate,
        endDate: contractEndDate || null,
        notes: contractNotes,
      });
      setContractEditor(null);
      setSuccess('Metadata kontrak berhasil diperbarui. Nilai kontrak dan riwayat segmen tetap menjadi snapshot historis.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const openDocumentRegister = (contract: ExecutionContractRegister) => {
    setDocumentContract(contract);
    setDocumentType('agreement'); setDocumentTitle(''); setDocumentFileName('');
    setDocumentStoragePath(''); setDocumentMimeType('application/pdf');
    setDocumentDate(todayLocal()); setDocumentNotes(''); resetMessages();
  };

  const saveDocumentRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documentContract || saving) return;
    setSaving(true); resetMessages();
    try {
      await addExecutionContractDocument({
        contractId: documentContract.id, documentType, documentTitle, fileName: documentFileName,
        storagePath: documentStoragePath, mimeType: documentMimeType, fileSizeBytes: null,
        documentDate: documentDate || null, notes: documentNotes,
      });
      setDocumentContract(null);
      setSuccess('Dokumen kontrak berhasil didaftarkan. Pastikan file sudah lebih dahulu disimpan pada Storage/repository resmi.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const openTermCreator = (segment: ExecutionSegment) => {
    setTermSegment(segment); setTermName(''); setTermBasis('percentage'); setTermAmount('');
    setTermDueDate(''); setTermTrigger(''); resetMessages();
  };

  const saveSubcontractTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!termSegment || saving) return;
    const value = Number(termAmount);
    if (!termName.trim() || !Number.isFinite(value) || value <= 0) { setError('Nama dan nilai termin harus diisi dengan benar.'); return; }
    if (termBasis === 'percentage' && value > 100) { setError('Persentase termin tidak boleh lebih dari 100%.'); return; }
    if (termBasis === 'fixed_amount' && value > Number(termSegment.agreed_amount ?? 0)) { setError('Nilai termin tidak boleh melebihi nilai kontrak.'); return; }
    setSaving(true); resetMessages();
    try {
      await createExecutionSubcontractTerm({
        segmentId: termSegment.id,
        termName,
        basis: termBasis,
        percentage: termBasis === 'percentage' ? value : null,
        fixedAmount: termBasis === 'fixed_amount' ? value : null,
        dueDate: termDueDate || null,
        triggerDescription: termTrigger || null,
      });
      setTermSegment(null);
      setSuccess('Jadwal termin berhasil ditambahkan. Nilai rupiahnya disimpan sebagai snapshot kontrak.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const segmentSubcontractorName = (id: string | null) => data?.subcontractors.find((item) => item.id === id)?.legal_name ?? 'Subkontraktor tidak ditemukan';
  const itemForSegment = (segmentItem: ExecutionSegmentItem) => data?.packageItems.find((item) => item.id === segmentItem.package_item_id);
  const progressForSegmentItem = (id: string) => (data?.progressEntries ?? []).filter((item) => item.segment_item_id === id);
  const approvedProgress = (id: string) => progressForSegmentItem(id).filter((row) => row.status === 'approved').reduce((sum, row) => sum + Number(row.quantity_approved ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <HardHat className="h-4 w-4" /> Ruang Kerja Proyek · Pelaksanaan
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pusat Pengendalian Pelaksanaan Pekerjaan</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Kelola paket pekerjaan, metode pelaksanaan, pergantian pelaksana, lingkup volume, dan progres dalam satu riwayat yang dapat ditelusuri.</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4 text-slate-400" />{projectExecutionLabel(data?.project ?? null)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/proyek/${projectId}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Kembali ke RAB</Link>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button>
          {canManageSubcontractors && <button type="button" onClick={() => { setSubcontractorModal(true); resetMessages(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 className="h-4 w-4" /> Master Subkontraktor</button>}{canManage && <button type="button" onClick={openPackageModal} disabled={!data?.rabItems.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Buat Paket Pekerjaan</button>}
        </div>
      </header>

      {(error || success) && <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">{error || success}</span>
        <button type="button" onClick={() => { setError(''); setSuccess(''); }} aria-label="Tutup notifikasi"><X className="h-4 w-4" /></button>
      </div>}

      {loading ? <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" /> Memuat pusat pelaksanaan...</div> : !data ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">Data proyek tidak dapat dimuat. Periksa hak akses proyek dan koneksi database.</div> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paket pekerjaan</span><Layers3 className="h-5 w-5 text-slate-400" /></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{packages.length}</p><p className="mt-1 text-xs text-slate-500">Lingkup pekerjaan yang dikelola</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Segmen berjalan</span><HardHat className="h-5 w-5 text-emerald-700" /></div><p className="mt-3 text-3xl font-bold tabular-nums text-emerald-900">{activeSegmentCount}</p><p className="mt-1 text-xs text-emerald-800/70">Metode/pelaksana yang aktif</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subkontrak aktif</span><Building2 className="h-5 w-5 text-indigo-700" /></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{subcontractSegmentCount}</p><p className="mt-1 text-xs text-slate-500">Segmen subkontraktor berjalan/terencana</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progres menunggu</span><ClipboardCheck className="h-5 w-5 text-amber-700" /></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{awaitingProgress}</p><p className="mt-1 text-xs text-slate-500">Laporan volume belum diperiksa</p></div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.65fr)]">
          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Paket Pekerjaan</h2><p className="mt-0.5 text-xs text-slate-500">{filteredPackages.length} dari {packages.length} paket</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Referensi RAB: {rupiah(totalBudget)}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari paket..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" /></label><label className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"><option value="all">Semua status</option><option value="planned">Direncanakan</option><option value="active">Berjalan</option><option value="on_hold">Ditahan</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></label></div>
              <div className="mt-3 space-y-2">
                {filteredPackages.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center"><Layers3 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">Belum ada paket pekerjaan</p><p className="mt-1 text-xs leading-5 text-slate-500">Buat paket dari item RAB untuk mulai menetapkan pelaksana dan metode kerja.</p></div> : filteredPackages.map((pkg) => {
                  const isSelected = pkg.id === selectedPackageId;
                  const itemCount = data.packageItems.filter((item) => item.package_id === pkg.id).length;
                  const activeCount = data.segments.filter((segment) => segment.package_id === pkg.id && segment.status === 'active').length;
                  return <button key={pkg.id} type="button" onClick={() => setSelectedPackageId(pkg.id)} className={`w-full rounded-xl border p-3 text-left transition ${isSelected ? 'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2"><span className="font-mono text-[10px] font-bold text-emerald-700">{pkg.package_number}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pkg.status === 'active' ? 'bg-emerald-100 text-emerald-800' : pkg.status === 'completed' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>{PACKAGE_STATUS[pkg.status]}</span></div>
                    <p className="mt-1 font-bold text-slate-900">{pkg.package_name}</p><p className="mt-1 text-xs text-slate-500">{itemCount} item RAB · {activeCount} segmen aktif</p>
                    {pkg.planned_start_date && <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><CalendarDays className="h-3 w-3" />{dateLabel(pkg.planned_start_date)}{pkg.planned_end_date ? ` – ${dateLabel(pkg.planned_end_date)}` : ''}</p>}
                  </button>;
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-blue-900"><p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Prinsip pengendalian</p><p className="mt-1">Satu item RAB dikelola dalam satu paket. Volume dapat dibagi ke beberapa segmen, tetapi jumlah progres disetujui dan sisa alokasi aktif tidak boleh melebihi volume RAB.</p></div>
          </aside>

          <section className="min-w-0 space-y-4">
            {!selectedPackage ? <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center"><Layers3 className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-bold text-slate-800">Pilih paket pekerjaan</h2><p className="mt-1 max-w-md text-sm text-slate-500">Pilih paket di sebelah kiri untuk melihat item RAB, pelaksana, metode pembayaran, dan riwayat perubahan.</p></div> : <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0"><p className="font-mono text-xs font-bold text-emerald-700">{selectedPackage.package_number}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedPackage.package_name}</h2><p className="mt-1 text-sm text-slate-500">{selectedPackage.description || 'Tidak ada deskripsi paket.'}</p></div>
                  {canManage && <button type="button" onClick={() => openSegmentModal(selectedPackage)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Tambah Periode Pelaksanaan</button>}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Item lingkup</p><p className="mt-1 text-xl font-bold text-slate-900">{packageItems.length}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nilai referensi RAB</p><p className="mt-1 text-lg font-bold text-slate-900">{rupiah(packageItems.reduce((sum, item) => sum + Number(item.reference_total_amount), 0))}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Riwayat segmen</p><p className="mt-1 text-xl font-bold text-slate-900">{segments.length}</p></div></div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-4"><h3 className="font-bold text-slate-900">Lingkup Paket dari RAB</h3><p className="mt-0.5 text-xs text-slate-500">Snapshot volume dan harga referensi saat paket dibuat. Nilai ini bukan nilai pembayaran final.</p></div>
                {packageItems.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Tidak ada item RAB pada paket ini.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Kode / Uraian</th><th className="px-4 py-3">Volume RAB</th><th className="px-4 py-3">Dialokasikan aktif</th><th className="px-4 py-3">Disetujui</th><th className="px-4 py-3">Sisa belum dialokasikan</th><th className="px-4 py-3 text-right">Nilai RAB</th></tr></thead><tbody className="divide-y divide-slate-100">{packageItems.map((item) => {
                  const allocations = segmentItems.filter((row) => row.package_item_id === item.id);
                  const activeQty = allocations.filter((row) => ['active', 'planned'].includes(segments.find((s) => s.id === row.segment_id)?.status ?? '')).reduce((sum, row) => sum + Number(row.allocated_quantity), 0);
                  const approvedQty = allocations.reduce((sum, row) => sum + approvedProgress(row.id), 0);
                  return <tr key={item.id}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{item.item_name}</p><p className="text-xs text-slate-400">{item.rab_code || '—'}</p></td><td className="px-4 py-3 tabular-nums">{numberLabel(item.planned_quantity)} {item.unit}</td><td className="px-4 py-3 tabular-nums">{numberLabel(activeQty)} {item.unit}</td><td className="px-4 py-3 tabular-nums text-emerald-700">{numberLabel(approvedQty)} {item.unit}</td><td className="px-4 py-3 tabular-nums font-semibold">{numberLabel(packageRemaining(item, data))} {item.unit}</td><td className="px-4 py-3 text-right tabular-nums">{rupiah(item.reference_total_amount)}</td></tr>;
                })}</tbody></table></div>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center"><div><h3 className="font-bold text-slate-900">Riwayat Pelaksanaan</h3><p className="mt-0.5 text-xs text-slate-500">Setiap pergantian metode atau pelaksana menjadi periode baru.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{segments.length} segmen</span></div>
                {segments.length === 0 ? <div className="p-9 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-semibold text-slate-800">Belum ada periode pelaksanaan</p><p className="mt-1 text-xs text-slate-500">Tambahkan internal harian/bulanan, borongan tim, atau subkontraktor untuk memulai.</p></div> : <div className="space-y-3 p-4">{segments.map((segment) => {
                  const rows = segmentItems.filter((row) => row.segment_id === segment.id);
                  const change = currentChangeOrders.find((row) => row.id === segment.change_order_id);
                  return <article key={segment.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-bold text-emerald-700">{segment.segment_number}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${segment.status === 'active' ? 'bg-emerald-100 text-emerald-800' : segment.status === 'planned' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{SEGMENT_STATUS[segment.status]}</span></div><h4 className="mt-1 font-bold text-slate-900">{segment.segment_title}</h4><p className="mt-1 text-xs text-slate-500">{METHOD_LABELS[segment.execution_method]}{segment.executor_type === 'subcontractor' ? ` · ${segmentSubcontractorName(segment.subcontractor_id)}` : ' · Tim internal perusahaan'}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><CalendarDays className="h-3 w-3" />{dateLabel(segment.effective_from)}{segment.effective_to ? ` – ${dateLabel(segment.effective_to)}` : ' – sekarang'}</p>{segment.executor_type === 'subcontractor' && segment.included_components?.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Termasuk: {segment.included_components.map((code) => INCLUDED_COMPONENTS.find((item) => item.code === code)?.label ?? code).join(', ')}</p>}{segment.scope_exclusions && <p className="mt-1 text-[11px] text-amber-700">Pengecualian: {segment.scope_exclusions}</p>}{change && <p className="mt-1 text-[11px] text-indigo-700">Terhubung ke change order {change.change_number}</p>}</div>
                      <div className="flex flex-wrap gap-2">{canManage && segment.status === 'planned' && segment.effective_from <= todayLocal() && <button type="button" onClick={() => void activateSegment(segment)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" /> Mulai Segmen</button>}{canReport && segment.status === 'active' && rows.map((row) => <button key={row.id} type="button" onClick={() => { setProgressModal(row); setProgressQuantity(''); setProgressDate(todayLocal()); setProgressNotes(''); resetMessages(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><FilePlus2 className="h-3.5 w-3.5" /> Progres</button>)}{canManage && ['active', 'planned'].includes(segment.status) && <button type="button" onClick={() => { setCloseModal(segment); setCloseDate(todayLocal()); setCloseType('executor_change'); setCloseReason(''); resetMessages(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><ArrowRightLeft className="h-3.5 w-3.5" /> Tutup / Alihkan</button>}</div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Nilai kesepakatan</p><p className="mt-0.5 text-sm font-bold text-slate-800">{segment.agreed_amount ? rupiah(segment.agreed_amount) : segment.unit_rate ? `${rupiah(segment.unit_rate)} / satuan` : 'Mengikuti absensi / payroll'}</p></div><div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Alokasi lingkup</p><p className="mt-0.5 text-sm font-bold text-slate-800">{rows.length} item RAB</p></div><div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Retensi</p><p className="mt-0.5 text-sm font-bold text-slate-800">{numberLabel(segment.retention_percent, 2)}%</p></div></div>
                    {rows.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="pb-2">Lingkup item</th><th className="pb-2">Alokasi</th><th className="pb-2">Progres disetujui</th><th className="pb-2">Menunggu</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => { const item = itemForSegment(row); const progress = progressForSegmentItem(row.id); const approved = progress.filter((p) => p.status === 'approved').reduce((sum, p) => sum + Number(p.quantity_approved ?? 0), 0); const pending = progress.filter((p) => p.status === 'submitted').reduce((sum, p) => sum + Number(p.quantity_submitted), 0); return <tr key={row.id}><td className="py-2 pr-3 font-semibold text-slate-700">{item?.item_name ?? 'Item tidak ditemukan'}</td><td className="py-2 pr-3 tabular-nums">{numberLabel(row.allocated_quantity)} {item?.unit}</td><td className="py-2 pr-3 tabular-nums text-emerald-700">{numberLabel(approved)} {item?.unit}</td><td className="py-2 tabular-nums text-amber-700">{numberLabel(pending)} {item?.unit}</td></tr>; })}</tbody></table></div>}
                    {segment.executor_type === 'subcontractor' && (() => {
                      const contract = data.contracts.find((row) => row.segment_id === segment.id);
                      const terms = data.subcontractTerms.filter((row) => row.segment_id === segment.id);
                      const termBalances = data.subcontractTermSummaries.filter((row) => row.segment_id === segment.id);
                      const docs = data.contractDocuments.filter((row) => row.contract_id === contract?.id);
                      return <section className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Register kontrak subkontraktor</p>
                            {!canViewContractDetails ? <p className="mt-1 text-xs text-slate-600">Rincian kontrak dibatasi. Minta akses project manager atau permission pembacaan kontrak/pembayaran.</p> : contract ? <><p className="mt-1 font-bold text-slate-900">{contract.contract_number} · {contract.contract_title}</p><p className="mt-0.5 text-[11px] text-slate-600">Referensi: {contract.contract_reference || 'Belum diisi'} · Ditandatangani: {dateLabel(contract.signed_date)} · Periode: {dateLabel(contract.contract_start_date)} – {dateLabel(contract.contract_end_date)}</p></> : <p className="mt-1 text-xs text-amber-800">Register kontrak tidak ditemukan. Periksa Migration 016 atau sinkronisasi segmen.</p>}
                          </div>
                          {contract && <div className="flex flex-wrap gap-1.5">{canManage && <button type="button" onClick={() => openContractEditor(segment)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700">Data Kontrak</button>}{canManage && <button type="button" onClick={() => openDocumentRegister(contract)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700">Daftarkan Dokumen</button>}{canManage && ['subcontract_lump_sum','subcontract_all_in'].includes(segment.execution_method) && ['active','planned'].includes(segment.status) && <button type="button" onClick={() => openTermCreator(segment)} className="rounded-lg bg-indigo-700 px-2.5 py-1.5 text-[11px] font-bold text-white">Tambah Termin</button>}<Link href="/personalia/penggajian" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">Tagihan & Pembayaran</Link></div>}
                        </div>
                        {contract && canViewContractDetails && <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-white p-2.5"><p className="text-[10px] text-slate-500">Nilai snapshot kontrak</p><p className="mt-0.5 text-sm font-bold text-slate-900">{contract.contract_value_snapshot ? rupiah(contract.contract_value_snapshot) : segment.unit_rate ? `${rupiah(segment.unit_rate)} / satuan` : 'Tidak ditentukan'}</p></div><div className="rounded-lg bg-white p-2.5"><p className="text-[10px] text-slate-500">Termin aktif</p><p className="mt-0.5 text-sm font-bold text-slate-900">{terms.filter((term) => term.status === 'active').length} jadwal</p></div><div className="rounded-lg bg-white p-2.5"><p className="text-[10px] text-slate-500">Dokumen terdaftar</p><p className="mt-0.5 text-sm font-bold text-slate-900">{docs.length} dokumen</p></div></div>}
                        {canViewContractDetails && terms.length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border border-indigo-100 bg-white"><table className="w-full min-w-[790px] text-left text-[11px]"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-2">Termin</th><th className="px-3 py-2">Porsi</th><th className="px-3 py-2">Nilai snapshot</th><th className="px-3 py-2">Terpesan</th><th className="px-3 py-2">Dibayar</th><th className="px-3 py-2">Sisa hak tagih</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Jatuh tempo</th></tr></thead><tbody className="divide-y divide-slate-100">{terms.map((term) => { const balance = termBalances.find((row) => row.term_id === term.id); return <tr key={term.id}><td className="px-3 py-2 font-semibold">{term.term_name}<p className="font-normal text-slate-400">{term.term_number}</p></td><td className="px-3 py-2">{term.calculation_basis === 'percentage' ? `${term.percentage}%` : 'Nilai tetap'}</td><td className="px-3 py-2 font-semibold">{rupiah(term.term_amount_snapshot)}</td><td className="px-3 py-2">{canViewPaymentBalances && balance ? rupiah(balance.reserved_gross) : 'Terbatas'}</td><td className="px-3 py-2">{canViewPaymentBalances && balance ? rupiah(balance.paid_amount) : 'Terbatas'}</td><td className="px-3 py-2 font-bold text-emerald-700">{canViewPaymentBalances && balance ? rupiah(balance.available_to_claim) : 'Perlu izin pembayaran'}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${term.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{term.status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td><td className="px-3 py-2">{dateLabel(term.due_date)}</td></tr>; })}</tbody></table></div>}
                        {canViewContractDetails && docs.length > 0 && <div className="mt-3 space-y-1">{docs.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-[11px]"><span className="font-semibold text-slate-800">{doc.document_title} · {doc.file_name}</span><span className="text-slate-400">{doc.document_number} · {dateLabel(doc.document_date)}</span></div>)}</div>}
                        {segment.execution_method === 'subcontract_unit' && <p className="mt-3 rounded-lg bg-white p-2.5 text-[11px] leading-5 text-slate-600">Kontrak harga satuan tidak menggunakan jadwal termin persentase. Tagihan diajukan melalui Penggajian berdasarkan volume progres yang sudah disetujui dan belum pernah ditagihkan.</p>}
                      </section>;
                    })()}
                    {segment.closure_reason && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Alasan penutupan: {segment.closure_reason}</p>}
                  </article>;
                })}</div>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-slate-900">Pemeriksaan Progres</h3><p className="mt-0.5 text-xs text-slate-500">Volume yang disetujui menjadi progres historis dan mengurangi sisa lingkup yang dapat dialihkan.</p></div>
                {(() => { const entries = data.progressEntries.filter((entry) => segmentItems.some((si) => si.id === entry.segment_item_id)).sort((a, b) => b.report_date.localeCompare(a.report_date)); return entries.length === 0 ? <p className="p-7 text-center text-sm text-slate-500">Belum ada laporan progres pada paket ini.</p> : <div className="divide-y divide-slate-100">{entries.map((entry) => { const si = segmentItems.find((row) => row.id === entry.segment_item_id); const item = si ? itemForSegment(si) : null; const seg = si ? segments.find((row) => row.id === si.segment_id) : null; return <div key={entry.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-slate-800">{item?.item_name ?? 'Item'} · {seg?.segment_number ?? ''}</p><p className="mt-0.5 text-xs text-slate-500">{dateLabel(entry.report_date)} · Diajukan {numberLabel(entry.quantity_submitted)} {item?.unit}</p>{entry.notes && <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>}{entry.rejection_reason && <p className="mt-1 text-xs text-rose-700">Alasan: {entry.rejection_reason}</p>}</div><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : entry.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{PROGRESS_STATUS[entry.status]}</span>{entry.status === 'approved' && <span className="text-xs font-bold text-emerald-700">{numberLabel(entry.quantity_approved)} {item?.unit}</span>}{entry.status === 'approved' && seg?.executor_type === 'subcontractor' && seg.execution_method === 'subcontract_unit' && canSubmitClaims && (() => { const available = claimableProgress.find((row) => row.progress_entry_id === entry.id); return available ? <button type="button" onClick={() => openSubcontractClaim(entry.id)} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Ajukan tagihan · sisa {numberLabel(available.available_quantity)} {available.unit}</button> : <span className="text-[10px] text-slate-400">Sudah masuk pengajuan tagihan</span>; })()}{canReview && entry.status === 'submitted' && <button type="button" onClick={() => { setReviewModal(entry); setReviewDecision('approved'); setReviewQuantity(String(entry.quantity_submitted)); setReviewReason(''); resetMessages(); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">Periksa</button>}</div></div>; })}</div>; })()}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4"><h3 className="flex items-center gap-2 font-bold text-slate-900"><History className="h-4 w-4 text-slate-400" /> Riwayat Perubahan Pelaksana</h3><p className="mt-0.5 text-xs text-slate-500">Kontrak/metode lama tetap tersimpan ketika pelaksanaan dialihkan.</p></div>
                {currentChangeOrders.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">Belum ada perubahan pelaksanaan yang dicatat.</p> : <div className="divide-y divide-slate-100">{currentChangeOrders.map((change) => { const previous = segments.find((seg) => seg.id === change.previous_segment_id); const next = segments.find((seg) => seg.id === change.new_segment_id); return <div key={change.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-indigo-700">{change.change_number}</span><span className="text-xs text-slate-500">Efektif {dateLabel(change.effective_date)}</span></div><p className="mt-1 text-sm font-semibold text-slate-800">{change.change_type.replace(/_/g, ' ')}</p><p className="mt-1 text-xs text-slate-600">{change.reason}</p><p className="mt-1 text-[11px] text-slate-400">{previous?.segment_number ?? 'Segmen sebelumnya'} {next ? `→ ${next.segment_number}` : '→ menunggu segmen pengganti'}</p></div>; })}</div>}
              </div>
            </>}
          </section>
        </section>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><strong>Alur kontrak & pembayaran:</strong> Volume progres yang disetujui untuk subkontraktor harga satuan dapat diajukan sebagai tagihan dari riwayat progres di halaman ini. Pemeriksaan, persetujuan tagihan, kewajiban, dan pembayaran dikelola melalui Personalia → Penggajian. Pencairan aktual tetap dicatat satu kali melalui Finance. Untuk kontrak lump sum/all-in, pengajuan tetap menggunakan termin kontrak. Dokumen yang didaftarkan di halaman ini harus lebih dahulu diunggah ke Storage/repository resmi. <Link href="/personalia/penggajian" className="ml-1 inline-flex font-bold underline">Buka Penggajian</Link></div>
      </>}

      {subcontractorModal && <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="subcontractor-modal-title" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Master pelaksana eksternal</p><h2 id="subcontractor-modal-title" className="mt-1 text-lg font-bold text-slate-900">Tambah Subkontraktor</h2><p className="mt-1 text-xs text-slate-500">Data badan usaha/pihak pelaksana disimpan terpisah dari Master Karyawan.</p></div><button type="button" onClick={() => !saving && setSubcontractorModal(false)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4" /></button></header><form onSubmit={saveSubcontractor} className="space-y-3 p-5"><label className={LABEL}>Nama badan usaha / subkontraktor<input required maxLength={180} value={subcontractorName} onChange={(e) => setSubcontractorName(e.target.value)} className={INPUT} placeholder="Nama legal perusahaan / penyedia jasa" /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nama penanggung jawab<input maxLength={120} value={subcontractorContact} onChange={(e) => setSubcontractorContact(e.target.value)} className={INPUT} /></label><label className={LABEL}>Nomor telepon<input maxLength={50} value={subcontractorPhone} onChange={(e) => setSubcontractorPhone(e.target.value)} className={INPUT} /></label><label className={LABEL}>Email<input type="email" maxLength={180} value={subcontractorEmail} onChange={(e) => setSubcontractorEmail(e.target.value)} className={INPUT} /></label><label className={LABEL}>NPWP / nomor pajak<input maxLength={40} value={subcontractorTaxNumber} onChange={(e) => setSubcontractorTaxNumber(e.target.value)} className={INPUT} /></label></div><label className={LABEL}>Alamat<textarea rows={2} value={subcontractorAddress} onChange={(e) => setSubcontractorAddress(e.target.value)} className={INPUT} /></label><p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Master subkontraktor bersifat company-wide. Penambahan memerlukan hak pengelolaan katalog subkontraktor (Direktur/Admin atau akses perusahaan yang sesuai).</p><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setSubcontractorModal(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving || !subcontractorName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Simpan Subkontraktor</button></footer></form></section></div>}

      {packageModal && data && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="package-modal-title" className="my-auto max-h-[94vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Lingkup proyek</p><h2 id="package-modal-title" className="mt-1 text-lg font-bold text-slate-900">Buat Paket Pekerjaan</h2><p className="mt-1 text-xs text-slate-500">Pilih item RAB yang menjadi satu paket pengendalian. Item RAB yang sama tidak dapat dimasukkan ke dua paket.</p></div><button type="button" onClick={() => !saving && setPackageModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><form onSubmit={savePackage} className="flex max-h-[calc(94vh-76px)] flex-col"><div className="space-y-4 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nama paket pekerjaan<input required maxLength={180} value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="Contoh: Pekerjaan Struktur Lantai 1" className={INPUT} /></label><label className={LABEL}>Lokasi / divisi RAB<select value={packageDivisionId} onChange={(e) => { setPackageDivisionId(e.target.value); const ids = data.rabItems.filter((item) => (e.target.value === 'all' || item.division_id === e.target.value) && !usedRabIds.has(item.id)).map((item) => item.id); setSelectedRabIds(ids); }} className={INPUT}><option value="all">Semua divisi proyek</option>{data.divisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} — ` : ''}{division.name}</option>)}</select></label><label className={LABEL}>Tanggal rencana mulai<input type="date" value={packageStart} onChange={(e) => setPackageStart(e.target.value)} className={INPUT} /></label><label className={LABEL}>Tanggal rencana selesai<input type="date" min={packageStart || undefined} value={packageEnd} onChange={(e) => setPackageEnd(e.target.value)} className={INPUT} /></label></div><label className={LABEL}>Deskripsi / catatan<textarea rows={2} maxLength={2000} value={packageDescription} onChange={(e) => setPackageDescription(e.target.value)} className={INPUT} placeholder="Batas lingkup, catatan pelaksanaan, atau keterangan..." /></label><div className="rounded-xl border border-slate-200"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3"><div><p className="text-sm font-bold text-slate-800">Pilih item RAB</p><p className="text-[11px] text-slate-500">{visibleRabItems.filter((item) => selectedRabIds.includes(item.id)).length} dari {visibleRabItems.length} item dipilih</p></div><div className="flex gap-2"><button type="button" onClick={() => toggleVisibleRabItems(true)} className="text-xs font-semibold text-emerald-700">Pilih semua</button><button type="button" onClick={() => toggleVisibleRabItems(false)} className="text-xs font-semibold text-slate-500">Kosongkan</button></div></div><div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">{visibleRabItems.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">Tidak ada item RAB pada pilihan tersebut.</p> : visibleRabItems.map((item) => { const selected = selectedRabIds.includes(item.id); const alreadyUsed = usedRabIds.has(item.id); return <label key={item.id} className={`flex items-start gap-3 p-3 ${alreadyUsed ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}><input type="checkbox" checked={selected} disabled={alreadyUsed} onChange={(e) => toggleRabItem(item.id, e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{item.name}</span><span className="mt-0.5 block text-[10px] text-slate-500">{item.code || '—'} · {numberLabel(item.volume)} {item.unit} · {rupiah(item.total_price)} {alreadyUsed ? '· Sudah dipaketkan' : ''}</span></span></label>; })}</div></div></div><footer className="flex flex-col-reverse justify-between gap-2 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center"><p className="text-[10px] text-slate-500">RAB disalin sebagai snapshot; perubahan RAB berikutnya tidak mengubah histori lingkup paket.</p><div className="flex gap-2"><button type="button" onClick={() => setPackageModal(false)} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving || !packageName.trim() || selectedRabIds.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan Paket</button></div></footer></form></section></div>}

      {segmentModal && selectedPackage && data && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="segment-modal-title" className="my-auto max-h-[94vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">{selectedPackage.package_number}</p><h2 id="segment-modal-title" className="mt-1 text-lg font-bold text-slate-900">Tambah Periode Pelaksanaan</h2><p className="mt-1 text-xs text-slate-500">Tetapkan pelaksana, metode, dan volume lingkup yang menjadi tanggung jawab periode ini.</p></div><button type="button" onClick={() => !saving && setSegmentModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><form onSubmit={saveSegment} className="flex max-h-[calc(94vh-76px)] flex-col"><div className="space-y-4 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nama periode / pelaksanaan<input required maxLength={180} value={segmentTitle} onChange={(e) => setSegmentTitle(e.target.value)} className={INPUT} placeholder="Contoh: Tim Internal Tahap 1" /></label><label className={LABEL}>Jenis pelaksana<select value={executorType} onChange={(e) => { const next = e.target.value as ExecutorType; setExecutorType(next); setExecutionMethod(next === 'internal' ? 'daily' : 'subcontract_all_in'); setIncludedComponents(next === 'subcontractor' ? ['labor','materials','equipment','transportation'] : []); }} className={INPUT}><option value="internal">Internal perusahaan / tim</option><option value="subcontractor">Subkontraktor</option></select></label><label className={LABEL}>Metode pelaksanaan<select value={executionMethod} onChange={(e) => setExecutionMethod(e.target.value as ExecutionMethod)} className={INPUT}>{allowedMethods.map((method) => <option key={method} value={method}>{METHOD_LABELS[method]}</option>)}</select></label>{executorType === 'subcontractor' && <label className={LABEL}>Subkontraktor<select required value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)} className={INPUT}><option value="">Pilih subkontraktor aktif</option>{data.subcontractors.map((item) => <option key={item.id} value={item.id}>{item.subcontractor_number} — {item.legal_name}</option>)}</select>{data.subcontractors.length === 0 && <span className="mt-1 block text-[10px] font-normal text-amber-700">Master subkontraktor belum memiliki data aktif. Isi master melalui modul Administrasi/Penyedia sebelum membuat segmen subkontrak.</span>}</label>}<label className={LABEL}>Tanggal mulai efektif<input required type="date" value={segmentStart} onChange={(e) => setSegmentStart(e.target.value)} className={INPUT} /></label><label className={LABEL}>Nomor kontrak / referensi<input maxLength={100} value={contractReference} onChange={(e) => setContractReference(e.target.value)} className={INPUT} placeholder="Opsional" /></label>{executorType === 'subcontractor' && <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold text-slate-800">Komponen yang termasuk dalam kontrak</p><p className="mt-1 text-[10px] text-slate-500">Tentukan secara eksplisit cakupan all-in. Komponen yang tidak dicentang dianggap di luar lingkup kecuali diatur lain dalam dokumen kontrak.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{INCLUDED_COMPONENTS.map((component) => <label key={component.code} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={includedComponents.includes(component.code)} onChange={(e) => setIncludedComponents((old) => e.target.checked ? [...old, component.code] : old.filter((code) => code !== component.code))} className="h-4 w-4 rounded border-slate-300 text-emerald-700" />{component.label}</label>)}</div><label className={`${LABEL} mt-3`}>Pekerjaan / komponen yang dikecualikan<textarea rows={2} value={scopeExclusions} onChange={(e) => setScopeExclusions(e.target.value)} className={INPUT} placeholder="Tuliskan pengecualian secara rinci, atau kosongkan jika tidak ada pengecualian..." /></label></div>}{isUnitRate && <label className={LABEL}>Tarif per satuan (Rp)<input type="number" min="0.01" step="0.01" required value={unitRate} onChange={(e) => setUnitRate(e.target.value)} className={INPUT} /></label>}{isLumpSum && <label className={LABEL}>Nilai kesepakatan / all-in (Rp)<input type="number" min="0.01" step="0.01" required value={agreedAmount} onChange={(e) => setAgreedAmount(e.target.value)} className={INPUT} /></label>}{executorType === 'subcontractor' && <label className={LABEL}>Retensi (%)<input type="number" min="0" max="100" step="0.01" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} className={INPUT} /></label>}</div>{changeOrderId && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">Segmen ini akan ditautkan ke change order terakhir yang belum memiliki pelaksana pengganti.</div>}<label className={LABEL}>Deskripsi dan batas lingkup<textarea rows={2} maxLength={2000} value={segmentDescription} onChange={(e) => setSegmentDescription(e.target.value)} className={INPUT} placeholder="Termasuk/tidak termasuk material, alat, transportasi, area, atau batas pekerjaan..." /></label><div className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 p-3"><p className="text-sm font-bold text-slate-800">Alokasi lingkup item RAB</p><p className="mt-0.5 text-[11px] text-slate-500">Volume tersedia dihitung dari volume RAB dikurangi progres yang disetujui dan sisa alokasi segmen aktif.</p></div><div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">{packageItems.map((item) => { const remaining = packageRemaining(item, data); const row = allocationRows[item.id] ?? { selected: false, quantity: '0' }; return <div key={item.id} className="flex items-start gap-3 p-3"><input type="checkbox" checked={row.selected} disabled={remaining <= 0} onChange={(e) => setAllocationRows((old) => ({ ...old, [item.id]: { selected: e.target.checked, quantity: e.target.checked && Number(old[item.id]?.quantity ?? 0) <= 0 ? String(remaining) : old[item.id]?.quantity ?? String(remaining) } }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{item.item_name}</p><p className="mt-0.5 text-[10px] text-slate-500">RAB {numberLabel(item.planned_quantity)} {item.unit} · tersedia {numberLabel(remaining)} {item.unit}</p></div><div className="w-32"><input type="number" min="0.001" max={remaining} step="0.001" disabled={!row.selected || remaining <= 0} value={row.quantity} onChange={(e) => setAllocationRows((old) => ({ ...old, [item.id]: { selected: true, quantity: e.target.value } }))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-right text-xs disabled:bg-slate-50" /><p className="mt-1 text-right text-[9px] text-slate-400">{item.unit}</p></div></div>; })}</div></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Jika segmen lama dihentikan, sisa volume yang belum disetujui akan dilepas kembali. Volume progres yang sudah disetujui tetap menjadi realisasi historis dan tidak dapat dialokasikan ulang.</div></div><footer className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row"><button type="button" onClick={() => setSegmentModal(false)} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving || (executorType === 'subcontractor' && !subcontractorId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan Periode Pelaksanaan</button></footer></form></section></div>}

      {contractEditor && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="border-b border-slate-100 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">{contractEditor.contract_number}</p><h2 className="mt-1 text-lg font-bold text-slate-900">Data Kontrak Subkontraktor</h2><p className="mt-1 text-xs text-slate-500">Perubahan nilai kontrak dilakukan melalui addendum/periode baru, bukan mengedit snapshot nilai lama.</p></div><button type="button" onClick={() => !saving && setContractEditor(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4"/></button></div></header><form onSubmit={saveContractMetadata} className="space-y-3 p-5"><label className={LABEL}>Judul kontrak<input required maxLength={180} value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} className={INPUT}/></label><label className={LABEL}>Nomor / referensi kontrak<input maxLength={120} value={metadataReference} onChange={(e) => setMetadataReference(e.target.value)} className={INPUT}/></label><div className="grid gap-3 sm:grid-cols-3"><label className={LABEL}>Tanggal tanda tangan<input type="date" value={contractSignedDate} onChange={(e) => setContractSignedDate(e.target.value)} className={INPUT}/></label><label className={LABEL}>Mulai kontrak<input required type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} className={INPUT}/></label><label className={LABEL}>Akhir kontrak<input type="date" min={contractStartDate} value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className={INPUT}/></label></div><label className={LABEL}>Catatan / referensi addendum<textarea rows={3} maxLength={2000} value={contractNotes} onChange={(e) => setContractNotes(e.target.value)} className={INPUT}/></label><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setContractEditor(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={saving} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Metadata'}</button></footer></form></section></div>}

      {documentContract && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">{documentContract.contract_number}</p><h2 className="mt-1 text-lg font-bold text-slate-900">Daftarkan Dokumen Kontrak</h2><p className="mt-1 text-xs text-slate-500">File harus sudah diunggah ke bucket/repository resmi. Form ini menyimpan metadata dan path dokumen.</p></div><button type="button" onClick={() => !saving && setDocumentContract(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4"/></button></header><form onSubmit={saveDocumentRegister} className="space-y-3 p-5"><label className={LABEL}>Jenis dokumen<select value={documentType} onChange={(e) => setDocumentType(e.target.value as ExecutionContractDocument['document_type'])} className={INPUT}><option value="agreement">Kontrak utama</option><option value="addendum">Addendum</option><option value="work_order">Surat perintah kerja</option><option value="handover_minutes">Berita acara serah terima</option><option value="progress_evidence">Bukti progres</option><option value="other">Lainnya</option></select></label><label className={LABEL}>Judul dokumen<input required value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} className={INPUT}/></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nama file<input required value={documentFileName} onChange={(e) => setDocumentFileName(e.target.value)} placeholder="kontrak-finishing.pdf" className={INPUT}/></label><label className={LABEL}>Tanggal dokumen<input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className={INPUT}/></label></div><label className={LABEL}>Storage path / URL repository<input required value={documentStoragePath} onChange={(e) => setDocumentStoragePath(e.target.value)} placeholder="contracts/PROYEK/KON-SUB-000001/kontrak.pdf" className={INPUT}/></label><label className={LABEL}>MIME type<input value={documentMimeType} onChange={(e) => setDocumentMimeType(e.target.value)} className={INPUT}/></label><label className={LABEL}>Catatan<textarea rows={2} value={documentNotes} onChange={(e) => setDocumentNotes(e.target.value)} className={INPUT}/></label><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setDocumentContract(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={saving} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Daftarkan Dokumen'}</button></footer></form></section></div>}

      {termSegment && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">{termSegment.segment_number}</p><h2 className="mt-1 text-lg font-bold text-slate-900">Tambah Jadwal Termin</h2><p className="mt-1 text-xs text-slate-500">Nilai kontrak snapshot: {rupiah(termSegment.agreed_amount)}</p></div><button type="button" onClick={() => !saving && setTermSegment(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4"/></button></header><form onSubmit={saveSubcontractTerm} className="space-y-3 p-5"><label className={LABEL}>Nama termin<input required maxLength={160} value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="Uang muka / Termin struktur / Pelunasan" className={INPUT}/></label><label className={LABEL}>Dasar perhitungan<select value={termBasis} onChange={(e) => { setTermBasis(e.target.value as 'percentage' | 'fixed_amount'); setTermAmount(''); }} className={INPUT}><option value="percentage">Persentase nilai kontrak</option><option value="fixed_amount">Nilai tetap (Rupiah)</option></select></label><label className={LABEL}>{termBasis === 'percentage' ? 'Persentase (%)' : 'Nilai termin (Rp)'}<input required type="number" min="0.01" max={termBasis === 'percentage' ? 100 : Number(termSegment.agreed_amount ?? 0)} step={termBasis === 'percentage' ? '0.01' : '100'} value={termAmount} onChange={(e) => setTermAmount(e.target.value)} className={INPUT}/></label><div className="rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between"><span className="text-slate-500">Estimasi nilai termin</span><strong>{termAmount && termBasis === 'percentage' ? rupiah(Number(termSegment.agreed_amount ?? 0) * Number(termAmount) / 100) : termBasis === 'fixed_amount' && termAmount ? rupiah(Number(termAmount)) : rupiah(0)}</strong></div><p className="mt-1 text-[10px] text-slate-500">Akumulasi seluruh termin aktif tidak boleh melebihi 100% atau nilai kontrak.</p></div><label className={LABEL}>Jatuh tempo<input type="date" value={termDueDate} onChange={(e) => setTermDueDate(e.target.value)} className={INPUT}/></label><label className={LABEL}>Pemicu / syarat termin<textarea rows={2} value={termTrigger} onChange={(e) => setTermTrigger(e.target.value)} placeholder="Contoh: setelah pekerjaan struktur selesai dan diterima" className={INPUT}/></label><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setTermSegment(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={saving} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Termin'}</button></footer></form></section></div>}

      {closeModal && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Tutup / Alihkan Pelaksanaan</h2><p className="mt-1 text-xs text-slate-500">{closeModal.segment_number} · {closeModal.segment_title}</p></div><button type="button" onClick={() => !saving && setCloseModal(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><form onSubmit={saveCloseSegment} className="space-y-4 p-5"><label className={LABEL}>Jenis perubahan<select value={closeType} onChange={(e) => setCloseType(e.target.value as ChangeType)} className={INPUT}><option value="executor_change">Pergantian pelaksana</option><option value="method_change">Perubahan metode pembayaran</option><option value="scope_reallocation">Pengalihan sisa lingkup</option><option value="termination">Penghentian kontrak/pekerjaan</option><option value="completion">Pekerjaan selesai</option><option value="other">Perubahan lainnya</option></select></label><label className={LABEL}>Tanggal efektif penutupan<input required type="date" min={closeModal.effective_from} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className={INPUT} /></label><label className={LABEL}>Alasan dan berita acara perubahan<textarea required minLength={8} rows={4} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className={INPUT} placeholder="Jelaskan alasan, kondisi progres, dan dasar pengalihan/penghentian..." /></label><p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Segmen akan ditutup atau dihentikan dan change order dibuat otomatis. Pastikan semua laporan progres yang menunggu sudah diperiksa.</p><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setCloseModal(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving || closeReason.trim().length < 8} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Simpan Perubahan</button></footer></form></section></div>}

      {claimProgress && <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" aria-labelledby="subcontract-claim-title" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{claimProgress.segment_number} · {claimProgress.package_name}</p><h2 id="subcontract-claim-title" className="mt-1 text-lg font-bold text-slate-900">Ajukan Tagihan Subkontraktor</h2><p className="mt-1 text-xs text-slate-500">Tagihan dihitung dari volume progres yang sudah disetujui dan tarif kontrak harga satuan.</p></div><button type="button" onClick={() => !saving && setClaimProgress(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4" /></button></header><form onSubmit={submitProgressLinkedClaim} className="space-y-4 p-5"><div className="rounded-xl bg-slate-50 p-3 text-xs"><p className="font-semibold text-slate-800">{claimProgress.item_name}</p><div className="mt-2 flex justify-between"><span className="text-slate-500">Volume disetujui</span><strong>{numberLabel(claimProgress.quantity_approved)} {claimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-500">Sudah ditagihkan</span><strong>{numberLabel(claimProgress.claimed_quantity)} {claimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-500">Sisa dapat ditagihkan</span><strong className="text-emerald-700">{numberLabel(claimProgress.available_quantity)} {claimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-500">Tarif kontrak</span><strong>{rupiah(claimProgress.unit_rate)} / {claimProgress.unit}</strong></div></div><label className={LABEL}>Volume yang ditagihkan ({claimProgress.unit})<input required type="number" min="0.001" max={claimProgress.available_quantity} step="0.001" value={claimQuantity} onChange={(e) => setClaimQuantity(e.target.value)} className={INPUT}/></label><div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><div className="flex justify-between text-xs"><span className="text-slate-600">Nilai bruto tagihan</span><strong className="text-slate-900">{rupiah(Math.round(Number(claimQuantity || 0) * claimProgress.unit_rate * 100) / 100)}</strong></div><p className="mt-1 text-[10px] text-slate-500">Nilai final dihitung ulang dan divalidasi oleh database.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Retensi (Rp)<input type="number" min="0" step="100" value={claimRetention} onChange={(e) => setClaimRetention(e.target.value)} className={INPUT}/><span className="text-[10px] font-normal text-slate-400">Maksimum {rupiah((Math.round(Number(claimQuantity || 0) * claimProgress.unit_rate * 100) / 100) * Number(data?.segments.find((row) => row.id === claimProgress.segment_id)?.retention_percent ?? 0) / 100)} sesuai kontrak.</span></label><label className={LABEL}>Potongan (Rp)<input type="number" min="0" step="100" value={claimDeduction} onChange={(e) => setClaimDeduction(e.target.value)} className={INPUT}/></label></div><label className={LABEL}>Catatan / berita acara / bukti progres<textarea required rows={3} value={claimNotes} onChange={(e) => setClaimNotes(e.target.value)} className={INPUT} placeholder="Nomor berita acara, referensi bukti progres, atau dasar potongan..."/></label><div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900">Setelah diajukan, volume ini langsung dipesan agar tidak dapat ditagihkan dua kali. Pemeriksaan dan persetujuan dilakukan di Personalia → Penggajian.</div><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setClaimProgress(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving || Number(claimQuantity) <= 0 || Number(claimQuantity) > claimProgress.available_quantity} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Mengajukan...' : 'Kirim Tagihan'}</button></footer></form></section></div>}

      {progressModal && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Ajukan Progres Pekerjaan</h2><p className="mt-1 text-xs text-slate-500">{itemForSegment(progressModal)?.item_name}</p></div><button type="button" onClick={() => !saving && setProgressModal(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4" /></button></header><form onSubmit={saveProgress} className="space-y-4 p-5"><label className={LABEL}>Tanggal laporan<input required type="date" value={progressDate} onChange={(e) => setProgressDate(e.target.value)} className={INPUT} /></label><label className={LABEL}>Volume hasil yang diajukan ({itemForSegment(progressModal)?.unit})<input required type="number" min="0.001" step="0.001" value={progressQuantity} onChange={(e) => setProgressQuantity(e.target.value)} className={INPUT} /></label><label className={LABEL}>Catatan / bukti pemeriksaan<textarea rows={3} value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)} className={INPUT} placeholder="Keterangan hasil pekerjaan, area, dokumentasi, atau catatan lapangan..." /></label><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setProgressModal(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />} Ajukan Progres</button></footer></form></section></div>}

      {reviewModal && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Pemeriksaan Laporan Progres</h2><p className="mt-1 text-xs text-slate-500">Diajukan {numberLabel(reviewModal.quantity_submitted)} {itemForSegment(segmentItems.find((row) => row.id === reviewModal.segment_item_id) ?? { id: '', segment_id: '', package_item_id: '', allocated_quantity: 0 })?.unit}</p></div><button type="button" onClick={() => !saving && setReviewModal(null)} className="rounded-lg p-1.5 text-slate-400"><X className="h-4 w-4" /></button></header><form onSubmit={saveReview} className="space-y-4 p-5"><label className={LABEL}>Keputusan<select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value as 'approved' | 'rejected')} className={INPUT}><option value="approved">Setujui volume</option><option value="rejected">Tolak laporan</option></select></label>{reviewDecision === 'approved' ? <label className={LABEL}>Volume disetujui<input type="number" required min="0.001" max={reviewModal.quantity_submitted} step="0.001" value={reviewQuantity} onChange={(e) => setReviewQuantity(e.target.value)} className={INPUT} /></label> : <label className={LABEL}>Alasan penolakan<textarea required rows={3} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} className={INPUT} /></label>}<footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setReviewModal(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Simpan Pemeriksaan</button></footer></form></section></div>}
    </main>
  );
}

export default function ProjectExecutionPage() {
  return <ProjectExecutionContent />;
}
