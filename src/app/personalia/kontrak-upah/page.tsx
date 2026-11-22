'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Banknote, CalendarClock, CheckCircle2, ChevronRight,
  Clock3, FileText, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  assignEmployeePayrollComponent, assignEmployeeWorkSchedule, closeCompensationProfile,
  closeEmployeePayrollComponent, closeEmployeeWorkSchedule, closeWorkAgreement,
  createCompensationProfile, createPayrollComponent, createPayrollScheme,
  createWorkAgreement, createWorkSchedule, fetchPayrollFoundationData, updateAgreementStatus,
  setPayrollComponentActive, setPayrollSchemeActive, setWorkScheduleActive,
} from '@/lib/services/payrollFoundationService';
import type {
  AgreementStatus, AgreementType, ComponentMethod, ComponentType, PayrollFoundationData,
  PayBasis, TaxTreatment,
} from '@/types/payrollFoundation';

const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50';
const LABEL = 'block text-xs font-semibold text-slate-600';
const EMPTY_DATA: PayrollFoundationData = {
  employees: [], agreements: [], schemes: [], compensationProfiles: [], components: [],
  employeeComponents: [], schedules: [], employeeSchedules: [],
};

type Tab = 'agreements' | 'rates' | 'components' | 'schedules';
const TABS: Array<{ id: Tab; label: string; description: string; icon: typeof FileText }> = [
  { id: 'agreements', label: 'Perjanjian Kerja', description: 'Kontrak dan riwayat hubungan kerja', icon: FileText },
  { id: 'rates', label: 'Skema & Tarif', description: 'Dasar dan tarif upah per karyawan', icon: Banknote },
  { id: 'components', label: 'Komponen Upah', description: 'Tunjangan, insentif, dan potongan', icon: Wallet },
  { id: 'schedules', label: 'Jadwal Kerja', description: 'Pola hari dan jam kerja', icon: CalendarClock },
];
const AGREEMENT_LABELS: Record<AgreementType, string> = {
  pkwtt: 'PKWTT / Tidak tertentu', pkwt: 'PKWT / Waktu tertentu', daily: 'Perjanjian kerja harian',
  internship: 'Pemagangan', freelance: 'Freelance / Jasa', other: 'Lainnya',
};
const AGREEMENT_STATUS: Record<AgreementStatus, string> = {
  draft: 'Draft', active: 'Aktif', ended: 'Berakhir', cancelled: 'Dibatalkan',
};
const BASIS_LABELS: Record<PayBasis, string> = {
  monthly: 'Bulanan', daily: 'Harian', hourly: 'Per jam', piecework: 'Borongan / satuan hasil',
};
const METHOD_LABELS: Record<ComponentMethod, string> = {
  fixed: 'Nominal tetap', percentage_of_base: 'Persentase dari tarif dasar',
  per_day: 'Nominal per hari', per_hour: 'Nominal per jam', manual: 'Diisi saat proses penggajian',
};
const WEEKDAYS = [
  { value: 1, label: 'Sen' }, { value: 2, label: 'Sel' }, { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' }, { value: 5, label: 'Jum' }, { value: 6, label: 'Sab' }, { value: 7, label: 'Min' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}
function dateText(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function rupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Mengikuti hasil pekerjaan';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}
function dateToday(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'rose' | 'slate' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700', blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', slate: 'bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}
function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4"><h2 className="font-bold text-slate-900">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>{children}</section>;
}

function EmployeeMultiPicker({ title, employees, selectedIds, onChange }: { title: string; employees: PayrollFoundationData['employees']; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = employees.filter((employee) => `${employee.employee_number} ${employee.full_name}`.toLocaleLowerCase('id').includes(query.trim().toLocaleLowerCase('id')));
  const visible = filtered.slice(0, 24);
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2"><p className={LABEL}>{title}</p><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">{selectedIds.length} dipilih</span></div><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Cari nama / nomor karyawan..." className={INPUT+ ' pl-9'}/></label><div className="grid gap-2 sm:grid-cols-2">{visible.map((employee)=><label key={employee.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 ${selectedIds.includes(employee.id)?'border-emerald-300 bg-emerald-50':'border-slate-200 hover:bg-slate-50'}`}><input type="checkbox" checked={selectedIds.includes(employee.id)} onChange={(event)=>onChange(event.target.checked?[...selectedIds,employee.id]:selectedIds.filter((id)=>id!==employee.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700"/><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{employee.full_name}</span><span className="block truncate text-[10px] text-slate-500">{employee.employee_number}</span></span></label>)}</div>{filtered.length>24&&<p className="text-[10px] text-slate-400">Menampilkan 24 dari {filtered.length} hasil. Tambahkan kata pencarian agar lebih cepat menemukan nama.</p>}<div className="flex gap-2"><button type="button" onClick={()=>onChange(filtered.map((item)=>item.id))} className="text-[10px] font-semibold text-emerald-700 hover:underline">Pilih hasil pencarian</button><button type="button" onClick={()=>onChange([])} className="text-[10px] font-semibold text-slate-500 hover:underline">Hapus pilihan</button></div></div>;
}

function PayrollFoundationContent() {
  const [data, setData] = useState<PayrollFoundationData>(EMPTY_DATA);
  const [tab, setTab] = useState<Tab>('agreements');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canManagePayroll, setCanManagePayroll] = useState(false);
  const [canManageSchedule, setCanManageSchedule] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Perjanjian kerja
  const [agreementEmployee, setAgreementEmployee] = useState('');
  const [agreementEmployeeIds, setAgreementEmployeeIds] = useState<string[]>([]);
  const [agreementType, setAgreementType] = useState<AgreementType>('pkwtt');
  const [agreementTitle, setAgreementTitle] = useState('');
  const [agreementNumberRef, setAgreementNumberRef] = useState('');
  const [agreementSignedDate, setAgreementSignedDate] = useState('');
  const [agreementStart, setAgreementStart] = useState(dateToday());
  const [agreementEnd, setAgreementEnd] = useState('');
  const [agreementStatus, setAgreementStatus] = useState<AgreementStatus>('draft');
  const [agreementDescription, setAgreementDescription] = useState('');
  const [agreementNotes, setAgreementNotes] = useState('');

  // Skema & tarif
  const [schemeCode, setSchemeCode] = useState('');
  const [schemeName, setSchemeName] = useState('');
  const [schemeBasis, setSchemeBasis] = useState<PayBasis>('monthly');
  const [schemeDescription, setSchemeDescription] = useState('');
  const [rateEmployee, setRateEmployee] = useState('');
  const [rateEmployeeIds, setRateEmployeeIds] = useState<string[]>([]);
  const [rateAgreement, setRateAgreement] = useState('');
  const [rateScheme, setRateScheme] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [rateStart, setRateStart] = useState(dateToday());
  const [rateEnd, setRateEnd] = useState('');
  const [rateNotes, setRateNotes] = useState('');

  // Komponen dan penetapannya
  const [componentCode, setComponentCode] = useState('');
  const [componentName, setComponentName] = useState('');
  const [componentType, setComponentType] = useState<ComponentType>('earning');
  const [componentMethod, setComponentMethod] = useState<ComponentMethod>('fixed');
  const [componentTax, setComponentTax] = useState<TaxTreatment>('review_required');
  const [componentRecurring, setComponentRecurring] = useState(true);
  const [componentDescription, setComponentDescription] = useState('');
  const [assignComponentEmployee, setAssignComponentEmployee] = useState('');
  const [assignComponentEmployeeIds, setAssignComponentEmployeeIds] = useState<string[]>([]);
  const [assignComponentId, setAssignComponentId] = useState('');
  const [assignComponentAmount, setAssignComponentAmount] = useState('');
  const [assignComponentPercentage, setAssignComponentPercentage] = useState('');
  const [assignComponentStart, setAssignComponentStart] = useState(dateToday());
  const [assignComponentNotes, setAssignComponentNotes] = useState('');

  // Jadwal kerja
  const [scheduleCode, setScheduleCode] = useState('');
  const [scheduleName, setScheduleName] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [scheduleStart, setScheduleStart] = useState('08:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [graceMinutes, setGraceMinutes] = useState('10');
  const [scheduleFlexible, setScheduleFlexible] = useState(false);
  const [scheduleDescription, setScheduleDescription] = useState('');
  const [assignScheduleEmployee, setAssignScheduleEmployee] = useState('');
  const [assignScheduleEmployeeIds, setAssignScheduleEmployeeIds] = useState<string[]>([]);
  const [assignScheduleId, setAssignScheduleId] = useState('');
  const [assignScheduleStart, setAssignScheduleStart] = useState(dateToday());
  const [assignScheduleNotes, setAssignScheduleNotes] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [loaded, access] = await Promise.all([fetchPayrollFoundationData(), getMyAccess()]);
      setData(loaded);
      setCanManagePayroll(hasPermission(access, 'payroll.manage'));
      setCanManageSchedule(hasPermission(access, 'attendance.schedule.manage'));
      setRateScheme((current) => current || loaded.schemes.find((item) => item.is_active)?.id || loaded.schemes[0]?.id || '');
      setAssignComponentId((current) => current || loaded.components.find((item) => item.is_active)?.id || '');
      setAssignScheduleId((current) => current || loaded.schedules.find((item) => item.is_active)?.id || '');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeEmployees = useMemo(() => data.employees.filter((employee) => employee.status === 'active'), [data.employees]);
  const selectedScheme = data.schemes.find((item) => item.id === rateScheme);
  const selectedComponent = data.components.find((item) => item.id === assignComponentId);
  const agreementsForRateEmployee = data.agreements.filter((item) => item.employee_id === rateEmployee && (item.status === 'draft' || item.status === 'active'));
  const activeRates = data.compensationProfiles.filter((item) => item.effective_from <= dateToday() && (!item.effective_to || item.effective_to >= dateToday()));
  const activeEmployeeSchedules = data.employeeSchedules.filter((item) => item.effective_from <= dateToday() && (!item.effective_to || item.effective_to >= dateToday()));

  async function runTask(task: () => Promise<void>, message: string): Promise<boolean> {
    if (saving) return false;
    setSaving(true); setError(''); setSuccess('');
    try { await task(); setSuccess(message); await load(true); return true; }
    catch (err) { setError(errorText(err)); return false; }
    finally { setSaving(false); }
  }

  async function submitAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = agreementEmployeeIds.length ? agreementEmployeeIds : (agreementEmployee ? [agreementEmployee] : []);
    if (!targets.length) { setError('Pilih minimal satu karyawan.'); return; }
    const failedIds: string[] = []; const failures: string[] = []; let completed = 0;
    const ok = await runTask(async () => {
      for (const employee_id of targets) {
        try {
          await createWorkAgreement({ employee_id, agreement_type: agreementType, agreement_title: agreementTitle,
            signed_date: agreementSignedDate || null, start_date: agreementStart, end_date: agreementEnd || null,
            status: agreementStatus, document_reference: agreementNumberRef || null,
            work_description: agreementDescription || null, notes: agreementNotes || null });
          completed += 1;
        } catch (cause) { failedIds.push(employee_id); failures.push(`${activeEmployees.find((item)=>item.id===employee_id)?.full_name ?? employee_id}: ${errorText(cause)}`); }
      }
    }, `${completed} perjanjian kerja berhasil dibuat${targets.length-completed ? `; ${targets.length-completed} gagal` : ''}.`);
    if (ok) {
      setAgreementEmployeeIds(failedIds); setAgreementEmployee('');
      if (!failures.length) { setAgreementTitle(''); setAgreementNumberRef(''); setAgreementSignedDate(''); setAgreementEnd(''); setAgreementDescription(''); setAgreementNotes(''); }
      if (failures.length) setError(failures.slice(0,3).join(' | '));
    }
  }

  async function submitScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await runTask(() => createPayrollScheme({
      scheme_code: schemeCode, scheme_name: schemeName, pay_basis: schemeBasis,
      description: schemeDescription || null, sort_order: 100,
    }), 'Skema upah berhasil ditambahkan.');
    if (ok) { setSchemeCode(''); setSchemeName(''); setSchemeDescription(''); }
  }

  async function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = rateEmployeeIds.length ? rateEmployeeIds : (rateEmployee ? [rateEmployee] : []);
    if (!targets.length) { setError('Pilih minimal satu karyawan untuk tarif.'); return; }
    const failedIds: string[] = []; const failures: string[] = []; let completed = 0;
    const ok = await runTask(async () => {
      for (const employee_id of targets) {
        try {
          await createCompensationProfile({ employee_id, agreement_id: targets.length === 1 ? (rateAgreement || null) : null, payroll_scheme_id: rateScheme,
            base_rate: selectedScheme?.pay_basis === 'piecework' ? null : Number(baseRate),
            effective_from: rateStart, effective_to: rateEnd || null, notes: rateNotes || null });
          completed += 1;
        } catch (cause) { failedIds.push(employee_id); failures.push(`${activeEmployees.find((item)=>item.id===employee_id)?.full_name ?? employee_id}: ${errorText(cause)}`); }
      }
    }, `Tarif ${BASIS_LABELS[selectedScheme?.pay_basis ?? 'monthly'].toLowerCase()} diterapkan kepada ${completed} karyawan${failures.length ? `; ${failures.length} gagal` : ''}.`);
    if (ok) {
      setRateEmployeeIds(failedIds); setRateEmployee('');
      if (!failures.length) { setBaseRate(''); setRateAgreement(''); setRateEnd(''); setRateNotes(''); }
      if (failures.length) setError(failures.slice(0,3).join(' | '));
    }
  }

  async function submitComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await runTask(() => createPayrollComponent({
      component_code: componentCode, component_name: componentName, component_type: componentType,
      calculation_method: componentMethod, is_recurring: componentRecurring, tax_treatment: componentTax,
      description: componentDescription || null, sort_order: 100,
    }), 'Master komponen upah berhasil ditambahkan.');
    if (ok) { setComponentCode(''); setComponentName(''); setComponentDescription(''); }
  }

  async function submitEmployeeComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = assignComponentEmployeeIds.length ? assignComponentEmployeeIds : (assignComponentEmployee ? [assignComponentEmployee] : []);
    if (!targets.length) { setError('Pilih minimal satu karyawan.'); return; }
    const failedIds: string[] = []; const failures: string[] = []; let completed = 0;
    const ok = await runTask(async () => {
      for (const employee_id of targets) {
        try {
          await assignEmployeePayrollComponent({ employee_id, component_id: assignComponentId,
            amount: ['fixed', 'per_day', 'per_hour'].includes(selectedComponent?.calculation_method ?? '') ? Number(assignComponentAmount) : null,
            percentage: selectedComponent?.calculation_method === 'percentage_of_base' ? Number(assignComponentPercentage) : null,
            effective_from: assignComponentStart, effective_to: null, notes: assignComponentNotes || null });
          completed += 1;
        } catch (cause) { failedIds.push(employee_id); failures.push(`${activeEmployees.find((item)=>item.id===employee_id)?.full_name ?? employee_id}: ${errorText(cause)}`); }
      }
    }, `Komponen diterapkan kepada ${completed} karyawan${failures.length ? `; ${failures.length} gagal` : ''}.`);
    if (ok) {
      setAssignComponentEmployeeIds(failedIds); setAssignComponentEmployee('');
      if (!failures.length) { setAssignComponentAmount(''); setAssignComponentPercentage(''); setAssignComponentNotes(''); }
      if (failures.length) setError(failures.slice(0,3).join(' | '));
    }
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleCode.trim() || !scheduleName.trim() || weekdays.length === 0) {
      setError('Kode, nama jadwal, dan minimal satu hari kerja wajib diisi.');
      return;
    }
    if (scheduleEnd <= scheduleStart) {
      setError('Jam selesai harus lebih besar daripada jam mulai.');
      return;
    }
    const ok = await runTask(() => createWorkSchedule({
      schedule_code: scheduleCode,
      schedule_name: scheduleName,
      weekdays,
      start_time: scheduleStart,
      end_time: scheduleEnd,
      break_minutes: Number(breakMinutes),
      grace_minutes: Number(graceMinutes),
      is_flexible: scheduleFlexible,
      description: scheduleDescription || null,
    }), 'Master pola jadwal kerja berhasil ditambahkan.');
    if (ok) {
      setScheduleCode('');
      setScheduleName('');
      setWeekdays([1, 2, 3, 4, 5]);
      setScheduleStart('08:00');
      setScheduleEnd('17:00');
      setBreakMinutes('60');
      setGraceMinutes('10');
      setScheduleFlexible(false);
      setScheduleDescription('');
    }
  }

  async function submitEmployeeSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = assignScheduleEmployeeIds.length ? assignScheduleEmployeeIds : (assignScheduleEmployee ? [assignScheduleEmployee] : []);
    if (!targets.length) { setError('Pilih minimal satu karyawan untuk jadwal kerja.'); return; }
    if (!assignScheduleId) { setError('Pilih pola jadwal aktif terlebih dahulu.'); return; }
    const failedIds: string[] = [];
    const failures: string[] = [];
    let completed = 0;
    const ok = await runTask(async () => {
      for (const employee_id of targets) {
        try {
          await assignEmployeeWorkSchedule({
            employee_id,
            schedule_id: assignScheduleId,
            effective_from: assignScheduleStart,
            effective_to: null,
            notes: assignScheduleNotes || null,
          });
          completed += 1;
        } catch (cause) {
          failedIds.push(employee_id);
          failures.push(`${activeEmployees.find((item) => item.id === employee_id)?.full_name ?? employee_id}: ${errorText(cause)}`);
        }
      }
    }, `Jadwal kerja diterapkan kepada ${completed} karyawan${failures.length ? `; ${failures.length} gagal` : ''}.`);
    if (ok) {
      setAssignScheduleEmployeeIds(failedIds);
      setAssignScheduleEmployee('');
      if (!failures.length) setAssignScheduleNotes('');
      if (failures.length) setError(failures.slice(0, 3).join(' | '));
    }
  }

  const noManageMessage = 'Akun Anda memiliki akses baca. Hubungi HR atau administrator untuk mengubah data.';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Personalia · Fondasi Absensi & Penggajian</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Kontrak, Skema Upah & Jadwal Kerja</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Atur dasar hubungan kerja, tarif yang berlaku per tanggal, komponen penghasilan/potongan, serta jadwal kerja. Tahap ini menyiapkan data sumber; belum menghitung gaji atau membayar karyawan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/personalia/karyawan" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Master Karyawan <ChevronRight className="h-4 w-4"/></Link>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Segarkan</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">Karyawan aktif <Users className="h-5 w-5 text-emerald-700"/></div><p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : activeEmployees.length}</p><p className="mt-1 text-xs text-slate-500">Terdaftar di Master Karyawan</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">Perjanjian aktif <FileText className="h-5 w-5 text-sky-700"/></div><p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : data.agreements.filter((a) => a.status === 'active').length}</p><p className="mt-1 text-xs text-slate-500">Perjanjian berstatus aktif</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">Tarif berlaku <Banknote className="h-5 w-5 text-emerald-700"/></div><p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : activeRates.length}</p><p className="mt-1 text-xs text-slate-500">Profil tarif yang periodenya berjalan</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">Jadwal karyawan aktif <Clock3 className="h-5 w-5 text-amber-700"/></div><p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : activeEmployeeSchedules.length}</p><p className="mt-1 text-xs text-slate-500">Penetapan pola jadwal berjalan</p></div>
      </section>

      {(error || success) && <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<span className="min-w-0 flex-1">{error || success}</span><button type="button" onClick={() => { setError(''); setSuccess(''); }} aria-label="Tutup"><X className="h-4 w-4"/></button>
      </div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <nav aria-label="Pengaturan fondasi personalia" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {TABS.map((item) => {
            const Icon = item.icon; const active = tab === item.id;
            return <button key={item.id} type="button" onClick={() => { setTab(item.id); setError(''); setSuccess(''); }} className={`flex min-h-[76px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${active ? 'border-emerald-300 bg-emerald-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`} aria-current={active ? 'page' : undefined}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5"/></span>
              <span className="min-w-0"><span className={`block text-sm font-bold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span></span>
            </button>;
          })}
        </nav>
      </section>

      {loading ? <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700"/> Memuat pengaturan personalia...</div> : <>
        {tab === 'agreements' && <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <SectionCard title="Tambah perjanjian kerja" description="Simpan dokumen hubungan kerja sebagai riwayat. Status Draft belum dianggap sebagai perjanjian yang aktif.">
            {canManagePayroll ? <form onSubmit={submitAgreement} className="space-y-3">
              <EmployeeMultiPicker title="Pilih karyawan untuk perjanjian" employees={activeEmployees} selectedIds={agreementEmployeeIds} onChange={setAgreementEmployeeIds}/>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Jenis perjanjian<select value={agreementType} onChange={(e) => setAgreementType(e.target.value as AgreementType)} className={INPUT}>{Object.entries(AGREEMENT_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
                <label className={LABEL}>Status awal<select value={agreementStatus} onChange={(e) => setAgreementStatus(e.target.value as AgreementStatus)} className={INPUT}><option value="draft">Draft</option><option value="active">Aktif</option></select></label>
              </div>
              <label className={LABEL}>Judul perjanjian<input required maxLength={160} value={agreementTitle} onChange={(e) => setAgreementTitle(e.target.value)} placeholder="Contoh: Perjanjian Kerja Staf Administrasi" className={INPUT}/></label>
              <label className={LABEL}>Nomor dokumen / referensi<input value={agreementNumberRef} onChange={(e) => setAgreementNumberRef(e.target.value)} placeholder="Nomor kontrak atau referensi arsip" className={INPUT}/></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={LABEL}>Tanggal tanda tangan<input type="date" value={agreementSignedDate} onChange={(e) => setAgreementSignedDate(e.target.value)} className={INPUT}/></label>
                <label className={LABEL}>Mulai berlaku *<input required type="date" value={agreementStart} onChange={(e) => setAgreementStart(e.target.value)} className={INPUT}/></label>
                <label className={LABEL}>Tanggal akhir<input type="date" min={agreementStart} value={agreementEnd} onChange={(e) => setAgreementEnd(e.target.value)} className={INPUT}/></label>
              </div>
              <label className={LABEL}>Jenis / uraian pekerjaan<textarea rows={2} value={agreementDescription} onChange={(e) => setAgreementDescription(e.target.value)} className={INPUT} placeholder="Ringkasan tanggung jawab atau jenis pekerjaan"/></label>
              <label className={LABEL}>Catatan<textarea rows={2} value={agreementNotes} onChange={(e) => setAgreementNotes(e.target.value)} className={INPUT}/></label>
              <button disabled={saving || !canManagePayroll || activeEmployees.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-4 w-4"/>{saving ? 'Menyimpan...' : 'Simpan Perjanjian'}</button>
            </form> : <p className="text-sm text-slate-500">{noManageMessage}</p>}
          </SectionCard>
          <SectionCard title="Riwayat perjanjian" description={`${data.agreements.length} dokumen tercatat. Riwayat tidak dihapus agar dapat ditelusuri.`}>
            {data.agreements.length > 0 ? <div className="mb-4 grid gap-3">{data.agreements.map((agreement) => <article key={`pdf-${agreement.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <div><p className="font-bold text-emerald-800">{agreement.agreement_number}</p><p className="text-xs text-slate-600">{agreement.employee?.full_name ?? 'Karyawan'} · {agreement.agreement_title}</p></div>
              <BusinessDocumentPdfButton identity={{ type: 'employment_agreement', code: agreement.agreement_number, title: 'Perjanjian Kerja', sourceStatus: agreement.status, generatedAt: new Date().toISOString(), period: `${dateText(agreement.start_date)}${agreement.end_date ? ` s.d. ${dateText(agreement.end_date)}` : ''}`, classification: 'Dokumen personalia terbatas' }} sections={[
                { title: 'Para pihak dan masa berlaku', details: [
                  { label: 'Nomor perjanjian', value: agreement.agreement_number }, { label: 'Nama pekerja', value: agreement.employee?.full_name ?? '—' },
                  { label: 'Nomor pekerja', value: agreement.employee?.employee_number ?? '—' }, { label: 'Jenis perjanjian', value: AGREEMENT_LABELS[agreement.agreement_type] },
                  { label: 'Tanggal tanda tangan', value: dateText(agreement.signed_date) }, { label: 'Mulai berlaku', value: dateText(agreement.start_date) },
                  { label: 'Tanggal akhir', value: dateText(agreement.end_date) }, { label: 'Status', value: AGREEMENT_STATUS[agreement.status] },
                  { label: 'Referensi dokumen', value: agreement.document_reference ?? '—' },
                ] },
                { title: 'Ruang lingkup dan catatan', paragraphs: [agreement.work_description?.trim() || 'Uraian pekerjaan tidak dicatat.', agreement.notes?.trim() || 'Tidak ada catatan tambahan pada dokumen sumber.'] },
              ]} />
            </article>)}</div> : null}
            {data.agreements.length === 0 ? <Empty text="Belum ada perjanjian kerja."/> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Karyawan / Dokumen</th><th className="px-3 py-3">Jenis</th><th className="px-3 py-3">Periode</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.agreements.map((a) => <tr key={a.id}><td className="px-3 py-3"><p className="font-semibold text-slate-900">{a.employee?.full_name ?? 'Karyawan'}</p><p className="text-xs text-emerald-700">{a.agreement_number} · {a.agreement_title}</p></td><td className="px-3 py-3 text-xs text-slate-600">{AGREEMENT_LABELS[a.agreement_type]}</td><td className="px-3 py-3 text-xs text-slate-600">{dateText(a.start_date)}<br/>s.d. {dateText(a.end_date)}</td><td className="px-3 py-3"><Pill tone={a.status === 'active' ? 'green' : a.status === 'draft' ? 'amber' : 'slate'}>{AGREEMENT_STATUS[a.status]}</Pill></td><td className="px-3 py-3 text-right">{canManagePayroll && a.status === 'active' && <button type="button" disabled={saving} onClick={() => { const end = window.prompt('Tanggal akhir perjanjian (YYYY-MM-DD)', dateToday()); if (end) void runTask(() => closeWorkAgreement(a.id, end), 'Perjanjian berhasil diakhiri.'); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Akhiri</button>}{canManagePayroll && a.status === 'draft' && <button type="button" disabled={saving} onClick={() => void runTask(() => updateAgreementStatus(a.id, 'active'), 'Perjanjian diaktifkan.')} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Aktifkan</button>}</td></tr>)}</tbody></table></div>}
          </SectionCard>
        </div>}

        {tab === 'rates' && <div className="space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SectionCard title="Master skema upah" description="Empat dasar disediakan sebagai awal. Skema campuran dibentuk dari tarif dasar ditambah komponen penghasilan terpisah.">
              {canManagePayroll && <form onSubmit={submitScheme} className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Kode skema<input required value={schemeCode} onChange={(e) => setSchemeCode(e.target.value)} placeholder="Contoh: MINGGUAN" className={INPUT}/></label>
                <label className={LABEL}>Nama skema<input required value={schemeName} onChange={(e) => setSchemeName(e.target.value)} placeholder="Contoh: Mingguan" className={INPUT}/></label>
                <label className={`${LABEL} sm:col-span-2`}>Dasar pembayaran<select value={schemeBasis} onChange={(e) => setSchemeBasis(e.target.value as PayBasis)} className={INPUT}>{Object.entries(BASIS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
                <label className={`${LABEL} sm:col-span-2`}>Keterangan<input value={schemeDescription} onChange={(e) => setSchemeDescription(e.target.value)} className={INPUT}/></label>
                <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white sm:col-span-2 disabled:opacity-50"><Plus className="h-4 w-4"/>Tambah Skema</button>
              </form>}
              <div className="space-y-2">{data.schemes.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"><div><p className="font-semibold text-slate-800">{s.scheme_name} <span className="font-mono text-[10px] text-slate-400">{s.scheme_code}</span></p><p className="text-xs text-slate-500">{BASIS_LABELS[s.pay_basis]}</p></div><div className="flex items-center gap-2"><Pill tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Pill>{canManagePayroll && !['MONTHLY','DAILY','HOURLY','PIECEWORK'].includes(s.scheme_code) && <button type="button" onClick={() => void runTask(() => setPayrollSchemeActive(s.id, !s.is_active), 'Status skema diperbarui.')} className="text-xs font-semibold text-emerald-700">{s.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}</div></div>)}</div>
            </SectionCard>
            <SectionCard title="Tetapkan tarif karyawan" description="Perubahan tarif disimpan sebagai riwayat baru berdasarkan tanggal berlaku. Jangan mengubah tarif lama untuk periode yang sudah lewat.">
              {canManagePayroll ? <form onSubmit={submitRate} className="space-y-3">
                <EmployeeMultiPicker title="Pilih karyawan untuk tarif ini" employees={activeEmployees} selectedIds={rateEmployeeIds} onChange={(ids)=>{setRateEmployeeIds(ids);setRateEmployee(ids.length===1?ids[0]:'');setRateAgreement('');}}/>
                <label className={LABEL}>Perjanjian terkait (opsional)<select value={rateAgreement} onChange={(e) => { setRateAgreement(e.target.value); const agreement = agreementsForRateEmployee.find((item) => item.id === e.target.value); setRateEnd(agreement?.end_date ?? ''); if (agreement && rateStart < agreement.start_date) setRateStart(agreement.start_date); }} className={INPUT}><option value="">Tidak dikaitkan dengan dokumen tertentu</option>{agreementsForRateEmployee.map((a) => <option key={a.id} value={a.id}>{a.agreement_number} — {a.agreement_title}</option>)}</select></label>
                <label className={LABEL}>Skema upah<select required value={rateScheme} onChange={(e) => setRateScheme(e.target.value)} className={INPUT}><option value="">Pilih skema</option>{data.schemes.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.scheme_name} ({BASIS_LABELS[s.pay_basis]})</option>)}</select></label>
                {selectedScheme?.pay_basis === 'piecework' ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Skema borongan tidak mengisi tarif dasar di sini. Nilai pekerjaan akan dicatat berdasarkan order, satuan hasil, volume terverifikasi, dan pembagian pekerja pada modul Borongan Tahap 012.</div> : <label className={LABEL}>Tarif dasar (Rp)<input required type="number" min="1" step="1" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} placeholder={selectedScheme?.pay_basis === 'monthly' ? 'Contoh: 5000000' : selectedScheme?.pay_basis === 'daily' ? 'Contoh: 150000' : 'Contoh: 25000'} className={INPUT}/><span className="mt-1 block text-[10px] font-normal text-slate-400">{selectedScheme ? `Tarif ${BASIS_LABELS[selectedScheme.pay_basis].toLowerCase()}` : 'Pilih skema terlebih dahulu'}.</span></label>}
                <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mulai berlaku<input required type="date" value={rateStart} onChange={(e) => setRateStart(e.target.value)} className={INPUT}/></label><label className={LABEL}>Akhir berlaku (opsional)<input type="date" min={rateStart} value={rateEnd} onChange={(e) => setRateEnd(e.target.value)} className={INPUT}/></label></div>
                <label className={LABEL}>Catatan<input value={rateNotes} onChange={(e) => setRateNotes(e.target.value)} className={INPUT}/></label>
                <button disabled={saving || (!rateEmployeeIds.length && !rateEmployee) || !rateScheme || (selectedScheme?.pay_basis !== 'piecework' && !baseRate)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Simpan Tarif Berlaku</button>
              </form> : <p className="text-sm text-slate-500">{noManageMessage}</p>}
            </SectionCard>
          </div>
          <SectionCard title="Riwayat tarif karyawan" description="Periode tarif untuk seorang karyawan tidak boleh tumpang tindih. Tutup tarif lama sebelum memasukkan tarif pengganti.">
            {data.compensationProfiles.length === 0 ? <Empty text="Belum ada tarif yang ditetapkan."/> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Skema</th><th className="px-3 py-3">Tarif</th><th className="px-3 py-3">Berlaku</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.compensationProfiles.map((p) => <tr key={p.id}><td className="px-3 py-3"><p className="font-semibold">{p.employee?.full_name ?? 'Karyawan'}</p><p className="text-xs text-slate-500">{p.employee?.employee_number}</p></td><td className="px-3 py-3 text-xs">{p.scheme?.scheme_name ?? '—'}</td><td className="px-3 py-3 font-semibold text-slate-800">{rupiah(p.base_rate)}</td><td className="px-3 py-3 text-xs text-slate-600">{dateText(p.effective_from)} s.d. {dateText(p.effective_to)}</td><td className="px-3 py-3 text-right">{canManagePayroll && !p.effective_to && <button type="button" onClick={() => { const end = window.prompt(`Tanggal akhir tarif (YYYY-MM-DD; minimal ${p.effective_from})`, p.effective_from > dateToday() ? p.effective_from : dateToday()); if (end) void runTask(() => closeCompensationProfile(p.id, end), 'Periode tarif berhasil diakhiri.'); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">Akhiri tarif</button>}</td></tr>)}</tbody></table></div>}
          </SectionCard>
        </div>}

        {tab === 'components' && <div className="space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SectionCard title="Master komponen" description="Buat jenis tunjangan, insentif, atau potongan. Perlakuan pajak hanya metadata untuk ditinjau, bukan kalkulasi pajak otomatis.">
              {canManagePayroll ? <form onSubmit={submitComponent} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Kode<input required value={componentCode} onChange={(e) => setComponentCode(e.target.value)} placeholder="TRANSPORT" className={INPUT}/></label><label className={LABEL}>Nama komponen<input required value={componentName} onChange={(e) => setComponentName(e.target.value)} placeholder="Tunjangan transport" className={INPUT}/></label></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Jenis<select value={componentType} onChange={(e) => setComponentType(e.target.value as ComponentType)} className={INPUT}><option value="earning">Penghasilan</option><option value="deduction">Potongan</option></select></label><label className={LABEL}>Metode perhitungan<select value={componentMethod} onChange={(e) => setComponentMethod(e.target.value as ComponentMethod)} className={INPUT}>{Object.entries(METHOD_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Perlakuan pajak<select value={componentTax} onChange={(e) => setComponentTax(e.target.value as TaxTreatment)} className={INPUT}><option value="review_required">Perlu ditinjau</option><option value="taxable">Objek pajak (konfigurasi)</option><option value="non_taxable">Nonobjek pajak (konfigurasi)</option></select></label><label className={LABEL}>Sifat komponen<select value={componentRecurring ? 'yes' : 'no'} onChange={(e) => setComponentRecurring(e.target.value === 'yes')} className={INPUT}><option value="yes">Berulang</option><option value="no">Tidak berulang</option></select></label></div>
                <label className={LABEL}>Keterangan<input value={componentDescription} onChange={(e) => setComponentDescription(e.target.value)} className={INPUT}/></label>
                <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Tambah Komponen</button>
              </form> : <p className="text-sm text-slate-500">{noManageMessage}</p>}
            </SectionCard>
            <SectionCard title="Tetapkan komponen kepada karyawan" description="Nilai tetap dan persentase memiliki masa berlaku. Komponen manual diisi pada proses payroll mendatang.">
              {canManagePayroll ? <form onSubmit={submitEmployeeComponent} className="space-y-3">
                <EmployeeMultiPicker title="Terapkan komponen kepada karyawan" employees={activeEmployees} selectedIds={assignComponentEmployeeIds} onChange={setAssignComponentEmployeeIds}/>
                <label className={LABEL}>Komponen<select required value={assignComponentId} onChange={(e) => setAssignComponentId(e.target.value)} className={INPUT}><option value="">Pilih komponen aktif</option>{data.components.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.component_name} · {c.component_type === 'earning' ? 'Penghasilan' : 'Potongan'}</option>)}</select></label>
                {selectedComponent?.calculation_method === 'percentage_of_base' ? <label className={LABEL}>Persentase (%)<input required type="number" min="0.0001" max="100" step="0.0001" value={assignComponentPercentage} onChange={(e) => setAssignComponentPercentage(e.target.value)} className={INPUT}/></label> : ['fixed', 'per_day', 'per_hour'].includes(selectedComponent?.calculation_method ?? '') ? <label className={LABEL}>Nilai (Rp)<input required type="number" min="1" step="1" value={assignComponentAmount} onChange={(e) => setAssignComponentAmount(e.target.value)} className={INPUT}/><span className="mt-1 block text-[10px] font-normal text-slate-400">Metode: {selectedComponent ? METHOD_LABELS[selectedComponent.calculation_method] : '—'}.</span></label> : selectedComponent?.calculation_method === 'manual' ? <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">Nilai untuk komponen ini diisi ketika proses penggajian dibuat.</div> : null}
                <label className={LABEL}>Mulai berlaku<input required type="date" value={assignComponentStart} onChange={(e) => setAssignComponentStart(e.target.value)} className={INPUT}/></label>
                <label className={LABEL}>Catatan<input value={assignComponentNotes} onChange={(e) => setAssignComponentNotes(e.target.value)} className={INPUT}/></label>
                <button disabled={saving || (!assignComponentEmployeeIds.length && !assignComponentEmployee) || !assignComponentId || (selectedComponent?.calculation_method === 'percentage_of_base' && !assignComponentPercentage) || (['fixed','per_day','per_hour'].includes(selectedComponent?.calculation_method ?? '') && !assignComponentAmount)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Tetapkan Komponen</button>
              </form> : <p className="text-sm text-slate-500">{noManageMessage}</p>}
            </SectionCard>
          </div>
          <SectionCard title="Daftar komponen" description={`${data.components.length} jenis komponen terdaftar.`}>
            {data.components.length === 0 ? <Empty text="Belum ada komponen upah."/> : <div className="grid gap-2 md:grid-cols-2">{data.components.map((c) => <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="font-semibold text-slate-800">{c.component_name}</p><p className="text-[11px] text-slate-500">{c.component_code} · {c.component_type === 'earning' ? 'Penghasilan' : 'Potongan'} · {METHOD_LABELS[c.calculation_method]}</p><p className="mt-1 text-[10px] text-slate-400">Pajak: {c.tax_treatment === 'review_required' ? 'Perlu ditinjau' : c.tax_treatment === 'taxable' ? 'Ditandai objek pajak' : 'Ditandai nonobjek pajak'}</p></div><div className="flex shrink-0 flex-col items-end gap-2"><Pill tone={c.is_active ? 'green' : 'slate'}>{c.is_active ? 'Aktif' : 'Nonaktif'}</Pill>{canManagePayroll && <button type="button" onClick={() => void runTask(() => setPayrollComponentActive(c.id, !c.is_active), 'Status komponen diperbarui.')} className="text-[11px] font-semibold text-emerald-700">{c.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}</div></div>)}</div>}
          </SectionCard>
          <SectionCard title="Komponen yang ditetapkan" description="Riwayat penetapan komponen per karyawan. Tutup periode lama sebelum mengganti nilainya.">
            {data.employeeComponents.length === 0 ? <Empty text="Belum ada komponen yang ditetapkan kepada karyawan."/> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Komponen</th><th className="px-3 py-3">Nilai</th><th className="px-3 py-3">Berlaku</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.employeeComponents.map((c) => <tr key={c.id}><td className="px-3 py-3">{c.employee?.full_name ?? 'Karyawan'}</td><td className="px-3 py-3">{c.component?.component_name ?? '—'}</td><td className="px-3 py-3 text-xs font-semibold">{c.amount !== null ? `${rupiah(c.amount)}${c.component?.calculation_method === 'per_day' ? ' / hari' : c.component?.calculation_method === 'per_hour' ? ' / jam' : ''}` : c.percentage !== null ? `${c.percentage}% dari tarif dasar` : 'Diisi saat payroll'}</td><td className="px-3 py-3 text-xs">{dateText(c.effective_from)} s.d. {dateText(c.effective_to)}</td><td className="px-3 py-3 text-right">{canManagePayroll && !c.effective_to && <button type="button" onClick={() => { const end = window.prompt('Tanggal akhir komponen (YYYY-MM-DD)', dateToday()); if (end) void runTask(() => closeEmployeePayrollComponent(c.id, end), 'Periode komponen berhasil diakhiri.'); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">Akhiri</button>}</td></tr>)}</tbody></table></div>}
          </SectionCard>
        </div>}

        {tab === 'schedules' && <div className="space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SectionCard title="Master pola jadwal" description="Hari kerja memakai nomor ISO: Senin=1 sampai Minggu=7. Jadwal melewati tengah malam belum didukung pada fondasi awal.">
              {canManageSchedule ? <form onSubmit={submitSchedule} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Kode jadwal<input required value={scheduleCode} onChange={(e) => setScheduleCode(e.target.value)} placeholder="KANTOR-5HARI" className={INPUT}/></label><label className={LABEL}>Nama jadwal<input required value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Jam Kantor Senin–Jumat" className={INPUT}/></label></div>
                <div><p className={LABEL}>Hari kerja</p><div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((day) => <label key={day.value} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${weekdays.includes(day.value) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'}`}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={(e) => setWeekdays((current) => e.target.checked ? [...current, day.value].sort() : current.filter((v) => v !== day.value))}/>{day.label}</label>)}</div></div>
                <div className="grid grid-cols-2 gap-3"><label className={LABEL}>Jam mulai<input required type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className={INPUT}/></label><label className={LABEL}>Jam selesai<input required type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className={INPUT}/></label><label className={LABEL}>Istirahat (menit)<input type="number" min="0" max="720" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} className={INPUT}/></label><label className={LABEL}>Toleransi terlambat (menit)<input type="number" min="0" max="240" value={graceMinutes} onChange={(e) => setGraceMinutes(e.target.value)} className={INPUT}/></label></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={scheduleFlexible} onChange={(e) => setScheduleFlexible(e.target.checked)}/> Jam kerja fleksibel</label>
                <label className={LABEL}>Keterangan<input value={scheduleDescription} onChange={(e) => setScheduleDescription(e.target.value)} className={INPUT}/></label>
                <button disabled={saving || weekdays.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Tambah Pola Jadwal</button>
              </form> : <p className="text-sm text-slate-500">Akun Anda tidak memiliki izin mengubah jadwal kerja.</p>}
            </SectionCard>
            <SectionCard title="Tetapkan jadwal kepada karyawan" description="Riwayat penjadwalan memakai masa berlaku. Satu karyawan hanya dapat memiliki satu pola jadwal yang berlaku pada tanggal yang sama.">
              {canManageSchedule ? <form onSubmit={submitEmployeeSchedule} className="space-y-3">
                <EmployeeMultiPicker title="Terapkan jadwal kepada karyawan" employees={activeEmployees} selectedIds={assignScheduleEmployeeIds} onChange={setAssignScheduleEmployeeIds}/>
                <label className={LABEL}>Pola jadwal<select required value={assignScheduleId} onChange={(e) => setAssignScheduleId(e.target.value)} className={INPUT}><option value="">Pilih jadwal aktif</option>{data.schedules.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.schedule_name} ({s.schedule_code})</option>)}</select></label>
                <label className={LABEL}>Mulai berlaku<input required type="date" value={assignScheduleStart} onChange={(e) => setAssignScheduleStart(e.target.value)} className={INPUT}/></label>
                <label className={LABEL}>Catatan<input value={assignScheduleNotes} onChange={(e) => setAssignScheduleNotes(e.target.value)} className={INPUT}/></label>
                <button disabled={saving || (!assignScheduleEmployeeIds.length && !assignScheduleEmployee) || !assignScheduleId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Tetapkan Jadwal</button>
              </form> : <p className="text-sm text-slate-500">Akun Anda tidak memiliki izin mengubah penjadwalan karyawan.</p>}
            </SectionCard>
          </div>
          <SectionCard title="Daftar pola jadwal" description={`${data.schedules.length} pola jadwal terdaftar.`}>
            {data.schedules.length === 0 ? <Empty text="Belum ada pola jadwal kerja."/> : <div className="grid gap-2 md:grid-cols-2">{data.schedules.map((s) => <div key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="font-semibold text-slate-800">{s.schedule_name}</p><p className="text-[11px] text-slate-500">{s.schedule_code} · {s.weekdays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(', ')}</p><p className="mt-1 text-xs text-slate-600">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · Istirahat {s.break_minutes} menit · Toleransi {s.grace_minutes} menit</p></div><div className="flex flex-col items-end gap-2"><Pill tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Pill>{canManageSchedule && <button type="button" onClick={() => void runTask(() => setWorkScheduleActive(s.id, !s.is_active), 'Status jadwal diperbarui.')} className="text-[11px] font-semibold text-emerald-700">{s.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}</div></div>)}</div>}
          </SectionCard>
          <SectionCard title="Riwayat jadwal karyawan" description="Jadwal aktif tidak dapat ditimpa. Akhiri periode sebelumnya sebelum menetapkan jadwal baru.">
            {data.employeeSchedules.length === 0 ? <Empty text="Belum ada jadwal yang ditetapkan."/> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3">Karyawan</th><th className="px-3 py-3">Pola jadwal</th><th className="px-3 py-3">Periode</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.employeeSchedules.map((s) => <tr key={s.id}><td className="px-3 py-3 font-semibold">{s.employee?.full_name ?? 'Karyawan'}</td><td className="px-3 py-3 text-xs">{s.schedule?.schedule_name ?? '—'}</td><td className="px-3 py-3 text-xs">{dateText(s.effective_from)} s.d. {dateText(s.effective_to)}</td><td className="px-3 py-3 text-right">{canManageSchedule && !s.effective_to && <button type="button" onClick={() => { const end = window.prompt('Tanggal akhir jadwal (YYYY-MM-DD)', dateToday()); if (end) void runTask(() => closeEmployeeWorkSchedule(s.id, end), 'Periode jadwal berhasil diakhiri.'); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">Akhiri</button>}</td></tr>)}</tbody></table></div>}
          </SectionCard>
        </div>}
      </>}

      <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-xs leading-5 text-sky-900">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Prinsip pengendalian data.</strong> Kategori hubungan kerja pada Master Karyawan tidak otomatis diubah oleh halaman ini; perjanjian legal dan dasar perhitungan upah dicatat sebagai data terpisah. Riwayat kontrak, tarif, komponen, dan jadwal disimpan berdasarkan tanggal berlaku. Jangan menghapus atau menimpa catatan lama untuk memperbaiki periode sebelumnya. Tutup periode lama lalu buat catatan baru. Tahap ini belum melakukan kalkulasi PPh 21, BPJS, THR, lembur, payroll, atau pembayaran. Aturan tersebut disiapkan terpisah setelah data sumber diuji.</div></div>
      </section>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">{text}</div>;
}

export default function PayrollFoundationPage() {
  return <RequireAuth permission="payroll.read"><PayrollFoundationContent/></RequireAuth>;
}
