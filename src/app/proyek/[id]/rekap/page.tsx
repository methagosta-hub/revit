'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Loader2, AlertCircle, Printer } from 'lucide-react';
import { fetchProjectDetail } from '@/lib/services/projectService';
import { formatRupiah } from '@/lib/format';
import type { Project } from '@/types/rab';

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

type PdfBoldWeight = 600 | 700 | 800 | 900;
const PDF_GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  Object.values(PDF_FONTS)
    .map((font) => `family=${font.family.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&') +
  '&display=swap';

type JsonRecord = Record<string, unknown>;
type SnapshotComponent = {
  name: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  subtotal: number;
  type: 'material' | 'labor' | 'equipment' | 'other';
  raw: JsonRecord;
};
type RABItem = {
  id: string;
  code?: string | null;
  name: string;
  unit?: string | null;
  volume: number;
  unit_price: number;
  total_price: number;
  sort_order?: number | null;
  work_group_id?: string | null;
  work_group_name?: string | null;
  components_snapshot?: unknown;
  subitems_snapshot?: unknown;
};
type RABDivision = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  items?: RABItem[] | null;
};
type RekapProject = Omit<Project, 'divisions'> & {
  id: string;
  title: string;
  client?: string | null;
  location?: string | null;
  status?: string | null;
  total_value?: number | string | null;
  tax_rate?: number | string | null;
  profit_margin?: number | string | null;
  school_npsn?: string | null;
  principal_name?: string | null;
  p2sp_chair_name?: string | null;
  planning_consultant?: string | null;
  supervisory_consultant?: string | null;
  kabupaten_kota?: string | null;
  principal_nip?: string | null;
  planning_consultant_skk?: string | null;
  supervisory_consultant_skk?: string | null;
  divisions?: RABDivision[] | null;
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const firstValue = (record: JsonRecord, keys: string[], fallback: unknown = ''): unknown => {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  return fallback;
};
const numberValue = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
const textValue = (value: unknown, fallback = '-') => String(value ?? '').trim() || fallback;
const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(value);

function normalizeType(value: unknown, name: string, row: JsonRecord = {}): SnapshotComponent['type'] {
  // Identitas relasional snapshot menjadi sumber klasifikasi paling kuat.
  // Komponen dengan material_id tidak boleh masuk daftar upah hanya karena
  // nama material mengandung kata "pekerjaan" (mis. "Air bersih untuk pekerjaan konstruksi").
  if (row.material_id) return 'material';
  if (row.upah_id) return 'labor';

  const raw = String(value ?? '').trim().toLowerCase();
  // Dahulukan tipe eksplisit dari snapshot sebelum membaca nama komponen.
  if (/^(material|materials|bahan|barang)$/.test(raw)) return 'material';
  if (/^(labor|labour|upah|tenaga kerja|tenaga_kerja)$/.test(raw)) return 'labor';
  if (/^(equipment|alat|peralatan)$/.test(raw)) return 'equipment';

  const label = String(name ?? '').toLowerCase();
  // Gunakan batas kata agar "pekerjaan" tidak terbaca sebagai "pekerja".
  if (/\b(mandor|tukang|pekerja|operator|labor|labour)\b/.test(label)) return 'labor';
  if (/\b(alat|peralatan|equipment|mesin|sewa)\b/.test(label)) return 'equipment';
  if (/\b(bahan|material|barang)\b/.test(label)) return 'material';
  return 'other';
}

function parseComponents(snapshot: unknown): SnapshotComponent[] {
  const objectSnapshot = asRecord(snapshot);
  let source: unknown[] = Array.isArray(snapshot)
    ? snapshot
    : asArray(firstValue(objectSnapshot, ['components', 'items', 'details', 'data'], []));

  // Mendukung snapshot yang menyimpan komponen dalam kelompok terpisah.
  if (source.length === 0) {
    source = [
      ...asArray(firstValue(objectSnapshot, ['materials', 'bahan', 'material'], [])).map((row) => ({ ...asRecord(row), type: 'material' })),
      ...asArray(firstValue(objectSnapshot, ['labor', 'labors', 'upah', 'tenaga_kerja'], [])).map((row) => ({ ...asRecord(row), type: 'labor' })),
      ...asArray(firstValue(objectSnapshot, ['equipment', 'tools', 'alat'], [])).map((row) => ({ ...asRecord(row), type: 'equipment' })),
    ];
  }

  return source.map((entry) => {
    const row = asRecord(entry);
    const name = textValue(firstValue(row, ['name', 'item_name', 'description', 'material_name', 'component_name', 'uraian', 'item']), 'Komponen tanpa nama');
    const coefficient = numberValue(firstValue(row, ['coefficient', 'coef', 'koefisien', 'volume', 'qty', 'quantity'], 0));
    const unitPrice = numberValue(firstValue(row, ['unit_price', 'price', 'harga_satuan', 'unitPrice', 'price_snapshot'], 0));
    const explicitSubtotal = firstValue(row, ['subtotal', 'total_price', 'amount', 'jumlah_harga'], undefined);
    return {
      name,
      unit: textValue(firstValue(row, ['unit', 'unit_name', 'satuan']), '-'),
      coefficient,
      unitPrice,
      subtotal: explicitSubtotal === undefined ? coefficient * unitPrice : numberValue(explicitSubtotal),
      type: normalizeType(firstValue(row, ['type', 'category', 'jenis', 'component_type', 'item_type']), name, row),
      raw: row,
    };
  }).filter((item) => item.name !== 'Komponen tanpa nama' || item.coefficient !== 0 || item.unitPrice !== 0);
}

function classifyCode(code: string) {
  const parts = String(code || '').trim().split('.').filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, 3).join('.') : (parts.join('.') || 'Tanpa kode');
}

function componentTypeLabel(type: SnapshotComponent['type']) {
  return type === 'material' ? 'BAHAN / MATERIAL'
    : type === 'labor' ? 'TENAGA KERJA / UPAH'
    : type === 'equipment' ? 'PERALATAN'
    : 'KOMPONEN LAINNYA';
}

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


function getWorkSubcategory(codeValue: string): string {
  const parts = String(codeValue || '').trim().toUpperCase().split('.').filter(Boolean);
  const field = WORK_FIELDS.find((entry) => entry.code === (parts[0] || ''));
  const division = field?.divisions.find((entry) => entry.code === (parts[1] || ''));
  const subdivision = division?.subdivisions.find((entry) => entry.code === (parts[2] || ''));
  return subdivision?.name || (parts[2] ? `Subkelompok ${parts[2]}` : 'Tahapan belum terpetakan');
}

export default function RekapRABPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const [project, setProject] = useState<RekapProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pdfTheme, setPdfTheme] = useState<PdfThemeKey>('emerald');
  const [pdfFont, setPdfFont] = useState<PdfFontKey>('robotoCondensed');
  const [pdfBoldWeight, setPdfBoldWeight] = useState<PdfBoldWeight>(800);
  const activeTheme = PDF_THEMES[pdfTheme];

  const loadData = useCallback(async (refresh = false) => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');
    try {
      const result = await fetchProjectDetail(projectId);
      setProject(result ? result as unknown as RekapProject : null);
    } catch (error) {
      console.error('Gagal memuat rekap RAB:', error);
      setProject(null);
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat data rekap RAB.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const existing = document.getElementById('pdf-google-fonts') as HTMLLinkElement | null;
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'pdf-google-fonts';
    link.rel = 'stylesheet';
    link.href = PDF_GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const divisions = project?.divisions ?? [];
  const allItems = useMemo(() => divisions.flatMap((division) =>
    (division.items ?? []).map((item) => ({ ...item, divisionName: division.name, divisionId: division.id })),
  ), [divisions]);

  const totalRAB = useMemo(() => allItems.reduce((sum, item) => sum + numberValue(item.total_price), 0), [allItems]);
  const taxRate = numberValue(project?.tax_rate ?? 11);
  const profitRate = numberValue(project?.profit_margin ?? 10);
  const taxAmount = totalRAB * taxRate / 100;
  const profitAmount = totalRAB * profitRate / 100;
  const grandTotal = totalRAB + taxAmount + profitAmount;

  const summaryRows = useMemo(() => divisions.map((division) => {
    const categories = new Map<string, { name: string; total: number; count: number; order: number }>();
    (division.items ?? []).forEach((item, index) => {
      const categoryName = getWorkSubcategory(item.code || '');
      const current = categories.get(categoryName) ?? { name: categoryName, total: 0, count: 0, order: index };
      current.total += numberValue(item.total_price);
      current.count += 1;
      categories.set(categoryName, current);
    });
    const rows = Array.from(categories.values()).sort((a, b) => a.order - b.order);
    return { name: division.name, code: division.code, rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      count: rows.reduce((sum, row) => sum + row.count, 0) };
  }).filter((division) => division.rows.length > 0), [divisions]);

  const materialRows = useMemo(() => {
    const map = new Map<string, { name: string; units: Set<string>; volume: number; total: number; unitPrice: number }>();
    allItems.forEach((item) => parseComponents(item.components_snapshot).filter((c) => c.type === 'material').forEach((component) => {
      // Satu nama material hanya satu baris walaupun digunakan di banyak pekerjaan.
      const key = component.name.trim().toLocaleLowerCase('id-ID');
      const current = map.get(key) ?? { name: component.name.trim(), units: new Set<string>(), volume: 0, total: 0, unitPrice: component.unitPrice };
      current.units.add(component.unit);
      const requiredQuantity = component.coefficient * numberValue(item.volume);
      current.volume += requiredQuantity;
      current.total += requiredQuantity * component.unitPrice;
      if (current.volume > 0) current.unitPrice = current.total / current.volume;
      map.set(key, current);
    }));
    return Array.from(map.values()).map((row) => ({
      ...row,
      unit: row.units.size > 1 ? Array.from(row.units).join(' / ') : (Array.from(row.units)[0] || '-'),
    })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [allItems]);

  const laborRows = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; coefficient: number; volume: number; unitPrice: number; total: number }>();
    allItems.forEach((item) => parseComponents(item.components_snapshot).filter((c) => c.type === 'labor').forEach((component) => {
      const key = `${component.name.toLowerCase()}|${component.unit.toLowerCase()}`;
      const current = map.get(key) ?? { name: component.name, unit: component.unit, coefficient: 0, volume: 0, unitPrice: component.unitPrice, total: 0 };
      current.coefficient += component.coefficient;
      current.volume += component.coefficient * numberValue(item.volume);
      current.total += component.coefficient * numberValue(item.volume) * component.unitPrice;
      if (!current.unitPrice) current.unitPrice = component.unitPrice;
      map.set(key, current);
    }));
    return Array.from(map.values()).map((row) => ({ ...row, unitPrice: row.volume > 0 ? row.total / row.volume : row.unitPrice })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [allItems]);

  const printDocument = () => window.print();

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Memuat rekapitulasi RAB...
    </div>
  );
  if (!project) return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {errorMessage || 'Data proyek tidak ditemukan.'}
      </div>
      <Link href={`/proyek/${projectId}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" /> Kembali ke RAB proyek</Link>
    </main>
  );

  const fieldRows = [
    ['Nama Pekerjaan', project.title],
    ['Pemilik / Sekolah / Instansi', project.client],
    ['NPSN', project.school_npsn],
    ['Lokasi Proyek', project.location],
    ['Kabupaten / Kota', project.kabupaten_kota],
    ['Kepala Sekolah', project.principal_name],
    ['NIP Kepala Sekolah', project.principal_nip],
    ['Ketua P2SP', project.p2sp_chair_name],
    ['Konsultan Perencana', project.planning_consultant],
    ['No. SKK Perencana', project.planning_consultant_skk],
    ['Konsultan Pengawas', project.supervisory_consultant],
    ['No. SKK Pengawas', project.supervisory_consultant_skk],
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/proyek/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" /> Kembali ke RAB</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Rekapitulasi RAB Keseluruhan</h1>
          <p className="mt-1 text-sm text-slate-500">Cover, rekap pekerjaan, rincian RAB, analisis AHSP, material, dan upah.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => loadData(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Perbarui
          </button>
          <button onClick={printDocument} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            <Printer className="h-4 w-4" /> Cetak / Simpan PDF A4
          </button>
        </div>
      </div>

      {errorMessage && <div className="no-print flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{errorMessage}</div>}

      <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-900">Pengaturan Tampilan PDF</h2>
          <p className="mt-1 text-xs text-slate-500">Tema warna, jenis huruf, dan ketebalan mengikuti pilihan pada halaman RAB.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Tema warna
            <select value={pdfTheme} onChange={(e) => setPdfTheme(e.target.value as PdfThemeKey)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {Object.entries(PDF_THEMES).map(([key, theme]) => <option key={key} value={key}>{theme.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Jenis font
            <select value={pdfFont} onChange={(e) => setPdfFont(e.target.value as PdfFontKey)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {Object.entries(PDF_FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Ketebalan huruf tebal
            <select value={pdfBoldWeight} onChange={(e) => setPdfBoldWeight(Number(e.target.value) as PdfBoldWeight)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {[600,700,800,900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: activeTheme.border, background: activeTheme.soft, fontFamily: PDF_FONTS[pdfFont].css }}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeTheme.accent }}>Pratinjau dokumen</p><p className="text-sm font-bold" style={{ color: activeTheme.text, fontWeight: pdfBoldWeight }}>REKAPITULASI RENCANA ANGGARAN BIAYA</p><p className="text-xs" style={{ color: activeTheme.text }}>{activeTheme.label} · {PDF_FONTS[pdfFont].label}</p></div>
            <span className="rounded-md px-3 py-1.5 text-[10px] font-bold text-white" style={{ background: activeTheme.accent }}>A4 PORTRAIT</span>
          </div>
        </div>
      </section>

      <div id="rekap-print-report" style={{ fontFamily: PDF_FONTS[pdfFont].css, fontWeight: 400, color: '#1e293b' }}>
        {project.project_category === 'PORTOFOLIO' && (
          <div className="portfolio-print-watermark" aria-hidden="true">LAPORAN DUMMY/SAMPEL</div>
        )}
        <header className="report-running-header" style={{ borderBottom: `2px solid ${activeTheme.accent}`, color: activeTheme.text }}>
          <span>{formatDate(new Date())}</span><strong>{project.title}</strong>
        </header>

        {/* 1. COVER */}
        <section className="report-page cover-page" style={{ fontFamily: PDF_FONTS[pdfFont].css }}>
          <div className="cover-brand" style={{ color: activeTheme.accent }}>REVIT CONSULTANT MANAGEMENT</div>
          <div className="cover-rule" style={{ background: activeTheme.accent }} />
          <div className="cover-kicker">DOKUMEN PERENCANAAN · RENCANA ANGGARAN BIAYA</div>
          <h1 style={{ color: activeTheme.text }}>REKAPITULASI<br/>RENCANA ANGGARAN BIAYA</h1>
          <div className="cover-project-title" style={{ borderColor: activeTheme.border }}>{project.title}</div>
          <div className="cover-meta">
            <div><span>Pemilik / Instansi</span><strong>{textValue(project.client)}</strong></div>
            <div><span>Lokasi</span><strong>{textValue(project.location)}</strong></div>
            <div><span>Kabupaten / Kota</span><strong>{textValue(project.kabupaten_kota)}</strong></div>
            <div><span>NPSN</span><strong>{textValue(project.school_npsn)}</strong></div>
            <div><span>Status dokumen</span><strong>{textValue(project.status, 'DRAFT')}</strong></div>
            <div><span>Tanggal dokumen</span><strong>{formatDate(new Date())}</strong></div>
          </div>
          <div className="cover-total" style={{ background: activeTheme.soft, borderColor: activeTheme.border }}>
            <span>TOTAL RENCANA ANGGARAN</span><strong style={{ color: activeTheme.accent }}>{formatRupiah(grandTotal)}</strong>
          </div>
          <div className="cover-signatures">
            <div><span>Disusun oleh</span><strong>{textValue(project.planning_consultant, 'Konsultan Perencana')}</strong><small>{textValue(project.planning_consultant_skk, ' ')}</small></div>
            <div><span>Mengetahui</span><strong>{textValue(project.principal_name, 'Penanggung Jawab')}</strong><small>{textValue(project.principal_nip, ' ')}</small></div>
          </div>
          <div className="cover-footer">DOKUMEN RAB · {textValue(project.client)} · {textValue(project.kabupaten_kota)}</div>
        </section>

        {/* 2. REKAPITULASI PEKERJAAN */}
        <section className="report-page">
          <SectionHeading letter="A" title="REKAPITULASI PEKERJAAN" theme={activeTheme} />
          <p className="report-intro">Rekapitulasi disusun per divisi pekerjaan (misalnya Kelas A dan Kelas B), kemudian dirinci menurut tahapan / subkelompok AHSP yang digunakan pada setiap divisi.</p>
          <table className="report-table">
            <thead><tr><th style={{width:'7%'}}>No.</th><th>Divisi / Tahapan Pekerjaan</th><th style={{width:'18%'}}>Jumlah Item</th><th style={{width:'27%'}}>Jumlah Harga</th></tr></thead>
            <tbody>
              {summaryRows.flatMap((division, divisionIndex) => [
                <tr key={`division-${division.name}`} className="summary-division"><td className="center">{divisionIndex + 1}</td><td><strong>{division.name}</strong>{division.code ? ` (${division.code})` : ''}</td><td className="center"><strong>{division.count}</strong></td><td className="number"><strong>{formatRupiah(division.total)}</strong></td></tr>,
                ...division.rows.map((row, rowIndex) => <tr key={`${division.name}-${row.name}`}><td className="center">{`${divisionIndex + 1}.${rowIndex + 1}`}</td><td className="summary-stage">↳ {row.name}</td><td className="center">{row.count}</td><td className="number">{formatRupiah(row.total)}</td></tr>)
              ])}
              {summaryRows.length === 0 && <tr><td colSpan={4} className="center">Belum ada item pekerjaan.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan={3}>JUMLAH RAB</th><th className="number">{formatRupiah(totalRAB)}</th></tr></tfoot>
          </table>
          <div className="report-totals">
            <div><span>Jumlah RAB</span><strong>{formatRupiah(totalRAB)}</strong></div>
            <div><span>Pajak ({formatNumber(taxRate)}%)</span><strong>{formatRupiah(taxAmount)}</strong></div>
            <div><span>Override / Margin ({formatNumber(profitRate)}%)</span><strong>{formatRupiah(profitAmount)}</strong></div>
            <div className="grand" style={{ background: activeTheme.soft, borderColor: activeTheme.border }}><span>TOTAL KESELURUHAN</span><strong style={{color:activeTheme.accent}}>{formatRupiah(grandTotal)}</strong></div>
          </div>
        </section>

        {/* 3. RINCIAN PEKERJAAN */}
        <section className="report-page">
          <SectionHeading letter="B" title="RINCIAN PEKERJAAN" theme={activeTheme} />
          {divisions.map((division, divisionIndex) => {
            const rows = division.items ?? [];
            return <section className="report-subsection" key={division.id}>
              <h3 style={{background:activeTheme.soft,borderColor:activeTheme.border,color:activeTheme.text}}>{divisionIndex+1}. {division.name}</h3>
              <table className="report-table compact">
                <thead><tr><th style={{width:'5%'}}>No.</th><th style={{width:'13%'}}>Kode</th><th>Uraian Pekerjaan</th><th style={{width:'7%'}}>Sat.</th><th style={{width:'9%'}}>Volume</th><th style={{width:'19%'}}>Harga Satuan</th><th style={{width:'20%'}}>Jumlah Harga</th></tr></thead>
                <tbody>
                  {rows.map((item,index)=><tr key={item.id}><td className="center">{index+1}</td><td>{item.code || '-'}</td><td>{item.name}</td><td className="center">{item.unit || '-'}</td><td className="number">{formatNumber(numberValue(item.volume),3)}</td><td className="number">{formatRupiah(numberValue(item.unit_price))}</td><td className="number">{formatRupiah(numberValue(item.total_price))}</td></tr>)}
                  {rows.length===0 && <tr><td colSpan={7} className="center">Belum ada rincian pada tahapan ini.</td></tr>}
                </tbody>
                <tfoot><tr><th colSpan={6}>JUMLAH {division.name.toUpperCase()}</th><th className="number">{formatRupiah(rows.reduce((s,item)=>s+numberValue(item.total_price),0))}</th></tr></tfoot>
              </table>
            </section>;
          })}
        </section>

        {/* 4. RINCIAN AHSP BERDASARKAN SNAPSHOT RAB */}
        <section className="report-page">
          <SectionHeading letter="C" title="RINCIAN ANALISIS HARGA SATUAN PEKERJAAN" theme={activeTheme} />
          <p className="report-intro">Setiap AHSP ditampilkan sebagai analisis untuk volume 1, menggunakan snapshot komponen yang tersimpan pada RAB proyek saat disusun. Dokumen ini tidak mengambil ulang komponen dari Master AHSP.</p>
          {allItems.map((item,index)=>{
            const components = parseComponents(item.components_snapshot);
            const grouped = ['material','labor','equipment','other'].map(type=>({type, rows:components.filter(c=>c.type===type)})).filter(group=>group.rows.length);
            return <section className="report-subsection ahsp-block" key={item.id}>
              <h3 style={{background:activeTheme.soft,borderColor:activeTheme.border,color:activeTheme.text}}>{index+1}. {item.code || '-'} — {item.name}</h3>
              <div className="ahsp-meta"><span>Satuan pekerjaan: <strong>{item.unit || '-'}</strong></span><span>Volume analisis: <strong>1 {item.unit || ''}</strong></span><span>Harga satuan AHSP: <strong>{formatRupiah(numberValue(item.unit_price))}</strong></span></div>
              {grouped.map(group=><Fragment key={group.type}>
                <div className="component-label" style={{color:activeTheme.accent}}>{componentTypeLabel(group.type as SnapshotComponent['type'])}</div>
                <table className="report-table compact">
                  <thead><tr><th style={{width:'6%'}}>No.</th><th>Uraian</th><th style={{width:'10%'}}>Sat.</th><th style={{width:'14%'}}>Koefisien</th><th style={{width:'14%'}}>Vol. (1 AHSP)</th><th style={{width:'19%'}}>Harga Satuan</th><th style={{width:'19%'}}>Jumlah</th></tr></thead>
                  <tbody>{group.rows.map((component,ci)=><tr key={`${component.name}-${ci}`}><td className="center">{ci+1}</td><td>{component.name}</td><td className="center">{component.unit}</td><td className="number">{formatNumber(component.coefficient,5)}</td><td className="number">{formatNumber(component.coefficient,5)}</td><td className="number">{formatRupiah(component.unitPrice)}</td><td className="number">{formatRupiah(component.coefficient*component.unitPrice)}</td></tr>)}</tbody>
                  <tfoot><tr><th colSpan={6}>SUBTOTAL {componentTypeLabel(group.type as SnapshotComponent['type'])}</th><th className="number">{formatRupiah(group.rows.reduce((s,c)=>s+c.coefficient*c.unitPrice,0))}</th></tr></tfoot>
                </table>
              </Fragment>)}
              {components.length===0 && <p className="empty-note">Snapshot komponen AHSP tidak tersedia pada item ini.</p>}
              <div className="ahsp-total"><span>HARGA SATUAN PEKERJAAN</span><strong>{formatRupiah(numberValue(item.unit_price))}</strong></div>
            </section>;
          })}
        </section>

        {/* 5. REKAP KEBUTUHAN MATERIAL */}
        <section className="report-page">
          <SectionHeading letter="D" title="RINCIAN HARGA MATERIAL" theme={activeTheme} />
          <p className="report-intro">Daftar ini menjadi acuan harga material untuk dokumen RAB yang telah dicetak. Setiap nama material dicantumkan satu kali, tanpa volume kebutuhan maupun jumlah harga. Harga yang ditampilkan adalah harga satuan untuk satu unit penuh (misalnya harga per 1 m³), bukan nilai pembelian berdasarkan volume pemakaian.</p>
          <table className="report-table">
            <thead><tr><th style={{width:'7%'}}>No.</th><th>Nama Material</th><th style={{width:'15%'}}>Satuan</th><th style={{width:'30%'}}>Harga Satuan</th></tr></thead>
            <tbody>{materialRows.map((row,index)=><tr key={`${row.name}-${row.unit}`}><td className="center">{index+1}</td><td>{row.name}</td><td className="center">{row.unit}</td><td className="number">{formatRupiah(row.unitPrice)}</td></tr>)}
              {materialRows.length===0 && <tr><td colSpan={4} className="center">Tidak ditemukan komponen material pada snapshot AHSP RAB.</td></tr>}
            </tbody>
          </table>
        </section>

        {/* 6. REKAP UPAH TENAGA KERJA */}
        <section className="report-page">
          <SectionHeading letter="E" title="RINCIAN UPAH TENAGA KERJA" theme={activeTheme} />
          <p className="report-intro">Kebutuhan tenaga dihitung dari koefisien pada snapshot AHSP dikalikan volume item RAB. Harga mengikuti harga satuan yang tersimpan pada snapshot RAB.</p>
          <table className="report-table">
            <thead><tr><th style={{width:'6%'}}>No.</th><th>Uraian Tenaga Kerja</th><th style={{width:'10%'}}>Sat.</th><th style={{width:'15%'}}>Kebutuhan</th><th style={{width:'20%'}}>Harga Satuan</th><th style={{width:'22%'}}>Jumlah Upah</th></tr></thead>
            <tbody>{laborRows.map((row,index)=><tr key={`${row.name}-${row.unit}`}><td className="center">{index+1}</td><td>{row.name}</td><td className="center">{row.unit}</td><td className="number">{formatNumber(row.volume,4)}</td><td className="number">{formatRupiah(row.unitPrice)}</td><td className="number">{formatRupiah(row.total)}</td></tr>)}
              {laborRows.length===0 && <tr><td colSpan={6} className="center">Tidak ditemukan komponen upah tenaga kerja pada snapshot AHSP RAB.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan={5}>TOTAL UPAH TENAGA KERJA</th><th className="number">{formatRupiah(laborRows.reduce((s,r)=>s+r.total,0))}</th></tr></tfoot>
          </table>
        </section>

        <footer className="report-footer" style={{borderTop:`2px solid ${activeTheme.accent}`}}>
          <div><strong>REVIT CONSULTANT MANAGEMENT</strong><span>Rekapitulasi Rencana Anggaran Biaya · {project.title}</span></div>
          <div className="signature-grid">
            <div><span>Konsultan Perencana</span><strong>{textValue(project.planning_consultant, ' ')}</strong><small>{textValue(project.planning_consultant_skk, ' ')}</small></div>
            <div><span>Mengetahui / Penanggung Jawab</span><strong>{textValue(project.principal_name, ' ')}</strong><small>{textValue(project.principal_nip, ' ')}</small></div>
            <div><span>Konsultan Pengawas</span><strong>{textValue(project.supervisory_consultant, ' ')}</strong><small>{textValue(project.supervisory_consultant_skk, ' ')}</small></div>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        .portfolio-print-watermark { display:none; }
        #rekap-print-report { background:#fff; color:#1e293b; font-family:${PDF_FONTS[pdfFont].css}; font-size:9pt; line-height:1.35; }
        #rekap-print-report * { box-sizing:border-box; }
        .report-page { margin:0 0 18px; padding:0; }
        .report-running-header { display:flex; justify-content:space-between; gap:12px; padding:0 0 6px; margin:0 0 12px; border-bottom:1px solid #cbd5e1; font-size:7pt; }
        .report-running-header strong { text-align:right; }
        .cover-page { min-height:255mm; display:flex; flex-direction:column; justify-content:center; padding:18mm 12mm; break-after:page; page-break-after:always; }
        .cover-brand { font-size:12pt; font-weight:800; letter-spacing:2px; }
        .cover-rule { height:5px; width:100%; margin:10px 0 24px; }
        .cover-kicker { color:#64748b; font-size:8pt; letter-spacing:1.5px; font-weight:700; }
        .cover-page h1 { font-size:27pt; line-height:1.12; margin:12px 0 18px; font-weight:900; }
        .cover-project-title { padding:12px 0; border-top:1px solid; border-bottom:1px solid; font-size:16pt; font-weight:800; }
        .cover-meta { display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; margin-top:22px; }
        .cover-meta div { display:flex; flex-direction:column; gap:3px; border-bottom:1px solid #e2e8f0; padding-bottom:6px; }
        .cover-meta span,.cover-signatures span { color:#64748b; font-size:7.5pt; }
        .cover-meta strong { font-size:9pt; }
        .cover-total { display:flex; flex-direction:column; gap:5px; padding:14px 16px; border:1px solid; margin-top:24px; }
        .cover-total span { font-size:8pt; font-weight:700; letter-spacing:1px; }
        .cover-total strong { font-size:20pt; font-weight:900; }
        .cover-signatures { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:35px; }
        .cover-signatures div { display:flex; flex-direction:column; min-height:25mm; gap:4px; }
        .cover-signatures strong { margin-top:auto; font-size:9pt; }
        .cover-signatures small { font-size:7pt; color:#64748b; }
        .cover-footer { margin-top:auto; padding-top:12px; color:#64748b; border-top:1px solid #cbd5e1; font-size:7pt; letter-spacing:.5px; }
        .report-section-heading { margin:0 0 9px; padding:6px 8px; border-left:4px solid; font-size:11pt; font-weight:800; }
        .report-intro { color:#64748b; font-size:8pt; margin:0 0 9px; }
        .report-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7.2pt; margin:0 0 10px; }
        .report-table th,.report-table td { border:1px solid #cbd5e1; padding:5px 4px; vertical-align:top; overflow-wrap:anywhere; }
        .report-table thead th { color:#fff; text-align:left; font-weight:700; }
        .report-table tfoot th { background:#f1f5f9; font-weight:800; }
        .report-table .center { text-align:center; }
        .summary-division { background:#f1f5f9; }
        .summary-stage { padding-left:14px!important; }
        .report-table .number { text-align:right; white-space:nowrap; }
        .report-table.compact { font-size:6.7pt; }
        .report-table.compact th,.report-table.compact td { padding:3px 3px; }
        .report-subsection { margin:0 0 12px; break-inside:auto; page-break-inside:auto; }
        .report-subsection h3 { margin:0 0 5px; padding:5px 7px; border:1px solid; font-size:8pt; font-weight:800; }
        .ahsp-block { break-inside:auto; page-break-inside:auto; }
        .ahsp-meta { display:flex; flex-wrap:wrap; gap:5px 16px; margin:4px 0 6px; font-size:7pt; color:#64748b; }
        .component-label { font-size:7pt; font-weight:800; margin:6px 0 3px; }
        .ahsp-total { display:flex; justify-content:space-between; border:1px solid #cbd5e1; padding:5px 7px; margin-top:4px; font-size:8pt; font-weight:800; }
        .empty-note { color:#64748b; font-style:italic; font-size:7pt; }
        .report-totals { width:75%; margin:12px 0 0 auto; font-size:8pt; }
        .report-totals>div { display:flex; justify-content:space-between; gap:12px; padding:5px 7px; border-bottom:1px solid #e2e8f0; }
        .report-totals .grand { border:1px solid; margin-top:5px; font-size:10pt; font-weight:800; }
        .report-footer { margin-top:22px; padding-top:9px; break-inside:avoid; page-break-inside:avoid; }
        .report-footer>div:first-child { display:flex; flex-direction:column; gap:2px; font-size:8pt; }
        .report-footer>div:first-child span { color:#64748b; font-size:7pt; }
        .signature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:20px; }
        .signature-grid div { display:flex; flex-direction:column; min-height:24mm; gap:3px; }
        .signature-grid span,.signature-grid small { color:#64748b; font-size:6.5pt; }
        .signature-grid strong { margin-top:auto; font-size:7.5pt; }
        @media screen { #rekap-print-report { padding:18px; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 2px 8px #0f172a0a; } .report-page:not(.cover-page) { margin-bottom:30px; } }
        @media print {
          @page { size:A4 portrait; margin:12mm 13mm 13mm; }
          html,body { margin:0!important; padding:0!important; background:#fff!important; }
          body * { visibility:hidden; }
          #rekap-print-report,#rekap-print-report * { visibility:visible!important; }
          .portfolio-print-watermark { display:block!important; position:fixed!important; z-index:9999!important; top:44%!important; left:0!important; width:100%!important; transform:rotate(-32deg)!important; color:#9f1239!important; opacity:.14!important; font-size:28pt!important; font-weight:900!important; letter-spacing:4px!important; text-align:center!important; white-space:nowrap!important; pointer-events:none!important; }
          #rekap-print-report { position:absolute!important; left:0!important; top:0!important; width:100%!important; padding:0!important; margin:0!important; border:0!important; box-shadow:none!important; font-size:8pt!important; }
          .no-print { display:none!important; }
          .cover-page { min-height:270mm; break-after:page!important; page-break-after:always!important; }
          .report-page { break-before:page; page-break-before:always; }
          .report-page:first-of-type { break-before:auto; page-break-before:auto; }
          .report-table { break-inside:auto; page-break-inside:auto; }
          .report-table thead { display:table-header-group; }
          .report-table tfoot { display:table-row-group; }
          .report-table tr { break-inside:avoid; page-break-inside:avoid; }
          .report-subsection h3 { break-after:avoid; page-break-after:avoid; }
          .report-footer { break-inside:avoid; page-break-inside:avoid; }
          * { print-color-adjust:exact!important; -webkit-print-color-adjust:exact!important; }
        }
      `}</style>
    </main>
  );
}

function SectionHeading({ letter, title, theme }: { letter: string; title: string; theme: { accent: string; soft: string; text: string } }) {
  return <h2 className="report-section-heading" style={{ color: theme.text, background: theme.soft, borderColor: theme.accent }}>{letter}. {title}</h2>;
}
