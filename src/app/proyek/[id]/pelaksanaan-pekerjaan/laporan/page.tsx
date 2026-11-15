'use client';

/* -------------------------------------------------------------------------- */
/* Dahlia Management System                                                   */
/* Project Daily Report — Wizard Edition                                     */
/* -------------------------------------------------------------------------- */
/*                                                                            */
/* This page intentionally keeps the workflow in one client-side route.       */
/* Data is still read/written through the Supabase service layer; this file    */
/* does not create duplicate RAB, stock, attendance, or payroll transactions. */
/*                                                                            */
/* Main UX:                                                                    */
/*  1. Create a report from a focused modal wizard.                            */
/*  2. Select actual work package items from the database with search.         */
/*  3. Select personnel from date/division-aware Personalia roster.            */
/*  4. Record material consumption without reducing warehouse stock again.     */
/*  5. Review and submit, then track approvals in the project archive.          */
/* -------------------------------------------------------------------------- */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Cloud,
  CloudDrizzle,
  CloudRain,
  Eye,
  FileCheck2,
  FileClock,
  FileText,
  HardHat,
  Info,
  Layers3,
  Loader2,
  MapPin,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';

import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  fetchDailyReportDetails,
  fetchDailyReportPrintData,
  fetchDailyReportWorkspace,
  fetchProjectReportEmployees,
  reviewDailyReport,
  saveDailyReport,
  type DailyReportEmployee,
} from '@/lib/services/projectDailyReportService';
import type {
  DailyEquipmentInput,
  DailyLaborInput,
  DailyMaterialInput,
  DailyReportDivision,
  DailyReportPackageItem,
  DailyReportRecord,
  DailyReportStatus,
  DailyWeather,
  DailyWorkInput,
} from '@/types/projectDailyReport';

/* -------------------------------------------------------------------------- */
/* Constants and small formatting helpers                                     */
/* -------------------------------------------------------------------------- */

const INPUT_CLASS =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';

const LABEL_CLASS = 'block text-xs font-semibold tracking-wide text-slate-600';

const BUTTON_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

const WIZARD_STEPS = [
  { title: 'Informasi', description: 'Tanggal, divisi, kondisi', icon: CalendarDays },
  { title: 'Pekerjaan', description: 'Volume RAB dan AHSP', icon: HardHat },
  { title: 'Personel', description: 'Tenaga kerja dan HOK', icon: Users },
  { title: 'Sumber daya', description: 'Material dan peralatan', icon: Package },
  { title: 'Catatan', description: 'Kendala dan tindak lanjut', icon: ClipboardList },
  { title: 'Review', description: 'Periksa sebelum diajukan', icon: FileCheck2 },
] as const;

const WEATHER_OPTIONS: Array<{ value: DailyWeather; label: string; icon: typeof Sun }> = [
  { value: 'clear', label: 'Cerah', icon: Sun },
  { value: 'cloudy', label: 'Mendung', icon: Cloud },
  { value: 'rain_light', label: 'Hujan ringan', icon: CloudDrizzle },
  { value: 'rain_heavy', label: 'Hujan lebat', icon: CloudRain },
  { value: 'other', label: 'Lainnya', icon: Activity },
];

const STATUS_CONFIG: Record<DailyReportStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  draft: {
    label: 'Draft',
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: FileClock,
  },
  submitted: {
    label: 'Menunggu verifikasi',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock3,
  },
  approved: {
    label: 'Disetujui',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: BadgeCheck,
  },
  rejected: {
    label: 'Perlu perbaikan',
    tone: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: AlertCircle,
  },
};

const ATTENDANCE_OPTIONS = [
  { value: 'present', label: 'Hadir' },
  { value: 'half_day', label: 'Setengah hari' },
  { value: 'sick', label: 'Sakit' },
  { value: 'permission', label: 'Izin' },
  { value: 'absent', label: 'Tidak hadir' },
  { value: 'other', label: 'Lainnya' },
] as const;

const EQUIPMENT_CONDITION_OPTIONS = [
  { value: 'good', label: 'Baik' },
  { value: 'minor_issue', label: 'Kendala ringan' },
  { value: 'damaged', label: 'Rusak' },
  { value: 'maintenance', label: 'Perawatan' },
] as const;

const todayJakarta = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const formatDate = (value: string): string => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const formatDateShort = (value: string): string => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const formatNumber = (value: unknown, maximumFractionDigits = 3): string =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(Number(value ?? 0));

const formatCurrency = (value: unknown): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[character] ?? character;
  });

const weatherLabel = (value: DailyWeather): string =>
  WEATHER_OPTIONS.find((option) => option.value === value)?.label ?? 'Lainnya';

const attendanceLabel = (value: string): string =>
  ATTENDANCE_OPTIONS.find((option) => option.value === value)?.label ?? value;

const equipmentConditionLabel = (value: string): string =>
  EQUIPMENT_CONDITION_OPTIONS.find((option) => option.value === value)?.label ?? value;

const emptyWorkRow = (): DailyWorkInput => ({
  package_item_id: '',
  segment_item_id: '',
  quantity_today: '',
  notes: '',
});

const emptyLaborRow = (): DailyLaborInput => ({
  employee_id: '',
  employee_name: '',
  position: '',
  daily_assignment_id: '',
  attendance_status: 'present',
  hours_worked: '8',
  hok: '1',
  overtime_hours: '0',
  notes: '',
});

const emptyMaterialRow = (): DailyMaterialInput => ({
  material_name: '',
  unit: '',
  quantity_used: '',
  estimated_waste_quantity: '0',
  notes: '',
});

const emptyEquipmentRow = (): DailyEquipmentInput => ({
  equipment_name: '',
  quantity: '1',
  hours_used: '0',
  condition_status: 'good',
  cost_estimate: '0',
  notes: '',
});

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/* -------------------------------------------------------------------------- */
/* Reusable visual primitives                                                 */
/* -------------------------------------------------------------------------- */

function ModalFrame({
  title,
  description,
  children,
  onClose,
  size = 'max-w-3xl',
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: string;
  footer?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full ${size} flex-col overflow-hidden rounded-[26px] border border-white/30 bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className={BUTTON_GHOST} aria-label="Tutup jendela">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
        {footer ? <footer className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-7">{footer}</footer> : null}
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: typeof ClipboardList;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-700">{eyebrow}</p> : null}
          <h3 className="mt-0.5 text-base font-bold text-slate-900 sm:text-lg">{title}</h3>
          {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  required = false,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`${LABEL_CLASS} ${className}`}>
      <span className="flex items-center gap-1">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] font-normal leading-4 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'emerald',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: 'emerald' | 'amber' | 'blue' | 'slate';
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </article>
  );
}

function StatusPill({ status }: { status: DailyReportStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${config.tone}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function InlineNotice({
  title,
  children,
  tone = 'info',
}: {
  title?: string;
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
}) {
  const tones = {
    info: 'border-blue-100 bg-blue-50/80 text-blue-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    danger: 'border-rose-100 bg-rose-50 text-rose-900',
  };
  return (
    <div className={`rounded-2xl border p-4 text-xs leading-5 ${tones[tone]}`}>
      {title ? <p className="mb-1 font-bold">{title}</p> : null}
      {children}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Package;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon className="h-6 w-6" />
      </span>
      <h4 className="mt-4 text-sm font-bold text-slate-800">{title}</h4>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Wizard progress and controls                                               */
/* -------------------------------------------------------------------------- */

function WizardProgress({ currentStep, onSelect }: { currentStep: number; onSelect: (step: number) => void }) {
  return (
    <nav aria-label="Tahapan laporan" className="relative">
      <div className="absolute left-6 right-6 top-5 hidden h-px bg-slate-200 lg:block" />
      <ol className="relative grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {WIZARD_STEPS.map((step, index) => {
          const Icon = step.icon;
          const complete = index < currentStep;
          const active = index === currentStep;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={index > currentStep}
                className={`group flex w-full flex-col items-center rounded-2xl px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-bold shadow-sm transition ${
                    complete
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : active
                        ? 'border-emerald-700 bg-white text-emerald-700 ring-4 ring-emerald-100'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className={`mt-2 text-[10px] font-bold sm:text-xs ${active ? 'text-emerald-800' : 'text-slate-600'}`}>
                  {step.title}
                </span>
                <span className="mt-0.5 hidden text-[9px] text-slate-400 sm:block">{step.description}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WizardFooter({
  currentStep,
  saving,
  isEditing,
  onBack,
  onNext,
  onClose,
  onSaveDraft,
  onSubmit,
}: {
  currentStep: number;
  saving: boolean;
  isEditing: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}) {
  const lastStep = currentStep === WIZARD_STEPS.length - 1;

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className={BUTTON_GHOST} disabled={saving}>
          Tutup
        </button>
        {currentStep > 0 ? (
          <button type="button" onClick={onBack} className={BUTTON_SECONDARY} disabled={saving}>
            <ChevronLeft className="h-4 w-4" /> Kembali
          </button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={onSaveDraft} className={BUTTON_SECONDARY} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Simpan Draft
        </button>
        {lastStep ? (
          <button type="button" onClick={onSubmit} className={BUTTON_PRIMARY} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isEditing ? 'Ajukan Perbaikan' : 'Ajukan Laporan'}
          </button>
        ) : (
          <button type="button" onClick={onNext} className={BUTTON_PRIMARY} disabled={saving}>
            Lanjut <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function ProjectDailyReportPage() {
  const params = useParams<{ id: string }>();
  const projectId = String(params?.id ?? '');

  /* ------------------------------------------------------------------------ */
  /* Workspace and access state                                               */
  /* ------------------------------------------------------------------------ */

  const [project, setProject] = useState<{
    id: string;
    title: string;
    client: string | null;
    location: string | null;
  } | null>(null);
  const [divisions, setDivisions] = useState<DailyReportDivision[]>([]);
  const [packageItems, setPackageItems] = useState<DailyReportPackageItem[]>([]);
  const [reports, setReports] = useState<DailyReportRecord[]>([]);
  const [employees, setEmployees] = useState<DailyReportEmployee[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userId, setUserId] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [canRead, setCanRead] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Wizard visibility and current step                                       */
  /* ------------------------------------------------------------------------ */

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingReportNumber, setEditingReportNumber] = useState('');

  /* ------------------------------------------------------------------------ */
  /* Report form state                                                        */
  /* ------------------------------------------------------------------------ */

  const [reportDate, setReportDate] = useState(todayJakarta());
  const [divisionId, setDivisionId] = useState('');
  const [weather, setWeather] = useState<DailyWeather>('clear');
  const [fieldCondition, setFieldCondition] = useState('');
  const [summary, setSummary] = useState('');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('16:00');
  const [obstacles, setObstacles] = useState('');
  const [followUp, setFollowUp] = useState('');

  const [workRows, setWorkRows] = useState<DailyWorkInput[]>([emptyWorkRow()]);
  const [laborRows, setLaborRows] = useState<DailyLaborInput[]>([]);
  const [materialRows, setMaterialRows] = useState<DailyMaterialInput[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<DailyEquipmentInput[]>([]);

  /* ------------------------------------------------------------------------ */
  /* Searchable picker and detail modal state                                 */
  /* ------------------------------------------------------------------------ */

  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemPackageFilter, setItemPackageFilter] = useState('all');
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [previewReport, setPreviewReport] = useState<DailyReportRecord | null>(null);
  const [reviewTarget, setReviewTarget] = useState<DailyReportRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');

  /* ------------------------------------------------------------------------ */
  /* Archive filters                                                          */
  /* ------------------------------------------------------------------------ */

  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveStatus, setArchiveStatus] = useState('all');
  const [archiveDivision, setArchiveDivision] = useState('all');

  /* ------------------------------------------------------------------------ */
  /* Derived collections and metrics                                          */
  /* ------------------------------------------------------------------------ */

  const selectedDivision = useMemo(
    () => divisions.find((division) => division.id === divisionId) ?? null,
    [divisions, divisionId],
  );

  const divisionItems = useMemo(
    () => packageItems.filter((item) => item.rab_division_id === divisionId || item.package_division_id === divisionId),
    [packageItems, divisionId],
  );

  const packageNames = useMemo(() => {
    const unique = new Map<string, string>();
    divisionItems.forEach((item) => unique.set(item.package_id, `${item.package_number} · ${item.package_name}`));
    return Array.from(unique.entries()).map(([id, label]) => ({ id, label }));
  }, [divisionItems]);

  const filteredPackageItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return divisionItems.filter((item) => {
      const matchesPackage = itemPackageFilter === 'all' || item.package_id === itemPackageFilter;
      const searchable = [item.rab_code, item.item_name, item.package_name, item.package_number, item.unit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesPackage && (!query || searchable.includes(query));
    });
  }, [divisionItems, itemSearch, itemPackageFilter]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      const searchable = [employee.full_name, employee.employee_number, employee.position_title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !query || searchable.includes(query);
    });
  }, [employees, employeeSearch]);

  const filteredReports = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase();
    return reports.filter((report) => {
      const division = divisions.find((item) => item.id === report.division_id);
      const searchable = [report.report_number, report.work_summary, division?.name, division?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesQuery = !query || searchable.includes(query);
      const matchesStatus = archiveStatus === 'all' || report.status === archiveStatus;
      const matchesDivision = archiveDivision === 'all' || report.division_id === archiveDivision;
      return matchesQuery && matchesStatus && matchesDivision;
    });
  }, [reports, divisions, archiveSearch, archiveStatus, archiveDivision]);

  const submittedCount = reports.filter((report) => report.status === 'submitted').length;
  const approvedCount = reports.filter((report) => report.status === 'approved').length;
  const draftCount = reports.filter((report) => report.status === 'draft' || report.status === 'rejected').length;
  const totalHok = sum(laborRows.map((row) => Number(row.hok || 0)));
  const totalWorkers = laborRows.length;
  const totalWorkItems = workRows.filter((row) => row.package_item_id && Number(row.quantity_today) > 0).length;
  const totalMaterialRows = materialRows.filter((row) => row.material_name.trim() && Number(row.quantity_used) > 0).length;

  /* ------------------------------------------------------------------------ */
  /* Workspace loader                                                         */
  /* ------------------------------------------------------------------------ */

  const loadWorkspace = useCallback(async (refresh = false) => {
    if (!projectId) return;

    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError('');
    setSuccess('');

    try {
      const access = await getMyAccess();
      const { supabase } = await import('@/lib/supabase');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      setUserId(authData.user?.id ?? '');

      const createPermission =
        hasPermission(access, 'execution.report.create', projectId) ||
        hasPermission(access, 'project.manage', projectId);
      const reviewPermission =
        hasPermission(access, 'execution.progress.review', projectId) ||
        hasPermission(access, 'project.manage', projectId);
      const readPermission =
        createPermission ||
        reviewPermission ||
        hasPermission(access, 'execution.read', projectId) ||
        hasPermission(access, 'report.read', projectId);

      if (!readPermission) {
        throw new Error('Akun tidak memiliki akses laporan pada proyek ini. Minta admin memeriksa hak akses proyek.');
      }

      setCanCreate(createPermission);
      setCanReview(reviewPermission);
      setCanRead(readPermission);

      const workspace = await fetchDailyReportWorkspace(projectId);
      setProject(workspace.project);
      setDivisions(workspace.divisions);
      setPackageItems(workspace.packageItems);
      setReports(workspace.reports);
      setDivisionId((current) =>
        current && workspace.divisions.some((division) => division.id === current)
          ? current
          : workspace.divisions[0]?.id ?? '',
      );
      setWorkspaceReady(true);
    } catch (caught) {
      setWorkspaceReady(false);
      setError(caught instanceof Error ? caught.message : 'Gagal memuat workspace laporan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  /* ------------------------------------------------------------------------ */
  /* Personnel roster loader                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!workspaceReady || !projectId || !divisionId || !canRead) {
      setEmployees([]);
      return;
    }

    let cancelled = false;
    setEmployeeLoading(true);
    setEmployeeError('');

    fetchProjectReportEmployees(projectId, reportDate, divisionId)
      .then((rows) => {
        if (cancelled) return;
        setEmployees(rows);
        setEmployeeError('');
      })
      .catch((caught) => {
        if (cancelled) return;
        setEmployees([]);
        setEmployeeError(caught instanceof Error ? caught.message : 'Roster Personalia gagal dimuat.');
      })
      .finally(() => {
        if (!cancelled) setEmployeeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceReady, projectId, divisionId, reportDate, canRead]);

  /* ------------------------------------------------------------------------ */
  /* Reset and wizard lifecycle                                               */
  /* ------------------------------------------------------------------------ */

  const resetForm = useCallback(() => {
    setEditingReportId(null);
    setEditingReportNumber('');
    setWizardStep(0);
    setReportDate(todayJakarta());
    setDivisionId((current) => current || divisions[0]?.id || '');
    setWeather('clear');
    setFieldCondition('');
    setSummary('');
    setStartTime('07:30');
    setEndTime('16:00');
    setObstacles('');
    setFollowUp('');
    setWorkRows([emptyWorkRow()]);
    setLaborRows([]);
    setMaterialRows([]);
    setEquipmentRows([]);
    setItemSearch('');
    setEmployeeSearch('');
    setError('');
  }, [divisions]);

  const openNewWizard = () => {
    resetForm();
    setSuccess('');
    setWizardOpen(true);
  };

  const closeWizard = () => {
    if (saving) return;
    setWizardOpen(false);
    setItemPickerOpen(false);
    setEmployeePickerOpen(false);
  };

  /* ------------------------------------------------------------------------ */
  /* Add database item into daily report work rows                            */
  /* ------------------------------------------------------------------------ */

  const addWorkItem = (item: DailyReportPackageItem) => {
    const alreadyAdded = workRows.some((row) => row.package_item_id === item.id);
    if (alreadyAdded) {
      setError(`Item “${item.item_name}” sudah ada pada daftar realisasi.`);
      return;
    }

    setWorkRows((rows) => [
      ...rows.filter((row) => row.package_item_id || row.quantity_today || row.notes),
      { ...emptyWorkRow(), package_item_id: item.id },
    ]);
    setItemPickerOpen(false);
    setItemSearch('');
    setError('');
  };

  const updateWorkRow = (index: number, patch: Partial<DailyWorkInput>) => {
    setWorkRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeWorkRow = (index: number) => {
    setWorkRows((rows) => {
      const next = rows.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [emptyWorkRow()];
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Add employee from the Personalia RPC roster                              */
  /* ------------------------------------------------------------------------ */

  const addEmployee = (employee: DailyReportEmployee) => {
    if (laborRows.some((row) => row.employee_id === employee.id)) {
      setError(`${employee.full_name} sudah dimasukkan ke daftar tenaga kerja.`);
      return;
    }

    setLaborRows((rows) => [
      ...rows,
      {
        ...emptyLaborRow(),
        employee_id: employee.id,
        employee_name: employee.full_name,
        position: employee.position_title ?? '',
        daily_assignment_id: employee.daily_assignment_id ?? '',
      },
    ]);
    setEmployeePickerOpen(false);
    setEmployeeSearch('');
    setError('');
  };

  const updateLaborRow = (index: number, patch: Partial<DailyLaborInput>) => {
    setLaborRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeLaborRow = (index: number) => {
    setLaborRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  /* ------------------------------------------------------------------------ */
  /* Material and equipment editors                                           */
  /* ------------------------------------------------------------------------ */

  const updateMaterialRow = (index: number, patch: Partial<DailyMaterialInput>) => {
    setMaterialRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeMaterialRow = (index: number) => {
    setMaterialRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const updateEquipmentRow = (index: number, patch: Partial<DailyEquipmentInput>) => {
    setEquipmentRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeEquipmentRow = (index: number) => {
    setEquipmentRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  /* ------------------------------------------------------------------------ */
  /* Validation                                                               */
  /* ------------------------------------------------------------------------ */

  const validateCurrentStep = (): string | null => {
    if (wizardStep === 0) {
      if (!reportDate) return 'Tanggal laporan wajib dipilih.';
      if (reportDate > todayJakarta()) return 'Tanggal laporan tidak boleh di masa mendatang.';
      if (!divisionId) return 'Pilih divisi/lokasi pekerjaan terlebih dahulu.';
      if (startTime && endTime && endTime <= startTime) return 'Jam selesai harus setelah jam mulai.';
    }

    if (wizardStep === 1) {
      const valid = workRows.filter((row) => row.package_item_id && Number(row.quantity_today) > 0);
      if (workRows.some((row) => row.quantity_today && Number(row.quantity_today) <= 0)) {
        return 'Volume realisasi harus lebih besar dari nol.';
      }
      if (workRows.some((row) => row.quantity_today && !row.package_item_id)) {
        return 'Pilih item RAB/paket untuk setiap volume yang diisi.';
      }
      if (valid.length === 0) {
        return 'Masukkan minimal satu realisasi volume pekerjaan.';
      }
      const duplicateIds = valid.map((row) => row.package_item_id);
      if (new Set(duplicateIds).size !== duplicateIds.length) {
        return 'Terdapat item RAB yang terpilih lebih dari satu kali.';
      }
    }

    if (wizardStep === 2) {
      const duplicateIds = laborRows.map((row) => row.employee_id).filter(Boolean);
      if (new Set(duplicateIds).size !== duplicateIds.length) {
        return 'Satu karyawan hanya boleh dicatat satu kali pada satu laporan.';
      }
      const invalidHours = laborRows.some((row) => Number(row.hours_worked) < 0 || Number(row.hours_worked) > 24);
      if (invalidHours) return 'Jam kerja personel harus berada pada rentang 0–24 jam.';
      const invalidHok = laborRows.some((row) => Number(row.hok) < 0 || Number(row.hok) > 3);
      if (invalidHok) return 'Nilai HOK harus berada pada rentang 0–3.';
    }

    if (wizardStep === 3) {
      const invalidMaterial = materialRows.some((row) => row.material_name.trim() && Number(row.quantity_used) <= 0);
      if (invalidMaterial) return 'Jumlah penggunaan material harus lebih besar dari nol.';
      const invalidEquipment = equipmentRows.some((row) => row.equipment_name.trim() && Number(row.quantity) <= 0);
      if (invalidEquipment) return 'Jumlah peralatan harus lebih besar dari nol.';
    }

    if (wizardStep === 4) {
      if (!summary.trim()) return 'Ringkasan pekerjaan hari ini wajib diisi.';
    }

    return null;
  };

  const goNext = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setWizardStep((step) => Math.min(step + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => {
    setError('');
    setWizardStep((step) => Math.max(step - 1, 0));
  };

  const jumpToStep = (step: number) => {
    if (step > wizardStep) return;
    setError('');
    setWizardStep(step);
  };

  /* ------------------------------------------------------------------------ */
  /* Save draft and submit with transactional RPC                              */
  /* ------------------------------------------------------------------------ */

  const persistReport = async (submitForReview: boolean) => {
    if (!divisionId) {
      setError('Pilih divisi/lokasi pekerjaan terlebih dahulu.');
      setWizardStep(0);
      return;
    }

    if (submitForReview) {
      const missing = !summary.trim() ? 'Ringkasan pekerjaan wajib diisi.' : null;
      const noWork = !workRows.some((row) => row.package_item_id && Number(row.quantity_today) > 0);
      if (missing || noWork) {
        setError(missing ?? 'Minimal satu item realisasi volume harus diisi.');
        setWizardStep(missing ? 4 : 1);
        return;
      }
      if (reportDate > todayJakarta()) {
        setError('Tanggal laporan tidak boleh di masa mendatang.');
        setWizardStep(0);
        return;
      }
    }

    const validWork = workRows.filter((row) => row.package_item_id && Number(row.quantity_today) > 0);
    const validLabor = laborRows.filter((row) => row.employee_id);
    const validMaterials = materialRows.filter((row) => row.material_name.trim() && Number(row.quantity_used) > 0);
    const validEquipment = equipmentRows.filter((row) => row.equipment_name.trim());

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const reportId = await saveDailyReport({
        report_id: editingReportId,
        project_id: projectId,
        division_id: divisionId,
        report_date: reportDate,
        weather,
        field_condition: fieldCondition,
        work_summary: summary,
        start_time: startTime,
        end_time: endTime,
        obstacles,
        follow_up: followUp,
        submit: submitForReview,
        work_items: validWork.map((row) => ({
          package_item_id: row.package_item_id,
          segment_item_id: row.segment_item_id || null,
          quantity_today: Number(row.quantity_today),
          notes: row.notes,
        })),
        labor: validLabor.map((row) => ({
          employee_id: row.employee_id,
          daily_assignment_id: row.daily_assignment_id || null,
          position_snapshot: row.position,
          attendance_status: row.attendance_status,
          hours_worked: Number(row.hours_worked),
          hok: Number(row.hok),
          overtime_hours: Number(row.overtime_hours),
          notes: row.notes,
        })),
        materials: validMaterials.map((row) => ({
          material_name: row.material_name.trim(),
          unit: row.unit.trim(),
          quantity_used: Number(row.quantity_used),
          estimated_waste_quantity: Number(row.estimated_waste_quantity || 0),
          notes: row.notes,
        })),
        equipment: validEquipment.map((row) => ({
          equipment_name: row.equipment_name.trim(),
          quantity: Number(row.quantity),
          hours_used: Number(row.hours_used),
          condition_status: row.condition_status,
          cost_estimate: Number(row.cost_estimate),
          notes: row.notes,
        })),
      });

      setWizardOpen(false);
      setItemPickerOpen(false);
      setEmployeePickerOpen(false);
      setSuccess(
        submitForReview
          ? `Laporan ${reportId.slice(0, 8)} berhasil diajukan dan menunggu verifikasi pengawas.`
          : `Draft laporan ${reportId.slice(0, 8)} berhasil disimpan.`,
      );
      resetForm();
      await loadWorkspace(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan laporan harian.');
    } finally {
      setSaving(false);
    }
  };

  const handleWizardSaveDraft = () => void persistReport(false);
  const handleWizardSubmit = () => void persistReport(true);

  /* ------------------------------------------------------------------------ */
  /* Reopen a saved draft or returned report                                  */
  /* ------------------------------------------------------------------------ */

  const continueDraft = async (row: DailyReportRecord) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const detail = await fetchDailyReportDetails(row.id);
      setEditingReportId(row.id);
      setEditingReportNumber(row.report_number);
      setReportDate(row.report_date.slice(0, 10));
      setDivisionId(row.division_id);
      setWeather(row.weather);
      setFieldCondition(row.field_condition ?? '');
      setSummary(row.work_summary ?? '');
      setStartTime(row.start_time?.slice(0, 5) ?? '07:30');
      setEndTime(row.end_time?.slice(0, 5) ?? '16:00');
      setObstacles(row.obstacles ?? '');
      setFollowUp(row.follow_up ?? '');

      setWorkRows(
        detail.work.length
          ? detail.work.map((item: any) => ({
              package_item_id: item.package_item_id ?? '',
              segment_item_id: item.segment_item_id ?? '',
              quantity_today: String(item.quantity_today ?? ''),
              notes: item.notes ?? '',
            }))
          : [emptyWorkRow()],
      );

      setLaborRows(
        detail.labor.map((item: any) => ({
          employee_id: item.employee_id ?? '',
          employee_name: item.employee_name_snapshot ?? '',
          position: item.position_snapshot ?? '',
          daily_assignment_id: item.daily_assignment_id ?? '',
          attendance_status: item.attendance_status ?? 'present',
          hours_worked: String(item.hours_worked ?? 8),
          hok: String(item.hok ?? 1),
          overtime_hours: String(item.overtime_hours ?? 0),
          notes: item.notes ?? '',
        })),
      );

      setMaterialRows(
        detail.materials.map((item: any) => ({
          material_name: item.material_name ?? '',
          unit: item.unit ?? '',
          quantity_used: String(item.quantity_used ?? ''),
          estimated_waste_quantity: String(item.estimated_waste_quantity ?? 0),
          notes: item.notes ?? '',
        })),
      );

      setEquipmentRows(
        detail.equipment.map((item: any) => ({
          equipment_name: item.equipment_name ?? '',
          quantity: String(item.quantity ?? 1),
          hours_used: String(item.hours_used ?? 0),
          condition_status: item.condition_status ?? 'good',
          cost_estimate: String(item.cost_estimate ?? 0),
          notes: item.notes ?? '',
        })),
      );

      setWizardStep(0);
      setWizardOpen(true);
      setSuccess(`Melanjutkan ${row.report_number}. Perbaiki data lalu simpan draft atau ajukan kembali.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuka draft laporan.');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Review modal workflow                                                    */
  /* ------------------------------------------------------------------------ */

  const openReview = (row: DailyReportRecord, decision: 'approved' | 'rejected') => {
    setReviewTarget(row);
    setReviewDecision(decision);
    setReviewNotes('');
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (reviewDecision === 'rejected' && reviewNotes.trim().length < 5) {
      setError('Alasan pengembalian minimal 5 karakter.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await reviewDailyReport(reviewTarget.id, reviewDecision, reviewNotes);
      setReviewTarget(null);
      setSuccess(
        reviewDecision === 'approved'
          ? `${reviewTarget.report_number} telah disetujui.`
          : `${reviewTarget.report_number} dikembalikan untuk diperbaiki.`,
      );
      await loadWorkspace(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memproses pemeriksaan laporan.');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* PDF / print export                                                       */
  /* ------------------------------------------------------------------------ */

  const exportPdf = async (row: DailyReportRecord) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      setError('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const detail = await fetchDailyReportPrintData(row.id);
      const report = detail.report as any;
      const projectInfo = detail.project as any;
      const division = detail.division as any;
      const author = detail.author as any;
      const reviewer = detail.reviewer as any;
      const work = detail.work as any[];
      const labor = detail.labor as any[];
      const materials = detail.materials as any[];
      const equipment = detail.equipment as any[];

      const renderTable = (headers: string[], rows: string[][]) => `
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.length
              ? rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
              : `<tr><td class="empty" colspan="${headers.length}">Tidak ada data.</td></tr>`}
          </tbody>
        </table>`;

      const workRowsForPrint = work.map((item) => [
        item.rab_code ?? '—',
        item.item_name ?? '—',
        item.rab_quantity == null ? '—' : formatNumber(item.rab_quantity),
        formatNumber(item.quantity_today),
        item.unit ?? '—',
        item.notes ?? '—',
      ]);

      const laborRowsForPrint = labor.map((item) => [
        item.employee_name_snapshot ?? '—',
        item.position_snapshot ?? '—',
        attendanceLabel(item.attendance_status),
        `${formatNumber(item.hours_worked, 2)} jam`,
        formatNumber(item.hok),
        `${formatNumber(item.overtime_hours, 2)} jam`,
        item.notes ?? '—',
      ]);

      const materialRowsForPrint = materials.map((item) => [
        item.material_name ?? '—',
        item.unit ?? '—',
        formatNumber(item.quantity_used),
        formatNumber(item.estimated_waste_quantity),
        item.notes ?? '—',
      ]);

      const equipmentRowsForPrint = equipment.map((item) => [
        item.equipment_name ?? '—',
        formatNumber(item.quantity, 2),
        `${formatNumber(item.hours_used, 2)} jam`,
        equipmentConditionLabel(item.condition_status),
        formatCurrency(item.cost_estimate),
        item.notes ?? '—',
      ]);

      const createdAt = new Date().toISOString();
      const html = `<!doctype html>
        <html lang="id">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(report.report_number)} - Laporan Harian</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #172033; font: 10px/1.5 Arial, Helvetica, sans-serif; }
            .topline { height: 7px; background: #087a5b; margin-bottom: 18px; }
            .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 13px; }
            .brand small { color: #087a5b; font-size: 8px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
            h1 { margin: 5px 0 3px; font-size: 21px; line-height: 1.2; }
            .sub { margin: 0; color: #64748b; }
            .number { border: 1px solid #a7d7c8; border-radius: 7px; color: #075c45; padding: 7px 10px; font-weight: 700; white-space: nowrap; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 18px; margin: 15px 0; padding: 12px; border-radius: 8px; background: #f1f5f9; }
            .meta b { display: block; margin-bottom: 2px; color: #64748b; font-size: 7px; letter-spacing: .8px; text-transform: uppercase; }
            .meta span { font-weight: 700; }
            h2 { margin: 18px 0 7px; padding-bottom: 5px; border-bottom: 1px solid #b7d8cd; color: #087a5b; font-size: 11px; }
            p { margin: 4px 0; white-space: pre-wrap; }
            .note { margin: 7px 0; padding: 9px 11px; border-left: 3px solid #0b8060; background: #f8fafc; }
            table { width: 100%; border-collapse: collapse; margin: 7px 0 12px; page-break-inside: auto; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            th { background: #e8f3ef; color: #14533f; font-size: 7px; text-align: left; text-transform: uppercase; }
            td, th { border: 1px solid #dbe2e8; padding: 6px 7px; vertical-align: top; }
            td { font-size: 8px; }
            .empty { color: #64748b; text-align: center; }
            .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 32px; page-break-inside: avoid; }
            .sign div { min-height: 75px; text-align: center; }
            .line { width: 72%; margin: 45px auto 3px; border-bottom: 1px solid #64748b; }
            .footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 18px; padding-top: 7px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 7px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="topline"></div>
          <header class="brand">
            <div>
              <small>Dahlia Management System · ${escapeHtml(projectInfo?.title ?? 'Project Management')}</small>
              <h1>Laporan Pelaksanaan Proyek Harian</h1>
              <p class="sub">Dokumen kontrol pelaksanaan lapangan dan realisasi pekerjaan</p>
            </div>
            <div class="number">${escapeHtml(report.report_number)}</div>
          </header>
          <section class="meta">
            <div><b>Nama proyek</b><span>${escapeHtml(projectInfo?.title ?? '—')}</span></div>
            <div><b>Klien</b><span>${escapeHtml(projectInfo?.client || '—')}</span></div>
            <div><b>Lokasi proyek</b><span>${escapeHtml(projectInfo?.location || '—')}</span></div>
            <div><b>Divisi / lokasi RAB</b><span>${escapeHtml(division?.code ? `${division.code} · ${division.name}` : division?.name ?? '—')}</span></div>
            <div><b>Tanggal laporan</b><span>${escapeHtml(formatDate(report.report_date))}</span></div>
            <div><b>Mandor / pelapor</b><span>${escapeHtml(author?.full_name ?? '—')}</span></div>
            <div><b>Cuaca</b><span>${escapeHtml(weatherLabel(report.weather))}</span></div>
            <div><b>Jam kerja</b><span>${escapeHtml(String(report.start_time ?? '—').slice(0, 5))} – ${escapeHtml(String(report.end_time ?? '—').slice(0, 5))} WIB</span></div>
            <div><b>Status</b><span>${escapeHtml(STATUS_CONFIG[report.status as DailyReportStatus]?.label ?? report.status)}</span></div>
            <div><b>Diajukan pada</b><span>${escapeHtml(formatDateTime(report.submitted_at))} WIB</span></div>
          </section>
          <h2>1. Kondisi dan Ringkasan Lapangan</h2>
          <p><b>Kondisi lapangan:</b> ${escapeHtml(report.field_condition || '—')}</p>
          <div class="note"><b>Ringkasan pekerjaan:</b><p>${escapeHtml(report.work_summary || '—')}</p></div>
          <p><b>Kendala:</b> ${escapeHtml(report.obstacles || 'Tidak ada kendala yang dicatat.')}</p>
          <p><b>Tindak lanjut:</b> ${escapeHtml(report.follow_up || '—')}</p>
          <h2>2. Realisasi Volume Pekerjaan (Paket Pelaksanaan / RAB)</h2>
          ${renderTable(['Kode RAB','Uraian pekerjaan','Volume paket','Realisasi hari ini','Satuan','Catatan'], workRowsForPrint)}
          <h2>3. Tenaga Kerja dan Kehadiran</h2>
          ${renderTable(['Nama pekerja','Jabatan','Kehadiran','Jam kerja','HOK','Lembur','Catatan'], laborRowsForPrint)}
          <p><b>Total personel:</b> ${labor.length} orang &nbsp; <b>Total HOK:</b> ${formatNumber(sum(labor.map((item) => Number(item.hok || 0))))}</p>
          <h2>4. Pemakaian Material</h2>
          ${renderTable(['Material','Satuan','Jumlah dipakai','Estimasi waste','Catatan'], materialRowsForPrint)}
          <p class="sub">Catatan pemakaian material tidak mengurangi stok gudang. Pengurangan stok tetap mengikuti transaksi Gudang.</p>
          <h2>5. Peralatan dan Alat Kerja</h2>
          ${renderTable(['Nama alat','Jumlah','Jam pakai','Kondisi','Estimasi biaya','Catatan'], equipmentRowsForPrint)}
          <h2>6. Pemeriksaan dan Pengesahan</h2>
          <p><b>Catatan pemeriksa:</b> ${escapeHtml(report.review_notes || 'Belum ada catatan pemeriksaan.')}</p>
          <p><b>Diperiksa oleh:</b> ${escapeHtml(reviewer?.full_name ?? '—')} ${report.reviewed_at ? `· ${escapeHtml(formatDateTime(report.reviewed_at))} WIB` : ''}</p>
          <div class="sign">
            <div>Mandor / Pelapor<div class="line"></div><b>${escapeHtml(author?.full_name ?? '')}</b></div>
            <div>Pengawas Proyek<div class="line"></div><b>${escapeHtml(reviewer?.full_name ?? '')}</b></div>
          </div>
          <div class="footer"><span>${escapeHtml(report.report_number)} · ${escapeHtml(projectInfo?.title ?? '—')}</span><span>Dicetak ${escapeHtml(formatDateTime(createdAt))} WIB · Dokumen sistem</span></div>
        </body>
        </html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } catch (caught) {
      printWindow.close();
      setError(caught instanceof Error ? caught.message : 'Gagal menyiapkan dokumen PDF.');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Render states                                                            */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center rounded-3xl border border-slate-200 bg-white px-10 py-9 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Loader2 className="h-7 w-7 animate-spin" />
          </span>
          <h1 className="mt-4 text-base font-bold text-slate-900">Menyiapkan laporan proyek</h1>
          <p className="mt-1 text-xs text-slate-500">Memuat paket pekerjaan, divisi, dan arsip laporan.</p>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Main workspace                                                           */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-[#f5f7f8] pb-16">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {/* Workspace title bar */}
        <header className="relative overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 right-1/3 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div className="min-w-0">
              <Link
                href={`/proyek/${projectId}/pelaksanaan-pekerjaan`}
                className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-300 transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Kembali ke Pusat Pelaksanaan
              </Link>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-emerald-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-300/20">
                  <ClipboardList className="h-4 w-4" />
                </span>
                Dahlia · Project Daily Report
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Laporan Pelaksanaan Harian</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {project?.title ?? 'Proyek'} · Catat realisasi paket RAB, tenaga kerja, material, dan kondisi lapangan dalam satu laporan terstruktur.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-300">
                {project?.client ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Klien: {project.client}</span> : null}
                {project?.location ? <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><MapPin className="h-3 w-3" />{project.location}</span> : null}
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">{formatDate(todayJakarta())}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => void loadWorkspace(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/10 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
              </button>
              {canCreate ? (
                <button type="button" onClick={openNewWizard} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-400">
                  <Plus className="h-4 w-4" /> Buat Laporan
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Feedback banners */}
        {error && !wizardOpen && !itemPickerOpen && !employeePickerOpen && !reviewTarget ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 leading-6">{error}</p>
            <button type="button" onClick={() => setError('')} className={BUTTON_GHOST}><X className="h-4 w-4" /></button>
          </div>
        ) : null}
        {success ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 leading-6">{success}</p>
            <button type="button" onClick={() => setSuccess('')} className={BUTTON_GHOST}><X className="h-4 w-4" /></button>
          </div>
        ) : null}

        {/* Snapshot metrics */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total laporan" value={reports.length} detail="Arsip untuk proyek ini" icon={ClipboardList} tone="slate" />
          <MetricCard label="Menunggu verifikasi" value={submittedCount} detail="Perlu pemeriksaan pengawas" icon={Clock3} tone="amber" />
          <MetricCard label="Disetujui" value={approvedCount} detail="Laporan yang sudah diperiksa" icon={ShieldCheck} tone="emerald" />
          <MetricCard label="Draft / perbaikan" value={draftCount} detail="Masih perlu dilengkapi" icon={FileClock} tone="blue" />
        </section>

        {/* Workspace readiness */}
        {!workspaceReady && error ? (
          <InlineNotice title="Workspace belum siap" tone="danger">
            Periksa migration 017, hak akses proyek, dan koneksi Supabase. Setelah masalah diperbaiki, tekan tombol Segarkan.
          </InlineNotice>
        ) : null}

        {/* Database integration summary */}
        <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Integrasi pelaksanaan</p>
                <h2 className="mt-1 text-base font-bold text-slate-900">Sumber data laporan</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Form mengambil daftar pekerjaan dari paket pelaksanaan dan daftar pekerja dari Personalia.</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Layers3 className="h-5 w-5" /></span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold text-slate-500">Divisi RAB</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{divisions.length}</p>
                <p className="mt-1 text-[10px] text-slate-400">Dari proyek terpilih</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold text-slate-500">Item paket RAB</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{packageItems.length}</p>
                <p className="mt-1 text-[10px] text-slate-400">Dari paket pelaksanaan</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold text-slate-500">Roster personel</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{employees.length}</p>
                <p className="mt-1 text-[10px] text-slate-400">Tanggal/divisi terpilih</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Info className="h-5 w-5" /></span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Aturan pencatatan</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Jejak harian tidak mengambil alih transaksi dari modul lain.</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-600">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />AHSP dan baseline RAB tidak diubah oleh realisasi harian.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />Pemakaian material tidak mengurangi stok gudang dua kali.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />HOK dicatat sebagai data operasional, bukan pembayaran payroll.</li>
            </ul>
          </article>
        </section>

        {/* Archive */}
        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-700">Project journal</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Arsip Laporan Harian</h2>
              <p className="mt-1 text-xs text-slate-500">Daftar laporan setiap mandor, divisi, dan tanggal pada proyek ini.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[680px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Cari nomor / pekerjaan" className={`${INPUT_CLASS} pl-9`} />
              </label>
              <label>
                <span className="sr-only">Filter status</span>
                <select value={archiveStatus} onChange={(event) => setArchiveStatus(event.target.value)} className={INPUT_CLASS}>
                  <option value="all">Semua status</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Menunggu verifikasi</option>
                  <option value="approved">Disetujui</option>
                  <option value="rejected">Perlu perbaikan</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter divisi</span>
                <select value={archiveDivision} onChange={(event) => setArchiveDivision(event.target.value)} className={INPUT_CLASS}>
                  <option value="all">Semua divisi</option>
                  {divisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} · ` : ''}{division.name}</option>)}
                </select>
              </label>
            </div>
          </header>

          {filteredReports.length === 0 ? (
            <div className="p-6 sm:p-10">
              <EmptyState
                icon={ClipboardList}
                title={reports.length ? 'Tidak ada laporan yang cocok' : 'Belum ada laporan harian'}
                description={reports.length ? 'Ubah kata kunci atau filter status/divisi untuk melihat laporan lain.' : 'Buat laporan pertama dari tombol Buat Laporan. Setiap laporan akan tersimpan dalam arsip proyek.'}
                action={canCreate && !reports.length ? <button type="button" onClick={openNewWizard} className={BUTTON_PRIMARY}><Plus className="h-4 w-4" /> Buat laporan pertama</button> : undefined}
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredReports.map((report) => {
                const division = divisions.find((item) => item.id === report.division_id);
                const canEdit = (report.status === 'draft' || report.status === 'rejected') && report.created_by === userId;
                return (
                  <article key={report.id} className="flex flex-col gap-4 p-5 transition hover:bg-slate-50/70 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${report.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : report.status === 'submitted' ? 'bg-amber-50 text-amber-700' : report.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-800">{report.report_number}</span>
                          <StatusPill status={report.status} />
                        </div>
                        <h3 className="mt-1.5 truncate text-sm font-bold text-slate-900">{division?.name ?? 'Divisi tidak ditemukan'}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{report.work_summary || 'Belum ada ringkasan pekerjaan.'}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateShort(report.report_date)}</span>
                          <span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" />{weatherLabel(report.weather)}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{String(report.start_time ?? '—').slice(0, 5)}–{String(report.end_time ?? '—').slice(0, 5)}</span>
                        </div>
                        {report.review_notes ? (
                          <p className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                            <b>Catatan pemeriksa:</b> {report.review_notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <button type="button" onClick={() => setPreviewReport(report)} className={BUTTON_SECONDARY}><Eye className="h-4 w-4" /> Detail</button>
                      <button type="button" onClick={() => void exportPdf(report)} disabled={saving} className={BUTTON_SECONDARY}><Printer className="h-4 w-4" /> Cetak / PDF</button>
                      {canEdit ? <button type="button" onClick={() => void continueDraft(report)} disabled={saving} className={BUTTON_SECONDARY}><FileText className="h-4 w-4" /> Perbaiki</button> : null}
                      {canReview && report.status === 'submitted' ? (
                        <>
                          <button type="button" onClick={() => openReview(report, 'rejected')} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50">Kembalikan</button>
                          <button type="button" onClick={() => openReview(report, 'approved')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-3 text-xs font-bold text-white transition hover:bg-emerald-800"><ShieldCheck className="h-4 w-4" /> Setujui</button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Wizard modal                                                         */}
      {/* -------------------------------------------------------------------- */}

      {wizardOpen ? (
        <ModalFrame
          title={editingReportId ? `Perbaiki ${editingReportNumber}` : 'Buat Laporan Harian'}
          description="Isi laporan secara bertahap. Data tersimpan melalui satu transaksi database saat draft disimpan atau laporan diajukan."
          onClose={closeWizard}
          size="max-w-6xl"
          footer={
            <WizardFooter
              currentStep={wizardStep}
              saving={saving}
              isEditing={Boolean(editingReportId)}
              onBack={goBack}
              onNext={goNext}
              onClose={closeWizard}
              onSaveDraft={handleWizardSaveDraft}
              onSubmit={handleWizardSubmit}
            />
          }
        >
          <div className="space-y-6">
            <WizardProgress currentStep={wizardStep} onSelect={jumpToStep} />

            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Step 1: Report context */}
            {wizardStep === 0 ? (
              <div className="space-y-6">
                <SectionHeading
                  eyebrow="Langkah 01 · Identitas laporan"
                  title="Tentukan waktu dan lokasi pekerjaan"
                  description="Satu laporan dibuat untuk satu mandor/pengguna, satu divisi, dan satu tanggal."
                  icon={CalendarDays}
                />

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Tanggal laporan" required hint="Tanggal mengikuti zona waktu Asia/Jakarta.">
                    <input type="date" max={todayJakarta()} value={reportDate} onChange={(event) => setReportDate(event.target.value)} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Divisi / lokasi RAB" required hint="Daftar pekerjaan akan mengikuti divisi ini.">
                    <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} className={INPUT_CLASS}>
                      <option value="">Pilih divisi pekerjaan</option>
                      {divisions.map((division) => (
                        <option key={division.id} value={division.id}>{division.code ? `${division.code} · ` : ''}{division.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Jam mulai">
                    <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Jam selesai">
                    <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={INPUT_CLASS} />
                  </Field>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600">Kondisi cuaca</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {WEATHER_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = weather === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => setWeather(option.value)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />{option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Kondisi lapangan" hint="Misalnya akses lokasi, kondisi tanah, area kerja, ketersediaan listrik/air, dan kondisi K3.">
                  <textarea rows={4} value={fieldCondition} onChange={(event) => setFieldCondition(event.target.value)} className={INPUT_CLASS} placeholder="Jelaskan kondisi aktual area pekerjaan..." />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Proyek</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{project?.title ?? '—'}</p>
                    <p className="mt-1 text-xs text-slate-500">{project?.client || 'Klien tidak dicantumkan'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Divisi terpilih</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{selectedDivision?.name ?? 'Belum dipilih'}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedDivision?.code ?? 'Pilih divisi dari daftar proyek'}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Step 2: Work package items */}
            {wizardStep === 1 ? (
              <div className="space-y-5">
                <SectionHeading
                  eyebrow="Langkah 02 · Output pekerjaan"
                  title="Catat realisasi item RAB"
                  description="Item diambil dari project_work_package_items yang terhubung ke proyek/divisi terpilih. Pilih item melalui jendela pencarian, lalu masukkan volume yang dikerjakan hari ini."
                  icon={HardHat}
                  action={<button type="button" onClick={() => setItemPickerOpen(true)} className={BUTTON_PRIMARY}><Plus className="h-4 w-4" /> Pilih Item RAB</button>}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500">Item tersedia pada divisi</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{divisionItems.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500">Item yang dilaporkan</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{totalWorkItems}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500">Total item paket proyek</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{packageItems.length}</p>
                  </div>
                </div>

                {divisionItems.length === 0 ? (
                  <InlineNotice title="Belum ada item paket untuk divisi ini" tone="warning">
                    Item laporan diambil dari paket pelaksanaan, bukan langsung dari daftar RAB mentah. Buka Pusat Pelaksanaan, buat paket pekerjaan dari item RAB divisi ini, lalu kembali ke wizard. Tidak ada item RAB yang akan dibuat otomatis dari laporan harian.
                    <div className="mt-3"><Link href={`/proyek/${projectId}/pelaksanaan-pekerjaan`} className="inline-flex items-center gap-2 font-bold underline underline-offset-2">Buka Pusat Pelaksanaan <ArrowRight className="h-3.5 w-3.5" /></Link></div>
                  </InlineNotice>
                ) : null}

                <div className="space-y-3">
                  {workRows.map((row, index) => {
                    const item = divisionItems.find((candidate) => candidate.id === row.package_item_id);
                    const quantity = Number(row.quantity_today || 0);
                    return (
                      <article key={`${row.package_item_id || 'new'}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-800">{String(index + 1).padStart(2, '0')}</span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{item?.item_name ?? 'Pilih item RAB / paket pekerjaan'}</p>
                                <p className="mt-0.5 text-[10px] text-slate-400">{item ? `${item.package_number} · ${item.package_name}` : 'Belum ada item dipilih'}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item?.rab_code ? <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">{item.rab_code}</span> : null}
                              {item ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Paket {item.package_status ?? 'active'}</span> : null}
                              {item ? <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Baseline {formatNumber(item.planned_quantity)} {item.unit}</span> : null}
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[150px_110px] lg:w-[300px]">
                            <Field label="Volume hari ini" required>
                              <input type="number" min="0.001" step="0.001" value={row.quantity_today} onChange={(event) => updateWorkRow(index, { quantity_today: event.target.value })} className={INPUT_CLASS} placeholder="0.000" />
                            </Field>
                            <Field label="Satuan">
                              <input value={item?.unit ?? '—'} readOnly className={`${INPUT_CLASS} bg-slate-100`} />
                            </Field>
                          </div>
                          <button type="button" onClick={() => removeWorkRow(index)} className="mt-5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-100 text-rose-600 transition hover:bg-rose-50" aria-label="Hapus item pekerjaan">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {item ? (
                          <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
                            <div><p className="text-[10px] text-slate-400">Volume paket</p><p className="mt-1 text-sm font-bold text-slate-800">{formatNumber(item.planned_quantity)} {item.unit}</p></div>
                            <div><p className="text-[10px] text-slate-400">Harga referensi</p><p className="mt-1 text-sm font-bold text-slate-800">{formatCurrency(item.reference_unit_price)} / {item.unit}</p></div>
                            <div><p className="text-[10px] text-slate-400">Estimasi nilai realisasi</p><p className="mt-1 text-sm font-bold text-emerald-800">{formatCurrency(quantity * item.reference_unit_price)}</p></div>
                          </div>
                        ) : null}

                        {item?.components_snapshot?.length ? (
                          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800"><Layers3 className="h-3.5 w-3.5" /> Snapshot komponen AHSP</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {item.components_snapshot.map((component, componentIndex) => (
                                <div key={`${component.name}-${componentIndex}`} className="flex items-start justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-[10px]">
                                  <div className="min-w-0"><p className="font-semibold text-slate-700">{component.name}</p><p className="text-slate-400">{component.type} · koef. {formatNumber(component.coefficient, 4)}</p></div>
                                  <div className="shrink-0 text-right"><p className="font-bold text-emerald-800">{formatNumber(Number(component.coefficient) * quantity)} {component.unit}</p><p className="text-slate-400">{formatCurrency(component.unit_price)}</p></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : item ? (
                          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">Snapshot koefisien AHSP belum tersedia pada sumber item RAB ini.</p>
                        ) : null}

                        <Field label="Catatan item" className="mt-3">
                          <input value={row.notes} onChange={(event) => updateWorkRow(index, { notes: event.target.value })} className={INPUT_CLASS} placeholder="Lokasi detail, metode, hasil, atau keterangan..." />
                        </Field>
                      </article>
                    );
                  })}
                </div>

                <button type="button" onClick={() => setItemPickerOpen(true)} className={`${BUTTON_SECONDARY} w-full border-dashed`}>
                  <Plus className="h-4 w-4" /> Tambah item dari database paket RAB
                </button>

                <InlineNotice title="Integritas baseline RAB" tone="info">
                  Volume RAB dan snapshot AHSP hanya dibaca. Realisasi hari ini disimpan sebagai catatan harian dan tidak mengubah volume kontrak atau nilai dasar RAB.
                </InlineNotice>
              </div>
            ) : null}

            {/* Step 3: Personnel */}
            {wizardStep === 2 ? (
              <div className="space-y-5">
                <SectionHeading
                  eyebrow="Langkah 03 · Tenaga kerja"
                  title="Pilih personel dari database Personalia"
                  description="Roster diambil berdasarkan proyek, tanggal laporan, dan divisi. Sumbernya adalah penempatan proyek aktif atau penugasan harian yang belum dibatalkan."
                  icon={Users}
                  action={<button type="button" onClick={() => setEmployeePickerOpen(true)} className={BUTTON_PRIMARY}><UserPlus className="h-4 w-4" /> Pilih Karyawan</button>}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Karyawan pada roster</p><p className="mt-1 text-xl font-bold text-slate-900">{employeeLoading ? '…' : employees.length}</p></div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Personel yang dicatat</p><p className="mt-1 text-xl font-bold text-slate-900">{totalWorkers}</p></div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Akumulasi HOK</p><p className="mt-1 text-xl font-bold text-emerald-800">{formatNumber(totalHok)}</p></div>
                </div>

                {employeeError ? (
                  <InlineNotice title="Roster Personalia belum dapat dimuat" tone="danger">{employeeError}</InlineNotice>
                ) : null}

                {employeeLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat roster karyawan untuk tanggal dan divisi ini...</div>
                ) : null}

                {!employeeLoading && !employeeError && employees.length === 0 ? (
                  <InlineNotice title="Tidak ada karyawan pada roster proyek" tone="warning">
                    Pastikan karyawan berstatus aktif dan mempunyai Penempatan Proyek (Migration 008) yang mencakup tanggal laporan atau Penugasan Harian proyek (Migration 009). Divisi penugasan harus sesuai dengan divisi yang dipilih atau tidak ditentukan.
                    <div className="mt-2 text-[11px]">Tanggal pencarian: <b>{formatDate(reportDate)}</b> · Divisi: <b>{selectedDivision?.name ?? '—'}</b></div>
                  </InlineNotice>
                ) : null}

                {laborRows.length === 0 ? (
                  <EmptyState icon={Users} title="Belum ada tenaga kerja yang dicatat" description="Pilih pekerja dari roster Personalia. Nama dan jabatan diambil dari master karyawan dan disimpan sebagai snapshot pada laporan." action={<button type="button" onClick={() => setEmployeePickerOpen(true)} className={BUTTON_SECONDARY}><UserPlus className="h-4 w-4" /> Pilih Karyawan</button>} />
                ) : (
                  <div className="space-y-3">
                    {laborRows.map((row, index) => (
                      <article key={row.employee_id || index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UserCheck className="h-5 w-5" /></span>
                            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{row.employee_name}</p><p className="mt-0.5 text-[10px] text-slate-500">{row.position || 'Jabatan belum diisi'} · Personalia</p></div>
                          </div>
                          <button type="button" onClick={() => removeLaborRow(index)} className="inline-flex items-center gap-1 self-start rounded-lg px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 sm:self-auto"><Trash2 className="h-3.5 w-3.5" /> Hapus</button>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <Field label="Kehadiran">
                            <select value={row.attendance_status} onChange={(event) => updateLaborRow(index, { attendance_status: event.target.value })} className={INPUT_CLASS}>{ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                          </Field>
                          <Field label="Jam kerja">
                            <input type="number" min="0" max="24" step="0.5" value={row.hours_worked} onChange={(event) => updateLaborRow(index, { hours_worked: event.target.value })} className={INPUT_CLASS} />
                          </Field>
                          <Field label="HOK">
                            <input type="number" min="0" max="3" step="0.125" value={row.hok} onChange={(event) => updateLaborRow(index, { hok: event.target.value })} className={INPUT_CLASS} />
                          </Field>
                          <Field label="Lembur (jam)">
                            <input type="number" min="0" max="24" step="0.5" value={row.overtime_hours} onChange={(event) => updateLaborRow(index, { overtime_hours: event.target.value })} className={INPUT_CLASS} />
                          </Field>
                        </div>
                        <Field label="Catatan personel" className="mt-3">
                          <input value={row.notes} onChange={(event) => updateLaborRow(index, { notes: event.target.value })} className={INPUT_CLASS} placeholder="Tugas khusus, perpindahan area, atau catatan..." />
                        </Field>
                      </article>
                    ))}
                  </div>
                )}

                <InlineNotice title="Bukan transaksi payroll" tone="info">
                  Jam kerja dan HOK adalah data lapangan. Catatan ini tidak membuat pembayaran, potongan, maupun perubahan slip gaji otomatis.
                </InlineNotice>
              </div>
            ) : null}

            {/* Step 4: Resources */}
            {wizardStep === 3 ? (
              <div className="space-y-6">
                <SectionHeading
                  eyebrow="Langkah 04 · Sumber daya"
                  title="Material dan peralatan yang digunakan"
                  description="Catat penggunaan aktual, termasuk waste atau kondisi peralatan. Data ini menjadi catatan laporan harian."
                  icon={Package}
                />

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Package className="h-5 w-5" /></span><div><h4 className="text-sm font-bold text-slate-900">Pemakaian material</h4><p className="text-[10px] text-slate-500">Nama, satuan, volume, estimasi waste dan catatan.</p></div></div>
                    <button type="button" onClick={() => setMaterialRows((rows) => [...rows, emptyMaterialRow()])} className={BUTTON_SECONDARY}><Plus className="h-4 w-4" /> Tambah Material</button>
                  </div>

                  {materialRows.length === 0 ? (
                    <div className="mt-4"><EmptyState icon={Package} title="Belum ada material dicatat" description="Tambahkan material yang digunakan hari ini. Anda boleh melewati bagian ini bila tidak ada pemakaian material yang perlu dilaporkan." /></div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {materialRows.map((row, index) => (
                        <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_.5fr_.7fr_.7fr_auto]">
                          <Field label="Nama material"><input value={row.material_name} onChange={(event) => updateMaterialRow(index, { material_name: event.target.value })} className={INPUT_CLASS} placeholder="Semen, pasir, besi..." /></Field>
                          <Field label="Satuan"><input value={row.unit} onChange={(event) => updateMaterialRow(index, { unit: event.target.value })} className={INPUT_CLASS} placeholder="sak, m³, kg" /></Field>
                          <Field label="Jumlah dipakai"><input type="number" min="0" step="0.001" value={row.quantity_used} onChange={(event) => updateMaterialRow(index, { quantity_used: event.target.value })} className={INPUT_CLASS} placeholder="0" /></Field>
                          <Field label="Estimasi waste"><input type="number" min="0" step="0.001" value={row.estimated_waste_quantity} onChange={(event) => updateMaterialRow(index, { estimated_waste_quantity: event.target.value })} className={INPUT_CLASS} placeholder="0" /></Field>
                          <button type="button" onClick={() => removeMaterialRow(index)} className="mt-5 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-600 hover:bg-rose-50" aria-label="Hapus material"><Trash2 className="h-4 w-4" /></button>
                          <Field label="Catatan material" className="sm:col-span-2 xl:col-span-4"><input value={row.notes} onChange={(event) => updateMaterialRow(index, { notes: event.target.value })} className={INPUT_CLASS} placeholder="Asal material, kualitas, kondisi penyimpanan..." /></Field>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Wrench className="h-5 w-5" /></span><div><h4 className="text-sm font-bold text-slate-900">Peralatan dan alat kerja</h4><p className="text-[10px] text-slate-500">Jumlah, jam penggunaan, kondisi dan estimasi biaya.</p></div></div>
                    <button type="button" onClick={() => setEquipmentRows((rows) => [...rows, emptyEquipmentRow()])} className={BUTTON_SECONDARY}><Plus className="h-4 w-4" /> Tambah Peralatan</button>
                  </div>

                  {equipmentRows.length === 0 ? (
                    <div className="mt-4"><EmptyState icon={Wrench} title="Belum ada alat yang dicatat" description="Tambahkan alat kerja atau peralatan yang digunakan. Bagian ini dapat dilewati bila tidak ada peralatan khusus." /></div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {equipmentRows.map((row, index) => (
                        <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_.55fr_.65fr_.9fr_.8fr_auto]">
                          <Field label="Nama alat"><input value={row.equipment_name} onChange={(event) => updateEquipmentRow(index, { equipment_name: event.target.value })} className={INPUT_CLASS} placeholder="Concrete mixer, molen..." /></Field>
                          <Field label="Jumlah"><input type="number" min="0.01" step="0.01" value={row.quantity} onChange={(event) => updateEquipmentRow(index, { quantity: event.target.value })} className={INPUT_CLASS} /></Field>
                          <Field label="Jam pakai"><input type="number" min="0" step="0.5" value={row.hours_used} onChange={(event) => updateEquipmentRow(index, { hours_used: event.target.value })} className={INPUT_CLASS} /></Field>
                          <Field label="Kondisi"><select value={row.condition_status} onChange={(event) => updateEquipmentRow(index, { condition_status: event.target.value })} className={INPUT_CLASS}>{EQUIPMENT_CONDITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                          <Field label="Estimasi biaya"><input type="number" min="0" step="1000" value={row.cost_estimate} onChange={(event) => updateEquipmentRow(index, { cost_estimate: event.target.value })} className={INPUT_CLASS} /></Field>
                          <button type="button" onClick={() => removeEquipmentRow(index)} className="mt-5 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-600 hover:bg-rose-50" aria-label="Hapus peralatan"><Trash2 className="h-4 w-4" /></button>
                          <Field label="Catatan peralatan" className="sm:col-span-2 xl:col-span-5"><input value={row.notes} onChange={(event) => updateEquipmentRow(index, { notes: event.target.value })} className={INPUT_CLASS} placeholder="Kondisi khusus, jam rusak, atau lokasi alat..." /></Field>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <InlineNotice title="Pengamanan stok gudang" tone="warning">
                  Catatan pemakaian material pada formulir ini tidak melakukan pengurangan stok. Apabila material sudah dikeluarkan melalui transaksi Gudang, jangan lakukan pengeluaran kedua kali dari laporan harian.
                </InlineNotice>
              </div>
            ) : null}

            {/* Step 5: Summary and constraints */}
            {wizardStep === 4 ? (
              <div className="space-y-5">
                <SectionHeading
                  eyebrow="Langkah 05 · Narasi lapangan"
                  title="Ceritakan hasil, kendala dan tindak lanjut"
                  description="Ringkasan ini menjadi bagian utama laporan yang dibaca pengawas dan manajemen proyek."
                  icon={ClipboardCheck}
                />

                <Field label="Ringkasan pekerjaan hari ini" required hint="Sebutkan aktivitas utama, lokasi detail, metode kerja dan hasil yang sudah dicapai.">
                  <textarea rows={6} value={summary} onChange={(event) => setSummary(event.target.value)} className={INPUT_CLASS} placeholder="Contoh: Pekerjaan pasangan dinding sisi timur mencapai ... m². Tim melakukan ... dengan kondisi ..." />
                </Field>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Kendala lapangan" hint="Material terlambat, cuaca, tenaga, alat, desain, akses, atau faktor lain.">
                    <textarea rows={5} value={obstacles} onChange={(event) => setObstacles(event.target.value)} className={INPUT_CLASS} placeholder="Tuliskan kendala yang terjadi hari ini..." />
                  </Field>
                  <Field label="Tindak lanjut" hint="Tuliskan tindakan, penanggung jawab, serta target penyelesaian bila diketahui.">
                    <textarea rows={5} value={followUp} onChange={(event) => setFollowUp(event.target.value)} className={INPUT_CLASS} placeholder="Tuliskan langkah tindak lanjut yang dibutuhkan..." />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data realisasi</p><p className="mt-2 text-2xl font-bold text-slate-900">{totalWorkItems}</p><p className="text-xs text-slate-500">item pekerjaan dengan volume</p></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data personel</p><p className="mt-2 text-2xl font-bold text-slate-900">{totalWorkers}</p><p className="text-xs text-slate-500">orang · {formatNumber(totalHok)} HOK</p></div>
                </div>
              </div>
            ) : null}

            {/* Step 6: Review */}
            {wizardStep === 5 ? (
              <div className="space-y-5">
                <SectionHeading
                  eyebrow="Langkah 06 · Pemeriksaan akhir"
                  title="Periksa laporan sebelum dikirim"
                  description="Pastikan tanggal, divisi, ringkasan, volume, dan tenaga kerja sudah sesuai dengan kondisi lapangan."
                  icon={FileCheck2}
                />

                <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-300">Ringkasan laporan</p><h3 className="mt-2 text-xl font-bold">{project?.title ?? 'Proyek'} </h3><p className="mt-1 text-xs text-slate-300">{selectedDivision?.name ?? 'Divisi belum dipilih'} · {formatDate(reportDate)}</p></div>
                    <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200">{editingReportId ? editingReportNumber : 'Laporan baru'}</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-slate-400">Item pekerjaan</p><p className="mt-1 text-xl font-bold">{totalWorkItems}</p></div>
                    <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-slate-400">Tenaga kerja</p><p className="mt-1 text-xl font-bold">{totalWorkers}</p></div>
                    <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-slate-400">Total HOK</p><p className="mt-1 text-xl font-bold">{formatNumber(totalHok)}</p></div>
                    <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-slate-400">Material</p><p className="mt-1 text-xl font-bold">{totalMaterialRows}</p></div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-900">Informasi dan kondisi</h4><button type="button" onClick={() => jumpToStep(0)} className="text-[10px] font-bold text-emerald-700">Ubah</button></div>
                    <dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-400">Tanggal</dt><dd className="text-right font-semibold text-slate-700">{formatDate(reportDate)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Cuaca</dt><dd className="text-right font-semibold text-slate-700">{weatherLabel(weather)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Jam</dt><dd className="text-right font-semibold text-slate-700">{startTime}–{endTime} WIB</dd></div></dl>
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">{fieldCondition || 'Kondisi lapangan belum dicatat.'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-900">Ringkasan pekerjaan</h4><button type="button" onClick={() => jumpToStep(4)} className="text-[10px] font-bold text-emerald-700">Ubah</button></div>
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{summary || 'Belum diisi.'}</p>
                    <div className="mt-3 border-t border-slate-100 pt-3 text-[10px] text-slate-400">{obstacles ? `Kendala: ${obstacles}` : 'Tidak ada kendala yang dicatat.'}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-900">Rincian realisasi pekerjaan</h4><button type="button" onClick={() => jumpToStep(1)} className="text-[10px] font-bold text-emerald-700">Ubah</button></div>
                  {workRows.filter((row) => row.package_item_id).length ? (
                    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="rounded-l-lg px-3 py-2">Item</th><th className="px-3 py-2">Paket</th><th className="px-3 py-2 text-right">Volume</th><th className="rounded-r-lg px-3 py-2">Satuan</th></tr></thead><tbody className="divide-y divide-slate-100">{workRows.filter((row) => row.package_item_id).map((row, index) => { const item = divisionItems.find((candidate) => candidate.id === row.package_item_id); return <tr key={index}><td className="px-3 py-3 font-semibold text-slate-700">{item?.item_name ?? 'Item tidak lagi tersedia'}</td><td className="px-3 py-3 text-slate-500">{item?.package_number ?? '—'}</td><td className="px-3 py-3 text-right font-bold text-slate-800">{formatNumber(row.quantity_today)}</td><td className="px-3 py-3 text-slate-500">{item?.unit ?? '—'}</td></tr>; })}</tbody></table></div>
                  ) : <p className="mt-3 text-xs text-slate-400">Belum ada item pekerjaan.</p>}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-900">Tenaga kerja</h4><button type="button" onClick={() => jumpToStep(2)} className="text-[10px] font-bold text-emerald-700">Ubah</button></div>
                  {laborRows.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{laborRows.map((row, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-700">{row.employee_name}</p><p className="text-[10px] text-slate-400">{attendanceLabel(row.attendance_status)} · {row.position || '—'}</p></div><span className="shrink-0 text-xs font-bold text-emerald-800">{formatNumber(row.hok)} HOK</span></div>)}</div> : <p className="mt-3 text-xs text-slate-400">Belum ada personel yang dicatat.</p>}
                </div>

                <InlineNotice title="Sebelum diajukan" tone="success">
                  Setelah diajukan, status laporan berubah menjadi Menunggu verifikasi. Pengawas proyek dapat menyetujui atau mengembalikan laporan dengan catatan. Laporan yang disetujui tidak dapat diedit melalui wizard mandor.
                </InlineNotice>
              </div>
            ) : null}
          </div>
        </ModalFrame>
      ) : null}

      {/* -------------------------------------------------------------------- */}
      {/* RAB item picker modal                                                */}
      {/* -------------------------------------------------------------------- */}

      {itemPickerOpen ? (
        <ModalFrame
          title="Pilih item pekerjaan dari paket RAB"
          description={`Sumber: paket pelaksanaan proyek · ${selectedDivision?.name ?? 'Divisi belum dipilih'}. Item mentah yang belum masuk paket tidak ditambahkan langsung ke laporan.`}
          onClose={() => setItemPickerOpen(false)}
          size="max-w-5xl"
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_260px]">
              <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} className={`${INPUT_CLASS} pl-9`} placeholder="Cari kode RAB, nama pekerjaan, paket..." /></label>
              <select value={itemPackageFilter} onChange={(event) => setItemPackageFilter(event.target.value)} className={INPUT_CLASS}><option value="all">Semua paket ({divisionItems.length})</option>{packageNames.map((packageName) => <option key={packageName.id} value={packageName.id}>{packageName.label}</option>)}</select>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400"><span>{filteredPackageItems.length} item ditemukan</span><span>Divisi: {selectedDivision?.code ?? '—'} · {selectedDivision?.name ?? '—'}</span></div>

            {filteredPackageItems.length === 0 ? (
              <EmptyState icon={Search} title="Item tidak ditemukan" description={divisionItems.length ? 'Periksa kata kunci atau pilih filter semua paket.' : 'Belum ada item paket yang terhubung ke divisi ini. Tambahkan lingkup dari Pusat Pelaksanaan terlebih dahulu.'} action={!divisionItems.length ? <Link href={`/proyek/${projectId}/pelaksanaan-pekerjaan`} className={BUTTON_SECONDARY}>Buka Pusat Pelaksanaan <ArrowRight className="h-4 w-4" /></Link> : undefined} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredPackageItems.map((item) => {
                  const isAdded = workRows.some((row) => row.package_item_id === item.id);
                  return (
                    <article key={item.id} className={`rounded-2xl border p-4 transition ${isAdded ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5">{item.rab_code ? <span className="font-mono text-[10px] font-bold text-emerald-700">{item.rab_code}</span> : null}<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{item.package_number}</span></div><h3 className="mt-2 text-sm font-bold leading-5 text-slate-900">{item.item_name}</h3><p className="mt-1 text-[10px] text-slate-400">{item.package_name}</p></div>
                        <span className="shrink-0 rounded-xl bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{item.unit}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3"><div><p className="text-[9px] text-slate-400">Volume paket</p><p className="mt-1 text-xs font-bold text-slate-800">{formatNumber(item.planned_quantity)} {item.unit}</p></div><div><p className="text-[9px] text-slate-400">Harga satuan</p><p className="mt-1 text-xs font-bold text-slate-800">{formatCurrency(item.reference_unit_price)}</p></div></div>
                      {item.components_snapshot?.length ? <p className="mt-3 text-[10px] text-emerald-700">AHSP tersedia · {item.components_snapshot.length} komponen</p> : <p className="mt-3 text-[10px] text-amber-700">Snapshot AHSP tidak tersedia</p>}
                      <button type="button" onClick={() => addWorkItem(item)} disabled={isAdded} className={`mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-bold transition ${isAdded ? 'cursor-not-allowed bg-emerald-100 text-emerald-700' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
                        {isAdded ? <><Check className="mr-1 inline h-3.5 w-3.5" /> Sudah ditambahkan</> : <><Plus className="mr-1 inline h-3.5 w-3.5" /> Tambahkan ke laporan</>}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </ModalFrame>
      ) : null}

      {/* -------------------------------------------------------------------- */}
      {/* Employee picker modal                                                */}
      {/* -------------------------------------------------------------------- */}

      {employeePickerOpen ? (
        <ModalFrame
          title="Pilih tenaga kerja dari Personalia"
          description={`Roster proyek sesuai tanggal ${formatDate(reportDate)} dan divisi ${selectedDivision?.name ?? '—'}. Karyawan tidak dibuat manual di formulir ini.`}
          onClose={() => setEmployeePickerOpen(false)}
          size="max-w-4xl"
        >
          <div className="space-y-4">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} className={`${INPUT_CLASS} pl-9`} placeholder="Cari nama, nomor karyawan, atau jabatan..." /></label>
            {employeeLoading ? <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar karyawan...</div> : null}
            {employeeError ? <InlineNotice title="Gagal memuat roster" tone="danger">{employeeError}</InlineNotice> : null}
            {!employeeLoading && !employeeError && filteredEmployees.length === 0 ? <EmptyState icon={Users} title="Tidak ada karyawan cocok" description="Periksa kata kunci, tanggal laporan, divisi, dan penempatan karyawan pada proyek." /> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredEmployees.map((employee) => {
                const added = laborRows.some((row) => row.employee_id === employee.id);
                return (
                  <button type="button" key={employee.id} onClick={() => addEmployee(employee)} disabled={added} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${added ? 'border-emerald-200 bg-emerald-50/70 opacity-80' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Users className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{employee.full_name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{employee.employee_number || 'Tanpa nomor'} · {employee.position_title || 'Jabatan belum diisi'}</span><span className="mt-1 block text-[9px] font-semibold text-emerald-700">{employee.assignment_source === 'daily_assignment' ? 'Penugasan harian' : 'Penempatan proyek'}</span></span>
                    <span className="shrink-0">{added ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Plus className="h-5 w-5 text-slate-400" />}</span>
                  </button>
                );
              })}
            </div>
            <InlineNotice title="Catatan sumber personel" tone="info">
              Karyawan yang tampil harus berstatus aktif dan mempunyai penempatan yang mencakup tanggal laporan. Apabila karyawan belum muncul, periksa Penempatan Proyek atau Penugasan Harian pada menu Personalia.
            </InlineNotice>
          </div>
        </ModalFrame>
      ) : null}

      {/* -------------------------------------------------------------------- */}
      {/* Report preview modal                                                 */}
      {/* -------------------------------------------------------------------- */}

      {previewReport ? (
        <ModalFrame
          title={`Detail ${previewReport.report_number}`}
          description={`${formatDate(previewReport.report_date)} · ${divisions.find((item) => item.id === previewReport.division_id)?.name ?? 'Divisi'}`}
          onClose={() => setPreviewReport(null)}
          size="max-w-3xl"
          footer={<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPreviewReport(null)} className={BUTTON_SECONDARY}>Tutup</button><button type="button" onClick={() => void exportPdf(previewReport)} className={BUTTON_PRIMARY}><Printer className="h-4 w-4" /> Cetak / PDF</button></div>}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={previewReport.status} /><span className="text-xs text-slate-400">{weatherLabel(previewReport.weather)} · {String(previewReport.start_time ?? '—').slice(0, 5)}–{String(previewReport.end_time ?? '—').slice(0, 5)} WIB</span></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ringkasan pekerjaan</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{previewReport.work_summary || 'Belum ada ringkasan.'}</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-400">Kondisi lapangan</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{previewReport.field_condition || '—'}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-400">Kendala dan tindak lanjut</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{previewReport.obstacles || 'Tidak ada kendala.'}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{previewReport.follow_up || '—'}</p></div></div>
            {previewReport.review_notes ? <InlineNotice title="Catatan pemeriksa" tone={previewReport.status === 'rejected' ? 'warning' : 'info'}>{previewReport.review_notes}</InlineNotice> : null}
            <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500"><p>Dibuat: {formatDateTime(previewReport.created_at)}</p><p className="mt-1">Diajukan: {formatDateTime(previewReport.submitted_at)}</p><p className="mt-1">Diperiksa: {formatDateTime(previewReport.reviewed_at)}</p></div>
          </div>
        </ModalFrame>
      ) : null}

      {/* -------------------------------------------------------------------- */}
      {/* Review decision modal                                                */}
      {/* -------------------------------------------------------------------- */}

      {reviewTarget ? (
        <ModalFrame
          title={reviewDecision === 'approved' ? 'Setujui laporan harian' : 'Kembalikan laporan untuk perbaikan'}
          description={`${reviewTarget.report_number} · ${formatDate(reviewTarget.report_date)}`}
          onClose={() => setReviewTarget(null)}
          size="max-w-xl"
          footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setReviewTarget(null)} className={BUTTON_SECONDARY} disabled={saving}>Batal</button><button type="button" onClick={() => void submitReview()} disabled={saving} className={reviewDecision === 'approved' ? BUTTON_PRIMARY : 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50'}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : reviewDecision === 'approved' ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{reviewDecision === 'approved' ? 'Ya, setujui laporan' : 'Kembalikan laporan'}</button></div>}
        >
          <div className="space-y-4">
            <InlineNotice title={reviewDecision === 'approved' ? 'Konfirmasi persetujuan' : 'Alasan perbaikan wajib dicatat'} tone={reviewDecision === 'approved' ? 'success' : 'warning'}>
              {reviewDecision === 'approved' ? 'Setelah disetujui, laporan menjadi arsip yang tidak dapat diedit oleh pembuat laporan.' : 'Tuliskan alasan yang spesifik agar mandor dapat melakukan perbaikan yang tepat.'}
            </InlineNotice>
            <Field label={reviewDecision === 'approved' ? 'Catatan pemeriksaan (opsional)' : 'Alasan pengembalian'} required={reviewDecision === 'rejected'}>
              <textarea rows={4} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className={INPUT_CLASS} placeholder={reviewDecision === 'approved' ? 'Catatan pemeriksaan, bila ada...' : 'Jelaskan bagian yang harus diperbaiki...'} />
            </Field>
          </div>
        </ModalFrame>
      ) : null}
    </main>
  );
}
