'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import PersonnelWorkflowWizard from '@/components/personalia/PersonnelWorkflowWizard';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  Filter,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  UserCheck,
  UserRound,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  createEmployee,
  fetchEmployees,
  updateEmployee,
  updateEmployeeStatus,
} from '@/lib/services/employeeService';
import type { Employee, EmployeeInput, EmployeeStatus, EmploymentType } from '@/types/employee';

type EmployeeDraft = {
  full_name: string;
  preferred_name: string;
  phone: string;
  email: string;
  address: string;
  department: string;
  position_title: string;
  employment_type: EmploymentType;
  hire_date: string;
  contract_end_date: string;
  status: EmployeeStatus;
  work_notes: string;
};

const EMPTY_DRAFT: EmployeeDraft = {
  full_name: '',
  preferred_name: '',
  phone: '',
  email: '',
  address: '',
  department: '',
  position_title: '',
  employment_type: 'permanent',
  hire_date: '',
  contract_end_date: '',
  status: 'active',
  work_notes: '',
};

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  permanent: 'Karyawan tetap',
  contract: 'Karyawan kontrak',
  daily: 'Harian',
  freelance: 'Freelance',
  intern: 'Magang',
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  resigned: 'Mengundurkan diri',
  terminated: 'Berakhir / diberhentikan',
};

const INPUT_CLASS =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600';

function moneylessDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

function toDraft(employee?: Employee | null): EmployeeDraft {
  if (!employee) return { ...EMPTY_DRAFT };
  return {
    full_name: employee.full_name,
    preferred_name: employee.preferred_name ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    address: employee.address ?? '',
    department: employee.department ?? '',
    position_title: employee.position_title ?? '',
    employment_type: employee.employment_type,
    hire_date: employee.hire_date ?? '',
    contract_end_date: employee.contract_end_date ?? '',
    status: employee.status,
    work_notes: employee.work_notes ?? '',
  };
}

function asInput(draft: EmployeeDraft): EmployeeInput {
  return {
    full_name: draft.full_name,
    preferred_name: draft.preferred_name || null,
    phone: draft.phone || null,
    email: draft.email || null,
    address: draft.address || null,
    department: draft.department || null,
    position_title: draft.position_title || null,
    employment_type: draft.employment_type,
    hire_date: draft.hire_date || null,
    contract_end_date: draft.contract_end_date || null,
    status: draft.status,
    work_notes: draft.work_notes || null,
  };
}

function csvValue(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportEmployees(rows: Employee[]) {
  const header = [
    'Nomor Karyawan', 'Nama Lengkap', 'Nama Panggilan', 'Jabatan', 'Departemen',
    'Jenis Hubungan Kerja', 'Telepon', 'Email', 'Tanggal Masuk', 'Akhir Kontrak', 'Status', 'Alamat',
  ];
  const body = rows.map((row) => [
    row.employee_number,
    row.full_name,
    row.preferred_name,
    row.position_title,
    row.department,
    EMPLOYMENT_LABELS[row.employment_type],
    row.phone,
    row.email,
    row.hire_date,
    row.contract_end_date,
    STATUS_LABELS[row.status],
    row.address,
  ]);
  const csv = [header, ...body].map((line) => line.map(csvValue).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `daftar-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function EmployeePageContent() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EmploymentType>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>({ ...EMPTY_DRAFT });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setRows(await fetchEmployees());
    } catch (err) {
      setRows([]);
      setError(errorText(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    getMyAccess()
      .then((access) => setCanManage(hasPermission(access, 'personnel.manage')))
      .catch(() => setCanManage(false));
  }, [load]);

  const activeCount = rows.filter((row) => row.status === 'active').length;
  const permanentCount = rows.filter((row) => row.employment_type === 'permanent' && row.status === 'active').length;
  const contractCount = rows.filter((row) => ['contract', 'daily', 'freelance', 'intern'].includes(row.employment_type) && row.status === 'active').length;

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return rows.filter((row) => {
      const matchStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchType = typeFilter === 'all' || row.employment_type === typeFilter;
      const matchSearch = !keyword || [
        row.employee_number,
        row.full_name,
        row.preferred_name ?? '',
        row.position_title ?? '',
        row.department ?? '',
        row.phone ?? '',
        row.email ?? '',
      ].some((value) => value.toLocaleLowerCase('id').includes(keyword));
      return matchStatus && matchType && matchSearch;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setError('');
    setSuccess('');
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setDraft(toDraft(employee));
    setError('');
    setSuccess('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = editing
        ? await updateEmployee(editing.id, asInput(draft))
        : await createEmployee(asInput(draft));
      setRows((current) => {
        const next = editing
          ? current.map((row) => row.id === saved.id ? saved : row)
          : [...current, saved];
        return next.sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));
      });
      setSuccess(editing ? 'Data karyawan berhasil diperbarui.' : `Karyawan berhasil ditambahkan dengan nomor ${saved.employee_number}.`);
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (employee: Employee) => {
    if (!canManage || statusBusyId) return;
    const nextStatus: EmployeeStatus = employee.status === 'active' ? 'inactive' : 'active';
    setStatusBusyId(employee.id);
    setError('');
    setSuccess('');
    try {
      const updated = await updateEmployeeStatus(employee.id, nextStatus);
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setSuccess(`${employee.full_name} sekarang berstatus ${STATUS_LABELS[nextStatus].toLowerCase()}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStatusBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Personalia · Data Induk</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Master Karyawan</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Kelola identitas dan status hubungan kerja karyawan perusahaan dalam satu daftar yang tertata.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportEmployees(filteredRows)}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Ekspor CSV
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20"
            >
              <Plus className="h-4 w-4" /> Tambah Karyawan
            </button>
          )}
        </div>
      </header>

      <PersonnelWorkflowWizard currentStep={1} />

      {(error || success) && (
        <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{error || success}</span>
          <button type="button" onClick={() => { setError(''); setSuccess(''); }} aria-label="Tutup pemberitahuan"><X className="h-4 w-4" /></button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seluruh karyawan</p><Users className="h-5 w-5 text-slate-400" /></div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : rows.length}</p>
          <p className="mt-1 text-xs text-slate-500">Termasuk karyawan nonaktif dan yang sudah berakhir</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Karyawan aktif</p><UserCheck className="h-5 w-5 text-emerald-700" /></div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-emerald-900">{loading ? '—' : activeCount}</p>
          <p className="mt-1 text-xs text-emerald-800/70">Status hubungan kerja masih berjalan</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Karyawan tetap aktif</p><Building2 className="h-5 w-5 text-slate-400" /></div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : permanentCount}</p>
          <p className="mt-1 text-xs text-slate-500">Dari seluruh karyawan aktif</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hubungan kerja lainnya</p><UserRound className="h-5 w-5 text-slate-400" /></div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : contractCount}</p>
          <p className="mt-1 text-xs text-slate-500">Kontrak, harian, freelance, dan magang</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Daftar Karyawan</h2>
              <p className="mt-1 text-xs text-slate-500">{filteredRows.length} dari {rows.length} karyawan ditampilkan</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[760px]">
              <label className="relative block sm:col-span-1">
                <span className="sr-only">Cari karyawan</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, nomor, jabatan..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" />
              </label>
              <label className="relative block">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500">
                  <option value="all">Semua status</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                  <option value="all">Semua jenis kerja</option>
                  {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-14 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat data karyawan...</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><Users className="h-6 w-6 text-slate-400" /></div>
            <h3 className="mt-3 text-sm font-bold text-slate-800">{rows.length === 0 ? 'Belum ada data karyawan' : 'Tidak ada data yang cocok'}</h3>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{rows.length === 0 ? 'Tambahkan data karyawan pertama untuk mulai membangun database personalia perusahaan.' : 'Ubah kata kunci atau filter pencarian untuk melihat data lainnya.'}</p>
            {canManage && rows.length === 0 && <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Tambah Karyawan Pertama</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Karyawan</th>
                  <th className="px-4 py-3 font-semibold">Jabatan / Departemen</th>
                  <th className="px-4 py-3 font-semibold">Hubungan kerja</th>
                  <th className="px-4 py-3 font-semibold">Kontak</th>
                  <th className="px-4 py-3 font-semibold">Tanggal masuk</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((employee) => (
                  <tr key={employee.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">{employee.full_name.trim().charAt(0).toLocaleUpperCase('id')}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">{employee.full_name}</p>
                          {employee.preferred_name && <p className="text-xs text-slate-500">Panggilan: {employee.preferred_name}</p>}
                          <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{employee.employee_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800">{employee.position_title || 'Jabatan belum diisi'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{employee.department || 'Departemen belum diisi'}</p>
                    </td>
                    <td className="px-4 py-3.5"><span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{EMPLOYMENT_LABELS[employee.employment_type]}</span>{employee.contract_end_date && <p className="mt-1 text-[11px] text-slate-500">Sampai {moneylessDate(employee.contract_end_date)}</p>}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {employee.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{employee.phone}</p>}
                      {employee.email && <p className="mt-1 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{employee.email}</p>}
                      {!employee.phone && !employee.email && '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{moneylessDate(employee.hire_date)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${employee.status === 'active' ? 'bg-emerald-50 text-emerald-700' : employee.status === 'inactive' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[employee.status]}</span></td>
                    {canManage && (
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => openEdit(employee)} title="Edit karyawan" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                          {(employee.status === 'active' || employee.status === 'inactive') && (
                            <button type="button" onClick={() => void toggleActive(employee)} disabled={statusBusyId === employee.id} title={employee.status === 'active' ? 'Nonaktifkan karyawan' : 'Aktifkan kembali'} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                              {statusBusyId === employee.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : employee.status === 'active' ? <UserRoundX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Nomor karyawan dibuat otomatis dan tidak berubah setelah data disimpan.</span>
          <span>Data karyawan dinonaktifkan, bukan dihapus, agar riwayat tetap terjaga.</span>
        </div>
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900">
        <strong>Catatan pengelolaan data:</strong> Halaman ini menyimpan identitas dan informasi hubungan kerja. Informasi rekening, komponen gaji, dan data pengupahan akan dikelola terpisah pada modul Penggajian dengan pembatasan akses yang lebih ketat.
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="employee-modal-title" className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><UserRound className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Master Personalia</p>
                <h2 id="employee-modal-title" className="mt-0.5 text-lg font-bold text-slate-900">{editing ? 'Ubah Data Karyawan' : 'Tambah Karyawan Baru'}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Nomor karyawan akan diterbitkan otomatis saat data baru disimpan.</p>
              </div>
              <button type="button" aria-label="Tutup" onClick={closeModal} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </header>
            <form onSubmit={onSubmit}>
              <div className="max-h-[68vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Identitas karyawan</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`${LABEL_CLASS} sm:col-span-2`}>Nama lengkap <span className="text-rose-600">*</span><input required maxLength={180} autoFocus value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder="Nama sesuai identitas" className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Nama panggilan<input maxLength={100} value={draft.preferred_name} onChange={(e) => setDraft({ ...draft, preferred_name: e.target.value })} placeholder="Opsional" className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Nomor telepon<input maxLength={40} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="08xxxxxxxxxx" className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Email<input type="email" maxLength={180} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="nama@perusahaan.com" className={INPUT_CLASS} /></label>
                    <label className={`${LABEL_CLASS} sm:col-span-2`}>Alamat domisili<textarea rows={2} maxLength={1000} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Alamat karyawan" className={INPUT_CLASS} /></label>
                  </div>
                </section>
                <section className="border-t border-slate-100 pt-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Informasi pekerjaan</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={LABEL_CLASS}>Jabatan<input maxLength={120} value={draft.position_title} onChange={(e) => setDraft({ ...draft, position_title: e.target.value })} placeholder="Contoh: Administrasi, Mandor" className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Departemen / Bagian<input maxLength={120} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="Contoh: Operasional, Keuangan" className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Jenis hubungan kerja<select value={draft.employment_type} onChange={(e) => setDraft({ ...draft, employment_type: e.target.value as EmploymentType })} className={INPUT_CLASS}>{Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className={LABEL_CLASS}>Status karyawan<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EmployeeStatus })} className={INPUT_CLASS}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className={LABEL_CLASS}>Tanggal mulai bekerja<input type="date" value={draft.hire_date} onChange={(e) => setDraft({ ...draft, hire_date: e.target.value })} className={INPUT_CLASS} /></label>
                    <label className={LABEL_CLASS}>Tanggal akhir kontrak<input type="date" value={draft.contract_end_date} onChange={(e) => setDraft({ ...draft, contract_end_date: e.target.value })} className={INPUT_CLASS} /><span className="mt-1 block text-[10px] font-normal text-slate-400">Isi jika hubungan kerja memiliki batas waktu.</span></label>
                    <label className={`${LABEL_CLASS} sm:col-span-2`}>Catatan pekerjaan<textarea rows={2} maxLength={1500} value={draft.work_notes} onChange={(e) => setDraft({ ...draft, work_notes: e.target.value })} placeholder="Catatan administratif terkait pekerjaan (opsional)" className={INPUT_CLASS} /></label>
                  </div>
                </section>
                {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</p>}
              </div>
              <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeModal} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                <button type="submit" disabled={saving || !draft.full_name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Karyawan'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default function EmployeePage() {
  return (
    <RequireAuth permission="personnel.read">
      <EmployeePageContent />
    </RequireAuth>
  );
}
