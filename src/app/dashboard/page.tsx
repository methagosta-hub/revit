'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse,
  Wallet,
} from 'lucide-react';
import { fetchProjects } from '@/lib/services/projectService';
import { formatRupiah } from '@/lib/format';
import RequireAuth from '@/components/auth/RequireAuth';

type DashboardProject = {
  id: string;
  title: string;
  client?: string | null;
  location?: string | null;
  status?: string | null;
  total_value?: number | string | null;
  updated_at?: string | null;
  school_npsn?: string | null;
};

function formatDate(value?: string | null): string {
  if (!value) return 'Belum diperbarui';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum diperbarui';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function statusClass(status?: string | null): string {
  switch (status) {
    case 'Final':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'Review':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-500/20';
  }
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof FolderKanban;
  iconClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
          <p className="mt-2 break-words text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{note}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const quickLinks = [
  {
    title: 'Pengadaan',
    description: 'Permintaan barang dan proses pembelian',
    href: '/pengadaan',
    icon: ShoppingCart,
    color: 'bg-blue-50 text-blue-700',
  },
  {
    title: 'Personalia',
    description: 'Data karyawan, tenaga kerja dan absensi',
    href: '/personalia',
    icon: Users,
    color: 'bg-violet-50 text-violet-700',
  },
  {
    title: 'Gudang & Persediaan',
    description: 'Penerimaan dan pergerakan material',
    href: '/gudang',
    icon: Warehouse,
    color: 'bg-amber-50 text-amber-700',
  },
  {
    title: 'Keuangan',
    description: 'Pembayaran, kas dan rekap pengeluaran',
    href: '/keuangan',
    icon: Wallet,
    color: 'bg-emerald-50 text-emerald-700',
  },
];

function CompanyDashboardContent() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError('');
    try {
      const rows = await fetchProjects();
      setProjects((rows ?? []) as DashboardProject[]);
    } catch (err) {
      console.error('Gagal memuat dashboard perusahaan:', err);
      setError(err instanceof Error ? err.message : 'Data proyek belum dapat dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const summary = useMemo(() => {
    const totalValue = projects.reduce(
      (sum, project) => sum + Number(project.total_value ?? 0),
      0,
    );
    const draft = projects.filter((project) => project.status === 'Draft').length;
    const review = projects.filter((project) => project.status === 'Review').length;
    const final = projects.filter((project) => project.status === 'Final').length;

    return { totalValue, draft, review, final };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    if (!keyword) return projects.slice(0, 6);

    return projects.filter((project) =>
      [project.title, project.client, project.location, project.school_npsn]
        .some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword)),
    ).slice(0, 8);
  }, [projects, search]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <Building2 className="h-4 w-4" />
              DAHLIA Construction
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Dashboard Perusahaan
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Ringkasan proyek dan akses cepat ke aktivitas operasional perusahaan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadProjects(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Segarkan
            </button>
            <Link
              href="/proyek/baru"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Buat Proyek
            </Link>
          </div>
        </header>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <Activity className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Data dashboard belum dapat dimuat.</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : null}

        <section aria-label="Ringkasan perusahaan" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Proyek"
            value={loading ? '—' : String(projects.length)}
            note="Seluruh proyek yang tercatat"
            icon={FolderKanban}
            iconClass="bg-blue-50 text-blue-700"
          />
          <StatCard
            label="Total Nilai RAB"
            value={loading ? '—' : formatRupiah(summary.totalValue)}
            note="Akumulasi nilai RAB seluruh proyek"
            icon={CircleDollarSign}
            iconClass="bg-emerald-50 text-emerald-700"
          />
          <StatCard
            label="Dalam Review"
            value={loading ? '—' : String(summary.review)}
            note="Proyek dengan status Review"
            icon={ClipboardList}
            iconClass="bg-amber-50 text-amber-700"
          />
          <StatCard
            label="RAB Final"
            value={loading ? '—' : String(summary.final)}
            note="Proyek dengan status Final"
            icon={CheckCircle2}
            iconClass="bg-violet-50 text-violet-700"
          />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="font-bold text-slate-900">Daftar Proyek</h2>
                <p className="mt-1 text-xs text-slate-500">Proyek terbaru dan nilai anggarannya</p>
              </div>
              <Link href="/proyek/daftar" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                Lihat semua proyek <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <label className="relative block">
                <span className="sr-only">Cari proyek</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama proyek, pemilik, lokasi atau NPSN..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : filteredProjects.length ? (
              <div className="divide-y divide-slate-100">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/proyek/${project.id}`}
                    className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">{project.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusClass(project.status)}`}>
                          {project.status || 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[project.client, project.location].filter(Boolean).join(' · ') || 'Identitas pemilik/lokasi belum diisi'}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                        <CalendarClock className="h-3 w-3" />
                        Diperbarui {formatDate(project.updated_at)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                      <span className="text-sm font-bold tabular-nums text-slate-800">
                        {formatRupiah(Number(project.total_value ?? 0))}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        Buka proyek <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <FolderKanban className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  {search ? 'Proyek tidak ditemukan' : 'Belum ada proyek'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {search ? 'Coba kata kunci lain.' : 'Buat proyek pertama untuk mulai menggunakan ruang kerja perusahaan.'}
                </p>
                {!search ? (
                  <Link href="/proyek/baru" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                    <Plus className="h-3.5 w-3.5" /> Buat Proyek
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <h2 className="font-bold text-slate-900">Akses Operasional</h2>
                <p className="mt-1 text-xs text-slate-500">Pintasan ke bagian utama perusahaan</p>
              </div>
              <div className="space-y-2">
                {quickLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-slate-500" />
                <h2 className="font-bold text-slate-900">Status Administrasi RAB</h2>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Draft</span>
                    <strong className="text-slate-800">{loading ? '—' : summary.draft}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-400" style={{ width: `${projects.length ? (summary.draft / projects.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Review</span>
                    <strong className="text-slate-800">{loading ? '—' : summary.review}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${projects.length ? (summary.review / projects.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Final</span>
                    <strong className="text-slate-800">{loading ? '—' : summary.final}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${projects.length ? (summary.final / projects.length) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                Status ini mengikuti kolom status proyek yang tersedia saat ini (Draft, Review, Final).
              </p>
            </div>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>DAHLIA Construction · Company Management Hub</span>
          <span>Ringkasan berdasarkan data proyek dan nilai RAB yang tersimpan.</span>
        </footer>
      </div>
    </main>
  );
}


export default function CompanyDashboardPage() {
  return (
    <RequireAuth permission="company.dashboard.read">
      <CompanyDashboardContent />
    </RequireAuth>
  );
}
