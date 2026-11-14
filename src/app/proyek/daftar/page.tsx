'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Building2,
  MapPin,
  GraduationCap,
  FileText,
  ArrowUpRight,
  PencilLine,
  Plus,
  AlertCircle,
  FolderKanban,
} from 'lucide-react';
import { fetchProjects } from '@/lib/services/projectService';
import { formatRupiah } from '@/lib/format';

type ProjectRow = {
  id: string;
  title: string;
  client: string;
  location: string;
  status: 'Draft' | 'Review' | 'Final';
  total_value: number;
  updated_at: string;
  school_npsn?: string | null;
  principal_name?: string | null;
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Terjadi kesalahan yang tidak diketahui.';
}

export default function DaftarProyekPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadProjects(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchProjects();
      setProjects((data ?? []) as ProjectRow[]);
    } catch (err) {
      console.error('Gagal memuat daftar proyek:', err);
      setError(`Daftar proyek belum dapat dimuat: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return projects.filter((project) => {
      const matchesSearch = !keyword || [
        project.title,
        project.client,
        project.location,
        project.school_npsn ?? '',
        project.principal_name ?? '',
      ].some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword));
      const matchesStatus = statusFilter === 'ALL' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  const totalValue = useMemo(
    () => projects.reduce((sum, project) => sum + Number(project.total_value ?? 0), 0),
    [projects],
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <FolderKanban className="h-4 w-4" /> Manajemen Proyek
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Daftar Proyek</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Lihat identitas dan nilai setiap proyek, buka detail untuk memperbarui data sekolah serta lokasi pekerjaan RAB.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadProjects(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
          </button>
          <Link
            href="/proyek/baru"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Buat Proyek
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Jumlah Proyek</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : projects.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Akumulasi RAB</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{loading ? '—' : formatRupiah(totalValue)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Proyek Final</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : projects.filter((p) => p.status === 'Final').length}</p>
        </article>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Seluruh Proyek</h2>
            <p className="mt-1 text-xs text-slate-500">Pilih Detail & Edit untuk mengubah identitas proyek dan daftar lokasi RAB.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, sekolah, NPSN, lokasi..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500"
              aria-label="Filter status proyek"
            >
              <option value="ALL">Semua Status</option>
              <option value="Draft">Draft</option>
              <option value="Review">Review</option>
              <option value="Final">Final</option>
            </select>
          </div>
        </div>

        <div className="px-4 py-3 text-xs text-slate-500">Menampilkan <strong className="text-slate-800">{filtered.length}</strong> dari {projects.length} proyek</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Proyek / Pemilik</th>
                <th className="px-5 py-3">NPSN / Kepala Sekolah</th>
                <th className="px-5 py-3">Lokasi</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Nilai RAB</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-600" />Memuat proyek...</td></tr>
              ) : filtered.length ? filtered.map((project) => {
                const statusClass = project.status === 'Final'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : project.status === 'Review'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700';
                return (
                  <tr key={project.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{project.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />{project.client || '-'}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Diperbarui {formatDate(project.updated_at)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="flex items-center gap-1.5 text-slate-700"><GraduationCap className="h-4 w-4 text-slate-400" />{project.school_npsn || '-'}</p>
                      <p className="mt-1 text-xs text-slate-500">{project.principal_name || 'Nama kepala sekolah belum diisi'}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600"><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{project.location || '-'}</span></td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{project.status || 'Draft'}</span></td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(Number(project.total_value ?? 0))}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link href={`/proyek/${project.id}/kelola`} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                          <PencilLine className="h-3.5 w-3.5" /> Detail & Edit
                        </Link>
                        <Link href={`/proyek/${project.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                          <FileText className="h-3.5 w-3.5" /> Buka RAB <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="px-5 py-14 text-center">
                  <FolderKanban className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                  <p className="font-semibold text-slate-800">{projects.length ? 'Proyek tidak ditemukan' : 'Belum ada proyek'}</p>
                  <p className="mt-1 text-sm text-slate-500">{projects.length ? 'Coba kata kunci atau status lain.' : 'Tambahkan proyek pertama untuk mulai menyusun RAB.'}</p>
                  {!projects.length && <Link href="/proyek/baru" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Buat Proyek</Link>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
