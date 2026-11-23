'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  Warehouse,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

type ActivityEvent = {
  id: string;
  event_type: string;
  actor_name: string;
  project_name: string;
  title: string;
  summary: string;
  target_url: string | null;
  created_at: string;
};

type PersonalNotification = {
  id: string;
  title: string;
  message: string;
  target_url: string | null;
  read_at: string | null;
  created_at: string;
  priority: 'normal' | 'high' | 'critical';
};

type ModuleKey = 'all' | 'procurement' | 'warehouse' | 'finance' | 'personnel' | 'project' | 'other';
type TimeWindow = '24h' | '7d' | 'all';

const MODULES: Array<{
  key: Exclude<ModuleKey, 'all' | 'other'>;
  name: string;
  description: string;
  href: string;
  accent: string;
  icon: typeof ShoppingCart;
}> = [
  { key: 'procurement', name: 'Pengadaan', description: 'Permintaan material dan alur pembelian', href: '/pengadaan', accent: 'from-amber-400/20 to-orange-500/5 text-amber-200', icon: ShoppingCart },
  { key: 'warehouse', name: 'Gudang', description: 'Pengeluaran material dan risiko stok', href: '/gudang', accent: 'from-cyan-400/20 to-sky-500/5 text-cyan-200', icon: Warehouse },
  { key: 'finance', name: 'Keuangan', description: 'Pengajuan termin dan tindak lanjut pembayaran', href: '/keuangan', accent: 'from-emerald-400/20 to-teal-500/5 text-emerald-200', icon: Wallet },
  { key: 'personnel', name: 'Personalia', description: 'SDM, tenaga kerja, dan administrasi personalia', href: '/personalia', accent: 'from-violet-400/20 to-fuchsia-500/5 text-violet-200', icon: Users },
  { key: 'project', name: 'Proyek', description: 'Aktivitas umum dan koordinasi proyek', href: '/proyek/daftar', accent: 'from-blue-400/20 to-indigo-500/5 text-blue-200', icon: Building2 },
];

function moduleOf(eventType: string): ModuleKey {
  const type = eventType.toLowerCase();
  if (type.startsWith('material_request') || type.includes('purchase') || type.includes('procurement')) return 'procurement';
  if (type === 'warehouse_issue' || type === 'stock_low' || type.includes('warehouse') || type.startsWith('material_receipt')) return 'warehouse';
  if (type.startsWith('subcontract_payment') || type.includes('payment') || type.includes('finance')) return 'finance';
  if (type.includes('personnel') || type.includes('employee') || type.includes('attendance') || type.includes('payroll') || type.includes('hr_')) return 'personnel';
  if (type.includes('project')) return 'project';
  return 'other';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function relativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds)) return 'Baru saja';
  if (seconds < 60) return 'Baru saja';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
}

function eventTone(type: string): string {
  const module = moduleOf(type);
  if (type === 'stock_low') return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  if (module === 'procurement') return 'border-amber-300/25 bg-amber-300/10 text-amber-200';
  if (module === 'warehouse') return 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200';
  if (module === 'finance') return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200';
  if (module === 'personnel') return 'border-violet-300/25 bg-violet-300/10 text-violet-200';
  return 'border-sky-300/25 bg-sky-300/10 text-sky-200';
}

function isWithinWindow(value: string, window: TimeWindow): boolean {
  if (window === 'all') return true;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const horizon = window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return Date.now() - time <= horizon;
}

function Metric({
  label, value, caption, icon: Icon, tone,
}: {
  label: string; value: string | number; caption: string; icon: typeof Activity; tone: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4 shadow-[0_16px_45px_rgba(0,0,0,.12)] backdrop-blur-xl">
      <div className="absolute -right-7 -top-8 h-24 w-24 rounded-full bg-white/[0.035] blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white tabular-nums">{value}</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">{caption}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function ControlTowerContent() {
  const { user, access } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [notifications, setNotifications] = useState<PersonalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [filter, setFilter] = useState<ModuleKey>('all');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(() => new Date());

  const loadData = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [feedResult, notificationResult] = await Promise.all([
        supabase
          .from('activity_feed')
          .select('id,event_type,actor_name,project_name,title,summary,target_url,created_at')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('notifications')
          .select('id,title,message,target_url,read_at,created_at,priority')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (feedResult.error) throw feedResult.error;
      if (notificationResult.error) throw notificationResult.error;
      setEvents((feedResult.data ?? []) as ActivityEvent[]);
      setNotifications((notificationResult.data ?? []) as PersonalNotification[]);
    } catch (err) {
      console.error('Pusat kendali gagal memuat data:', err);
      setError(err instanceof Error ? err.message : 'Data aktivitas belum dapat dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();

    const feedChannel = supabase
      .channel('dahlia-control-tower-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, (payload) => {
        const incoming = payload.new as ActivityEvent;
        setEvents((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 150));
        setConnection('live');
      })
      .subscribe((status) => {
        setConnection(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting');
      });

    const personalChannel = supabase
      .channel('dahlia-control-tower-personal-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id,
      }, () => {
        void loadData(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(feedChannel);
      void supabase.removeChannel(personalChannel);
    };
  }, [user?.id, loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleEvents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return events.filter((event) => {
      const moduleMatch = filter === 'all' || moduleOf(event.event_type) === filter;
      const timeMatch = isWithinWindow(event.created_at, timeWindow);
      const searchMatch = !keyword || [event.title, event.summary, event.actor_name, event.project_name, event.event_type]
        .some((value) => String(value ?? '').toLocaleLowerCase('id').includes(keyword));
      return moduleMatch && timeMatch && searchMatch;
    });
  }, [events, filter, timeWindow, search]);

  const last24h = useMemo(() => events.filter((event) => isWithinWindow(event.created_at, '24h')), [events]);
  const procurementCount = last24h.filter((event) => moduleOf(event.event_type) === 'procurement').length;
  const warehouseCount = last24h.filter((event) => moduleOf(event.event_type) === 'warehouse').length;
  const financeCount = last24h.filter((event) => moduleOf(event.event_type) === 'finance').length;
  const lowStockCount = last24h.filter((event) => event.event_type === 'stock_low').length;
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const isPortfolioAccount = access?.profile?.is_demo_user === true;

  const markRead = async (item: PersonalNotification) => {
    if (!user?.id || item.read_at) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row));
    const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', item.id).eq('user_id', user.id);
    if (updateError) void loadData(true);
  };

  if (isPortfolioAccount) {
    return (
      <main className="min-h-[70vh] p-5 sm:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-9 w-9 text-slate-400" />
          <h1 className="mt-3 text-xl font-extrabold text-slate-900">Pusat Kendali Operasional</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Pusat kendali perusahaan tidak tersedia pada akun portofolio.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#071321] px-3 py-5 text-white sm:px-5 lg:px-7">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[440px] bg-[radial-gradient(ellipse_at_top_right,rgba(13,148,136,0.18),transparent_48%),radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.10),transparent_42%)]" />
      <div className="relative z-10 mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col justify-between gap-4 rounded-3xl border border-white/[0.09] bg-gradient-to-br from-[#10263a] via-[#0a1b2b] to-[#091624] p-5 shadow-[0_22px_70px_rgba(0,0,0,.24)] sm:p-7 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
              <Gauge className="h-4 w-4" /> DAHLIA MANAGEMENT SYSTEM <span className="text-slate-600">/</span> CONTROL TOWER
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl xl:text-4xl">Pusat Kendali Operasional</h1>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400 sm:text-sm">
              Satu ruang pantau untuk aktivitas perusahaan, pergerakan lintas divisi, peringatan operasional, dan tindak lanjut yang memerlukan perhatian.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold ${connection === 'live' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : connection === 'offline' ? 'border-rose-300/25 bg-rose-300/10 text-rose-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
                {connection === 'live' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {connection === 'live' ? 'REALTIME CONNECTED' : connection === 'offline' ? 'RECONNECTING' : 'CONNECTING STREAM'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-slate-400">Akun: {access?.profile?.full_name || user?.email || 'Pengguna'}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 xl:items-end">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left xl:text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Waktu sistem · WIB</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-white tabular-nums">{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(clock)}</p>
              <p className="mt-1 text-[10px] text-slate-400">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(clock)}</p>
            </div>
            <button type="button" onClick={() => void loadData(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Sinkronkan data
            </button>
          </div>
        </header>

        {error ? <div role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-xs leading-5 text-rose-100">Data belum seluruhnya dapat dimuat: {error}. Anda dapat mencoba sinkronisasi kembali.</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indikator aktivitas perusahaan">
          <Metric label="Aktivitas 24 jam" value={loading ? '—' : last24h.length} caption="Dari 150 catatan stream terbaru" icon={Activity} tone="bg-sky-300/10 text-sky-200" />
          <Metric label="Permintaan pengadaan" value={loading ? '—' : procurementCount} caption="Permintaan dan perubahan status" icon={ShoppingCart} tone="bg-amber-300/10 text-amber-200" />
          <Metric label="Aktivitas gudang" value={loading ? '—' : warehouseCount} caption="Pengeluaran dan peringatan stok" icon={Warehouse} tone="bg-cyan-300/10 text-cyan-200" />
          <Metric label="Pengajuan keuangan" value={loading ? '—' : financeCount} caption="Pengajuan termin yang tercatat" icon={Wallet} tone="bg-emerald-300/10 text-emerald-200" />
          <Metric label="Peringatan stok" value={loading ? '—' : lowStockCount} caption="Persediaan di bawah ambang minimum" icon={CircleAlert} tone="bg-rose-300/10 text-rose-200" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.75fr)]">
          <div className="space-y-4">
            <section className="rounded-3xl border border-white/[0.09] bg-white/[0.035] p-4 shadow-xl shadow-black/10 backdrop-blur-xl sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300"><Layers3 className="h-3.5 w-3.5" /> Department overview</div>
                  <h2 className="mt-1 text-lg font-extrabold text-white">Monitor divisi</h2>
                  <p className="mt-1 text-[10px] text-slate-500">Pintasan ke ruang kerja tiap bagian. Indikator mengikuti event yang sudah terhubung ke stream.</p>
                </div>
                <span className="text-[9px] font-semibold text-slate-500">Pembaruan langsung saat event masuk</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {MODULES.map((module) => {
                  const Icon = module.icon;
                  const count = last24h.filter((event) => moduleOf(event.event_type) === module.key).length;
                  const notConnected = module.key === 'personnel' && count === 0;
                  return (
                    <Link key={module.key} href={module.href} className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1d2d] p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-300/25 hover:bg-[#10263a]">
                      <div className="flex items-start gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-gradient-to-br ${module.accent}`}><Icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2"><strong className="text-xs text-white">{module.name}</strong><ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-emerald-200" /></span>
                          <span className="mt-1 block text-[9px] leading-4 text-slate-500">{module.description}</span>
                          <span className="mt-3 flex items-end justify-between gap-2">
                            <strong className="text-xl font-black tabular-nums text-white">{loading ? '—' : notConnected ? '—' : count}</strong>
                            <span className={`text-[8px] font-bold uppercase tracking-wider ${notConnected ? 'text-amber-300' : 'text-emerald-300'}`}>{notConnected ? 'Feed belum terhubung' : 'Event / 24 jam'}</span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.045] px-3 py-2.5 text-[9px] leading-4 text-slate-400">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />
                Aktivitas SDM yang telah terhubung ke stream perusahaan mencakup data karyawan, perjanjian kerja, penugasan, absensi, dan status payroll. Rincian nominal gaji individual tetap dibatasi sesuai hak akses.
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-white/[0.09] bg-white/[0.035] shadow-xl shadow-black/10 backdrop-blur-xl">
              <div className="border-b border-white/[0.07] p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300"><Activity className="h-3.5 w-3.5" /> Live event stream</div>
                    <h2 className="mt-1 text-lg font-extrabold text-white">Rekam jejak aktivitas</h2>
                    <p className="mt-1 text-[10px] text-slate-500">Ringkasan aktivitas bersama yang aman ditampilkan untuk pengguna internal.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="relative block sm:w-60">
                      <span className="sr-only">Cari aktivitas</span>
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari aktivitas atau proyek..." className="w-full rounded-xl border border-white/10 bg-[#071321] py-2.5 pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
                    </label>
                    <select aria-label="Rentang waktu" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value as TimeWindow)} className="rounded-xl border border-white/10 bg-[#071321] px-3 py-2.5 text-[10px] font-semibold text-slate-300 outline-none focus:border-emerald-300/40">
                      <option value="24h">24 jam terakhir</option><option value="7d">7 hari terakhir</option><option value="all">Semua catatan terbaru</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {([
                    ['all', 'Semua'], ['procurement', 'Pengadaan'], ['warehouse', 'Gudang'], ['finance', 'Keuangan'], ['personnel', 'Personalia'], ['project', 'Proyek'],
                  ] as Array<[ModuleKey, string]>).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1.5 text-[9px] font-bold transition ${filter === key ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100' : 'border-white/[0.08] bg-white/[0.025] text-slate-500 hover:border-white/20 hover:text-slate-200'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {loading && events.length === 0 ? (
                <div className="space-y-3 p-5"><div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" /><div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" /><div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" /></div>
              ) : visibleEvents.length ? (
                <div className="divide-y divide-white/[0.055]">
                  {visibleEvents.map((event) => {
                    const eventModule = moduleOf(event.event_type);
                    const moduleName = MODULES.find((module) => module.key === eventModule)?.name ?? 'Aktivitas umum';
                    return (
                      <article key={event.id} className="flex gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:px-5">
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${eventTone(event.event_type)}`}>
                          {event.event_type === 'stock_low' ? <CircleAlert className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-extrabold text-white">{event.title}</p>
                            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">{moduleName}</span>
                            {event.event_type === 'stock_low' ? <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[8px] font-bold text-rose-200">PERLU PERHATIAN</span> : null}
                          </div>
                          <p className="mt-1 text-[10px] leading-5 text-slate-400">{event.summary}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-600">
                            <span>{event.actor_name}</span><span>·</span><span>{event.project_name}</span><span>·</span><span title={formatDate(event.created_at)}>{relativeTime(event.created_at)}</span>
                          </p>
                        </div>
                        {event.target_url ? <Link href={event.target_url} aria-label={`Buka ${event.title}`} className="self-center rounded-lg border border-white/[0.08] p-2 text-slate-500 transition hover:border-emerald-300/20 hover:text-emerald-200"><ArrowUpRight className="h-4 w-4" /></Link> : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-14 text-center">
                  <CalendarClock className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-3 text-sm font-bold text-slate-300">Tidak ada aktivitas pada filter ini</p>
                  <p className="mt-1 text-[10px] text-slate-500">Perluas rentang waktu atau pilih divisi lain untuk melihat catatan yang tersedia.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] bg-black/10 px-4 py-3 text-[9px] text-slate-600 sm:px-5">
                <span>Menampilkan maksimal 150 event terbaru dari activity stream.</span>
                <span>{visibleEvents.length} catatan sesuai filter</span>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-[#103329] via-[#0b2727] to-[#0a1d2b] shadow-xl shadow-black/10">
              <div className="border-b border-white/[0.07] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-200"><Bell className="h-3.5 w-3.5" /> Personal action center</div><span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-200">{unreadCount} belum dibaca</span></div>
                <h2 className="mt-2 text-lg font-extrabold text-white">Tindakan untuk Anda</h2>
                <p className="mt-1 text-[10px] leading-5 text-emerald-50/50">Daftar ini bersifat pribadi dan mengikuti kewenangan akun yang sedang masuk.</p>
              </div>
              {notifications.length ? <div className="divide-y divide-white/[0.06]">
                {notifications.slice(0, 5).map((item) => (
                  <article key={item.id} className={`p-4 ${item.read_at ? '' : 'bg-white/[0.025]'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.priority === 'critical' ? 'bg-rose-400' : item.priority === 'high' ? 'bg-amber-300' : item.read_at ? 'bg-slate-600' : 'bg-emerald-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold leading-5 text-white">{item.title}</p>
                        <p className="mt-1 line-clamp-3 text-[10px] leading-5 text-slate-400">{item.message}</p>
                        <p className="mt-2 text-[9px] text-slate-600">{relativeTime(item.created_at)}</p>
                        {item.target_url ? <Link href={item.target_url} onClick={() => void markRead(item)} className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-200 hover:underline">Buka tindak lanjut <ArrowUpRight className="h-3 w-3" /></Link> : !item.read_at ? <button type="button" onClick={() => void markRead(item)} className="mt-2 text-[9px] font-bold text-slate-400 hover:text-white">Tandai dibaca</button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div> : <div className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-200/50" /><p className="mt-2 text-xs font-bold text-white">Tidak ada tindak lanjut baru</p><p className="mt-1 text-[9px] text-slate-400">Notifikasi sesuai kewenangan akan tampil di panel ini.</p></div>}
              <div className="border-t border-white/[0.07] px-4 py-3"><Link href="/pengaturan" className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-200 hover:underline">Pengaturan notifikasi <ArrowUpRight className="h-3 w-3" /></Link></div>
            </section>

            <section className="rounded-3xl border border-white/[0.09] bg-white/[0.035] p-4 shadow-xl shadow-black/10 sm:p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400"><ShieldCheck className="h-3.5 w-3.5" /> Workspaces</div>
              <h2 className="mt-1 text-base font-extrabold text-white">Akses cepat lintas divisi</h2>
              <div className="mt-4 space-y-2">
                {MODULES.map((module) => {
                  const Icon = module.icon;
                  return <Link key={module.key} href={module.href} className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 transition hover:border-emerald-300/20 hover:bg-white/[0.04]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-slate-300"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><strong className="block text-[10px] text-slate-200">{module.name}</strong><span className="mt-0.5 block truncate text-[9px] text-slate-600">{module.description}</span></span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-emerald-200" />
                  </Link>;
                })}
                <Link href="/perusahaan/audit" className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 transition hover:border-emerald-300/20 hover:bg-white/[0.04]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-slate-300"><ShieldCheck className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-[10px] text-slate-200">Audit Aktivitas</strong><span className="mt-0.5 block text-[9px] text-slate-600">Pemeriksaan log administrasi</span></span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-emerald-200" />
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-sky-300/10 bg-sky-300/[0.035] p-4">
              <div className="flex items-center gap-2 text-sky-200"><Wifi className="h-4 w-4" /><p className="text-[10px] font-bold uppercase tracking-wider">Stream integrity</p></div>
              <p className="mt-2 text-[10px] leading-5 text-slate-400">Pembaruan realtime saat event diterbitkan ke activity_feed. Informasi pribadi tetap berada di pusat notifikasi pengguna dan tidak ditampilkan pada stream bersama.</p>
              <p className="mt-2 flex items-center gap-1 text-[9px] text-slate-600"><Clock3 className="h-3 w-3" /> Sinkronisasi manual tersedia kapan saja</p>
            </section>
          </aside>
        </section>

        <footer className="flex flex-col justify-between gap-2 border-t border-white/[0.08] pt-4 text-[9px] text-slate-600 sm:flex-row">
          <span>DAHLIA CONTROL TOWER · Company Operations Intelligence</span>
          <span>Data stream terintegrasi · {events.length} event terbaru tersimpan pada tampilan</span>
        </footer>
      </div>
    </main>
  );
}

export default function ControlTowerPage() {
  return <RequireAuth><ControlTowerContent /></RequireAuth>;
}
