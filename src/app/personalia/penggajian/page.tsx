'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowDownToLine, Banknote, Building2, CheckCircle2,
  ChevronDown, ClipboardCheck, FileText, LoaderCircle, Plus,
  RefreshCw, Search, Wallet, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { PayrollPdfExports, PayrollPaymentPdfExports, SubcontractPdfExports } from '@/components/documents/PayrollDocumentExports';
import { getMyAccess, hasPermission, hasRole } from '@/lib/services/authService';
import {
  addPayrollLine, approvePayrollRun, buildPayrollRun, createPieceworkShare,
  createPayrollCostAllocation, createRetentionReleaseObligation, fetchPayrollRunItems, fetchPayrollWorkspace,
  markPayrollItemReviewed, recordPayment, reconcileLegacySubcontractRequest, reviewPieceworkShare,
  reviewSubcontractRequest, submitPayrollRun, submitSubcontractRequest, voidPayment, voidPayrollCostAllocation,
} from '@/lib/services/payrollService';
import type {
  PaymentObligation, PayrollItem, PayrollLine, PayrollWorkspace, SubcontractPaymentRequest, SubcontractRetentionBalance,
} from '@/types/payroll';

const money = (value: number | null | undefined) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(value ?? 0));
const dateLabel = (value?: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : '—';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const currentMonth = () => today().slice(0, 7);
const monthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const end = `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};
const runLabel: Record<string, string> = {
  draft: 'Draft', submitted: 'Diajukan', approved: 'Disetujui',
  partially_paid: 'Dibayar sebagian', paid: 'Lunas', cancelled: 'Dibatalkan',
};
const obligationLabel: Record<string, string> = {
  open: 'Belum dibayar', partially_paid: 'Dibayar sebagian', paid: 'Lunas', void: 'Dibatalkan',
};
const INPUT = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';

type Tab = 'overview' | 'payroll' | 'piecework' | 'subcontract' | 'allocations' | 'payments';

function PayrollContent() {
  const [data, setData] = useState<PayrollWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(currentMonth());
  const [selectedRunId, setSelectedRunId] = useState('');
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [basisFilter, setBasisFilter] = useState<'all'|'monthly'|'daily'|'hourly'|'piecework'|'mixed'>('all');
  const [selectedPayrollItemIds, setSelectedPayrollItemIds] = useState<string[]>([]);

  // Manual payroll line form.
  const [lineKind, setLineKind] = useState<'earning' | 'deduction'>('earning');
  const [lineLabel, setLineLabel] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [lineNotes, setLineNotes] = useState('');

  // Internal piecework allocation form.
  const [progressId, setProgressId] = useState('');
  const [pieceworkEmployeeId, setPieceworkEmployeeId] = useState('');
  const [pieceworkQuantity, setPieceworkQuantity] = useState('');
  const [pieceworkNotes, setPieceworkNotes] = useState('');

  // Subcontractor term and claim forms.
  const [claimSegmentId, setClaimSegmentId] = useState('');
  const [claimTermId, setClaimTermId] = useState('');
  const [claimProgressId, setClaimProgressId] = useState('');
  const [claimProgressQuantity, setClaimProgressQuantity] = useState('');
  const [claimGross, setClaimGross] = useState('');
  const [claimRetention, setClaimRetention] = useState('0');
  const [claimDeduction, setClaimDeduction] = useState('0');
  const [claimNotes, setClaimNotes] = useState('');

  // One-time reconciliation for legacy unit claims created before progress-level linking.
  const [legacyRequest, setLegacyRequest] = useState<SubcontractPaymentRequest | null>(null);
  const [legacyProgressId, setLegacyProgressId] = useState('');
  const [legacyProgressQuantity, setLegacyProgressQuantity] = useState('');
  const [legacyProgressLines, setLegacyProgressLines] = useState<Array<{ progressEntryId: string; quantity: number }>>([]);

  // Payroll cost allocation is attribution only; it never creates a second payment/cash entry.
  const [allocationLineId, setAllocationLineId] = useState('');
  const [allocationProjectId, setAllocationProjectId] = useState('');
  const [allocationPackageId, setAllocationPackageId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [allocationNotes, setAllocationNotes] = useState('');

  // Subcontract retention release form. Releasing retention creates an obligation; it does not pay it.
  const [retentionToRelease, setRetentionToRelease] = useState<SubcontractRetentionBalance | null>(null);
  const [retentionReleaseAmount, setRetentionReleaseAmount] = useState('');
  const [retentionReleaseDueDate, setRetentionReleaseDueDate] = useState('');
  const [retentionReleaseNotes, setRetentionReleaseNotes] = useState('');

  // Actual payment form, one obligation per action. Multi-allocation is supported by the RPC.
  const [paying, setPaying] = useState<PaymentObligation | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'other'>('bank_transfer');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [workspace, access] = await Promise.all([fetchPayrollWorkspace(), getMyAccess()]);
      setData(workspace);
      setCanManage(hasPermission(access, 'payroll.manage'));
      // Finance role mapping is intentionally deferred; existing company roles are checked here.
      setCanPay(hasRole(access, 'director') || hasRole(access, 'admin') || hasRole(access, 'finance'));
      setSelectedRunId((current) => current || workspace.runs[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pusat penggajian.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadRunDetail = useCallback(async (runId: string) => {
    if (!runId) { setItems([]); setLines([]); return; }
    try {
      const detail = await fetchPayrollRunItems(runId);
      setItems(detail.items);
      setLines(detail.lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat rincian payroll.');
    }
  }, []);

  useEffect(() => { void loadRunDetail(selectedRunId); }, [selectedRunId, loadRunDetail]);

  const selectedRun = data?.runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedClaimSegment = data?.subcontractSegments.find((segment) => segment.id === claimSegmentId) ?? null;
  const isUnitClaim = selectedClaimSegment?.execution_method === 'subcontract_unit';
  const selectedClaimProgress = data?.subcontractUnitProgress.find((row) => row.progress_entry_id === claimProgressId) ?? null;
  const selectedClaimTermSummary = data?.subcontractTermSummaries.find((row) => row.term_id === claimTermId) ?? null;
  const unitClaimGrossPreview = selectedClaimProgress && Number(claimProgressQuantity) > 0
    ? Math.round(Number(claimProgressQuantity) * Number(selectedClaimProgress.unit_rate) * 100) / 100 : 0;
  const claimGrossBasis = isUnitClaim ? unitClaimGrossPreview : Number(claimGross || 0);
  const claimRetentionRate = Number(selectedClaimSegment?.retention_percent ?? 0);
  const maxClaimRetention = Math.round(claimGrossBasis * claimRetentionRate) / 100;
  const openObligations = data?.obligations.filter((row) => row.status === 'open' || row.status === 'partially_paid') ?? [];
  const outstandingTotal = openObligations.reduce((sum, row) => sum + row.amount - row.paid_amount, 0);
  const paidTotal = data?.payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const pendingRequests = data?.subcontractRequests.filter((row) => row.status === 'submitted').length ?? 0;
  const pendingShares = data?.pieceworkShares.filter((row) => row.status === 'submitted').length ?? 0;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('id');
    return items.filter((item) => (basisFilter === 'all' || item.pay_basis === basisFilter)
      && (!q || `${item.employee?.employee_number ?? ''} ${item.employee?.full_name ?? ''} ${item.item_number}`.toLocaleLowerCase('id').includes(q)));
  }, [items, search, basisFilter]);

  const basisSummary = useMemo(() => (['monthly','daily','hourly','piecework','mixed'] as const).map((basis) => {
    const group = items.filter((item) => item.pay_basis === basis);
    return { basis, count: group.length, net: group.reduce((sum, item) => sum + Number(item.net_amount || 0), 0) };
  }).filter((group) => group.count > 0), [items]);

  const handleBulkReview = async () => {
    const targets = items.filter((item) => selectedPayrollItemIds.includes(item.id) && item.calculation_status === 'needs_review');
    if (!targets.length) { setError('Pilih minimal satu item berstatus perlu diperiksa.'); return; }
    const note = window.prompt(`Catatan pemeriksaan untuk ${targets.length} item payroll:`);
    if (!note?.trim()) return;
    const failedIds: string[] = []; const failures: string[] = []; let completed = 0;
    await runAction(async () => {
      for (const item of targets) {
        try { await markPayrollItemReviewed(item.id, note.trim()); completed += 1; }
        catch (cause) { failedIds.push(item.id); failures.push(`${item.employee?.full_name ?? item.item_number}: ${cause instanceof Error ? cause.message : 'Gagal diperiksa'}`); }
      }
      setSelectedPayrollItemIds(failedIds);
    }, `${completed} item payroll berhasil diperiksa${failures.length ? `; ${failures.length} gagal` : ''}.`);
    if (failures.length) setError(failures.slice(0,3).join(' | '));
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    if (saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      await load(true);
      if (selectedRunId) await loadRunDetail(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operasi tidak berhasil.');
    } finally { setSaving(false); }
  };

  const handleBuildPayroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    const range = monthRange(month);
    await runAction(async () => {
      const run = await buildPayrollRun(range.start, range.end);
      setSelectedRunId(run.id);
      setTab('payroll');
    }, `Payroll periode ${month} berhasil dibangun sebagai Draft.`);
  };

  const handleAddLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItemId) { setError('Pilih karyawan pada payroll terlebih dahulu.'); return; }
    await runAction(() => addPayrollLine({
      payrollItemId: selectedItemId, lineKind, lineCode: 'MANUAL', lineLabel: lineLabel.trim(),
      quantity: 1, unitLabel: null, rate: null, amount: Number(paymentAmountForLine()), notes: lineNotes.trim() || null,
    }), 'Komponen payroll berhasil ditambahkan.');
    setLineLabel(''); setLineAmount(''); setLineNotes('');
  };

  function paymentAmountForLine() { return lineAmount; }

  const handleCostAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allocationLineId || Number(allocationAmount) <= 0) {
      setError('Pilih rincian penghasilan dan masukkan nilai alokasi.');
      return;
    }
    await runAction(() => createPayrollCostAllocation({
      payrollLineId: allocationLineId,
      projectId: allocationProjectId || null,
      packageId: allocationPackageId || null,
      amount: Number(allocationAmount),
      notes: allocationNotes,
    }), 'Alokasi biaya payroll berhasil dicatat. Tidak ada transaksi kas baru yang dibuat.');
    setAllocationAmount(''); setAllocationNotes('');
  };

  const handlePieceworkShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!progressId || !pieceworkEmployeeId || Number(pieceworkQuantity) <= 0) { setError('Lengkapi progres, karyawan, dan volume pembagian.'); return; }
    await runAction(() => createPieceworkShare({ progressId, employeeId: pieceworkEmployeeId, quantity: Number(pieceworkQuantity), notes: pieceworkNotes }), 'Pembagian hasil borongan internal berhasil diajukan.');
    setPieceworkQuantity(''); setPieceworkNotes('');
  };



  const beginRetentionRelease = (balance: SubcontractRetentionBalance) => {
    const reserved = (data?.obligations ?? [])
      .filter((row) => row.source_type === 'subcontract_retention' && row.subcontract_retention_id === balance.id && row.status !== 'void')
      .reduce((sum, row) => sum + row.amount, 0);
    const available = Math.max(balance.retention_amount - Math.max(balance.released_amount, reserved), 0);
    setRetentionToRelease(balance);
    setRetentionReleaseAmount(String(available));
    setRetentionReleaseDueDate(balance.release_due_date ?? today());
    setRetentionReleaseNotes('');
    setError(''); setSuccess('');
  };

  const handleRetentionRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!retentionToRelease || Number(retentionReleaseAmount) <= 0) return;
    await runAction(() => createRetentionReleaseObligation({
      retentionBalanceId: retentionToRelease.id,
      amount: Number(retentionReleaseAmount),
      dueDate: retentionReleaseDueDate || null,
      notes: retentionReleaseNotes,
    }), 'Kewajiban pelepasan retensi dibuat. Silakan proses pada menu Pembayaran.');
    setRetentionToRelease(null);
  };

  const handleSubcontractClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClaimSegment) { setError('Pilih segmen kontrak subkontraktor.'); return; }
    if (isUnitClaim) {
      if (!selectedClaimProgress || Number(claimProgressQuantity) <= 0 || Number(claimProgressQuantity) > selectedClaimProgress.available_quantity) {
        setError('Pilih progres disetujui dan isi volume tidak melebihi sisa progres yang belum ditagihkan.'); return;
      }
    } else {
      if (!claimTermId || !selectedClaimTermSummary) { setError('Pilih termin aktif yang masih memiliki hak tagih.'); return; }
      if (Number(claimGross) <= 0 || Number(claimGross) > selectedClaimTermSummary.available_to_claim) {
        setError(`Nilai tagihan harus lebih dari nol dan tidak boleh melebihi sisa hak tagih ${money(selectedClaimTermSummary.available_to_claim)}.`); return;
      }
    }
    const retention = Number(claimRetention || 0);
    const deduction = Number(claimDeduction || 0);
    if (!Number.isFinite(retention) || retention < 0 || retention > maxClaimRetention + 0.01) {
      setError(`Retensi tidak boleh melebihi ${money(maxClaimRetention)} (${claimRetentionRate}% dari nilai bruto).`); return;
    }
    if (!Number.isFinite(deduction) || deduction < 0 || retention + deduction >= claimGrossBasis) {
      setError('Retensi dan potongan harus bernilai valid dan lebih kecil dari nilai bruto tagihan.'); return;
    }
    if (deduction > 0 && !claimNotes.trim()) { setError('Catatan atau bukti dasar potongan wajib diisi.'); return; }
    await runAction(() => submitSubcontractRequest({
      segmentId: claimSegmentId,
      termId: isUnitClaim ? null : claimTermId,
      requestDate: today(),
      grossAmount: isUnitClaim ? null : Number(claimGross),
      progressLines: isUnitClaim ? [{ progressEntryId: claimProgressId, quantity: Number(claimProgressQuantity) }] : [],
      retentionAmount: Number(claimRetention || 0),
      deductionAmount: Number(claimDeduction || 0),
      notes: claimNotes,
    }), 'Permintaan pembayaran subkontraktor berhasil diajukan. Nilai termin/progres sudah dipesan agar tidak dapat ditagihkan ganda.');
    setClaimProgressId(''); setClaimProgressQuantity(''); setClaimGross(''); setClaimTermId('');
    setClaimRetention('0'); setClaimDeduction('0'); setClaimNotes('');
  };

  const beginPayment = (obligation: PaymentObligation) => {
    setPaying(obligation);
    setPaymentDate(today());
    setPaymentAmount(String(Math.max(obligation.amount - obligation.paid_amount, 0)));
    setPaymentReference(''); setPaymentNotes(''); setError(''); setSuccess('');
  };

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paying || Number(paymentAmount) <= 0) return;
    await runAction(() => recordPayment({
      paymentDate, paymentMethod, referenceNumber: paymentReference,
      notes: paymentNotes, obligationId: paying.id, amount: Number(paymentAmount),
    }), 'Pembayaran berhasil dicatat dan dikirim ke buku kas Finance.');
    setPaying(null);
  };

  const reviewAction = async (kind: 'share' | 'request', id: string, decision: 'approved' | 'rejected') => {
    let reason: string | undefined;
    if (decision === 'rejected') {
      reason = window.prompt('Masukkan alasan penolakan:') ?? '';
      if (!reason.trim()) return;
    }
    await runAction(() => kind === 'share'
      ? reviewPieceworkShare(id, decision, reason)
      : reviewSubcontractRequest(id, decision, reason),
    decision === 'approved' ? 'Data berhasil disetujui.' : 'Data berhasil ditolak.');
  };

  const handleRunState = async (state: 'submit' | 'approve') => {
    if (!selectedRunId) return;
    await runAction(
      () => state === 'submit' ? submitPayrollRun(selectedRunId) : approvePayrollRun(selectedRunId),
      state === 'submit' ? 'Payroll berhasil diajukan untuk persetujuan.' : 'Payroll disetujui dan kewajiban pembayaran karyawan dibuat.',
    );
  };

  const openLegacyReconciliation = (request: SubcontractPaymentRequest) => {
    setLegacyRequest(request);
    setLegacyProgressId('');
    setLegacyProgressQuantity('');
    setLegacyProgressLines([]);
    setError(''); setSuccess('');
  };

  const addLegacyProgressLine = () => {
    if (!legacyRequest || !legacyProgressId || Number(legacyProgressQuantity) <= 0) return;
    if (legacyProgressLines.some((line) => line.progressEntryId === legacyProgressId)) {
      setError('Progres yang sama sudah ditambahkan.');
      return;
    }
    const available = data?.subcontractUnitProgress.find((row) => row.progress_entry_id === legacyProgressId)?.available_quantity ?? 0;
    if (Number(legacyProgressQuantity) > available) {
      setError(`Volume melebihi sisa progres tersedia (${available}).`);
      return;
    }
    setLegacyProgressLines((current) => [...current, { progressEntryId: legacyProgressId, quantity: Number(legacyProgressQuantity) }]);
    setLegacyProgressId(''); setLegacyProgressQuantity(''); setError('');
  };

  const legacyProgressGross = legacyProgressLines.reduce((sum, line) => {
    const progress = data?.subcontractUnitProgress.find((row) => row.progress_entry_id === line.progressEntryId);
    return sum + (progress ? Math.round(line.quantity * progress.unit_rate * 100) / 100 : 0);
  }, 0);

  const submitLegacyReconciliation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!legacyRequest || saving) return;
    if (Math.abs(legacyProgressGross - legacyRequest.gross_amount) > 0.01) {
      setError(`Total progres ${money(legacyProgressGross)} harus sama dengan bruto historis ${money(legacyRequest.gross_amount)}.`);
      return;
    }
    await runAction(() => reconcileLegacySubcontractRequest(legacyRequest.id, legacyProgressLines), 'Tagihan historis berhasil ditautkan ke progres yang disetujui.');
    setLegacyRequest(null);
  };

  const tabButton = (value: Tab, label: string, icon: ReactNode, count?: number) => (
    <button type="button" onClick={() => setTab(value)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === value ? 'bg-emerald-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      {icon}{label}{typeof count === 'number' && count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === value ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{count}</span>}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <Banknote className="h-4 w-4"/> Personalia · Pusat Penggajian & Pembayaran
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Penggajian & Pembayaran</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Kelola payroll karyawan, upah borongan internal, tagihan subkontraktor, dan pembayaran aktual dari satu pusat kendali.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/personalia" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard Personalia</Link>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Segarkan</button>
        </div>
      </header>

      {(error || success) && <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<span className="min-w-0 flex-1">{error || success}</span><button type="button" onClick={() => { setError(''); setSuccess(''); }} aria-label="Tutup"><X className="h-4 w-4"/></button>
      </div>}

      {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700"/> Memuat pusat penggajian...</div> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Sisa kewajiban · daftar terbaru" value={money(outstandingTotal)} detail={`${openObligations.length} kewajiban terbuka dari data termuat`} icon={<Wallet className="h-5 w-5 text-amber-700"/>}/>
          <SummaryCard title="Pembayaran · daftar terbaru" value={money(paidTotal)} detail={`${data?.payments.filter((row) => row.status === 'confirmed').length ?? 0} transaksi terkonfirmasi yang dimuat`} icon={<Banknote className="h-5 w-5 text-emerald-700"/>}/>
          <SummaryCard title="Payroll menunggu proses" value={String(data?.runs.filter((row) => ['draft','submitted'].includes(row.status)).length ?? 0)} detail="Draft atau menunggu persetujuan" icon={<FileText className="h-5 w-5 text-sky-700"/>}/>
          <SummaryCard title="Menunggu verifikasi · terbaru" value={String(pendingShares + pendingRequests)} detail={`${pendingShares} pembagian borongan · ${pendingRequests} tagihan subkon`} icon={<ClipboardCheck className="h-5 w-5 text-violet-700"/>}/>
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Menu penggajian">
          {tabButton('overview','Ringkasan',<Building2 className="h-4 w-4"/>)}
          {tabButton('payroll','Payroll Karyawan',<FileText className="h-4 w-4"/>)}
          {tabButton('piecework','Borongan Internal',<ClipboardCheck className="h-4 w-4"/>,pendingShares)}
          {tabButton('subcontract','Subkontraktor',<Building2 className="h-4 w-4"/>,pendingRequests)}
          {tabButton('allocations','Alokasi Biaya',<ArrowDownToLine className="h-4 w-4"/>)}
          {tabButton('payments','Pembayaran',<Wallet className="h-4 w-4"/>,openObligations.length)}
        </nav>

        {tab === 'overview' && <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h2 className="font-bold text-slate-900">Alur pembayaran JAVAWASTHU MANAGEMENT</h2><p className="mt-1 text-xs text-slate-500">Sumber perhitungan berbeda, register kewajiban dan kas tetap terintegrasi.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Satu pusat kendali</span></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <FlowCard title="Payroll internal" detail="Bulanan, harian, per jam, komponen, dan borongan internal." value={`${data?.runs.length ?? 0} payroll`} />
              <FlowCard title="Borongan internal" detail="Pembagian volume progres terverifikasi ke karyawan." value={`${data?.pieceworkShares.length ?? 0} pembagian`} />
              <FlowCard title="Subkontraktor" detail="Termin, tagihan progres, retensi, dan potongan kontrak." value={`${data?.subcontractRequests.length ?? 0} permintaan`} />
            </div>
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-blue-900"><strong>Prinsip kontrol:</strong> persetujuan payroll atau tagihan hanya membuat kewajiban pembayaran. Uang keluar baru tercatat setelah Finance merekam transaksi pembayaran. Setiap transaksi aktual dibuat satu kali pada buku kas Finance.</div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Pekerjaan yang perlu perhatian</h2>
            <div className="mt-4 space-y-3">
              <AttentionRow label="Payroll Draft" value={data?.runs.filter((r) => r.status === 'draft').length ?? 0} onClick={() => setTab('payroll')}/>
              <AttentionRow label="Pembagian borongan menunggu" value={pendingShares} onClick={() => setTab('piecework')}/>
              <AttentionRow label="Tagihan subkon menunggu" value={pendingRequests} onClick={() => setTab('subcontract')}/>
              <AttentionRow label="Kewajiban belum lunas" value={openObligations.length} onClick={() => setTab('payments')}/>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
            <h2 className="font-bold text-slate-900">Riwayat payroll terbaru</h2>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Nomor payroll</th><th className="px-3 py-3">Periode</th><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Nilai bersih</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.runs ?? []).slice(0,8).map((run) => <tr key={run.id}><td className="px-3 py-3 font-semibold text-emerald-800">{run.run_number}</td><td className="px-3 py-3">{run.period?.period_code ?? '—'}</td><td className="px-3 py-3">{run.total_employees}</td><td className="px-3 py-3 font-semibold">{money(run.total_net)}</td><td className="px-3 py-3"><StatusPill value={run.status} label={runLabel[run.status]}/></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => { setSelectedRunId(run.id); setTab('payroll'); }} className="text-xs font-semibold text-emerald-700 hover:underline">Buka rincian</button></td></tr>)}{(data?.runs.length ?? 0)===0 && <EmptyRow colSpan={6} text="Belum ada payroll yang dibuat."/>}</tbody></table></div>
          </section>
        </div>}

        {tab === 'payroll' && <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div><h2 className="font-bold text-slate-900">Bangun payroll bulanan</h2><p className="mt-1 text-xs leading-5 text-slate-500">Sistem mengambil tarif, absensi terverifikasi, komponen rutin, dan pembagian borongan internal yang sudah disetujui.</p></div>
              {canManage && <form onSubmit={handleBuildPayroll} className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className={LABEL}>Periode<input type="month" required value={month} onChange={(e) => setMonth(e.target.value)} className={INPUT}/></label><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-4 w-4"/>{saving ? 'Memproses...' : 'Bangun Payroll'}</button></form>}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h2 className="font-bold text-slate-900">Daftar payroll</h2><p className="mt-1 text-xs text-slate-500">Pilih payroll untuk melihat karyawan dan rincian penghasilannya.</p></div><select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} className={`${INPUT} sm:mt-0 sm:w-[340px]`}><option value="">Pilih payroll</option>{(data?.runs ?? []).map((run) => <option key={run.id} value={run.id}>{run.run_number} · {run.period?.period_code ?? 'Periode'} · {runLabel[run.status]}</option>)}</select></div>
            {selectedRun && <div className="mt-4 grid gap-3 sm:grid-cols-4"><MiniMetric label="Karyawan" value={String(selectedRun.total_employees)}/><MiniMetric label="Bruto" value={money(selectedRun.total_gross)}/><MiniMetric label="Potongan" value={money(selectedRun.total_deductions)}/><MiniMetric label="Bersih" value={money(selectedRun.total_net)}/></div>}
            {selectedRun && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><div className="flex items-center gap-2"><StatusPill value={selectedRun.status} label={runLabel[selectedRun.status]}/><span className="text-xs text-slate-500">{selectedRun.run_number}</span></div><div className="flex flex-wrap gap-2">{canManage && selectedRun.status==='draft' && <button type="button" disabled={saving} onClick={() => void handleRunState('submit')} className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Ajukan Payroll</button>}{canManage && selectedRun.status==='submitted' && <button type="button" disabled={saving} onClick={() => void handleRunState('approve')} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Setujui Payroll & Buat Kewajiban</button>}</div></div>}
          </section>
          {selectedRun && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Pengelompokan karyawan</h2><p className="mt-1 text-xs text-slate-500">Pilih kelompok berdasarkan dasar pembayaran untuk meninjau payroll secara terarah.</p></div><select value={basisFilter} onChange={(e)=>setBasisFilter(e.target.value as typeof basisFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Semua dasar upah</option><option value="monthly">Bulanan</option><option value="daily">Harian</option><option value="hourly">Per jam</option><option value="piecework">Borongan / hasil</option><option value="mixed">Campuran</option></select></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{basisSummary.map((group)=><button type="button" key={group.basis} onClick={()=>setBasisFilter(group.basis)} className={`rounded-xl border p-3 text-left ${basisFilter===group.basis?'border-emerald-300 bg-emerald-50':'border-slate-200 hover:bg-slate-50'}`}><p className="text-xs font-semibold capitalize text-slate-600">{group.basis==='piecework'?'Borongan / hasil':group.basis==='hourly'?'Per jam':group.basis==='monthly'?'Bulanan':group.basis==='daily'?'Harian':'Campuran'}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{group.count} orang</p><p className="text-[10px] text-slate-500">Bersih {money(group.net)}</p></button>)}</div></section>}

          {selectedRun && <PayrollPdfExports run={selectedRun} items={items} lines={lines} />}
          {selectedRun && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h2 className="font-bold text-slate-900">Rincian karyawan</h2><p className="mt-1 text-xs text-slate-500">Item dengan peringatan wajib diperiksa sebelum payroll diajukan.</p></div><label className="relative block sm:w-[280px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau nomor karyawan" className={`${INPUT} pl-9`}/></label></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={filteredItems.length>0&&filteredItems.every((item)=>selectedPayrollItemIds.includes(item.id))} onChange={(e)=>setSelectedPayrollItemIds((current)=>e.target.checked?[...new Set([...current,...filteredItems.map((item)=>item.id)])]:current.filter((id)=>!filteredItems.some((item)=>item.id===id)))} className="h-4 w-4 rounded border-slate-300 text-emerald-700"/>Pilih seluruh hasil filter</label><div className="flex items-center gap-2"><span className="text-xs text-slate-500">{selectedPayrollItemIds.length} dipilih</span><button type="button" onClick={()=>setSelectedPayrollItemIds([])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Bersihkan</button><button type="button" onClick={()=>void handleBulkReview()} disabled={saving||!canManage||!selectedPayrollItemIds.length} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Tandai diperiksa massal</button></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[930px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3"><span className="sr-only">Pilih</span></th><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Dasar</th><th className="px-3 py-3">Penghasilan</th><th className="px-3 py-3">Potongan</th><th className="px-3 py-3">Bersih</th><th className="px-3 py-3">Pemeriksaan</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{filteredItems.map((item) => <tr key={item.id} className="align-top"><td className="px-3 py-3"><input type="checkbox" aria-label={`Pilih ${item.employee?.full_name ?? 'karyawan'}`} checked={selectedPayrollItemIds.includes(item.id)} onChange={(e)=>setSelectedPayrollItemIds((current)=>e.target.checked?[...current,item.id]:current.filter((id)=>id!==item.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700"/></td><td className="px-3 py-3"><p className="font-semibold text-slate-900">{item.employee?.full_name ?? 'Karyawan'}</p><p className="text-xs text-slate-500">{item.employee?.employee_number ?? item.item_number}</p></td><td className="px-3 py-3"><p className="capitalize">{item.pay_basis}</p><p className="text-xs text-slate-500">{item.work_units} {item.unit_label}</p></td><td className="px-3 py-3 font-medium">{money(item.earning_total)}</td><td className="px-3 py-3">{money(item.deduction_total)}</td><td className="px-3 py-3 font-bold text-slate-900">{money(item.net_amount)}</td><td className="px-3 py-3"><StatusPill value={item.calculation_status} label={item.calculation_status==='needs_review'?'Perlu diperiksa':item.calculation_status==='reviewed'?'Diperiksa':'Siap'}/>{item.warnings?.length>0 && <p className="mt-1 max-w-[230px] text-[10px] text-amber-700">{item.warnings.map((w) => w.message).join(' ')}</p>}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => setSelectedItemId(item.id)} className="text-xs font-semibold text-emerald-700 hover:underline">Pilih rincian</button>{canManage && item.calculation_status==='needs_review' && <button type="button" onClick={() => { const note = window.prompt('Catatan pemeriksaan HR (wajib):'); if (note?.trim()) void runAction(() => markPayrollItemReviewed(item.id,note), 'Item payroll ditandai sudah diperiksa.'); }} className="mt-1 block text-xs font-semibold text-amber-700 hover:underline">Tandai diperiksa</button>}</td></tr>)}{filteredItems.length===0 && <EmptyRow colSpan={8} text="Belum ada rincian karyawan pada payroll ini."/>}</tbody></table></div>
          </section>}
          {selectedRun && selectedRun.status==='draft' && canManage && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Tambah komponen manual</h2><p className="mt-1 text-xs text-slate-500">Gunakan untuk insentif, lembur terverifikasi, koreksi, atau komponen manual yang belum dihitung otomatis.</p><form onSubmit={handleAddLine} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className={LABEL}>Karyawan<select required value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className={INPUT}><option value="">Pilih item payroll</option>{items.map((item) => <option key={item.id} value={item.id}>{item.employee?.employee_number} — {item.employee?.full_name}</option>)}</select></label><label className={LABEL}>Jenis<select value={lineKind} onChange={(e) => setLineKind(e.target.value as 'earning'|'deduction')} className={INPUT}><option value="earning">Penghasilan</option><option value="deduction">Potongan</option></select></label><label className={LABEL}>Uraian<input required value={lineLabel} onChange={(e) => setLineLabel(e.target.value)} placeholder="Contoh: Insentif" className={INPUT}/></label><label className={LABEL}>Nominal<input required min="0" type="number" step="1" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} className={INPUT}/></label><div className="flex items-end"><button disabled={saving} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Tambah Rincian</button></div><label className={`${LABEL} sm:col-span-2 lg:col-span-5`}>Catatan<textarea rows={2} value={lineNotes} onChange={(e) => setLineNotes(e.target.value)} className={INPUT}/></label></form></section>}
          {selectedItemId && <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"><div className="flex items-center justify-between"><h3 className="font-bold text-emerald-950">Rincian komponen payroll</h3><button type="button" onClick={() => setSelectedItemId('')} className="text-xs text-slate-500 hover:underline">Tutup</button></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-2">Jenis</th><th className="py-2">Komponen</th><th className="py-2">Kuantitas</th><th className="py-2 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-emerald-100">{lines.filter((line) => line.payroll_item_id===selectedItemId).map((line) => <tr key={line.id}><td className="py-2">{line.line_kind==='earning'?'Penghasilan':'Potongan'}</td><td className="py-2">{line.line_label}</td><td className="py-2">{line.quantity} {line.unit_label ?? ''}</td><td className="py-2 text-right font-semibold">{money(line.amount)}</td></tr>)}{lines.filter((line) => line.payroll_item_id===selectedItemId).length===0 && <tr><td colSpan={4} className="py-4 text-center text-xs text-slate-500">Belum ada rincian.</td></tr>}</tbody></table></div></section>}
        </div>}

        {tab === 'piecework' && <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1"><h2 className="font-bold text-slate-900">Pembagian hasil borongan internal</h2><p className="mt-1 text-xs leading-5 text-slate-500">Pilih progres yang sudah disetujui dari segmen internal_piecework, kemudian bagikan volume kepada karyawan internal.</p><form onSubmit={handlePieceworkShare} className="mt-4 space-y-3"><label className={LABEL}>Progres pekerjaan<select required value={progressId} onChange={(e) => setProgressId(e.target.value)} className={INPUT}><option value="">Pilih progres disetujui</option>{(data?.pieceworkProgress ?? []).map((p) => <option key={p.id} value={p.id}>{p.project_label} · {p.item_label} · {p.quantity_approved} · {dateLabel(p.report_date)}</option>)}</select></label><label className={LABEL}>Karyawan<select required value={pieceworkEmployeeId} onChange={(e) => setPieceworkEmployeeId(e.target.value)} className={INPUT}><option value="">Pilih karyawan</option>{(data?.employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.full_name}</option>)}</select></label><label className={LABEL}>Volume bagian pekerja<input required type="number" min="0.001" step="0.001" value={pieceworkQuantity} onChange={(e) => setPieceworkQuantity(e.target.value)} className={INPUT}/></label><label className={LABEL}>Catatan<textarea rows={2} value={pieceworkNotes} onChange={(e) => setPieceworkNotes(e.target.value)} className={INPUT}/></label><button disabled={saving || !canManage} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Ajukan Pembagian Hasil</button></form><p className="mt-3 text-[11px] leading-5 text-slate-500">Nilai rupiah diambil dari unit_rate segmen pelaksanaan dan dihitung ulang oleh database. Pembagian tidak boleh melebihi volume progres yang disetujui.</p></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Riwayat pembagian</h2><p className="mt-1 text-xs text-slate-500">Pembagian approved akan masuk payroll karyawan pada periode laporan progres.</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{pendingShares} menunggu</span></div><div className="mt-4 space-y-2">{(data?.pieceworkShares ?? []).map((share) => <div key={share.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-900">{share.employee?.full_name ?? 'Karyawan'} <span className="text-xs font-normal text-slate-400">· {share.share_number}</span></p><p className="mt-1 text-xs text-slate-500">{share.quantity_share} unit × {money(share.unit_rate_snapshot)} = <strong className="text-slate-800">{money(share.amount)}</strong></p>{share.rejection_reason && <p className="mt-1 text-xs text-rose-700">Alasan: {share.rejection_reason}</p>}</div><div className="flex items-center gap-2"><StatusPill value={share.status} label={share.status==='submitted'?'Menunggu':share.status==='approved'?'Disetujui':'Ditolak'}/>{canManage && share.status==='submitted' && <><button type="button" disabled={saving} onClick={() => void reviewAction('share',share.id,'approved')} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white">Setujui</button><button type="button" disabled={saving} onClick={() => void reviewAction('share',share.id,'rejected')} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700">Tolak</button></>}</div></div>)}{(data?.pieceworkShares.length ?? 0)===0 && <EmptyPanel text="Belum ada pembagian borongan internal."/>}</div></section>
        </div>}

        {tab === 'subcontract' && <div className="grid gap-4 xl:grid-cols-2">
          {data && <SubcontractPdfExports contracts={data.subcontractContracts} segments={data.subcontractSegments} requests={data.subcontractRequests} terms={data.subcontractTerms} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div><h2 className="font-bold text-slate-900">Register kontrak dan jadwal termin</h2><p className="mt-1 text-xs text-slate-500">Kontrak dan jadwal termin dikelola pada Pusat Pelaksanaan Pekerjaan. Di sini HR/Project/Finance memantau hak tagih, tagihan, kewajiban, dan pembayaran.</p></div>
              <Link href="/proyek" className="text-xs font-semibold text-emerald-700 hover:underline">Buka daftar proyek</Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1450px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Proyek / Paket / Kontrak</th><th className="px-3 py-3">Termin</th><th className="px-3 py-3">Nilai dasar</th><th className="px-3 py-3">Nilai termin</th><th className="px-3 py-3">Terpesan</th><th className="px-3 py-3">Disetujui</th><th className="px-3 py-3">Kewajiban</th><th className="px-3 py-3">Dibayar</th><th className="px-3 py-3">Sisa kewajiban</th><th className="px-3 py-3">Hak tagih tersedia</th><th className="px-3 py-3">Jatuh tempo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.subcontractTermSummaries ?? []).map((term) => {
                    const segment = data?.subcontractSegments.find((row) => row.id === term.segment_id);
                    const contract = data?.subcontractContracts.find((row) => row.id === term.contract_register_id);
                    const outstanding = Math.max(Number(term.obligation_amount) - Number(term.paid_amount), 0);
                    return <tr key={term.term_id}>
                      <td className="px-3 py-3"><p className="font-semibold text-slate-900">{segment?.subcontractor?.legal_name ?? 'Subkontraktor'}</p><p className="text-xs text-slate-500">{segment?.package?.project?.title ?? 'Proyek'} · {segment?.package?.package_name ?? 'Paket'}</p><p className="text-[10px] text-slate-400">{contract?.contract_number ?? 'Register belum ditemukan'} · {contract?.contract_title ?? segment?.segment_number ?? 'Segmen'}</p>{segment?.package?.project_id && <Link href={`/proyek/${segment.package.project_id}/pelaksanaan-pekerjaan`} className="mt-1 inline-block text-[10px] font-semibold text-emerald-700 hover:underline">Buka kontrak dan pelaksanaan</Link>}</td>
                      <td className="px-3 py-3"><p className="font-semibold">{term.term_name}</p><p className="text-[10px] text-slate-500">{term.term_number} · {term.calculation_basis === 'percentage' ? `${term.percentage}%` : 'Nilai tetap'}</p></td>
                      <td className="px-3 py-3 tabular-nums">{money(term.base_amount_snapshot)}</td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{money(term.term_amount_snapshot)}</td>
                      <td className="px-3 py-3 tabular-nums">{money(term.reserved_gross)}</td>
                      <td className="px-3 py-3 tabular-nums">{money(term.approved_gross)}</td>
                      <td className="px-3 py-3 tabular-nums">{money(term.obligation_amount)}</td>
                      <td className="px-3 py-3 tabular-nums">{money(term.paid_amount)}</td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{money(outstanding)}</td>
                      <td className="px-3 py-3 font-bold tabular-nums text-emerald-700">{money(term.available_to_claim)}</td>
                      <td className="px-3 py-3 text-xs">{dateLabel(term.due_date)}<p className="mt-1 text-[10px] text-slate-400">{term.trigger_description || 'Tidak ada pemicu'}</p></td>
                    </tr>;
                  })}
                  {(data?.subcontractTermSummaries.length ?? 0) === 0 && <EmptyRow colSpan={11} text="Belum ada jadwal termin. Buat kontrak dan termin di Pusat Pelaksanaan Pekerjaan pada proyek terkait."/>}
                </tbody>
              </table>
            </div>
            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[11px] leading-5 text-blue-900">Kolom Terpesan mencakup tagihan berstatus menunggu pemeriksaan dan disetujui. Karena nilai ini langsung mengurangi hak tagih tersedia, dua pengajuan tidak dapat memesan bagian termin yang sama.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Ajukan tagihan subkontraktor</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Harga satuan wajib memilih progres yang telah disetujui. Lump sum/all-in wajib memilih termin kontrak aktif.</p>
            <form onSubmit={handleSubcontractClaim} className="mt-4 space-y-3">
              <label className={LABEL}>Segmen pelaksanaan
                <select required value={claimSegmentId} onChange={(e) => { const id = e.target.value; const seg = data?.subcontractSegments.find((row) => row.id === id); setClaimSegmentId(id); setClaimTermId(''); setClaimProgressId(''); setClaimProgressQuantity(''); setClaimGross(''); setClaimRetention('0'); }} className={INPUT}>
                  <option value="">Pilih kontrak / segmen</option>
                  {(data?.subcontractSegments ?? []).filter((seg) => ['active','closed'].includes(seg.status)).map((seg) => <option key={seg.id} value={seg.id}>{seg.segment_number} · {seg.subcontractor?.legal_name ?? 'Subkontraktor'} · {seg.execution_method} · {seg.package?.project?.title ?? 'Proyek'}</option>)}
                </select>
              </label>
              {isUnitClaim ? <>
                <label className={LABEL}>Progres terverifikasi yang belum ditagihkan
                  <select required value={claimProgressId} onChange={(e) => { setClaimProgressId(e.target.value); setClaimProgressQuantity(''); }} className={INPUT}>
                    <option value="">Pilih progres disetujui</option>
                    {(data?.subcontractUnitProgress ?? []).filter((row) => row.segment_id === claimSegmentId && row.available_quantity > 0).map((row) => <option key={row.progress_entry_id} value={row.progress_entry_id}>{row.item_name} · {dateLabel(row.report_date)} · tersedia {row.available_quantity} {row.unit} · {money(row.available_value)}</option>)}
                  </select>
                </label>
                {selectedClaimProgress && <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs"><div className="flex justify-between"><span className="text-slate-600">Volume disetujui</span><strong>{selectedClaimProgress.quantity_approved} {selectedClaimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-600">Sudah ditagihkan / dipesan</span><strong>{selectedClaimProgress.claimed_quantity} {selectedClaimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-600">Sisa volume tersedia</span><strong className="text-emerald-700">{selectedClaimProgress.available_quantity} {selectedClaimProgress.unit}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-600">Tarif kontrak</span><strong>{money(selectedClaimProgress.unit_rate)} / {selectedClaimProgress.unit}</strong></div></div>}
                <label className={LABEL}>Volume yang ditagihkan<input required type="number" min="0.001" max={selectedClaimProgress?.available_quantity ?? undefined} step="0.001" value={claimProgressQuantity} onChange={(e) => setClaimProgressQuantity(e.target.value)} disabled={!selectedClaimProgress} className={INPUT}/></label>
                <div className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between text-xs"><span className="text-slate-500">Estimasi bruto tagihan</span><strong className="text-slate-900">{money(unitClaimGrossPreview)}</strong></div><p className="mt-1 text-[10px] text-slate-500">Nilai final dihitung kembali oleh database dari progres disetujui × tarif snapshot segmen.</p></div>
              </> : <>
                <label className={LABEL}>Termin kontrak
                  <select required value={claimTermId} onChange={(e) => setClaimTermId(e.target.value)} className={INPUT} disabled={!claimSegmentId}>
                    <option value="">Pilih termin aktif</option>
                    {(data?.subcontractTermSummaries ?? []).filter((term) => term.segment_id === claimSegmentId && term.status === 'active' && term.available_to_claim > 0).map((term) => <option key={term.term_id} value={term.term_id}>{term.term_name} · plafon {money(term.term_amount_snapshot)} · tersedia {money(term.available_to_claim)}</option>)}
                  </select>
                </label>
                {selectedClaimTermSummary && <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs"><div className="flex justify-between"><span className="text-slate-600">Nilai termin snapshot</span><strong>{money(selectedClaimTermSummary.term_amount_snapshot)}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-600">Sudah terpesan</span><strong>{money(selectedClaimTermSummary.reserved_gross)}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-600">Hak tagih tersedia</span><strong className="text-emerald-700">{money(selectedClaimTermSummary.available_to_claim)}</strong></div><p className="mt-1 text-[10px] text-slate-500">Jatuh tempo {dateLabel(selectedClaimTermSummary.due_date)} · {selectedClaimTermSummary.trigger_description || 'Tidak ada pemicu tambahan'}</p></div>}
                <label className={LABEL}>Nilai bruto tagihan<input required type="number" min="1" max={selectedClaimTermSummary?.available_to_claim ?? undefined} step="1" value={claimGross} onChange={(e) => setClaimGross(e.target.value)} disabled={!selectedClaimTermSummary} className={INPUT}/></label>
              </>}
              <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Retensi (Rp)<input type="number" min="0" max={maxClaimRetention} step="1" value={claimRetention} onChange={(e) => setClaimRetention(e.target.value)} className={INPUT}/><span className="text-[10px] font-normal text-slate-400">Maksimum {money(maxClaimRetention)} ({claimRetentionRate}% dari bruto). Retensi tidak otomatis dipotong penuh.</span></label><label className={LABEL}>Potongan (Rp)<input type="number" min="0" step="1" value={claimDeduction} onChange={(e) => setClaimDeduction(e.target.value)} className={INPUT}/><span className="text-[10px] font-normal text-slate-400">Isi alasan/bukti pada catatan jika ada potongan.</span></label></div>
              <label className={LABEL}>Catatan / referensi bukti<textarea required rows={3} value={claimNotes} onChange={(e) => setClaimNotes(e.target.value)} placeholder="Nomor berita acara, referensi progres, atau dasar potongan..." className={INPUT}/></label>
              <button disabled={saving || !canManage || !claimSegmentId || (isUnitClaim ? unitClaimGrossPreview <= 0 : !selectedClaimTermSummary || Number(claimGross) <= 0)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Ajukan Tagihan</button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Panduan sumber tagihan</h2>
            <div className="mt-3 space-y-3 text-xs leading-5">
              <div className="rounded-lg bg-slate-50 p-3"><strong>Subkontraktor harga satuan</strong><p className="text-slate-600">Tagihan berasal dari volume progres yang disetujui. Setiap progres mempunyai kuantitas yang bisa ditagihkan, sehingga tidak dapat digunakan dua kali.</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><strong>Subkontraktor lump sum / all-in</strong><p className="text-slate-600">Tagihan wajib ditautkan ke termin yang dibuat pada Pusat Pelaksanaan Pekerjaan. Batas tagihan ditentukan oleh snapshot nilai termin.</p></div>
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900"><strong>Pembayaran bukan persetujuan tagihan.</strong><p>Persetujuan membuat kewajiban pembayaran. Kas keluar baru tercatat ketika Finance memproses pembayaran aktual.</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex justify-between gap-3"><div><h2 className="font-bold text-slate-900">Permintaan pembayaran subkontraktor</h2><p className="mt-1 text-xs text-slate-500">Permintaan yang disetujui membentuk kewajiban pembayaran; pembayaran aktual tetap dilakukan melalui Finance.</p></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Nomor / Kontrak</th><th className="px-3 py-3">Pelaksana / Segmen</th><th className="px-3 py-3">Dasar tagihan</th><th className="px-3 py-3">Bruto</th><th className="px-3 py-3">Retensi & potongan</th><th className="px-3 py-3">Bersih</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.subcontractRequests ?? []).map((req) => { const seg=data?.subcontractSegments.find((s)=>s.id===req.segment_id); const term=data?.subcontractTerms.find((t)=>t.id===req.term_id); return <tr key={req.id}><td className="px-3 py-3 font-semibold text-emerald-800">{req.request_number}<p className="text-[10px] font-normal text-slate-400">{dateLabel(req.request_date)}</p><p className="text-[10px] font-medium text-slate-500">{data?.subcontractContracts.find((c) => c.id === req.contract_register_id)?.contract_number ?? 'Kontrak lama'}</p>{req.legacy_unlinked_progress && <p className="mt-1 text-[10px] font-semibold text-amber-700">{req.legacy_reconciled_at ? 'Tagihan historis · progres sudah direkonsiliasi' : 'Tagihan historis · perlu rekonsiliasi progres'}</p>}</td><td className="px-3 py-3">{seg?.subcontractor?.legal_name ?? 'Subkontraktor'}<p className="text-xs text-slate-500">{seg?.segment_number} · {seg?.package?.package_name}</p><p className="text-[10px] text-slate-400">{seg?.package?.project?.title ?? 'Proyek'}</p></td><td className="px-3 py-3 text-xs">{seg?.execution_method === 'subcontract_unit' ? 'Progres harga satuan' : term?.term_name ?? 'Termin tidak ditemukan'}</td><td className="px-3 py-3">{money(req.gross_amount)}</td><td className="px-3 py-3 text-xs">{money(req.retention_amount)} + {money(req.deduction_amount)}</td><td className="px-3 py-3 font-bold">{money(req.net_amount)}</td><td className="px-3 py-3"><StatusPill value={req.status} label={req.status==='submitted'?'Menunggu':req.status==='approved'?'Disetujui':req.status==='rejected'?'Ditolak':req.status}/></td><td className="px-3 py-3 text-right">{canManage && <div className="flex justify-end gap-1">{req.legacy_unlinked_progress && !req.legacy_reconciled_at && ['submitted','approved'].includes(req.status) && <button type="button" disabled={saving} onClick={()=>openLegacyReconciliation(req)} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800">Rekonsiliasi progres</button>}{req.status==='submitted' && <><button type="button" disabled={saving} onClick={()=>void reviewAction('request',req.id,'approved')} className="rounded-lg bg-emerald-700 px-2 py-1.5 text-xs font-bold text-white">Setujui</button><button type="button" disabled={saving} onClick={()=>void reviewAction('request',req.id,'rejected')} className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs text-rose-700">Tolak</button></>}</div>}</td></tr>; })}{(data?.subcontractRequests.length ?? 0)===0 && <EmptyRow colSpan={8} text="Belum ada permintaan pembayaran subkontraktor."/>}</tbody></table></div></section>
        </div>}

          {tab === 'subcontract' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div><h2 className="font-bold text-slate-900">Retensi subkontraktor</h2><p className="mt-1 text-xs text-slate-500">Pelepasan retensi membuat kewajiban baru. Pembayaran aktual tetap dilakukan melalui Finance.</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{data?.retentionBalances.length ?? 0} saldo</span>
            </div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Pelaksana / Paket</th><th className="px-3 py-3">Retensi</th><th className="px-3 py-3">Sudah dibayar</th><th className="px-3 py-3">Jatuh tempo</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.retentionBalances ?? []).map((balance) => {
              const reserved = (data?.obligations ?? []).filter((row) => row.source_type === 'subcontract_retention' && row.subcontract_retention_id === balance.id && row.status !== 'void').reduce((sum, row) => sum + row.amount, 0);
              const available = Math.max(balance.retention_amount - Math.max(balance.released_amount, reserved), 0);
              return <tr key={balance.id}><td className="px-3 py-3 font-semibold">{balance.segment?.subcontractor?.legal_name ?? 'Subkontraktor'}<p className="text-xs font-normal text-slate-500">{balance.segment?.segment_number} · {balance.segment?.package?.package_name ?? 'Paket pekerjaan'} · {balance.segment?.package?.project?.title ?? 'Proyek'}</p></td><td className="px-3 py-3">{money(balance.retention_amount)}</td><td className="px-3 py-3">{money(balance.released_amount)}</td><td className="px-3 py-3">{dateLabel(balance.release_due_date)}</td><td className="px-3 py-3"><StatusPill value={balance.status} label={balance.status==='held'?'Ditahan':balance.status==='partially_released'?'Sebagian dilepas':'Lunas dilepas'}/><p className="mt-1 text-[10px] text-slate-500">Sisa belum dialokasikan: {money(available)}</p></td><td className="px-3 py-3 text-right">{canManage && available > 0.009 && <button type="button" disabled={saving} onClick={() => beginRetentionRelease(balance)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Ajukan pelepasan</button>}</td></tr>;
            })}{(data?.retentionBalances.length ?? 0)===0 && <EmptyRow colSpan={6} text="Belum ada saldo retensi yang terbentuk dari tagihan disetujui."/>}</tbody></table></div>
          </section>}

        {tab === 'allocations' && <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start"><div><h2 className="font-bold text-slate-900">Alokasi biaya penghasilan ke proyek</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Bagikan nilai satu rincian penghasilan ke satu atau beberapa proyek/paket RAB. Ini hanya atribusi biaya untuk laporan proyek; nilai gaji karyawan dan transaksi kas tidak berubah.</p></div>{selectedRun && <StatusPill value={selectedRun.status} label={runLabel[selectedRun.status]}/>}</div>
            {selectedRun && selectedRun.status === 'draft' && canManage ? <form onSubmit={handleCostAllocation} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className={`${LABEL} xl:col-span-2`}>Rincian penghasilan<select required value={allocationLineId} onChange={(e) => setAllocationLineId(e.target.value)} className={INPUT}><option value="">Pilih rincian payroll</option>{lines.filter((line) => line.line_kind === 'earning').map((line) => { const item=items.find((row)=>row.id===line.payroll_item_id); const allocated=(data?.costAllocations ?? []).filter((a)=>a.payroll_line_id===line.id && a.status==='active').reduce((sum,a)=>sum+a.amount,0); return <option key={line.id} value={line.id}>{item?.employee?.full_name ?? 'Karyawan'} · {line.line_label} · Sisa {money(Math.max(line.amount-allocated,0))}</option>; })}</select></label>
              <label className={LABEL}>Proyek<select value={allocationProjectId} onChange={(e) => { setAllocationProjectId(e.target.value); setAllocationPackageId(''); }} className={INPUT}><option value="">Overhead / biaya kantor</option>{(data?.projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
              <label className={LABEL}>Paket RAB (opsional)<select value={allocationPackageId} onChange={(e) => setAllocationPackageId(e.target.value)} disabled={!allocationProjectId} className={INPUT}><option value="">Seluruh proyek / tanpa paket</option>{(data?.packages ?? []).filter((pkg)=>pkg.project_id===allocationProjectId).map((pkg)=><option key={pkg.id} value={pkg.id}>{pkg.package_name}</option>)}</select></label>
              <label className={LABEL}>Nilai alokasi (Rp)<input required type="number" min="1" step="1" value={allocationAmount} onChange={(e)=>setAllocationAmount(e.target.value)} className={INPUT}/></label>
              <label className={`${LABEL} sm:col-span-2 xl:col-span-4`}>Catatan dasar alokasi<textarea rows={2} value={allocationNotes} onChange={(e)=>setAllocationNotes(e.target.value)} placeholder="Contoh: alokasi berdasarkan 40 jam pekerjaan pada proyek ini" className={INPUT}/></label>
              <div className="flex items-end"><button disabled={saving || !allocationLineId || Number(allocationAmount)<=0} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Simpan Alokasi</button></div>
            </form> : <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Pilih payroll berstatus Draft dan pastikan Anda memiliki kewenangan payroll.manage untuk menambah atau mengoreksi alokasi. Payroll yang sudah diajukan dikunci.</div>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Riwayat alokasi biaya</h2><p className="mt-1 text-xs text-slate-500">Jumlah alokasi aktif untuk satu rincian tidak boleh melampaui nominal penghasilannya.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Karyawan / Rincian</th><th className="px-3 py-3">Tujuan biaya</th><th className="px-3 py-3">Nominal</th><th className="px-3 py-3">Catatan</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.costAllocations ?? []).map((allocation)=>{ const line=lines.find((row)=>row.id===allocation.payroll_line_id); const item=items.find((row)=>row.id===line?.payroll_item_id); return <tr key={allocation.id}><td className="px-3 py-3 font-semibold">{item?.employee?.full_name ?? 'Karyawan / payroll lain'}<p className="text-xs font-normal text-slate-500">{line?.line_label ?? 'Rincian penghasilan'} · {item?.item_number ?? ''}</p></td><td className="px-3 py-3">{allocation.project?.title ?? (allocation.project_id ? 'Proyek' : 'Overhead / kantor')}<p className="text-xs text-slate-500">{allocation.package?.package_name ?? 'Tanpa paket khusus'}</p></td><td className="px-3 py-3 font-bold">{money(allocation.amount)}</td><td className="px-3 py-3 text-xs text-slate-500">{allocation.notes ?? '—'}</td><td className="px-3 py-3"><StatusPill value={allocation.status} label={allocation.status==='active'?'Aktif':'Dikoreksi'}/></td><td className="px-3 py-3 text-right">{canManage && allocation.status==='active' && selectedRun?.status==='draft' && <button type="button" disabled={saving} onClick={()=>{const reason=window.prompt('Alasan koreksi alokasi:'); if(reason?.trim()) void runAction(()=>voidPayrollCostAllocation(allocation.id,reason),'Alokasi biaya dikoreksi.');}} className="text-xs font-semibold text-rose-700 hover:underline">Koreksi</button>}</td></tr>; })}{(data?.costAllocations.length ?? 0)===0 && <EmptyRow colSpan={6} text="Belum ada alokasi biaya payroll."/>}</tbody></table></div>
          </section>
        </div>}

        {tab === 'payments' && <div className="space-y-4">
          {data && <PayrollPaymentPdfExports payments={data.payments} projects={data.projects} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Register kewajiban pembayaran</h2><p className="mt-1 text-xs text-slate-500">Kewajiban berasal dari payroll, tagihan subkontraktor, atau pelepasan retensi yang disetujui.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{openObligations.length} belum lunas</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Kewajiban</th><th className="px-3 py-3">Penerima</th><th className="px-3 py-3">Sumber / Proyek</th><th className="px-3 py-3">Nilai</th><th className="px-3 py-3">Dibayar</th><th className="px-3 py-3">Sisa</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.obligations ?? []).map((o) => <tr key={o.id}><td className="px-3 py-3 font-semibold text-emerald-800">{o.obligation_number}<p className="max-w-[220px] truncate text-[10px] font-normal text-slate-500">{o.description}</p></td><td className="px-3 py-3">{o.payee_type==='employee'?o.employee?.full_name:o.subcontractor?.legal_name}<p className="text-[10px] text-slate-500">{o.payee_type==='employee'?o.employee?.employee_number:'Subkontraktor'}</p></td><td className="px-3 py-3 text-xs">{o.source_type==='payroll_item'?'Payroll Karyawan':o.source_type==='subcontract_retention'?'Pelepasan Retensi':'Tagihan Subkontraktor'}<p className="text-slate-500">{o.project?.title ?? 'Overhead / umum'}</p></td><td className="px-3 py-3">{money(o.amount)}</td><td className="px-3 py-3">{money(o.paid_amount)}</td><td className="px-3 py-3 font-bold">{money(o.amount-o.paid_amount)}</td><td className="px-3 py-3"><StatusPill value={o.status} label={obligationLabel[o.status]}/></td><td className="px-3 py-3 text-right">{canPay && ['open','partially_paid'].includes(o.status) && <button type="button" onClick={()=>beginPayment(o)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Bayar</button>}</td></tr>)}{(data?.obligations.length ?? 0)===0 && <EmptyRow colSpan={8} text="Belum ada kewajiban pembayaran yang disetujui."/>}</tbody></table></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Riwayat transaksi pembayaran</h2><p className="mt-1 text-xs text-slate-500">Setiap pembayaran yang berhasil dicatat menghasilkan satu transaksi kas keluar di Finance.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Nomor</th><th className="px-3 py-3">Tanggal</th><th className="px-3 py-3">Metode</th><th className="px-3 py-3">Referensi</th><th className="px-3 py-3">Nilai</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.payments ?? []).map((p) => <tr key={p.id}><td className="px-3 py-3 font-semibold">{p.payment_number}</td><td className="px-3 py-3">{dateLabel(p.payment_date)}</td><td className="px-3 py-3">{p.payment_method==='bank_transfer'?'Transfer bank':p.payment_method==='cash'?'Tunai':'Lainnya'}</td><td className="px-3 py-3">{p.reference_number ?? '—'}</td><td className="px-3 py-3 font-bold">{money(p.amount)}</td><td className="px-3 py-3"><StatusPill value={p.status} label={p.status==='confirmed'?'Terkonfirmasi':'Dibatalkan'}/></td><td className="px-3 py-3 text-right">{canPay && p.status==='confirmed' && <button type="button" onClick={()=>{ const reason=window.prompt('Alasan pembatalan transaksi:'); if(reason?.trim()) void runAction(()=>voidPayment(p.id,reason),'Transaksi dibatalkan dan kas keluar dikoreksi.'); }} className="text-xs font-semibold text-rose-700 hover:underline">Batalkan</button>}</td></tr>)}{(data?.payments.length ?? 0)===0 && <EmptyRow colSpan={7} text="Belum ada transaksi pembayaran."/>}</tbody></table></div></section>
        </div>}
      </>}

      {legacyRequest && <div className="fixed inset-0 z-[84] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="legacy-reconcile-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Rekonsiliasi data historis</p><h2 id="legacy-reconcile-title" className="mt-1 text-lg font-bold text-slate-900">Tautkan tagihan ke progres</h2><p className="mt-1 text-xs text-slate-500">{legacyRequest.request_number} · Nilai bruto {money(legacyRequest.gross_amount)}</p></div><button type="button" onClick={()=>setLegacyRequest(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></header><form onSubmit={submitLegacyReconciliation} className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]"><label className={LABEL}>Progres terverifikasi<select required value={legacyProgressId} onChange={(e)=>setLegacyProgressId(e.target.value)} className={INPUT}><option value="">Pilih progres</option>{(data?.subcontractUnitProgress ?? []).filter((row)=>row.segment_id===legacyRequest.segment_id && row.available_quantity>0 && !legacyProgressLines.some((line)=>line.progressEntryId===row.progress_entry_id)).map((row)=><option key={row.progress_entry_id} value={row.progress_entry_id}>{row.item_name} · {dateLabel(row.report_date)} · sisa {row.available_quantity} {row.unit}</option>)}</select></label><label className={LABEL}>Volume<input required type="number" min="0.001" step="0.001" value={legacyProgressQuantity} onChange={(e)=>setLegacyProgressQuantity(e.target.value)} className={INPUT}/></label><button type="button" onClick={addLegacyProgressLine} disabled={!legacyProgressId || Number(legacyProgressQuantity)<=0} className="self-end rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">Tambah</button></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Item progres</th><th className="px-3 py-2">Volume</th><th className="px-3 py-2">Tarif</th><th className="px-3 py-2">Nilai</th><th className="px-3 py-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{legacyProgressLines.map((line)=>{const row=data?.subcontractUnitProgress.find((item)=>item.progress_entry_id===line.progressEntryId);return <tr key={line.progressEntryId}><td className="px-3 py-2">{row?.item_name ?? 'Progres'} · {dateLabel(row?.report_date)}</td><td className="px-3 py-2">{line.quantity} {row?.unit}</td><td className="px-3 py-2">{money(row?.unit_rate)}</td><td className="px-3 py-2 font-semibold">{money(line.quantity*(row?.unit_rate ?? 0))}</td><td className="px-3 py-2 text-right"><button type="button" onClick={()=>setLegacyProgressLines((current)=>current.filter((item)=>item.progressEntryId!==line.progressEntryId))} className="text-rose-700 hover:underline">Hapus</button></td></tr>;})}{legacyProgressLines.length===0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Belum ada progres yang ditambahkan.</td></tr>}</tbody></table></div><div className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between text-xs"><span className="text-slate-500">Total hasil rekonsiliasi</span><strong>{money(legacyProgressGross)}</strong></div><div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Selisih terhadap tagihan lama</span><strong className={Math.abs(legacyProgressGross-legacyRequest.gross_amount)<=0.01?'text-emerald-700':'text-rose-700'}>{money(Math.abs(legacyProgressGross-legacyRequest.gross_amount))}</strong></div></div>{error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setLegacyRequest(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button disabled={saving || legacyProgressLines.length===0 || Math.abs(legacyProgressGross-legacyRequest.gross_amount)>0.01} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?'Menyimpan...':'Simpan Rekonsiliasi'}</button></div><p className="text-[11px] leading-5 text-slate-500">Rekonsiliasi tidak mengubah nilai atau pembayaran historis. Progres yang dipilih akan dikunci agar tidak ditagihkan ulang.</p></form></section></div>}

      {retentionToRelease && <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="retention-modal-title" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Retensi subkontraktor</p><h2 id="retention-modal-title" className="mt-1 text-lg font-bold text-slate-900">Ajukan pelepasan retensi</h2><p className="mt-1 text-xs text-slate-500">Saldo retensi {money(retentionToRelease.retention_amount)} · Telah dibayar {money(retentionToRelease.released_amount)}</p></div><button type="button" onClick={()=>setRetentionToRelease(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></header><form onSubmit={handleRetentionRelease} className="space-y-3 p-5"><label className={LABEL}>Jumlah yang dilepas<input required type="number" min="1" step="1" value={retentionReleaseAmount} onChange={(e)=>setRetentionReleaseAmount(e.target.value)} className={INPUT}/></label><label className={LABEL}>Jatuh tempo<input type="date" value={retentionReleaseDueDate} onChange={(e)=>setRetentionReleaseDueDate(e.target.value)} className={INPUT}/></label><label className={LABEL}>Catatan / referensi persetujuan<textarea rows={3} value={retentionReleaseNotes} onChange={(e)=>setRetentionReleaseNotes(e.target.value)} className={INPUT}/></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setRetentionToRelease(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button disabled={saving || Number(retentionReleaseAmount)<=0} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?'Menyimpan...':'Buat Kewajiban Retensi'}</button></div><p className="text-[11px] leading-5 text-slate-500">Tindakan ini belum mengeluarkan uang. Setelah dibuat, kewajiban muncul pada tab Pembayaran dan dibayarkan melalui Finance.</p></form></section></div>}

      {paying && canPay && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Pembayaran aktual</p><h2 id="payment-modal-title" className="mt-1 text-lg font-bold text-slate-900">Bayar {paying.obligation_number}</h2><p className="mt-1 text-xs text-slate-500">Sisa kewajiban {money(paying.amount-paying.paid_amount)}</p></div><button type="button" onClick={()=>setPaying(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></header><form onSubmit={handlePayment} className="space-y-3 p-5"><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Tanggal pembayaran<input required type="date" value={paymentDate} onChange={(e)=>setPaymentDate(e.target.value)} className={INPUT}/></label><label className={LABEL}>Metode<select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value as typeof paymentMethod)} className={INPUT}><option value="bank_transfer">Transfer bank</option><option value="cash">Tunai</option><option value="other">Lainnya</option></select></label></div><label className={LABEL}>Jumlah dibayar<input required type="number" min="1" max={paying.amount-paying.paid_amount} step="1" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} className={INPUT}/></label><label className={LABEL}>Nomor referensi<input value={paymentReference} onChange={(e)=>setPaymentReference(e.target.value)} className={INPUT} placeholder="Nomor bukti transfer / kuitansi"/></label><label className={LABEL}>Catatan<textarea rows={2} value={paymentNotes} onChange={(e)=>setPaymentNotes(e.target.value)} className={INPUT}/></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setPaying(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button disabled={saving || Number(paymentAmount)<=0 || Number(paymentAmount)>paying.amount-paying.paid_amount} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?'Menyimpan...':'Konfirmasi Pembayaran'}</button></div><p className="text-[11px] leading-5 text-slate-500">Konfirmasi akan membuat satu transaksi pembayaran dan satu catatan kas keluar secara atomik. Finance/Director/Admin harus memiliki hak pembayaran pada database.</p></form></section></div>}

      <footer className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-500 sm:flex-row sm:justify-between"><span>Payroll menghitung hak karyawan; tagihan subkontraktor dihitung berdasarkan kontrak dan progres.</span><span>Nominal dan transaksi dilindungi oleh RLS serta validasi database.</span></footer>
    </main>
  );
}

function SummaryCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>{icon}</div><p className="mt-3 break-words text-2xl font-bold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>; }
function FlowCard({ title, detail, value }: { title: string; detail: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{title}</p><p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{detail}</p><p className="mt-3 text-xs font-semibold text-emerald-700">{value}</p></div>; }
function AttentionRow({ label, value, onClick }: { label: string; value: number; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-3 text-left hover:bg-slate-50"><span className="text-xs font-medium text-slate-700">{label}</span><span className="flex items-center gap-2 text-xs font-bold text-slate-900">{value}<ChevronDown className="h-3.5 w-3.5 -rotate-90 text-slate-400"/></span></button>; }
function StatusPill({ value, label }: { value: string; label: string }) { const color = ['approved','paid','confirmed','ready'].includes(value) ? 'bg-emerald-50 text-emerald-700' : ['submitted','partially_paid','needs_review'].includes(value) ? 'bg-amber-50 text-amber-800' : ['rejected','cancelled','void'].includes(value) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{label}</span>; }
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) { return <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-xs text-slate-500">{text}</td></tr>; }
function EmptyPanel({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">{text}</div>; }

export default function PayrollPage() {
  return <RequireAuth permission="payroll.read"><PayrollContent /></RequireAuth>;
}
