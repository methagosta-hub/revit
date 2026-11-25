'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Info,
  KeyRound,
  Layers3,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type RoleScope = 'company' | 'project' | 'both';
type AppRole = {
  id: string;
  code: string;
  name: string;
  scope: RoleScope;
  description: string | null;
  is_system: boolean;
  created_at: string;
  permission_ids: string[];
  assigned_users_count: number;
  assignment_count: number;
};
type AppPermission = {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
};
type TabKey = 'roles' | 'matrix' | 'compare' | 'guide';
type WizardDraft = { name: string; description: string; scope: RoleScope; permissionIds: string[] };

type ApiResult = { roles: AppRole[]; permissions: AppPermission[] };

const MODULE_LABELS: Record<string, string> = {
  company: 'Perusahaan & Dashboard',
  project: 'Manajemen Proyek',
  planning: 'Perencanaan & RAB',
  execution: 'Pelaksanaan & Progres',
  procurement: 'Pengadaan & Purchasing',
  warehouse: 'Gudang & Persediaan',
  personnel: 'Personalia & Absensi',
  payroll: 'Pengupahan & Payroll',
  finance: 'Keuangan',
  reporting: 'Laporan & SPJ',
  external_reporting: 'Pelaporan Eksternal',
  administration: 'Administrasi & Kontrol',
};

const SCOPE_LABELS: Record<RoleScope, string> = {
  company: 'Perusahaan',
  project: 'Proyek tertentu',
  both: 'Perusahaan & proyek',
};

const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL = 'block text-xs font-semibold text-slate-600';
const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function scopeLabel(scope: RoleScope) {
  return SCOPE_LABELS[scope] ?? scope;
}

function shortCode(value: string) {
  return value.replaceAll('.', ' · ');
}

function moduleGroups(permissions: AppPermission[]) {
  const grouped = new Map<string, AppPermission[]>();
  for (const permission of permissions) {
    const key = permission.module || 'other';
    grouped.set(key, [...(grouped.get(key) ?? []), permission]);
  }
  return [...grouped.entries()].sort((a, b) =>
    (MODULE_LABELS[a[0]] ?? a[0]).localeCompare(MODULE_LABELS[b[0]] ?? b[0], 'id'),
  );
}

function StatusPill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'blue' | 'amber' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold', tones[tone])}>{children}</span>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup dialog"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </section>
    </div>
  );
}

function PermissionCheckbox({ permission, checked, disabled, onChange }: {
  permission: AppPermission;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition', checked ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50', disabled && 'cursor-not-allowed opacity-65')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-700" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{permission.name}</span>
        <span className="mt-0.5 block break-all font-mono text-[10px] text-slate-400">{permission.code}</span>
        {permission.description ? <span className="mt-1 block text-xs leading-relaxed text-slate-500">{permission.description}</span> : null}
      </span>
      {checked ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : null}
    </label>
  );
}

export default function RolePermissionPage() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('roles');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | RoleScope>('all');
  const [matrixDraft, setMatrixDraft] = useState<string[]>([]);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft>({ name: '', description: '', scope: 'project', permissionIds: [] });
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: '', description: '', scope: 'project' as RoleScope });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const groupedPermissions = useMemo(() => moduleGroups(permissions), [permissions]);
  const visibleRoles = useMemo(() => roles.filter((role) => {
    const matchesSearch = `${role.name} ${role.code} ${role.description ?? ''}`.toLowerCase().includes(roleSearch.toLowerCase());
    return matchesSearch && (scopeFilter === 'all' || role.scope === scopeFilter);
  }), [roles, roleSearch, scopeFilter]);
  const isCoreRole = selectedRole ? ['director', 'admin'].includes(selectedRole.code) : false;

  const getToken = useCallback(async () => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    const token = data.session?.access_token;
    if (!token) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
    return token;
  }, []);

  const apiRequest = useCallback(async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    const token = await getToken();
    const response = await fetch('/api/admin/roles', {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
    return payload;
  }, [getToken]);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const payload = await apiRequest('GET') as ApiResult;
      setRoles(payload.roles ?? []);
      setPermissions(payload.permissions ?? []);
      setSelectedRoleId((current) => current && payload.roles.some((role) => role.id === current)
        ? current
        : payload.roles[0]?.id ?? '');
      setCompareA((current) => current || payload.roles[0]?.id || '');
      setCompareB((current) => current || payload.roles[1]?.id || payload.roles[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Katalog role gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    setMatrixDraft(selectedRole?.permission_ids ?? []);
    setMatrixDirty(false);
    setPermissionSearch('');
  }, [selectedRoleId, selectedRole?.permission_ids]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4200);
  };

  const togglePermission = (id: string, checked: boolean, target: 'matrix' | 'wizard') => {
    const source = target === 'matrix' ? matrixDraft : wizardDraft.permissionIds;
    const next = checked ? [...new Set([...source, id])] : source.filter((item) => item !== id);
    if (target === 'matrix') {
      setMatrixDraft(next);
      setMatrixDirty(true);
    } else {
      setWizardDraft((current) => ({ ...current, permissionIds: next }));
    }
  };

  const toggleModule = (modulePermissions: AppPermission[], checked: boolean, target: 'matrix' | 'wizard') => {
    const ids = modulePermissions.map((permission) => permission.id);
    const source = target === 'matrix' ? matrixDraft : wizardDraft.permissionIds;
    const next = checked ? [...new Set([...source, ...ids])] : source.filter((id) => !ids.includes(id));
    if (target === 'matrix') { setMatrixDraft(next); setMatrixDirty(true); }
    else setWizardDraft((current) => ({ ...current, permissionIds: next }));
  };

  const saveMatrix = async () => {
    if (!selectedRole || isCoreRole) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('PATCH', { role_id: selectedRole.id, permission_ids: matrixDraft });
      await loadData(true);
      setMatrixDirty(false);
      notify(`Otoritas ${selectedRole.name} berhasil diperbarui.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Perubahan otoritas gagal disimpan.');
    } finally { setBusy(false); }
  };

  const createRole = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest('POST', {
        action: 'create',
        name: wizardDraft.name,
        description: wizardDraft.description,
        scope: wizardDraft.scope,
        permission_ids: wizardDraft.permissionIds,
      });
      await loadData(true);
      if (result.role?.id) setSelectedRoleId(result.role.id);
      setWizardOpen(false);
      setWizardStep(1);
      setWizardDraft({ name: '', description: '', scope: 'project', permissionIds: [] });
      setActiveTab('roles');
      notify('Role baru berhasil dibuat dan siap ditugaskan kepada pengguna.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Role gagal dibuat.');
    } finally { setBusy(false); }
  };

  const saveRoleInfo = async () => {
    if (!selectedRole) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('PATCH', { role_id: selectedRole.id, ...editDraft });
      await loadData(true);
      setEditOpen(false);
      notify('Informasi role berhasil diperbarui.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Informasi role gagal diperbarui.');
    } finally { setBusy(false); }
  };

  const deleteRole = async () => {
    if (!selectedRole) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('DELETE', { role_id: selectedRole.id });
      setDeleteOpen(false);
      await loadData(true);
      notify('Role kustom berhasil dihapus.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Role gagal dihapus.');
    } finally { setBusy(false); }
  };

  const openEdit = () => {
    if (!selectedRole) return;
    setEditDraft({ name: selectedRole.name, description: selectedRole.description ?? '', scope: selectedRole.scope });
    setEditOpen(true);
  };

  const filteredModuleGroups = groupedPermissions.map(([module, modulePermissions]) => [
    module,
    modulePermissions.filter((permission) => `${permission.name} ${permission.code} ${permission.description ?? ''}`.toLowerCase().includes(permissionSearch.toLowerCase())),
  ] as const).filter(([, modulePermissions]) => modulePermissions.length > 0);

  const stats = useMemo(() => ({
    total: roles.length,
    system: roles.filter((role) => role.is_system).length,
    custom: roles.filter((role) => !role.is_system).length,
    permissions: permissions.length,
    assignments: roles.reduce((sum, role) => sum + role.assignment_count, 0),
  }), [roles, permissions]);

  const compareRoleA = roles.find((role) => role.id === compareA);
  const compareRoleB = roles.find((role) => role.id === compareB);
  const compareIdsA = new Set(compareRoleA?.permission_ids ?? []);
  const compareIdsB = new Set(compareRoleB?.permission_ids ?? []);
  const differenceCount = permissions.filter((permission) => compareIdsA.has(permission.id) !== compareIdsB.has(permission.id)).length;

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Shield }> = [
    { key: 'roles', label: 'Daftar Peran', icon: Shield },
    { key: 'matrix', label: 'Matriks Otoritas', icon: KeyRound },
    { key: 'compare', label: 'Bandingkan Role', icon: Layers3 },
    { key: 'guide', label: 'Panduan Akses', icon: CircleHelp },
  ];

  return (
    <main className="min-h-screen bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span>Perusahaan</span><ChevronRight className="h-3.5 w-3.5"/><span className="text-emerald-700">Peran & Akses</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm"><ShieldCheck className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Pusat Role & Otoritas</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">Atur jabatan, hak akses, dan cakupan kewenangan pengguna JAVAWASTHU MANAGEMENT.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadData()} className={SECONDARY} disabled={loading}><RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} /> Segarkan data</button>
            <button type="button" onClick={() => { setWizardDraft({ name: '', description: '', scope: 'project', permissionIds: [] }); setWizardStep(1); setWizardOpen(true); }} className={PRIMARY}><Plus className="h-4 w-4" /> Buat role baru</button>
          </div>
        </div>

        {error ? <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/><div className="min-w-0 flex-1">{error}<p className="mt-1 text-xs text-rose-600">Pastikan Anda masuk sebagai Direktur atau Administrator, lalu periksa konfigurasi API server.</p></div><button type="button" onClick={() => setError('')} className="rounded p-1 hover:bg-rose-100"><X className="h-4 w-4"/></button></div> : null}
        {notice ? <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5"/>{notice}</div> : null}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: 'Total role', value: stats.total, note: 'Semua jabatan', icon: Shield, tone: 'slate' },
            { label: 'Role sistem', value: stats.system, note: 'Role bawaan', icon: LockKeyhole, tone: 'blue' },
            { label: 'Role kustom', value: stats.custom, note: 'Dibuat perusahaan', icon: Sparkles, tone: 'violet' },
            { label: 'Permission', value: stats.permissions, note: 'Jenis otoritas', icon: KeyRound, tone: 'emerald' },
            { label: 'Penugasan role', value: stats.assignments, note: 'Relasi pengguna-role', icon: Users, tone: 'amber' },
          ].map((item) => {
            const Icon = item.icon;
            return <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{item.label}</span><Icon className="h-4 w-4 text-slate-400"/></div><div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{loading ? '—' : item.value}</div><p className="mt-1 text-[11px] text-slate-400">{item.note}</p></div>;
          })}
        </section>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex min-w-max gap-1" role="tablist" aria-label="Navigasi pusat role dan otoritas">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={cx('inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition', activeTab === tab.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}><Icon className="h-4 w-4"/>{tab.label}</button>;
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-3 text-sm text-slate-500"><RefreshCw className="h-5 w-5 animate-spin"/>Memuat role dan katalog otoritas...</div></div>
        ) : (
          <>
            {activeTab === 'roles' ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)]">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Daftar Peran</h2><p className="mt-1 text-xs text-slate-500">Pilih role untuk melihat rincian kewenangannya.</p></div><StatusPill tone="blue">{visibleRoles.length} role</StatusPill></div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} placeholder="Cari nama atau kode role..." className={cx(INPUT, 'pl-9')}/></div>
                      <select aria-label="Filter scope role" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as 'all' | RoleScope)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none"><option value="all">Semua scope</option><option value="company">Perusahaan</option><option value="project">Proyek</option><option value="both">Keduanya</option></select>
                    </div>
                  </div>
                  <div className="max-h-[720px] space-y-1 overflow-y-auto p-2">
                    {visibleRoles.map((role) => {
                      const active = role.id === selectedRoleId;
                      return <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className={cx('w-full rounded-xl border p-3 text-left transition', active ? 'border-emerald-300 bg-emerald-50/70 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}>
                        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}><Shield className="h-4 w-4"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-800">{role.name}</span>{role.is_system ? <StatusPill tone="blue">Sistem</StatusPill> : <StatusPill tone="violet">Kustom</StatusPill>}</div><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{role.code}</p></div></div><ChevronRight className={cx('mt-1 h-4 w-4 shrink-0', active ? 'text-emerald-600' : 'text-slate-300')}/></div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 pl-12"><StatusPill>{scopeLabel(role.scope)}</StatusPill><span className="text-[11px] text-slate-400">{role.permission_ids.length} otoritas</span><span className="text-[11px] text-slate-400">{role.assigned_users_count} pengguna</span></div>
                      </button>;
                    })}
                    {!visibleRoles.length ? <div className="px-4 py-12 text-center text-sm text-slate-400">Tidak ada role yang cocok dengan pencarian.</div> : null}
                  </div>
                </section>

                <section className="space-y-4">
                  {selectedRole ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"><ShieldCheck className="h-6 w-6"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold text-slate-900">{selectedRole.name}</h2>{selectedRole.is_system ? <StatusPill tone="blue">Role sistem</StatusPill> : <StatusPill tone="violet">Role kustom</StatusPill>}</div><p className="mt-1 break-all font-mono text-xs text-slate-400">{selectedRole.code}</p><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{selectedRole.description || 'Belum ada deskripsi untuk role ini.'}</p></div></div>
                          <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => setActiveTab('matrix')} className={SECONDARY}><KeyRound className="h-4 w-4"/> Atur otoritas</button><button type="button" onClick={openEdit} disabled={isCoreRole} className={SECONDARY}><Settings2 className="h-4 w-4"/> Edit info</button></div>
                        </div>
                        {isCoreRole ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>Role inti Direktur dan Administrator dilindungi. Pengubahan nama, scope, serta permission inti dikunci untuk mencegah hilangnya akses pengendali sistem.</div> : null}
                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Scope</p><p className="mt-1 text-sm font-bold text-slate-800">{scopeLabel(selectedRole.scope)}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Otoritas</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-800">{selectedRole.permission_ids.length}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Pengguna</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-800">{selectedRole.assigned_users_count}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Penugasan</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-800">{selectedRole.assignment_count}</p></div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Ringkasan Otoritas</h3><p className="mt-1 text-xs text-slate-500">Hak yang terhubung ke role ini, dikelompokkan berdasarkan modul.</p></div><button type="button" onClick={() => setActiveTab('matrix')} className="text-xs font-bold text-emerald-700 hover:text-emerald-800">Lihat matriks <ArrowRight className="ml-1 inline h-3.5 w-3.5"/></button></div>
                        {selectedRole.permission_ids.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{groupedPermissions.map(([module, modulePermissions]) => {
                          const grants = modulePermissions.filter((permission) => selectedRole.permission_ids.includes(permission.id));
                          if (!grants.length) return null;
                          return <div key={module} className="rounded-xl border border-slate-100 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-700">{MODULE_LABELS[module] ?? module}</p><StatusPill tone="green">{grants.length}/{modulePermissions.length}</StatusPill></div><div className="space-y-2">{grants.map((permission) => <div key={permission.id} className="flex items-start gap-2 text-xs text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/><span>{permission.name}</span></div>)}</div></div>;
                        })}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">Role ini belum memiliki permission yang dipetakan.</div>}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-slate-400"/><div><p className="text-sm font-semibold text-slate-800">Penggunaan role</p><p className="mt-0.5 text-xs text-slate-500">{selectedRole.assigned_users_count} pengguna memiliki role ini dalam {selectedRole.assignment_count} penugasan.</p></div></div>{!selectedRole.is_system ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={selectedRole.assignment_count > 0} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/> Hapus role</button> : <StatusPill tone="blue">Role bawaan dilindungi</StatusPill>}</div>
                    </>
                  ) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Shield className="mx-auto h-10 w-10 text-slate-300"/><h2 className="mt-3 font-bold text-slate-800">Belum ada role</h2><p className="mt-1 text-sm text-slate-500">Buat role pertama untuk mulai menyusun kewenangan.</p></div>}
                </section>
              </div>
            ) : null}

            {activeTab === 'matrix' ? (
              <section className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                  <div><h2 className="font-bold text-slate-900">Matriks Otoritas per Role</h2><p className="mt-1 text-xs text-slate-500">Pilih role, lalu centang tindakan yang boleh dilakukan. Perubahan belum aktif sebelum disimpan.</p></div>
                  <div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Pilih role matriks" value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} className={cx(INPUT, 'mt-0 min-w-56')}><option value="">Pilih role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button type="button" onClick={saveMatrix} disabled={!selectedRole || isCoreRole || !matrixDirty || busy} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button></div>
                </div>
                {selectedRole ? <>
                  {isCoreRole ? <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>Permission Direktur dan Administrator dikunci. Keduanya merupakan role inti dengan akses pengendali sistem.</div> : null}
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-800">{selectedRole.name}</span><StatusPill>{scopeLabel(selectedRole.scope)}</StatusPill><StatusPill tone="green">{matrixDraft.length} dipilih</StatusPill>{matrixDirty ? <StatusPill tone="amber">Belum disimpan</StatusPill> : <StatusPill tone="slate">Tersimpan</StatusPill>}</div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Cari otoritas atau modul..." className={cx(INPUT, 'mt-0 pl-9')}/></div></div>
                  <div className="grid gap-4 2xl:grid-cols-2">{filteredModuleGroups.map(([module, modulePermissions]) => {
                    const count = modulePermissions.filter((permission) => matrixDraft.includes(permission.id)).length;
                    const allSelected = count === modulePermissions.length;
                    return <div key={module} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-800">{MODULE_LABELS[module] ?? module}</h3><p className="mt-0.5 text-[11px] text-slate-500">{count} dari {modulePermissions.length} otoritas aktif</p></div><button type="button" disabled={isCoreRole} onClick={() => toggleModule(modulePermissions, !allSelected, 'matrix')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{allSelected ? 'Lepas semua' : 'Pilih semua'}</button></div><div className="grid gap-2 p-3 sm:grid-cols-2">{modulePermissions.map((permission) => <PermissionCheckbox key={permission.id} permission={permission} checked={matrixDraft.includes(permission.id)} disabled={isCoreRole} onChange={(checked) => togglePermission(permission.id, checked, 'matrix')}/>)}</div></div>;
                  })}</div>
                  {filteredModuleGroups.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Tidak ada permission yang cocok.</div> : null}
                  <div className="sticky bottom-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">{matrixDirty ? 'Anda memiliki perubahan yang belum disimpan.' : 'Tidak ada perubahan tertunda.'}</p><div className="flex gap-2"><button type="button" disabled={!matrixDirty || busy} onClick={() => { setMatrixDraft(selectedRole.permission_ids); setMatrixDirty(false); }} className={SECONDARY}>Batalkan perubahan</button><button type="button" disabled={!matrixDirty || busy || isCoreRole} onClick={saveMatrix} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Simpan otoritas'}</button></div></div>
                </> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">Pilih role untuk menampilkan matriks otoritas.</div>}
              </section>
            ) : null}

            {activeTab === 'compare' ? (
              <section className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Bandingkan Dua Role</h2><p className="mt-1 text-xs text-slate-500">Lihat persamaan dan perbedaan hak akses untuk membantu menentukan batas tanggung jawab.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><label className={LABEL}>Role pertama<select value={compareA} onChange={(event) => setCompareA(event.target.value)} className={INPUT}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className={LABEL}>Role kedua<select value={compareB} onChange={(event) => setCompareB(event.target.value)} className={INPUT}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label></div><div className="mt-4 flex flex-wrap items-center gap-2"><StatusPill tone="green">{permissions.length - differenceCount} permission sama</StatusPill><StatusPill tone="amber">{differenceCount} permission berbeda</StatusPill></div></div>
                {compareRoleA && compareRoleB ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid grid-cols-[minmax(0,1fr)_110px_110px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 sm:grid-cols-[minmax(0,1fr)_160px_160px]"><span>Otoritas</span><span className="text-center">{compareRoleA.name}</span><span className="text-center">{compareRoleB.name}</span></div>{groupedPermissions.map(([module, modulePermissions]) => <div key={module}><div className="border-y border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{MODULE_LABELS[module] ?? module}</div>{modulePermissions.map((permission) => {
                  const hasA = compareIdsA.has(permission.id); const hasB = compareIdsB.has(permission.id); const same = hasA === hasB;
                  return <div key={permission.id} className={cx('grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-2 border-b border-slate-50 px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_160px_160px]', !same && 'bg-amber-50/40')}><div className="min-w-0"><p className="text-xs font-semibold text-slate-700">{permission.name}</p><p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{permission.code}</p></div><div className="flex justify-center">{hasA ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <X className="h-4 w-4 text-slate-300"/>}</div><div className="flex justify-center">{hasB ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <X className="h-4 w-4 text-slate-300"/>}</div></div>;
                })}</div>)}</div> : null}
              </section>
            ) : null}

            {activeTab === 'guide' ? (
              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-emerald-700"/><h2 className="font-bold text-slate-900">Memahami scope role</h2></div><div className="mt-4 space-y-3"><div className="rounded-xl border border-slate-100 p-3"><StatusPill tone="blue">Company</StatusPill><p className="mt-2 text-sm font-semibold text-slate-800">Seluruh perusahaan</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Hak akses berlaku di tingkat perusahaan dan tidak perlu dipilihkan proyek. Contoh: Finance, HR, Purchasing.</p></div><div className="rounded-xl border border-slate-100 p-3"><StatusPill tone="violet">Project</StatusPill><p className="mt-2 text-sm font-semibold text-slate-800">Proyek tertentu</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Role harus ditugaskan pada proyek tertentu ketika diberikan kepada pengguna. Contoh: Estimator, Pengawas, Mandor.</p></div><div className="rounded-xl border border-slate-100 p-3"><StatusPill tone="green">Both</StatusPill><p className="mt-2 text-sm font-semibold text-slate-800">Perusahaan dan proyek</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Bisa ditugaskan secara global atau pada proyek tertentu, sesuai tanggung jawab pengguna. Contoh: Manajer Proyek.</p></div></div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700"/><h2 className="font-bold text-slate-900">Prinsip keamanan dan pengelolaan</h2></div><div className="mt-4 space-y-3">{[
                  ['Hak akses mengikuti role', 'Pengguna menerima permission dari semua role yang ditugaskan kepadanya.'],
                  ['Scope membatasi jangkauan', 'Role proyek tidak otomatis memberikan akses ke proyek lain.'],
                  ['Role sistem dilindungi', 'Role bawaan tidak dapat dihapus. Direktur dan Administrator dikunci sebagai role inti.'],
                  ['Role yang digunakan tidak bisa dihapus', 'Pindahkan penugasan pengguna terlebih dahulu sebelum menghapus role kustom.'],
                  ['Perubahan akses dicatat', 'Setiap pembuatan, perubahan, dan penghapusan role dicatat ke audit log.'],
                ].map(([title, description]) => <div key={title} className="flex gap-3 rounded-xl bg-slate-50 p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700"><CheckCheck className="h-4 w-4"/></div><div><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p></div></div>)}</div></div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 xl:col-span-2"><div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><div><h3 className="text-sm font-bold text-amber-900">Penting: permission bukan satu-satunya lapisan keamanan</h3><p className="mt-1 text-xs leading-relaxed text-amber-800">Halaman ini mengatur hubungan role dan permission. Pembatasan data tetap harus ditegakkan oleh Row Level Security (RLS), pemeriksaan server/API, serta validasi pada fungsi database. Menyembunyikan menu saja tidak cukup untuk melindungi data.</p></div></div></div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {wizardOpen ? <Modal title="Buat Role Baru" subtitle="Ikuti tiga tahap berikut untuk menyusun jabatan dan kewenangannya." onClose={() => !busy && setWizardOpen(false)} wide>
        <div className="mb-6 grid grid-cols-3 gap-2">{['Identitas role', 'Pilih otoritas', 'Tinjau & simpan'].map((label, index) => <div key={label} className="space-y-2"><div className={cx('h-1.5 rounded-full', wizardStep >= index + 1 ? 'bg-emerald-600' : 'bg-slate-100')}/><p className={cx('text-[11px] font-semibold', wizardStep === index + 1 ? 'text-emerald-700' : 'text-slate-400')}>{index + 1}. {label}</p></div>)}</div>
        {wizardStep === 1 ? <div className="space-y-4"><div><label className={LABEL}>Nama role <span className="text-rose-500">*</span><input autoFocus value={wizardDraft.name} onChange={(event) => setWizardDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Koordinator Lapangan" className={INPUT}/></label></div><div><label className={LABEL}>Deskripsi tanggung jawab<textarea value={wizardDraft.description} onChange={(event) => setWizardDraft((current) => ({ ...current, description: event.target.value }))} rows={3} maxLength={500} placeholder="Jelaskan tugas utama dan batas kewenangan role ini..." className={INPUT}/></label><p className="mt-1 text-right text-[10px] text-slate-400">{wizardDraft.description.length}/500</p></div><div><label className={LABEL}>Cakupan role<select value={wizardDraft.scope} onChange={(event) => setWizardDraft((current) => ({ ...current, scope: event.target.value as RoleScope }))} className={INPUT}><option value="company">Perusahaan — berlaku lintas proyek</option><option value="project">Proyek — wajib ditugaskan ke proyek</option><option value="both">Perusahaan & proyek — fleksibel</option></select></label></div><div className="rounded-xl bg-blue-50 px-3 py-3 text-xs leading-relaxed text-blue-800"><Info className="mr-1 inline h-4 w-4"/>Scope menentukan lokasi penugasan role. Hak akses sebenarnya ditentukan pada tahap berikutnya.</div></div> : null}
        {wizardStep === 2 ? <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-800">Pilih hak akses</p><p className="mt-1 text-xs text-slate-500">Centang tindakan yang boleh dilakukan role ini.</p></div><StatusPill tone="green">{wizardDraft.permissionIds.length} dipilih</StatusPill></div><div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">{groupedPermissions.map(([module, modulePermissions]) => { const count = modulePermissions.filter((permission) => wizardDraft.permissionIds.includes(permission.id)).length; return <div key={module} className="rounded-xl border border-slate-200 p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">{MODULE_LABELS[module] ?? module}</p><p className="mt-0.5 text-[10px] text-slate-400">{count}/{modulePermissions.length} dipilih</p></div><button type="button" onClick={() => toggleModule(modulePermissions, count !== modulePermissions.length, 'wizard')} className="text-[11px] font-bold text-emerald-700">{count === modulePermissions.length ? 'Lepas semua' : 'Pilih semua'}</button></div><div className="grid gap-2 md:grid-cols-2">{modulePermissions.map((permission) => <PermissionCheckbox key={permission.id} permission={permission} checked={wizardDraft.permissionIds.includes(permission.id)} onChange={(checked) => togglePermission(permission.id, checked, 'wizard')}/>)}</div></div>; })}</div></div> : null}
        {wizardStep === 3 ? <div className="space-y-4"><div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-emerald-700"/><h3 className="font-bold text-emerald-900">Ringkasan role baru</h3></div><h4 className="mt-3 text-lg font-extrabold text-slate-900">{wizardDraft.name}</h4><p className="mt-1 text-xs text-slate-600">{wizardDraft.description || 'Tanpa deskripsi.'}</p><div className="mt-3 flex flex-wrap gap-2"><StatusPill tone="green">{scopeLabel(wizardDraft.scope)}</StatusPill><StatusPill tone="blue">{wizardDraft.permissionIds.length} permission</StatusPill><StatusPill tone="violet">Role kustom</StatusPill></div></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-700">Rincian hak akses</p><div className="mt-3 space-y-3">{groupedPermissions.map(([module, modulePermissions]) => { const selected = modulePermissions.filter((permission) => wizardDraft.permissionIds.includes(permission.id)); if (!selected.length) return null; return <div key={module}><p className="text-[11px] font-bold text-slate-500">{MODULE_LABELS[module] ?? module}</p><p className="mt-1 text-xs leading-relaxed text-slate-700">{selected.map((permission) => permission.name).join(' · ')}</p></div>; })}{wizardDraft.permissionIds.length === 0 ? <p className="text-xs text-slate-400">Role ini akan dibuat tanpa permission. Anda dapat menambahkannya nanti di Matriks Otoritas.</p> : null}</div></div><div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800"><Info className="mt-0.5 h-4 w-4 shrink-0"/>Role baru belum otomatis diberikan kepada siapa pun. Penugasan pengguna dilakukan pada halaman Manajemen Pengguna.</div></div> : null}
        <div className="mt-6 flex flex-col-reverse justify-between gap-2 border-t border-slate-100 pt-4 sm:flex-row">{wizardStep > 1 ? <button type="button" onClick={() => setWizardStep((step) => step - 1)} disabled={busy} className={SECONDARY}><ArrowLeft className="h-4 w-4"/> Kembali</button> : <button type="button" onClick={() => setWizardOpen(false)} disabled={busy} className={SECONDARY}>Batal</button>}{wizardStep < 3 ? <button type="button" onClick={() => setWizardStep((step) => step + 1)} disabled={!wizardDraft.name.trim()} className={PRIMARY}>Lanjutkan <ArrowRight className="h-4 w-4"/></button> : <button type="button" onClick={createRole} disabled={busy || !wizardDraft.name.trim()} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Buat role'}</button>}</div>
      </Modal> : null}

      {editOpen && selectedRole ? <Modal title="Edit Informasi Role" subtitle="Ubah identitas dan cakupan role. Perubahan scope hanya bisa dilakukan jika belum ada penugasan." onClose={() => !busy && setEditOpen(false)}>
        <div className="space-y-4"><label className={LABEL}>Nama role<input value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} className={INPUT}/></label><label className={LABEL}>Deskripsi<textarea rows={4} maxLength={500} value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} className={INPUT}/></label><label className={LABEL}>Scope<select value={editDraft.scope} onChange={(event) => setEditDraft((current) => ({ ...current, scope: event.target.value as RoleScope }))} disabled={selectedRole.assignment_count > 0} className={INPUT}><option value="company">Perusahaan</option><option value="project">Proyek tertentu</option><option value="both">Perusahaan & proyek</option></select></label>{selectedRole.assignment_count > 0 ? <p className="text-xs text-amber-700">Scope terkunci karena role sudah mempunyai penugasan pengguna.</p> : null}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className={SECONDARY}>Batal</button><button type="button" onClick={saveRoleInfo} disabled={busy || !editDraft.name.trim()} className={PRIMARY}><Save className="h-4 w-4"/>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button></div>
      </Modal> : null}

      {deleteOpen && selectedRole ? <Modal title="Hapus Role Kustom" subtitle="Tindakan ini menghapus role dan seluruh hubungan permission-nya." onClose={() => !busy && setDeleteOpen(false)}>
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><p className="text-sm font-bold text-rose-900">Anda akan menghapus {selectedRole.name}</p><p className="mt-1 text-xs leading-relaxed text-rose-800">Role ini tidak dapat dihapus jika masih dipakai oleh pengguna. Pastikan keputusan ini benar.</p></div></div><div className="mt-4 rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Kode role</p><p className="mt-1 break-all font-mono text-xs text-slate-800">{selectedRole.code}</p><p className="mt-3 text-xs text-slate-500">Pengguna yang ditugaskan</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedRole.assigned_users_count}</p></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteOpen(false)} className={SECONDARY}>Jangan hapus</button><button type="button" onClick={deleteRole} disabled={busy || selectedRole.assignment_count > 0} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"><Trash2 className="h-4 w-4"/>{busy ? 'Menghapus...' : 'Ya, hapus role'}</button></div>
      </Modal> : null}
    </main>
  );
}