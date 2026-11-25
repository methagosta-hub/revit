'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, Bell, Building2, CalendarClock,
  CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, FileCheck,
  FolderKanban, Gauge, Package, Plus, RefreshCw, Search, ShieldCheck,
  ShoppingCart, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatRupiah } from '@/lib/format';
import {
  fetchExecutiveDashboardSnapshot,
  type DashboardCurvePoint,
  type DashboardStockLine,
  type ExecutiveDashboardSnapshot,
  type ExecutiveProject,
} from '@/lib/services/dashboardService';

function formatDate(value?: string | null): string {
  if (!value) return 'Belum dijadwalkan';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Belum tersedia';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value)}%`;
}

function statusTone(status?: string | null): string {
  switch (status) {
    case 'DIKERJAKAN':
    case 'approved':
    case 'received':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-700/15';
    case 'FINAL RAB':
    case 'ordered':
    case 'partially_received':
      return 'bg-sky-50 text-sky-700 ring-sky-700/15';
    case 'REVIEW':
    case 'pending_approval':
      return 'bg-amber-50 text-amber-700 ring-amber-700/15';
    case 'SELESAI':
      return 'bg-violet-50 text-violet-700 ring-violet-700/15';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-500/15';
  }
}

function MetricCard({ label, value, note, icon: Icon, tone }: {
  label: string; value: string; note: string; icon: LucideIcon; tone: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-[1.8rem]">{value}</p>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{note}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, href, hrefLabel }: {
  eyebrow?: string; title: string; description?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p> : null}
        <h2 className="mt-1 text-base font-extrabold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {href ? <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950">{hrefLabel ?? 'Lihat detail'} <ChevronRight className="h-3.5 w-3.5" /></Link> : null}
    </div>
  );
}

function CurveChart({ points }: { points: DashboardCurvePoint[] }) {
  const hasActual = points.some((point) => point.actual_percent !== null);
  const coordinates = (values: number[]) => values.map((value, index) => {
    const x = points.length <= 1 ? 54 : 54 + (index / (points.length - 1)) * 620;
    const y = 178 - (Math.max(0, Math.min(100, value)) / 100) * 145;
    return `${x},${y}`;
  }).join(' ');

  if (points.length < 2) {
    return (
      <div className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
        <CalendarClock className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-700">Jadwal paket belum cukup untuk membentuk kurva</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">Kurva rencana memerlukan nilai item paket pekerjaan serta tanggal mulai dan selesai. Lengkapi jadwal pada modul Pelaksanaan.</p>
      </div>
    );
  }

  const plannedPoints = coordinates(points.map((point) => point.planned_percent));
  const actualPoints = hasActual ? coordinates(points.map((point) => point.actual_percent ?? 0)) : '';

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-2 pt-3">
        <svg viewBox="0 0 720 222" role="img" aria-label="Kurva rencana paket pekerjaan dan realisasi progres disetujui" className="h-auto w-full">
          {[0, 25, 50, 75, 100].map((value) => {
            const y = 178 - (value / 100) * 145;
            return <g key={value}><line x1="54" y1={y} x2="680" y2={y} stroke="#e2e8f0" strokeDasharray="4 5" /><text x="42" y={y + 4} fill="#94a3b8" fontSize="10" textAnchor="end">{value}%</text></g>;
          })}
          <line x1="54" y1="178" x2="680" y2="178" stroke="#cbd5e1" />
          <polyline points={plannedPoints} fill="none" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const x = points.length <= 1 ? 54 : 54 + (index / (points.length - 1)) * 620;
            const y = 178 - (point.planned_percent / 100) * 145;
            return <circle key={`planned-${point.date}`} cx={x} cy={y} r="3.5" fill="#0f766e" stroke="white" strokeWidth="1.5" />;
          })}
          {hasActual ? <polyline points={actualPoints} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {hasActual ? points.filter((point) => point.actual_percent !== null).map((point) => {
            const index = points.indexOf(point);
            const x = points.length <= 1 ? 54 : 54 + (index / (points.length - 1)) * 620;
            const y = 178 - ((point.actual_percent ?? 0) / 100) * 145;
            return <circle key={`actual-${point.date}`} cx={x} cy={y} r="3" fill="#2563eb" stroke="white" strokeWidth="1.5" />;
          }) : null}
          {points.map((point, index) => {
            const x = points.length <= 1 ? 54 : 54 + (index / (points.length - 1)) * 620;
            return <text key={point.date} x={x} y="202" fill="#64748b" fontSize="10" textAnchor="middle">{point.label}</text>;
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 rounded bg-teal-700" /> Rencana paket</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 rounded bg-blue-600" /> Realisasi disetujui</span>
        {!hasActual ? <span className="text-amber-700">Belum ada progres disetujui untuk garis realisasi.</span> : null}
      </div>
    </div>
  );
}

type FollowUpItem = {
  id: string; title: string; description: string; count: string; href: string;
  icon: LucideIcon; tone: string;
};

const QUICK_LINKS: Array<{
  title: string; description: string; href: string; icon: LucideIcon; color: string;
  allowed: (can: (permission: string) => boolean) => boolean;
}> = [
  { title: 'Pengadaan', description: 'Permintaan barang dan proses pembelian', href: '/pengadaan', icon: ShoppingCart, color: 'bg-blue-50 text-blue-700', allowed: (can) => can('procurement.purchase.create') || can('procurement.purchase.approve') || can('procurement.request.review') },
  { title: 'Gudang & Persediaan', description: 'Penerimaan, pengeluaran dan posisi stok', href: '/gudang', icon: Warehouse, color: 'bg-amber-50 text-amber-700', allowed: (can) => can('warehouse.manage') || can('warehouse.receive') || can('warehouse.issue') },
  { title: 'Keuangan', description: 'Pembayaran supplier, kewajiban dan kas', href: '/keuangan', icon: Wallet, color: 'bg-emerald-50 text-emerald-700', allowed: (can) => can('finance.read') || can('finance.payment.manage') },
  { title: 'Personalia', description: 'Karyawan, jadwal, absensi dan payroll', href: '/personalia', icon: Users, color: 'bg-violet-50 text-violet-700', allowed: (can) => can('personnel.read') || can('payroll.read') },
];

function CompanyDashboardContent() {
  const { user, access, can } = useAuth();
  const isPortfolioAccount = access?.profile?.is_demo_user === true;
  const [snapshot, setSnapshot] = useState<ExecutiveDashboardSnapshot | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [clockLabel, setClockLabel] = useState('');

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchExecutiveDashboardSnapshot({
        userId: user.id,
        canViewProcurement: can('procurement.purchase.create') || can('procurement.purchase.approve') || can('procurement.request.review'),
        canApprovePurchase: can('procurement.purchase.approve'),
        canViewWarehouse: can('warehouse.manage') || can('warehouse.receive') || can('warehouse.issue'),
        canManageWarehouse: can('warehouse.manage'),
        canViewFinance: can('finance.read'),
        canViewSubcontractFinance: can('finance.read') && (can('payroll.read') || can('execution.payment.read') || can('execution.payment.manage')),
        canViewCompanyActivity: !isPortfolioAccount,
        canAccessExecutionProject: (projectId) => can('execution.read', projectId),
      });
      setSnapshot(data);
    } catch (loadError) {
      console.error('Gagal memuat Executive Overview:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Data dashboard belum dapat dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, can]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    setClockLabel(new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()));
  }, []);

  const projects = snapshot?.projects ?? [];
  const totalRAB = useMemo(() => projects.reduce((sum, project) => sum + Number(project.total_value ?? 0), 0), [projects]);
  const activeProjectCount = projects.filter((project) => project.status === 'DIKERJAKAN').length;
  const statusCounts = useMemo(() => ({
    draft: projects.filter((project) => project.status === 'DRAFT').length,
    review: projects.filter((project) => project.status === 'REVIEW').length,
    final: projects.filter((project) => project.status === 'FINAL RAB').length,
    active: projects.filter((project) => project.status === 'DIKERJAKAN').length,
    completed: projects.filter((project) => project.status === 'SELESAI').length,
  }), [projects]);

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    const rows = keyword
      ? projects.filter((project) => [project.title, project.client, project.location, project.school_npsn].some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword)))
      : projects;
    return rows.slice(0, keyword ? 10 : 6);
  }, [projects, search]);

  const canApprovePurchase = can('procurement.purchase.approve');
  const canViewFinance = can('finance.read');
  const canViewWarehouse = can('warehouse.manage') || can('warehouse.receive') || can('warehouse.issue');

  const followUps = useMemo<FollowUpItem[]>(() => {
    if (!snapshot || isPortfolioAccount) return [];
    const items: FollowUpItem[] = [];
    if (canApprovePurchase && snapshot.pending_approval_count > 0) {
      items.push({
        id: 'po-approval', title: 'PO menunggu persetujuan',
        description: snapshot.pending_approvals.slice(0, 2).map((row) => row.po_number).join(' · ') || 'Periksa antrean pembelian yang diajukan Purchasing.',
        count: String(snapshot.pending_approval_count), href: '/pengadaan/persetujuan', icon: FileCheck,
        tone: 'border-amber-200 bg-amber-50 text-amber-800',
      });
    }
    if (canViewWarehouse && snapshot.low_stock_count > 0) {
      items.push({
        id: 'low-stock', title: 'Material di bawah stok minimum',
        description: snapshot.low_stock_lines.slice(0, 2).map((row) => row.material_name).join(' · ') || 'Periksa posisi persediaan proyek.',
        count: String(snapshot.low_stock_count), href: '/gudang/persediaan', icon: AlertTriangle,
        tone: 'border-rose-200 bg-rose-50 text-rose-800',
      });
    }
    if (canViewFinance && snapshot.outstanding_obligation_count > 0) {
      items.push({
        id: 'obligations', title: 'Kewajiban pembayaran terbuka',
        description: `${formatRupiah(snapshot.outstanding_obligation_total)} belum dilunasi berdasarkan register kewajiban.`,
        count: String(snapshot.outstanding_obligation_count), href: '/keuangan/pembayaran', icon: Wallet,
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      });
    }
    if (canViewFinance && snapshot.payable_po_count > 0) {
      items.push({
        id: 'po-payable', title: 'PO belum lunas',
        description: `${formatRupiah(snapshot.payable_po_remaining)} sisa pembayaran dari PO proyek aktif.`,
        count: String(snapshot.payable_po_count), href: '/keuangan/pembayaran', icon: ShoppingCart,
        tone: 'border-sky-200 bg-sky-50 text-sky-800',
      });
    }
    return items;
  }, [snapshot, isPortfolioAccount, canApprovePurchase, canViewWarehouse, canViewFinance]);

  const metrics = useMemo(() => {
    const rows: Array<{ label: string; value: string; note: string; icon: LucideIcon; tone: string }> = [
      { label: 'Total proyek', value: loading ? '—' : String(projects.length), note: `${activeProjectCount} proyek sedang dikerjakan`, icon: FolderKanban, tone: 'bg-blue-50 text-blue-700' },
      { label: 'Nilai RAB', value: loading ? '—' : formatRupiah(totalRAB), note: 'Akumulasi total_value proyek yang dapat diakses', icon: CircleDollarSign, tone: 'bg-emerald-50 text-emerald-700' },
    ];
    if (canApprovePurchase) {
      rows.push({ label: 'Menunggu persetujuan PO', value: loading ? '—' : String(snapshot?.pending_approval_count ?? 0), note: 'Antrean untuk Direktur / Admin', icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700' });
    } else if (canViewFinance) {
      rows.push({ label: 'PO belum lunas', value: loading ? '—' : String(snapshot?.payable_po_count ?? 0), note: `${formatRupiah(snapshot?.payable_po_remaining ?? 0)} sisa pembayaran`, icon: ShoppingCart, tone: 'bg-sky-50 text-sky-700' });
    }
    if (canViewWarehouse) {
      rows.push({ label: 'Stok di bawah minimum', value: loading ? '—' : String(snapshot?.low_stock_count ?? 0), note: snapshot?.stock_rules_configured === null ? 'Aturan minimum tidak tersedia untuk role ini' : snapshot?.stock_rules_configured ? `${snapshot.stock_rules_configured} aturan stok aktif` : 'Aturan minimum stok belum diatur', icon: Warehouse, tone: 'bg-rose-50 text-rose-700' });
    } else if (canViewFinance) {
      rows.push({ label: 'Kewajiban terbuka', value: loading ? '—' : String(snapshot?.outstanding_obligation_count ?? 0), note: `${formatRupiah(snapshot?.outstanding_obligation_total ?? 0)} belum dilunasi`, icon: Wallet, tone: 'bg-violet-50 text-violet-700' });
    }
    return rows;
  }, [loading, projects.length, activeProjectCount, totalRAB, canApprovePurchase, canViewFinance, canViewWarehouse, snapshot]);

  const quickLinks = QUICK_LINKS.filter((item) => item.allowed(can));
  const canCreateProject = can('project.manage');

  return (
    <main className="min-h-screen bg-[#f4f7f8] px-3 py-5 text-slate-900 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="relative isolate overflow-hidden rounded-3xl bg-[#071827] p-5 text-white shadow-[0_18px_55px_rgba(8,25,40,.16)] sm:p-7 xl:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(13,148,136,.32),transparent_46%),radial-gradient(ellipse_at_bottom_left,rgba(14,116,144,.18),transparent_50%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full border border-white/[0.07]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-14 -z-10 h-52 w-52 rounded-full border border-white/[0.06]" />
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-300">
                <Gauge className="h-4 w-4" /> JAVAWASTHU MANAGEMENT <span className="text-slate-600">/</span> EXECUTIVE OVERVIEW
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl xl:text-[2.1rem]">{isPortfolioAccount ? 'Dashboard Portofolio' : 'Dashboard Perusahaan'}</h1>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300 sm:text-sm">Ringkasan keadaan proyek, pengadaan, persediaan, keuangan dan pelaksanaan dalam satu ruang kendali.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Data langsung dari Production</span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{access?.profile?.full_name || user?.email || 'Pengguna'}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 sm:min-w-[210px] lg:text-right">
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400">Tanggal</p>
                <p className="mt-1 text-sm font-bold text-white">{clockLabel || 'Memuat tanggal...'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/[0.13] disabled:cursor-not-allowed disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan data
                </button>
                {canCreateProject && !isPortfolioAccount ? <Link href="/proyek/baru" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-[#05251f] shadow-sm transition hover:bg-emerald-400"><Plus className="h-4 w-4" /> Buat proyek</Link> : null}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-bold">Ringkasan dashboard belum dapat dimuat.</p><p className="mt-1 text-xs">{error}</p></div></div>
            <button type="button" onClick={() => void loadDashboard()} className="text-xs font-bold underline underline-offset-4">Coba lagi</button>
          </div>
        ) : null}

        {snapshot?.warnings.length ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Sebagian ringkasan operasional tidak dapat dibaca oleh sesi ini: {snapshot.warnings.join(', ')}. Angka pada panel terkait tidak ditampilkan sebagai data lengkap.</div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indikator utama perusahaan">
          {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <SectionHeading eyebrow="Monitoring lintas divisi" title="Kurva-S · Rencana vs realisasi" description="Bobot rencana dari nilai item paket dan jadwal pelaksanaan; realisasi hanya memakai progres yang disetujui." />
              <Link href={projects.find((project) => project.status === 'DIKERJAKAN') ? `/proyek/${projects.find((project) => project.status === 'DIKERJAKAN')?.id}/pelaksanaan-pekerjaan` : '/proyek/daftar'} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50">Detail pelaksanaan <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {loading ? <div className="h-[230px] animate-pulse rounded-xl bg-slate-100" /> : (
              <>
                <CurveChart points={snapshot?.execution.curve ?? []} />
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">Paket pekerjaan aktif</p><p className="mt-1 text-lg font-black text-slate-900">{snapshot?.execution.package_count ?? 0}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">Progres disetujui</p><p className="mt-1 text-lg font-black text-slate-900">{formatPercent(snapshot?.execution.weighted_progress_percent ?? null)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">Laporan progres disetujui</p><p className="mt-1 text-lg font-black text-slate-900">{snapshot?.execution.approved_progress_count ?? 0}</p></div>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-slate-400">Catatan: garis rencana disusun pro-rata dari tanggal mulai–selesai paket yang memiliki nilai item. Ini bukan bobot mingguan yang diinput manual. Realisasi tidak dihitung dari laporan yang masih menunggu verifikasi.</p>
              </>
            )}
          </article>

          <aside className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading eyebrow="Perlu perhatian" title="Daftar tindak lanjut" description="Tugas prioritas berdasarkan status yang tercatat di database." />
            {loading ? <div className="mt-4 space-y-3"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></div> : followUps.length ? (
              <div className="mt-4 space-y-2.5">
                {followUps.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.id} href={item.href} className={`group flex items-start gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${item.tone}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold">{item.title}</span><span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black tabular-nums">{item.count}</span></span>
                        <span className="mt-1 block text-[10px] leading-5 opacity-80">{item.description}</span>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold">Buka tindak lanjut <ChevronRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex min-h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-bold text-slate-800">Tidak ada tindak lanjut prioritas</p>
                <p className="mt-1 max-w-xs text-[11px] leading-5 text-slate-500">Tidak ditemukan PO menunggu, stok di bawah ambang atau kewajiban terbuka pada data yang dapat diakses akun ini.</p>
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {canViewWarehouse ? (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="Warehouse & inventory" title="Gudang dan persediaan" description={snapshot?.stock_rules_configured === null ? `${snapshot?.stock_line_count ?? 0} baris stok · ambang minimum tidak ditampilkan untuk role ini` : `${snapshot?.stock_rules_configured ?? 0} aturan minimum stok aktif · ${snapshot?.stock_line_count ?? 0} baris stok tercatat`} href="/gudang/persediaan" hrefLabel="Buka persediaan" />
              {loading ? <div className="mt-4 space-y-3"><div className="h-12 animate-pulse rounded-lg bg-slate-100" /><div className="h-12 animate-pulse rounded-lg bg-slate-100" /></div> : snapshot?.stock_lines.length ? (
                <div className="mt-4 divide-y divide-slate-100">{snapshot.stock_lines.slice(0, 5).map((row) => <StockRow key={`${row.project_id}-${row.material_name}-${row.unit}`} row={row} />)}</div>
              ) : <EmptyPanel icon={Package} title="Belum ada pergerakan stok" description="Saldo akan muncul setelah penerimaan, pembelian langsung, atau pengeluaran material dikonfirmasi." />}
              {!loading && snapshot?.stock_rules_configured === 0 ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">Aturan batas minimum belum diatur. Sistem belum dapat mengidentifikasi stok rendah berdasarkan ambang perusahaan.</p> : null}
            </article>
          ) : null}

          {snapshot?.subcontract && !isPortfolioAccount ? (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="Execution & finance" title="Subkontraktor dan pembayaran" description="Ringkasan jadwal termin, klaim progres, kewajiban dan pembayaran aktual." href="/proyek/daftar" hrefLabel="Buka proyek" />
              {loading ? <div className="mt-4 grid grid-cols-2 gap-3"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></div> : snapshot.subcontract.term_count === 0 && snapshot.subcontract.available_progress_rows === 0 ? (
                <EmptyPanel icon={Wallet} title="Belum ada termin subkontraktor" description="Ringkasan akan terisi setelah paket pekerjaan memiliki kontrak, jadwal termin dan progres unit yang telah disetujui." />
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <FinanceMini label="Nilai termin" value={formatRupiah(snapshot.subcontract.term_value)} />
                  <FinanceMini label="Klaim disetujui" value={formatRupiah(snapshot.subcontract.approved_gross)} />
                  <FinanceMini label="Kewajiban" value={formatRupiah(snapshot.subcontract.obligation_amount)} />
                  <FinanceMini label="Sudah dibayar" value={formatRupiah(snapshot.subcontract.paid_amount)} />
                  <FinanceMini label="Sisa kewajiban" value={formatRupiah(snapshot.subcontract.remaining_amount)} emphasis />
                  <FinanceMini label="Tersedia untuk diklaim" value={formatRupiah(snapshot.subcontract.available_to_claim)} />
                </div>
              )}
            </article>
          ) : null}

          {canViewFinance && !isPortfolioAccount ? (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="Finance" title="PO dan kewajiban pembayaran" description="Sisa pembayaran PO dan register kewajiban yang belum lunas." href="/keuangan/pembayaran" hrefLabel="Buka pembayaran" />
              {loading ? <div className="mt-4 space-y-3"><div className="h-12 animate-pulse rounded-lg bg-slate-100" /><div className="h-12 animate-pulse rounded-lg bg-slate-100" /></div> : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <FinanceMini label="PO belum lunas" value={String(snapshot?.payable_po_count ?? 0)} />
                    <FinanceMini label="Sisa pembayaran PO" value={formatRupiah(snapshot?.payable_po_remaining ?? 0)} emphasis />
                    <FinanceMini label="Kewajiban terbuka" value={String(snapshot?.outstanding_obligation_count ?? 0)} />
                    <FinanceMini label="Nilai kewajiban" value={formatRupiah(snapshot?.outstanding_obligation_total ?? 0)} />
                  </div>
                  {snapshot?.payable_orders.length ? (
                    <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
                      {snapshot.payable_orders.slice(0, 3).map((row) => <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-800">{row.po_number}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{row.project_name} · {row.status}</p></div><p className="shrink-0 text-xs font-extrabold tabular-nums text-slate-900">{formatRupiah(row.remaining)}</p></div>)}
                    </div>
                  ) : <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500">Tidak ada saldo PO aktif yang perlu dibayar.</p>}
                </>
              )}
            </article>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading eyebrow="Portfolio" title="Daftar proyek" description="Nilai RAB dan status proyek yang dapat diakses akun ini." href="/proyek/daftar" hrefLabel="Semua proyek" />
            <label className="relative mt-4 block">
              <span className="sr-only">Cari proyek</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama proyek, pemilik, lokasi atau NPSN..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10" />
            </label>
            {loading ? <div className="mt-4 space-y-3"><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /></div> : filteredProjects.length ? (
              <div className="mt-3 divide-y divide-slate-100">{filteredProjects.map((project) => <ProjectRow key={project.id} project={project} />)}</div>
            ) : <EmptyPanel icon={FolderKanban} title={search ? 'Proyek tidak ditemukan' : 'Belum ada proyek'} description={search ? 'Coba kata kunci lain.' : 'Belum ada proyek yang dapat ditampilkan untuk akun ini.'} />}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
              <StatusCount label="Draft" value={statusCounts.draft} />
              <StatusCount label="Review" value={statusCounts.review} />
              <StatusCount label="Final RAB" value={statusCounts.final} />
              <StatusCount label="Dikerjakan" value={statusCounts.active} />
              <StatusCount label="Selesai" value={statusCounts.completed} />
              <StatusCount label="Total nilai" value={formatRupiah(totalRAB)} compact />
            </div>
          </article>

          <div className="space-y-5">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="Company activity" title="Aktivitas perusahaan" description="Peristiwa operasional terbaru dari activity_feed." href="/pusat-kendali" hrefLabel="Pusat kendali" />
              {loading ? <div className="mt-4 space-y-3"><div className="h-14 animate-pulse rounded-lg bg-slate-100" /><div className="h-14 animate-pulse rounded-lg bg-slate-100" /></div> : snapshot?.activities.length ? (
                <div className="mt-3 divide-y divide-slate-100">
                  {snapshot.activities.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex gap-3 py-3 first:pt-1">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Activity className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        {item.target_url ? <Link href={item.target_url} className="text-xs font-extrabold leading-5 text-slate-800 hover:text-emerald-800">{item.title}</Link> : <p className="text-xs font-extrabold leading-5 text-slate-800">{item.title}</p>}
                        <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-500">{item.summary}</p>
                        <p className="mt-1 text-[9px] text-slate-400">{item.actor_name} · {item.project_name} · {formatDateTime(item.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyPanel icon={Activity} title="Belum ada aktivitas kantor" description="Peristiwa lintas divisi akan muncul ketika transaksi atau perubahan status tercatat." />}
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="Personal inbox" title="Notifikasi untuk Anda" description="Tindak lanjut personal yang belum dibaca." />
              {loading ? <div className="mt-3 space-y-2"><div className="h-12 animate-pulse rounded-lg bg-slate-100" /></div> : snapshot?.notifications.length ? (
                <div className="mt-3 space-y-2">
                  {snapshot.notifications.slice(0, 3).map((item) => (
                    <Link key={item.id} href={item.target_url || '/pusat-kendali'} className="flex items-start gap-2.5 rounded-xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40">
                      <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${item.priority === 'critical' ? 'text-rose-600' : item.priority === 'high' ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{item.title}</span><span className="mt-1 block line-clamp-2 text-[10px] leading-5 text-slate-500">{item.message}</span></span>
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">Tidak ada notifikasi personal yang belum dibaca.</p>}
            </article>
          </div>
        </section>

        {quickLinks.length && !isPortfolioAccount ? (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading eyebrow="Workspace" title="Akses operasional" description="Pintasan modul mengikuti kewenangan akun." />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {quickLinks.map((item) => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold text-slate-800">{item.title}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{item.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" /></Link>;
              })}
            </div>
          </section>
        ) : null}

        <footer className="flex flex-col gap-2 border-t border-slate-200/80 py-3 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>JAVAWASTHU MANAGEMENT · EXECUTIVE OVERVIEW</span>
          <span>Ringkasan mengikuti RLS dan permission akun yang sedang aktif.</span>
        </footer>
      </div>
    </main>
  );
}

function StockRow({ row }: { row: DashboardStockLine }) {
  const isLow = row.minimum_quantity !== null && row.quantity_on_hand < row.minimum_quantity;
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-1">
      <div className="min-w-0">
        <p className="truncate text-xs font-extrabold text-slate-800">{row.material_name}</p>
        <p className="mt-1 truncate text-[10px] text-slate-500">{row.project_name}{row.material_code ? ` · ${row.material_code}` : ''}</p>
        {isLow ? <p className="mt-1 text-[9px] font-bold text-rose-700">Di bawah minimum {formatQuantity(row.minimum_quantity ?? 0)} {row.unit}</p> : null}
      </div>
      <span className={`shrink-0 text-right text-xs font-black tabular-nums ${isLow ? 'text-rose-700' : 'text-slate-800'}`}>{formatQuantity(row.quantity_on_hand)} <span className="text-[9px] font-semibold text-slate-400">{row.unit}</span></span>
    </div>
  );
}

function FinanceMini({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-xl p-3 ${emphasis ? 'border border-emerald-200 bg-emerald-50/70' : 'bg-slate-50'}`}><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-black tabular-nums text-slate-900">{value}</p></div>;
}

function StatusCount({ label, value, compact = false }: { label: string; value: number | string; compact?: boolean }) {
  return <div className="rounded-lg bg-slate-50 px-2.5 py-2"><p className="text-[9px] font-semibold text-slate-500">{label}</p><p className={`mt-1 font-black tabular-nums text-slate-800 ${compact ? 'text-[10px]' : 'text-sm'}`}>{value}</p></div>;
}

function ProjectRow({ project }: { project: ExecutiveProject }) {
  return (
    <Link href={`/proyek/${project.id}`} className="flex flex-col gap-2 py-3 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-extrabold text-slate-900">{project.title}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ring-1 ring-inset ${statusTone(project.status)}`}>{project.status || 'DRAFT'}</span></div>
        <p className="mt-1 truncate text-[10px] text-slate-500">{[project.client, project.location].filter(Boolean).join(' · ') || 'Identitas pemilik/lokasi belum diisi'}</p>
        <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><CalendarClock className="h-3 w-3" /> Diubah {formatDate(project.updated_at)}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center"><span className="text-xs font-black tabular-nums text-slate-800">{formatRupiah(project.total_value)}</span><span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800">Buka <ArrowRight className="h-3 w-3" /></span></div>
    </Link>
  );
}

function EmptyPanel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="mt-4 flex min-h-[145px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center"><Icon className="h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-extrabold text-slate-700">{title}</p><p className="mt-1 max-w-sm text-[10px] leading-5 text-slate-500">{description}</p></div>;
}

export default function CompanyDashboardPage() {
  return <RequireAuth><CompanyDashboardContent /></RequireAuth>;
}
