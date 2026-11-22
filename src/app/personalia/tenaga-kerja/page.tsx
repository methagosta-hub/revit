'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Filter,
  HardHat,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import PersonnelWorkflowWizard from '@/components/personalia/PersonnelWorkflowWizard';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  createWorkAssignment,
  fetchWorkAssignmentPageData,
  updateWorkAssignment,
} from '@/lib/services/workAssignmentService';
import type {
  ActiveEmployeeOption,
  DivisionOption,
  ProjectOption,
  WorkAssignment,
  WorkAssignmentInput,
  WorkAssignmentStatus,
} from '@/types/workAssignment';

const STATUS_LABELS: Record<WorkAssignmentStatus, string> = {
  active: 'Aktif',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  permanent: 'Tetap',
  contract: 'Kontrak',
  daily: 'Harian',
  freelance: 'Freelance',
  intern: 'Magang',
};

const INPUT_CLASS = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600';

type Draft = {
  employee_id: string;
  project_id: string;
  division_id: string;
  assignment_title: string;
  start_date: string;
  end_date: string;
  status: WorkAssignmentStatus;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  employee_id: '',
  project_id: '',
  division_id: '',
  assignment_title: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  status: 'active',
  notes: '',
};

function dateLabel(value: string | null | undefined): string {
  if (!value) return 'Belum ditentukan';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

function toInput(draft: Draft): WorkAssignmentInput {
  return {
    employee_id: draft.employee_id,
    project_id: draft.project_id,
    division_id: draft.division_id || null,
    assignment_title: draft.assignment_title,
    start_date: draft.start_date,
    end_date: draft.end_date || null,
    status: draft.status,
    notes: draft.notes || null,
  };
}

function toDraft(row?: WorkAssignment | null): Draft {
  if (!row) return { ...EMPTY_DRAFT };
  return {
    employee_id: row.employee_id,
    project_id: row.project_id,
    division_id: row.division_id ?? '',
    assignment_title: row.assignment_title,
    start_date: row.start_date,
    end_date: row.end_date ?? '',
    status: row.status,
    notes: row.notes ?? '',
  };
}

function exportCsv(rows: WorkAssignment[]) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const data = [
    ['Nomor Penempatan', 'Nomor Karyawan', 'Nama Karyawan', 'Proyek', 'Lokasi Pekerjaan', 'Peran pada Proyek', 'Mulai', 'Selesai', 'Status', 'Catatan'],
    ...rows.map((row) => [
      row.assignment_number,
      row.employee?.employee_number ?? '',
      row.employee?.full_name ?? '',
      row.project?.title ?? '',
      row.division?.name ?? 'Umum / seluruh proyek',
      row.assignment_title,
      row.start_date,
      row.end_date ?? '',
      STATUS_LABELS[row.status],
      row.notes ?? '',
    ]),
  ];
  const csv = data.map((line) => line.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `penempatan-tenaga-kerja-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function WorkAssignmentContent() {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [employees, setEmployees] = useState<ActiveEmployeeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkAssignment | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeePage, setEmployeePage] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState('');
  const [bulkTitle, setBulkTitle] = useState('Tenaga kerja proyek');
  const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [data, access] = await Promise.all([
        fetchWorkAssignmentPageData(),
        getMyAccess(),
      ]);
      setAssignments(data.assignments);
      setEmployees(data.employees);
      setProjects(data.projects);
      setDivisions(data.divisions);
      setCanManage(hasPermission(access, 'personnel.manage'));
    } catch (err) {
      console.error('Gagal memuat penempatan tenaga kerja:', err);
      setError(errorText(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return assignments.filter((row) => {
      const projectMatch = projectFilter === 'all' || row.project_id === projectFilter;
      const statusMatch = statusFilter === 'all' || row.status === statusFilter;
      const haystack = [
        row.assignment_number,
        row.employee?.employee_number ?? '',
        row.employee?.full_name ?? '',
        row.project?.title ?? '',
        row.division?.name ?? 'Umum',
        row.assignment_title,
      ].join(' ').toLocaleLowerCase('id');
      return projectMatch && statusMatch && (!keyword || haystack.includes(keyword));
    });
  }, [assignments, search, projectFilter, statusFilter]);

  const activeAssignments = assignments.filter((row) => row.status === 'active');
  const assignedEmployeeCount = new Set(activeAssignments.map((row) => row.employee_id)).size;
  const activeProjectCount = new Set(activeAssignments.map((row) => row.project_id)).size;
  const visibleDivisions = divisions.filter((division) => division.project_id === draft.project_id);
  const filteredEmployees = employees.filter((employee) => `${employee.employee_number} ${employee.full_name} ${employee.position_title ?? ''}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id')));
  const openBulkAssign = (projectId: string, ids = selectedEmployeeIds) => {
    if (!ids.length) { setError('Pilih atau seret minimal satu karyawan ke proyek tujuan.'); return; }
    setBulkProjectId(projectId); setSelectedEmployeeIds(ids); setBulkModalOpen(true); setError('');
  };
  const saveBulkAssignments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !bulkProjectId || !selectedEmployeeIds.length || !bulkTitle.trim() || !bulkStartDate) return;
    setSaving(true); setError(''); setSuccess('');
    let created = 0; let skipped = 0; const failures: string[] = [];
    try {
      for (const employeeId of selectedEmployeeIds) {
        const duplicate = assignments.some((row) => row.employee_id === employeeId && row.project_id === bulkProjectId && row.status === 'active');
        if (duplicate) { skipped += 1; continue; }
        try {
          await createWorkAssignment({ employee_id: employeeId, project_id: bulkProjectId, division_id: null, assignment_title: bulkTitle.trim(), start_date: bulkStartDate, end_date: bulkEndDate || null, status: 'active', notes: null });
          created += 1;
        } catch (cause) {
          const employee = employees.find((item) => item.id === employeeId);
          failures.push(`${employee?.full_name ?? employeeId}: ${errorText(cause)}`);
        }
      }
      const projectName = projects.find((item) => item.id === bulkProjectId)?.title ?? 'proyek';
      setSuccess(`${created} karyawan ditempatkan ke ${projectName}. ${skipped} dilewati karena sudah memiliki penempatan aktif${failures.length ? `; ${failures.length} gagal` : ''}.`);
      setSelectedEmployeeIds([]); setBulkModalOpen(false); await load(true);
      if (failures.length) setError(failures.slice(0, 3).join(' | '));
    } finally { setSaving(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, project_id: projects[0]?.id ?? '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row: WorkAssignment) => {
    setEditing(row);
    setDraft(toDraft(row));
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = toInput(draft);
      if (editing) {
        await updateWorkAssignment(editing.id, payload);
        setSuccess(`Penempatan ${editing.assignment_number} berhasil diperbarui.`);
      } else {
        const created = await createWorkAssignment(payload);
        setSuccess(`Penempatan ${created.assignment_number} berhasil dibuat.`);
      }
      setModalOpen(false);
      await load(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: WorkAssignment, status: WorkAssignmentStatus) => {
    const confirmation = status === 'completed'
      ? `Tandai penempatan ${row.assignment_number} sebagai selesai?`
      : `Batalkan penempatan ${row.assignment_number}?`;
    if (!window.confirm(confirmation)) return;
    setError('');
    setSuccess('');
    try {
      // Status update is intentionally performed through the regular edit method
      // so all business validations remain consistent.
      await updateWorkAssignment(row.id, {
        employee_id: row.employee_id,
        project_id: row.project_id,
        division_id: row.division_id,
        assignment_title: row.assignment_title,
        start_date: row.start_date,
        end_date: row.end_date,
        status,
        notes: row.notes,
      });
      setSuccess(`Status penempatan ${row.assignment_number} menjadi ${STATUS_LABELS[status].toLowerCase()}.`);
      await load(true);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const selectedEmployee = employees.find((employee) => employee.id === draft.employee_id);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <HardHat className="h-4 w-4"/> Personalia · Penempatan
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Penempatan Proyek</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Catat penempatan proyek yang berlaku untuk suatu periode. Perpindahan pekerjaan aktual dari hari ke hari dicatat terpisah pada Penugasan Harian.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Segarkan
          </button>
          <button type="button" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-4 w-4"/> Ekspor CSV
          </button>
          {canManage && <button type="button" onClick={openCreate} disabled={employees.length === 0 || projects.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4"/> Tambah Penempatan
          </button>}
        </div>
      </header>

      <PersonnelWorkflowWizard currentStep={3} />

      {(error || success) && <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}
        <p className="min-w-0 flex-1">{error || success}</p>
        <button type="button" aria-label="Tutup notifikasi" onClick={() => { setError(''); setSuccess(''); }} className="opacity-70 hover:opacity-100"><X className="h-4 w-4"/></button>
      </div>}

      {loading ? <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700"/> Memuat data penempatan...</div> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Penugasan aktif</span><BriefcaseBusiness className="h-5 w-5 text-emerald-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{activeAssignments.length}</p><p className="mt-1 text-xs text-slate-500">Seluruh penempatan yang masih berjalan</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Karyawan ditempatkan</span><Users className="h-5 w-5 text-sky-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{assignedEmployeeCount}</p><p className="mt-1 text-xs text-slate-500">Orang dengan penugasan aktif</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proyek berjalan</span><Building2 className="h-5 w-5 text-indigo-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{activeProjectCount}</p><p className="mt-1 text-xs text-slate-500">Proyek dengan tenaga kerja aktif</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total riwayat</span><CalendarDays className="h-5 w-5 text-amber-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{assignments.length}</p><p className="mt-1 text-xs text-slate-500">Termasuk penempatan selesai dan dibatalkan</p></div>
        </section>

        {(employees.length === 0 || projects.length === 0) && canManage && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Penempatan belum dapat dibuat.</strong> {employees.length === 0 ? 'Belum ada karyawan berstatus aktif di Master Karyawan. ' : ''}{projects.length === 0 ? 'Belum ada proyek yang dapat dipilih.' : ''} Lengkapi data tersebut terlebih dahulu.
        </div>}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Drag & drop assignment board</p><h2 className="mt-1 text-lg font-bold text-slate-900">Seret karyawan ke proyek tujuan</h2><p className="mt-1 text-xs text-slate-500">Centang beberapa kartu atau seret satu kartu. Lepaskan pada proyek untuk membuka konfirmasi penempatan massal. Divisi tidak wajib diisi.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{selectedEmployeeIds.length} dipilih</span><button type="button" onClick={()=>setSelectedEmployeeIds(filteredEmployees.map((item)=>item.id))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Pilih hasil pencarian</button><button type="button" onClick={()=>setSelectedEmployeeIds([])} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Bersihkan</button></div></div>
        <div className="grid gap-4 p-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={employeeSearch} onChange={(e)=>{setEmployeeSearch(e.target.value);setEmployeePage(0);}} placeholder="Ketik nama atau nomor pekerja untuk menemukan cepat..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredEmployees.slice(employeePage*48,(employeePage+1)*48).map((employee)=><label key={employee.id} draggable onDragStart={(event)=>{setDraggingEmployeeId(employee.id);event.dataTransfer.setData('text/plain',employee.id);event.dataTransfer.effectAllowed='copy';}} onDragEnd={()=>setDraggingEmployeeId(null)} className={`flex cursor-grab items-center gap-3 rounded-xl border p-3 transition active:cursor-grabbing ${selectedEmployeeIds.includes(employee.id)?'border-emerald-300 bg-emerald-50':'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'}`}><input type="checkbox" checked={selectedEmployeeIds.includes(employee.id)} onChange={(event)=>setSelectedEmployeeIds((current)=>event.target.checked?[...current,employee.id]:current.filter((id)=>id!==employee.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{employee.full_name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{employee.employee_number} · {employee.position_title ?? EMPLOYMENT_LABELS[employee.employment_type] ?? 'Karyawan'}</span></span><span className="text-slate-300">⠿</span></label>)}{filteredEmployees.length===0&&<p className="col-span-full rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Tidak ada karyawan yang cocok.</p>}</div><p className="mt-2 text-[11px] text-slate-400">Menampilkan 48 hasil per halaman. Gunakan pencarian untuk mempersempit daftar. Jika akun hanya memiliki hak baca, tindakan drag dan penempatan tetap dinonaktifkan.</p></div>
          {filteredEmployees.length>48 && <div className="mt-3 flex items-center justify-between"><button type="button" disabled={employeePage===0} onClick={()=>setEmployeePage((n)=>Math.max(0,n-1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">Sebelumnya</button><span className="text-xs text-slate-500">Halaman {employeePage+1} dari {Math.ceil(filteredEmployees.length/48)}</span><button type="button" disabled={(employeePage+1)*48>=filteredEmployees.length} onClick={()=>setEmployeePage((n)=>n+1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">Berikutnya</button></div>}
          <div><h3 className="mb-2 text-sm font-bold text-slate-800">Proyek tujuan</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{projects.map((project)=>{const count=activeAssignments.filter((row)=>row.project_id===project.id).length;return <div key={project.id} onDragOver={(event)=>{if(canManage){event.preventDefault();event.dataTransfer.dropEffect='copy';}}} onDrop={(event)=>{event.preventDefault();if(!canManage)return;const droppedId=event.dataTransfer.getData('text/plain')||draggingEmployeeId;const ids: string[] = droppedId ? (selectedEmployeeIds.includes(droppedId) ? selectedEmployeeIds : [droppedId]) : selectedEmployeeIds;openBulkAssign(project.id,ids);}} className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 transition hover:border-emerald-500 hover:bg-emerald-50"><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-slate-900">{project.title}</p><p className="mt-1 text-xs text-slate-500">{project.client ?? 'Proyek'} · {count} pekerja aktif</p></div><Building2 className="h-5 w-5 text-emerald-700"/></div><button type="button" disabled={!canManage||selectedEmployeeIds.length===0} onClick={()=>openBulkAssign(project.id)} className="mt-3 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Tempatkan {selectedEmployeeIds.length||''} pekerja di sini</button></div>;})}</div></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-bold text-slate-900">Daftar Penempatan</h2><p className="mt-0.5 text-xs text-slate-500">{filtered.length} dari {assignments.length} catatan penempatan</p></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[680px]">
              <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, nomor, proyek..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></label>
              <label className="relative block"><Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"><option value="all">Semua proyek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"><option value="all">Semua status</option><option value="active">Aktif</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select>
            </div>
          </div>

          {assignments.length === 0 ? <div className="p-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><HardHat className="h-6 w-6 text-slate-400"/></div><h3 className="mt-3 font-bold text-slate-800">Belum ada penempatan tenaga kerja</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Tambahkan karyawan ke proyek dan tentukan lokasi pekerjaannya. Data karyawan tetap tersimpan satu kali di Master Karyawan.</p>{canManage && employees.length > 0 && projects.length > 0 && <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4"/> Tambah Penempatan</button>}</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Tidak ada data yang sesuai dengan pencarian atau filter.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nomor / Karyawan</th><th className="px-4 py-3">Proyek & Lokasi</th><th className="px-4 py-3">Peran / Jabatan</th><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-bold text-emerald-800">{row.assignment_number}</p><p className="mt-1 font-semibold text-slate-900">{row.employee?.full_name ?? 'Karyawan tidak ditemukan'}</p><p className="text-xs text-slate-500">{row.employee?.employee_number ?? '—'} · {EMPLOYMENT_LABELS[row.employee?.employment_type ?? ''] ?? row.employee?.employment_type ?? '—'}</p></td><td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.project?.title ?? 'Proyek tidak ditemukan'}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3"/>{row.division?.name ?? 'Penugasan umum / seluruh proyek'}</p><p className="text-xs text-slate-400">{row.project?.client ?? ''}</p></td><td className="px-4 py-3 font-medium text-slate-700">{row.assignment_title}</td><td className="px-4 py-3 text-xs text-slate-600"><p>{dateLabel(row.start_date)}</p><p className="mt-1 text-slate-400">s.d. {dateLabel(row.end_date)}</p></td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : row.status === 'completed' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[row.status]}</span></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1.5">{canManage && <><button type="button" onClick={() => openEdit(row)} title="Edit penempatan" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white"><Pencil className="h-4 w-4"/></button>{row.status === 'active' && <button type="button" onClick={() => void changeStatus(row, 'completed')} title="Tandai selesai" className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4"/></button>}</>}</div></td></tr>)}</tbody></table></div>}
        </section>
      </>}

      {modalOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="flex items-start gap-3 border-b border-slate-100 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50"><HardHat className="h-5 w-5 text-emerald-700"/></div><div className="min-w-0 flex-1"><h2 id="assignment-dialog-title" className="text-lg font-bold text-slate-900">{editing ? `Edit Penempatan ${editing.assignment_number}` : 'Tambah Penempatan Tenaga Kerja'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">Pilih karyawan dan tetapkan proyek untuk periode tertentu. Untuk pekerjaan per tanggal atau perpindahan proyek harian, gunakan halaman Penugasan Harian.</p></div><button type="button" onClick={() => !saving && setModalOpen(false)} disabled={saving} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4"/></button></div>
        <form onSubmit={handleSave} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL_CLASS}>Karyawan<select required value={draft.employee_id} onChange={(event) => setDraft((current) => ({ ...current, employee_id: event.target.value, assignment_title: current.assignment_title || employees.find((item) => item.id === event.target.value)?.position_title || '' }))} className={INPUT_CLASS}><option value="">Pilih karyawan aktif</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_number} — {employee.full_name}</option>)}</select>{selectedEmployee && <span className="mt-1 block text-[11px] font-normal text-slate-400">{selectedEmployee.department || 'Tanpa departemen'} · {EMPLOYMENT_LABELS[selectedEmployee.employment_type] ?? selectedEmployee.employment_type}</span>}</label>
            <label className={LABEL_CLASS}>Proyek<select required value={draft.project_id} onChange={(event) => setDraft((current) => ({ ...current, project_id: event.target.value, division_id: '' }))} className={INPUT_CLASS}><option value="">Pilih proyek</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label className={LABEL_CLASS}>Lokasi pekerjaan / divisi RAB<select value={draft.division_id} onChange={(event) => setDraft((current) => ({ ...current, division_id: event.target.value }))} className={INPUT_CLASS} disabled={!draft.project_id}><option value="">Penugasan umum / seluruh proyek</option>{visibleDivisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} — ` : ''}{division.name}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-400">Kosongkan jika penugasan tidak dibatasi pada satu lokasi pekerjaan.</span></label>
            <label className={LABEL_CLASS}>Jabatan / peran pada proyek<input required maxLength={120} value={draft.assignment_title} onChange={(event) => setDraft((current) => ({ ...current, assignment_title: event.target.value }))} placeholder="Contoh: Mandor, Tukang, Teknisi, Pengawas" className={INPUT_CLASS}/></label>
            <label className={LABEL_CLASS}>Tanggal mulai<input required type="date" value={draft.start_date} onChange={(event) => setDraft((current) => ({ ...current, start_date: event.target.value }))} className={INPUT_CLASS}/></label>
            <label className={LABEL_CLASS}>Tanggal selesai (opsional)<input type="date" min={draft.start_date} value={draft.end_date} onChange={(event) => setDraft((current) => ({ ...current, end_date: event.target.value }))} className={INPUT_CLASS}/></label>
            <label className={LABEL_CLASS}>Status penempatan<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as WorkAssignmentStatus }))} className={INPUT_CLASS}><option value="active">Aktif</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></label>
          </div>
          <label className={LABEL_CLASS}>Catatan<textarea rows={3} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Catatan penempatan, jadwal khusus, atau keterangan lain..." className={INPUT_CLASS}/></label>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between"><p className="text-[11px] leading-5 text-slate-400">Nomor penempatan dibuat otomatis setelah data disimpan.</p><div className="flex gap-2"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Penempatan'}</button></div></div>
        </form>
      </section></div>}
      {bulkModalOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="bulk-work-assignment-title" className="my-auto w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Penempatan massal</p><h2 id="bulk-work-assignment-title" className="mt-1 text-lg font-bold text-slate-900">Konfirmasi penempatan proyek</h2><p className="mt-1 text-xs text-slate-500">{selectedEmployeeIds.length} karyawan akan ditempatkan ke {projects.find((item)=>item.id===bulkProjectId)?.title ?? 'proyek tujuan'}.</p></div><button type="button" onClick={()=>!saving&&setBulkModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></header><form onSubmit={saveBulkAssignments} className="space-y-4 p-5"><label className={LABEL_CLASS}>Proyek tujuan<select required value={bulkProjectId} onChange={(e)=>setBulkProjectId(e.target.value)} className={INPUT_CLASS}><option value="">Pilih proyek</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label className={LABEL_CLASS}>Peran / jabatan pada proyek<input required maxLength={120} value={bulkTitle} onChange={(e)=>setBulkTitle(e.target.value)} className={INPUT_CLASS} placeholder="Contoh: Tim lapangan, Tukang, Mandor"/></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL_CLASS}>Tanggal mulai<input required type="date" value={bulkStartDate} onChange={(e)=>setBulkStartDate(e.target.value)} className={INPUT_CLASS}/></label><label className={LABEL_CLASS}>Tanggal selesai (opsional)<input type="date" min={bulkStartDate} value={bulkEndDate} onChange={(e)=>setBulkEndDate(e.target.value)} className={INPUT_CLASS}/></label></div><div className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Penempatan dibuat sebagai penugasan umum proyek (tanpa divisi RAB). Riwayat penempatan lama tetap disimpan. Karyawan yang sudah aktif pada proyek yang sama akan dilewati untuk mencegah duplikasi.</div>{error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setBulkModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Batal</button><button type="submit" disabled={saving||!selectedEmployeeIds.length||!bulkProjectId} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?'Memproses...':`Tempatkan ${selectedEmployeeIds.length} karyawan`}</button></div></form></section></div>}
    </main>
  );
}

export default function WorkAssignmentPage() {
  return <RequireAuth permission="personnel.read"><WorkAssignmentContent/></RequireAuth>;
}
