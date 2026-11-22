'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Archive, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ProjectTabs from '@/components/layout/ProjectTabs';

export default function ProjectAccessGate({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const projectId = params?.id;
  const isManagementRoute = pathname?.endsWith('/kelola') ?? false;
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setChecking(false);
      setStatus(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    void supabase
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Gagal memeriksa status akses proyek:', error.message);
        setStatus(data?.status ?? null);
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, isManagementRoute]);

  if (checking) {
    return <main className="flex min-h-[50vh] items-center justify-center p-6"><div className="text-center"><Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-emerald-600" /><p className="text-sm text-slate-500">Memeriksa status proyek...</p></div></main>;
  }

  if (status === 'DIBATALKAN' && !isManagementRoute) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700"><Archive className="h-7 w-7" /></div>
        <h1 className="text-xl font-bold text-slate-900">Proyek Dibatalkan</h1>
        <p className="text-sm leading-6 text-slate-600">Akses ke workspace dan modul proyek ini ditutup. Akun dengan izin project.manage dapat memulihkan proyek ke status DRAFT melalui pengelolaan status.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/proyek/${projectId}/kelola`} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Kelola Status Proyek</Link>
          <Link href="/proyek/daftar" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Kembali ke Daftar Proyek</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-50">
      <ProjectTabs />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
