'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Activity,
  ArrowUpRight,
  Building2,
  Calculator,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Home,
  LogIn,
  LogOut,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  UserCircle2,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  /** Permission required to display this navigation item. */
  permission?: string;
};

type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const navGroups: NavigationGroup[] = [
  {
    title: 'Beranda',
    items: [
      { name: 'Dashboard Perusahaan', href: '/dashboard', icon: Home },
      { name: 'Daftar Proyek', href: '/proyek/daftar', icon: FolderKanban },
      { name: 'Buat Proyek', href: '/proyek/baru', icon: PlusCircle },
    ],
  },
  {
    title: 'Operasional Perusahaan',
    items: [
      { name: 'Pengadaan', href: '/pengadaan', icon: ShoppingCart },
      { name: 'Personalia', href: '/personalia', icon: Users },
      { name: 'Gudang & Persediaan', href: '/gudang', icon: Warehouse },
      { name: 'Keuangan', href: '/keuangan', icon: Wallet },
      {
        name: 'Pelaporan Eksternal',
        href: '/laporan-eksternal',
        icon: FileText,
        permission: 'external.report.read',
      },
    ],
  },
  {
    title: 'Database Master',
    items: [
      { name: 'Master AHSP', href: '/master/ahsp', icon: Calculator },
      { name: 'Master Bahan', href: '/master/bahan', icon: Package },
      { name: 'Master Upah', href: '/master/upah', icon: Users },
      { name: 'Master Alat', href: '/master/alat', icon: Wrench },
    ],
  },
  {
    title: 'Administrasi & Kontrol',
    items: [
      { name: 'Manajemen Perusahaan', href: '/perusahaan', icon: Building2 },
      { name: 'Pengguna', href: '/perusahaan/pengguna', icon: Users },
      { name: 'Peran & Akses', href: '/perusahaan/peran', icon: ShieldCheck },
      { name: 'Audit Aktivitas', href: '/perusahaan/audit', icon: ClipboardCheck },
      { name: 'Pengaturan', href: '/pengaturan', icon: Settings },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;

  // Saat membuka detail salah satu proyek, Daftar Proyek tetap menjadi
  // penanda konteks navigasi proyek. Halaman Buat Proyek tetap terpisah.
  if (href === '/proyek/daftar') {
    return pathname.startsWith('/proyek/') && pathname !== '/proyek/baru';
  }

  return false;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, access, loading, signOut, can } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  }

  if (pathname === '/login') return null;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 select-none flex-col border-r border-slate-200 bg-white">
      <Link
        href="/dashboard"
        className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-5 transition-colors hover:bg-slate-50"
        aria-label="Buka Dashboard Perusahaan DAHLIA"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm font-extrabold leading-tight tracking-tight text-slate-900">
            DAHLIA
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Construction Hub
          </span>
        </div>
      </Link>

      <nav aria-label="Navigasi utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.permission || (!loading && can(item.permission)),
          );

          // Jangan tampilkan judul grup jika seluruh item di dalamnya tersembunyi.
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
                {group.title}
              </p>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        className={`h-[17px] w-[17px] shrink-0 ${
                          isActive
                            ? 'text-emerald-300'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {isActive ? <Activity className="h-3.5 w-3.5 text-emerald-300" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        {loading ? (
          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
            Memeriksa akun...
          </div>
        ) : user ? (
          <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <UserCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">
                  {access?.profile?.full_name || user.email}
                </p>
                <p className="truncate text-[10px] text-slate-500">
                  {access?.roles?.map((role) => role.name).join(', ') || 'Belum ada peran'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Keluar...' : 'Keluar akun'}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            <LogIn className="h-3.5 w-3.5" /> Masuk akun
          </Link>
        )}

        <Link
          href="/"
          className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          <span>Kembali ke halaman awal</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold text-slate-700">Company Workspace</p>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Sistem manajemen proyek DAHLIA Construction
          </p>
        </div>
      </div>
    </aside>
  );
}
