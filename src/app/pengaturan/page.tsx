'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Calculator, FileText, Database, ShieldCheck,
  Save, Loader2, AlertCircle, CheckCircle2, Upload, Image as ImageIcon,
  Download, FileUp, RefreshCw, Percent, Settings as SettingsIcon, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AppSettings = {
  id: 'global';
  company_name: string;
  company_tagline: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_website: string;
  company_npwp: string;
  company_responsible_name: string;
  company_responsible_title: string;
  company_logo_url: string | null;
  default_tax_rate: number;
  default_profit_margin: number;
  default_project_status: 'Draft' | 'Review' | 'Final';
  currency_code: string;
  currency_locale: string;
  price_decimal_places: number;
  document_prefix: string;
  document_city: string;
  document_title: string;
  document_subtitle: string;
  document_intro: string;
  document_footer: string;
  document_signatory_name: string;
  document_signatory_title: string;
  updated_at: string | null;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'global',
  company_name: 'DAHLIA Construction',
  company_tagline: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_website: '',
  company_npwp: '',
  company_responsible_name: '',
  company_responsible_title: '',
  company_logo_url: null,
  default_tax_rate: 11,
  default_profit_margin: 10,
  default_project_status: 'Draft',
  currency_code: 'IDR',
  currency_locale: 'id-ID',
  price_decimal_places: 0,
  document_prefix: 'RAB',
  document_city: '',
  document_title: 'RENCANA ANGGARAN BIAYA',
  document_subtitle: '',
  document_intro: '',
  document_footer: '',
  document_signatory_name: '',
  document_signatory_title: '',
  updated_at: null,
};

async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();
  if (error) throw error;
  return data ? { ...DEFAULT_APP_SETTINGS, ...data, id: 'global' } as AppSettings : DEFAULT_APP_SETTINGS;
}

async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ ...settings, id: 'global' }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return { ...DEFAULT_APP_SETTINGS, ...data, id: 'global' } as AppSettings;
}

type TabKey = 'company' | 'rab' | 'documents' | 'system';
type TableCheck = { table: string; label: string; ok: boolean; count: number | null; message?: string };

const TABLES_TO_CHECK = [
  { table: 'projects', label: 'Proyek' },
  { table: 'rab_divisions', label: 'Lokasi pekerjaan RAB' },
  { table: 'rab_items', label: 'Item RAB' },
  { table: 'volume_details', label: 'Rincian backup volume' },
  { table: 'master_ahsp', label: 'Master AHSP' },
  { table: 'master_ahsp_components', label: 'Komponen Master AHSP' },
  { table: 'master_ahsp_subitems', label: 'Sub-item Master AHSP' },
  { table: 'master_materials', label: 'Master bahan' },
  { table: 'master_upah', label: 'Master upah' },
  { table: 'master_alat', label: 'Master alat' },
] as const;

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';
const labelClass = 'text-sm font-semibold text-slate-700';

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Terjadi kesalahan yang tidak diketahui.';
}

function validateSettings(value: AppSettings): string | null {
  if (!value.company_name.trim()) return 'Nama perusahaan wajib diisi.';
  if (!Number.isFinite(Number(value.default_tax_rate)) || Number(value.default_tax_rate) < 0 || Number(value.default_tax_rate) > 100) return 'PPN default harus berada di antara 0 sampai 100.';
  if (!Number.isFinite(Number(value.default_profit_margin)) || Number(value.default_profit_margin) < 0 || Number(value.default_profit_margin) > 100) return 'Margin keuntungan default harus berada di antara 0 sampai 100.';
  if (!Number.isInteger(Number(value.price_decimal_places)) || Number(value.price_decimal_places) < 0 || Number(value.price_decimal_places) > 4) return 'Jumlah desimal harga harus 0 sampai 4.';
  if (value.company_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.company_email.trim())) return 'Format email perusahaan tidak valid.';
  if (value.company_website.trim() && !/^https?:\/\//i.test(value.company_website.trim())) return 'Website harus diawali http:// atau https://.';
  return null;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
      <div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabKey>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [checking, setChecking] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [tableChecks, setTableChecks] = useState<TableCheck[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSuccessMessage('');
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [{ data: sessionData, error: sessionError }, loadedSettings] = await Promise.all([
        supabase.auth.getSession(),
        fetchAppSettings(),
      ]);
      if (sessionError) throw sessionError;
      const user = sessionData.session?.user ?? null;
      setAuthEmail(user?.email ?? null);
      setAuthUserId(user?.id ?? null);
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Gagal memuat pengaturan aplikasi:', error);
      setErrorMessage(`Gagal memuat pengaturan. Pastikan SQL migrasi app_settings sudah dijalankan dan policy SELECT tersedia. Detail: ${errorText(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const checkDatabase = async () => {
    setChecking(true);
    setTableChecks([]);
    const checks = await Promise.all(TABLES_TO_CHECK.map(async ({ table, label }) => {
      try {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
        if (error) return { table, label, ok: false, count: null, message: error.message };
        return { table, label, ok: true, count: count ?? 0 };
      } catch (error) {
        return { table, label, ok: false, count: null, message: errorText(error) };
      }
    }));
    setTableChecks(checks);
    setChecking(false);
  };

  const handleSave = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!authUserId) {
      setErrorMessage('Anda belum masuk menggunakan Supabase Auth. Pengaturan boleh dibaca, tetapi perubahan hanya dapat disimpan oleh pengguna yang sudah login.');
      return;
    }
    const validation = validateSettings(settings);
    if (validation) { setErrorMessage(validation); return; }
    setSaving(true);
    try {
      const saved = await saveAppSettings(settings);
      setSettings(saved);
      setSuccessMessage('Pengaturan aplikasi berhasil disimpan ke Supabase. Nilai default baru berlaku untuk proyek yang dibuat setelah ini; proyek lama tidak berubah.');
    } catch (error) {
      console.error('Gagal menyimpan pengaturan:', error);
      setErrorMessage(`Pengaturan belum tersimpan: ${errorText(error)}. Periksa policy UPDATE/INSERT app_settings.`);
    } finally { setSaving(false); }
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    setErrorMessage(''); setSuccessMessage('');
    if (!authUserId) { setErrorMessage('Login Supabase diperlukan untuk mengunggah logo.'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setErrorMessage('Format logo harus PNG, JPG, atau WEBP.'); return; }
    if (file.size > 2 * 1024 * 1024) { setErrorMessage('Ukuran logo maksimal 2 MB.'); return; }
    setUploadingLogo(true);
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `branding/company-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { data, error } = await supabase.storage.from('company-assets').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
      if (error) throw error;
      const { data: publicData } = supabase.storage.from('company-assets').getPublicUrl(data.path);
      updateField('company_logo_url', publicData.publicUrl);
      setSuccessMessage('Logo berhasil diunggah. Tekan Simpan Pengaturan untuk menyimpan alamat logo pada konfigurasi perusahaan.');
    } catch (error) {
      setErrorMessage(`Logo gagal diunggah: ${errorText(error)}. Pastikan bucket company-assets dan policy storage sudah dibuat.`);
    } finally { setUploadingLogo(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), app_settings: settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `backup-pengaturan-DAHLIA-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  const importSettings = async (file?: File) => {
    if (!file) return;
    setErrorMessage(''); setSuccessMessage('');
    try {
      const parsed = JSON.parse(await file.text()) as { app_settings?: Partial<AppSettings> };
      const incoming = parsed.app_settings;
      if (!incoming || typeof incoming !== 'object') throw new Error('Berkas tidak memiliki objek app_settings.');
      const merged = { ...settings, ...incoming, id: 'global' as const };
      const validation = validateSettings(merged);
      if (validation) throw new Error(validation);
      setSettings(merged);
      setSuccessMessage('Konfigurasi dari file dimuat ke formulir. Tekan Simpan Pengaturan untuk menerapkannya ke Supabase.');
    } catch (error) { setErrorMessage(`File konfigurasi tidak dapat dibaca: ${errorText(error)}`); }
    finally { if (restoreInputRef.current) restoreInputRef.current.value = ''; }
  };

  const tabList = useMemo(() => [
    { key: 'company' as const, label: 'Perusahaan', icon: Building2 },
    { key: 'rab' as const, label: 'Standar RAB', icon: Calculator },
    { key: 'documents' as const, label: 'Dokumen', icon: FileText },
    { key: 'system' as const, label: 'Sistem & Database', icon: Database },
  ], []);

  if (loading) return <main className="flex min-h-[70vh] items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600"/><p className="mt-3 text-sm text-slate-500">Memuat pengaturan aplikasi...</p></div></main>;

  return (
    <main className="min-h-screen bg-slate-50/80 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4"/>Kembali ke Dashboard</Link>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700"><SettingsIcon className="h-4 w-4"/>DAHLIA Construction · System Settings</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pengaturan Aplikasi</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Pusat identitas perusahaan, standar awal perhitungan RAB, dan format dokumen untuk seluruh proyek.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadSettings()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/>Muat Ulang</button>
            <button type="button" onClick={handleSave} disabled={saving || !authUserId} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</button>
          </div>
        </header>

        {(errorMessage || successMessage) && <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${errorMessage ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{errorMessage ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<p className="min-w-0 flex-1">{errorMessage || successMessage}</p><button type="button" aria-label="Tutup notifikasi" onClick={() => {setErrorMessage('');setSuccessMessage('');}}>×</button></div>}

        {!authUserId && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Mode baca.</strong> Tidak ada sesi login Supabase yang terdeteksi. Anda tetap dapat melihat konfigurasi dan memeriksa database, tetapi simpan pengaturan serta unggah logo memerlukan akun Supabase Auth yang sudah masuk.</div>}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <nav className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {tabList.map((tab) => { const Icon = tab.icon; const active = activeTab === tab.key; return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-4 w-4 shrink-0"/><span>{tab.label}</span></button>; })}
          </nav>

          <div className="min-w-0 space-y-5">
            {activeTab === 'company' && <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={Building2} title="Identitas Perusahaan" description="Identitas ini menjadi sumber informasi perusahaan untuk kop dan dokumen proyek."/>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label className={labelClass}>Nama perusahaan *</label><input className={inputClass} maxLength={255} value={settings.company_name} onChange={(e) => updateField('company_name', e.target.value)} placeholder="DAHLIA Construction"/></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Tagline</label><input className={inputClass} maxLength={255} value={settings.company_tagline} onChange={(e) => updateField('company_tagline', e.target.value)} placeholder="Perencanaan, Estimasi, dan Konstruksi"/></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Alamat kantor</label><textarea className={inputClass} rows={3} value={settings.company_address} onChange={(e) => updateField('company_address', e.target.value)} placeholder="Alamat lengkap perusahaan"/></div>
                  <div><label className={labelClass}>Nomor telepon / WhatsApp</label><input className={inputClass} value={settings.company_phone} onChange={(e) => updateField('company_phone', e.target.value)} placeholder="08xxxxxxxxxx"/></div>
                  <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={settings.company_email} onChange={(e) => updateField('company_email', e.target.value)} placeholder="email@perusahaan.com"/></div>
                  <div><label className={labelClass}>Website</label><input className={inputClass} value={settings.company_website} onChange={(e) => updateField('company_website', e.target.value)} placeholder="https://..."/></div>
                  <div><label className={labelClass}>NPWP perusahaan</label><input className={inputClass} value={settings.company_npwp} onChange={(e) => updateField('company_npwp', e.target.value)} placeholder="Nomor NPWP"/></div>
                  <div><label className={labelClass}>Nama penanggung jawab</label><input className={inputClass} value={settings.company_responsible_name} onChange={(e) => updateField('company_responsible_name', e.target.value)} placeholder="Nama lengkap"/></div>
                  <div><label className={labelClass}>Jabatan penanggung jawab</label><input className={inputClass} value={settings.company_responsible_title} onChange={(e) => updateField('company_responsible_title', e.target.value)} placeholder="Direktur / Penanggung Jawab"/></div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={ImageIcon} title="Logo Perusahaan" description="Logo disimpan pada Supabase Storage bucket company-assets. Format PNG/JPG/WEBP, maksimal 2 MB."/>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-28 w-44 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">{settings.company_logo_url ? <img src={settings.company_logo_url} alt="Logo perusahaan" className="max-h-full max-w-full object-contain"/> : <div className="text-center text-slate-400"><ImageIcon className="mx-auto h-7 w-7"/><span className="mt-1 block text-xs">Belum ada logo</span></div>}</div>
                  <div className="space-y-2"><input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handleLogoUpload(e.target.files?.[0])}/><button type="button" disabled={uploadingLogo || !authUserId} onClick={() => logoInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}Unggah Logo</button>{settings.company_logo_url && <button type="button" onClick={() => updateField('company_logo_url', null)} className="ml-2 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/>Lepas Logo</button>}<p className="text-xs text-slate-400">Setelah unggah, tekan Simpan Pengaturan agar URL logo tersimpan pada konfigurasi.</p></div>
                </div>
              </section>
            </>}

            {activeTab === 'rab' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle icon={Calculator} title="Standar Perhitungan RAB" description="Parameter berikut dipakai sebagai nilai awal saat membuat proyek baru. Nilai pada proyek yang sudah ada tidak akan diubah."/>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>PPN / Pajak default (%)</label><div className="relative"><input className={`${inputClass} pr-10`} type="number" min="0" max="100" step="0.01" value={settings.default_tax_rate} onChange={(e) => updateField('default_tax_rate', Number(e.target.value))}/><Percent className="absolute right-3 top-4 h-4 w-4 text-slate-400"/></div></div>
                <div><label className={labelClass}>Margin keuntungan default (%)</label><div className="relative"><input className={`${inputClass} pr-10`} type="number" min="0" max="100" step="0.01" value={settings.default_profit_margin} onChange={(e) => updateField('default_profit_margin', Number(e.target.value))}/><Percent className="absolute right-3 top-4 h-4 w-4 text-slate-400"/></div></div>
                <div><label className={labelClass}>Status awal proyek baru</label><select className={inputClass} value={settings.default_project_status} onChange={(e) => updateField('default_project_status', e.target.value as AppSettings['default_project_status'])}><option value="Draft">Draft</option><option value="Review">Review</option><option value="Final">Final</option></select></div>
                <div><label className={labelClass}>Mata uang</label><select className={inputClass} value={settings.currency_code} onChange={(e) => updateField('currency_code', e.target.value)}><option value="IDR">Rupiah (IDR)</option></select></div>
                <div><label className={labelClass}>Locale format</label><select className={inputClass} value={settings.currency_locale} onChange={(e) => updateField('currency_locale', e.target.value)}><option value="id-ID">Indonesia (id-ID)</option></select></div>
                <div><label className={labelClass}>Jumlah angka desimal harga</label><select className={inputClass} value={String(settings.price_decimal_places)} onChange={(e) => updateField('price_decimal_places', Number(e.target.value))}>{[0,1,2,3,4].map((n) => <option key={n} value={n}>{n} digit</option>)}</select></div>
              </div>
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900">Nilai PPN dan margin disimpan pada <code>app_settings</code>, kemudian disalin ke kolom <code>projects.tax_rate</code> dan <code>projects.profit_margin</code> ketika proyek baru dibuat. Mengubah pengaturan global tidak menimpa nilai proyek lama.</div>
            </section>}

            {activeTab === 'documents' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle icon={FileText} title="Template Dokumen" description="Informasi ini disimpan agar dapat dipakai oleh generator Excel/PDF pada tahap penyusunan dokumen."/>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>Prefix nomor dokumen</label><input className={inputClass} maxLength={20} value={settings.document_prefix} onChange={(e) => updateField('document_prefix', e.target.value.toUpperCase())} placeholder="RAB"/></div>
                <div><label className={labelClass}>Kota pada blok pengesahan</label><input className={inputClass} value={settings.document_city} onChange={(e) => updateField('document_city', e.target.value)} placeholder="Ciamis"/></div>
                <div className="sm:col-span-2"><label className={labelClass}>Judul dokumen</label><input className={inputClass} value={settings.document_title} onChange={(e) => updateField('document_title', e.target.value)} placeholder="RENCANA ANGGARAN BIAYA"/></div>
                <div className="sm:col-span-2"><label className={labelClass}>Subjudul / keterangan</label><input className={inputClass} value={settings.document_subtitle} onChange={(e) => updateField('document_subtitle', e.target.value)} placeholder="Dokumen estimasi biaya pekerjaan"/></div>
                <div className="sm:col-span-2"><label className={labelClass}>Pengantar dokumen</label><textarea className={inputClass} rows={3} value={settings.document_intro} onChange={(e) => updateField('document_intro', e.target.value)} placeholder="Keterangan pembuka pada dokumen RAB"/></div>
                <div className="sm:col-span-2"><label className={labelClass}>Catatan / footer</label><textarea className={inputClass} rows={3} value={settings.document_footer} onChange={(e) => updateField('document_footer', e.target.value)} placeholder="Catatan kaki dokumen"/></div>
                <div><label className={labelClass}>Nama penandatangan</label><input className={inputClass} value={settings.document_signatory_name} onChange={(e) => updateField('document_signatory_name', e.target.value)} placeholder="Nama lengkap"/></div>
                <div><label className={labelClass}>Jabatan penandatangan</label><input className={inputClass} value={settings.document_signatory_title} onChange={(e) => updateField('document_signatory_title', e.target.value)} placeholder="Direktur / Estimator"/></div>
              </div>
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Catatan: template telah tersimpan di database, tetapi generator Excel/PDF yang sudah ada perlu membaca konfigurasi ini agar kop, logo, dan footer tampil di file hasil ekspor. Halaman ini tidak mengubah generator secara otomatis.</p>
            </section>}

            {activeTab === 'system' && <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={ShieldCheck} title="Akun & Hak Akses" description="Status sesi Supabase Auth untuk pengguna yang sedang membuka aplikasi."/>
                {authUserId ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4"/>Sesi login aktif</div><p className="mt-2 text-sm text-emerald-900">{authEmail || 'Email tidak tersedia'}</p><p className="mt-1 break-all text-[11px] text-emerald-700">User ID: {authUserId}</p></div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Belum ada sesi login. Gunakan alur login Supabase Auth yang disediakan aplikasi Anda.</div>}
                <p className="mt-3 text-xs leading-5 text-slate-500">Skema yang tersedia dalam konteks proyek belum menunjukkan tabel role/profil pengguna. Karena itu halaman ini tidak membuat atau mengubah akun maupun menetapkan role secara diam-diam. Pembatasan admin/estimator/pengawas harus diterapkan melalui skema user-role dan policy RLS khusus.</p>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={Database} title="Pemeriksaan Integrasi Database" description="Memeriksa akses baca ke tabel-tabel utama yang dipakai modul proyek, RAB, AHSP, katalog, dan backup volume."/>
                <button type="button" onClick={() => void checkDatabase()} disabled={checking} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{checking ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}Periksa Database</button>
                {tableChecks.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Tabel</span><span>Status</span><span>Baris terbaca</span></div>{tableChecks.map((row) => <div key={row.table} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-slate-100 px-4 py-3 text-xs"><div className="min-w-0"><p className="font-semibold text-slate-800">{row.label}</p><p className="text-[10px] text-slate-400">public.{row.table}</p>{row.message && <p className="mt-1 max-w-md break-words text-[10px] text-rose-600">{row.message}</p>}</div><span className={`rounded-full px-2 py-1 font-bold ${row.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{row.ok ? 'Terbaca' : 'Gagal'}</span><strong className="tabular-nums text-slate-700">{row.count === null ? '—' : row.count.toLocaleString('id-ID')}</strong></div>)}</div>}
                <p className="mt-3 text-xs leading-5 text-slate-500">Status “Gagal” dapat berarti tabel belum dibuat, nama tabel berbeda, atau hak SELECT belum diberikan pada role sesi saat ini. Periksa pesan error sebelum menjalankan migrasi tambahan.</p>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={FileUp} title="Backup & Pemulihan Konfigurasi" description="Ekspor/impor file JSON untuk pengaturan aplikasi saja. Ini bukan backup seluruh database proyek dan master."/>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={exportSettings} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4"/>Ekspor Pengaturan JSON</button><input ref={restoreInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importSettings(e.target.files?.[0])}/><button type="button" onClick={() => restoreInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4"/>Muat JSON ke Form</button></div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Setelah memuat file JSON, periksa nilainya dan tekan Simpan Pengaturan. Untuk backup database lengkap, gunakan fitur backup/point-in-time recovery dari dashboard Supabase atau proses backup server-side yang memiliki kredensial aman.</p>
              </section>
            </>}
          </div>
        </div>

        <footer className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"><div className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{settings.company_name}</span>{settings.updated_at ? ` · Terakhir diperbarui ${new Date(settings.updated_at).toLocaleString('id-ID')}` : ' · Konfigurasi belum disimpan'}</div><button type="button" onClick={handleSave} disabled={saving || !authUserId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</button></footer>
      </div>
    </main>
  );
}
