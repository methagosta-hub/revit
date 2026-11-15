'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Download,
  LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Search, Users, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import PersonnelWorkflowWizard from '@/components/personalia/PersonnelWorkflowWizard';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  createDailyAssignment, fetchDailyAssignmentPageData, updateDailyAssignment,
} from '@/lib/services/personnelOperationsService';
import type {
  DailyAssignment, DailyAssignmentInput, DailyAssignmentStatus, DailyAssignmentType,
  DivisionOption, EmployeeOption, ProjectOption,
} from '@/types/personnelOperations';

const TYPE_LABELS: Record<DailyAssignmentType, string> = {
  project: 'Proyek', office: 'Kantor', warehouse: 'Gudang', workshop: 'Workshop', other: 'Lainnya',
};
const STATUS_LABELS: Record<DailyAssignmentStatus, string> = {
  planned: 'Direncanakan', in_progress: 'Berjalan', completed: 'Selesai', cancelled: 'Dibatalkan',
};
const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';

type Draft = {
  employee_id: string; assignment_date: string; assignment_type: DailyAssignmentType;
  project_id: string; division_id: string; location_name: string; task_title: string;
  start_time: string; end_time: string; status: DailyAssignmentStatus; notes: string;
};
function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dateLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}
function blankDraft(): Draft {
  return { employee_id: '', assignment_date: localDate(), assignment_type: 'project', project_id: '', division_id: '', location_name: '', task_title: '', start_time: '', end_time: '', status: 'planned', notes: '' };
}
function draftFromRow(row: DailyAssignment): Draft {
  return {
    employee_id: row.employee_id, assignment_date: row.assignment_date, assignment_type: row.assignment_type,
    project_id: row.project_id ?? '', division_id: row.division_id ?? '', location_name: row.location_name ?? '',
    task_title: row.task_title, start_time: row.start_time?.slice(0, 5) ?? '', end_time: row.end_time?.slice(0, 5) ?? '',
    status: row.status, notes: row.notes ?? '',
  };
}
function toInput(draft: Draft): DailyAssignmentInput {
  return {
    employee_id: draft.employee_id, assignment_date: draft.assignment_date,
    assignment_type: draft.assignment_type, project_id: draft.project_id || null,
    division_id: draft.division_id || null, location_name: draft.location_name || null,
    task_title: draft.task_title, start_time: draft.start_time || null, end_time: draft.end_time || null,
    status: draft.status, notes: draft.notes || null,
  };
}
function exportCsv(rows: DailyAssignment[]) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const data = [
    ['Nomor Penugasan', 'Tanggal', 'Nomor Karyawan', 'Nama Karyawan', 'Jenis', 'Tujuan', 'Pekerjaan', 'Mulai', 'Selesai', 'Status', 'Catatan'],
    ...rows.map((row) => [row.assignment_number, row.assignment_date, row.employee?.employee_number,
      row.employee?.full_name, TYPE_LABELS[row.assignment_type], row.project?.title ?? row.location_name ?? row.division?.name,
      row.task_title, row.start_time, row.end_time, STATUS_LABELS[row.status], row.notes]),
  ];
  const csv = data.map((line) => line.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `penugasan-harian-${localDate()}.csv`; document.body.appendChild(anchor);
  anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function DailyAssignmentContent() {
  const [rows, setRows] = useState<DailyAssignment[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(localDate());
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailyAssignment | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [data, access] = await Promise.all([fetchDailyAssignmentPageData(), getMyAccess()]);
      setRows(data.assignments); setEmployees(data.employees); setProjects(data.projects); setDivisions(data.divisions);
      setCanManage(hasPermission(access, 'personnel.manage'));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return rows.filter((row) => {
      const dateMatch = dateFilter === 'all' || row.assignment_date === dateFilter;
      const typeMatch = typeFilter === 'all' || row.assignment_type === typeFilter;
      const statusMatch = statusFilter === 'all' || row.status === statusFilter;
      const haystack = [row.assignment_number, row.employee?.employee_number, row.employee?.full_name,
        row.project?.title, row.division?.name, row.location_name, row.task_title].join(' ').toLocaleLowerCase('id');
      return dateMatch && typeMatch && statusMatch && (!keyword || haystack.includes(keyword));
    });
  }, [rows, search, dateFilter, typeFilter, statusFilter]);

  const visibleDivisions = divisions.filter((item: DivisionOption) => item.project_id === draft.project_id);
  const selectedEmployee = employees.find((employee: EmployeeOption) => employee.id === draft.employee_id);
  const openCreate = () => { setEditing(null); setDraft(blankDraft()); setError(''); setNotice(''); setModalOpen(true); };
  const openEdit = (row: DailyAssignment) => { setEditing(row); setDraft(draftFromRow(row)); setError(''); setNotice(''); setModalOpen(true); };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (editing) await updateDailyAssignment(editing.id, toInput(draft));
      else await createDailyAssignment(toInput(draft));
      setModalOpen(false);
      setNotice(editing ? `Penugasan ${editing.assignment_number} berhasil diperbarui.` : 'Penugasan harian berhasil dicatat.');
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const completeTask = async (row: DailyAssignment) => {
    if (!window.confirm(`Tandai pekerjaan ${row.assignment_number} sebagai selesai?`)) return;
    setError(''); setNotice('');
    try {
      await updateDailyAssignment(row.id, { ...draftFromRow(row), project_id: row.project_id, division_id: row.division_id,
        location_name: row.location_name, start_time: row.start_time, end_time: row.end_time,
        task_title: row.task_title, notes: row.notes, status: 'completed' });
      setNotice(`Penugasan ${row.assignment_number} telah diselesaikan.`); await load(true);
    } catch (err) { setError(errorMessage(err)); }
  };

  const activeEmployees = employees.filter((employee) => employee.status === 'active'
    || (editing && employee.id === editing.employee_id));
  const todayCount = rows.filter((row) => row.assignment_date === localDate() && row.status !== 'cancelled').length;
  const projectTaskCount = rows.filter((row) => row.assignment_date === (dateFilter === 'all' ? localDate() : dateFilter) && row.assignment_type === 'project' && row.status !== 'cancelled').length;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Personalia · Operasional Harian</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Penugasan Harian</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Catat pekerjaan aktual karyawan per tanggal. Satu karyawan boleh memiliki beberapa tugas dalam satu hari, termasuk di proyek yang berbeda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Segarkan</button>
          <button onClick={() => exportCsv(filtered)} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4"/> Ekspor CSV</button>
          {canManage && <button onClick={openCreate} disabled={!activeEmployees.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/> Tambah Penugasan</button>}
        </div>
      </header>

      <PersonnelWorkflowWizard currentStep={4} />

      {(error || notice) && <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<p className="flex-1">{error || notice}</p><button onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup"><X className="h-4 w-4"/></button>
      </div>}

      {loading ? <div className="flex min-h-60 items-center justify-center gap-3 rounded-2xl border bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700"/> Memuat penugasan harian...</div> : <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Tugas hari ini <CalendarDays className="h-5 w-5 text-emerald-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{todayCount}</p><p className="mt-1 text-xs text-slate-500">Tidak termasuk tugas dibatalkan</p></div>
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Tugas pada proyek <BriefcaseBusiness className="h-5 w-5 text-sky-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{projectTaskCount}</p><p className="mt-1 text-xs text-slate-500">Untuk tanggal filter yang dipilih</p></div>
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Karyawan ditugaskan <Users className="h-5 w-5 text-amber-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{new Set(filtered.map((row) => row.employee_id)).size}</p><p className="mt-1 text-xs text-slate-500">Sesuai filter yang sedang aktif</p></div>
        </section>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900"><strong>Pemisahan data:</strong> penugasan harian mencatat pekerjaan aktual, bukan absensi. Satu karyawan tetap memiliki satu data induk; beberapa tugas dalam satu tanggal diperbolehkan. Jika jam mulai dan selesai diisi, sistem menolak waktu yang tumpang tindih.</div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
            <div><h2 className="font-bold text-slate-900">Daftar Penugasan</h2><p className="mt-0.5 text-xs text-slate-500">{filtered.length} dari {rows.length} catatan penugasan</p></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, proyek, pekerjaan..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></label>
              <input aria-label="Filter tanggal" type="date" value={dateFilter === 'all' ? '' : dateFilter} onChange={(e) => setDateFilter(e.target.value || 'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Semua jenis tugas</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Semua status</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            </div>
            <div className="flex flex-wrap gap-2"><button onClick={() => setDateFilter(localDate())} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Hari ini</button><button onClick={() => setDateFilter('all')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Semua tanggal</button></div>
          </div>
          {!rows.length ? <div className="p-12 text-center"><CalendarDays className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-3 font-bold text-slate-800">Belum ada penugasan harian</h3><p className="mt-1 text-sm text-slate-500">Catat pekerjaan karyawan berdasarkan tanggal dan tujuan kerja aktualnya.</p></div>
            : !filtered.length ? <p className="p-10 text-center text-sm text-slate-500">Tidak ada penugasan yang sesuai filter.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Tanggal / Karyawan</th><th className="px-4 py-3">Tujuan kerja</th><th className="px-4 py-3">Pekerjaan</th><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/60"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{dateLabel(row.assignment_date)}</p><p className="mt-1 text-slate-700">{row.employee?.full_name ?? 'Karyawan tidak ditemukan'}</p><p className="text-xs text-slate-500">{row.employee?.employee_number ?? '—'} · {row.assignment_number}</p></td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{TYPE_LABELS[row.assignment_type]}</span><p className="mt-2 font-semibold text-slate-800">{row.assignment_type === 'project' ? row.project?.title ?? 'Proyek tidak ditemukan' : row.location_name}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3"/>{row.assignment_type === 'project' ? row.division?.name ?? 'Umum / seluruh proyek' : row.location_name}</p></td><td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.task_title}</p>{row.notes && <p className="mt-1 max-w-xs text-xs text-slate-500">{row.notes}</p>}</td><td className="px-4 py-3 text-xs text-slate-600"><p className="flex items-center gap-1"><Clock3 className="h-3 w-3"/>{row.start_time ? `${row.start_time.slice(0, 5)} – ${row.end_time?.slice(0, 5)}` : 'Tidak ditentukan'}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : row.status === 'in_progress' ? 'bg-sky-50 text-sky-700' : row.status === 'planned' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[row.status]}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1.5">{canManage && <><button onClick={() => openEdit(row)} title="Edit penugasan" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white"><Pencil className="h-4 w-4"/></button>{row.status !== 'completed' && row.status !== 'cancelled' && <button onClick={() => void completeTask(row)} title="Tandai selesai" className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4"/></button>}</>}</div></td></tr>)}</tbody></table></div>}
        </section>
      </>}

      {modalOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="daily-assignment-title" className="my-auto w-full max-w-3xl rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 id="daily-assignment-title" className="text-lg font-bold text-slate-900">{editing ? `Edit ${editing.assignment_number}` : 'Tambah Penugasan Harian'}</h2><p className="mt-1 text-xs text-slate-500">Catat satu pekerjaan aktual. Untuk pekerjaan berbeda pada hari yang sama, buat catatan terpisah.</p></div><button onClick={() => !saving && setModalOpen(false)} disabled={saving} aria-label="Tutup"><X className="h-5 w-5 text-slate-400"/></button></div>
        <form onSubmit={handleSave} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2">
          <label className={LABEL}>Karyawan<select required value={draft.employee_id} onChange={(e) => setDraft((v) => ({ ...v, employee_id: e.target.value }))} className={INPUT}><option value="">Pilih karyawan aktif</option>{activeEmployees.map((employee: EmployeeOption) => <option key={employee.id} value={employee.id}>{employee.employee_number} — {employee.full_name}{employee.status !== 'active' ? ' (nonaktif - riwayat)' : ''}</option>)}</select>{selectedEmployee && <span className="mt-1 block text-[11px] font-normal text-slate-400">{selectedEmployee.position_title ?? selectedEmployee.department ?? 'Tanpa jabatan'} · {selectedEmployee.employment_type}</span>}</label>
          <label className={LABEL}>Tanggal penugasan<input required type="date" value={draft.assignment_date} onChange={(e) => setDraft((v) => ({ ...v, assignment_date: e.target.value }))} className={INPUT}/></label>
          <label className={LABEL}>Jenis penugasan<select value={draft.assignment_type} onChange={(e) => setDraft((v) => ({ ...v, assignment_type: e.target.value as DailyAssignmentType, project_id: '', division_id: '', location_name: '' }))} className={INPUT}><option value="project">Proyek</option><option value="office">Kantor</option><option value="warehouse">Gudang</option><option value="workshop">Workshop</option><option value="other">Lainnya</option></select></label>
          {draft.assignment_type === 'project' ? <>
            <label className={LABEL}>Proyek<select required value={draft.project_id} onChange={(e) => setDraft((v) => ({ ...v, project_id: e.target.value, division_id: '' }))} className={INPUT}><option value="">Pilih proyek</option>{projects.map((project: ProjectOption) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label className={LABEL}>Lokasi pekerjaan / divisi RAB<select value={draft.division_id} onChange={(e) => setDraft((v) => ({ ...v, division_id: e.target.value }))} disabled={!draft.project_id} className={INPUT}><option value="">Umum / tidak ditentukan</option>{visibleDivisions.map((division: DivisionOption) => <option key={division.id} value={division.id}>{division.code ? `${division.code} — ` : ''}{division.name}</option>)}</select></label>
          </> : <label className={LABEL}>Nama lokasi / unit<input required maxLength={180} value={draft.location_name} onChange={(e) => setDraft((v) => ({ ...v, location_name: e.target.value }))} placeholder={draft.assignment_type === 'office' ? 'Contoh: Kantor Pusat' : draft.assignment_type === 'warehouse' ? 'Contoh: Gudang Utama' : draft.assignment_type === 'workshop' ? 'Contoh: Workshop Kusen' : 'Tuliskan lokasi pekerjaan'} className={INPUT}/></label>}
          <label className={LABEL}>Nama pekerjaan<input required maxLength={160} value={draft.task_title} onChange={(e) => setDraft((v) => ({ ...v, task_title: e.target.value }))} placeholder="Contoh: Pemasangan kusen aluminium" className={INPUT}/></label>
          <label className={LABEL}>Jam mulai (opsional)<input type="time" value={draft.start_time} onChange={(e) => setDraft((v) => ({ ...v, start_time: e.target.value }))} className={INPUT}/></label>
          <label className={LABEL}>Jam selesai (opsional)<input type="time" value={draft.end_time} onChange={(e) => setDraft((v) => ({ ...v, end_time: e.target.value }))} className={INPUT}/></label>
          <label className={LABEL}>Status pekerjaan<select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value as DailyAssignmentStatus }))} className={INPUT}><option value="planned">Direncanakan</option><option value="in_progress">Sedang berjalan</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></label>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">Pengisian jam bersifat opsional. Bila diisi, jam mulai dan selesai harus lengkap. Sistem mencegah jadwal satu karyawan bertabrakan pada tanggal yang sama. Pekerjaan yang melewati tengah malam dicatat sebagai dua penugasan terpisah.</p>
        <label className={LABEL}>Catatan<textarea rows={3} value={draft.notes} onChange={(e) => setDraft((v) => ({ ...v, notes: e.target.value }))} placeholder="Catatan hasil kerja, instruksi, atau keterangan lain..." className={INPUT}/></label>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}{saving ? 'Menyimpan...' : 'Simpan Penugasan'}</button></div>
        </form></section></div>}
    </main>
  );
}

export default function DailyAssignmentPage() {
  return <RequireAuth permission="personnel.read"><DailyAssignmentContent/></RequireAuth>;
}
