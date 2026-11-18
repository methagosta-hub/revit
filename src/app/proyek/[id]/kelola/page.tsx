'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Loader2,
  RefreshCw,
  Plus,
  Building2,
  GraduationCap,
  Users,
  MapPin,
  ClipboardList,
  FileText,
  Percent,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ListOrdered,
  History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';

type ProjectStatus = 'DRAFT' | 'REVIEW' | 'FINAL RAB' | 'DIKERJAKAN' | 'SELESAI';

type ProjectForm = {
  title: string;
  client: string;
  location: string;
  kabupaten_kota: string;
  status: ProjectStatus;
  project_category: 'REGULER' | 'PORTOFOLIO';
  school_npsn: string;
  principal_name: string;
  principal_nip: string;
  p2sp_chair_name: string;
  planning_consultant: string;
  planning_consultant_skk: string;
  supervisory_consultant: string;
  supervisory_consultant_skk: string;
  tax_rate: string;
  profit_margin: string;
};

type ProjectStatusHistoryRow = { id: string; old_status: string | null; new_status: ProjectStatus; reason: string | null; changed_by: string | null; changed_at: string };

type DivisionFormRow = {
  id?: string;
  code: string;
  name: string;
  sort_order: number;
  item_count: number;
  total_value: number;
};

type ProjectRow = ProjectForm & {
  id: string;
  total_value: number | string | null;
  created_at?: string;
  updated_at?: string;
};

const inputClass = 'mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const labelClass = 'text-sm font-semibold text-slate-700';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Terjadi kesalahan yang tidak diketahui.';
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 255,
  type = 'text',
  inputMode,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        type={type}
        inputMode={inputMode}
        required={required}
      />
    </label>
  );
}

export default function DetailEditProyekPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;

  const [form, setForm] = useState<ProjectForm>({
    title: '', client: '', location: '', kabupaten_kota: '', status: 'DRAFT', project_category: 'REGULER', school_npsn: '',
    principal_name: '', principal_nip: '', p2sp_chair_name: '', planning_consultant: '',
    planning_consultant_skk: '', supervisory_consultant: '', supervisory_consultant_skk: '',
    tax_rate: '11', profit_margin: '10',
  });
  const [divisions, setDivisions] = useState<DivisionFormRow[]>([]);
  const [projectTotal, setProjectTotal] = useState(0);
  const [createdAt, setCreatedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [nextStatus, setNextStatus] = useState<ProjectStatus>('DRAFT');
  const [statusReason, setStatusReason] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusHistory, setStatusHistory] = useState<ProjectStatusHistoryRow[]>([]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [projectResult, divisionResult, historyResult] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('rab_divisions')
          .select('id, project_id, code, name, sort_order, items:rab_items(id, total_price)')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true }),
        supabase.from('project_status_history')
          .select('id, old_status, new_status, reason, changed_by, changed_at')
          .eq('project_id', projectId)
          .order('changed_at', { ascending: false })
          .limit(20),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (divisionResult.error) throw divisionResult.error;
      if (historyResult.error && !['42501', '42P01', 'PGRST205'].includes(historyResult.error.code ?? '')) throw historyResult.error;
      setStatusHistory((historyResult.data ?? []) as ProjectStatusHistoryRow[]);

      const project = projectResult.data as ProjectRow;
      setForm({
        title: project.title ?? '',
        client: project.client ?? '',
        location: project.location ?? '',
        kabupaten_kota: project.kabupaten_kota ?? '',
        status: (project.status ?? 'DRAFT') as ProjectStatus,
        project_category: project.project_category === 'PORTOFOLIO' ? 'PORTOFOLIO' : 'REGULER',
        school_npsn: project.school_npsn ?? '',
        principal_name: project.principal_name ?? '',
        principal_nip: project.principal_nip ?? '',
        p2sp_chair_name: project.p2sp_chair_name ?? '',
        planning_consultant: project.planning_consultant ?? '',
        planning_consultant_skk: project.planning_consultant_skk ?? '',
        supervisory_consultant: project.supervisory_consultant ?? '',
        supervisory_consultant_skk: project.supervisory_consultant_skk ?? '',
        tax_rate: String(project.tax_rate ?? 11),
        profit_margin: String(project.profit_margin ?? 10),
      });
      setNextStatus((project.status ?? 'DRAFT') as ProjectStatus);
      setProjectTotal(Number(project.total_value ?? 0));
      setCreatedAt(project.created_at ?? '');
      setUpdatedAt(project.updated_at ?? '');
      setDivisions((divisionResult.data ?? []).map((row: any) => ({
        id: row.id,
        code: row.code ?? '',
        name: row.name ?? '',
        sort_order: Number(row.sort_order ?? 0),
        item_count: Array.isArray(row.items) ? row.items.length : 0,
        total_value: (row.items ?? []).reduce((sum: number, item: any) => sum + Number(item.total_price ?? 0), 0),
      })));
    } catch (error) {
      console.error('Gagal memuat detail pengelolaan proyek:', error);
      setLoadError(`Gagal memuat data proyek: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const divisionTotal = useMemo(
    () => divisions.reduce((sum, division) => sum + division.total_value, 0),
    [divisions],
  );

  function updateProject<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccess('');
  }

  function updateDivision(index: number, key: 'code' | 'name' | 'sort_order', value: string) {
    setDivisions((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, [key]: key === 'sort_order' ? Number(value) : value }
      : row));
    setSuccess('');
  }

  function addDivision() {
    const nextOrder = divisions.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1;
    setDivisions((current) => [...current, {
      code: `LOK-${String(nextOrder).padStart(2, '0')}`,
      name: '',
      sort_order: nextOrder,
      item_count: 0,
      total_value: 0,
    }]);
  }

  async function handleStatusTransition() {
    if (!projectId || changingStatus || nextStatus === form.status) return;
    setChangingStatus(true);
    setSaveError('');
    setSuccess('');
    try {
      const { error } = await supabase.rpc('transition_project_status', {
        p_project_id: projectId,
        p_new_status: nextStatus,
        p_reason: statusReason.trim() || null,
      });
      if (error) throw error;
      await loadData();
      setStatusReason('');
      setSuccess(`Status proyek berhasil diubah menjadi ${nextStatus}.`);
      router.refresh();
    } catch (error) {
      console.error('Gagal mengubah status proyek:', error);
      setSaveError(`Status proyek belum berubah: ${getErrorMessage(error)}`);
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    setSuccess('');

    const npsn = form.school_npsn.trim();
    if (npsn && !/^\d{8}$/.test(npsn)) {
      setSaveError('NPSN harus terdiri dari tepat 8 digit angka.');
      return;
    }
    const taxRate = Number(form.tax_rate);
    const profitMargin = Number(form.profit_margin);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setSaveError('Persentase pajak harus berada di antara 0 sampai 100.');
      return;
    }
    if (!Number.isFinite(profitMargin) || profitMargin < 0 || profitMargin > 100) {
      setSaveError('Margin keuntungan harus berada di antara 0 sampai 100.');
      return;
    }
    if (!form.title.trim() || !form.client.trim() || !form.location.trim()) {
      setSaveError('Nama proyek, nama sekolah/instansi, dan lokasi proyek wajib diisi.');
      return;
    }
    const seenCodes = new Set<string>();
    for (const division of divisions) {
      const code = division.code.trim().toLocaleLowerCase('id');
      if (!code || !division.name.trim()) {
        setSaveError('Setiap lokasi pekerjaan harus memiliki kode dan nama.');
        return;
      }
      if (seenCodes.has(code)) {
        setSaveError(`Kode lokasi "${division.code}" digunakan lebih dari satu kali dalam proyek ini.`);
        return;
      }
      seenCodes.add(code);
      if (!Number.isInteger(division.sort_order) || division.sort_order < 0) {
        setSaveError(`Urutan lokasi "${division.name}" harus berupa bilangan bulat nol atau lebih.`);
        return;
      }
    }

    setSaving(true);
    try {
      const projectPayload = {
        title: form.title.trim(),
        client: form.client.trim(),
        location: form.location.trim(),
        kabupaten_kota: form.kabupaten_kota.trim() || null,
        status: form.status,
        school_npsn: npsn || null,
        principal_name: form.principal_name.trim() || null,
        principal_nip: form.principal_nip.trim() || null,
        p2sp_chair_name: form.p2sp_chair_name.trim() || null,
        planning_consultant: form.planning_consultant.trim() || null,
        planning_consultant_skk: form.planning_consultant_skk.trim() || null,
        supervisory_consultant: form.supervisory_consultant.trim() || null,
        supervisory_consultant_skk: form.supervisory_consultant_skk.trim() || null,
        tax_rate: taxRate,
        profit_margin: profitMargin,
      };
      const divisionPayload = divisions.map((row, index) => ({
        ...(row.id ? { id: row.id } : {}),
        code: row.code.trim(),
        name: row.name.trim(),
        sort_order: row.sort_order ?? index + 1,
      }));

      const { error } = await supabase.rpc('save_project_management', {
        p_project_id: projectId,
        p_project: projectPayload,
        p_divisions: divisionPayload,
      });
      if (error) throw error;

      await loadData();
      setSuccess('Identitas proyek dan daftar lokasi pekerjaan berhasil disimpan.');
      router.refresh();
    } catch (error) {
      console.error('Gagal menyimpan pengelolaan proyek:', error);
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('save_project_management') || message.toLowerCase().includes('function')) {
        setSaveError(`Fungsi penyimpanan belum tersedia. Jalankan SQL migrasi save_project_management terlebih dahulu. Detail: ${message}`);
      } else {
        setSaveError(`Perubahan belum berhasil disimpan: ${message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-[65vh] items-center justify-center p-6"><div className="text-center"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-600" /><p className="text-sm text-slate-500">Memuat detail proyek...</p></div></main>;
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6 py-14">
        <Link href="/proyek/daftar" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" />Kembali ke Daftar Proyek</Link>
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{loadError}</div>
        <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4" />Coba lagi</button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/proyek/daftar" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" />Kembali ke Daftar Proyek</Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700"><Building2 className="h-4 w-4" />Manajemen Proyek</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Detail & Edit Proyek</h1>
          <p className="mt-1 text-sm text-slate-500">Ubah identitas proyek, data sekolah, tim penanggung jawab, dan daftar lokasi RAB.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Muat Ulang</button>
          <Link href={`/proyek/${projectId}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"><ExternalLink className="h-4 w-4" />Buka Workspace RAB</Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Total Nilai RAB</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatRupiah(projectTotal || divisionTotal)}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Jumlah Lokasi Pekerjaan</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{divisions.length} lokasi</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Status Proyek</p><p className="mt-1 text-xl font-bold text-slate-900">{form.status}</p><p className="mt-1 text-xs text-slate-500">Perubahan status dicatat di riwayat proyek.</p></article>
      </section>

      {(saveError || success) && (
        <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${saveError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {saveError ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{saveError || success}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="font-bold text-slate-900">Alur Status Proyek</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Status hanya dapat diubah melalui perpindahan yang sah dan tercatat di riwayat proyek.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className={labelClass}>Status berikutnya</span>
              <select className={inputClass} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ProjectStatus)}>
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="FINAL RAB">FINAL RAB</option>
                <option value="DIKERJAKAN">DIKERJAKAN</option>
                <option value="SELESAI">SELESAI</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Alasan / catatan perubahan (opsional)</span>
              <input className={inputClass} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Contoh: RAB telah disetujui pemilik proyek" maxLength={500} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Saat status menjadi DIKERJAKAN, proyek mulai tersedia untuk transaksi dan aktivitas pelaksanaan sesuai hak akses.</p>
            <button type="button" onClick={() => void handleStatusTransition()} disabled={changingStatus || nextStatus === form.status} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              {changingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {changingStatus ? 'Mengubah status...' : 'Simpan Perubahan Status'}
            </button>
          </div>
          <div className="mt-5 border-t border-emerald-100 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">Riwayat Perubahan Status</h3>
            </div>
            {statusHistory.length ? (
              <ol className="space-y-3">
                {statusHistory.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-xs">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-slate-800">{entry.old_status || 'PROYEK BARU'} → {entry.new_status}</strong>
                        <span className="text-slate-400">{formatDate(entry.changed_at)}</span>
                      </div>
                      {entry.reason ? <p className="mt-1 text-slate-600">{entry.reason}</p> : null}
                      {entry.changed_by ? <p className="mt-1 text-[10px] text-slate-400">Aktor: {entry.changed_by}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500">Belum ada riwayat perpindahan status, atau riwayat tidak dapat dibaca oleh akun ini.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileText className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-slate-900">Identitas Proyek</h2><p className="mt-1 text-xs text-slate-500">Informasi utama dokumen RAB dan pemilik pekerjaan.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Nama Proyek" value={form.title} onChange={(value) => updateProject('title', value)} placeholder="Nama pekerjaan / proyek" required /></div>
            <Field label="Nama Sekolah / Instansi (Client)" value={form.client} onChange={(value) => updateProject('client', value)} placeholder="Nama sekolah atau instansi" required />
            <Field label="Lokasi Proyek" value={form.location} onChange={(value) => updateProject('location', value)} placeholder="Alamat / kecamatan / wilayah proyek" required />
            <Field label="Kabupaten / Kota (untuk tanda tangan PDF)" value={form.kabupaten_kota} onChange={(value) => updateProject('kabupaten_kota', value)} placeholder="Contoh: Kabupaten Ciamis" maxLength={150} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Kategori Proyek</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{form.project_category}</p>
              <p className="mt-2 text-xs text-slate-500">Kategori ditetapkan ketika proyek dibuat untuk menjaga pemisahan data REGULER dan PORTOFOLIO.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><GraduationCap className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-slate-900">Data Sekolah & Penanggung Jawab</h2><p className="mt-1 text-xs text-slate-500">Seluruh kolom sesuai struktur tabel projects.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="NPSN Sekolah" value={form.school_npsn} onChange={(value) => updateProject('school_npsn', value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digit angka" maxLength={8} inputMode="numeric" />
            <Field label="Nama Kepala Sekolah" value={form.principal_name} onChange={(value) => updateProject('principal_name', value)} placeholder="Nama lengkap kepala sekolah" />
            <Field label="No. NIP Kepala Sekolah" value={form.principal_nip} onChange={(value) => updateProject('principal_nip', value)} placeholder="Nomor NIP / identitas" maxLength={30} />
            <Field label="Ketua Panitia Pembangunan (P2SP)" value={form.p2sp_chair_name} onChange={(value) => updateProject('p2sp_chair_name', value)} placeholder="Nama ketua P2SP" />
            <Field label="Konsultan Perencana" value={form.planning_consultant} onChange={(value) => updateProject('planning_consultant', value)} placeholder="Nama konsultan perencana" />
            <Field label="No. SKK Perencana" value={form.planning_consultant_skk} onChange={(value) => updateProject('planning_consultant_skk', value)} placeholder="Nomor sertifikat kompetensi kerja" maxLength={100} />
            <Field label="Konsultan Pengawas" value={form.supervisory_consultant} onChange={(value) => updateProject('supervisory_consultant', value)} placeholder="Nama konsultan pengawas" />
            <Field label="No. SKK Pengawas" value={form.supervisory_consultant_skk} onChange={(value) => updateProject('supervisory_consultant_skk', value)} placeholder="Nomor sertifikat kompetensi kerja" maxLength={100} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Percent className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-slate-900">Parameter Anggaran</h2><p className="mt-1 text-xs text-slate-500">Pengaturan pajak dan margin proyek.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pajak (%)" value={form.tax_rate} onChange={(value) => updateProject('tax_rate', value)} type="number" inputMode="decimal" />
            <Field label="Margin Keuntungan (%)" value={form.profit_margin} onChange={(value) => updateProject('profit_margin', value)} type="number" inputMode="decimal" />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ListOrdered className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Lokasi Pekerjaan / RAB Divisions</h2><p className="mt-1 text-xs text-slate-500">Edit kode, nama, dan urutan setiap lokasi pekerjaan. Data item RAB yang sudah ada tetap dipertahankan.</p></div></div>
            <button type="button" onClick={addDivision} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"><Plus className="h-4 w-4" />Tambah Lokasi</button>
          </div>
          <div className="space-y-3 p-4 sm:p-6">
            {divisions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center"><ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300" /><p className="font-semibold text-slate-700">Belum ada lokasi pekerjaan</p><p className="mt-1 text-xs text-slate-500">Tambahkan lokasi seperti Ruang Kelas, Toilet, Lapangan, atau Laboratorium.</p></div>
            ) : divisions.map((division, index) => (
              <article key={division.id ?? `new-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Lokasi {index + 1}{division.id ? ' · Tersimpan' : ' · Baru'}</p><span className="text-xs text-slate-500">{division.item_count} item RAB · {formatRupiah(division.total_value)}</span></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(120px,0.7fr)_minmax(200px,2fr)_110px]">
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Kode Lokasi</span><input className={inputClass} maxLength={20} value={division.code} onChange={(event) => updateDivision(index, 'code', event.target.value)} placeholder="LOK-01" /></label>
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Nama Lokasi / Divisi</span><input className={inputClass} maxLength={255} value={division.name} onChange={(event) => updateDivision(index, 'name', event.target.value)} placeholder="Contoh: Ruang Kelas Baru" /></label>
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Urutan</span><input className={inputClass} type="number" min="0" step="1" value={division.sort_order} onChange={(event) => updateDivision(index, 'sort_order', event.target.value)} /></label>
                </div>
                {division.id && <p className="mt-2 text-[11px] text-slate-400">Lokasi ini sudah memiliki ID database. Pengubahan nama atau kode tidak mengubah item RAB yang tersimpan di dalamnya.</p>}
              </article>
            ))}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-xs text-slate-500 sm:px-6">Tidak ada aksi penghapusan. Lokasi yang sudah tersimpan dan memiliki rincian RAB tetap dipertahankan.</div>
        </section>

        <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-[11px] text-slate-400">Dibuat: {formatDate(createdAt)} <span className="mx-1">·</span> Terakhir diperbarui: {formatDate(updatedAt)}</div>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Menyimpan Perubahan...' : 'Simpan Seluruh Perubahan'}
          </button>
        </div>
      </form>
    </main>
  );
}
