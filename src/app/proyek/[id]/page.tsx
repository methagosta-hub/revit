'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  MapPin,
  FileSpreadsheet,
  FileText,
  Layers,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Plus,
  Database,
  Copy,
  GripVertical,
  Lock,
  ChevronUp,
  ChevronDown,
  Pencil,
  Download,
  Save,
  X,
} from 'lucide-react';
import AhspPickerModal, {
  type SelectedAhspBatchPayload,
} from '@/components/rab/AhspPickerModal';
import RabTable, {
  type RabTableItem,
  type RabItemUpdate,
  type RabComponentsUpdate,
} from '@/components/rab/RabTable';
import { fetchProjectDetail, recalculateProjectTotal } from '@/lib/services/projectService';
import { generateRABExcel } from '@/lib/excel-generator';
import { formatRupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { getMyAccess, hasPermission } from '@/lib/services/authService';
import type { Project, ProjectCategory } from '@/types/rab';

type RABDivision = {
  id: string;
  name: string;
  code?: string;
  sort_order?: number | null;
  items?: RabTableItem[] | null;
};

type WorkspaceProject = Omit<Project, 'divisions'> & {
  id: string;
  title: string;
  client?: string;
  location?: string;
  status?: string;
  project_category?: ProjectCategory;
  school_npsn?: string | null;
  principal_name?: string | null;
  p2sp_chair_name?: string | null;
  planning_consultant?: string | null;
  supervisory_consultant?: string | null;
  kabupaten_kota?: string | null;
  principal_nip?: string | null;
  planning_consultant_skk?: string | null;
  supervisory_consultant_skk?: string | null;
  tax_rate?: number | string | null;
  profit_margin?: number | string | null;
  divisions?: RABDivision[] | null;
};

type ProjectChoice = {
  id: string;
  title: string;
  client?: string | null;
};

type DivisionDialogState = {
  mode: 'edit' | 'copy' | 'export';
  division: RABDivision;
};


type AhspSubDivision = {
  code: string;
  name: string;
};

type AhspDivisionConfig = {
  code: string;
  name: string;
  subdivisions: AhspSubDivision[];
};

type WorkField = {
  code: string;
  label: string;
  divisions: AhspDivisionConfig[];
};

function makeDivisions(
  rows: [string, string, string[]][],
): AhspDivisionConfig[] {
  return rows.map(([code, name, subdivisions]) => ({
    code,
    name,
    subdivisions: subdivisions.map((subName, index) => ({
      code: String(index + 1).padStart(2, '0'),
      name: subName,
    })),
  }));
}

const WORK_FIELDS: WorkField[] = [
  {
    code: 'BG',
    label: 'Bangunan Gedung dan Perumahan',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Fasilitas dan Administrasi Keselamatan Konstruksi', 'Pengujian, Inspeksi dan Dokumentasi Keselamatan']],
      ['01', 'Persiapan Lapangan / Site Work', [
        'Pekerjaan Persiapan',
        'Galian Tanah',
        'Timbunan dan Pemadatan',
        'Angkutan Material dan/atau Hasil Galian',
        'Geotekstil dan Geomembran',
        'Pekerjaan Pembongkaran',
      ]],
      ['02', 'Pekerjaan Struktur', [
        'Rangka Atap',
        'Struktur Beton',
        'Struktur Baja',
        'Struktur Beton Pracetak',
        'Struktur Beton Prategang',
        'Struktur Kayu',
        'Dinding Penahan Tanah',
        'Pondasi dan Struktur Bawah',
      ]],
      ['03', 'Pekerjaan Arsitektur', [
        'Penutup Atap',
        'Insulasi',
        'Aksesori Atap',
        'Waterproofing',
        'Langit-langit / Plafon',
        'Pekerjaan Dinding',
        'Plesteran dan Acian',
        'Pengecatan dan Pelituran',
        'Penutup Lantai',
        'Penutup Dinding',
        'Pintu dan Jendela',
        'Kaca',
        'Besi dan Aluminium',
        'Kayu',
        'Monumen dan Ornamen',
        'Signage',
        'Fasad',
        'Sanitair',
        'Interior Ruangan',
      ]],
      ['04', 'Pekerjaan Lansekap', [
        'Persiapan Area dan Pengujian Tanah',
        'Pengolahan Tanah dan Media Tanam',
        'Penanaman Pohon dan Palem',
        'Penanaman Semak dan Ground Cover',
        'Penanaman Rumput',
        'Hydroseeding dan Pengendalian Erosi',
        'Penyiraman dan Irigasi Taman',
        'Hardscape dan Elemen Taman',
        'Pemeliharaan Lansekap',
      ]],
      ['05', 'Pekerjaan Mekanikal dan Elektrikal', [
        'Instalasi Listrik dan Panel',
        'Penerangan dan Lampu',
        'Tata Udara / HVAC dan Ventilasi',
        'Transportasi Vertikal',
        'Proteksi Kebakaran',
        'Telekomunikasi, Data dan Keamanan',
        'Instrumentasi dan Kontrol Bangunan',
        'Pengujian dan Commissioning MEP',
      ]],
      ['06', 'Pekerjaan Plambing', [
        'Sistem Air Bersih',
        'Sistem Air Kotor dan Air Limbah',
        'Sistem Air Hujan dan Roof Drain',
        'Sanitair dan Perlengkapan',
        'Tangki, Pompa dan Booster',
        'Pipa, Fitting dan Valve',
        'Pengujian, Flushing dan Commissioning',
      ]],
      ['07', 'Jalan pada Permukiman', [
        'Persiapan dan Tanah Dasar',
        'Lapis Pondasi Agregat',
        'Perkerasan Beton Semen',
        'Perkerasan Aspal',
        'Paving Block dan Perkerasan Modular',
        'Kerb, Bahu dan Pelengkap Jalan',
        'Marka, Rambu dan Perlengkapan Jalan',
      ]],
      ['08', 'Drainase Jalan', [
        'Galian dan Urugan Saluran',
        'Saluran Terbuka',
        'Saluran Tertutup dan Gorong-gorong',
        'Inlet, Bak Kontrol dan Manhole',
        'Outlet, Headwall dan Bangunan Pelengkap',
        'Penutup Saluran dan Aksesori',
      ]],
      ['09', 'Jaringan Pipa di Luar Gedung', [
        'Galian dan Urugan Jalur Pipa',
        'Pasir Alas dan Pelindung Pipa',
        'Pemasangan Pipa dan Sambungan',
        'Fitting, Valve dan Aksesori',
        'Thrust Block, Anchor dan Chamber',
        'Penyeberangan dan Proteksi Pipa',
        'Testing, Flushing dan Commissioning',
      ]],
      ['10', 'Sistem Struktur RISHA', [
        'Produksi Panel RISHA',
        'Pengepakan dan Pengiriman Panel',
        'Perakitan Panel RISHA',
        'Aksesori dan Sambungan RISHA',
      ]],
      ['11', 'Tipologi RISHA', [
        'Rumah Tipe Kecil',
        'Rumah Tipe Menengah',
        'Rumah Tipe Besar',
        'Pengembangan dan Perluasan Tipe',
      ]],
    ]),
  },
  {
    code: 'BM',
    label: 'Bina Marga',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Manajemen Lalu Lintas dan Keselamatan', 'Pengujian dan Dokumentasi']],
      ['01', 'Drainase', ['Galian dan Timbunan Drainase', 'Saluran dan Gorong-gorong', 'Bangunan Pelengkap Drainase']],
      ['02', 'Pekerjaan Tanah dan Geosintetik', ['Pembersihan Lahan', 'Galian Tanah dan Batuan', 'Timbunan dan Pemadatan', 'Geotekstil dan Geomembran', 'Stabilisasi Tanah']],
      ['03', 'Pekerjaan Preventif', ['Patching dan Perbaikan Setempat', 'Pelaburan Permukaan', 'Perawatan Perkerasan']],
      ['04', 'Perkerasan Berbutir dan Beton Semen', ['Lapis Pondasi Agregat', 'Lapis Pondasi Semen', 'Perkerasan Beton Semen', 'Sambungan dan Dowel']],
      ['05', 'Perkerasan Aspal', ['Lapis Resap Pengikat', 'Lapis Perekat', 'Campuran Aspal Panas', 'Campuran Aspal Dingin', 'Pelapisan dan Overlay']],
      ['06', 'Struktur', ['Pondasi Jembatan', 'Struktur Beton', 'Struktur Baja', 'Pasangan Batu', 'Dinding Penahan dan Bronjong']],
      ['07', 'Rehabilitasi Jembatan', ['Perbaikan Struktur', 'Penggantian Elemen', 'Expansion Joint dan Bearing', 'Perlindungan Struktur']],
      ['08', 'Pekerjaan Harian dan Lain-lain', ['Pekerjaan Harian', 'Pekerjaan Minor', 'Pekerjaan Penunjang']],
      ['09', 'Pekerjaan Pemeliharaan', ['Pemeliharaan Rutin', 'Pemeliharaan Berkala', 'Rehabilitasi dan Peningkatan']],
    ]),
  },
  {
    code: 'SDA',
    label: 'Sumber Daya Air',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Pengendalian Lingkungan dan Keselamatan', 'Pengujian dan Dokumentasi']],
      ['01', 'Pintu Air dan Peralatan Hidromekanik', ['Pintu Air', 'Stoplog dan Trash Rack', 'Hoist dan Penggerak', 'Peralatan Hidromekanik-Elektrik']],
      ['02', 'Bendung', ['Tubuh Bendung', 'Mercu dan Lantai', 'Kolam Olak', 'Bangunan Pengambilan dan Pembilas']],
      ['03', 'Jaringan Irigasi', ['Saluran Irigasi', 'Bangunan Bagi dan Sadap', 'Bangunan Ukur', 'Bangunan Pelengkap Jaringan']],
      ['04', 'Pengaman Sungai', ['Tanggul Sungai', 'Perkuatan Tebing', 'Bronjong', 'Normalisasi dan Pengarah Arus']],
      ['05', 'Bendungan dan Embung', ['Pekerjaan Tubuh Bendungan', 'Inti dan Filter', 'Spillway dan Intake', 'Embung dan Kolam Tampung']],
      ['06', 'Pengaman Pantai', ['Bangunan Pengaman Pantai', 'Revetment dan Seawall', 'Pemecah Gelombang', 'Perkuatan dan Perlindungan Pantai']],
      ['07', 'Infrastruktur Rawa', ['Saluran Rawa', 'Pintu dan Bangunan Air', 'Tanggul dan Jalan Inspeksi', 'Pengaturan Tata Air']],
      ['08', 'Infrastruktur Air Tanah dan Air Baku', ['Sumur dan Intake', 'Pengeboran dan Konstruksi Sumur', 'Pipa Transmisi Air Baku', 'Pompa dan Rumah Pompa']],
    ]),
  },
  {
    code: 'SPAM',
    label: 'Sistem Penyediaan Air Minum',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Pengendalian Lingkungan dan Keselamatan']],
      ['01', 'Sumber Air dan Intake', ['Bangunan Intake', 'Penyadapan Air Baku', 'Saringan dan Prasedimentasi']],
      ['02', 'Transmisi Air Baku', ['Pipa Transmisi', 'Valve dan Fitting', 'Bangunan Pelepas Udara dan Penguras']],
      ['03', 'Instalasi Pengolahan Air', ['Koagulasi dan Flokulasi', 'Sedimentasi', 'Filtrasi', 'Desinfeksi dan Pengolahan Kimia']],
      ['04', 'Reservoir dan Rumah Pompa', ['Reservoir', 'Ground Tank dan Elevated Tank', 'Rumah Pompa', 'Pompa dan Panel']],
      ['05', 'Jaringan Distribusi', ['Pipa Distribusi Primer', 'Pipa Distribusi Sekunder', 'Valve dan Fitting', 'Hydrant dan Washout']],
      ['06', 'Sambungan Rumah', ['Pipa Dinas', 'Meter Air', 'Aksesori Sambungan Rumah']],
      ['07', 'Mekanikal, Elektrikal dan Instrumentasi', ['Pompa', 'Panel dan Kelistrikan', 'Flow Meter dan Instrumentasi', 'Sistem Kontrol']],
      ['08', 'Pengujian dan Commissioning', ['Hydrotest', 'Flushing dan Desinfeksi', 'Uji Fungsi dan Commissioning']],
    ]),
  },
  {
    code: 'SPALD',
    label: 'Sistem Pengelolaan Air Limbah Domestik',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Pengendalian Lingkungan dan Keselamatan']],
      ['01', 'Sambungan Rumah', ['Pipa Persil', 'Bak Kontrol Persil', 'Perlengkapan Sambungan']],
      ['02', 'Jaringan Pengumpul Air Limbah', ['Pipa Induk dan Lateral', 'Manhole dan Inspection Chamber', 'Sambungan dan Fitting']],
      ['03', 'Stasiun Pompa dan Perpipaan Tekan', ['Wet Well', 'Pompa Air Limbah', 'Pipa Tekan dan Valve']],
      ['04', 'Instalasi Pengolahan Air Limbah', ['Unit Pra-pengolahan', 'Pengolahan Primer', 'Pengolahan Biologis', 'Pengolahan Lanjutan']],
      ['05', 'Pengolahan Lumpur', ['Sludge Drying Bed', 'Dewatering Lumpur', 'Pengangkutan dan Penanganan Lumpur']],
      ['06', 'Pembuangan dan Pemanfaatan Efluen', ['Pipa Efluen', 'Bangunan Pembuangan', 'Disinfeksi dan Reuse']],
      ['07', 'Mekanikal, Elektrikal dan Instrumentasi', ['Pompa dan Blower', 'Panel dan Kelistrikan', 'Sensor dan Kontrol']],
      ['08', 'Pengujian dan Commissioning', ['Uji Kebocoran', 'Uji Proses', 'Uji Kinerja dan Commissioning']],
    ]),
  },
  {
    code: 'BPS',
    label: 'Bangunan Persampahan (TPA dan TPST)',
    divisions: makeDivisions([
      ['00', 'Umum dan Penerapan SMKK (Kelompok Khusus)', ['Biaya Penerapan SMKK', 'Pengendalian Lingkungan dan Keselamatan']],
      ['01', 'Tempat Pemrosesan Akhir (TPA)', ['Persiapan Lahan dan Cut & Fill', 'Sel Landfill', 'Lapisan Dasar dan Geosintetik', 'Drainase Lindi dan Kolam Pengolahan', 'Pengelolaan Gas Landfill', 'Jalan Operasional dan Fasilitas', 'Penutupan dan Rehabilitasi']],
      ['02', 'Tempat Pengolahan Sampah Terpadu (TPST)', ['Area Penerimaan dan Penimbangan', 'Pemilahan dan Conveyor', 'Pengolahan Sampah Organik / Kompos', 'Pemilahan dan Daur Ulang Anorganik', 'RDF dan Pengolahan Lanjutan', 'Penanganan Residu', 'Bangunan Utilitas dan MEP']],
    ]),
  },
];

type AhspCodeClassification = {
  key: string;
  prefix: string;
  fieldCode: string;
  fieldLabel: string;
  divisionCode: string;
  divisionName: string;
  subdivisionCode: string;
  subdivisionName: string;
  mapped: boolean;
};

type AhspItemGroup = {
  key: string;
  prefix: string;
  classification: AhspCodeClassification;
  items: RabTableItem[];
};

function getAhspCodeClassification(codeValue: string): AhspCodeClassification {
  const parts = String(codeValue || '').trim().toUpperCase().split('.').filter(Boolean);
  const fieldCode = parts[0] || '';
  const divisionCode = parts[1] || '';
  const subdivisionCode = parts[2] || '';
  const field = WORK_FIELDS.find((entry) => entry.code === fieldCode);
  const division = field?.divisions.find((entry) => entry.code === divisionCode);
  const subdivision = division?.subdivisions.find((entry) => entry.code === subdivisionCode);

  const prefix = parts.slice(0, Math.min(parts.length, 3)).join('.');
  const key = prefix || 'TANPA-KODE';

  return {
    key,
    prefix,
    fieldCode,
    fieldLabel: field?.label || (fieldCode ? `Bidang ${fieldCode}` : 'Bidang tidak diketahui'),
    divisionCode,
    divisionName: division?.name || (divisionCode ? `Kelompok ${divisionCode}` : 'Kelompok belum terpetakan'),
    subdivisionCode,
    subdivisionName:
      subdivision?.name ||
      (subdivisionCode ? `Subkelompok ${subdivisionCode}` : 'Subkelompok belum terpetakan'),
    mapped: Boolean(field && division && subdivision),
  };
}

function compareAhspCodes(aValue: string, bValue: string): number {
  const a = String(aValue || '').trim().toUpperCase().split('.');
  const b = String(bValue || '').trim().toUpperCase().split('.');
  const aFieldRank = WORK_FIELDS.findIndex((field) => field.code === a[0]);
  const bFieldRank = WORK_FIELDS.findIndex((field) => field.code === b[0]);

  if (aFieldRank !== -1 && bFieldRank !== -1 && aFieldRank !== bFieldRank) {
    return aFieldRank - bFieldRank;
  }

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? '';
    const right = b[index] ?? '';
    if (left === right) continue;

    const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
    const rightNumber = /^\d+$/.test(right) ? Number(right) : null;

    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    const textCompare = left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' });
    if (textCompare !== 0) return textCompare;
  }
  return 0;
}

function buildAhspItemGroups(items: RabTableItem[]): AhspItemGroup[] {
  const groups = new Map<string, AhspItemGroup>();
  const sortedItems = [...items].sort((left, right) =>
    compareAhspCodes(String(left.code || ''), String(right.code || '')),
  );

  for (const item of sortedItems) {
    const classification = getAhspCodeClassification(String(item.code || ''));
    const existing = groups.get(classification.key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(classification.key, {
        key: classification.key,
        prefix: classification.prefix,
        classification,
        items: [item],
      });
    }
  }

  // Urutan kategori mengikuti sort_order proyek, bukan urutan kode Master AHSP.
  // Jika belum pernah dikustomisasi, urutan kode tetap menjadi fallback awal.
  return Array.from(groups.values()).sort((left, right) => {
    const leftOrder = Math.min(...left.items.map((item) => Number(item.sort_order ?? Number.MAX_SAFE_INTEGER)));
    const rightOrder = Math.min(...right.items.map((item) => Number(item.sort_order ?? Number.MAX_SAFE_INTEGER)));
    return leftOrder - rightOrder || compareAhspCodes(left.prefix, right.prefix);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}


type PdfThemeKey =
  | 'emerald' | 'navy' | 'burgundy' | 'terracotta' | 'slate'
  | 'royalBlue' | 'indigo' | 'teal' | 'cyan' | 'forest'
  | 'olive' | 'amber' | 'orange' | 'coral' | 'rose'
  | 'magenta' | 'violet' | 'plum' | 'charcoal' | 'copper';
type PdfFontKey =
  | 'robotoCondensed' | 'archivoNarrow' | 'barlowCondensed' | 'oswald' | 'ibmPlexSansCondensed'
  | 'inter' | 'interTight' | 'manrope' | 'montserrat' | 'poppins'
  | 'lato' | 'openSans' | 'sourceSans3' | 'workSans' | 'plusJakartaSans'
  | 'dmSans' | 'urbanist' | 'outfit' | 'rubik' | 'nunitoSans'
  | 'spaceGrotesk' | 'firaSans' | 'publicSans' | 'assistant' | 'sora';

const PDF_THEMES: Record<PdfThemeKey, { label: string; accent: string; soft: string; border: string; text: string }> = {
  emerald: { label: 'Emerald Profesional', accent: '#047857', soft: '#ecfdf5', border: '#a7f3d0', text: '#064e3b' },
  navy: { label: 'Navy Korporat', accent: '#1e3a8a', soft: '#eff6ff', border: '#bfdbfe', text: '#172554' },
  burgundy: { label: 'Burgundy Elegan', accent: '#881337', soft: '#fff1f2', border: '#fecdd3', text: '#4c0519' },
  terracotta: { label: 'Terracotta Hangat', accent: '#9a3412', soft: '#fff7ed', border: '#fed7aa', text: '#7c2d12' },
  slate: { label: 'Slate Minimalis', accent: '#334155', soft: '#f1f5f9', border: '#cbd5e1', text: '#0f172a' },
  royalBlue: { label: 'Royal Blue', accent: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  indigo: { label: 'Indigo Modern', accent: '#4338ca', soft: '#eef2ff', border: '#c7d2fe', text: '#312e81' },
  teal: { label: 'Teal Premium', accent: '#0f766e', soft: '#f0fdfa', border: '#99f6e4', text: '#134e4a' },
  cyan: { label: 'Cyan Fresh', accent: '#0e7490', soft: '#ecfeff', border: '#a5f3fc', text: '#164e63' },
  forest: { label: 'Forest Green', accent: '#166534', soft: '#f0fdf4', border: '#bbf7d0', text: '#14532d' },
  olive: { label: 'Olive Earth', accent: '#4d7c0f', soft: '#f7fee7', border: '#d9f99d', text: '#365314' },
  amber: { label: 'Amber Gold', accent: '#b45309', soft: '#fffbeb', border: '#fde68a', text: '#78350f' },
  orange: { label: 'Orange Energetic', accent: '#c2410c', soft: '#fff7ed', border: '#fed7aa', text: '#7c2d12' },
  coral: { label: 'Coral Modern', accent: '#be4b49', soft: '#fff1f0', border: '#fecaca', text: '#7f1d1d' },
  rose: { label: 'Rose Soft', accent: '#be123c', soft: '#fff1f2', border: '#fda4af', text: '#881337' },
  magenta: { label: 'Magenta Bold', accent: '#a21caf', soft: '#fdf4ff', border: '#f5d0fe', text: '#701a75' },
  violet: { label: 'Violet Creative', accent: '#6d28d9', soft: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95' },
  plum: { label: 'Plum Executive', accent: '#7e22ce', soft: '#faf5ff', border: '#e9d5ff', text: '#581c87' },
  charcoal: { label: 'Charcoal Monochrome', accent: '#374151', soft: '#f3f4f6', border: '#d1d5db', text: '#111827' },
  copper: { label: 'Copper Industrial', accent: '#9a3412', soft: '#fdf4ed', border: '#e7bda5', text: '#5c2b18' },
};

const PDF_FONTS: Record<PdfFontKey, { label: string; css: string; family: string; category: string }> = {
  robotoCondensed: { label: 'Roboto Condensed · Narrow', family: 'Roboto Condensed', css: '"Roboto Condensed", Arial, sans-serif', category: 'Narrow' },
  archivoNarrow: { label: 'Archivo Narrow · Narrow', family: 'Archivo Narrow', css: '"Archivo Narrow", Arial, sans-serif', category: 'Narrow' },
  barlowCondensed: { label: 'Barlow Condensed · Extra Narrow', family: 'Barlow Condensed', css: '"Barlow Condensed", Arial, sans-serif', category: 'Narrow' },
  oswald: { label: 'Oswald · Condensed Display', family: 'Oswald', css: 'Oswald, "Arial Narrow", sans-serif', category: 'Narrow' },
  ibmPlexSansCondensed: { label: 'IBM Plex Sans Condensed · Narrow', family: 'IBM Plex Sans Condensed', css: '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif', category: 'Narrow' },
  inter: { label: 'Inter · Modern', family: 'Inter', css: 'Inter, Arial, sans-serif', category: 'Modern' },
  interTight: { label: 'Inter Tight · Compact', family: 'Inter Tight', css: '"Inter Tight", Inter, Arial, sans-serif', category: 'Modern' },
  manrope: { label: 'Manrope · Geometric', family: 'Manrope', css: 'Manrope, Arial, sans-serif', category: 'Modern' },
  montserrat: { label: 'Montserrat · Geometric', family: 'Montserrat', css: 'Montserrat, Arial, sans-serif', category: 'Modern' },
  poppins: { label: 'Poppins · Rounded', family: 'Poppins', css: 'Poppins, Arial, sans-serif', category: 'Modern' },
  lato: { label: 'Lato · Humanist', family: 'Lato', css: 'Lato, Arial, sans-serif', category: 'Modern' },
  openSans: { label: 'Open Sans · Clean', family: 'Open Sans', css: '"Open Sans", Arial, sans-serif', category: 'Modern' },
  sourceSans3: { label: 'Source Sans 3 · Editorial', family: 'Source Sans 3', css: '"Source Sans 3", Arial, sans-serif', category: 'Modern' },
  workSans: { label: 'Work Sans · Technical', family: 'Work Sans', css: '"Work Sans", Arial, sans-serif', category: 'Modern' },
  plusJakartaSans: { label: 'Plus Jakarta Sans · Contemporary', family: 'Plus Jakarta Sans', css: '"Plus Jakarta Sans", Arial, sans-serif', category: 'Modern' },
  dmSans: { label: 'DM Sans · Minimal', family: 'DM Sans', css: '"DM Sans", Arial, sans-serif', category: 'Modern' },
  urbanist: { label: 'Urbanist · Contemporary', family: 'Urbanist', css: 'Urbanist, Arial, sans-serif', category: 'Modern' },
  outfit: { label: 'Outfit · Geometric', family: 'Outfit', css: 'Outfit, Arial, sans-serif', category: 'Modern' },
  rubik: { label: 'Rubik · Rounded', family: 'Rubik', css: 'Rubik, Arial, sans-serif', category: 'Modern' },
  nunitoSans: { label: 'Nunito Sans · Soft', family: 'Nunito Sans', css: '"Nunito Sans", Arial, sans-serif', category: 'Modern' },
  spaceGrotesk: { label: 'Space Grotesk · Tech', family: 'Space Grotesk', css: '"Space Grotesk", Arial, sans-serif', category: 'Modern' },
  firaSans: { label: 'Fira Sans · Technical', family: 'Fira Sans', css: '"Fira Sans", Arial, sans-serif', category: 'Modern' },
  publicSans: { label: 'Public Sans · Official', family: 'Public Sans', css: '"Public Sans", Arial, sans-serif', category: 'Modern' },
  assistant: { label: 'Assistant · Compact', family: 'Assistant', css: 'Assistant, Arial, sans-serif', category: 'Modern' },
  sora: { label: 'Sora · Display', family: 'Sora', css: 'Sora, Arial, sans-serif', category: 'Modern' },
};

const PDF_GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  Object.values(PDF_FONTS)
    .map((font) => `family=${font.family.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&') +
  '&display=swap';

type PdfBoldWeight = 600 | 700 | 800 | 900;

function formatPdfNumber(value: number | string | null | undefined, maximumFractionDigits = 5): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? number.toLocaleString('id-ID', { maximumFractionDigits })
    : '0';
}



export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [canManageRabPermission, setCanManageRabPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfTheme, setPdfTheme] = useState<PdfThemeKey>('emerald');
  const [pdfFont, setPdfFont] = useState<PdfFontKey>('robotoCondensed');
  const [pdfBoldWeight, setPdfBoldWeight] = useState<PdfBoldWeight>(800);
  const activePdfTheme = PDF_THEMES[pdfTheme];

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [activeDivisionName, setActiveDivisionName] = useState('');
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [divisionDialog, setDivisionDialog] = useState<DivisionDialogState | null>(null);
  const [divisionNameDraft, setDivisionNameDraft] = useState('');
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [projectChoices, setProjectChoices] = useState<ProjectChoice[]>([]);
  const [loadingProjectChoices, setLoadingProjectChoices] = useState(false);
  const [divisionActionBusy, setDivisionActionBusy] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [draggingAhspCategory, setDraggingAhspCategory] = useState<string | null>(null);
  const [dragOverAhspCategory, setDragOverAhspCategory] = useState<string | null>(null);

  const loadData = useCallback(async (showRefreshState = false) => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const [data, access] = await Promise.all([fetchProjectDetail(projectId), getMyAccess()]);
      setProject(data ? (data as unknown as WorkspaceProject) : null);
      setCanManageRabPermission(hasPermission(access, 'rab.manage', projectId));
    } catch (error) {
      console.error('Gagal memuat detail proyek:', error);
      setProject(null);
      setErrorMessage(`Gagal memuat data proyek: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canEditRab = canManageRabPermission && ['DRAFT', 'REVIEW'].includes(String(project?.status ?? 'DRAFT'));
  const canManageRab = canManageRabPermission && ['DRAFT', 'REVIEW', 'FINAL RAB'].includes(String(project?.status ?? 'DRAFT'));


  // Memuat keluarga font modern pada halaman agar pratinjau sesuai dengan hasil PDF.
  // PDF tetap memakai fallback sans-serif bila jaringan tidak tersedia.
  useEffect(() => {
    const existing = document.getElementById('pdf-google-fonts') as HTMLLinkElement | null;
    if (existing) return;

    const link = document.createElement('link');
    link.id = 'pdf-google-fonts';
    link.rel = 'stylesheet';
    link.href = PDF_GOOGLE_FONTS_URL;
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, []);


  // Cetak melalui dokumen terpisah berbasis Blob agar tidak mewarisi CSS workspace
  // dan tab cetak tidak memakai URL about:blank.
  const handleExportPdf = () => {
    if (!project) return;

    const report = document.getElementById('rab-print-report');
    if (!report) {
      setErrorMessage('Area laporan PDF tidak ditemukan. Muat ulang halaman lalu coba kembali.');
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const projectHeading = [project.title, project.client, project.kabupaten_kota]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' | ')
      .toLocaleUpperCase('id-ID');
    const exportDateTime = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
    const escapedHeading = escapeHtml(projectHeading || 'RENCANA ANGGARAN BIAYA');
    const escapedDateTime = escapeHtml(exportDateTime);

    // Gunakan hanya satu header: ganti header bawaan laporan dengan header
    // gabungan Nama Pekerjaan | Sekolah | Kabupaten/Kota, bukan menambahkan
    // header baru di atasnya. Judul browser dikosongkan agar tidak mengulang.
    const reportClone = report.cloneNode(true) as HTMLElement;
    reportClone.style.fontFamily = PDF_FONTS[pdfFont].css;
    // Terapkan ketebalan dasar dan bobot tebal yang dipilih, termasuk pada
    // elemen yang sebelumnya menetapkan font-weight secara inline.
    reportClone.style.fontWeight = '400';
    const sourceBoldTargets = [report, ...Array.from(report.querySelectorAll<HTMLElement>('*'))];
    const cloneBoldTargets = [reportClone, ...Array.from(reportClone.querySelectorAll<HTMLElement>('*'))];
    sourceBoldTargets.forEach((sourceElement, index) => {
      const cloneElement = cloneBoldTargets[index];
      if (!cloneElement) return;
      const computedWeight = Number(window.getComputedStyle(sourceElement).fontWeight);
      if (Number.isFinite(computedWeight) && computedWeight >= 600) {
        cloneElement.style.setProperty('font-weight', String(pdfBoldWeight), 'important');
      }
    });

    const reportHeader = reportClone.querySelector(':scope > header');
    if (reportHeader) {
      reportHeader.className = 'pdf-running-header';
      reportHeader.removeAttribute('style');
      reportHeader.innerHTML = `
        <span class="pdf-running-date">${escapedDateTime}</span>
        <strong class="pdf-running-title">${escapedHeading}</strong>
      `;
    }

    // Hilangkan blok tanda tangan/footer laporan dari hasil PDF.
    reportClone.querySelector('.pdf-report-footer')?.remove();
    const reportMarkup = reportClone.outerHTML;
    const isPortfolio = project.project_category === 'PORTOFOLIO';
    const demoWatermark = isPortfolio
      ? '<div class="pdf-demo-watermark" aria-hidden="true">LAPORAN DUMMY/SAMPEL</div>'
      : '';

    const printStyles = `
      @page { size: A4 portrait; margin: 12mm 14mm 13mm; }
      .pdf-demo-watermark {
        position: fixed; z-index: 9999; top: 42%; left: 0; width: 100%;
        transform: rotate(-32deg); text-align: center; pointer-events: none;
        color: #9f1239; opacity: .15; font-size: 28pt; line-height: 1.2;
        font-weight: 900; letter-spacing: 4px; white-space: nowrap;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100%; min-height: 0; background: #fff; }
      body { font-family: ${PDF_FONTS[pdfFont].css}; font-weight: 400; color: #1e293b; font-size: 9pt; line-height: 1.35; }
      .pdf-running-header {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; width: 100%; margin: 0 0 9px; padding: 0 0 5px;
        border-bottom: 1px solid #cbd5e1; color: #64748b;
        font-size: 7pt; line-height: 1.25;
      }
      .pdf-running-date { flex: 0 0 auto; white-space: nowrap; text-align: left; }
      .pdf-running-title {
        display: block; flex: 1 1 auto; margin-left: auto; max-width: 76%;
        color: #334155; text-align: right; font-size: 7.2pt;
        font-weight: ${pdfBoldWeight}; overflow-wrap: anywhere;
      }
      #rab-print-report { display: block !important; position: static !important; width: 100% !important; max-width: none !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; color: #1e293b; }
      #rab-print-report, #rab-print-report * { visibility: visible !important; }
      #rab-print-report section, #rab-print-report header, #rab-print-report footer { overflow: visible !important; }
      #rab-print-report .pdf-rab-table { display: table !important; width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; page-break-inside: auto !important; }
      #rab-print-report .pdf-rab-table thead { display: table-header-group !important; }
      #rab-print-report .pdf-rab-table tbody { display: table-row-group !important; }
      #rab-print-report .pdf-rab-table tr { break-inside: avoid; page-break-inside: avoid; }
      #rab-print-report .pdf-location-section { break-inside: auto; page-break-inside: auto; }
      @media print {
        html, body { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
      }
    `;

    let printUrl = '';
    let printWindow: Window | null = null;
    try {
      const printDocument = `<!doctype html>
        <html lang="id">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title></title>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link rel="stylesheet" href="${PDF_GOOGLE_FONTS_URL}" />
            <style>${printStyles}</style>
          </head>
          <body>${demoWatermark}${reportMarkup}</body>
        </html>`;
      const printBlob = new Blob([printDocument], { type: 'text/html;charset=utf-8' });
      printUrl = URL.createObjectURL(printBlob);
      printWindow = window.open(printUrl, '_blank');

      if (!printWindow) {
        URL.revokeObjectURL(printUrl);
        setErrorMessage('Jendela cetak diblokir browser. Izinkan pop-up untuk localhost:3000 lalu klik Export PDF A4 kembali.');
        return;
      }

      const activePrintWindow = printWindow;
      const activePrintUrl = printUrl;
      let hasStartedPrint = false;
      const startPrint = () => {
        if (hasStartedPrint || activePrintWindow.closed) return;
        hasStartedPrint = true;
        activePrintWindow.document.fonts.ready
          .catch(() => undefined)
          .then(() => {
            window.setTimeout(() => {
              if (activePrintWindow.closed) return;
              activePrintWindow.focus();
              activePrintWindow.print();
            }, 250);
          });
      };

      activePrintWindow.onafterprint = () => activePrintWindow.close();
      activePrintWindow.addEventListener(
        'pagehide',
        () => URL.revokeObjectURL(activePrintUrl),
        { once: true },
      );
      activePrintWindow.onload = () => window.setTimeout(startPrint, 400);
      // Fallback bila event load tidak terpanggil oleh browser tertentu.
      window.setTimeout(startPrint, 1200);
      setErrorMessage('');
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      if (printUrl) URL.revokeObjectURL(printUrl);
      setErrorMessage(`Gagal menyiapkan dokumen PDF: ${getErrorMessage(error)}`);
    }
  };

  const divisions = project?.divisions ?? [];

  const divisionTotals = useMemo(
    () =>
      divisions.map((division) => ({
        id: division.id,
        total: (division.items ?? []).reduce(
          (sum, item) => sum + Number(item.total_price || 0),
          0,
        ),
      })),
    [divisions],
  );

  const totalRAB = useMemo(
    () => divisionTotals.reduce((sum, division) => sum + division.total, 0),
    [divisionTotals],
  );

  // Pajak dan Override menggunakan parameter profil proyek. Nilai 0% sah,
  // sehingga baris tetap ditampilkan meskipun nominalnya Rp0.
  const projectTaxRate = Number(project?.tax_rate ?? 11);
  const projectOverrideRate = Number(project?.profit_margin ?? 10);
  const taxAmount = totalRAB * (projectTaxRate / 100);
  const overrideAmount = totalRAB * (projectOverrideRate / 100);
  const grandTotal = totalRAB + taxAmount + overrideAmount;

  const totalItems = useMemo(
    () => divisions.reduce((sum, division) => {
      const items = division.items ?? [];
      return sum + new Set(items.map((item) => item.work_group_id || item.id)).size;
    }, 0),
    [divisions],
  );

  const totalAhspItems = useMemo(
    () => divisions.reduce((sum, division) => sum + (division.items?.length ?? 0), 0),
    [divisions],
  );

  const openAhspPicker = (divisionId: string, divisionName: string) => {
    setActiveDivisionId(divisionId);
    setActiveDivisionName(divisionName);
    setErrorMessage('');
    setSuccessMessage('');
    setPickerOpen(true);
  };

  // Di database, kelompok lokasi pekerjaan masih disimpan pada tabel
  // rab_divisions agar tetap kompatibel dengan relasi rab_items yang ada.
  const handleCreateLocationAndOpenPicker = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!projectId || creatingLocation) return;

    const locationName = newLocationName.trim();
    if (!locationName) {
      setErrorMessage('Nama lokasi pekerjaan wajib diisi.');
      return;
    }

    setCreatingLocation(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const nextSortOrder =
        divisions.reduce(
          (max, location) => Math.max(max, Number(location.sort_order ?? 0)),
          0,
        ) + 1;

      const locationCode = `DIV-${projectId.slice(0, 8).toUpperCase()}-${String(
        nextSortOrder,
      ).padStart(3, '0')}`;

      const { data: createdLocation, error: createError } = await supabase
        .from('rab_divisions')
        .insert({
          project_id: projectId,
          code: locationCode,
          name: locationName,
          sort_order: nextSortOrder,
        })
        .select('id, code, name, sort_order')
        .single();

      if (createError) throw createError;
      if (!createdLocation?.id) {
        throw new Error('ID lokasi pekerjaan tidak diterima dari database.');
      }

      setActiveDivisionId(createdLocation.id);
      setActiveDivisionName(createdLocation.name || locationName);
      setNewLocationName('');
      setLocationModalOpen(false);

      await loadData(true);
      setSuccessMessage(
        `Lokasi pekerjaan "${createdLocation.name || locationName}" berhasil dibuat. Pilih AHSP untuk mulai menyusun RAB.`,
      );
      setPickerOpen(true);
    } catch (error) {
      console.error('Gagal membuat lokasi pekerjaan:', error);
      setErrorMessage(
        `Gagal membuat lokasi pekerjaan: ${getErrorMessage(error)}`,
      );
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleAddAhsp = async (batch: SelectedAhspBatchPayload) => {
    if (!canEditRab) throw new Error('RAB terkunci pada status proyek saat ini.');
    if (!activeDivisionId || submitting) {
      throw new Error('Lokasi pekerjaan tujuan belum dipilih.');
    }

    if (batch.items.length === 0) {
      throw new Error('Pilih minimal satu AHSP untuk dimasukkan ke RAB.');
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const masterIds = [...new Set(batch.items.map((item) => item.masterAhspId))];
      if (masterIds.length !== batch.items.length) {
        throw new Error('AHSP yang sama terpilih lebih dari sekali. Periksa daftar sebelum menyimpan.');
      }

      // Verifikasi ulang setiap AHSP di database. Kode, uraian, dan satuan
      // tetap bersumber dari Master AHSP, sedangkan harga/komponen disimpan
      // sebagai snapshot RAB proyek.
      const { data: masterRows, error: masterError } = await supabase
        .from('master_ahsp')
        .select('id, code, name, unit')
        .in('id', masterIds);

      if (masterError) throw masterError;
      type MasterAhspIdentity = { id: string; code: string; name: string; unit: string | null };
      const masterById = new Map<string, MasterAhspIdentity>();
      (masterRows ?? []).forEach((row: MasterAhspIdentity) => masterById.set(row.id, row));
      if (masterById.size !== masterIds.length) {
        throw new Error('Sebagian AHSP tidak ditemukan lagi pada Master AHSP. Muat ulang pemilih AHSP dan coba kembali.');
      }

      const currentDivision = divisions.find((division) => division.id === activeDivisionId);
      if (!currentDivision) throw new Error('Lokasi pekerjaan tidak ditemukan. Segarkan proyek lalu coba kembali.');

      // Untuk satu AHSP, uraian pekerjaan mengikuti nama resmi Master AHSP.
      // Kelompok hanya dibuat bila minimal dua AHSP dipilih bersama.
      const groupName = batch.items.length === 1
        ? String(masterById.get(batch.items[0].masterAhspId)?.name ?? batch.items[0].name).trim()
        : batch.groupName.trim();
      if (!groupName) {
        throw new Error('Nama item pekerjaan wajib diisi untuk kelompok yang berisi beberapa AHSP.');
      }
      if (groupName.length > 255) {
        throw new Error('Nama item pekerjaan maksimal 255 karakter.');
      }

      const baseSortOrder = (currentDivision.items ?? []).reduce(
        (max, item) => Math.max(max, Number(item.sort_order ?? 0)),
        0,
      );
      const workGroupId = batch.items.length > 1 ? crypto.randomUUID() : null;

      const insertRows = batch.items.map((payload, index) => {
        const sourceAhsp = masterById.get(payload.masterAhspId);
        const lockedUnit = String(sourceAhsp?.unit ?? '').trim();
        if (!sourceAhsp || !lockedUnit) {
          throw new Error(`AHSP ${payload.code} belum memiliki satuan yang valid di Master AHSP.`);
        }
        if (!Number.isFinite(payload.volume) || payload.volume <= 0) {
          throw new Error(`Volume AHSP ${payload.code} harus lebih besar dari nol.`);
        }
        if (!Number.isFinite(payload.unitPrice) || payload.unitPrice < 0) {
          throw new Error(`Harga satuan AHSP ${payload.code} tidak valid.`);
        }
        const totalPrice = Number((payload.volume * payload.unitPrice).toFixed(2));
        if (!Number.isFinite(totalPrice)) {
          throw new Error(`Total harga AHSP ${payload.code} tidak valid.`);
        }

        return {
          division_id: activeDivisionId,
          master_ahsp_id: sourceAhsp.id,
          code: sourceAhsp.code,
          name: sourceAhsp.name,
          unit: lockedUnit,
          volume: payload.volume,
          unit_price: payload.unitPrice,
          total_price: totalPrice,
          components_snapshot: payload.componentsSnapshot,
          subitems_snapshot: payload.subitemsSnapshot,
          is_volume_from_backup: false,
          sort_order: baseSortOrder + index + 1,
          // Single-AHSP menjadi baris RAB biasa, bukan kelompok induk.
          work_group_id: workGroupId,
          work_group_name: workGroupId ? groupName : null,
        };
      });

      // Satu request INSERT untuk seluruh AHSP dalam kelompok ini.
      // PostgreSQL akan menyimpan semua baris atau membatalkan semuanya.
      const { error: insertError } = await supabase.from('rab_items').insert(insertRows);
      if (insertError) throw insertError;

      if (projectId) await recalculateProjectTotal(projectId);
      await loadData(true);
      setSuccessMessage(
        batch.items.length === 1
          ? `AHSP "${groupName}" berhasil ditambahkan ke lokasi ${activeDivisionName}.`
          : `${batch.items.length} AHSP berhasil disimpan sebagai satu item pekerjaan "${groupName}" pada lokasi ${activeDivisionName}.`,
      );
    } catch (error) {
      console.error('Gagal menambahkan paket AHSP ke RAB:', error);
      setErrorMessage(`Gagal menyimpan paket AHSP: ${getErrorMessage(error)}`);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateItem = async (itemId: string, changes: RabItemUpdate) => {
    if (!canEditRab) throw new Error('Perubahan item RAB hanya tersedia pada status DRAFT atau REVIEW.');
    try {
      const { error } = await supabase
        .from('rab_items')
        .update({
          code: changes.code,
          name: changes.name,
          // Kolom unit tidak disertakan: satuan RAB adalah snapshot terkunci
          // dari Master AHSP ketika item pertama kali dimasukkan.
          volume: changes.volume,
          unit_price: changes.unit_price,
          total_price: changes.total_price,
        })
        .eq('id', itemId);

      if (error) throw error;
      if (projectId) await recalculateProjectTotal(projectId);

      await loadData(true);
      setSuccessMessage('Item RAB berhasil diperbarui. Snapshot AHSP lainnya tetap tidak berubah.');
    } catch (error) {
      console.error('Gagal memperbarui item RAB:', error);
      setErrorMessage(`Gagal memperbarui item RAB: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateComponents = async (itemId: string, changes: RabComponentsUpdate) => {
    if (!canEditRab) throw new Error('Perubahan komponen RAB hanya tersedia pada status DRAFT atau REVIEW.');
    try {
      // Perubahan analisa hanya menyentuh snapshot pada rab_items proyek ini.
      // Tidak ada UPDATE/INSERT ke master_ahsp atau master_ahsp_components.
      const { error } = await supabase
        .from('rab_items')
        .update({
          components_snapshot: changes.components_snapshot,
          subitems_snapshot: changes.subitems_snapshot,
          unit_price: changes.unit_price,
          total_price: changes.total_price,
        })
        .eq('id', itemId);

      if (error) throw error;
      if (projectId) await recalculateProjectTotal(projectId);
      await loadData(true);
      setSuccessMessage('Rincian bahan, upah, alat, koefisien, dan harga berhasil diperbarui pada RAB proyek ini. Master AHSP tidak berubah.');
    } catch (error) {
      console.error('Gagal memperbarui snapshot komponen RAB:', error);
      setErrorMessage(`Gagal memperbarui rincian AHSP proyek: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const handleDeleteItem = async (item: RabTableItem) => {
    if (!canEditRab) throw new Error('Penghapusan item RAB hanya tersedia pada status DRAFT atau REVIEW.');
    try {
      const { error } = await supabase
        .from('rab_items')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      if (projectId) await recalculateProjectTotal(projectId);

      await loadData(true);
      setSuccessMessage(`Item "${item.code}" berhasil dihapus dari RAB proyek.`);
    } catch (error) {
      console.error('Gagal menghapus item RAB:', error);
      setErrorMessage(`Gagal menghapus item RAB: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const handleReorderAhspCategories = async (
    divisionId: string,
    groups: AhspItemGroup[],
    sourceKey: string,
    targetKey: string,
  ) => {
    if (!canManageRab || sourceKey === targetKey) return;
    const fromIndex = groups.findIndex((group) => group.key === sourceKey);
    const toIndex = groups.findIndex((group) => group.key === targetKey);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...groups];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Kirim semua item kategori dalam urutan baru. Database menyimpan urutan
    // secara atomik sehingga PDF, layar RAB, dan Kurva S membaca urutan sama.
    const orderedItemIds = reordered.flatMap((group) =>
      [...group.items]
        .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
        .map((item) => item.id),
    );
    if (orderedItemIds.length === 0) return;
    if (new Set(orderedItemIds).size !== orderedItemIds.length) {
      setErrorMessage('Urutan kategori tidak valid karena ada item RAB ganda.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.rpc('reorder_project_rab_categories', {
        p_division_id: divisionId,
        p_item_ids: orderedItemIds,
      });
      if (error) throw error;
      await loadData(true);
      setSuccessMessage('Urutan kategori pekerjaan berhasil disimpan dan akan digunakan pada ekspor RAB.');
    } catch (error) {
      console.error('Gagal menyimpan urutan kategori RAB:', error);
      setErrorMessage(
        `Gagal menyimpan urutan kategori: ${getErrorMessage(error)}. Pastikan migrasi pengurutan RAB sudah dijalankan.`,
      );
    } finally {
      setDraggingAhspCategory(null);
      setDragOverAhspCategory(null);
    }
  };

  const moveAhspCategory = async (
    divisionId: string,
    groups: AhspItemGroup[],
    groupKey: string,
    direction: -1 | 1,
  ) => {
    const index = groups.findIndex((group) => group.key === groupKey);
    const target = groups[index + direction];
    if (!target) return;
    await handleReorderAhspCategories(divisionId, groups, groupKey, target.key);
  };

  const openDivisionDialog = async (mode: 'edit' | 'copy' | 'export', division: RABDivision) => {
    if (mode !== 'export' && !canEditRab) { setErrorMessage('Data lokasi RAB terkunci pada status proyek saat ini.'); return; }
    setErrorMessage('');
    setSuccessMessage('');
    setDivisionNameDraft(
      mode === 'edit'
        ? division.name
        : mode === 'copy'
          ? `${division.name} (Salinan)`
          : division.name,
    );
    setDivisionDialog({ mode, division });

    if (mode === 'export') {
      setLoadingProjectChoices(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, title, client')
          .neq('id', projectId ?? '')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        const choices = (data ?? []) as ProjectChoice[];
        setProjectChoices(choices);
        setDestinationProjectId(choices[0]?.id ?? '');
        if (choices.length === 0) {
          setErrorMessage('Belum ada proyek tujuan lain. Buat proyek terlebih dahulu untuk menggunakan fitur ekspor lokasi.');
        }
      } catch (error) {
        console.error('Gagal mengambil daftar proyek tujuan:', error);
        setProjectChoices([]);
        setDestinationProjectId('');
        setErrorMessage(`Gagal memuat proyek tujuan: ${getErrorMessage(error)}`);
      } finally {
        setLoadingProjectChoices(false);
      }
    }
  };

  const handleSaveDivisionDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!divisionDialog || divisionActionBusy || !projectId) return;
    const name = divisionNameDraft.trim();
    if (!name) {
      setErrorMessage('Nama lokasi pekerjaan wajib diisi.');
      return;
    }

    setDivisionActionBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { mode, division } = divisionDialog;
      if (mode === 'edit') {
        const { error } = await supabase
          .from('rab_divisions')
          .update({ name })
          .eq('id', division.id);
        if (error) throw error;
        await loadData(true);
        setSuccessMessage(`Nama lokasi berhasil diubah menjadi "${name}".`);
      } else {
        const targetProjectId = mode === 'copy' ? projectId : destinationProjectId;
        if (!targetProjectId) throw new Error('Pilih proyek tujuan terlebih dahulu.');

        const { data: latestDivision, error: orderError } = await supabase
          .from('rab_divisions')
          .select('sort_order')
          .eq('project_id', targetProjectId)
          .order('sort_order', { ascending: false })
          .limit(1);
        if (orderError) throw orderError;
        const nextSortOrder = Number(latestDivision?.[0]?.sort_order ?? 0) + 1;
        const divisionCode = `DIV-${targetProjectId.slice(0, 8).toUpperCase()}-${String(nextSortOrder).padStart(3, '0')}`;

        const { data: newDivision, error: divisionError } = await supabase
          .from('rab_divisions')
          .insert({
            project_id: targetProjectId,
            code: divisionCode,
            name,
            sort_order: nextSortOrder,
          })
          .select('id')
          .single();
        if (divisionError) throw divisionError;
        if (!newDivision?.id) throw new Error('Lokasi salinan tidak memperoleh ID dari database.');

        try {
          const { data: sourceItems, error: itemReadError } = await supabase
            .from('rab_items')
            .select('id, master_ahsp_id, code, name, unit, volume, unit_price, total_price, components_snapshot, subitems_snapshot, work_group_id, work_group_name, is_volume_from_backup, sort_order')
            .eq('division_id', division.id)
            .order('sort_order', { ascending: true });
          if (itemReadError) throw itemReadError;

          const clonedWorkGroupIds = new Map<string, string>();
          for (const sourceItem of sourceItems ?? []) {
            let clonedWorkGroupId: string | null = null;
            if (sourceItem.work_group_id) {
              if (!clonedWorkGroupIds.has(sourceItem.work_group_id)) {
                clonedWorkGroupIds.set(sourceItem.work_group_id, crypto.randomUUID());
              }
              clonedWorkGroupId = clonedWorkGroupIds.get(sourceItem.work_group_id) ?? null;
            }
            const { data: copiedItem, error: copyItemError } = await supabase
              .from('rab_items')
              .insert({
                division_id: newDivision.id,
                master_ahsp_id: sourceItem.master_ahsp_id,
                code: sourceItem.code,
                name: sourceItem.name,
                unit: sourceItem.unit,
                volume: sourceItem.volume,
                unit_price: sourceItem.unit_price,
                total_price: sourceItem.total_price,
                components_snapshot: sourceItem.components_snapshot,
                subitems_snapshot: sourceItem.subitems_snapshot,
                work_group_id: clonedWorkGroupId,
                work_group_name: sourceItem.work_group_name,
                is_volume_from_backup: sourceItem.is_volume_from_backup,
                sort_order: sourceItem.sort_order,
              })
              .select('id')
              .single();
            if (copyItemError) throw copyItemError;
            if (!copiedItem?.id) throw new Error(`Gagal memperoleh ID salinan item ${sourceItem.code}.`);

            // Sertakan rincian backup volume, termasuk jalur sub-item, agar
            // kalkulasi volume pada salinan tetap bisa dibuka dan diedit.
            const { data: volumeRows, error: volumeReadError } = await supabase
              .from('volume_details')
              .select('subitem_path, description, drawing_ref, multiplier, calc_mode, parameters, subtotal')
              .eq('rab_item_id', sourceItem.id);
            if (volumeReadError) throw volumeReadError;
            if (volumeRows?.length) {
              const copiedVolumeRows = volumeRows.map((row) => ({
                rab_item_id: copiedItem.id,
                subitem_path: row.subitem_path,
                description: row.description,
                drawing_ref: row.drawing_ref,
                multiplier: row.multiplier,
                calc_mode: row.calc_mode,
                parameters: row.parameters,
                subtotal: row.subtotal,
              }));
              const { error: volumeInsertError } = await supabase
                .from('volume_details')
                .insert(copiedVolumeRows);
              if (volumeInsertError) throw volumeInsertError;
            }
          }
        } catch (copyError) {
          // Hapus divisi tujuan sebagai rollback sederhana; item yang sudah
          // disalin ikut terhapus melalui FK ON DELETE CASCADE.
          await supabase.from('rab_divisions').delete().eq('id', newDivision.id);
          throw copyError;
        }

        await recalculateProjectTotal(targetProjectId);
        if (targetProjectId === projectId) await loadData(true);
        setSuccessMessage(
          mode === 'copy'
            ? `Lokasi "${division.name}" berhasil disalin menjadi "${name}" beserta item RAB dan backup volumenya.`
            : `Lokasi "${division.name}" berhasil diekspor ke proyek tujuan beserta item RAB dan backup volumenya.`,
        );
      }
      setDivisionDialog(null);
    } catch (error) {
      console.error('Gagal memproses lokasi pekerjaan:', error);
      setErrorMessage(`Gagal memproses lokasi pekerjaan: ${getErrorMessage(error)}`);
    } finally {
      setDivisionActionBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (!project || isExporting) return;

    setIsExporting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await generateRABExcel(project as unknown as Project);
      setSuccessMessage('File Excel RAB berhasil disiapkan.');
    } catch (error) {
      console.error('Gagal mengekspor Excel:', error);
      setErrorMessage(`Gagal mengekspor Excel: ${getErrorMessage(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-slate-500">
            Memuat data Workspace Proyek dari Supabase...
          </p>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Calculator className="h-7 w-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Proyek Tidak Ditemukan</h1>
        <p className="text-sm text-slate-500">
          Dokumen RAB tidak tersedia atau terjadi kendala saat memuat data.
        </p>
        {errorMessage && (
          <p role="alert" className="mx-auto max-w-xl text-sm text-rose-600">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Proyek
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Daftar Proyek
          </Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">
            <Layers className="h-4 w-4" />
            <span>Workspace Proyek · ID: {project.id}</span>
          </div>
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {project.title}
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/proyek/${project.id}/rekap`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
            title="Buka rekap RAB lengkap dan cetak laporan"
          >
            <FileText className="h-4 w-4" />
            Rekap & Cetak PDF
          </Link>
          <Link
            href="/master/ahsp"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Database className="h-4 w-4" />
            Master AHSP
          </Link>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={isExporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {isExporting ? 'Menyiapkan Excel...' : 'Export Excel Profesional'}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-500/20"
            title="Cetak atau simpan laporan RAB sebagai PDF A4 portrait"
          >
            <Download className="h-4 w-4" />
            Export PDF A4
          </button>
        </div>
      </header>

      {project && !canEditRab && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            RAB berstatus <strong>{project.status}</strong> dan dikunci dari perubahan isi. 
            {project.status === 'FINAL RAB' && canManageRab ? ' Urutan kategori masih dapat disesuaikan sebelum proyek dimulai.' : ' Untuk perubahan nilai, kembalikan status proyek ke REVIEW melalui halaman Pengelolaan Proyek.'}
          </p>
        </div>
      )}

      {(errorMessage || successMessage) && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            errorMessage
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {errorMessage ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p className="min-w-0 flex-1">{errorMessage || successMessage}</p>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => {
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="opacity-70 transition hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-slate-400">Klien / Pemilik</p>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Building2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="break-words">{project.client || '-'}</span>
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-slate-400">Lokasi Proyek</p>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="break-words">{project.location || '-'}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Status Dokumen</p>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {project.status || 'DRAFT'}
          </span>
        </div>
        <div className="space-y-1 sm:text-left xl:text-right">
          <p className="text-xs font-medium text-slate-400">Total Akumulasi RAB</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {formatRupiah(totalRAB)}
          </p>
        </div>
      </section>

      <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Pengaturan Tampilan PDF</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Pilih warna dan jenis huruf untuk laporan. Pengaturan ini hanya memengaruhi dokumen PDF, bukan data RAB.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:w-[780px]">
            <label className="block text-xs font-semibold text-slate-600">
              Tema warna · 20 pilihan
              <select
                value={pdfTheme}
                onChange={(event) => setPdfTheme(event.target.value as PdfThemeKey)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {Object.entries(PDF_THEMES).map(([key, theme]) => (
                  <option key={key} value={key}>{theme.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Jenis font · 25 pilihan
              <select
                value={pdfFont}
                onChange={(event) => setPdfFont(event.target.value as PdfFontKey)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                <optgroup label="Narrow / Condensed">
                  {Object.entries(PDF_FONTS).filter(([, font]) => font.category === 'Narrow').map(([key, font]) => (
                    <option key={key} value={key}>{font.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Modern Sans Serif">
                  {Object.entries(PDF_FONTS).filter(([, font]) => font.category === 'Modern').map(([key, font]) => (
                    <option key={key} value={key}>{font.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Ketebalan huruf tebal
              <select
                value={pdfBoldWeight}
                onChange={(event) => setPdfBoldWeight(Number(event.target.value) as PdfBoldWeight)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                <option value={600}>Semibold · 600</option>
                <option value={700}>Bold · 700</option>
                <option value={800}>Extra Bold · 800</option>
                <option value={900}>Black · 900</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: activePdfTheme.border, backgroundColor: activePdfTheme.soft, fontFamily: PDF_FONTS[pdfFont].css, fontWeight: 400 }}>
          <div className="h-10 w-2 shrink-0 rounded-full" style={{ backgroundColor: activePdfTheme.accent }} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: activePdfTheme.accent }}>Pratinjau gaya dokumen</p>
            <p className="mt-0.5 text-sm font-bold" style={{ color: activePdfTheme.text, fontWeight: pdfBoldWeight }}>RENCANA ANGGARAN BIAYA (RAB)</p>
            <p className="text-xs" style={{ color: activePdfTheme.text }}>{PDF_THEMES[pdfTheme].label} · {PDF_FONTS[pdfFont].label} · Bold {pdfBoldWeight}</p>
          </div>
          <span className="rounded-md px-3 py-1.5 text-[10px] font-bold text-white" style={{ backgroundColor: activePdfTheme.accent }}>A4 PORTRAIT</span>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rincian Anggaran Biaya per Lokasi Pekerjaan
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {divisions.length} lokasi pekerjaan · {totalItems} item pekerjaan · {totalAhspItems} AHSP
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {canEditRab && <button
              type="button"
              onClick={() => {
                setNewLocationName('');
                setLocationModalOpen(true);
                setErrorMessage('');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            >
              <Plus className="h-4 w-4" />
              Tambah Lokasi Pekerjaan
            </button>}
            <span className="text-xs text-slate-400">
              Buat satu item pekerjaan, lalu gabungkan beberapa AHSP di dalamnya
            </span>
          </div>
        </div>

        {divisions.length > 0 ? (
          divisions.map((division, divisionIndex) => {
            const divisionTotal =
              divisionTotals.find((entry) => entry.id === division.id)?.total ?? 0;
            const items = division.items ?? [];
            const groupedItemsById = new Map<string, RabTableItem[]>();
            items.forEach((item) => {
              if (!item.work_group_id) return;
              const existing = groupedItemsById.get(item.work_group_id) ?? [];
              existing.push(item);
              groupedItemsById.set(item.work_group_id, existing);
            });
            const groupedWorkItems = Array.from(groupedItemsById.entries())
              .map(([id, groupItems]) => ({
                id,
                name: groupItems.find((item) => item.work_group_name?.trim())?.work_group_name?.trim() || 'Item Pekerjaan',
                items: [...groupItems].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
              }))
              .sort((a, b) => Number(a.items[0]?.sort_order ?? 0) - Number(b.items[0]?.sort_order ?? 0));
            // Kelompok yang hanya berisi satu AHSP diperlakukan seperti item
            // biasa, termasuk data lama yang pernah disimpan dengan group_id.
            const workGroups = groupedWorkItems.filter((group) => group.items.length > 1);
            const singleAhspWorkItems = groupedWorkItems
              .filter((group) => group.items.length === 1)
              .flatMap((group) => group.items);
            const legacyItems = [
              ...items.filter((item) => !item.work_group_id),
              ...singleAhspWorkItems,
            ];
            const ahspGroups = buildAhspItemGroups(legacyItems);
            const workItemCount = new Set(items.map((item) => item.work_group_id || item.id)).size;

            return (
              <article
                key={division.id || divisionIndex}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                      {divisionIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold uppercase tracking-wide text-slate-900">
                        {division.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {workItemCount} item pekerjaan · {items.length} AHSP
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <span className="mr-1 text-sm font-bold tabular-nums text-slate-900">
                      {formatRupiah(divisionTotal)}
                    </span>
                    {canEditRab && <button
                      type="button"
                      onClick={() => openAhspPicker(division.id, division.name)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah Item Pekerjaan
                    </button>}
                    {canEditRab && <button
                      type="button"
                      onClick={() => void openDivisionDialog('edit', division)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      title="Ubah nama lokasi pekerjaan"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>}
                    {canEditRab && <button
                      type="button"
                      onClick={() => void openDivisionDialog('copy', division)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      title="Salin lokasi beserta item RAB"
                    >
                      <Copy className="h-3.5 w-3.5" /> Salin
                    </button>}
                    <button
                      type="button"
                      onClick={() => void openDivisionDialog('export', division)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      title="Ekspor lokasi ke proyek lain"
                    >
                      <Download className="h-3.5 w-3.5" /> Ekspor
                    </button>
                  </div>
                </div>

                {workGroups.length > 0 || ahspGroups.length > 0 ? (
                  <div className="space-y-4 p-3 sm:p-5">
                    {workGroups.map((workGroup) => {
                      const groupTotal = workGroup.items.reduce(
                        (sum, item) => sum + Number(item.total_price || 0),
                        0,
                      );
                      return (
                        <section
                          key={workGroup.id}
                          className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm"
                        >
                          <div className="flex flex-col gap-2 border-b border-indigo-100 bg-indigo-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-slate-900">{workGroup.name}</h4>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <span className="text-xs text-slate-500">Subtotal item pekerjaan</span>
                              <span className="text-sm font-bold tabular-nums text-indigo-900">
                                {formatRupiah(groupTotal)}
                              </span>
                            </div>
                          </div>
                          <RabTable
                            items={workGroup.items}
                            onUpdate={handleUpdateItem}
                            onUpdateComponents={handleUpdateComponents}
                            onDelete={handleDeleteItem}
                            onVolumeUpdated={() => loadData(true)}
                            readOnly={!canEditRab}
                          />
                        </section>
                      );
                    })}

                    {ahspGroups.length > 0 && canManageRab && (
                      <p className="px-1 text-xs text-slate-500">
                        <GripVertical className="mr-1 inline h-3.5 w-3.5" />
                        Seret kategori untuk mengubah urutan pekerjaan. Urutan ini ikut digunakan dalam PDF RAB.
                      </p>
                    )}
                    {ahspGroups.map((group, groupIndex) => {
                      const groupTotal = group.items.reduce(
                        (sum, item) => sum + Number(item.total_price || 0),
                        0,
                      );
                      const dragKey = `${division.id}:${group.key}`;
                      const sortedGroupItems = [...group.items]
                        .sort((left, right) =>
                          compareAhspCodes(String(left.code || ''), String(right.code || '')),
                        )
                        .map((item, index) => ({
                          ...item,
                          sort_order: index + 1,
                        })) as RabTableItem[];

                      return (
                        <section
                          key={group.key}
                          draggable={canManageRab}
                          onDragStart={(event) => {
                            if (!canManageRab) return;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', dragKey);
                            setDraggingAhspCategory(dragKey);
                          }}
                          onDragOver={(event) => {
                            if (!canManageRab || !draggingAhspCategory || draggingAhspCategory === dragKey) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDragOverAhspCategory(dragKey);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const source = event.dataTransfer.getData('text/plain') || draggingAhspCategory;
                            const sourceKey = source?.startsWith(`${division.id}:`)
                              ? source.slice(division.id.length + 1)
                              : null;
                            if (sourceKey && sourceKey !== group.key) {
                              void handleReorderAhspCategories(division.id, ahspGroups, sourceKey, group.key);
                            }
                            setDraggingAhspCategory(null);
                            setDragOverAhspCategory(null);
                          }}
                          onDragEnd={() => {
                            setDraggingAhspCategory(null);
                            setDragOverAhspCategory(null);
                          }}
                          className={`overflow-hidden rounded-xl border bg-white transition ${dragOverAhspCategory === dragKey ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'} ${draggingAhspCategory === dragKey ? 'opacity-50' : ''} ${canManageRab ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        >
                          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                {group.classification.fieldCode} · {group.classification.fieldLabel}
                              </p>
                              <h4 className="mt-1 text-sm font-bold text-slate-900">
                                {group.classification.divisionCode ? `${group.classification.divisionCode} · ` : ''}
                                {group.classification.divisionName}
                              </h4>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>
                                  {group.classification.subdivisionCode ? `${group.classification.subdivisionCode} · ` : ''}
                                  {group.classification.subdivisionName}
                                </span>
                                <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200">
                                  {group.prefix || 'Tanpa kode'}
                                </span>
                                {!group.classification.mapped && (
                                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Belum ada pemetaan kategori
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              {canManageRab && (
                                <div className="flex items-center gap-1">
                                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Urutan</span>
                                  <button
                                    type="button"
                                    aria-label="Naikkan kategori"
                                    title="Naikkan kategori"
                                    disabled={groupIndex === 0}
                                    onClick={() => void moveAhspCategory(division.id, ahspGroups, group.key, -1)}
                                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Turunkan kategori"
                                    title="Turunkan kategori"
                                    disabled={groupIndex === ahspGroups.length - 1}
                                    onClick={() => void moveAhspCategory(division.id, ahspGroups, group.key, 1)}
                                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                  <GripVertical className="ml-1 h-4 w-4 text-slate-400" />
                                </div>
                              )}
                              <span className="text-xs text-slate-500">{group.items.length} AHSP</span>
                              <span className="text-sm font-bold tabular-nums text-slate-800">{formatRupiah(groupTotal)}</span>
                            </div>
                          </div>
                          <RabTable
                            items={sortedGroupItems}
                            onUpdate={handleUpdateItem}
                            onUpdateComponents={handleUpdateComponents}
                            onDelete={handleDeleteItem}
                            onVolumeUpdated={() => loadData(true)}
                            readOnly={!canEditRab}
                          />
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-sm text-slate-400">
                    Belum ada item AHSP pada lokasi ini.
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <Calculator className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-slate-900">
              RAB proyek ini belum dimulai
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Buat lokasi pekerjaan terlebih dahulu. Satu proyek dapat memiliki beberapa lokasi, seperti Ruang Kelas Baru, Toilet, Lapangan, Taman, atau Laboratorium. Setelah lokasi dibuat, Anda akan langsung diarahkan untuk memilih pekerjaan dari Master AHSP.
            </p>
            <button
              type="button"
              onClick={() => {
                setNewLocationName('');
                setLocationModalOpen(true);
                setErrorMessage('');
              }}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            >
              <Plus className="h-4 w-4" />
              Mulai Menyusun RAB
            </button>
            <p className="mt-3 text-xs text-slate-400">
              Langkah pertama: tentukan lokasi pekerjaan yang akan dihitung
            </p>
          </div>
        )}

        {divisions.length > 0 && (
          <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Total keseluruhan RAB
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Akumulasi seluruh subtotal lokasi pekerjaan
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-900">
              {formatRupiah(totalRAB)}
            </p>
          </div>
        )}
      </section>

      {locationModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingLocation) {
              setLocationModalOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <MapPin className="h-5 w-5 text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="location-modal-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Tentukan Lokasi Pekerjaan
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Satu proyek dapat memiliki beberapa lokasi pekerjaan. Setiap lokasi
                  memiliki daftar RAB sendiri.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup"
                disabled={creatingLocation}
                onClick={() => setLocationModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateLocationAndOpenPicker} className="space-y-4">
              <div>
                <label
                  htmlFor="new-work-location"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Nama lokasi pekerjaan
                </label>
                <input
                  id="new-work-location"
                  type="text"
                  autoFocus
                  required
                  maxLength={150}
                  value={newLocationName}
                  onChange={(event) => setNewLocationName(event.target.value)}
                  placeholder="Contoh: Ruang Kelas Baru"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Contoh lokasi: Ruang Kelas Baru, Toilet, Lapangan, Taman, atau Laboratorium.
                </p>
              </div>

              {errorMessage && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={creatingLocation}
                  onClick={() => setLocationModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingLocation || !newLocationName.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  {creatingLocation ? 'Membuat lokasi...' : 'Buat Lokasi & Pilih AHSP'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {divisionDialog && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/55 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="division-action-title"
            className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                {divisionDialog.mode === 'edit' ? <Pencil className="h-5 w-5" /> : divisionDialog.mode === 'copy' ? <Copy className="h-5 w-5" /> : <Download className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="division-action-title" className="text-lg font-bold text-slate-900">
                  {divisionDialog.mode === 'edit' ? 'Edit Lokasi Pekerjaan' : divisionDialog.mode === 'copy' ? 'Salin Lokasi Pekerjaan' : 'Ekspor Lokasi ke Proyek Lain'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {divisionDialog.mode === 'edit'
                    ? 'Ubah nama lokasi. Item RAB dan snapshot analisa tetap melekat pada lokasi ini.'
                    : 'Salinan mencakup item RAB, rincian bahan/upah/alat, snapshot sub-item, serta backup volume. Data Master AHSP tidak diubah.'}
                </p>
              </div>
              <button type="button" aria-label="Tutup" disabled={divisionActionBusy} onClick={() => setDivisionDialog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDivisionDialog} className="space-y-4">
              {divisionDialog.mode === 'export' && (
                <div>
                  <label htmlFor="destination-project" className="mb-2 block text-sm font-semibold text-slate-700">Proyek tujuan</label>
                  {loadingProjectChoices ? (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar proyek...</div>
                  ) : (
                    <select
                      id="destination-project"
                      required
                      value={destinationProjectId}
                      onChange={(event) => setDestinationProjectId(event.target.value)}
                      disabled={projectChoices.length === 0}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    >
                      {projectChoices.length === 0 && <option value="">Tidak ada proyek tujuan</option>}
                      {projectChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>{choice.title}{choice.client ? ` — ${choice.client}` : ''} · ${choice.id}</option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">Pilih proyek lain yang akan menerima salinan lokasi ini.</p>
                </div>
              )}

              <div>
                <label htmlFor="division-name-draft" className="mb-2 block text-sm font-semibold text-slate-700">
                  {divisionDialog.mode === 'edit' ? 'Nama lokasi pekerjaan' : 'Nama lokasi pada salinan'}
                </label>
                <input
                  id="division-name-draft"
                  type="text"
                  required
                  maxLength={255}
                  value={divisionNameDraft}
                  onChange={(event) => setDivisionNameDraft(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {errorMessage && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={divisionActionBusy} onClick={() => setDivisionDialog(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                <button
                  type="submit"
                  disabled={divisionActionBusy || (divisionDialog.mode === 'export' && (loadingProjectChoices || !destinationProjectId)) || !divisionNameDraft.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {divisionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {divisionActionBusy ? 'Memproses...' : divisionDialog.mode === 'edit' ? 'Simpan Nama' : divisionDialog.mode === 'copy' ? 'Salin Lokasi & RAB' : 'Ekspor Lokasi & RAB'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <AhspPickerModal
        open={pickerOpen}
        divisionId={activeDivisionId}
        divisionName={activeDivisionName}
        onClose={() => {
          setPickerOpen(false);
          setActiveDivisionId(null);
          setActiveDivisionName('');
        }}
        onAdd={handleAddAhsp}
      />

      <style jsx global>{`
        #rab-print-report { display: none; }
        /* Area cetak A4: lebar area konten mengikuti margin kiri-kanan halaman. */
        @page { size: A4 portrait; margin: 12mm 14mm 13mm; }
        @media print {
          html, body {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          /* Lepaskan batas workspace layar. Sembunyikan UI, tetapi biarkan
             laporan tetap berada pada alur dokumen normal agar tabel panjang
             dapat dipaginasi oleh browser saat dicetak. */
          main {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          main > :not(#rab-print-report) { display: none !important; }
          body * { visibility: hidden !important; }
          #rab-print-report,
          #rab-print-report * { visibility: visible !important; }
          #rab-print-report {
            display: block !important;
            /* Jangan gunakan absolute/fixed: konten panjang dalam elemen
               absolut sering terpotong saat Chrome membagi halaman PDF. */
            position: static !important;
            inset: auto !important;
            float: none !important;
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          #rab-print-report * { box-sizing: border-box !important; }
          .no-print { display: none !important; }
          #rab-print-report section,
          #rab-print-report header,
          #rab-print-report footer { overflow: visible !important; }
          #rab-print-report .pdf-rab-table {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            page-break-inside: auto !important;
          }
          #rab-print-report .pdf-rab-table thead { display: table-header-group !important; }
          #rab-print-report .pdf-rab-table tbody { display: table-row-group !important; }
          #rab-print-report .pdf-rab-table tr { break-inside: avoid; page-break-inside: avoid; }
          #rab-print-report .pdf-location-section { break-inside: auto; page-break-inside: auto; }
        }
      `}</style>

      <div
        id="rab-print-report"
        aria-hidden="true"
        style={{ fontFamily: PDF_FONTS[pdfFont].css, fontWeight: 400, color: '#1e293b', fontSize: '9pt', lineHeight: 1.35 }}
      >
        <header style={{ display: 'block', width: '100%', textAlign: 'left', borderBottom: `3px solid ${activePdfTheme.accent}`, padding: '0 0 9px', margin: '0 0 12px' }}>
          <p style={{ margin: 0, textAlign: 'left', fontSize: '8pt', fontWeight: 700, letterSpacing: '1.2px', color: activePdfTheme.accent }}>DAHLIA CONSTRUCTION</p>
          <h1 style={{ margin: '4px 0 2px', textAlign: 'left', fontSize: '17pt', lineHeight: 1.15, fontWeight: 800, color: activePdfTheme.text }}>RENCANA ANGGARAN BIAYA</h1>
          <p style={{ margin: 0, textAlign: 'left', fontSize: '8pt', color: '#64748b' }}>Rincian Anggaran Biaya Proyek</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '7.5pt', color: '#64748b' }}>
            <span style={{ display: 'inline-block', padding: '3px 7px', borderRadius: '4px', background: activePdfTheme.soft, color: activePdfTheme.accent, fontWeight: 700 }}>DOKUMEN RAB</span>
            <span>Status: <strong style={{ color: activePdfTheme.text }}>{project.status || 'Draft'}</strong></span>
          </div>
        </header>

        <section style={{ marginBottom: '13px' }}>
          <h2 style={{ margin: '0 0 6px', padding: '5px 7px', background: activePdfTheme.soft, borderLeft: `3px solid ${activePdfTheme.accent}`, color: activePdfTheme.text, fontSize: '9pt', fontWeight: 700 }}>A. IDENTITAS PROYEK</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 14px', padding: '2px 2px' }}>
            {[
              ['Nama Pekerjaan', project.title],
              ['Pemilik / Sekolah / Instansi', project.client || '-'],
              ['NPSN', project.school_npsn || '-'],
              ['Lokasi Proyek', project.location || '-'],
              ['Kabupaten / Kota', project.kabupaten_kota || '-'],
              ['Kepala Sekolah', project.principal_name || '-'],
              ['NIP Kepala Sekolah', project.principal_nip || '-'],
              ['Ketua P2SP', project.p2sp_chair_name || '-'],
              ['Konsultan Perencana', project.planning_consultant || '-'],
              ['No. SKK Perencana', project.planning_consultant_skk || '-'],
              ['Konsultan Pengawas', project.supervisory_consultant || '-'],
              ['No. SKK Pengawas', project.supervisory_consultant_skk || '-'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '5px', borderBottom: '1px solid #e2e8f0', padding: '3px 0' }}>
                <span style={{ color: '#64748b', fontSize: '7.5pt' }}>{label}</span>
                <strong style={{ color: '#1e293b', fontSize: '7.5pt', fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ margin: '0 0 7px', padding: '5px 7px', background: activePdfTheme.soft, borderLeft: `3px solid ${activePdfTheme.accent}`, color: activePdfTheme.text, fontSize: '9pt', fontWeight: 700 }}>B. RINCIAN ANGGARAN BIAYA</h2>
          {divisions.length > 0 ? divisions.map((division, divisionIndex) => {
            const divisionItems = division.items ?? [];
            // PDF menampilkan setiap AHSP pada level uraian yang sama.
            // work_group_id hanya membantu pengelompokan di layar RAB; tidak
            // membuat baris/tahapan induk tambahan di dokumen cetak.
            const groups = buildAhspItemGroups(divisionItems);
            const divisionTotal = divisionItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
            let itemNumber = 0;
            const renderPdfItemRow = (item: RabTableItem) => {
              itemNumber += 1;
              return (
                <tr key={item.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', textAlign: 'center', verticalAlign: 'top' }}>{itemNumber}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', verticalAlign: 'top', overflowWrap: 'anywhere' }}>{item.code || '-'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 4px', verticalAlign: 'top', overflowWrap: 'anywhere', fontWeight: 600 }}>{item.name}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', textAlign: 'center', verticalAlign: 'top' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', textAlign: 'right', verticalAlign: 'top' }}>{formatPdfNumber(item.volume)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{formatRupiah(Number(item.unit_price || 0))}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatRupiah(Number(item.total_price || 0))}</td>
                </tr>
              );
            };
            return (
              <section key={division.id} className="pdf-location-section" style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 5px', padding: '5px 7px', background: '#f8fafc', border: `1px solid ${activePdfTheme.border}`, color: activePdfTheme.text, fontSize: '8.5pt', fontWeight: 700 }}>
                  {`${divisionIndex + 1}. ${division.name}`}
                  {division.code ? <span style={{ marginLeft: '7px', fontSize: '7pt', color: '#64748b', fontWeight: 500 }}>({division.code})</span> : null}
                </h3>
                <table className="pdf-rab-table" style={{ fontSize: '7pt' }}>
                  <colgroup>
                    <col style={{ width: '4%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: activePdfTheme.accent, color: '#fff' }}>
                      {['No', 'Kode', 'Uraian Pekerjaan', 'Sat.', 'Volume', 'Harga Satuan', 'Jumlah Harga'].map((heading) => (
                        <th key={heading} style={{ border: `1px solid ${activePdfTheme.accent}`, padding: '5px 3px', textAlign: heading === 'No' || heading === 'Sat.' ? 'center' : 'left', fontWeight: 700 }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <Fragment key={group.key}>
                        <tr>
                          <td colSpan={7} style={{ padding: '4px 5px', border: '1px solid #cbd5e1', background: activePdfTheme.soft, color: activePdfTheme.text, fontWeight: 700, fontSize: '6.8pt' }}>
                            {group.classification.subdivisionName}
                          </td>
                        </tr>
                        {group.items.map(renderPdfItemRow)}
                      </Fragment>
                    ))}
                    {groups.length === 0 && (
                      <tr><td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '7px', textAlign: 'center', color: '#64748b' }}>Belum ada item RAB pada lokasi ini.</td></tr>
                    )}
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                      <td colSpan={6} style={{ border: '1px solid #cbd5e1', padding: '5px', textAlign: 'right', color: activePdfTheme.text }}>JUMLAH LOKASI</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px 3px', textAlign: 'right', whiteSpace: 'nowrap', color: activePdfTheme.text }}>{formatRupiah(divisionTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            );
          }) : (
            <p style={{ padding: '14px', textAlign: 'center', color: '#64748b', border: '1px dashed #cbd5e1' }}>Belum ada rincian RAB pada proyek ini.</p>
          )}
        </section>

        <section style={{ marginTop: '10px', borderTop: `2px solid ${activePdfTheme.accent}`, paddingTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '78%', maxWidth: '132mm', marginLeft: 'auto', color: '#334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 7px', borderBottom: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
              <strong style={{ color: activePdfTheme.text }}>JUMLAH</strong>
              <strong style={{ whiteSpace: 'nowrap' }}>{formatRupiah(totalRAB)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 7px', borderBottom: '1px solid #e2e8f0', fontSize: '8pt' }}>
              <span>Pajak ({formatPdfNumber(projectTaxRate, 2)}%)</span>
              <span style={{ whiteSpace: 'nowrap' }}>{formatRupiah(taxAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 7px', borderBottom: '1px solid #e2e8f0', fontSize: '8pt' }}>
              <span>Override ({formatPdfNumber(projectOverrideRate, 2)}%)</span>
              <span style={{ whiteSpace: 'nowrap' }}>{formatRupiah(overrideAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '5px', padding: '8px 7px', background: activePdfTheme.soft, border: `1px solid ${activePdfTheme.border}`, color: activePdfTheme.text }}>
              <strong style={{ fontSize: '10pt' }}>JUMLAH TOTAL</strong>
              <strong style={{ color: activePdfTheme.accent, fontSize: '12pt', whiteSpace: 'nowrap' }}>{formatRupiah(grandTotal)}</strong>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
