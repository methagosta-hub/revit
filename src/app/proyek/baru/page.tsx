'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  MapPin,
  GraduationCap,
  Users,
  ClipboardList,
  FileText,
  Percent,
  Save,
  Loader2,
  Info,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAppSettings } from '@/lib/services/appSettingsService';
import type { ProjectCategory } from '@/types/rab';

type ProjectForm = {
  title: string;
  client: string;
  location: string;
  school_npsn: string;
  principal_name: string;
  p2sp_chair_name: string;
  planning_consultant: string;
  supervisory_consultant: string;
  project_category: ProjectCategory;
  tax_rate: string;
  profit_margin: string;
};

const initialForm: ProjectForm = {
  title: '',
  client: '',
  location: '',
  school_npsn: '',
  principal_name: '',
  p2sp_chair_name: '',
  planning_consultant: '',
  supervisory_consultant: '',
  project_category: 'REGULER',
  tax_rate: '11',
  profit_margin: '10',
};

const inputClassName =
  'mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';

const labelClassName = 'text-sm font-semibold text-slate-700';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

type SectionHeaderProps = {
  icon: typeof Building2;
  title: string;
  description: string;
  step: string;
};

function SectionHeader({ icon: Icon, title, description, step }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Bagian {step}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function ProjectCreatePage() {
  const router = useRouter();
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [companyName, setCompanyName] = useState('DAHLIA Construction');

  useEffect(() => {
    let active = true;
    void fetchAppSettings()
      .then((appSettings) => {
        if (!active) return;
        setCompanyName(appSettings.company_name || 'DAHLIA Construction');
        setForm((current) => ({
          ...current,
          tax_rate: String(appSettings.default_tax_rate ?? 11),
          profit_margin: String(appSettings.default_profit_margin ?? 10),
        }));
      })
      .catch((error) => {
        // Tetap izinkan proyek dibuat dengan nilai bawaan kolom projects jika
        // konfigurasi global belum tersedia atau tabel app_settings belum dimigrasikan.
        console.warn('Pengaturan global belum dapat dimuat; memakai nilai bawaan proyek:', error);
      });
    return () => { active = false; };
  }, []);

  function updateField<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    const npsn = form.school_npsn.trim();
    if (npsn && !/^\d{8}$/.test(npsn)) {
      setErrorMessage('NPSN harus terdiri dari 8 digit angka.');
      return;
    }

    const taxRate = Number(form.tax_rate);
    const profitMargin = Number(form.profit_margin);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setErrorMessage('Persentase pajak harus berada di antara 0 sampai 100.');
      return;
    }
    if (!Number.isFinite(profitMargin) || profitMargin < 0 || profitMargin > 100) {
      setErrorMessage('Margin keuntungan harus berada di antara 0 sampai 100.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        title: form.title.trim(),
        // Kolom client dipakai untuk nama sekolah atau instansi pemilik proyek.
        client: form.client.trim(),
        location: form.location.trim(),
        school_npsn: npsn || null,
        principal_name: form.principal_name.trim() || null,
        p2sp_chair_name: form.p2sp_chair_name.trim() || null,
        planning_consultant: form.planning_consultant.trim() || null,
        supervisory_consultant: form.supervisory_consultant.trim() || null,
        status: 'DRAFT',
        project_category: form.project_category,
        total_value: 0,
        tax_rate: taxRate,
        profit_margin: profitMargin,
      };

      const { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error('Proyek tersimpan, tetapi ID proyek tidak berhasil dibaca.');

      router.push(`/proyek/${data.id}`);
    } catch (error) {
      console.error('Gagal membuat proyek:', error);
      const message = getErrorMessage(error);
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes('school_npsn') ||
        normalizedMessage.includes('principal_name') ||
        normalizedMessage.includes('p2sp_chair_name') ||
        normalizedMessage.includes('planning_consultant') ||
        normalizedMessage.includes('supervisory_consultant') ||
        normalizedMessage.includes('schema cache')
      ) {
        setErrorMessage(
          'Struktur tabel projects belum diperbarui. Jalankan file SQL migrasi kolom data sekolah dan tim proyek di Supabase SQL Editor, lalu coba simpan kembali.',
        );
      } else {
        setErrorMessage(`Proyek belum berhasil disimpan: ${message}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50/80 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Kembali ke Dashboard
            </Link>
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                {companyName}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Buat Proyek Baru
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Lengkapi identitas pekerjaan, data satuan pendidikan, tim pembangunan, dan parameter anggaran sebelum mulai menyusun RAB.
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3.5 py-2.5 text-xs font-semibold text-emerald-800 shadow-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Data tersimpan di database proyek
          </div>
        </header>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeader
                icon={FileText}
                step="01"
                title="Identitas Proyek"
                description="Informasi utama yang akan digunakan sebagai identitas dokumen RAB dan workspace proyek."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClassName} htmlFor="title">Nama Proyek <span className="text-rose-500">*</span></label>
                  <input
                    id="title"
                    name="title"
                    className={inputClassName}
                    placeholder="Contoh: Revitalisasi SMK Husnul Khotimah"
                    value={form.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    maxLength={255}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName} htmlFor="client">Nama Sekolah / Instansi Pemilik Proyek <span className="text-rose-500">*</span></label>
                  <input
                    id="client"
                    name="client"
                    className={inputClassName}
                    placeholder="Nama sekolah atau instansi"
                    value={form.client}
                    onChange={(event) => updateField('client', event.target.value)}
                    maxLength={255}
                    required
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">Disimpan pada kolom <code>client</code>.</p>
                </div>

                <div>
                  <label className={labelClassName} htmlFor="location">Lokasi Proyek <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                      id="location"
                      name="location"
                      className={`${inputClassName} pl-9`}
                      placeholder="Kecamatan, Kabupaten/Kota, Provinsi"
                      value={form.location}
                      onChange={(event) => updateField('location', event.target.value)}
                      maxLength={255}
                      required
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeader
                icon={GraduationCap}
                step="02"
                title="Data Sekolah & Penanggung Jawab"
                description="Data identitas sekolah serta nama pejabat dan panitia yang bertanggung jawab pada pembangunan."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="school_npsn">Nomor NPSN Sekolah</label>
                  <input
                    id="school_npsn"
                    name="school_npsn"
                    className={inputClassName}
                    placeholder="8 digit angka"
                    value={form.school_npsn}
                    onChange={(event) => updateField('school_npsn', event.target.value.replace(/\D/g, '').slice(0, 8))}
                    inputMode="numeric"
                    maxLength={8}
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">Opsional, isi 8 digit angka sesuai data sekolah.</p>
                </div>

                <div>
                  <label className={labelClassName} htmlFor="principal_name">Nama Kepala Sekolah</label>
                  <input
                    id="principal_name"
                    name="principal_name"
                    className={inputClassName}
                    placeholder="Nama lengkap kepala sekolah"
                    value={form.principal_name}
                    onChange={(event) => updateField('principal_name', event.target.value)}
                    maxLength={255}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClassName} htmlFor="p2sp_chair_name">Ketua Panitia Pembangunan Satuan Pendidikan (P2SP)</label>
                  <input
                    id="p2sp_chair_name"
                    name="p2sp_chair_name"
                    className={inputClassName}
                    placeholder="Nama lengkap Ketua P2SP"
                    value={form.p2sp_chair_name}
                    onChange={(event) => updateField('p2sp_chair_name', event.target.value)}
                    maxLength={255}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeader
                icon={Users}
                step="03"
                title="Konsultan & Tim Teknis"
                description="Cantumkan pihak profesional yang terlibat dalam perencanaan dan pengawasan pekerjaan."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="planning_consultant">Konsultan Perencana</label>
                  <input
                    id="planning_consultant"
                    name="planning_consultant"
                    className={inputClassName}
                    placeholder="Nama konsultan perencana"
                    value={form.planning_consultant}
                    onChange={(event) => updateField('planning_consultant', event.target.value)}
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="supervisory_consultant">Konsultan Pengawas</label>
                  <input
                    id="supervisory_consultant"
                    name="supervisory_consultant"
                    className={inputClassName}
                    placeholder="Nama konsultan pengawas"
                    value={form.supervisory_consultant}
                    onChange={(event) => updateField('supervisory_consultant', event.target.value)}
                    maxLength={255}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeader
                icon={ClipboardList}
                step="04"
                title="Kategori Proyek & Parameter Anggaran"
                description="Pilih REGULER untuk proyek resmi atau PORTOFOLIO untuk simulasi. Proyek baru selalu dimulai dari status DRAFT."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClassName} htmlFor="project_category">Kategori Proyek</label>
                  <select
                    id="project_category"
                    name="project_category"
                    className={inputClassName}
                    value={form.project_category}
                    onChange={(event) => updateField('project_category', event.target.value as ProjectCategory)}
                  >
                    <option value="REGULER">REGULER — proyek resmi perusahaan</option>
                    <option value="PORTOFOLIO">PORTOFOLIO — simulasi / uji coba</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">Proyek baru otomatis dibuat dengan status DRAFT.</p>
                </div>

                <div>
                  <label className={labelClassName} htmlFor="tax_rate">Pajak / PPN</label>
                  <div className="relative">
                    <input
                      id="tax_rate"
                      name="tax_rate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className={`${inputClassName} pr-10`}
                      value={form.tax_rate}
                      onChange={(event) => updateField('tax_rate', event.target.value)}
                      required
                    />
                    <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <label className={labelClassName} htmlFor="profit_margin">Margin Keuntungan</label>
                  <div className="relative">
                    <input
                      id="profit_margin"
                      name="profit_margin"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className={`${inputClassName} pr-10`}
                      value={form.profit_margin}
                      onChange={(event) => updateField('profit_margin', event.target.value)}
                      required
                    />
                    <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                <p className="text-xs leading-5 text-blue-900">
                  Nilai total proyek dimulai dari <strong>Rp 0</strong> dan akan dihitung serta disinkronkan dari total seluruh item RAB.
                </p>
              </div>
            </section>

            {errorMessage && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Proyek belum tersimpan</p>
                  <p className="mt-1 leading-5">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {submitting ? 'Menyimpan Proyek...' : 'Simpan & Mulai Susun RAB'}
              </button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Ringkasan Pengaturan
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Status awal</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700">{form.project_category}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Pajak</span>
                  <strong className="text-slate-800">{form.tax_rate || '0'}%</strong>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Margin</span>
                  <strong className="text-slate-800">{form.profit_margin || '0'}%</strong>
                </div>
                <div className="border-t border-dashed border-slate-200 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nilai RAB saat dibuat</p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">Rp 0</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">Akan berubah mengikuti item pekerjaan yang dimasukkan.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <Info className="h-4 w-4" aria-hidden="true" />
                Sebelum menyimpan
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-emerald-900/80">
                <li>• Nama proyek, sekolah/instansi, dan lokasi wajib diisi.</li>
                <li>• NPSN diisi 8 digit angka jika proyek untuk satuan pendidikan.</li>
                <li>• Data kepala sekolah, Ketua P2SP, serta konsultan dapat dilengkapi atau diperbarui kemudian melalui pengelolaan data proyek.</li>
                <li>• Proyek baru akan dibuat dengan nilai RAB awal Rp 0.</li>
              </ul>
            </div>
          </aside>
        </form>
      </div>
    </main>
  );
}
