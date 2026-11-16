'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Info,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { supabase } from '@/lib/supabase';

type RoleScope = 'company' | 'project' | 'both';
type Role = { id: string; code: string; name: string; scope: RoleScope; description?: string | null };
type Project = { id: string; title: string; status?: string | null };
type Assignment = {
  id: string;
  user_id: string;
  role_id: string;
  project_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  assigned_by_name?: string | null;
  revoked_by_name?: string | null;
  role: Role | null;
  project_title: string | null;
};
type ManagedUser = {
  id: string;
  employee_code: string | null;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  email: string;
  assignments: Assignment[];
};
type ApiData = { users: ManagedUser[]; roles: Role[]; projects: Project[]; server_date: string };
type AssignmentDraft = { role_id: string; project_id: string; valid_from: string; valid_until: string };

const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';
const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function cx(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }
function displayDate(value?: string | null) {
  if (!value) return 'Tanpa batas akhir';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function assignmentStatus(item: Assignment, today: string): { label: string; tone: string } {
  if (item.revoked_at) return { label: 'Dicabut', tone: 'bg-rose-50 text-rose-700' };
  if (item.valid_from > today) return { label: 'Terjadwal', tone: 'bg-blue-50 text-blue-700' };
  if (item.valid_until && item.valid_until < today) return { label: 'Kedaluwarsa', tone: 'bg-slate-100 text-slate-600' };
  return { label: 'Aktif', tone: 'bg-emerald-50 text-emerald-700' };
}
function isEffective(item: Assignment, today: string) {
  return !item.revoked_at && item.valid_from <= today && (!item.valid_until || item.valid_until >= today);
}
function blankAssignment(today: string): AssignmentDraft { return { role_id: '', project_id: '', valid_from: today, valid_until: '' }; }

function AssignmentFields({ value, onChange, roles, projects }: {
  value: AssignmentDraft;
  onChange: (patch: Partial<AssignmentDraft>) => void;
  roles: Role[];
  projects: Project[];
}) {
  const role = roles.find((item) => item.id === value.role_id);
  return <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-2">
    <label className={LABEL}>Role
      <select required value={value.role_id} onChange={(e) => onChange({ role_id: e.target.value, project_id: '' })} className={INPUT}>
        <option value="">Pilih role</option>
        {roles.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.scope}</option>)}
      </select>
    </label>
    <label className={LABEL}>Cakupan penugasan
      <select value={value.project_id} onChange={(e) => onChange({ project_id: e.target.value })}
        disabled={!role || role.scope === 'company'} required={!!role && role.scope === 'project'} className={INPUT}>
        {role?.scope === 'company' ? <option value="">Seluruh perusahaan</option> : null}
        {role?.scope === 'both' ? <option value="">Seluruh perusahaan (global)</option> : null}
        {role?.scope === 'project' ? <option value="">Pilih proyek</option> : null}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select>
      <span className="mt-1 block text-[10px] font-normal text-slate-500">
        {role?.scope === 'company' ? 'Role ini berlaku untuk seluruh perusahaan.' : role?.scope === 'project' ? 'Wajib pilih proyek. Akses tidak berlaku pada proyek lain.' : role?.scope === 'both' ? 'Pilih perusahaan untuk akses global atau proyek untuk akses terbatas.' : 'Pilih role terlebih dahulu.'}
      </span>
    </label>
    <label className={LABEL}>Tanggal mulai
      <input required type="date" value={value.valid_from} onChange={(e) => onChange({ valid_from: e.target.value })} className={INPUT}/>
    </label>
    <label className={LABEL}>Tanggal akhir <span className="font-normal text-slate-400">(opsional)</span>
      <input type="date" min={value.valid_from || undefined} value={value.valid_until} onChange={(e) => onChange({ valid_until: e.target.value })} className={INPUT}/>
    </label>
    {role && ['director', 'admin'].includes(role.code) ? <p className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">Role Direktur/Administrator hanya dapat diberikan secara global, berlaku segera, dan tanpa tanggal akhir untuk mencegah sistem kehilangan administrator.</p> : null}
  </div>;
}

function UserManagementContent() {
  const [data, setData] = useState<ApiData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newAssignments, setNewAssignments] = useState<AssignmentDraft[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AssignmentDraft>(blankAssignment(''));
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [editFrom, setEditFrom] = useState('');
  const [editUntil, setEditUntil] = useState('');
  const [revokeAssignment, setRevokeAssignment] = useState<Assignment | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmployeeCode, setProfileEmployeeCode] = useState('');

  const today = data?.server_date || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (sessionError || !token) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Permintaan gagal (${response.status}).`);
    return payload;
  }, []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const result = await request('/api/admin/users');
      const next = result as ApiData;
      setData(next);
      setSelectedId((current) => current && next.users.some((user) => user.id === current)
        ? current : next.users[0]?.id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat direktori pengguna.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const selectedUser = useMemo(() => data?.users.find((user) => user.id === selectedId) ?? null, [data, selectedId]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('id');
    return (data?.users ?? []).filter((user) => {
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? user.is_active : !user.is_active);
      const assignments = user.assignments.map((a) => `${a.role?.name ?? ''} ${a.project_title ?? 'perusahaan'}`).join(' ');
      const text = `${user.full_name} ${user.email} ${user.employee_code ?? ''} ${assignments}`.toLocaleLowerCase('id');
      return matchesStatus && (!q || text.includes(q));
    });
  }, [data, search, statusFilter]);

  const metrics = useMemo(() => {
    const users = data?.users ?? [];
    const assignments = users.flatMap((user) => user.assignments);
    return {
      users: users.length,
      activeUsers: users.filter((user) => user.is_active).length,
      activeAssignments: assignments.filter((item) => isEffective(item, today)).length,
      scheduled: assignments.filter((item) => !item.revoked_at && item.valid_from > today).length,
    };
  }, [data, today]);

  useEffect(() => {
    if (!selectedUser) return;
    setProfileName(selectedUser.full_name);
    setProfilePhone(selectedUser.phone ?? '');
    setProfileEmployeeCode(selectedUser.employee_code ?? '');
  }, [selectedUser]);

  function notifyError(message: string) { setError(message); setNotice(''); }
  function notifySuccess(message: string) { setNotice(message); setError(''); }

  function updateNewAssignment(index: number, patch: Partial<AssignmentDraft>) {
    setNewAssignments((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const assignments = newAssignments.map((row) => ({
        role_id: row.role_id,
        project_id: row.project_id || null,
        valid_from: row.valid_from || today,
        valid_until: row.valid_until || null,
      }));
      const result = await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newName, email: newEmail, password: newPassword,
          phone: newPhone, employee_code: newEmployeeCode,
          role_assignments: assignments,
        }),
      });
      setCreateOpen(false);
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewPhone(''); setNewEmployeeCode('');
      setNewAssignments([]);
      await load(true);
      setSelectedId(result.user_id);
      notifySuccess('Akun pengguna dan seluruh penugasan berhasil dibuat.');
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'Gagal membuat pengguna.');
    } finally { setBusy(false); }
  }

  function openCreate() {
    setNewName(''); setNewEmail(''); setNewPassword(''); setNewPhone(''); setNewEmployeeCode('');
    setNewAssignments([blankAssignment(today)]);
    setError(''); setNotice(''); setCreateOpen(true);
  }

  function openAddAssignment() {
    setAddDraft(blankAssignment(today)); setError(''); setNotice(''); setAddOpen(true);
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'add_role', user_id: selectedUser.id, role_id: addDraft.role_id,
          project_id: addDraft.project_id || null, valid_from: addDraft.valid_from || today,
          valid_until: addDraft.valid_until || null,
        }),
      });
      setAddOpen(false);
      await load(true);
      notifySuccess('Penugasan role berhasil ditambahkan.');
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'Penugasan gagal ditambahkan.');
    } finally { setBusy(false); }
  }

  function openEditDates(assignment: Assignment) {
    setEditAssignment(assignment);
    setEditFrom(assignment.valid_from);
    setEditUntil(assignment.valid_until ?? '');
    setError(''); setNotice('');
  }

  async function saveAssignmentDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !editAssignment || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_assignment', user_id: selectedUser.id,
          assignment_id: editAssignment.id, valid_from: editFrom, valid_until: editUntil || null }),
      });
      setEditAssignment(null);
      await load(true);
      notifySuccess('Masa berlaku penugasan berhasil diperbarui.');
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'Masa berlaku gagal diperbarui.');
    } finally { setBusy(false); }
  }

  function openRevoke(assignment: Assignment) {
    setRevokeAssignment(assignment); setRevokeReason(''); setError(''); setNotice('');
  }

  async function revokeSelectedAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !revokeAssignment || !revokeReason.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'revoke_role', user_id: selectedUser.id,
          assignment_id: revokeAssignment.id, reason: revokeReason.trim() }),
      });
      setRevokeAssignment(null);
      await load(true);
      notifySuccess('Akses berhasil dicabut. Riwayat penugasan tetap disimpan untuk audit.');
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'Akses gagal dicabut.');
    } finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_profile', user_id: selectedUser.id,
          full_name: profileName, phone: profilePhone, employee_code: profileEmployeeCode }),
      });
      await load(true);
      notifySuccess('Profil pengguna berhasil diperbarui.');
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'Profil gagal diperbarui.');
    } finally { setBusy(false); }
  }

  async function toggleUserActive() {
    if (!selectedUser || busy) return;
    const next = !selectedUser.is_active;
    const confirmed = window.confirm(next
      ? `Aktifkan kembali akun ${selectedUser.full_name}?`
      : `Nonaktifkan akun ${selectedUser.full_name}? Pengguna tidak dapat masuk sampai diaktifkan kembali.`);
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', { method: 'PATCH', body: JSON.stringify({
        action: 'update_profile', user_id: selectedUser.id, is_active: next,
      }) });
      await load(true);
      notifySuccess(next ? 'Akun berhasil diaktifkan.' : 'Akun berhasil dinonaktifkan.');
    } catch (e) { notifyError(e instanceof Error ? e.message : 'Status akun gagal diperbarui.'); }
    finally { setBusy(false); }
  }



  return <main className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700"><ShieldCheck className="h-4 w-4"/> Administrasi & Kontrol</div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Manajemen Pengguna</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Kelola akun, role, dan jangkauan kerja setiap pengguna. Satu pengguna dapat memperoleh beberapa penugasan role pada proyek berbeda dengan masa berlaku masing-masing.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={SECONDARY}><RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')}/> Segarkan</button>
        <button type="button" onClick={openCreate} className={PRIMARY}><Plus className="h-4 w-4"/> Tambah pengguna</button>
      </div>
    </header>

    {(error || notice) ? <div role="status" aria-live="polite" className={cx('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
      {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}
      <span className="min-w-0 flex-1">{error || notice}</span>
      <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup pesan"><X className="h-4 w-4"/></button>
    </div> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total pengguna" value={metrics.users} detail="Semua akun terdaftar" icon={<Users className="h-5 w-5 text-slate-500"/>}/>
      <Metric label="Akun aktif" value={metrics.activeUsers} detail="Dapat menggunakan sistem" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600"/>}/>
      <Metric label="Penugasan aktif" value={metrics.activeAssignments} detail="Role yang berlaku hari ini" icon={<Shield className="h-5 w-5 text-blue-600"/>}/>
      <Metric label="Penugasan terjadwal" value={metrics.scheduled} detail="Mulai pada tanggal mendatang" icon={<Info className="h-5 w-5 text-violet-600"/>}/>
    </section>

    {loading ? <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Memuat direktori pengguna...</div> : <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-bold text-slate-900">Direktori akun</h2>
          <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, email, role, proyek..." className={cx(INPUT, 'mt-0 pl-9')}/></div>
          <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['all', 'active', 'inactive'] as const).map((value) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={cx('flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition', statusFilter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{value === 'all' ? 'Semua' : value === 'active' ? 'Aktif' : 'Nonaktif'}</button>)}
          </div>
        </div>
        <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
          {filteredUsers.map((user) => {
            const activeCount = user.assignments.filter((item) => isEffective(item, today)).length;
            const isSelected = user.id === selectedId;
            return <button key={user.id} type="button" onClick={() => setSelectedId(user.id)} className={cx('w-full px-4 py-4 text-left transition hover:bg-slate-50', isSelected && 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200')}>
              <div className="flex items-start gap-3">
                <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold', user.is_active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400')}>{user.full_name.trim().slice(0, 1).toLocaleUpperCase('id')}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold text-slate-900">{user.full_name}</p><span className={cx('rounded-full px-2 py-1 text-[9px] font-bold', user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{user.is_active ? 'AKTIF' : 'NONAKTIF'}</span></div>
                  <p className="mt-1 truncate text-xs text-slate-500">{user.email || 'Email tidak tersedia'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{activeCount} akses aktif</span><span className="text-[10px] text-slate-400">{user.assignments.length} riwayat penugasan</span></div>
                </div>
                <ChevronRight className={cx('mt-2 h-4 w-4 shrink-0', isSelected ? 'text-emerald-600' : 'text-slate-300')}/>
              </div>
            </button>;
          })}
          {filteredUsers.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Tidak ada pengguna yang cocok dengan pencarian.</div> : null}
        </div>
      </section>

      {selectedUser ? <section className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-extrabold text-white">{selectedUser.full_name.trim().slice(0, 1).toLocaleUpperCase('id')}</div>
              <div className="min-w-0"><h2 className="truncate text-lg font-bold text-slate-900">{selectedUser.full_name}</h2><p className="truncate text-xs text-slate-500">{selectedUser.email}</p><p className="mt-1 text-[10px] text-slate-400">ID pengguna: {selectedUser.id}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleUserActive} disabled={busy} className={SECONDARY}>{selectedUser.is_active ? 'Nonaktifkan akun' : 'Aktifkan akun'}</button>
              <button type="button" onClick={openAddAssignment} disabled={!selectedUser.is_active} className={PRIMARY}><Plus className="h-4 w-4"/> Tambah penugasan</button>
            </div>
          </div>
          {!selectedUser.is_active ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Info className="mt-0.5 h-4 w-4 shrink-0"/> Akun ini sedang nonaktif. Seluruh akses ditolak sampai akun diaktifkan kembali, meskipun masih ada riwayat penugasan aktif.</div> : null}
          <form onSubmit={saveProfile} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className={LABEL}>Nama lengkap<input value={profileName} onChange={(e) => setProfileName(e.target.value)} className={INPUT}/></label>
            <label className={LABEL}>Nomor karyawan<input value={profileEmployeeCode} onChange={(e) => setProfileEmployeeCode(e.target.value)} className={INPUT}/></label>
            <label className={LABEL}>Nomor telepon<input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className={INPUT}/></label>
            <div className="flex items-end sm:col-span-2 xl:col-span-3"><button type="submit" disabled={busy || !profileName.trim()} className={SECONDARY}><Save className="h-4 w-4"/> Simpan profil</button></div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Penugasan role & cakupan proyek</h3><p className="mt-1 text-xs text-slate-500">Akses dihitung dari role, proyek, tanggal berlaku, status pencabutan, dan status akun.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">{selectedUser.assignments.length} riwayat</span></div>
          {selectedUser.assignments.length ? <div className="divide-y divide-slate-100">
            {selectedUser.assignments.map((assignment) => {
              const status = assignmentStatus(assignment, today);
              const lockedCore = ['director', 'admin'].includes(assignment.role?.code ?? '')
                && assignment.project_id === null && isEffective(assignment, today);
              return <div key={assignment.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{assignment.role?.name ?? 'Role tidak ditemukan'}</p><span className={cx('rounded-full px-2.5 py-1 text-[10px] font-bold', status.tone)}>{status.label}</span>{assignment.role?.scope ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{assignment.role.scope}</span> : null}</div>
                    <p className="mt-1 text-xs font-medium text-slate-600">{assignment.project_title ?? (assignment.project_id ? 'Proyek tidak ditemukan' : 'Seluruh perusahaan')}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500"><span>Mulai: <strong className="text-slate-700">{displayDate(assignment.valid_from)}</strong></span><span>Akhir: <strong className="text-slate-700">{displayDate(assignment.valid_until)}</strong></span><span>Diberikan: <strong className="text-slate-700">{displayDate(assignment.assigned_at)}</strong>{assignment.assigned_by_name ? <span> · {assignment.assigned_by_name}</span> : null}</span></div>
                    {assignment.revoked_at ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-800"><strong>Dicabut {new Date(assignment.revoked_at).toLocaleString('id-ID')}</strong><br/>Alasan: {assignment.revocation_reason || 'Tidak dicatat'}{assignment.revoked_by_name ? <span className="block mt-1 text-[10px] text-rose-700">Dicabut oleh: {assignment.revoked_by_name}</span> : null}</div> : null}
                  </div>
                  {!assignment.revoked_at ? <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => openEditDates(assignment)} disabled={lockedCore} className={cx(SECONDARY, 'px-3 py-2 text-xs')}>Ubah masa berlaku</button>
                    <button type="button" onClick={() => openRevoke(assignment)} disabled={lockedCore || busy} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Cabut akses</button>
                  </div> : null}
                  {lockedCore && !assignment.revoked_at ? <p className="text-[10px] text-amber-700">Role inti dilindungi.</p> : null}
                </div>
              </div>;
            })}
          </div> : <div className="p-10 text-center text-sm text-slate-400">Pengguna ini belum memiliki penugasan role.</div>}
          <div className="border-t border-slate-100 bg-slate-50/70 p-4 text-[11px] leading-5 text-slate-500"><strong className="text-slate-700">Aturan akses:</strong> penugasan proyek hanya berlaku pada proyek yang dipilih. Tanggal akhir bersifat inklusif. Mencabut akses tidak menghapus riwayat penugasan. Akun nonaktif tidak dapat menggunakan akses apa pun.</div>
        </div>
      </section> : <section className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Pilih pengguna dari direktori untuk melihat profil dan penugasannya.</section>}
    </div>}

    {createOpen ? <Modal title="Tambah pengguna" subtitle="Buat akun dan atur satu atau beberapa role beserta proyek dan masa berlakunya." onClose={() => !busy && setCreateOpen(false)} wide>
      <form onSubmit={createUser} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>Nama lengkap *<input required value={newName} onChange={(e) => setNewName(e.target.value)} className={INPUT}/></label>
          <label className={LABEL}>Email login *<input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={INPUT}/></label>
          <label className={LABEL}>Kata sandi sementara *<input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT}/></label>
          <label className={LABEL}>Nomor karyawan<input value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} className={INPUT}/></label>
          <label className={LABEL}>Nomor telepon<input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={INPUT}/></label>
        </div>
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">Susun penugasan awal</h3><p className="mt-1 text-xs text-slate-500">Tambahkan beberapa role untuk beberapa proyek, atau satu role global perusahaan.</p></div><button type="button" onClick={() => setNewAssignments((rows) => [...rows, blankAssignment(today)])} className={SECONDARY}><Plus className="h-4 w-4"/> Tambah baris</button></div>
          {newAssignments.map((row, index) => <div key={index} className="relative"><AssignmentFields value={row} onChange={(patch) => updateNewAssignment(index, patch)} roles={data?.roles ?? []} projects={data?.projects ?? []}/>{newAssignments.length > 1 ? <button type="button" onClick={() => setNewAssignments((rows) => rows.filter((_, i) => i !== index))} className="mt-2 text-[11px] font-semibold text-rose-700">Hapus baris penugasan</button> : null}</div>)}
          {!newAssignments.length ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">Belum ada penugasan. Tambahkan minimal satu role.</div> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateOpen(false)} disabled={busy} className={SECONDARY}>Batal</button><button type="submit" disabled={busy || !newAssignments.length} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Membuat akun...' : 'Buat akun & penugasan'}</button></div>
      </form>
    </Modal> : null}

    {addOpen && selectedUser ? <Modal title="Tambah penugasan role" subtitle={`Tambahkan akses baru untuk ${selectedUser.full_name}. Penugasan sebelumnya tidak akan diubah.`} onClose={() => !busy && setAddOpen(false)}>
      <form onSubmit={addAssignment} className="space-y-4"><AssignmentFields value={addDraft} onChange={(patch) => setAddDraft((old) => ({ ...old, ...patch }))} roles={data?.roles ?? []} projects={data?.projects ?? []}/><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setAddOpen(false)} className={SECONDARY}>Batal</button><button type="submit" disabled={busy || !addDraft.role_id} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Simpan penugasan'}</button></div></form>
    </Modal> : null}

    {editAssignment ? <Modal title="Ubah masa berlaku" subtitle="Perubahan ini berlaku untuk penugasan terpilih dan akan dicatat pada audit log." onClose={() => !busy && setEditAssignment(null)}>
      <form onSubmit={saveAssignmentDates} className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-xs"><strong>{editAssignment.role?.name}</strong><p className="mt-1 text-slate-500">{editAssignment.project_title ?? 'Seluruh perusahaan'}</p></div><label className={LABEL}>Tanggal mulai<input required type="date" value={editFrom} onChange={(e) => setEditFrom(e.target.value)} className={INPUT}/></label><label className={LABEL}>Tanggal akhir <span className="font-normal text-slate-400">(kosong = tanpa batas)</span><input type="date" min={editFrom || undefined} value={editUntil} onChange={(e) => setEditUntil(e.target.value)} className={INPUT}/></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setEditAssignment(null)} className={SECONDARY}>Batal</button><button type="submit" disabled={busy} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Simpan masa berlaku'}</button></div></form>
    </Modal> : null}

    {revokeAssignment ? <Modal title="Cabut akses pengguna" subtitle="Penugasan tidak dihapus. Sistem menyimpan waktu, pelaku, dan alasan pencabutan untuk audit." onClose={() => !busy && setRevokeAssignment(null)}>
      <form onSubmit={revokeSelectedAssignment} className="space-y-4"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><strong>{revokeAssignment.role?.name}</strong><p className="mt-1">{revokeAssignment.project_title ?? 'Seluruh perusahaan'}</p></div><label className={LABEL}>Alasan pencabutan *<textarea required minLength={5} maxLength={500} rows={4} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Contoh: Penugasan proyek telah selesai atau personel dipindahkan." className={INPUT}/></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setRevokeAssignment(null)} className={SECONDARY}>Batal</button><button type="submit" disabled={busy || revokeReason.trim().length < 5} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">{busy ? 'Mencabut...' : 'Konfirmasi pencabutan'}</button></div></form>
    </Modal> : null}
  </main>;
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{icon}</div><p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl', wide ? 'max-w-4xl' : 'max-w-xl')}><header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}</div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5"/></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div></section></div>;
}

export default function UserManagementPage() {
  return <RequireAuth permission="user.manage"><UserManagementContent /></RequireAuth>;
}