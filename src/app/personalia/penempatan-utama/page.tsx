'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle, Building2, CheckCircle2, Download, LoaderCircle, MapPin,
  Pencil, Plus, RefreshCw, Search, Users, X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import PersonnelWorkflowWizard from '@/components/personalia/PersonnelWorkflowWizard';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import {
  closeMainPlacement, createMainPlacement, fetchMainPlacementPageData, updateMainPlacement,
} from '@/lib/services/personnelOperationsService';
import type {
  EmployeeOption, MainPlacement, MainPlacementInput, MainPlacementStatus, UnitType,
} from '@/types/personnelOperations';

const UNIT_LABELS: Record<UnitType, string> = {
  office: 'Kantor', warehouse: 'Gudang', workshop: 'Workshop', field: 'Lapangan', other: 'Lainnya',
};
const STATUS_LABELS: Record<MainPlacementStatus, string> = {
  active: 'Aktif', completed: 'Selesai', cancelled: 'Dibatalkan',
};
const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';

type Draft = {
  employee_id: string; unit_type: UnitType; unit_name: string; base_location: string;
  start_date: string; end_date: string; status: MainPlacementStatus; notes: string;
};

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dateLabel(value: string | null): string {
  if (!value) return 'Belum ditentukan';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}
function blankDraft(): Draft {
  return { employee_id: '', unit_type: 'field', unit_name: '', base_location: '', start_date: localDate(), end_date: '', status: 'active', notes: '' };
}
function draftFromRow(row: MainPlacement): Draft {
  return {
    employee_id: row.employee_id, unit_type: row.unit_type, unit_name: row.unit_name,
    base_location: row.base_location ?? '', start_date: row.start_date, end_date: row.end_date ?? '',
    status: row.status, notes: row.notes ?? '',
  };
}
function toInput(draft: Draft): MainPlacementInput {
  return {
    employee_id: draft.employee_id, unit_type: draft.unit_type, unit_name: draft.unit_name,
    base_location: draft.base_location || null, start_date: draft.start_date,
    end_date: draft.end_date || null, status: draft.status, notes: draft.notes || null,
  };
}
function exportCsv(rows: MainPlacement[]) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const data = [
    ['Nomor Penempatan', 'Nomor Karyawan', 'Nama Karyawan', 'Jenis Unit', 'Nama Unit', 'Lokasi Basis', 'Mulai', 'Selesai', 'Status', 'Catatan'],
    ...rows.map((row) => [row.placement_number, row.employee?.employee_number, row.employee?.full_name,
      UNIT_LABELS[row.unit_type], row.unit_name, row.base_location, row.start_date, row.end_date,
      STATUS_LABELS[row.status], row.notes]),
  ];
  const csv = data.map((line) => line.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `penempatan-utama-${localDate()}.csv`; document.body.appendChild(anchor);
  anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function MainPlacementContent() {
  const [rows, setRows] = useState<MainPlacement[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MainPlacement | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeePage, setEmployeePage] = useState(0);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [data, access] = await Promise.all([fetchMainPlacementPageData(), getMyAccess()]);
      setRows(data.placements); setEmployees(data.employees);
      setCanManage(hasPermission(access, 'personnel.manage'));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activeRows = rows.filter((row) => row.status === 'active');
  const activeEmployeeIds = new Set(activeRows.map((row) => row.employee_id));
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return rows.filter((row) => {
      const statusMatch = statusFilter === 'all' || row.status === statusFilter;
      const haystack = [row.placement_number, row.employee?.employee_number, row.employee?.full_name,
        row.unit_name, UNIT_LABELS[row.unit_type], row.base_location].join(' ').toLocaleLowerCase('id');
      return statusMatch && (!keyword || haystack.includes(keyword));
    });
  }, [rows, search, statusFilter]);

  const openCreate = () => { setEditing(null); setSelectedEmployeeIds([]); setDraft(blankDraft()); setError(''); setNotice(''); setModalOpen(true); };
  const openEdit = (row: MainPlacement) => { setEditing(row); setSelectedEmployeeIds([]); setDraft(draftFromRow(row)); setError(''); setNotice(''); setModalOpen(true); };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setNotice('');
    let created = 0;
    const failures: string[] = [];
    try {
      if (editing) {
        await updateMainPlacement(editing.id, toInput(draft));
      } else {
        const targetIds = selectedEmployeeIds.length ? selectedEmployeeIds : (draft.employee_id ? [draft.employee_id] : []);
        if (!targetIds.length) throw new Error('Pilih minimal satu karyawan dari dashboard karyawan.');
        for (const employeeId of targetIds) {
          try {
            await createMainPlacement({ ...toInput(draft), employee_id: employeeId });
            created += 1;
          } catch (cause) {
            const employee = employees.find((item) => item.id === employeeId);
            failures.push(`${employee?.full_name ?? employeeId}: ${errorMessage(cause)}`);
          }
        }
      }
      setModalOpen(false);
      await load(true);
      setNotice(editing ? 'Penempatan utama berhasil diperbarui.' : `${created} penempatan utama berhasil dibuat${failures.length ? `; ${failures.length} gagal` : ''}.`);
      if (failures.length) setError(failures.slice(0, 3).join(' | '));
      setSelectedEmployeeIds([]);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };
  const finishPlacement = async (row: MainPlacement) => {
    if (!window.confirm(`Selesaikan penempatan ${row.placement_number} (${row.employee?.full_name ?? 'karyawan'}) per hari ini? Setelah itu Anda dapat membuat penempatan utama yang baru.`)) return;
    setError(''); setNotice('');
    try {
      await closeMainPlacement(row, localDate());
      setNotice(`Penempatan ${row.placement_number} telah diselesaikan.`);
      await load(true);
    } catch (err) { setError(errorMessage(err)); }
  };

  const eligibleEmployees = employees.filter((employee) => employee.status === 'active'
    && (!activeEmployeeIds.has(employee.id) || employee.id === editing?.employee_id));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Personalia · Organisasi Karyawan</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Penempatan Utama</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Catat unit atau basis kerja utama karyawan. Penempatan ini tidak harus terikat pada proyek.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Segarkan</button>
          <button onClick={() => exportCsv(filtered)} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4"/> Ekspor CSV</button>
          {canManage && <button onClick={openCreate} disabled={!eligibleEmployees.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/> Tambah Penempatan</button>}
        </div>
      </header>

      <PersonnelWorkflowWizard currentStep={2} />

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Employee workspace</p><h2 className="mt-1 text-lg font-bold text-slate-900">Pilih karyawan untuk penempatan utama</h2><p className="mt-1 text-xs text-slate-500">Cari nama atau nomor karyawan, lalu pilih beberapa sekaligus. Tidak perlu menelusuri dropdown panjang.</p></div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{selectedEmployeeIds.length} dipilih</span><button type="button" onClick={() => setSelectedEmployeeIds(eligibleEmployees.map((item) => item.id))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Pilih semua yang tersedia</button><button type="button" onClick={() => setSelectedEmployeeIds([])} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Bersihkan</button><button type="button" disabled={!canManage || selectedEmployeeIds.length===0} onClick={() => { setEditing(null); setDraft(blankDraft()); setError(''); setNotice(''); setModalOpen(true); }} className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">Buat penempatan massal</button></div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(220px,1fr)_auto]"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={employeeSearch} onChange={(e)=>{setEmployeeSearch(e.target.value);setEmployeePage(0);}} placeholder="Cari nama atau nomor karyawan..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></label><p className="self-center text-xs text-slate-500">{eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).length} karyawan tersedia</p></div>
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
          {eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).slice(employeePage*24,(employeePage+1)*24).map((emp)=><label key={emp.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selectedEmployeeIds.includes(emp.id)?'border-emerald-300 bg-emerald-50':'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'}`}><input type="checkbox" checked={selectedEmployeeIds.includes(emp.id)} onChange={(e)=>setSelectedEmployeeIds((current)=>e.target.checked?[...current,emp.id]:current.filter((id)=>id!==emp.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{emp.full_name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{emp.employee_number} · {emp.position_title ?? emp.department ?? 'Jabatan belum diisi'}</span></span></label>)}
          {eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).length===0 && <p className="col-span-full rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Tidak ada karyawan yang cocok dengan pencarian.</p>}
        </div>
        {eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).length>24 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><button type="button" disabled={employeePage===0} onClick={()=>setEmployeePage((n)=>Math.max(0,n-1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">Sebelumnya</button><span className="text-xs text-slate-500">Halaman {employeePage+1} dari {Math.ceil(eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).length/24)}</span><button type="button" disabled={(employeePage+1)*24>=eligibleEmployees.filter((emp)=>`${emp.employee_number} ${emp.full_name}`.toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))).length} onClick={()=>setEmployeePage((n)=>n+1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">Berikutnya</button></div>}
      </section>

      {(error || notice) && <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<p className="flex-1">{error || notice}</p><button onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup"><X className="h-4 w-4"/></button>
      </div>}

      {loading ? <div className="flex min-h-60 items-center justify-center gap-3 rounded-2xl border bg-white text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700"/> Memuat data penempatan...</div> : <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Penempatan aktif <Building2 className="h-5 w-5 text-emerald-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{activeRows.length}</p><p className="mt-1 text-xs text-slate-500">Catatan penempatan utama yang berlaku</p></div>
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Karyawan terpetakan <Users className="h-5 w-5 text-sky-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{new Set(activeRows.map((row) => row.employee_id)).size}</p><p className="mt-1 text-xs text-slate-500">Karyawan dengan unit utama aktif</p></div>
          <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">Total riwayat <MapPin className="h-5 w-5 text-amber-700"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{rows.length}</p><p className="mt-1 text-xs text-slate-500">Termasuk penempatan yang selesai</p></div>
        </section>

        {filtered.length > 0 ? <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><div className="mb-3"><h2 className="font-bold text-slate-900">Cetak surat penempatan pekerja</h2><p className="text-xs text-slate-600">Pilih penempatan yang sudah tersimpan untuk mencetak salinan PDF.</p></div><div className="grid gap-3 lg:grid-cols-2">{filtered.map((placement) => (
          <article key={`pdf-${placement.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm"><div><p className="font-bold text-emerald-800">{placement.placement_number}</p><p className="text-xs text-slate-600">{placement.employee?.full_name ?? 'Karyawan'} · {placement.unit_name}</p></div>
            <BusinessDocumentPdfButton identity={{ type: 'employee_placement', code: placement.placement_number, title: 'Surat Penempatan Pekerja', sourceStatus: placement.status, generatedAt: new Date().toISOString(), period: `${dateLabel(placement.start_date)}${placement.end_date ? ` s.d. ${dateLabel(placement.end_date)}` : ''}`, classification: 'Dokumen personalia' }} sections={[
              { title: 'Identitas penempatan', details: [
                { label: 'Nomor penempatan', value: placement.placement_number }, { label: 'Nama pekerja', value: placement.employee?.full_name ?? '—' },
                { label: 'Nomor pekerja', value: placement.employee?.employee_number ?? '—' }, { label: 'Jabatan', value: placement.employee?.position_title ?? placement.employee?.department ?? '—' },
                { label: 'Unit / tim', value: placement.unit_name }, { label: 'Tipe unit', value: UNIT_LABELS[placement.unit_type] },
                { label: 'Lokasi', value: placement.base_location ?? '—' }, { label: 'Mulai berlaku', value: dateLabel(placement.start_date) },
                { label: 'Berakhir', value: placement.end_date ? dateLabel(placement.end_date) : 'Sampai ada pembaruan status' }, { label: 'Status', value: STATUS_LABELS[placement.status] },
              ] },
              { title: 'Catatan penempatan', paragraphs: [placement.notes?.trim() || 'Tidak ada catatan tambahan pada penempatan sumber.'] },
            ]} />
          </article>
        ))}</div></section> : null}

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          <strong>Aturan pengelolaan:</strong> satu karyawan hanya memiliki satu penempatan utama aktif. Untuk memindahkan unit, selesaikan penempatan lama terlebih dahulu, lalu buat penempatan baru. Perpindahan pekerjaan harian ke proyek lain dicatat di halaman Penugasan Harian.
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-bold text-slate-900">Riwayat Penempatan Utama</h2><p className="mt-0.5 text-xs text-slate-500">{filtered.length} dari {rows.length} catatan</p></div>
            <div className="grid gap-2 sm:grid-cols-2 md:min-w-[460px]">
              <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari karyawan, unit, nomor..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Semua status</option><option value="active">Aktif</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select>
            </div>
          </div>
          {!rows.length ? <div className="p-12 text-center"><Building2 className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-3 font-bold text-slate-800">Belum ada penempatan utama</h3><p className="mt-1 text-sm text-slate-500">Mulai dengan menetapkan karyawan ke kantor, gudang, workshop, atau tim lapangan.</p></div>
            : !filtered.length ? <p className="p-10 text-center text-sm text-slate-500">Tidak ada data yang sesuai filter.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Karyawan</th><th className="px-4 py-3">Unit / Basis</th><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/60"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.employee?.full_name ?? 'Karyawan tidak ditemukan'}</p><p className="text-xs text-slate-500">{row.employee?.employee_number ?? '—'} · {row.employee?.position_title ?? row.employee?.department ?? '—'}</p><p className="mt-1 text-xs text-emerald-800">{row.placement_number}</p></td><td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.unit_name}</p><p className="text-xs text-slate-500">{UNIT_LABELS[row.unit_type]}{row.base_location ? ` · ${row.base_location}` : ''}</p></td><td className="px-4 py-3 text-xs text-slate-600">{dateLabel(row.start_date)}<p className="mt-1 text-slate-400">s.d. {dateLabel(row.end_date)}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : row.status === 'completed' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[row.status]}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1.5">{canManage && <><button onClick={() => openEdit(row)} title="Edit" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white"><Pencil className="h-4 w-4"/></button>{row.status === 'active' && <button onClick={() => void finishPlacement(row)} title="Selesaikan penempatan" className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4"/></button>}</>}</div></td></tr>)}</tbody></table></div>}
        </section>
      </>}

      {modalOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="main-placement-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 id="main-placement-title" className="text-lg font-bold text-slate-900">{editing ? `Edit ${editing.placement_number}` : 'Tambah Penempatan Utama'}</h2><p className="mt-1 text-xs text-slate-500">Pilih unit utama karyawan. Ini bukan penugasan proyek harian.</p></div><button onClick={() => !saving && setModalOpen(false)} disabled={saving} aria-label="Tutup"><X className="h-5 w-5 text-slate-400"/></button></div>
        <form onSubmit={handleSave} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2">
          {editing || selectedEmployeeIds.length===0 ? <label className={LABEL}>Karyawan<select required value={draft.employee_id} disabled={Boolean(editing)} onChange={(e) => setDraft((v) => ({ ...v, employee_id: e.target.value }))} className={INPUT}><option value="">Pilih karyawan</option>{(editing ? employees.filter((emp) => emp.id === draft.employee_id || (emp.status === 'active' && !activeEmployeeIds.has(emp.id))) : eligibleEmployees).map((emp) => <option key={emp.id} value={emp.id}>{emp.employee_number} — {emp.full_name}</option>)}</select></label> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:col-span-2"><strong>{selectedEmployeeIds.length} karyawan dipilih.</strong> Pengaturan unit, lokasi, dan tanggal di bawah akan diterapkan ke semua karyawan yang dipilih.</div>}
          <label className={LABEL}>Jenis unit<select value={draft.unit_type} onChange={(e) => setDraft((v) => ({ ...v, unit_type: e.target.value as UnitType }))} className={INPUT}><option value="office">Kantor</option><option value="warehouse">Gudang</option><option value="workshop">Workshop</option><option value="field">Lapangan</option><option value="other">Lainnya</option></select></label>
          <label className={LABEL}>Nama unit / tim<input required maxLength={120} value={draft.unit_name} onChange={(e) => setDraft((v) => ({ ...v, unit_name: e.target.value }))} placeholder="Contoh: Tim Bang Udin, Tim Kusen" className={INPUT}/></label>
          <label className={LABEL}>Lokasi basis (opsional)<input maxLength={180} value={draft.base_location} onChange={(e) => setDraft((v) => ({ ...v, base_location: e.target.value }))} placeholder="Contoh: PAUD Tunas, TK Mawar" className={INPUT}/></label>
          <label className={LABEL}>Tanggal mulai<input required type="date" value={draft.start_date} onChange={(e) => setDraft((v) => ({ ...v, start_date: e.target.value }))} className={INPUT}/></label>
          <label className={LABEL}>Tanggal selesai<input type="date" min={draft.start_date} value={draft.end_date} onChange={(e) => setDraft((v) => ({ ...v, end_date: e.target.value }))} className={INPUT}/></label>
          <label className={LABEL}>Status<select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value as MainPlacementStatus }))} className={INPUT}><option value="active">Aktif</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></label>
        </div><label className={LABEL}>Catatan<textarea rows={3} value={draft.notes} onChange={(e) => setDraft((v) => ({ ...v, notes: e.target.value }))} placeholder="Keterangan tambahan..." className={INPUT}/></label>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}{saving ? 'Menyimpan...' : 'Simpan Penempatan'}</button></div>
        </form></section></div>}
    </main>
  );
}

export default function MainPlacementPage() {
  return <RequireAuth permission="personnel.read"><MainPlacementContent/></RequireAuth>;
}
