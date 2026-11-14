import { supabase } from '@/lib/supabase';

export type AppSettings = {
  id: 'global';
  company_name: string;
  company_tagline: string;
  company_logo_url: string | null;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_website: string;
  company_npwp: string;
  company_responsible_name: string;
  company_responsible_title: string;
  default_tax_rate: number;
  default_profit_margin: number;
  default_project_status: 'Draft' | 'Review' | 'Final';
  currency_code: string;
  currency_locale: string;
  price_decimal_places: number;
  document_prefix: string;
  document_title: string;
  document_subtitle: string;
  document_intro: string;
  document_footer: string;
  document_city: string;
  document_signatory_name: string;
  document_signatory_title: string;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'global',
  company_name: 'JavaWasthu Construction',
  company_tagline: 'Perencanaan, Estimasi, dan Konstruksi',
  company_logo_url: null,
  company_address: '',
  company_phone: '',
  company_email: '',
  company_website: '',
  company_npwp: '',
  company_responsible_name: '',
  company_responsible_title: 'Penanggung Jawab',
  default_tax_rate: 11,
  default_profit_margin: 10,
  default_project_status: 'Draft',
  currency_code: 'IDR',
  currency_locale: 'id-ID',
  price_decimal_places: 2,
  document_prefix: 'RAB',
  document_title: 'RENCANA ANGGARAN BIAYA',
  document_subtitle: '',
  document_intro: '',
  document_footer: 'Dokumen ini dibuat menggunakan sistem estimasi JavaWasthu Construction.',
  document_city: '',
  document_signatory_name: '',
  document_signatory_title: '',
};

/** Membaca konfigurasi global. Nilai default dipakai bila baris global belum tersedia. */
export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();

  if (error) throw error;
  return { ...DEFAULT_APP_SETTINGS, ...(data ?? {}), id: 'global' } as AppSettings;
}

/** Nilai ini hanya menjadi default ketika proyek baru dibuat; proyek lama tidak disentuh. */
export async function fetchNewProjectDefaults(): Promise<{
  tax_rate: number;
  profit_margin: number;
  status: 'Draft' | 'Review' | 'Final';
}> {
  const settings = await fetchAppSettings();
  return {
    tax_rate: Number(settings.default_tax_rate ?? DEFAULT_APP_SETTINGS.default_tax_rate),
    profit_margin: Number(settings.default_profit_margin ?? DEFAULT_APP_SETTINGS.default_profit_margin),
    status: settings.default_project_status ?? DEFAULT_APP_SETTINGS.default_project_status,
  };
}

/** Simpan hanya satu baris konfigurasi global. Dibutuhkan sesi Supabase Auth untuk menulis. */
export async function saveAppSettings(
  settings: Omit<AppSettings, 'created_at' | 'updated_at'>,
): Promise<AppSettings> {
  const payload = {
    ...settings,
    id: 'global' as const,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return { ...DEFAULT_APP_SETTINGS, ...(data ?? {}), id: 'global' } as AppSettings;
}
