'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { user, access, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('/dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) setDestination(next);
  }, []);

  useEffect(() => {
    if (!loading && user && access?.profile?.is_active) router.replace(destination);
  }, [loading, user, access, destination, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await signIn({ email, password });
      router.replace(destination);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login gagal. Periksa email dan kata sandi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between bg-slate-950 p-10 text-white lg:flex">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">JAVAWASTHU MANAGEMENT</p>
            <h1 className="mt-3 max-w-md text-4xl font-extrabold leading-tight">Satu ruang kerja untuk seluruh aktivitas perusahaan.</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
              Kelola perencanaan, pelaksanaan, pengadaan, tenaga kerja dan laporan proyek melalui satu sistem terpadu.
            </p>
          </div>
          <div className="border-t border-white/10 pt-5 text-xs text-slate-400">Integrated Company & Project Management System</div>
        </section>

        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mx-auto max-w-md">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Building2 className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-extrabold text-slate-900">JAVAWASTHU MANAGEMENT</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">Construction Hub</p>
              </div>
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Akses internal</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Masuk ke akun</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan email dan kata sandi akun perusahaan yang telah diberikan administrator.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
                <span className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@perusahaan.com" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Kata sandi</span>
                <span className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                  <LockKeyhole className="h-4 w-4 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} className="rounded-md p-1 text-slate-400 hover:text-slate-700">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

              <button type="submit" disabled={submitting || loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {submitting ? 'Memeriksa akun...' : 'Masuk ke Dashboard'}
              </button>
            </form>

            <p className="mt-8 text-center text-xs leading-5 text-slate-400">Akses hanya untuk pengguna yang telah didaftarkan perusahaan. Pendaftaran mandiri tidak tersedia.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
