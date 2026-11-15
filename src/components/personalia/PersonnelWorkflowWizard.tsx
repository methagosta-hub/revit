import Link from 'next/link';
import { Banknote } from 'lucide-react';

type WorkflowStep = 1 | 2 | 3 | 4 | 5;

type Props = {
  currentStep: WorkflowStep;
};

const STEPS: Array<{
  number: WorkflowStep;
  title: string;
  description: string;
  href: string;
}> = [
  { number: 1, title: 'Master Karyawan', description: 'Data induk dan status kerja', href: '/personalia/karyawan' },
  { number: 2, title: 'Penempatan Utama', description: 'Unit atau basis kerja', href: '/personalia/penempatan-utama' },
  { number: 3, title: 'Penempatan Proyek', description: 'Penempatan untuk periode tertentu', href: '/personalia/tenaga-kerja' },
  { number: 4, title: 'Penugasan Harian', description: 'Pekerjaan aktual per tanggal', href: '/personalia/penugasan-harian' },
  { number: 5, title: 'Absensi', description: 'Kehadiran dan monitoring lapangan', href: '/personalia/absensi' },
];

/** Navigasi bersama alur Personalia. Setiap tahap dapat dibuka sesuai hak akses. */
export default function PersonnelWorkflowWizard({ currentStep }: Props) {
  return (
    <section aria-label="Alur pengelolaan personalia" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Alur Pengelolaan Personalia</p>
          <p className="mt-0.5 text-xs text-slate-500">Pilih tahap untuk berpindah halaman. Data setiap tahap saling terhubung.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-slate-500">Langkah {currentStep} dari {STEPS.length}</span>
          <Link href="/personalia/kontrak-upah" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100">
            <Banknote className="h-3.5 w-3.5" /> Pengaturan Kontrak &amp; Upah
          </Link>
        </div>
      </div>
      <nav aria-label="Tahapan Personalia">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {STEPS.map((step) => {
            const active = step.number === currentStep;
            return (
              <li key={step.number}>
                <Link href={step.href} aria-current={active ? 'step' : undefined} className={[
                  'group flex min-h-[68px] items-center gap-3 rounded-xl border px-3 py-3 transition',
                  'focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20',
                  active ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40',
                ].join(' ')}>
                  <span className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800',
                  ].join(' ')}>{step.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{step.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{step.description}</span>
                  </span>
                  {active && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Aktif</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}
