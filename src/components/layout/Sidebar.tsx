'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Activity,
  ArrowUpRight,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileText,
  FolderKanban,
  HardHat,
  Home,
  LogIn,
  LogOut,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
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

// Grup navigasi utama. Rute dipertahankan agar tidak mengubah alur halaman.
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

// Empat halaman master disatukan di bawah satu menu yang dapat dibuka/tutup.
const masterItems: NavigationItem[] = [
  { name: 'Master AHSP', href: '/master/ahsp', icon: Calculator },
  { name: 'Master Bahan', href: '/master/bahan', icon: Package },
  { name: 'Master Upah', href: '/master/upah', icon: Users },
  { name: 'Master Alat', href: '/master/alat', icon: Wrench },
];

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;

  // Saat membuka detail proyek, Daftar Proyek tetap menjadi penanda konteks.
  if (href === '/proyek/daftar') {
    return pathname.startsWith('/proyek/') && pathname !== '/proyek/baru';
  }

  return false;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-3">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {children}
      </p>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, access, loading, signOut, can } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [masterOpen, setMasterOpen] = useState(() => pathname.startsWith('/master/'));

  // Jika pengguna masuk ke salah satu halaman master melalui navigasi lain,
  // buka otomatis grup Master Data agar posisi halaman tetap terlihat.
  useEffect(() => {
    if (pathname.startsWith('/master/')) setMasterOpen(true);
  }, [pathname]);

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

  const masterIsActive = pathname.startsWith('/master/');

  return (
    <aside className="relative sticky top-0 z-30 flex h-screen w-[288px] shrink-0 select-none flex-col overflow-hidden border-r border-white/[0.08] bg-[#071321] text-slate-100 shadow-[12px_0_40px_rgba(2,8,23,0.16)]">
      {/* Ambient glow dekoratif, tidak mengganggu interaksi menu. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-emerald-400/[0.10] via-cyan-400/[0.035] to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-40 h-48 w-48 rounded-full bg-cyan-500/[0.06] blur-3xl"
      />

      {/* Brand / logo perusahaan */}
      <Link
        href="/dashboard"
        className="relative z-10 flex min-h-[112px] items-center gap-4 border-b border-white/[0.08] px-5 py-5 transition-colors hover:bg-white/[0.035]"
        aria-label="Buka Dashboard Perusahaan DAHLIA"
      >
        <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[19px] border border-white/20 bg-gradient-to-br from-emerald-300 via-teal-500 to-cyan-700 text-white shadow-[0_8px_24px_rgba(13,148,136,0.28)]">
          <HardHat className="h-8 w-8" strokeWidth={1.8} />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#071321] bg-[#a7f3d0] text-[#064e3b]">
            <Sparkles className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="block truncate text-[22px] font-black leading-none tracking-[0.12em] text-white">
              DAHLIA
            </span>
          </div>
          <span className="mt-2 block text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-300">
            Construction
          </span>
          <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-slate-400">
            Management System
          </span>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          <span className="text-[8px] font-bold uppercase tracking-[0.13em] text-slate-500">
            Live
          </span>
        </div>
      </Link>

      <nav
        aria-label="Navigasi utama"
        className="relative z-10 flex-1 space-y-6 overflow-y-auto px-3.5 py-5 [scrollbar-color:rgba(148,163,184,0.25)_transparent] [scrollbar-width:thin]"
      >
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.permission || (!loading && can(item.permission)),
          );

          // Judul grup tidak ditampilkan jika semua item tidak memiliki akses.
          if (visibleItems.length === 0) return null;

          return (
            <section key={group.title}>
              <SectionLabel>{group.title}</SectionLabel>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative flex min-h-[46px] items-center gap-3 rounded-[13px] px-2.5 py-2 text-[12.5px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071321] ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-400/[0.19] to-cyan-400/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(110,231,183,0.18)]'
                          : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100'
                      }`}
                    >
                      {isActive ? (
                        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                      ) : null}
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-all duration-200 ${
                          isActive
                            ? 'bg-emerald-300/15 text-emerald-200'
                            : 'bg-white/[0.035] text-slate-500 group-hover:bg-white/[0.08] group-hover:text-emerald-200'
                        }`}
                      >
                        <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {isActive ? (
                        <Activity className="mr-1 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      ) : (
                        <ArrowUpRight className="mr-1 h-3 w-3 shrink-0 text-slate-700 opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-400 group-hover:opacity-100" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Master Data: satu grup induk dengan empat submenu. */}
        <section>
          <SectionLabel>Database & Referensi</SectionLabel>
          <div
            className={`rounded-[18px] border p-2 transition-all duration-200 ${
              masterIsActive
                ? 'border-emerald-300/25 bg-gradient-to-br from-emerald-400/[0.12] to-cyan-400/[0.055] shadow-[0_8px_28px_rgba(16,185,129,0.07)]'
                : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.04]'
            }`}
          >
            <button
              type="button"
              onClick={() => setMasterOpen((open) => !open)}
              aria-expanded={masterOpen}
              aria-controls="sidebar-master-submenu"
              className="group flex w-full items-center gap-3 rounded-[13px] px-1.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border transition-colors ${
                  masterIsActive
                    ? 'border-emerald-200/20 bg-emerald-300/15 text-emerald-200'
                    : 'border-white/[0.07] bg-white/[0.045] text-slate-400 group-hover:text-emerald-200'
                }`}
              >
                <Database className="h-[19px] w-[19px]" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-slate-100">Master Data</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                  Referensi & komponen proyek
                </span>
              </span>
              <span className="mr-1 flex h-6 min-w-6 items-center justify-center rounded-lg border border-white/[0.08] bg-black/10 px-1.5 text-[9px] font-bold tabular-nums text-slate-400">
                04
              </span>
              <ChevronDown
                className={`mr-1 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 ${
                  masterOpen ? 'rotate-180 text-emerald-300' : ''
                }`}
              />
            </button>

            <div
              id="sidebar-master-submenu"
              className={`grid transition-all duration-300 ease-in-out ${
                masterOpen
                  ? 'mt-1 grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="ml-6 space-y-1 border-l border-emerald-300/20 pb-1 pl-3 pt-1">
                  {masterItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isItemActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group flex min-h-[39px] items-center gap-2.5 rounded-[10px] px-2.5 text-[11.5px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${
                          isActive
                            ? 'bg-emerald-300/15 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.13)]'
                            : 'text-slate-400 hover:bg-white/[0.055] hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive
                              ? 'text-emerald-300'
                              : 'text-slate-500 group-hover:text-emerald-200'
                          }`}
                          strokeWidth={1.9}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {isActive ? (
                          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </nav>

      {/* Profil, logout, dan status workspace */}
      <div className="relative z-10 border-t border-white/[0.08] bg-black/[0.10] p-3.5">
        {loading ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-3 text-[11px] text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Memeriksa akun...
          </div>
        ) : user ? (
          <div className="mb-3 rounded-[16px] border border-white/[0.09] bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-emerald-200/15 bg-gradient-to-br from-emerald-300/20 to-cyan-400/10 text-emerald-200">
                <UserCircle2 className="h-[22px] w-[22px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-bold text-slate-100">
                  {access?.profile?.full_name || user.email}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  {access?.roles?.map((role) => role.name).join(', ') || 'Belum ada peran'}
                </p>
              </div>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.09] bg-white/[0.035] px-3 py-2.5 text-[11px] font-bold text-slate-400 transition-all hover:border-rose-300/20 hover:bg-rose-400/[0.08] hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Keluar...' : 'Keluar akun'}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="mb-3 flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-3 text-[11px] font-extrabold text-[#06251f] shadow-[0_7px_20px_rgba(16,185,129,0.16)] transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <LogIn className="h-4 w-4" /> Masuk akun
          </Link>
        )}

        <Link
          href="/"
          className="mb-3 flex items-center justify-between rounded-[10px] px-2.5 py-2 text-[10.5px] font-semibold text-slate-500 transition-colors hover:bg-white/[0.045] hover:text-slate-200"
        >
          <span>Kembali ke halaman awal</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        <div className="rounded-[13px] border border-emerald-300/10 bg-gradient-to-r from-emerald-400/[0.08] to-cyan-400/[0.045] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-300" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-100">
              Company Workspace
            </p>
            <span className="ml-auto rounded-md border border-emerald-300/15 bg-emerald-300/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-200">
              ONLINE
            </span>
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500">
            Sistem manajemen proyek DAHLIA Construction
          </p>
        </div>
      </div>
    </aside>
  );
}