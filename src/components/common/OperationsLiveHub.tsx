'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: string | null;
  target_url: string | null;
  read_at: string | null;
  created_at: string;
  priority: 'normal' | 'high' | 'critical';
  metadata: Record<string, unknown> | null;
};

type ActivityRow = {
  id: string;
  event_type: string;
  actor_name: string;
  project_name: string;
  title: string;
  summary: string;
  target_url: string | null;
  created_at: string;
};

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Baru saja';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function notificationTone(priority: NotificationRow['priority']): string {
  if (priority === 'critical') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (priority === 'high') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-white text-slate-700';
}

function getVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const indonesian = voices.filter((voice) => voice.lang.toLowerCase().startsWith('id'));
  return indonesian.find((voice) => /google|natural|online|premium/i.test(voice.name))
    ?? indonesian[0]
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
    ?? null;
}

export default function OperationsLiveHub() {
  const pathname = usePathname();
  const { user, access, loading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [toast, setToast] = useState<NotificationRow | null>(null);
  const [feedStatus, setFeedStatus] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text.trim().slice(0, 1800));
    utterance.lang = 'id-ID';
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 0.95;
    const voice = getVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, []);

  const loadFeeds = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoadingFeed(true);
    setFeedStatus('');
    try {
      const [notificationResult, activityResult] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, title, message, category, target_url, read_at, created_at, priority, metadata')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('activity_feed')
          .select('id, event_type, actor_name, project_name, title, summary, target_url, created_at')
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      if (notificationResult.error) throw notificationResult.error;
      if (activityResult.error) throw activityResult.error;
      setNotifications((notificationResult.data ?? []) as NotificationRow[]);
      setActivities((activityResult.data ?? []) as ActivityRow[]);
    } catch (error) {
      console.error('Gagal memuat pusat aktivitas:', error);
      setFeedStatus('Pusat aktivitas belum dapat diperbarui. Periksa koneksi lalu segarkan kembali.');
    } finally {
      if (!silent) setLoadingFeed(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setActivities([]);
      return;
    }
    void loadFeeds();

    const notificationChannel = supabase
      .channel('dahlia-personal-notifications-' + user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as NotificationRow;
          setNotifications((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 30));
          setToast(incoming);
          const voiceText = String(incoming.metadata?.voice_text ?? incoming.message ?? '');
          if (soundEnabled && voiceText) speak(voiceText);
        } else {
          void loadFeeds(true);
        }
      })
      .subscribe();

    const activityChannel = supabase
      .channel('dahlia-company-activity-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_feed',
      }, (payload) => {
        const incoming = payload.new as ActivityRow;
        setActivities((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 12));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(notificationChannel);
      void supabase.removeChannel(activityChannel);
    };
  }, [user?.id, loadFeeds, soundEnabled, speak]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSoundEnabled(window.localStorage.getItem('dahlia-voice-notifications') === 'enabled');
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 8500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const enableSound = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setFeedStatus('Browser ini belum menyediakan fitur suara. Coba gunakan Chrome atau Edge versi terbaru.');
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.getVoices();
    window.localStorage.setItem('dahlia-voice-notifications', 'enabled');
    setSoundEnabled(true);
    setSoundReady(true);
    speak('Notifikasi suara Dahlia Management telah diaktifkan. Informasi operasional akan disampaikan secara profesional kepada akun yang berwenang.');
  };

  const disableSound = () => {
    window.localStorage.setItem('dahlia-voice-notifications', 'disabled');
    setSoundEnabled(false);
    setSoundReady(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const markRead = async (item: NotificationRow) => {
    if (item.read_at || !user?.id) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row));
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('user_id', user.id);
    if (error) {
      console.error('Gagal memperbarui status notifikasi:', error);
      void loadFeeds(true);
    }
  };

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((row) => row.read_at ? row : { ...row, read_at: readAt }));
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      console.error('Gagal menandai notifikasi:', error);
      void loadFeeds(true);
    }
  };

  if (loading || !user || !access?.profile?.is_active || pathname === '/login') return null;

  return (
    <>
      {toast ? (
        <div className="fixed right-4 top-20 z-[95] w-[min(92vw,390px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/15">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toast.priority === 'critical' ? 'bg-rose-100 text-rose-700' : toast.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <BellRing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Pemberitahuan operasional</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{toast.title}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{toast.message}</p>
              {toast.target_url ? (
                <Link href={toast.target_url} onClick={() => { void markRead(toast); setToast(null); }} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline">
                  Buka tindak lanjut <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
            <button type="button" onClick={() => setToast(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup pemberitahuan">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-12 right-4 z-[90] flex flex-col items-end gap-3">
        {panelOpen ? (
          <section className="flex max-h-[min(72vh,680px)] w-[min(94vw,420px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20" aria-label="Pusat notifikasi pribadi">
            <header className="bg-[#0a1928] p-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-emerald-300">
                    <BellRing className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Dahlia Operations Desk</span>
                  </div>
                  <h2 className="mt-1 text-lg font-extrabold">Pemberitahuan Anda</h2>
                  <p className="mt-1 text-[11px] text-slate-300">Disesuaikan dengan peran dan kewenangan akun aktif.</p>
                </div>
                <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Tutup panel">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-semibold text-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" />
                  Live · {unreadCount} belum dibaca
                </div>
                {unreadCount > 0 ? (
                  <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-200 hover:text-white">
                    <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
                  </button>
                ) : null}
              </div>
            </header>

            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {soundEnabled ? <Volume2 className="h-4 w-4 text-emerald-700" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
                  Notifikasi suara
                </div>
                {soundEnabled ? (
                  <button type="button" onClick={disableSound} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100">Matikan</button>
                ) : (
                  <button type="button" onClick={enableSound} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-800">Aktifkan suara</button>
                )}
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                {soundEnabled
                  ? 'Suara menggunakan voice Bahasa Indonesia yang tersedia di browser/perangkat ini.'
                  : 'Aktifkan sekali melalui tombol ini agar browser mengizinkan penyampaian pemberitahuan suara.'}
              </p>
              {soundReady && soundEnabled ? <p className="mt-1 text-[9px] text-emerald-700">Suara telah diaktifkan pada perangkat ini.</p> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {feedStatus ? <p role="status" className="m-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{feedStatus}</p> : null}
              {loadingFeed && notifications.length === 0 ? (
                <div className="space-y-3 p-4"><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /></div>
              ) : notifications.length ? (
                <div className="divide-y divide-slate-100">
                  {notifications.map((item) => (
                    <article key={item.id} className={`flex gap-3 px-4 py-3.5 transition ${item.read_at ? 'bg-white' : 'bg-emerald-50/45'}`}>
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${notificationTone(item.priority)}`}>
                        {item.priority === 'high' || item.priority === 'critical' ? <CircleAlert className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold leading-5 text-slate-900">{item.title}</p>
                          {!item.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /> : null}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-slate-600">{item.message}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[9px] text-slate-400"><Clock3 className="h-3 w-3" /> {timeLabel(item.created_at)}</span>
                          {item.target_url ? (
                            <Link href={item.target_url} onClick={() => void markRead(item)} className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 hover:underline">
                              Tindak lanjuti <ChevronRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <button type="button" onClick={() => void markRead(item)} className="text-[10px] font-semibold text-slate-500 hover:text-emerald-800">Tandai dibaca</button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-12 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCheck className="h-6 w-6" /></span>
                  <p className="mt-3 text-sm font-bold text-slate-900">Tidak ada tugas yang menunggu</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Pemberitahuan yang relevan dengan kewenangan akun Anda akan muncul di sini.</p>
                </div>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="text-[9px] text-slate-500">Informasi pribadi · sesuai otoritas</span>
              <button type="button" onClick={() => void loadFeeds()} className="text-[10px] font-bold text-emerald-800 hover:underline">Segarkan</button>
            </footer>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-label={panelOpen ? 'Tutup pusat pemberitahuan' : 'Buka pusat pemberitahuan'}
          aria-expanded={panelOpen}
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0a1928] text-white shadow-xl shadow-slate-950/25 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-[#10273b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          {panelOpen ? <X className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          {unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[10px] font-extrabold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </button>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-[80] flex h-10 items-center overflow-hidden border-t border-slate-700/70 bg-[#071321] text-white shadow-[0_-6px_24px_rgba(2,8,23,0.12)]" aria-label="Ticker aktivitas perusahaan">
        <div className="relative z-10 flex h-full shrink-0 items-center gap-2 border-r border-white/10 bg-[#0c2031] px-3">
          <Activity className="h-3.5 w-3.5 text-emerald-300" />
          <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-emerald-100">Aktivitas Live</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          {activities.length ? (
            <div className="dahlia-marquee-track flex w-max items-center gap-8 whitespace-nowrap px-5">
              {[...activities, ...activities].map((item, index) => (
                <Link
                  key={item.id + '-' + index}
                  href={item.target_url || '/dashboard'}
                  className="inline-flex items-center gap-2 text-[10px] text-slate-300 transition hover:text-white"
                  title={item.summary}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <strong className="font-bold text-white">{item.actor_name}</strong>
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-emerald-200">{item.title}</span>
                  <span className="text-slate-400">· {item.project_name}</span>
                  <span className="text-slate-500">{timeLabel(item.created_at)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 text-[10px] text-slate-400">Belum ada aktivitas baru. Aktivitas operasional yang tercatat akan tampil di sini.</div>
          )}
        </div>
        <div className="hidden h-full shrink-0 items-center gap-1.5 border-l border-white/10 px-3 text-[9px] font-semibold text-slate-400 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
        </div>
      </footer>
    </>
  );
}
