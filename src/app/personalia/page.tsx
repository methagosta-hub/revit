'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileText,
  HardHat,
  Network,
  UserRoundCog,
  Users,
  Wallet,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  icon: typeof Users;
  accent: 'emerald' | 'blue' | 'violet' | 'amber';
  action: string;
};

const ACCENT: Record<ModuleCard['accent'], { icon: string; glow: string; tag: string }> = {
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    glow: 'group-hover:border-emerald-200 group-hover:shadow-emerald-950/5',
    tag: 'bg-emerald-50 text-emerald-700',
  },
  blue: {
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    glow: 'group-hover:border-blue-200 group-hover:shadow-blue-950/5',
    tag: 'bg-blue-50 text-blue-700',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    glow: 'group-hover:border-violet-200 group-hover:shadow-violet-950/5',
    tag: 'bg-violet-50 text-violet-700',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    glow: 'group-hover:border-amber-200 group-hover:shadow-amber-950/5',
    tag: 'bg-amber-50 text-amber-700',
  },
};

const groups: { title: string; description: string; cards: ModuleCard[] }[] = [
  {
    title: 'Data karyawan & penempatan',
    description: 'Kelola data induk, unit kerja, dan hubungan penempatan karyawan ke proyek.',
    cards: [
      {
        title: 'Master Karyawan',
        description: 'Data induk karyawan, identitas, jabatan, departemen, status, dan riwayat hubungan kerja.',
        href: '/personalia/karyawan',
        icon: Users,
        accent: 'emerald',
        action: 'Buka data karyawan',
      },
      {
        title: 'Penempatan Utama',
        description: 'Tetapkan unit utama karyawan seperti kantor, gudang, workshop, atau tim lapangan.',
        href: '/personalia/penempatan-utama',
        icon: Building2,
        accent: 'blue',
        action: 'Atur penempatan utama',
      },
      {
        title: 'Tenaga Kerja & Penempatan Proyek',
        description: 'Kelola penempatan karyawan pada proyek untuk periode dan lingkup pekerjaan tertentu.',
        href: '/personalia/tenaga-kerja',
        icon: HardHat,
        accent: 'amber',
        action: 'Kelola tenaga kerja',
      },
    ],
  },
  {
    title: 'Operasional lapangan',
    description: 'Pantau pekerjaan aktual dan kehadiran tenaga kerja di kantor maupun seluruh proyek.',
    cards: [
      {
        title: 'Penugasan Harian',
        description: 'Catat pekerjaan aktual setiap hari, termasuk perpindahan karyawan antarproyek dan unit kerja.',
        href: '/personalia/penugasan-harian',
        icon: ClipboardList,
        accent: 'violet',
        action: 'Buka penugasan harian',
      },
      {
        title: 'Absensi',
        description: 'Input dan pantau kehadiran, jam kerja, status verifikasi, serta rekap pekerja lintas proyek.',
        href: '/personalia/absensi',
        icon: ClipboardCheck,
        accent: 'emerald',
        action: 'Buka monitoring absensi',
      },
    ],
  },
  {
    title: 'Kontrak, kompensasi & penggajian',
    description: 'Atur dasar hak pembayaran dan kelola proses penggajian berdasarkan skema masing-masing karyawan.',
    cards: [
      {
        title: 'Kontrak & Skema Upah',
        description: 'Kelola perjanjian kerja, skema bulanan/harian/per jam/borongan, tarif, komponen, dan jadwal kerja.',
        href: '/personalia/kontrak-upah',
        icon: FileText,
        accent: 'blue',
        action: 'Kelola kontrak & upah',
      },
      {
        title: 'Penggajian',
        description: 'Kelola proses penggajian, rekap pembayaran, dan rincian pendapatan sesuai skema upah.',
        href: '/personalia/penggajian',
        icon: Wallet,
        accent: 'amber',
        action: 'Buka penggajian',
      },
    ],
  },
];

const workflow = [
  { label: 'Data karyawan', detail: 'Siapa yang bekerja', icon: Users },
  { label: 'Penempatan', detail: 'Di unit atau proyek mana', icon: Network },
  { label: 'Penugasan & absensi', detail: 'Apa yang dikerjakan dan kehadirannya', icon: CalendarClock },
  { label: 'Kompensasi & gaji', detail: 'Bagaimana hak pembayaran dihitung', icon: Coins },
];

function DashboardContent() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-10 h-52 w-52 rounded-full border border-white/10" />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            <UserRoundCog className="h-3.5 w-3.5" /> JAVAWASTHU MANAGEMENT
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Dashboard Personalia</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Pusat pengelolaan sumber daya manusia, penempatan tenaga kerja, aktivitas lapangan,
            kehadiran, kontrak, dan penggajian perusahaan.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/personalia/absensi" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-300">
              <ClipboardCheck className="h-4 w-4" /> Monitoring Absensi <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link href="/personalia/karyawan" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              <Users className="h-4 w-4" /> Data Karyawan
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Users className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold tabular-nums text-slate-900">7</p><p className="text-xs text-slate-500">Modul personalia tersedia</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><BriefcaseBusiness className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-900">3 kelompok proses</p><p className="text-xs text-slate-500">Data, operasional, kompensasi</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><BarChart3 className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-900">Satu pusat kendali</p><p className="text-xs text-slate-500">Alur Personalia terhubung</p></div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Alur kerja Personalia</h2>
          <p className="mt-1 text-sm text-slate-500">Gunakan alur ini sebagai panduan pengelolaan data dari awal hingga penggajian.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {workflow.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="relative flex min-h-[94px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-4.5 w-4.5" /></div>
                <div className="min-w-0"><p className="text-sm font-bold text-slate-800">{index + 1}. {item.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      {groups.map((group, groupIndex) => (
        <section key={group.title} className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-700">Kelompok {groupIndex + 1}</p>
              <h2 className="text-lg font-bold text-slate-900">{group.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{group.description}</p>
            </div>
            <span className="text-xs font-medium text-slate-400">{group.cards.length} modul</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.cards.map((card) => {
              const Icon = card.icon;
              const colors = ACCENT[card.accent];
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`group flex min-h-[198px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${colors.glow}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${colors.icon}`}><Icon className="h-5 w-5" /></div>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Buka modul</span>
                  </div>
                  <div className="mt-4 flex-1">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-800">{card.title}</h3>
                    <p className="mt-1.5 text-sm leading-5 text-slate-500">{card.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold text-emerald-700">{card.action}</span>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><FileText className="h-4 w-4" /></div>
          <div>
            <h2 className="text-sm font-bold text-amber-950">Catatan pengelolaan</h2>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              Dashboard ini merupakan pintu masuk ke modul Personalia. Data dan transaksi tetap dikelola pada halaman masing-masing,
              sehingga hak akses, validasi, serta riwayat setiap proses tetap mengikuti aturan modul terkait.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function PagePersonalia() {
  return (
    <RequireAuth permission="personnel.read">
      <DashboardContent />
    </RequireAuth>
  );
}
