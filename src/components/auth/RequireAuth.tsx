'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

export default function RequireAuth({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: string;
}) {
  const { user, access, loading, accessError, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && !accessError) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/dashboard')}`);
    }
  }, [loading, user, accessError, router, pathname]);

  if (loading || (!user && !accessError)) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-600" />
          Memeriksa sesi pengguna...
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-bold">Hak akses belum dapat diverifikasi.</p>
          <p className="mt-1">{accessError}</p>
          <p className="mt-2 text-xs">Periksa migration dan kebijakan akses Supabase, kemudian masuk kembali.</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (!access?.profile?.is_active) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold"><ShieldAlert className="h-5 w-5" /> Akun tidak aktif</div>
          <p className="mt-2">Akun ini tidak memiliki akses ke ruang kerja. Hubungi administrator perusahaan.</p>
        </div>
      </main>
    );
  }

  if (permission && !can(permission)) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold"><ShieldAlert className="h-5 w-5" /> Akses tidak diizinkan</div>
          <p className="mt-2">Akun Anda belum memiliki kewenangan untuk membuka halaman ini.</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
