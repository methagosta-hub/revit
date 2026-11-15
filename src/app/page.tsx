'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  ArrowUpRight,
  FileText,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  Users,
  Wrench,
  RefreshCw,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { fetchProjects } from '@/lib/services/projectService';

type ProjectRow = {
  id: string;
  title: string;
  client: string;
  location: string;
  status: 'Draft' | 'Review' | 'Final';
  total_value: number;
  updated_at: string;
};

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

const quickLinks = [
  {
    title: 'Database AHSP',
    description: 'Kelola analisa harga satuan pekerjaan, koefisien, serta komponen pembentuk biaya.',
    href: '/master/ahsp',
    icon: Layers,
    accent: 'emerald',
    action: 'Buka Master AHSP',
  },
  {
    title: 'Database Material',
    description: 'Kelola katalog material bangunan, kode, satuan, kategori, dan harga dasar.',
    href: '/master/bahan',
    icon: Package,
    accent: 'blue',
    action: 'Buka Master Bahan',
  },
  {
    title: 'Upah Tenaga Kerja',
    description: 'Kelola daftar tenaga kerja, satuan upah, kategori, dan harga tenaga kerja.',
    href: '/master/upah',
    icon: Users,
    accent: 'violet',
    action: 'Buka Master Upah',
  },
  {
    title: 'Kelangkapan Alat',
    description: 'Kelola katalog peralatan konstruksi, satuan pemakaian, kategori, dan harga alat.',
    href: '/master/alat',
    icon: Wrench,
    accent: 'amber',
    action: 'Buka Master Alat',
  },
];

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadProjects = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setLoadError('');

    try {
      const data = await fetchProjects();
      setProjects((data ?? []) as ProjectRow[]);
    } catch (error) {
      console.error('Gagal memuat daftar proyek:', error);
      setLoadError(`Gagal memuat daftar proyek: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      setLoading(true);
      setLoadError('');

      try {
        const data = await fetchProjects();
        if (active) setProjects((data ?? []) as ProjectRow[]);
      } catch (error) {
        console.error('Gagal memuat daftar proyek:', error);
        if (active) setLoadError(`Gagal memuat daftar proyek: ${getErrorMessage(error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');

    if (!keyword) return projects;

    return projects.filter((project) =>
      [project.title, project.client, project.location]
        .some((value) => (value ?? '').toLocaleLowerCase('id').includes(keyword)),
    );
  }, [projects, search]);

  const totalAkumulasi = useMemo(
    () => projects.reduce((total, project) => total + Number(project.total_value || 0), 0),
    [projects],
  );

  const statusCount = useMemo(
    () => ({
      draft: projects.filter((project) => project.status === 'Draft').length,
      review: projects.filter((project) => project.status === 'Review').length,
      final: projects.filter((project) => project.status === 'Final').length,
    }),
    [projects],
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>DAHLIA Construction · RAB & Quantity Surveying System</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard Utama
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Pusat pengelolaan database AHSP, bahan, upah tenaga kerja, peralatan, dan dokumen
            Rencana Anggaran Biaya proyek.
          </p>
        </div>

        <Link
          href="/proyek/baru"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buat RAB Baru
        </Link>
      </header>

      <section aria-labelledby="reference-heading" className="space-y-3">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
          <div>
            <h2 id="reference-heading" className="text-base font-bold text-slate-900">
              Database Referensi Global
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Kelola AHSP, bahan, upah, dan alat secara terpusat untuk digunakan kembali pada berbagai proyek.
            </p>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Tidak terikat pada project_id
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            const accentClasses: Record<string, string> = {
              emerald: 'bg-emerald-50 text-emerald-700',
              blue: 'bg-blue-50 text-blue-700',
              violet: 'bg-violet-50 text-violet-700',
              amber: 'bg-amber-50 text-amber-700',
            };
            const accentClass = accentClasses[item.accent] ?? accentClasses.emerald;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-[150px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 group-hover:text-emerald-700">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  {item.action}
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="project-summary-heading" className="space-y-3">
        <div>
          <h2 id="project-summary-heading" className="text-base font-bold text-slate-900">
            Ringkasan Proyek
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Ringkasan dokumen RAB yang tersimpan pada database proyek.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Dokumen Proyek</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {loading ? '—' : projects.length}
                <span className="ml-1.5 text-sm font-medium text-slate-400">dokumen</span>
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
          </article>

          <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Akumulasi Nilai RAB</p>
              <p className="mt-1 truncate text-xl font-bold tabular-nums text-slate-900">
                {loading ? '—' : formatRupiah(totalAkumulasi)}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
          </article>

          <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Dalam Draft</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {loading ? '—' : statusCount.draft}
                <span className="ml-1.5 text-sm font-medium text-slate-400">proyek</span>
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </div>
          </article>

          <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Final</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {loading ? '—' : statusCount.final}
                <span className="ml-1.5 text-sm font-medium text-slate-400">proyek</span>
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
          </article>
        </div>
      </section>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadProjects()}
            className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-rose-800 hover:text-rose-950"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba lagi
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Daftar Proyek RAB</h2>
            <p className="mt-1 text-xs text-slate-500">
              Buka proyek untuk mengelola divisi dan rincian anggarannya.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Cari proyek, klien, atau lokasi..."
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                aria-label="Cari proyek"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadProjects(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Segarkan
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500 sm:px-5">
          <span>
            Menampilkan <strong className="text-slate-800">{filteredProjects.length}</strong> dari {projects.length} proyek
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Hapus pencarian
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-5 py-3.5">Nama Proyek & Klien</th>
                <th scope="col" className="px-5 py-3.5">Lokasi</th>
                <th scope="col" className="px-5 py-3.5">Update Terakhir</th>
                <th scope="col" className="px-5 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">Total Nilai RAB</th>
                <th scope="col" className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-500">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-600" />
                    Memuat data proyek...
                  </td>
                </tr>
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => {
                  const statusClass =
                    project.status === 'Final'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : project.status === 'Review'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700';

                  const StatusIcon =
                    project.status === 'Final'
                      ? CheckCircle2
                      : project.status === 'Review'
                        ? AlertCircle
                        : Clock;

                  return (
                    <tr key={project.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <Link
                          href={`/proyek/${project.id}`}
                          className="flex items-center gap-2 font-semibold text-slate-900 transition hover:text-emerald-700"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <span>{project.title}</span>
                        </Link>
                        <div className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-slate-500">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>{project.client || '-'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{project.location || '-'}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {formatDate(project.updated_at)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                          <StatusIcon className="h-3 w-3" />
                          {project.status || 'Draft'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatRupiah(Number(project.total_value || 0))}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/proyek/${project.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-900 hover:text-white"
                        >
                          Buka RAB
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <BookOpen className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      {projects.length === 0
                        ? 'Belum ada proyek RAB'
                        : 'Proyek tidak ditemukan'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {projects.length === 0
                        ? 'Buat proyek RAB pertama untuk mulai menyusun anggaran.'
                        : 'Coba kata kunci pencarian yang berbeda.'}
                    </p>
                    {projects.length === 0 && (
                      <Link
                        href="/proyek/baru"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <Plus className="h-4 w-4" />
                        Buat RAB Baru
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
