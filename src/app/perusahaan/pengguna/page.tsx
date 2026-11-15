'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { supabase } from '@/lib/supabase';

type Role = {
  id: string;
  code: string;
  name: string;
  scope: 'company' | 'project' | 'both';
};

type ProjectOption = { id: string; title: string };
type UserAssignment = {
  id: string;
  role_id: string;
  project_id: string | null;
  role: Role | null;
  project_title: string | null;
};
type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  employee_code: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  assignments: UserAssignment[];
};
type DirectoryData = { users: ManagedUser[]; roles: Role[]; projects: ProjectOption[] };

async function adminRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');

  const response = await fetch('/api/admin/users', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
  return payload as T;
}

function RoleAssignmentFields({
  roles,
  projects,
  roleId,
  setRoleId,
  projectId,
  setProjectId,
}: {
  roles: Role[];
  projects: ProjectOption[];
  roleId: string;
  setRoleId: (value: string) => void;
  projectId: string;
  setProjectId: (value: string) => void;
}) {
  const selectedRole = roles.find((role) => role.id === roleId);
  const needsProject = selectedRole?.scope === 'project';
  const canSelectProject = selectedRole?.scope === 'project' || selectedRole?.scope === 'both';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Peran</span>
        <select required value={roleId} onChange={(event) => { setRoleId(event.target.value); setProjectId(''); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10">
          <option value="">Pilih peran</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {role.scope === 'company' ? 'Perusahaan' : role.scope === 'project' ? 'Proyek' : 'Perusahaan/Proyek'}</option>)}
        </select>
      </label>
      {canSelectProject ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Proyek {needsProject ? '(wajib)' : '(opsional)'}</span>
          <select required={needsProject} value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10">
            <option value="">{needsProject ? 'Pilih proyek' : 'Akses perusahaan'}</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function UserManagementContent() {
  const [directory, setDirectory] = useState<DirectoryData>({ users: [], roles: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [phone, setPhone] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [roleDrafts, setRoleDrafts] = useState<Record<string, { roleId: string; projectId: string }>>({});

  const loadDirectory = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await adminRequest<DirectoryData>('GET');
      setDirectory(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Direktori pengguna gagal dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return directory.users;
    return directory.users.filter((user) =>
      [user.full_name, user.email, user.employee_code ?? '', user.phone ?? '', ...user.assignments.map((item) => item.role?.name ?? '')]
        .some((value) => value.toLocaleLowerCase('id').includes(keyword)),
    );
  }, [directory.users, search]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const selectedRole = directory.roles.find((role) => role.id === newRoleId);
      if (!selectedRole) throw new Error('Pilih peran awal pengguna.');
      if (selectedRole.scope === 'project' && !newProjectId) throw new Error('Peran ini wajib ditugaskan pada proyek.');
      await adminRequest('POST', {
        full_name: fullName,
        email,
        password,
        employee_code: employeeCode,
        phone,
        role_assignments: [{ role_id: newRoleId, project_id: newProjectId || null }],
      });
      setFullName(''); setEmail(''); setPassword(''); setEmployeeCode(''); setPhone(''); setNewProjectId('');
      setSuccess(`Akun ${email} berhasil dibuat dan diberi peran ${selectedRole.name}.`);
      setEmail('');
      await loadDirectory(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Akun pengguna gagal dibuat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user: ManagedUser) {
    const nextState = !user.is_active;
    const actionText = nextState ? 'mengaktifkan' : 'menonaktifkan';
    if (!window.confirm(`Yakin ${actionText} akun ${user.full_name}?`)) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await adminRequest('PATCH', { action: 'update_profile', user_id: user.id, is_active: nextState });
      setSuccess(`Akun ${user.full_name} berhasil ${nextState ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await loadDirectory(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Status akun gagal diperbarui.');
    } finally { setSaving(false); }
  }

  async function handleAddRole(user: ManagedUser) {
    const draft = roleDrafts[user.id] ?? { roleId: '', projectId: '' };
    if (!draft.roleId) { setError('Pilih peran yang akan ditambahkan.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const role = directory.roles.find((item) => item.id === draft.roleId);
      if (role?.scope === 'project' && !draft.projectId) throw new Error('Peran ini wajib ditugaskan pada proyek.');
      await adminRequest('PATCH', { action: 'add_role', user_id: user.id, role_id: draft.roleId, project_id: draft.projectId || null });
      setSuccess(`Peran ${role?.name ?? ''} berhasil ditambahkan untuk ${user.full_name}.`);
      setRoleDrafts((current) => ({ ...current, [user.id]: { roleId: '', projectId: '' } }));
      await loadDirectory(true);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Peran gagal ditambahkan.');
    } finally { setSaving(false); }
  }

  async function handleRemoveRole(user: ManagedUser, assignment: UserAssignment) {
    if (!window.confirm(`Hapus peran ${assignment.role?.name ?? ''} dari ${user.full_name}?`)) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await adminRequest('PATCH', { action: 'remove_role', user_id: user.id, assignment_id: assignment.id });
      setSuccess('Penugasan peran berhasil dihapus.');
      await loadDirectory(true);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Peran gagal dihapus.');
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700"><ShieldCheck className="h-4 w-4" /> Administrasi Perusahaan</div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Manajemen Pengguna</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Buat akun personel, tetapkan peran, dan atur status akses perusahaan maupun proyek.</p>
          </div>
          <button type="button" onClick={() => void loadDirectory(true)} disabled={refreshing || loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
          </button>
        </header>

        {error ? <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
        {success ? <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div> : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-700" /><div><h2 className="font-bold text-slate-900">Buat akun pengguna baru</h2><p className="text-xs text-slate-500">Akun dibuat oleh administrator; pendaftaran mandiri tidak tersedia.</p></div></div>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Nama lengkap</span><input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500" placeholder="Nama personel" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Email akun</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500" placeholder="nama@perusahaan.com" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Kata sandi sementara</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500" placeholder="Minimal 8 karakter" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Kode karyawan (opsional)</span><input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500" placeholder="Contoh: JW-001" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Nomor telepon (opsional)</span><input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500" placeholder="08xxxxxxxxxx" /></label>
            <div className="md:col-span-2 xl:col-span-3"><RoleAssignmentFields roles={directory.roles} projects={directory.projects} roleId={newRoleId} setRoleId={setNewRoleId} projectId={newProjectId} setProjectId={setNewProjectId} /></div>
            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">Kata sandi sementara diberikan kepada pengguna melalui kanal yang aman. Jangan mengirimkan kata sandi melalui grup publik.</p>
              <button type="submit" disabled={saving || loading || !directory.roles.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Buat akun
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-2"><Users className="h-5 w-5 text-slate-500" /><div><h2 className="font-bold text-slate-900">Direktori pengguna</h2><p className="text-xs text-slate-500">{directory.users.length} akun terdaftar</p></div></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email atau peran..." className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 sm:max-w-xs" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat pengguna...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">Tidak ada pengguna yang cocok dengan pencarian.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredUsers.map((user) => {
                const expanded = expandedUserId === user.id;
                const draft = roleDrafts[user.id] ?? { roleId: '', projectId: '' };
                return (
                  <article key={user.id} className="p-4 sm:p-5">
                    <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{user.full_name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{user.is_active ? 'AKTIF' : 'NONAKTIF'}</span></div>
                        <p className="mt-1 break-all text-xs text-slate-500">{user.email || 'Email tidak tersedia'}{user.employee_code ? ` · ${user.employee_code}` : ''}{user.phone ? ` · ${user.phone}` : ''}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {user.assignments.map((assignment) => <span key={assignment.id} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">{assignment.role?.name ?? 'Peran' }{assignment.project_title ? ` · ${assignment.project_title}` : ' · Perusahaan'}</span>)}
                          {user.assignments.length === 0 ? <span className="text-xs text-amber-700">Belum memiliki peran</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setExpandedUserId(expanded ? null : user.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Kelola peran <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button type="button" disabled={saving} onClick={() => void handleToggleActive(user)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${user.is_active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                          {user.is_active ? <ShieldMinus className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                        <div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Penugasan peran</p><button type="button" onClick={() => setExpandedUserId(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Tutup"><X className="h-4 w-4" /></button></div>
                        {user.assignments.length ? <div className="mb-4 space-y-2">{user.assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="text-xs font-medium text-slate-700">{assignment.role?.name ?? 'Peran tidak tersedia'}{assignment.project_title ? ` · ${assignment.project_title}` : ' · Perusahaan'}</span><button type="button" disabled={saving} onClick={() => void handleRemoveRole(user, assignment)} className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50">Hapus peran</button></div>)}</div> : null}
                        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <RoleAssignmentFields roles={directory.roles} projects={directory.projects} roleId={draft.roleId} setRoleId={(value) => setRoleDrafts((current) => ({ ...current, [user.id]: { roleId: value, projectId: '' } }))} projectId={draft.projectId} setProjectId={(value) => setRoleDrafts((current) => ({ ...current, [user.id]: { ...draft, projectId: value } }))} />
                          <button type="button" disabled={saving} onClick={() => void handleAddRole(user)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Tambah peran</button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" /> Pengelolaan akun dilakukan melalui endpoint server yang memeriksa sesi dan peran Direktur/Administrator. Kunci service-role Supabase tidak dikirim ke browser.</p>
      </div>
    </main>
  );
}

export default function UserManagementPage() {
  return <RequireAuth permission="user.manage"><UserManagementContent /></RequireAuth>;
}
