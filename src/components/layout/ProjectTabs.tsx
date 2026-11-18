'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Calculator,
  ClipboardList,
  BarChart3,
  FileText,
  Layers,
  HardHat,
  ClipboardCheck,
} from 'lucide-react';

type ProjectSectionLink = {
  label: string;
  suffix: string;
  icon: ComponentType<{ className?: string }>;
};

const planningLinks: ProjectSectionLink[] = [
  { label: 'RAB', suffix: '', icon: Calculator },
  { label: 'AHSP Proyek', suffix: '/ahsp-proyek', icon: Layers },
  { label: 'Kelola Divisi', suffix: '/kelola', icon: ClipboardList },
  { label: 'Rekap RAB', suffix: '/rekap', icon: FileText },
  { label: 'Kurva-S Rencana', suffix: '/curva-s', icon: BarChart3 },
];

const executionLinks: ProjectSectionLink[] = [
  { label: 'Pusat Pelaksanaan', suffix: '/pelaksanaan-pekerjaan', icon: ClipboardCheck },
];

const executionSuffixes = executionLinks.map((item) => item.suffix);

export default function ProjectTabs() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { access } = useAuth();
  const isPortfolioAccount = access?.profile?.is_demo_user === true;
  const visiblePlanningLinks = isPortfolioAccount
    ? planningLinks.filter((item) => item.suffix !== '/kelola')
    : planningLinks;
  const planningSuffixes = visiblePlanningLinks.map((item) => item.suffix).filter(Boolean);
  const projectId = String(params?.id ?? '');

  if (!projectId) return null;

  const projectBase = `/proyek/${projectId}`;
  const isPlanning =
    pathname === projectBase ||
    planningSuffixes.some(
      (suffix) => pathname === `${projectBase}${suffix}` || pathname.startsWith(`${projectBase}${suffix}/`),
    );
  const isExecution = executionSuffixes.some(
    (suffix) => pathname === `${projectBase}${suffix}` || pathname.startsWith(`${projectBase}${suffix}/`),
  );

  return (
    <header className="sticky top-14 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur print:hidden xl:top-0">
      <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3 xl:px-6">
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 sm:mb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              DAHLIA Construction
            </p>
            <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
              Ruang Kerja Proyek
            </h2>
          </div>
          <Link
            href="/proyek/daftar"
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            Kembali ke Daftar Proyek
          </Link>
        </div>

        <nav aria-label="Modul proyek" className="dahlia-horizontal-tabs flex items-center gap-1.5 pb-1 sm:gap-2">
          <Link
            href={projectBase}
            aria-current={isPlanning ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm ${
              isPlanning
                ? 'bg-blue-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Calculator className="h-4 w-4" />
            Perencanaan
          </Link>

          <Link
            href={`${projectBase}/pelaksanaan-pekerjaan`}
            aria-current={isExecution ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm ${
              isExecution
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <HardHat className="h-4 w-4" />
            Pelaksanaan
          </Link>

          {!isPortfolioAccount && <Link
            href={`/proyek/${projectId}/pelaksanaan-pekerjaan/laporan`}
            aria-current={
              pathname === `${projectBase}/pelaksanaan-pekerjaan/laporan`
                ? 'page'
                : undefined
            }
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              pathname === `${projectBase}/pelaksanaan-pekerjaan/laporan`
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-emerald-700'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Laporan
          </Link>}
        </nav>

        {isPlanning ? (
          <nav aria-label="Menu Perencanaan" className="dahlia-horizontal-tabs mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 sm:mt-3 sm:gap-1.5">
            {visiblePlanningLinks.map((item) => {
              const href = `${projectBase}${item.suffix}`;
              const isActive = item.suffix
                ? pathname === href || pathname.startsWith(`${href}/`)
                : pathname === projectBase;
              const Icon = item.icon;
              return (
                <Link
                  key={item.suffix || 'rab'}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {isExecution ? (
          <nav aria-label="Menu Pelaksanaan" className="dahlia-horizontal-tabs mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 sm:mt-3 sm:gap-1.5">
            {executionLinks.map((item) => {
              const href = `${projectBase}${item.suffix}`;
              const Icon = item.icon;
              return (
                <Link
                  key={item.suffix}
                  href={href}
                  aria-current="page"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
