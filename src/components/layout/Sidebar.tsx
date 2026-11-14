'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  Home,
  PlusCircle,
  Calculator,
  Settings,
  Layers,
  Package,
  Users,
  Wrench,
} from 'lucide-react';

const navGroups = [
  {
    title: 'Manajemen Proyek',
    items: [
      { name: 'Dashboard', href: '/', icon: Home },
      { name: 'Daftar Proyek', href: '/proyek/daftar', icon: FolderKanban },
      { name: 'Buat Proyek', href: '/proyek/baru', icon: PlusCircle },
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
    title: 'Sistem',
    items: [
      { name: 'Pengaturan & Kop', href: '/pengaturan', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 select-none flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><Layers className="h-4 w-4" /></div>
        <div>
          <span className="block font-bold leading-none tracking-tight text-slate-900">REVIIT<span className="text-emerald-600">SYSTEM</span></span>
          <span className="text-[11px] font-medium text-slate-400">System & Estimator</span>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">Status Sistem</p>
          <p className="mt-0.5 text-[11px] font-medium text-emerald-600">● Server Lokal Aktif</p>
        </div>
      </div>
    </aside>
  );
}
