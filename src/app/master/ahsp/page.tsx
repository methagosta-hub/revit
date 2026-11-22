'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Layers,
  Search,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Check,
  X,
  RefreshCw,
  Package,
  AlertCircle,
  Loader2,
  ChevronRight,
  GripVertical,
  Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';
import { useAppAccess } from '@/hooks/useAppAccess';

type ComponentType = 'material' | 'labor' | 'equipment';
type FormMode = 'create' | 'edit' | 'duplicate';

type AhspSubitem = {
  id?: string;
  parent_ahsp_id?: string;
  // child_ahsp_id hanya dipakai untuk kompatibilitas data relasional lama.
  child_ahsp_id?: string | null;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  coefficient?: number | string | null;
  notes?: string | null;
  components: AhspComponent[];
  labor_cost?: number | string | null;
  material_cost?: number | string | null;
  equipment_cost?: number | string | null;
  total_price?: number | string | null;
  sort_order?: number | null;
  child?: MasterAhspItem | null;
};

type AhspComponent = {
  id?: string;
  ahsp_id?: string;
  material_id?: string | null;
  upah_id?: string | null;
  alat_id?: string | null;
  name: string;
  unit: string;
  coefficient: number | string;
  unit_price: number | string;
  subtotal?: number | string;
  type: ComponentType;
  sort_order?: number;
  // Penanda untuk kompatibilitas data AHSP lama.
  isLegacySummary?: boolean;
};

type MasterAhspItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  total_price: number;
  category: string;
  components?: AhspComponent[] | null;
  subitems?: AhspSubitem[];
};

type MasterCatalogItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number | string;
  category?: string | null;
};

type AhspComponentDbRow = AhspComponent & {
  id: string;
  ahsp_id: string;
  coefficient: number | string;
  unit_price: number | string;
  subtotal: number | string;
  sort_order: number;
};

type WbsDepth = 4 | 5 | 6 | 7;
type WorkSubcategory = { code: string; label: string };
type WorkDivision = { code: string; label: string; subcategories: WorkSubcategory[] };
type WorkField = { code: string; label: string; divisions: WorkDivision[] };

const CATALOG_PAGE_SIZE = 25;
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

function makeDivisions(
  definitions: Array<[string, string, string[]]>,
): WorkDivision[] {
  return definitions.map(([code, label, subcategoryLabels]) => ({
    code,
    label,
    subcategories: subcategoryLabels.map((subcategoryLabel, index) => ({
      code: String(index + 1).padStart(2, '0'),
      label: subcategoryLabel,
    })),
  }));
}

// Taksonomi mengikuti rumpun/divisi AHSP Cipta Karya pada Lampiran VI
// SE DJBK 47/SE/Dk/2026. Subkategori merupakan pemecahan WBS internal aplikasi
// untuk memudahkan pencarian dan pengkodean; bukan nomor resmi SNI/PUPR.
const BUILDING_DIVISIONS = makeDivisions([
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
]);

const WORK_FIELDS: WorkField[] = [
  {
    code: 'BG',
    label: 'Bangunan Gedung dan Perumahan',
    divisions: BUILDING_DIVISIONS,
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

const DEFAULT_FIELD_CODE = 'BG';
const DEFAULT_DIVISION_CODE = '02';
const DEFAULT_SUBCATEGORY_CODE = '02';
const DEFAULT_WBS_DEPTH: WbsDepth = 4;

function getField(code: string): WorkField {
  return WORK_FIELDS.find((field) => field.code === code) ?? WORK_FIELDS[0];
}

function getDivision(fieldCode: string, divisionCode: string): WorkDivision {
  const field = getField(fieldCode);
  return field.divisions.find((division) => division.code === divisionCode) ?? field.divisions[0];
}

function getSubcategory(fieldCode: string, divisionCode: string, subcategoryCode: string): WorkSubcategory {
  const division = getDivision(fieldCode, divisionCode);
  return division.subcategories.find((subcategory) => subcategory.code === subcategoryCode) ?? division.subcategories[0];
}

function makeCategoryPath(fieldCode: string, divisionCode: string, subcategoryCode: string): string {
  // Simpan kunci kategori ringkas agar aman untuk category varchar(100), stabil,
  // dan mudah dipakai sebagai filter: FIELD.DIVISI.SUBKATEGORI.
  return `${fieldCode}.${divisionCode}.${subcategoryCode}`;
}

function makeCategoryLabelPath(fieldCode: string, divisionCode: string, subcategoryCode: string): string {
  const field = getField(fieldCode);
  const division = getDivision(fieldCode, divisionCode);
  const subcategory = getSubcategory(fieldCode, divisionCode, subcategoryCode);
  return `${field.label} / D${division.code} ${division.label} / ${subcategory.code} ${subcategory.label}`;
}

function formatCategoryValue(category: string | null | undefined): string {
  const raw = (category ?? '').trim();
  const compact = raw.match(/^([A-Z]+)\.(\d{2})\.(\d{2})$/);
  if (!compact) return raw || 'Umum';
  const [, fieldCode, divisionCode, subcategoryCode] = compact;
  const field = WORK_FIELDS.find((entry) => entry.code === fieldCode);
  const division = field?.divisions.find((entry) => entry.code === divisionCode);
  const subcategory = division?.subcategories.find((entry) => entry.code === subcategoryCode);
  if (!field || !division || !subcategory) return raw;
  return `${field.label} / ${division.label} / ${subcategory.label}`;
}

function classifyExistingItem(category: string, name: string): { fieldCode: string; divisionCode: string; subcategoryCode: string } {
  const compact = (category ?? '').trim().match(/^([A-Z]+)\.(\d{2})\.(\d{2})$/);
  if (compact) {
    const [, fieldCode, divisionCode, subcategoryCode] = compact;
    const field = WORK_FIELDS.find((entry) => entry.code === fieldCode);
    const division = field?.divisions.find((entry) => entry.code === divisionCode);
    const subcategory = division?.subcategories.find((entry) => entry.code === subcategoryCode);
    if (field && division && subcategory) return { fieldCode, divisionCode, subcategoryCode };
  }
  const parts = (category ?? '').split('/').map((part) => part.trim());
  const fieldCode = parts[0]?.split(/\s+/)[0] ?? '';
  const divisionCode = parts[1]?.match(/D?(\d{1,2})/)?.[1]?.padStart(2, '0') ?? '';
  const subcategoryCode = parts[2]?.match(/^(\d{1,2})/)?.[1]?.padStart(2, '0') ?? '';
  const savedField = WORK_FIELDS.find((field) => field.code === fieldCode);
  if (savedField) {
    const division = savedField.divisions.find((entry) => entry.code === divisionCode);
    const subcategory = division?.subcategories.find((entry) => entry.code === subcategoryCode);
    if (division && subcategory) return { fieldCode, divisionCode, subcategoryCode };
  }

  // Pemetaan bantu untuk data kategori lama yang belum memakai format WBS baru.
  const text = `${category} ${name}`.toLocaleLowerCase('id');
  let divisionCodeGuess = '02';
  let subcategoryCodeGuess = '02';
  if (/galian|urugan|timbunan|pemadatan/.test(text)) {
    divisionCodeGuess = '01'; subcategoryCodeGuess = '02';
  } else if (/pondasi|fondasi|sloof|pile cap|tiang pancang/.test(text)) {
    divisionCodeGuess = '02'; subcategoryCodeGuess = '08';
  } else if (/dinding|bata|hebel|batako|partisi/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '06';
  } else if (/plester|acian/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '07';
  } else if (/cat|pengecatan|pelitur/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '08';
  } else if (/aluminium|alumunium|railing|railling|besi/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '13';
  } else if (/kusen|pintu|jendela/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '11';
  } else if (/kaca|glass/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '12';
  } else if (/atap|genteng|spandek/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '01';
  } else if (/plafon|langit-langit|gypsum/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '05';
  } else if (/lantai|keramik|granit|marmer/.test(text)) {
    divisionCodeGuess = '03'; subcategoryCodeGuess = '09';
  } else if (/plumbing|plambing|sanitair|sanitasi|pipa air/.test(text)) {
    divisionCodeGuess = '06'; subcategoryCodeGuess = '01';
  } else if (/struktur baja/.test(text)) {
    divisionCodeGuess = '02'; subcategoryCodeGuess = '03';
  } else if (/beton|struktur/.test(text)) {
    divisionCodeGuess = '02'; subcategoryCodeGuess = '02';
  }
  return { fieldCode: DEFAULT_FIELD_CODE, divisionCode: divisionCodeGuess, subcategoryCode: subcategoryCodeGuess };
}

type GroupedAhspItems = {
  key: string;
  fieldCode: string;
  fieldLabel: string;
  divisionCode: string;
  divisionLabel: string;
  subcategoryCode: string;
  subcategoryLabel: string;
  items: MasterAhspItem[];
};

function compareAhspCode(aValue: string, bValue: string): number {
  const a = String(aValue || '').trim().toUpperCase().split('.');
  const b = String(bValue || '').trim().toUpperCase().split('.');
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? '';
    const right = b[index] ?? '';
    if (left === right) continue;
    const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
    const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    const compared = left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' });
    if (compared !== 0) return compared;
  }
  return 0;
}

function getAhspGroupIdentity(item: MasterAhspItem) {
  const codeParts = String(item.code ?? '').trim().toUpperCase().split('.');
  const codePrefix = codeParts.length >= 3 ? codeParts.slice(0, 3).join('.') : '';
  const codeMatch = codePrefix.match(/^([A-Z]+)\.(\d{2})\.(\d{2})$/);
  const categoryRaw = String(item.category ?? '').trim();
  const categoryMatch = categoryRaw.match(/^([A-Z]+)\.(\d{2})\.(\d{2})$/);

  let fieldCode = '';
  let divisionCode = '';
  let subcategoryCode = '';

  // Prioritas klasifikasi adalah tiga segmen awal kode AHSP.
  // Dengan demikian BG.01.01.001 dikelompokkan ke BG.01.01.
  const match = codeMatch ?? categoryMatch;
  if (match) {
    fieldCode = match[1];
    divisionCode = match[2];
    subcategoryCode = match[3];
  } else if (categoryRaw.includes('/')) {
    const legacy = classifyExistingItem(categoryRaw, item.name ?? '');
    const fieldExists = WORK_FIELDS.some((entry) => entry.code === legacy.fieldCode);
    const divisionExists = WORK_FIELDS.find((entry) => entry.code === legacy.fieldCode)
      ?.divisions.some((entry) => entry.code === legacy.divisionCode);
    const subcategoryExists = WORK_FIELDS.find((entry) => entry.code === legacy.fieldCode)
      ?.divisions.find((entry) => entry.code === legacy.divisionCode)
      ?.subcategories.some((entry) => entry.code === legacy.subcategoryCode);
    if (fieldExists && divisionExists && subcategoryExists) {
      fieldCode = legacy.fieldCode;
      divisionCode = legacy.divisionCode;
      subcategoryCode = legacy.subcategoryCode;
    }
  }

  const field = WORK_FIELDS.find((entry) => entry.code === fieldCode);
  const division = field?.divisions.find((entry) => entry.code === divisionCode);
  const subcategory = division?.subcategories.find((entry) => entry.code === subcategoryCode);

  if (field && division && subcategory) {
    return {
      key: `${fieldCode}.${divisionCode}.${subcategoryCode}`,
      fieldCode,
      fieldLabel: field.label,
      divisionCode,
      divisionLabel: division.label,
      subcategoryCode,
      subcategoryLabel: subcategory.label,
    };
  }

  const fallbackLabel = categoryRaw && !categoryMatch
    ? formatCategoryValue(categoryRaw)
    : 'Kategori belum diklasifikasikan';
  return {
    key: `LAINNYA:${fallbackLabel}`,
    fieldCode: '',
    fieldLabel: 'Lain-lain',
    divisionCode: '',
    divisionLabel: fallbackLabel,
    subcategoryCode: '',
    subcategoryLabel: '',
  };
}

function groupMasterAhspItems(sourceItems: MasterAhspItem[]): GroupedAhspItems[] {
  const groups = new Map<string, GroupedAhspItems>();
  for (const item of sourceItems) {
    const identity = getAhspGroupIdentity(item);
    const group = groups.get(identity.key);
    if (group) group.items.push(item);
    else groups.set(identity.key, { ...identity, items: [item] });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => compareAhspCode(a.code, b.code)),
    }))
    .sort((a, b) => {
      if (a.fieldCode && b.fieldCode) {
        const fieldCompare = a.fieldCode.localeCompare(b.fieldCode, 'id', { numeric: true });
        if (fieldCompare !== 0) return fieldCompare;
        const divisionCompare = a.divisionCode.localeCompare(b.divisionCode, 'id', { numeric: true });
        if (divisionCompare !== 0) return divisionCompare;
        return a.subcategoryCode.localeCompare(b.subcategoryCode, 'id', { numeric: true });
      }
      if (a.fieldCode) return -1;
      if (b.fieldCode) return 1;
      return a.divisionLabel.localeCompare(b.divisionLabel, 'id', { numeric: true });
    });
}

function getHierarchicalCodeDepth(code: string, fieldCode: string): WbsDepth | null {
  const parts = code.trim().split('.');
  if (parts[0] !== fieldCode || parts.length < 4 || parts.length > 7) return null;
  if (parts.slice(1, 3).some((part) => !/^\d{2}$/.test(part))) return null;
  if (parts.slice(3).some((part) => !/^\d{3,}$/.test(part))) return null;
  return parts.length as WbsDepth;
}

function nextHierarchicalCode(parentCode: string, targetDepth: WbsDepth, codes: string[], excludeCode?: string): string {
  const parentParts = parentCode.split('.');
  const maxSequence = codes.reduce((maximum, rawCode) => {
    const candidate = rawCode.trim();
    if (candidate === excludeCode) return maximum;
    const parts = candidate.split('.');
    if (parts.length !== targetDepth || parts.slice(0, -1).join('.') !== parentCode) return maximum;
    const sequence = Number(parts[parts.length - 1]);
    return Number.isInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  return `${parentParts.join('.')}.${String(maxSequence + 1).padStart(3, '0')}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type IndexedAhspComponent = { component: AhspComponent; index: number };
type AhspComponentGroup = {
  type: ComponentType;
  label: 'Bahan' | 'Upah' | 'Alat';
  rows: IndexedAhspComponent[];
};

/**
 * Kelompok induk selalu tetap Bahan -> Upah -> Alat.
 * Yang dapat diurutkan secara kustom adalah setiap baris Bahan berdasarkan
 * sort_order. Upah tetap mengikuti hierarki tarif OH tertinggi ke terendah;
 * Alat mempertahankan sort_order masing-masing.
 */
function groupComponentsByType(components: AhspComponent[]): AhspComponentGroup[] {
  const definitions: Array<{ type: ComponentType; label: AhspComponentGroup['label'] }> = [
    { type: 'material', label: 'Bahan' },
    { type: 'labor', label: 'Upah' },
    { type: 'equipment', label: 'Alat' },
  ];

  return definitions.flatMap(({ type, label }) => {
    const rows = components
      .map((component, index) => ({ component, index }))
      .filter((entry) => entry.component.type === type)
      .sort((a, b) => {
        if (type === 'labor') {
          const wageDifference = asNumber(b.component.unit_price) - asNumber(a.component.unit_price);
          if (wageDifference !== 0) return wageDifference;
        }
        const aOrder = Number(a.component.sort_order ?? a.index);
        const bOrder = Number(b.component.sort_order ?? b.index);
        return aOrder - bOrder || a.index - b.index;
      });

    return rows.length > 0 ? [{ type, label, rows }] : [];
  });
}

// Database tetap menggunakan satu sort_order global. Saat disimpan, urutan
// global dibentuk dari kelompok tetap Bahan -> Upah -> Alat, dengan urutan
// baris Bahan mengikuti drag-and-drop pengguna.
function sortComponentsByType(components: AhspComponent[]): AhspComponent[] {
  return groupComponentsByType(components)
    .flatMap((group) => group.rows.map((entry) => entry.component))
    .map((component, index) => ({ ...component, sort_order: index }));
}

type AhspCostBreakdown = {
  labor: number;
  material: number;
  equipment: number;
  other: number;
};

function emptyCostBreakdown(): AhspCostBreakdown {
  return { labor: 0, material: 0, equipment: 0, other: 0 };
}

function getComponentBreakdown(components: AhspComponent[]): AhspCostBreakdown {
  return components.reduce((result, component) => {
    const amount = asNumber(component.coefficient) * asNumber(component.unit_price);
    if (component.type === 'labor') result.labor += amount;
    else if (component.type === 'material') result.material += amount;
    else if (component.type === 'equipment') result.equipment += amount;
    else result.other += amount;
    return result;
  }, emptyCostBreakdown());
}

function sumCostBreakdown(cost: AhspCostBreakdown): number {
  return cost.labor + cost.material + cost.equipment + cost.other;
}

function subitemCostBreakdown(entry: AhspSubitem): AhspCostBreakdown {
  const rows = Array.isArray(entry.components) ? entry.components : [];
  const stored: AhspCostBreakdown = {
    labor: asNumber(entry.labor_cost),
    material: asNumber(entry.material_cost),
    equipment: asNumber(entry.equipment_cost),
    other: 0,
  };
  const categorizedTotal = sumCostBreakdown(stored);
  const savedTotal = asNumber(entry.total_price);

  // Kolom biaya yang sudah dihitung saat pemuatan mencakup sub-item bertingkat.
  if (categorizedTotal > 0) {
    stored.other = Math.max(0, savedTotal - categorizedTotal);
    return stored;
  }
  if (rows.length > 0) return getComponentBreakdown(rows);

  const legacyPrice = asNumber(entry.child?.total_price);
  stored.other = legacyPrice > 0 ? legacyPrice : savedTotal;
  return stored;
}

function subitemUnitPrice(entry: AhspSubitem): number {
  return sumCostBreakdown(subitemCostBreakdown(entry));
}

function buildLegacyComponents(item: MasterAhspItem): AhspComponent[] {
  const rows: AhspComponent[] = [];
  const summaries: Array<{ type: ComponentType; name: string; amount: number }> = [
    {
      type: 'labor',
      name: 'Total Upah tersimpan',
      amount: asNumber(item.labor_cost),
    },
    {
      type: 'material',
      name: 'Total Bahan tersimpan',
      amount: asNumber(item.material_cost),
    },
    {
      type: 'equipment',
      name: 'Total Alat tersimpan',
      amount: asNumber(item.equipment_cost),
    },
  ];

  summaries.forEach(({ type, name, amount }) => {
    if (amount > 0) {
      rows.push({
        name,
        unit: 'total',
        coefficient: 1,
        unit_price: amount,
        type,
        isLegacySummary: true,
      });
    }
  });

  return rows;
}

function getItemComponents(item: MasterAhspItem): AhspComponent[] {
  if (Array.isArray(item.components) && item.components.length > 0) {
    return item.components.map((component) => ({ ...component }));
  }
  return buildLegacyComponents(item);
}

export default function MasterAhspPage() {
  const { loading: accessLoading, hasCompanyPermission } = useAppAccess();
  const canManageMaster = !accessLoading && hasCompanyPermission('rab.manage');

  const [items, setItems] = useState<MasterAhspItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [showSubitemManualForm, setShowSubitemManualForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingItem, setEditingItem] = useState<MasterAhspItem | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [workFieldCode, setWorkFieldCode] = useState(DEFAULT_FIELD_CODE);
  const [workDivisionCode, setWorkDivisionCode] = useState(DEFAULT_DIVISION_CODE);
  const [workSubcategoryCode, setWorkSubcategoryCode] = useState(DEFAULT_SUBCATEGORY_CODE);
  const [hierarchyDepth, setHierarchyDepth] = useState<WbsDepth>(DEFAULT_WBS_DEPTH);
  const [parentCode, setParentCode] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [autoCode, setAutoCode] = useState(true);
  const [classificationChanged, setClassificationChanged] = useState(true);
  const [components, setComponents] = useState<AhspComponent[]>([]);
  // Hanya harga material/upah yang benar-benar diedit pengguna yang dikirim
  // kembali ke Master Bahan/Master Upah; penyimpanan biasa tidak menimpa harga master.
  const [dirtyMaterialPrices, setDirtyMaterialPrices] = useState<Record<string, number>>({});
  // Hanya tarif upah yang benar-benar diedit pengguna dikirim ke Master Upah.
  const [dirtyUpahPrices, setDirtyUpahPrices] = useState<Record<string, number>>({});
  const [draggedComponentIndex, setDraggedComponentIndex] = useState<number | null>(null);
  const [subitems, setSubitems] = useState<AhspSubitem[]>([]);
  const [subitemCode, setSubitemCode] = useState('');
  const [subitemName, setSubitemName] = useState('');
  const [subitemUnit, setSubitemUnit] = useState('m1');
  const [subitemCoefficient, setSubitemCoefficient] = useState('1');
  const [subitemNotes, setSubitemNotes] = useState('');
  const [subitemComponents, setSubitemComponents] = useState<AhspComponent[]>([]);
  const [subitemCompType, setSubitemCompType] = useState<ComponentType>('material');
  const [subitemCompName, setSubitemCompName] = useState('');
  const [subitemCompUnit, setSubitemCompUnit] = useState('');
  const [subitemCompCoefficient, setSubitemCompCoefficient] = useState('1');
  const [subitemCompPrice, setSubitemCompPrice] = useState('0');
  const [subitemDirectPrice, setSubitemDirectPrice] = useState('0');
  const [subitemEditingIndex, setSubitemEditingIndex] = useState<number | null>(null);

  const [selectedCatalogItem, setSelectedCatalogItem] = useState<MasterCatalogItem | null>(null);
  const [coeffInput, setCoeffInput] = useState('1');
  const [compType, setCompType] = useState<ComponentType>('material');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<MasterCatalogItem[]>([]);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const [catalogErrors, setCatalogErrors] = useState<Record<ComponentType, string | null>>({
    material: null,
    labor: null,
    equipment: null,
  });
  const catalogRequestRef = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [showLegacyNotice, setShowLegacyNotice] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');

    try {
      // Halaman hanya mengambil data AHSP dan rincian komponennya.
      // Master Bahan/Upah/Alat dicari langsung dari Supabase saat pengguna mengetik,
      // sehingga ribuan baris katalog tidak diunduh sekaligus ke browser.
      const [ahspResult, componentResult, subitemResult] = await Promise.all([
        supabase.from('master_ahsp').select('*').order('code', { ascending: true }),
        supabase.from('master_ahsp_components').select('*').order('sort_order', { ascending: true }),
        supabase.from('master_ahsp_subitems').select('*').order('sort_order', { ascending: true }),
      ]);

      if (ahspResult.error) throw ahspResult.error;
      if (componentResult.error) throw componentResult.error;
      if (subitemResult.error) throw subitemResult.error;

      const componentRows = (componentResult.data ?? []) as AhspComponentDbRow[];
      const baseAhsp = ((ahspResult.data ?? []) as MasterAhspItem[]).map((ahsp) => {
        const relationalComponents = componentRows
          .filter((component) => component.ahsp_id === ahsp.id)
          .map((component) => ({
            ...component,
            coefficient: asNumber(component.coefficient),
            unit_price: asNumber(component.unit_price),
            subtotal: asNumber(component.coefficient) * asNumber(component.unit_price),
          }));

        // Migrasi bertahap: gunakan tabel relasional sebagai sumber utama.
        // JSONB tetap dibaca sebagai fallback untuk data sebelum migrasi relasional.
        const jsonComponents = Array.isArray(ahsp.components) ? ahsp.components : [];
        const activeComponents = relationalComponents.length
          ? relationalComponents
          : jsonComponents.length
            ? jsonComponents
            : buildLegacyComponents(ahsp);

        const sumType = (type: ComponentType) =>
          activeComponents
            .filter((component) => component.type === type)
            .reduce(
              (sum, component) =>
                sum + asNumber(component.coefficient) * asNumber(component.unit_price),
              0,
            );

        return {
          ...ahsp,
          labor_cost: sumType('labor'),
          material_cost: sumType('material'),
          equipment_cost: sumType('equipment'),
          // Nilai ini adalah biaya langsung, belum termasuk sub-item AHSP.
          total_price: sumType('labor') + sumType('material') + sumType('equipment'),
          components: activeComponents,
        };
      });

      const baseById = new Map(baseAhsp.map((row) => [row.id, row]));
      const subitemRows = (subitemResult.data ?? []) as Array<{
        id: string;
        parent_ahsp_id: string;
        child_ahsp_id?: string | null;
        code?: string | null;
        name?: string | null;
        unit?: string | null;
        coefficient: number | string;
        notes?: string | null;
        components?: AhspComponent[] | null;
        labor_cost?: number | string | null;
        material_cost?: number | string | null;
        equipment_cost?: number | string | null;
        total_price?: number | string | null;
        sort_order?: number;
      }>;
      const rowsByParent = new Map<string, typeof subitemRows>();
      subitemRows.forEach((row) => {
        const group = rowsByParent.get(row.parent_ahsp_id) ?? [];
        group.push(row);
        rowsByParent.set(row.parent_ahsp_id, group);
      });

      // Rekap biaya induk mencakup komponen langsung dan seluruh sub-item.
      // Biaya setiap sub-item dibobotkan dengan koefisiennya. Data relasi lama
      // (child_ahsp_id) tetap dihitung secara rekursif sebagai fallback.
      const breakdownCache = new Map<string, AhspCostBreakdown>();
      const getFullBreakdown = (
        id: string,
        visited = new Set<string>(),
      ): AhspCostBreakdown => {
        if (breakdownCache.has(id) && visited.size === 0) {
          return { ...breakdownCache.get(id)! };
        }

        const base = baseById.get(id);
        if (!base) return emptyCostBreakdown();

        const result: AhspCostBreakdown = {
          labor: asNumber(base.labor_cost),
          material: asNumber(base.material_cost),
          equipment: asNumber(base.equipment_cost),
          other: 0,
        };

        // Siklus data lama dicegah agar tidak menggandakan total.
        if (visited.has(id)) return result;

        const nextVisited = new Set(visited);
        nextVisited.add(id);

        (rowsByParent.get(id) ?? []).forEach((row) => {
          const rowComponents = Array.isArray(row.components) ? row.components : [];
          const legacyChild = row.child_ahsp_id ? baseById.get(row.child_ahsp_id) : undefined;
          let rowCost: AhspCostBreakdown;

          if (legacyChild) {
            rowCost = getFullBreakdown(legacyChild.id, nextVisited);
          } else if (rowComponents.length > 0) {
            rowCost = getComponentBreakdown(rowComponents);
          } else {
            rowCost = {
              labor: asNumber(row.labor_cost),
              material: asNumber(row.material_cost),
              equipment: asNumber(row.equipment_cost),
              other: 0,
            };
            const categorized = sumCostBreakdown(rowCost);
            const savedPrice = asNumber(row.total_price);
            rowCost.other = categorized > 0
              ? Math.max(0, savedPrice - categorized)
              : savedPrice;
          }

          const coefficient = asNumber(row.coefficient);
          result.labor += coefficient * rowCost.labor;
          result.material += coefficient * rowCost.material;
          result.equipment += coefficient * rowCost.equipment;
          result.other += coefficient * rowCost.other;
        });

        if (visited.size === 0) breakdownCache.set(id, { ...result });
        return result;
      };

      const getFullPrice = (id: string): number =>
        sumCostBreakdown(getFullBreakdown(id));

      const mappedAhsp = baseAhsp.map((ahsp) => {
        const fullBreakdown = getFullBreakdown(ahsp.id);
        const mappedSubitems = (rowsByParent.get(ahsp.id) ?? []).map((row) => {
          const legacyChild = row.child_ahsp_id ? baseById.get(row.child_ahsp_id) : undefined;
          const rowComponents = Array.isArray(row.components) && row.components.length > 0
            ? row.components
            : legacyChild?.components ?? [];
          const rowBreakdown = legacyChild
            ? getFullBreakdown(legacyChild.id)
            : rowComponents.length > 0
              ? getComponentBreakdown(rowComponents)
              : subitemCostBreakdown({
                  ...row,
                  components: [],
                } as AhspSubitem);
          const rowUnitPrice = sumCostBreakdown(rowBreakdown);

          return {
            ...row,
            code: row.code ?? legacyChild?.code ?? '',
            name: row.name ?? legacyChild?.name ?? '',
            unit: row.unit ?? legacyChild?.unit ?? '',
            components: rowComponents,
            labor_cost: rowBreakdown.labor,
            material_cost: rowBreakdown.material,
            equipment_cost: rowBreakdown.equipment,
            total_price: rowUnitPrice,
            child: legacyChild
              ? { ...legacyChild, total_price: getFullPrice(legacyChild.id) }
              : undefined,
          };
        });

        return {
          ...ahsp,
          labor_cost: fullBreakdown.labor,
          material_cost: fullBreakdown.material,
          equipment_cost: fullBreakdown.equipment,
          subitems: mappedSubitems,
          total_price: sumCostBreakdown(fullBreakdown),
        };
      });

      setItems(mappedAhsp);
    } catch (error) {
      console.error('Gagal memuat data Master AHSP:', error);
      setLoadError(`Gagal memuat database: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setIsModalOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, submitting]);

  const categories = useMemo(
    () => [
      'ALL',
      ...Array.from(
        new Set(items.map((item) => item.category?.trim() || 'Umum')),
      ).sort((a, b) => a.localeCompare(b, 'id')),
    ],
    [items],
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');

    return items.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.code.toLocaleLowerCase('id').includes(keyword) ||
        item.name.toLocaleLowerCase('id').includes(keyword) ||
        (item.category ?? '').toLocaleLowerCase('id').includes(keyword) ||
        formatCategoryValue(item.category).toLocaleLowerCase('id').includes(keyword);

      const matchesCategory =
        selectedCategory === 'ALL' ||
        (item.category?.trim() || 'Umum') === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  // Kategori dan subkategori ditampilkan sekali sebagai heading kelompok.
  // Baris AHSP di dalam kelompok selalu mengikuti urutan kode, bukan waktu input.
  const groupedItems = useMemo(() => groupMasterAhspItems(filteredItems), [filteredItems]);

  const selectedWorkField = getField(workFieldCode);
  const selectedWorkDivision = getDivision(workFieldCode, workDivisionCode);
  const workCategoryPath = makeCategoryPath(workFieldCode, workDivisionCode, workSubcategoryCode);
  const wbsRootCode = `${workFieldCode}.${workDivisionCode}.${workSubcategoryCode}`;
  const parentDepth = hierarchyDepth - 1;

  const parentCandidates = useMemo(() => {
    if (hierarchyDepth === 4) return [];
    const keyword = parentSearch.trim().toLocaleLowerCase('id');
    return items
      .filter((item) => {
        const parts = item.code.trim().split('.');
        const sameRoot = item.code.startsWith(`${wbsRootCode}.`);
        const correctDepth = parts.length === parentDepth;
        const matchesKeyword = !keyword ||
          item.code.toLocaleLowerCase('id').includes(keyword) ||
          item.name.toLocaleLowerCase('id').includes(keyword);
        return sameRoot && correctDepth && matchesKeyword;
      })
      .sort((a, b) => a.code.localeCompare(b.code, 'id'))
      .slice(0, 30);
  }, [items, hierarchyDepth, parentDepth, parentSearch, wbsRootCode]);

  const codeParent = hierarchyDepth === 4 ? wbsRootCode : parentCode;
  const generatedCode = useMemo(() => {
    if (!codeParent || (hierarchyDepth > 4 && !parentCode)) return '';
    const codes = items.map((item) => item.code);
    return nextHierarchicalCode(codeParent, hierarchyDepth, codes, formMode === 'edit' ? editingItem?.code : undefined);
  }, [codeParent, hierarchyDepth, items, formMode, editingItem, parentCode]);

  const calculatedLabor = useMemo(
    () =>
      components
        .filter((component) => component.type === 'labor')
        .reduce(
          (sum, component) =>
            sum + asNumber(component.coefficient) * asNumber(component.unit_price),
          0,
        ),
    [components],
  );

  const calculatedMaterial = useMemo(
    () =>
      components
        .filter((component) => component.type === 'material')
        .reduce(
          (sum, component) =>
            sum + asNumber(component.coefficient) * asNumber(component.unit_price),
          0,
        ),
    [components],
  );

  const calculatedEquipment = useMemo(
    () =>
      components
        .filter((component) => component.type === 'equipment')
        .reduce(
          (sum, component) =>
            sum + asNumber(component.coefficient) * asNumber(component.unit_price),
          0,
        ),
    [components],
  );

  const calculatedTotal = calculatedLabor + calculatedMaterial + calculatedEquipment;

  const searchCatalog = useCallback(async (
    type: ComponentType,
    keyword: string,
    offset = 0,
    append = false,
  ) => {
    const term = keyword.trim();
    if (term.length < 2) {
      setCatalogResults([]);
      setCatalogHasMore(false);
      setCatalogTotalCount(0);
      setCatalogErrors((current) => ({ ...current, [type]: null }));
      return;
    }

    const requestId = ++catalogRequestRef.current;
    if (append) setCatalogLoadingMore(true);
    else setCatalogRefreshing(true);
    setCatalogErrors((current) => ({ ...current, [type]: null }));

    try {
      // Menghindari karakter khusus yang dapat merusak sintaks filter .or PostgREST.
      const safeTerm = term.replace(/[,%()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!safeTerm) {
        setCatalogResults([]);
        setCatalogHasMore(false);
        setCatalogTotalCount(0);
        setCatalogRefreshing(false);
        setCatalogLoadingMore(false);
        return;
      }
      const pattern = `%${safeTerm}%`;
      const from = offset;
      const to = offset + CATALOG_PAGE_SIZE - 1;
      const columns = 'id, code, name, unit, unit_price, category';

      const query = type === 'material'
        ? supabase.from('master_materials').select(columns, { count: 'exact' })
        : type === 'labor'
          ? supabase.from('master_upah').select(columns, { count: 'exact' })
          : supabase.from('master_alat').select(columns, { count: 'exact' });

      const { data, error, count } = await query
        .or(`code.ilike.${pattern},name.ilike.${pattern},category.ilike.${pattern}`)
        .order('name', { ascending: true })
        .range(from, to);

      if (error) throw error;
      if (requestId !== catalogRequestRef.current) return;

      const rows = (data ?? []) as MasterCatalogItem[];
      setCatalogResults((current) => append ? [...current, ...rows] : rows);
      setCatalogTotalCount(count ?? (offset + rows.length));
      setCatalogHasMore(count !== null ? offset + rows.length < count : rows.length === CATALOG_PAGE_SIZE);
    } catch (error) {
      if (requestId !== catalogRequestRef.current) return;
      setCatalogErrors((current) => ({ ...current, [type]: errorMessage(error) }));
      if (!append) setCatalogResults([]);
      console.error(`Gagal mencari katalog ${type}:`, error);
    } finally {
      if (requestId === catalogRequestRef.current) {
        setCatalogRefreshing(false);
        setCatalogLoadingMore(false);
      }
    }
  }, []);

  // Pencarian dijalankan setelah pengguna berhenti mengetik selama 350 ms.
  // Minimal 2 karakter untuk menghindari mengambil seluruh katalog tanpa filter.
  useEffect(() => {
    if (!isModalOpen) return;

    catalogRequestRef.current += 1; // batalkan respons pencarian sebelumnya
    setCatalogResults([]);
    setCatalogHasMore(false);
    setCatalogTotalCount(0);
    setSelectedCatalogItem(null);
    setCatalogRefreshing(false);
    setCatalogLoadingMore(false);
    setCatalogErrors((current) => ({ ...current, [compType]: null }));

    const term = catalogSearch.trim();
    if (term.length < 2) {
      setCatalogRefreshing(false);
      setCatalogLoadingMore(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void searchCatalog(compType, term, 0, false);
    }, 350);

    return () => {
      window.clearTimeout(timer);
      catalogRequestRef.current += 1;
    };
  }, [catalogSearch, compType, isModalOpen, searchCatalog]);

  const loadMoreCatalog = () => {
    if (catalogLoadingMore || catalogRefreshing || !catalogHasMore) return;
    void searchCatalog(compType, catalogSearch, catalogResults.length, true);
  };

  const refreshCatalogSearch = () => {
    if (catalogSearch.trim().length >= 2) {
      void searchCatalog(compType, catalogSearch, 0, false);
    }
  };

  const handleComponentTypeChange = (type: ComponentType) => {
    catalogRequestRef.current += 1;
    setCompType(type);
    setCatalogSearch('');
    setCatalogResults([]);
    setSelectedCatalogItem(null);
    setCatalogHasMore(false);
    setCatalogTotalCount(0);
    setCatalogErrors((current) => ({ ...current, [type]: null }));
    setFormError('');
  };

  const resetComponentBuilder = () => {
    catalogRequestRef.current += 1;
    setSelectedCatalogItem(null);
    setCoeffInput('1');
    setCompType('material');
    setCatalogSearch('');
    setCatalogResults([]);
    setCatalogRefreshing(false);
    setCatalogLoadingMore(false);
    setCatalogHasMore(false);
    setCatalogTotalCount(0);
  };

  const openCreateModal = () => {
    if (!canManageMaster) return;
    setFormMode('create');
    setEditingItem(null);
    setDirtyMaterialPrices({});
    setDirtyUpahPrices({});
    setCode('');
    setName('');
    setUnit('');
    setWorkFieldCode(DEFAULT_FIELD_CODE);
    setWorkDivisionCode(DEFAULT_DIVISION_CODE);
    setWorkSubcategoryCode(DEFAULT_SUBCATEGORY_CODE);
    setHierarchyDepth(DEFAULT_WBS_DEPTH);
    setParentCode('');
    setParentSearch('');
    setAutoCode(true);
    setClassificationChanged(true);
    setCategory(makeCategoryPath(DEFAULT_FIELD_CODE, DEFAULT_DIVISION_CODE, DEFAULT_SUBCATEGORY_CODE));
    setComponents([]);
    setSubitems([]);
    resetSubitemDraft();
    setShowLegacyNotice(false);
    setFormError('');
    setCatalogSearch('');
    resetComponentBuilder();
    setWizardStep(0);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MasterAhspItem) => {
    if (!canManageMaster) return;
    const classification = classifyExistingItem(item.category || '', item.name || '');
    const validDepth = getHierarchicalCodeDepth(item.code || '', classification.fieldCode);
    const depth = validDepth ?? DEFAULT_WBS_DEPTH;
    const potentialParent = depth > 4 ? item.code.split('.').slice(0, -1).join('.') : '';

    setFormMode('edit');
    setEditingItem(item);
    setDirtyMaterialPrices({});
    setDirtyUpahPrices({});
    setCode(item.code ?? '');
    setName(item.name ?? '');
    setUnit(item.unit ?? '');
    setCategory(item.category || 'Umum');
    setWorkFieldCode(classification.fieldCode);
    setWorkDivisionCode(classification.divisionCode);
    setWorkSubcategoryCode(classification.subcategoryCode);
    setHierarchyDepth(depth);
    setParentCode(potentialParent);
    setParentSearch('');
    setAutoCode(false);
    setClassificationChanged(false);

    const savedComponents = getItemComponents(item);
    setComponents(savedComponents);
    setSubitems((item.subitems ?? []).map((entry) => ({
      ...entry,
      components: Array.isArray(entry.components) ? entry.components.map((component) => ({ ...component })) : [],
    })));
    resetSubitemDraft();
    setShowLegacyNotice(
      !Array.isArray(item.components) || item.components.length === 0,
    );

    setFormError('');
    resetComponentBuilder();
    // Buka langsung pada rincian bahan/upah/alat; identitas tetap dapat diakses melalui langkah sebelumnya.
    setWizardStep(1);
    setIsModalOpen(true);
  };

  const openDuplicateModal = (item: MasterAhspItem) => {
    if (!canManageMaster) return;
    const classification = classifyExistingItem(item.category || '', item.name || '');
    const validDepth = getHierarchicalCodeDepth(item.code || '', classification.fieldCode);
    const depth = validDepth ?? DEFAULT_WBS_DEPTH;
    const potentialParent = depth > 4 ? item.code.split('.').slice(0, -1).join('.') : '';
    const parentExists = !potentialParent || items.some((entry) => entry.code === potentialParent);

    setFormMode('duplicate');
    setEditingItem(null);
    setDirtyMaterialPrices({});
    setDirtyUpahPrices({});
    setCode('');
    setName(`${item.name} (Salinan)`);
    setUnit(item.unit ?? '');
    setWorkFieldCode(classification.fieldCode);
    setWorkDivisionCode(classification.divisionCode);
    setWorkSubcategoryCode(classification.subcategoryCode);
    setHierarchyDepth(parentExists ? depth : DEFAULT_WBS_DEPTH);
    setParentCode(parentExists ? potentialParent : '');
    setParentSearch('');
    setAutoCode(true);
    setClassificationChanged(true);
    setCategory(makeCategoryPath(classification.fieldCode, classification.divisionCode, classification.subcategoryCode));
    setComponents(getItemComponents(item));
    setSubitems((item.subitems ?? []).map((entry) => ({
      ...entry,
      id: undefined,
      parent_ahsp_id: undefined,
      child_ahsp_id: null,
      components: Array.isArray(entry.components) ? entry.components.map((component) => ({ ...component })) : [],
    })));
    resetSubitemDraft();
    setShowLegacyNotice(
      !Array.isArray(item.components) || item.components.length === 0,
    );

    setFormError('');
    resetComponentBuilder();
    setWizardStep(0);
    setIsModalOpen(true);
  };

  const handleWorkFieldChange = (nextFieldCode: string) => {
    const nextField = getField(nextFieldCode);
    const nextDivision = nextField.divisions.find((division) => division.code !== '00') ?? nextField.divisions[0];
    const nextSubcategory = nextDivision.subcategories[0];
    setWorkFieldCode(nextFieldCode);
    setWorkDivisionCode(nextDivision.code);
    setWorkSubcategoryCode(nextSubcategory.code);
    setHierarchyDepth(DEFAULT_WBS_DEPTH);
    setParentCode('');
    setParentSearch('');
    setClassificationChanged(true);
    setAutoCode(true);
    setFormError('');
  };

  const handleWorkDivisionChange = (nextDivisionCode: string) => {
    const nextDivision = getDivision(workFieldCode, nextDivisionCode);
    setWorkDivisionCode(nextDivisionCode);
    setWorkSubcategoryCode(nextDivision.subcategories[0]?.code ?? '01');
    setHierarchyDepth(DEFAULT_WBS_DEPTH);
    setParentCode('');
    setParentSearch('');
    setClassificationChanged(true);
    setAutoCode(true);
    setFormError('');
  };

  const handleWorkSubcategoryChange = (nextSubcategoryCode: string) => {
    setWorkSubcategoryCode(nextSubcategoryCode);
    setHierarchyDepth(DEFAULT_WBS_DEPTH);
    setParentCode('');
    setParentSearch('');
    setClassificationChanged(true);
    setAutoCode(true);
    setFormError('');
  };

  const handleWbsDepthChange = (nextDepth: WbsDepth) => {
    setHierarchyDepth(nextDepth);
    setParentCode('');
    setParentSearch('');
    setAutoCode(true);
    setFormError('');
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingItem(null);
    setDirtyMaterialPrices({});
    setDirtyUpahPrices({});
  };

  const addComponent = (target: 'parent' | 'subitem' = 'parent') => {
    if (!selectedCatalogItem) {
      setFormError('Cari dan pilih bahan, upah, atau alat terlebih dahulu.');
      return;
    }

    const selectedItem = selectedCatalogItem;
    const coefficient = Number(coeffInput);
    const price = Number(selectedItem.unit_price);

    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      setFormError('Indeks / Koefisien harus berupa angka lebih besar dari nol.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Harga komponen tidak valid. Periksa harga pada master terkait.');
      return;
    }

    // Relasi ID master disimpan bersama snapshot nama/satuan/harga.
    // Untuk sub-item, relasi ini ikut tersimpan dalam JSONB components.
    const component: AhspComponent = {
      ...(compType === 'material' ? { material_id: selectedItem.id } : {}),
      ...(compType === 'labor' ? { upah_id: selectedItem.id } : {}),
      ...(compType === 'equipment' ? { alat_id: selectedItem.id } : {}),
      name: selectedItem.name,
      unit: selectedItem.unit,
      coefficient,
      unit_price: price,
      subtotal: coefficient * price,
      type: compType,
      sort_order: target === 'parent'
        ? components.filter((entry) => entry.type === compType).length
        : subitemComponents.filter((entry) => entry.type === compType).length,
    };

    if (target === 'subitem') {
      setSubitemComponents((current) => [
        ...current,
        { ...component, sort_order: current.filter((entry) => entry.type === compType).length },
      ]);
    } else {
      setComponents((current) => [
        ...current,
        { ...component, sort_order: current.filter((entry) => entry.type === compType).length },
      ]);
    }

    setSelectedCatalogItem(null);
    setCoeffInput('1');
    setFormError('');
  };


  const updateComponent = (
    index: number,
    field: keyof AhspComponent,
    value: string,
  ) => {
    const currentComponent = components[index];
    if (field === 'unit_price' && currentComponent) {
      const parsedPrice = Number(value);
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        const normalizedPrice = Math.round(parsedPrice * 100) / 100;
        if (currentComponent.type === 'material' && currentComponent.material_id) {
          setDirtyMaterialPrices((current) => ({
            ...current,
            [currentComponent.material_id as string]: normalizedPrice,
          }));
        }
        if (currentComponent.type === 'labor' && currentComponent.upah_id) {
          setDirtyUpahPrices((current) => ({
            ...current,
            [currentComponent.upah_id as string]: normalizedPrice,
          }));
        }
      }
    }

    setComponents((current) =>
      current.map((component, currentIndex) => {
        if (currentIndex !== index) return component;

        if (field === 'coefficient' || field === 'unit_price') {
          return { ...component, [field]: value };
        }

        if (field === 'type') {
          return { ...component, type: value as ComponentType };
        }

        if (field === 'name' || field === 'unit') {
          return { ...component, [field]: value };
        }

        return component;
      }),
    );
    setFormError('');
  };

  const removeComponent = (index: number) => {
    setComponents((current) => sortComponentsByType(
      current.filter((_, currentIndex) => currentIndex !== index),
    ));
  };

  // Drag-and-drop hanya mengubah posisi baris material di dalam kelompok Bahan.
  // Kelompok Bahan/Upah/Alat tidak berpindah, dan Upah tetap diurutkan menurut tarif OH.
  const reorderMaterialComponent = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;

    setComponents((current) => {
      const materialRows = current
        .map((component, index) => ({ component, index }))
        .filter((entry) => entry.component.type === 'material')
        .sort((a, b) =>
          Number(a.component.sort_order ?? a.index) - Number(b.component.sort_order ?? b.index) ||
          a.index - b.index,
        );

      const sourcePosition = materialRows.findIndex((entry) => entry.index === sourceIndex);
      const targetPosition = materialRows.findIndex((entry) => entry.index === targetIndex);
      if (sourcePosition < 0 || targetPosition < 0) return current;

      const reorderedRows = [...materialRows];
      const [movingRow] = reorderedRows.splice(sourcePosition, 1);
      reorderedRows.splice(targetPosition, 0, movingRow);
      const orderByOriginalIndex = new Map(
        reorderedRows.map((entry, position) => [entry.index, position]),
      );

      return current.map((component, index) => component.type === 'material'
        ? { ...component, sort_order: orderByOriginalIndex.get(index) ?? Number(component.sort_order ?? 0) }
        : component,
      );
    });

    setDraggedComponentIndex(null);
    setFormError('');
  };

  const resetSubitemDraft = () => {
    setSubitemCode('');
    setSubitemName('');
    setSubitemUnit('m1');
    setSubitemCoefficient('1');
    setSubitemNotes('');
    setSubitemComponents([]);
    setSubitemCompType('material');
    setSubitemCompName('');
    setSubitemCompUnit('');
    setSubitemCompCoefficient('1');
    setSubitemCompPrice('0');
    setSubitemDirectPrice('0');
    setSubitemEditingIndex(null);
    setShowSubitemManualForm(false);
  };

  const addSubitemComponent = () => {
    const nameValue = subitemCompName.trim();
    const unitValue = subitemCompUnit.trim();
    const coefficient = Number(subitemCompCoefficient);
    const unitPrice = Number(subitemCompPrice);
    if (!nameValue || !unitValue || !Number.isFinite(coefficient) || coefficient <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setFormError('Lengkapi nama, satuan, koefisien, dan harga komponen sub-item dengan benar.');
      return;
    }
    setSubitemComponents((current) => [
      ...current,
      {
        name: nameValue,
        unit: unitValue,
        coefficient,
        unit_price: unitPrice,
        subtotal: coefficient * unitPrice,
        type: subitemCompType,
        sort_order: current.length,
      },
    ]);
    setSubitemCompName('');
    setSubitemCompUnit('');
    setSubitemCompCoefficient('1');
    setSubitemCompPrice('0');
    setFormError('');
  };

  const removeSubitemComponent = (index: number) => {
    setSubitemComponents((current) => current.filter((_, i) => i !== index));
  };

  const editSubitem = (index: number) => {
    const entry = subitems[index];
    setSubitemCode(entry.code ?? '');
    setSubitemName(entry.name ?? '');
    setSubitemUnit(entry.unit ?? '');
    setSubitemCoefficient(String(entry.coefficient ?? 1));
    setSubitemNotes(entry.notes ?? '');
    setSubitemComponents((entry.components ?? []).map((component) => ({ ...component })));
    setSubitemDirectPrice(String(entry.total_price ?? 0));
    setSubitemEditingIndex(index);
    setShowSubitemManualForm(false);
    setFormError('');
  };

  const calculatedSubitemTotal = useMemo(
    () => subitems.reduce((sum, entry) => sum + asNumber(entry.coefficient) * subitemUnitPrice(entry), 0),
    [subitems],
  );

  const addSubitem = () => {
    const cleanSubitemName = subitemName.trim();
    const cleanSubitemUnit = subitemUnit.trim();
    const coefficient = Number(subitemCoefficient);
    const directPrice = Number(subitemDirectPrice);
    if (!cleanSubitemName || !cleanSubitemUnit) {
      setFormError('Nama dan satuan sub-item wajib diisi.');
      return;
    }
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      setFormError('Koefisien sub-item harus lebih besar dari nol.');
      return;
    }
    if (!Number.isFinite(directPrice) || directPrice < 0) {
      setFormError('Harga langsung sub-item tidak valid.');
      return;
    }

    const normalized = subitemComponents.map((component, index) => ({
      ...(component.material_id ? { material_id: component.material_id } : {}),
      ...(component.upah_id ? { upah_id: component.upah_id } : {}),
      ...(component.alat_id ? { alat_id: component.alat_id } : {}),
      name: component.name.trim(),
      unit: component.unit.trim(),
      coefficient: Number(component.coefficient),
      unit_price: Number(component.unit_price),
      subtotal: Number(component.coefficient) * Number(component.unit_price),
      type: component.type,
      sort_order: index,
    }));
    if (normalized.some((component) =>
      !component.name || !component.unit ||
      !Number.isFinite(component.coefficient) || component.coefficient <= 0 ||
      !Number.isFinite(component.unit_price) || component.unit_price < 0
    )) {
      setFormError('Periksa komponen sub-item. Koefisien harus positif dan harga tidak boleh negatif.');
      return;
    }

    const componentTotal = normalized.reduce((sum, component) => sum + component.subtotal, 0);
    const price = normalized.length > 0 ? componentTotal : directPrice;
    const draft: AhspSubitem = {
      code: subitemCode.trim(),
      name: cleanSubitemName,
      unit: cleanSubitemUnit,
      coefficient,
      notes: subitemNotes.trim() || null,
      components: normalized,
      labor_cost: normalized.filter((row) => row.type === 'labor').reduce((sum, row) => sum + row.subtotal, 0),
      material_cost: normalized.filter((row) => row.type === 'material').reduce((sum, row) => sum + row.subtotal, 0),
      equipment_cost: normalized.filter((row) => row.type === 'equipment').reduce((sum, row) => sum + row.subtotal, 0),
      total_price: price,
      sort_order: subitemEditingIndex ?? subitems.length,
      child_ahsp_id: null,
    };
    setSubitems((current) => {
      if (subitemEditingIndex === null) return [...current, draft];
      return current.map((entry, index) => index === subitemEditingIndex ? draft : entry);
    });
    resetSubitemDraft();
    setFormError('');
  };

  const removeSubitem = (index: number) => {
    setSubitems((current) => current.filter((_, i) => i !== index));
    if (subitemEditingIndex === index) resetSubitemDraft();
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageMaster) {
      setFormError('Hanya Direktur/Administrator perusahaan yang dapat mengubah Master AHSP.');
      return;
    }
    if (submitting) return;

    const cleanName = name.trim();
    const cleanUnit = unit.trim();
    const cleanCategory = classificationChanged || formMode !== 'edit'
      ? workCategoryPath
      : category.trim();
    let cleanCode = autoCode ? generatedCode : code.trim();

    if (!cleanName || !cleanCategory) {
      setFormError('Nama pekerjaan dan klasifikasi pekerjaan wajib diisi.');
      setWizardStep(0);
      return;
    }
    if (autoCode && hierarchyDepth > 4 && !parentCode) {
      setFormError('Pilih pekerjaan induk terlebih dahulu untuk membuat kode sub-item.');
      setWizardStep(0);
      return;
    }
    if (!cleanCode) {
      setFormError('Kode AHSP belum tersedia. Periksa klasifikasi, tingkat hirarki, dan pekerjaan induknya.');
      setWizardStep(0);
      return;
    }

    const normalizedComponents: AhspComponent[] = [];
    for (const component of components) {
      const coefficient = Number(component.coefficient);
      const price = Number(component.unit_price);

      if (
        !component.name.trim() ||
        !component.unit.trim() ||
        !Number.isFinite(coefficient) ||
        coefficient <= 0 ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        setFormError('Periksa nama dan satuan setiap komponen. Indeks/koefisien harus lebih besar dari nol, sedangkan harga tidak boleh negatif.');
        return;
      }

      const hasMaterialId = Boolean(component.material_id);
      const hasUpahId = Boolean(component.upah_id);
      const hasAlatId = Boolean(component.alat_id);
      const relationCount = Number(hasMaterialId) + Number(hasUpahId) + Number(hasAlatId);

      if (
        relationCount > 1 ||
        (hasMaterialId && component.type !== 'material') ||
        (hasUpahId && component.type !== 'labor') ||
        (hasAlatId && component.type !== 'equipment')
      ) {
        setFormError(
          `Relasi master pada komponen "${component.name}" tidak cocok dengan jenis ${component.type}. Hapus baris tersebut dan tambahkan ulang dari master yang benar.`,
        );
        return;
      }

      normalizedComponents.push({
        ...(component.material_id ? { material_id: component.material_id } : {}),
        ...(component.upah_id ? { upah_id: component.upah_id } : {}),
        ...(component.alat_id ? { alat_id: component.alat_id } : {}),
        name: component.name.trim(),
        unit: component.unit.trim(),
        coefficient,
        unit_price: price,
        subtotal: coefficient * price,
        type: component.type,
        sort_order: Number(component.sort_order ?? normalizedComponents.length),
        ...(component.isLegacySummary ? { isLegacySummary: true } : {}),
      });
    }

    // Pertahankan urutan baris material hasil drag-and-drop pengguna.
    // Kelompok tetap Bahan -> Upah -> Alat; sort_order disimpan pada master_ahsp_components.
    let orderedComponents = sortComponentsByType(normalizedComponents);

    // Bangun daftar harga global hanya dari baris material yang harga satuannya
    // disentuh pengguna pada sesi edit ini. Jika material yang sama muncul lebih
    // dari sekali dalam satu AHSP, semua baris tersebut memakai harga yang sama.
    const materialPriceUpdates = new Map<string, number>();
    for (const component of orderedComponents) {
      const materialId = component.material_id;
      if (!materialId || !Object.prototype.hasOwnProperty.call(dirtyMaterialPrices, materialId)) continue;
      const nextPrice = Math.round(Number(dirtyMaterialPrices[materialId]) * 100) / 100;
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        setFormError(`Harga material "${component.name}" tidak valid.`);
        return;
      }
      const previousPrice = materialPriceUpdates.get(materialId);
      if (previousPrice !== undefined && Math.abs(previousPrice - nextPrice) > 0.001) {
        setFormError(`Material "${component.name}" muncul lebih dari sekali dengan harga berbeda. Samakan harga komponen tersebut terlebih dahulu.`);
        return;
      }
      materialPriceUpdates.set(materialId, nextPrice);
    }
    if (materialPriceUpdates.size > 0) {
      orderedComponents = orderedComponents.map((component) => {
        const nextPrice = component.material_id ? materialPriceUpdates.get(component.material_id) : undefined;
        if (nextPrice === undefined) return component;
        return {
          ...component,
          unit_price: nextPrice,
          subtotal: asNumber(component.coefficient) * nextPrice,
        };
      });
    }

    // Tarif Upah Harian/tenaga kerja yang diedit dari komponen AHSP
    // menjadi harga global untuk seluruh pemakaian upah_id yang sama.
    const upahPriceUpdates = new Map<string, number>();
    for (const component of orderedComponents) {
      const upahId = component.upah_id;
      if (!upahId || !Object.prototype.hasOwnProperty.call(dirtyUpahPrices, upahId)) continue;
      const nextPrice = Math.round(Number(dirtyUpahPrices[upahId]) * 100) / 100;
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        setFormError(`Tarif upah "${component.name}" tidak valid.`);
        return;
      }
      const previousPrice = upahPriceUpdates.get(upahId);
      if (previousPrice !== undefined && Math.abs(previousPrice - nextPrice) > 0.001) {
        setFormError(`Upah "${component.name}" muncul lebih dari sekali dengan tarif berbeda. Samakan tarif komponen tersebut terlebih dahulu.`);
        return;
      }
      upahPriceUpdates.set(upahId, nextPrice);
    }
    if (upahPriceUpdates.size > 0) {
      orderedComponents = orderedComponents.map((component) => {
        const nextPrice = component.upah_id ? upahPriceUpdates.get(component.upah_id) : undefined;
        if (nextPrice === undefined) return component;
        return {
          ...component,
          unit_price: nextPrice,
          subtotal: asNumber(component.coefficient) * nextPrice,
        };
      });
    }

    const labor = orderedComponents
      .filter((component) => component.type === 'labor')
      .reduce(
        (sum, component) => sum + asNumber(component.coefficient) * asNumber(component.unit_price),
        0,
      );

    const material = orderedComponents
      .filter((component) => component.type === 'material')
      .reduce(
        (sum, component) => sum + asNumber(component.coefficient) * asNumber(component.unit_price),
        0,
      );

    const equipment = orderedComponents
      .filter((component) => component.type === 'equipment')
      .reduce(
        (sum, component) => sum + asNumber(component.coefficient) * asNumber(component.unit_price),
        0,
      );

    const normalizedSubitems: AhspSubitem[] = [];
    for (const entry of subitems) {
      const coefficient = Number(entry.coefficient);
      const subitemNameValue = String(entry.name ?? '').trim();
      const subitemUnitValue = String(entry.unit ?? '').trim();
      const subitemComponentsValue = Array.isArray(entry.components) ? entry.components : [];
      if (!subitemNameValue || !subitemUnitValue || !Number.isFinite(coefficient) || coefficient <= 0) {
        setFormError('Setiap sub-item harus memiliki uraian, satuan, dan koefisien positif.');
        return;
      }
      const normalizedChildComponents = subitemComponentsValue.map((component, index) => {
        const materialPrice = component.material_id
          ? materialPriceUpdates.get(component.material_id)
          : undefined;
        const upahPrice = component.upah_id
          ? upahPriceUpdates.get(component.upah_id)
          : undefined;
        const nextPrice = materialPrice ?? upahPrice ?? Number(component.unit_price);
        return {
          ...(component.material_id ? { material_id: component.material_id } : {}),
          ...(component.upah_id ? { upah_id: component.upah_id } : {}),
          ...(component.alat_id ? { alat_id: component.alat_id } : {}),
          name: component.name.trim(),
          unit: component.unit.trim(),
          coefficient: Number(component.coefficient),
          unit_price: nextPrice,
          subtotal: Number(component.coefficient) * nextPrice,
          type: component.type,
          sort_order: index,
        };
      });
      if (normalizedChildComponents.some((component) =>
        !component.name || !component.unit ||
        !Number.isFinite(component.coefficient) || component.coefficient <= 0 ||
        !Number.isFinite(component.unit_price) || component.unit_price < 0
      )) {
        setFormError(`Periksa komponen pada sub-item "${subitemNameValue}".`);
        return;
      }
      const componentsTotal = normalizedChildComponents.reduce((sum, component) => sum + component.subtotal, 0);
      const fallbackDirectPrice = Number(entry.total_price ?? 0);
      const childPrice = normalizedChildComponents.length > 0 ? componentsTotal : fallbackDirectPrice;
      if (!Number.isFinite(childPrice) || childPrice < 0) {
        setFormError(`Harga sub-item "${subitemNameValue}" tidak valid.`);
        return;
      }
      normalizedSubitems.push({
        code: String(entry.code ?? '').trim(),
        name: subitemNameValue,
        unit: subitemUnitValue,
        coefficient,
        notes: entry.notes?.trim() || null,
        components: normalizedChildComponents as AhspComponent[],
        labor_cost: normalizedChildComponents.filter((row) => row.type === 'labor').reduce((sum, row) => sum + row.subtotal, 0),
        material_cost: normalizedChildComponents.filter((row) => row.type === 'material').reduce((sum, row) => sum + row.subtotal, 0),
        equipment_cost: normalizedChildComponents.filter((row) => row.type === 'equipment').reduce((sum, row) => sum + row.subtotal, 0),
        total_price: childPrice,
        child_ahsp_id: null,
        sort_order: normalizedSubitems.length,
      });
    }

    if (!cleanUnit && normalizedSubitems.length === 0) {
      setFormError('Satuan induk boleh dikosongkan jika AHSP memiliki sub-item pekerjaan. AHSP tanpa satuan hanya berfungsi sebagai kelompok dan tidak dapat dipilih langsung ke RAB.');
      setWizardStep(2);
      return;
    }

    const subitemTotal = normalizedSubitems.reduce(
      (sum, entry) => sum + asNumber(entry.coefficient) * subitemUnitPrice(entry), 0,
    );
    const total = labor + material + equipment + subitemTotal;

    if (![labor, material, equipment, subitemTotal, total].every(Number.isFinite)) {
      setFormError('Hasil kalkulasi tidak valid. Periksa nilai koefisien dan harga.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      code: cleanCode,
      name: cleanName,
      unit: cleanUnit || null,
      category: cleanCategory,
      labor_cost: labor,
      material_cost: material,
      equipment_cost: equipment,
      total_price: total,
      components: orderedComponents,
    };

    try {
      // Kode otomatis dihitung ulang dari kode yang benar-benar tersimpan di database
      // agar nomor berikutnya tidak hanya bergantung pada data yang sudah tampil di layar.
      if (autoCode) {
        const codeParentBase = hierarchyDepth === 4 ? wbsRootCode : parentCode;
        const { data: siblingRows, error: siblingError } = await supabase
          .from('master_ahsp')
          .select('code')
          .like('code', `${codeParentBase}.%`);
        if (siblingError) throw siblingError;
        cleanCode = nextHierarchicalCode(
          codeParentBase,
          hierarchyDepth,
          (siblingRows ?? []).map((row) => String(row.code ?? '')),
          formMode === 'edit' ? editingItem?.code : undefined,
        );
      }

      const { data: duplicateRows, error: duplicateCheckError } = await supabase
        .from('master_ahsp')
        .select('id')
        .eq('code', cleanCode)
        .limit(2);
      if (duplicateCheckError) throw duplicateCheckError;
      const conflictingCode = (duplicateRows ?? []).some((row) => row.id !== editingItem?.id);
      if (conflictingCode) throw new Error(`Kode AHSP ${cleanCode} sudah digunakan. Segarkan data dan simpan kembali.`);
      payload.code = cleanCode;

      // Jika harga bahan/upah dikoreksi dari AHSP, tulis ke katalog pusat.
      // Trigger SQL menyebarkan harga ke semua AHSP terkait lewat material_id/upah_id.
      let syncedMaterialCount = 0;
      for (const [materialId, unitPrice] of materialPriceUpdates.entries()) {
        const { data: updatedMaterial, error: materialUpdateError } = await supabase
          .from('master_materials')
          .update({
            unit_price: unitPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', materialId)
          .select('id')
          .maybeSingle();

        if (materialUpdateError) throw materialUpdateError;
        if (!updatedMaterial?.id) {
          throw new Error(
            `Harga Master Bahan tidak berhasil diperbarui untuk ID ${materialId}. Periksa relasi material_id dan hak akses UPDATE pada tabel master_materials.`,
          );
        }
        syncedMaterialCount += 1;
      }

      let syncedUpahCount = 0;
      for (const [upahId, unitPrice] of upahPriceUpdates.entries()) {
        const { data: updatedUpah, error: upahUpdateError } = await supabase
          .from('master_upah')
          .update({
            unit_price: unitPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', upahId)
          .select('id')
          .maybeSingle();

        if (upahUpdateError) throw upahUpdateError;
        if (!updatedUpah?.id) {
          throw new Error(
            `Tarif Master Upah tidak berhasil diperbarui untuk ID ${upahId}. Periksa relasi upah_id dan hak akses UPDATE pada tabel master_upah.`,
          );
        }
        syncedUpahCount += 1;
      }

      let targetAhspId: string;

      if (formMode === 'edit' && editingItem) {
        const { error } = await supabase
          .from('master_ahsp')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        targetAhspId = editingItem.id;
      } else {
        const { data, error } = await supabase
          .from('master_ahsp')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!data?.id) throw new Error('ID AHSP baru tidak dikembalikan oleh database.');
        targetAhspId = data.id;
      }

      // Sinkronisasi tabel relasional. Kolom JSONB components di master_ahsp
      // dipertahankan untuk kompatibilitas; tabel komponen relasional menjadi
      // sumber utama bagi editor, daftar AHSP, dan snapshot proyek.
      if (formMode === 'edit') {
        const { error: deleteError } = await supabase
          .from('master_ahsp_components')
          .delete()
          .eq('ahsp_id', targetAhspId);
        if (deleteError) throw deleteError;
      }

      if (orderedComponents.length > 0) {
        const relationalRows = orderedComponents.map((component, index) => ({
          ahsp_id: targetAhspId,
          material_id: component.material_id ?? null,
          upah_id: component.upah_id ?? null,
          alat_id: component.alat_id ?? null,
          name: component.name,
          unit: component.unit,
          coefficient: asNumber(component.coefficient),
          unit_price: asNumber(component.unit_price),
          subtotal: asNumber(component.coefficient) * asNumber(component.unit_price),
          type: component.type,
          sort_order: index,
        }));

        const { error: componentInsertError } = await supabase
          .from('master_ahsp_components')
          .insert(relationalRows);
        if (componentInsertError) throw componentInsertError;
      }

      // Simpan relasi sub-item pekerjaan yang masing-masing dapat memiliki satuan AHSP berbeda.
      if (formMode === 'edit') {
        const { error: deleteSubitemsError } = await supabase
          .from('master_ahsp_subitems')
          .delete()
          .eq('parent_ahsp_id', targetAhspId);
        if (deleteSubitemsError) throw deleteSubitemsError;
      }
      if (normalizedSubitems.length > 0) {
        const subitemRowsToInsert = normalizedSubitems.map((entry, index) => ({
          parent_ahsp_id: targetAhspId,
          // Sub-item baru sepenuhnya mandiri dan tidak wajib terhubung ke AHSP lain.
          child_ahsp_id: null,
          code: entry.code ?? null,
          name: entry.name,
          unit: entry.unit,
          coefficient: asNumber(entry.coefficient),
          notes: entry.notes ?? null,
          components: entry.components ?? [],
          labor_cost: asNumber(entry.labor_cost),
          material_cost: asNumber(entry.material_cost),
          equipment_cost: asNumber(entry.equipment_cost),
          total_price: asNumber(entry.total_price),
          sort_order: index,
        }));
        const { error: subitemInsertError } = await supabase
          .from('master_ahsp_subitems')
          .insert(subitemRowsToInsert);
        if (subitemInsertError) throw subitemInsertError;
      }

      const savedMode = formMode;
      setIsModalOpen(false);
      setEditingItem(null);
      setDirtyMaterialPrices({});
      setDirtyUpahPrices({});
      await loadData(true);

      const baseMessage = savedMode === 'edit'
        ? 'Master AHSP dan rincian komponen berhasil diperbarui.'
        : savedMode === 'duplicate'
          ? 'AHSP berhasil diduplikasi sebagai master baru beserta rincian komponennya.'
          : 'Master AHSP berhasil ditambahkan beserta rincian komponennya.';
      const syncMessages: string[] = [];
      if (syncedMaterialCount > 0) {
        syncMessages.push(`${syncedMaterialCount} harga material diperbarui di Master Bahan dan seluruh AHSP yang terhubung.`);
      }
      if (syncedUpahCount > 0) {
        syncMessages.push(`${syncedUpahCount} tarif upah diperbarui di Master Upah dan seluruh AHSP yang terhubung.`);
      }
      const syncMessage = syncMessages.length ? `\n\nSinkronisasi global:\n${syncMessages.join('\n')}` : '';
      window.alert(`${baseMessage}${syncMessage}`);
    } catch (error) {
      console.error('Gagal menyimpan Master AHSP:', error);
      const message = errorMessage(error);
      setFormError(
        message.includes('42703') || message.toLowerCase().includes('components')
          ? 'Kolom components belum tersedia. Jalankan file SQL migrasi yang disertakan, lalu coba lagi.'
          : message.includes('23505') || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('sudah digunakan')
            ? `Kode analisa sudah terdaftar (${cleanCode}). Segarkan data atau pilih induk/tingkat hirarki lain.`
            : `Gagal menyimpan Master AHSP: ${message}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: MasterAhspItem) => {
    if (!canManageMaster) return;
    const confirmed = window.confirm(
      `Hapus AHSP "${item.code} - ${item.name}" dari database master? Tindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('master_ahsp')
        .delete()
        .eq('id', item.id);
      if (error) throw error;

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      window.alert('Master AHSP berhasil dihapus.');
    } catch (error) {
      console.error('Gagal menghapus Master AHSP:', error);
      window.alert(`Gagal menghapus Master AHSP: ${errorMessage(error)}`);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('ALL');
  };

  const wizardSteps = [
    { label: 'Identitas', hint: 'Kode & klasifikasi' },
    { label: 'Komponen induk', hint: 'Bahan, upah, alat' },
    { label: 'Sub-item', hint: 'Rincian pekerjaan' },
    { label: 'Rekap & simpan', hint: 'Periksa total' },
  ];

  const handleWizardNext = () => {
    setFormError('');
    if (wizardStep === 0) {
      const cleanName = name.trim();
      const cleanCategory = classificationChanged || formMode !== 'edit'
        ? workCategoryPath
        : category.trim();
      const proposedCode = (autoCode ? generatedCode : code).trim();
      if (!cleanName || !cleanCategory || !proposedCode) {
        setFormError('Lengkapi uraian, klasifikasi, dan kode AHSP pada tahap Identitas.');
        return;
      }
      if (autoCode && hierarchyDepth > 4 && !parentCode) {
        setFormError('Pilih pekerjaan induk WBS terlebih dahulu.');
        return;
      }
    }
    if (wizardStep === 2 && !unit.trim() && subitems.length === 0) {
      setFormError('AHSP tanpa satuan harus memiliki minimal satu sub-item pekerjaan.');
      return;
    }
    setSelectedCatalogItem(null);
    setCoeffInput('1');
    setWizardStep((current) => Math.min(3, current + 1));
  };

  const renderCatalogPicker = (target: 'parent' | 'subitem') => (
    <section className="relative z-30 isolate flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Ambil dari database master</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Komponen akan menyimpan ID master dan snapshot harga saat ini.
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${target === 'subitem' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
          Tujuan: {target === 'subitem' ? 'Sub-item' : 'Induk'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          { value: 'material', label: 'Bahan' },
          { value: 'labor', label: 'Upah' },
          { value: 'equipment', label: 'Alat' },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleComponentTypeChange(option.value)}
            className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${compType === option.value ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative z-40 mt-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={compType === 'material' ? 'Cari bahan / kode...' : compType === 'labor' ? 'Cari tenaga kerja / kode...' : 'Cari alat / kode...'}
              autoComplete="off"
              aria-label={`Cari ${compType === 'material' ? 'bahan' : compType === 'labor' ? 'upah' : 'alat'}`}
              aria-expanded={catalogSearch.trim().length >= 2 && !selectedCatalogItem}
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={refreshCatalogSearch}
            disabled={catalogRefreshing || catalogSearch.trim().length < 2}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Cari ulang dari database"
          >
            <RefreshCw className={`h-4 w-4 ${catalogRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
          <span>{compType === 'material' ? 'MASTER BAHAN' : compType === 'labor' ? 'MASTER UPAH' : 'MASTER ALAT'}</span>
          <span>{catalogRefreshing ? 'Mencari...' : catalogSearch.trim().length >= 2 ? `${catalogResults.length}/${catalogTotalCount} hasil` : 'Minimal 2 karakter'}</span>
        </div>

        {catalogSearch.trim().length >= 2 && !selectedCatalogItem && (
          <div
            role="listbox"
            aria-label="Hasil pencarian katalog"
            className="absolute left-0 right-12 top-full z-[100] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/10"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-600">
              <span>{compType === 'material' ? 'HASIL BAHAN' : compType === 'labor' ? 'HASIL UPAH' : 'HASIL ALAT'}</span>
              <span>{catalogResults.length} dari {catalogTotalCount}</span>
            </div>
            <div className="max-h-[min(42vh,320px)] overflow-y-auto overscroll-contain bg-white">
              {catalogErrors[compType] ? (
                <div role="alert" className="p-3 text-xs text-rose-700">
                  Gagal membaca master: {catalogErrors[compType]}
                  <p className="mt-1 text-[10px]">Periksa koneksi Supabase dan izin SELECT/RLS.</p>
                </div>
              ) : catalogRefreshing && catalogResults.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Mengambil data database...
                </div>
              ) : catalogResults.length === 0 ? (
                <p className="p-7 text-center text-xs text-slate-500">Data tidak ditemukan. Periksa kata kunci atau master terkait.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {((catalogResults as MasterCatalogItem[]) ?? []).map((item) => {
                    const active = (selectedCatalogItem as MasterCatalogItem | null)?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => { setSelectedCatalogItem(item); setFormError(''); }}
                        className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition ${active ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : 'hover:bg-slate-50'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[10px] font-bold text-emerald-700">{item.code}</span>
                          <span className="mt-0.5 block whitespace-normal break-words text-xs font-semibold leading-5 text-slate-900">{item.name}</span>
                          <span className="mt-0.5 block whitespace-normal text-[10px] leading-4 text-slate-500">Satuan: {item.unit}{item.category ? ` · ${item.category}` : ''}</span>
                        </span>
                        <span className="shrink-0 pl-2 text-right">
                          <span className="block text-xs font-bold tabular-nums text-slate-800">{formatRupiah(asNumber(item.unit_price))}</span>
                          {active && <Check className="ml-auto mt-1 h-3.5 w-3.5 text-emerald-600" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {catalogHasMore && (
              <button
                type="button"
                onClick={loadMoreCatalog}
                disabled={catalogLoadingMore}
                className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {catalogLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {catalogLoadingMore ? 'Memuat...' : 'Muat lebih banyak hasil'}
              </button>
            )}
          </div>
        )}
        {catalogSearch.trim().length < 2 && !selectedCatalogItem && (
          <p className="mt-1 text-[10px] text-slate-400">Ketik minimal 2 karakter. Hasil pencarian akan muncul di atas panel berikutnya.</p>
        )}
      </div>

      <div className="relative z-0 mt-3 rounded-lg bg-slate-50 p-3">
        {selectedCatalogItem ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Pilihan komponen</p>
              <p className="whitespace-normal break-words text-xs font-bold leading-5 text-slate-800">{selectedCatalogItem.name}</p>
              <p className="text-[10px] text-slate-500">{selectedCatalogItem.code} · {selectedCatalogItem.unit} · {formatRupiah(asNumber(selectedCatalogItem.unit_price))}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="text-[10px] font-semibold text-slate-600">
                Koef.
                <input type="number" min="0.000001" step="any" value={coeffInput} onChange={(event) => setCoeffInput(event.target.value)} className="mt-1 w-20 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right text-xs" />
              </label>
              <button
                type="button"
                onClick={() => addComponent(target)}
                className={`mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white ${target === 'subitem' ? 'bg-violet-700 hover:bg-violet-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <Plus className="h-3.5 w-3.5" /> Tambahkan
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Pilih satu baris hasil pencarian, tentukan koefisien, lalu tambahkan ke {target === 'subitem' ? 'sub-item' : 'AHSP induk'}.</p>
        )}
      </div>
    </section>
  );

  const identity = (
    <section className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Identitas AHSP</p>
          <h3 className="mt-1 text-sm font-bold text-slate-800">Data dasar dan kode analisa</h3>
        </div>

        <div className="space-y-4">
          <label className="block text-[11px] font-semibold text-slate-700">
            Nama pekerjaan / uraian AHSP *
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={250}
              placeholder="Contoh: Pekerjaan Beton Bertulang 1 m3"
              className={`${INPUT_CLASS} mt-1`}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-slate-700">
              Satuan utama
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={30}
                placeholder="m3, m2, bh, ls"
                className={`${INPUT_CLASS} mt-1`}
              />
            </label>

            <div className="text-[11px] font-semibold text-slate-700">
              <span className="block">Mode kode</span>
              <div className="mt-1 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setAutoCode(true)}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${autoCode ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-white'}`}
                >
                  Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setAutoCode(false)}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${!autoCode ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-white'}`}
                >
                  Manual
                </button>
              </div>
            </div>
          </div>

          <label className="block text-[11px] font-semibold text-slate-700">
            {autoCode ? 'Kode otomatis usulan' : 'Kode manual AHSP *'}
            <input
              value={autoCode ? generatedCode : code}
              onChange={(event) => setCode(event.target.value)}
              disabled={autoCode}
              className={`${INPUT_CLASS} mt-1 ${autoCode ? 'bg-slate-100 text-slate-500' : ''}`}
              placeholder="BG.02.02.001"
            />
          </label>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">
            <p className="font-semibold">Kode saat ini</p>
            <p className="mt-1 font-mono text-xs">{autoCode ? generatedCode || 'Belum tersedia' : code || 'Belum diisi'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Klasifikasi WBS</p>
          <h3 className="mt-1 text-sm font-bold text-slate-800">Rumpun pekerjaan dan hirarki</h3>
        </div>

        <div className="space-y-4">
          <label className="block text-[11px] font-semibold text-slate-700">
            Bidang pekerjaan
            <select
              value={workFieldCode}
              onChange={(event) => handleWorkFieldChange(event.target.value)}
              className={`${INPUT_CLASS} mt-1`}
            >
              {WORK_FIELDS.map((field) => (
                <option key={field.code} value={field.code}>{field.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-slate-700">
              Divisi
              <select
                value={workDivisionCode}
                onChange={(event) => handleWorkDivisionChange(event.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              >
                {selectedWorkField.divisions.map((division) => (
                  <option key={division.code} value={division.code}>D{division.code} {division.label}</option>
                ))}
              </select>
            </label>

            <label className="block text-[11px] font-semibold text-slate-700">
              Sub-kategori
              <select
                value={workSubcategoryCode}
                onChange={(event) => handleWorkSubcategoryChange(event.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              >
                {selectedWorkDivision.subcategories.map((subcategory) => (
                  <option key={subcategory.code} value={subcategory.code}>{subcategory.code} {subcategory.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-slate-700">
              Tingkat hirarki WBS
              <select
                value={hierarchyDepth}
                onChange={(event) => handleWbsDepthChange(Number(event.target.value) as WbsDepth)}
                className={`${INPUT_CLASS} mt-1`}
              >
                {[4, 5, 6, 7].map((depth) => (
                  <option key={depth} value={depth}>Depth {depth}</option>
                ))}
              </select>
            </label>

            {hierarchyDepth > 4 && (
              <label className="block text-[11px] font-semibold text-slate-700">
                Pekerjaan induk
                <select
                  value={parentCode}
                  onChange={(event) => setParentCode(event.target.value)}
                  className={`${INPUT_CLASS} mt-1`}
                >
                  <option value="">-- Pilih induk --</option>
                  {parentCandidates.map((entry) => (
                    <option key={entry.id} value={entry.code}>{entry.code} · {entry.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {hierarchyDepth > 4 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              <p className="font-semibold text-slate-700">Pencarian induk</p>
              <input
                value={parentSearch}
                onChange={(event) => setParentSearch(event.target.value)}
                placeholder="Cari kode atau nama pekerjaan induk..."
                className={`${INPUT_CLASS} mt-2`}
              />
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <p className="font-semibold text-slate-700">Kategori hasil</p>
            <p className="mt-1 font-mono text-[10px] text-slate-800">{makeCategoryPath(workFieldCode, workDivisionCode, workSubcategoryCode)}</p>
            <p className="mt-1 text-slate-500">{makeCategoryLabelPath(workFieldCode, workDivisionCode, workSubcategoryCode)}</p>
          </div>
        </div>
      </div>
    </section>
  );

  const modalTitle =
    formMode === 'edit'
      ? 'Rincian & Edit Master AHSP'
      : formMode === 'duplicate'
        ? 'Duplikasi AHSP — Edit Sebelum Simpan'
        : 'Buat Analisa Harga Satuan Baru';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Database Pusat · Manajemen Analisa Harga Satuan (AHSP)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Master Database AHSP
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Kelola AHSP berdasarkan rumpun pekerjaan dan struktur WBS bertingkat. Kode otomatis
            dapat diturunkan sampai sub-sub-sub-item, sedangkan komponen bahan, upah, dan alat dicari langsung dari master.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          {canManageMaster && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            >
              <Plus className="h-4 w-4" />
              Buat AHSP Baru
            </button>
          )}
        </div>
      </header>

      {!canManageMaster && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
          <Lock className="h-4 w-4 shrink-0" />
          Mode lihat saja. Pengubahan Master AHSP hanya tersedia untuk Direktur/Administrator perusahaan.
        </div>
      )}

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-3 sm:flex-row md:max-w-2xl">
            <div className="relative w-full flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kode atau uraian pekerjaan..."
                aria-label="Cari Master AHSP"
                className={`${INPUT_CLASS} bg-slate-50 pl-9`}
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              aria-label="Filter kategori AHSP"
              className={`${INPUT_CLASS} bg-slate-50 sm:w-56`}
            >
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === 'ALL' ? 'Semua Kategori' : formatCategoryValue(entry)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Menampilkan <strong className="text-slate-800">{filteredItems.length}</strong> dari {items.length} analisa
            </span>
            {(search || selectedCategory !== 'ALL') && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="w-36 px-5 py-3.5">Kode</th>
                <th scope="col" className="px-5 py-3.5">Uraian Pekerjaan / Analisa</th>
                <th scope="col" className="w-24 px-4 py-3.5 text-center">Satuan</th>
                <th scope="col" className="w-36 px-4 py-3.5 text-right">Upah</th>
                <th scope="col" className="w-36 px-4 py-3.5 text-right">Bahan</th>
                <th scope="col" className="w-32 px-4 py-3.5 text-right">Alat</th>
                <th scope="col" className="w-40 px-5 py-3.5 text-right">Total Harga</th>
                <th scope="col" className="w-32 px-5 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-600" />
                    Memuat database Master AHSP...
                  </td>
                </tr>
              ) : groupedItems.length > 0 ? (
                groupedItems.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="border-y border-emerald-100 bg-emerald-50/70">
                      <td colSpan={8} className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                              {group.fieldCode ? `${group.fieldCode} · ${group.fieldLabel}` : group.fieldLabel}
                            </p>
                            <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                              {group.divisionCode ? `${group.divisionCode} · ` : ''}{group.divisionLabel}
                              {group.subcategoryLabel && (
                                <span className="font-semibold text-emerald-800">
                                  {' / '}{group.subcategoryCode} · {group.subcategoryLabel}
                                </span>
                              )}
                            </h3>
                          </div>
                          <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                            {group.items.length} AHSP
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map((item) => (
                      <tr key={item.id} className="align-top transition-colors hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px] font-semibold text-slate-600">
                          {item.code}
                        </td>
                        <td className="px-5 py-3.5">
                          {canManageMaster ? (
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="group block max-w-full text-left font-semibold leading-5 text-slate-900 transition hover:text-emerald-700 focus:outline-none focus:underline"
                              title="Klik untuk membuka rincian dan mengedit analisa AHSP"
                            >
                              <span className="border-b border-dashed border-transparent group-hover:border-emerald-500">
                                {item.name}
                              </span>
                            </button>
                          ) : (
                            <span className="block max-w-full font-semibold leading-5 text-slate-900">{item.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center align-top text-xs font-semibold text-slate-600">
                          {item.unit?.trim() || 'Kelompok'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right align-top tabular-nums text-slate-600">
                          {formatRupiah(asNumber(item.labor_cost))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right align-top tabular-nums text-slate-600">
                          {formatRupiah(asNumber(item.material_cost))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right align-top tabular-nums text-slate-600">
                          {formatRupiah(asNumber(item.equipment_cost))}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right align-top font-bold tabular-nums text-slate-900">
                          {formatRupiah(asNumber(item.total_price))}
                          {(item.subitems?.length ?? 0) > 0 && (
                            <span className="mt-0.5 block text-[10px] font-medium text-violet-700">
                              Termasuk {item.subitems!.length} sub-item
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center align-top">
                          {canManageMaster ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openDuplicateModal(item)}
                                title="Duplikasi AHSP"
                                aria-label={`Duplikasi ${item.name}`}
                                className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                title="Edit rincian AHSP"
                                aria-label={`Edit ${item.name}`}
                                className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(item)}
                                title="Hapus Master AHSP"
                                aria-label={`Hapus ${item.name}`}
                                className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Lihat saja</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <Package className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      {items.length === 0 ? 'Belum ada Master AHSP' : 'AHSP tidak ditemukan'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {items.length === 0
                        ? 'Buat AHSP baru atau segarkan data database.'
                        : 'Ubah kata kunci atau kategori pencarian.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && canManageMaster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ahsp-modal-title"
            className="flex h-[92vh] max-h-[900px] min-h-[600px] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <Layers className="h-3.5 w-3.5" />
                  Master Database AHSP
                </div>
                <h2 id="ahsp-modal-title" className="truncate text-base font-bold text-slate-900 sm:text-lg">{modalTitle}</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Kelola bahan, upah, alat, koefisien, harga, dan sub-item. Perubahan harga komponen yang terhubung ke Master Bahan/Upah akan disinkronkan ke semua AHSP terkait; snapshot RAB proyek lama tetap.</p>
              </div>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label="Tutup" className="ml-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </header>

            <nav aria-label="Tahapan pembuatan AHSP" className="grid shrink-0 grid-cols-4 border-b border-slate-200 bg-slate-50 px-2 py-2 sm:px-5">
              {wizardSteps.map((step, index) => {
                const active = wizardStep === index;
                const completed = wizardStep > index;
                return (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => { setSelectedCatalogItem(null); setCoeffInput('1'); setWizardStep(index); setFormError(''); }}
                    className={`group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition sm:px-3 ${active ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'hover:bg-white/80'}`}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-emerald-600 text-white' : completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {completed ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[10px] font-bold sm:text-xs ${active ? 'text-emerald-800' : 'text-slate-700'}`}>{step.label}</span>
                      <span className="hidden truncate text-[10px] text-slate-400 md:block">{step.hint}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <form onSubmit={(event) => { if (wizardStep < 3) { event.preventDefault(); handleWizardNext(); } else { void handleSave(event); } }} className="flex min-h-0 flex-1 flex-col">
              {(formError || (showLegacyNotice && components.some((component) => component.isLegacySummary))) && (
                <div className="shrink-0 space-y-2 px-4 pt-3 sm:px-6">
                  {formError && (
                    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {formError}
                    </div>
                  )}
                  {showLegacyNotice && components.some((component) => component.isLegacySummary) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                      AHSP ini berasal dari data lama yang hanya menyimpan total kelompok biaya. Periksa ringkasan biaya lama sebelum menyimpan.
                    </div>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-5">
                {wizardStep === 0 && (
                  <div className="h-full overflow-y-auto pr-1">
                    {identity}
                  </div>
                )}

                {wizardStep === 1 && (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[0.95fr_1.05fr]">
                    {renderCatalogPicker('parent')}
                    <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Komponen langsung AHSP induk</h3>
                          <p className="text-[11px] text-slate-500">Daftar yang akan disimpan untuk pekerjaan induk.</p>
                          <p className="mt-1 text-[10px] leading-4 text-emerald-700">Jika harga bahan yang terhubung ke Master Bahan diubah lalu AHSP disimpan, Master Bahan dan seluruh AHSP lain yang memakai material tersebut ikut diperbarui.</p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">{components.length} komponen</span>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2.5">Jenis / uraian</th>
                              <th className="px-2 py-2.5 text-right">Koef.</th>
                              <th className="px-2 py-2.5 text-center">Sat.</th>
                              <th className="px-2 py-2.5 text-right">Harga</th>
                              <th className="px-2 py-2.5 text-right">Jumlah</th>
                              <th className="px-2 py-2.5 text-center"> </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {components.length === 0 ? (
                              <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Belum ada komponen langsung. Anda dapat mengosongkannya bila harga dibentuk dari sub-item.</td></tr>
                            ) : groupComponentsByType(components).map((group) => (
                              <Fragment key={group.type}>
                                <tr className="border-y border-slate-100 bg-slate-50/90">
                                  <td colSpan={6} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                    <div className="flex items-center justify-between gap-3">
                                      <span>{group.label}</span>
                                      <span className="font-medium normal-case tracking-normal text-slate-400">{group.rows.length} item</span>
                                    </div>
                                  </td>
                                </tr>
                                {group.rows.map(({ component, index }) => (
                                  <tr
                                    key={`${component.material_id ?? component.upah_id ?? component.alat_id ?? component.name}-${index}`}
                                    onDragOver={group.type === 'material' ? (event) => {
                                      if (draggedComponentIndex !== null) {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = 'move';
                                      }
                                    } : undefined}
                                    onDrop={group.type === 'material' ? (event) => {
                                      event.preventDefault();
                                      const rawSource = event.dataTransfer.getData('text/plain').trim();
                                      const sourceIndex = rawSource ? Number(rawSource) : draggedComponentIndex;
                                      if (typeof sourceIndex === 'number' && Number.isInteger(sourceIndex)) {
                                        reorderMaterialComponent(sourceIndex, index);
                                      }
                                    } : undefined}
                                    className={`transition-colors ${
                                      group.type === 'material' ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/40' : ''
                                    } ${draggedComponentIndex === index ? 'opacity-40 bg-emerald-50' : ''}`}
                                    title={group.type === 'material' ? `Tarik ${component.name} untuk mengubah urutan bahan` : undefined}
                                  >
                                    <td className="px-3 py-2">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        {group.type === 'material' ? (
                                          <span
                                            draggable
                                            onDragStart={(event) => {
                                              setDraggedComponentIndex(index);
                                              event.dataTransfer.effectAllowed = 'move';
                                              event.dataTransfer.setData('text/plain', String(index));
                                            }}
                                            onDragEnd={() => setDraggedComponentIndex(null)}
                                            className="shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
                                            title="Tarik pegangan ini untuk mengurutkan material"
                                            aria-label="Pegangan urut material"
                                          >
                                            <GripVertical className="h-4 w-4" />
                                          </span>
                                        ) : null}
                                        <input value={component.name} onChange={(event) => updateComponent(index, 'name', event.target.value)} className="min-w-0 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" aria-label={`Nama komponen ${index + 1}`} />
                                      </div>
                                      {component.isLegacySummary && <span className="text-[9px] text-amber-700">Ringkasan biaya lama</span>}
                                    </td>
                                    <td className="px-2 py-2"><input type="number" min="0.000001" step="any" value={component.coefficient} onChange={(event) => updateComponent(index, 'coefficient', event.target.value)} className="w-20 rounded border border-slate-200 px-2 py-1.5 text-right text-[11px]" /></td>
                                    <td className="px-2 py-2"><input value={component.unit} onChange={(event) => updateComponent(index, 'unit', event.target.value)} className="w-14 rounded border border-slate-200 px-1.5 py-1.5 text-center text-[11px]" /></td>
                                    <td className="px-2 py-2"><input type="number" min="0" step="any" value={component.unit_price} onChange={(event) => updateComponent(index, 'unit_price', event.target.value)} className="w-28 rounded border border-slate-200 px-2 py-1.5 text-right text-[11px] tabular-nums" aria-label={`Harga komponen ${index + 1}`} /></td>
                                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatRupiah(asNumber(component.coefficient) * asNumber(component.unit_price))}</td>
                                    <td className="px-2 py-2 text-center"><button type="button" onClick={() => removeComponent(index)} className="rounded p-1 text-rose-600 hover:bg-rose-50" aria-label={`Hapus ${component.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                                  </tr>
                                ))}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
                        <span className="text-xs font-semibold text-emerald-800">Total komponen langsung</span>
                        <strong className="text-sm tabular-nums text-emerald-900">{formatRupiah(calculatedTotal)}</strong>
                      </div>
                    </section>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-violet-200 bg-violet-50/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">{subitemEditingIndex === null ? 'Susun sub-item pekerjaan' : `Edit sub-item #${subitemEditingIndex + 1}`}</h3>
                          <p className="text-[11px] text-slate-500">Format sub-item setara AHSP: identitas, satuan, indeks, dan komponen biaya.</p>
                        </div>
                        {subitemEditingIndex !== null && <button type="button" onClick={resetSubitemDraft} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800">Batal edit</button>}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1.6fr_0.6fr]">
                        <label className="text-[11px] font-semibold text-slate-700">Kode (opsional)
                          <input value={subitemCode} onChange={(event) => setSubitemCode(event.target.value)} maxLength={50} placeholder="A.01" className={`${INPUT_CLASS} mt-1 py-2`} />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-700">Uraian sub-item *
                          <input value={subitemName} onChange={(event) => setSubitemName(event.target.value)} maxLength={250} placeholder="Uraian pekerjaan sub-item" className={`${INPUT_CLASS} mt-1 py-2`} />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-700">Satuan *
                          <input value={subitemUnit} onChange={(event) => setSubitemUnit(event.target.value)} maxLength={20} placeholder="m1" className={`${INPUT_CLASS} mt-1 py-2`} />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[0.55fr_1.45fr]">
                        <label className="text-[11px] font-semibold text-slate-700">Koefisien terhadap induk *
                          <input type="number" min="0.000001" step="any" value={subitemCoefficient} onChange={(event) => setSubitemCoefficient(event.target.value)} className={`${INPUT_CLASS} mt-1 py-2 text-right`} />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-700">Catatan / spesifikasi
                          <input value={subitemNotes} onChange={(event) => setSubitemNotes(event.target.value)} maxLength={1000} placeholder="Jenis, ukuran, merk, finishing..." className={`${INPUT_CLASS} mt-1 py-2`} />
                        </label>
                      </div>

                      {renderCatalogPicker('subitem')}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => setShowSubitemManualForm((value) => !value)} className="text-[11px] font-semibold text-violet-800 hover:text-violet-950">
                          {showSubitemManualForm ? 'Tutup input manual' : '+ Tambah komponen manual (opsional)'}
                        </button>
                        {subitemComponents.length === 0 && (
                          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                            Harga langsung
                            <input type="number" min="0" step="any" value={subitemDirectPrice} onChange={(event) => setSubitemDirectPrice(event.target.value)} className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right text-xs" />
                          </label>
                        )}
                      </div>

                      {showSubitemManualForm && (
                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-violet-200 bg-white p-3 sm:grid-cols-5">
                          <select value={subitemCompType} onChange={(event) => setSubitemCompType(event.target.value as ComponentType)} className={INPUT_CLASS}>
                            <option value="material">Bahan</option><option value="labor">Upah</option><option value="equipment">Alat</option>
                          </select>
                          <input value={subitemCompName} onChange={(event) => setSubitemCompName(event.target.value)} placeholder="Nama" className={INPUT_CLASS} />
                          <input value={subitemCompUnit} onChange={(event) => setSubitemCompUnit(event.target.value)} placeholder="Satuan" className={INPUT_CLASS} />
                          <input type="number" min="0.000001" step="any" value={subitemCompCoefficient} onChange={(event) => setSubitemCompCoefficient(event.target.value)} placeholder="Koef." className={INPUT_CLASS} />
                          <input type="number" min="0" step="any" value={subitemCompPrice} onChange={(event) => setSubitemCompPrice(event.target.value)} placeholder="Harga" className={INPUT_CLASS} />
                          <button type="button" onClick={addSubitemComponent} className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 sm:col-span-5">
                            <Plus className="h-3.5 w-3.5" /> Tambahkan komponen manual
                          </button>
                        </div>
                      )}

                      {subitemComponents.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full min-w-[520px] text-left text-[10px]">
                            <thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-2 py-2">Jenis / komponen</th><th className="px-2 py-2 text-right">Koef.</th><th className="px-2 py-2 text-center">Sat.</th><th className="px-2 py-2 text-right">Harga</th><th className="px-2 py-2 text-right">Jumlah</th><th className="px-2 py-2 text-center"> </th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {subitemComponents.map((component, index) => (
                                <tr key={`${component.material_id ?? component.upah_id ?? component.alat_id ?? component.name}-${index}`}>
                                  <td className="px-2 py-2"><span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[9px]">{component.type === 'material' ? 'BAHAN' : component.type === 'labor' ? 'UPAH' : 'ALAT'}</span>{component.name}</td>
                                  <td className="px-2 py-2 text-right tabular-nums">{asNumber(component.coefficient)}</td>
                                  <td className="px-2 py-2 text-center">{component.unit}</td>
                                  <td className="px-2 py-2 text-right tabular-nums">{formatRupiah(asNumber(component.unit_price))}</td>
                                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatRupiah(asNumber(component.coefficient) * asNumber(component.unit_price))}</td>
                                  <td className="px-2 py-2 text-center"><button type="button" onClick={() => removeSubitemComponent(index)} className="rounded p-1 text-rose-600 hover:bg-rose-50" aria-label="Hapus komponen sub-item"><Trash2 className="h-3.5 w-3.5" /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-violet-100 px-3 py-2">
                        <span className="text-xs font-semibold text-violet-900">Harga dasar sub-item</span>
                        <strong className="text-sm tabular-nums text-violet-950">
                          {formatRupiah(subitemComponents.reduce((sum, row) => sum + asNumber(row.coefficient) * asNumber(row.unit_price), 0) || asNumber(subitemDirectPrice))}
                        </strong>
                      </div>
                      <div className="flex justify-end">
                        <button type="button" onClick={addSubitem} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-800">
                          <Plus className="h-4 w-4" /> {subitemEditingIndex === null ? 'Simpan sub-item ke daftar' : 'Simpan perubahan sub-item'}
                        </button>
                      </div>
                    </section>

                    <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Daftar sub-item pekerjaan</h3>
                          <p className="text-[11px] text-slate-500">Klik edit untuk mengubah rincian sub-item.</p>
                        </div>
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-800">{subitems.length}</span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                        {subitems.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-10 text-center text-xs text-slate-400">
                            Belum ada sub-item. Tambahkan dari formulir di sebelah kiri.
                          </div>
                        ) : subitems.map((entry, index) => (
                          <div key={`${entry.code ?? 'manual'}-${index}`} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {entry.code && <p className="font-mono text-[10px] font-bold text-violet-700">{entry.code}</p>}
                                <p className="text-xs font-bold text-slate-800">{entry.name}</p>
                                <p className="mt-1 text-[10px] text-slate-500">{entry.coefficient} {entry.unit} · {entry.components?.length ?? 0} komponen</p>
                                {entry.notes && <p className="mt-1 text-[10px] text-slate-400">{entry.notes}</p>}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-bold tabular-nums text-slate-900">{formatRupiah(asNumber(entry.coefficient) * subitemUnitPrice(entry))}</p>
                                <div className="mt-2 flex justify-end gap-1">
                                  <button type="button" onClick={() => editSubitem(index)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" aria-label={`Edit ${entry.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => removeSubitem(index)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50" aria-label={`Hapus ${entry.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-violet-100 px-3 py-2.5">
                        <span className="text-xs font-semibold text-violet-900">Total sub-item</span>
                        <strong className="text-sm tabular-nums text-violet-950">{formatRupiah(calculatedSubitemTotal)}</strong>
                      </div>
                    </aside>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Pemeriksaan akhir</p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">{name || 'AHSP baru'}</h3>
                      <p className="mt-1 text-xs text-slate-500">{autoCode ? generatedCode : code} · {unit.trim() || 'Kelompok tanpa satuan'} · {(classificationChanged || formMode !== 'edit') ? workCategoryPath : category.trim()}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-500">Total Upah</p><p className="mt-1 text-sm font-bold">{formatRupiah(calculatedLabor)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-500">Total Bahan</p><p className="mt-1 text-sm font-bold">{formatRupiah(calculatedMaterial)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-500">Total Alat</p><p className="mt-1 text-sm font-bold">{formatRupiah(calculatedEquipment)}</p></div>
                      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-[10px] text-violet-700">Total Sub-item</p><p className="mt-1 text-sm font-bold text-violet-900">{formatRupiah(calculatedSubitemTotal)}</p></div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] font-semibold text-emerald-800">Total AHSP</p><p className="mt-1 text-sm font-bold text-emerald-900">{formatRupiah(calculatedTotal + calculatedSubitemTotal)}</p></div>
                    </div>

                    <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
                      <section className="rounded-xl border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-bold text-slate-800">Komponen induk</h4><span className="text-[10px] text-slate-500">{components.length} item</span></div>
                        <div className="max-h-56 space-y-1 overflow-y-auto">
                          {components.length === 0 ? <p className="text-xs text-slate-400">Tidak ada komponen langsung.</p> : groupComponentsByType(components).map((group) => (
                            <div key={group.type} className="mb-2 last:mb-0">
                              <div className="mb-1 flex items-center justify-between border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                <span>{group.label}</span><span>{group.rows.length} item</span>
                              </div>
                              {group.rows.map(({ component: row, index }) => (
                                <div key={`${row.name}-${index}`} className="flex justify-between gap-2 border-b border-slate-100 py-1.5 text-[11px]">
                                  <span className="min-w-0 truncate text-slate-700">{row.name} <span className="text-slate-400">({row.coefficient} {row.unit})</span></span>
                                  <strong className="shrink-0 tabular-nums">{formatRupiah(asNumber(row.coefficient) * asNumber(row.unit_price))}</strong>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </section>
                      <section className="rounded-xl border border-violet-200 p-3">
                        <div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-bold text-slate-800">Sub-item pekerjaan</h4><span className="text-[10px] text-slate-500">{subitems.length} item</span></div>
                        <div className="max-h-56 space-y-1 overflow-y-auto">
                          {subitems.length === 0 ? <p className="text-xs text-slate-400">Tidak ada sub-item.</p> : subitems.map((row, index) => <div key={`${row.name}-${index}`} className="flex justify-between gap-2 border-b border-slate-100 py-1.5 text-[11px]"><span className="min-w-0 truncate text-slate-700">{row.name} <span className="text-slate-400">({row.coefficient} {row.unit})</span></span><strong className="shrink-0 tabular-nums">{formatRupiah(asNumber(row.coefficient) * subitemUnitPrice(row))}</strong></div>)}
                        </div>
                      </section>
                    </div>

                    {!unit.trim() && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        AHSP ini akan disimpan sebagai induk kelompok tanpa satuan. Ia tetap bisa dipakai untuk pengelompokan, tetapi tidak dapat dipilih langsung sebagai item RAB sampai satuannya diisi.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={closeModal} disabled={submitting} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                  {wizardStep > 0 && (
                    <button type="button" onClick={() => { setSelectedCatalogItem(null); setCoeffInput('1'); setWizardStep((current) => Math.max(0, current - 1)); setFormError(''); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Kembali
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="hidden text-[10px] text-slate-400 sm:block">Tahap {wizardStep + 1} dari 4</span>
                  {wizardStep < 3 ? (
                    <button type="button" onClick={handleWizardNext} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700">
                      Lanjut <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {submitting ? 'Menyimpan...' : formMode === 'edit' ? 'Simpan Perubahan' : formMode === 'duplicate' ? 'Simpan sebagai AHSP Baru' : 'Simpan Master AHSP'}
                    </button>
                  )}
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
