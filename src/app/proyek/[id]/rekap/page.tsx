'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Loader2, AlertCircle, Printer } from 'lucide-react';
import { fetchProjectDetail } from '@/lib/services/projectService';
import { formatRupiah } from '@/lib/format';
import type { Project } from '@/types/rab';
import { calculateStructuredRebar } from '@/lib/volume-calculation';

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
type PdfSigner = { role: string; name: string; identifier: string };
type SnapshotComponent = {
  name: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  subtotal: number;
  type: 'material' | 'labor' | 'equipment' | 'other';
  materialId: string | null;
  materialCode: string | null;
  upahId: string | null;
  alatId: string | null;
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
  rab_subcategory_id?: string | null;
  components_snapshot?: unknown;
  subitems_snapshot?: unknown;
  backupDetails?: BackupVolumeSnapshot[] | null;
};

type BackupVolumeSnapshot = {
  id: string;
  subitem_path?: string | null;
  description?: string | null;
  calc_mode?: string | null;
  multiplier?: number | string | null;
  parameters?: Record<string, unknown> | null;
  subtotal?: number | string | null;
};

type MaterialMatrixRow = {
  key: string;
  materialId: string | null;
  materialCode: string | null;
  name: string;
  unit: string;
  itemCount: number;
  quantity: number;
  amount: number;
  netQuantity: number;
  netAmount: number;
};

type MaterialUsageRow = {
  key: string;
  divisionName: string;
  itemCode: string;
  itemName: string;
  materialId: string | null;
  materialCode: string | null;
  materialName: string;
  unit: string;
  coefficient: number;
  rabVolume: number;
  quantity: number;
  netQuantity: number;
};

type RebarDiameterUsage = {
  diameter: number;
  totalLengthM: number;
  requiredWeightKg: number;
  sourceDetails: number;
};

type ItemRebarReview = {
  itemId: string;
  divisionName: string;
  code: string;
  name: string;
  ahspWeightKg: number;
  backupWeightKg: number;
  differenceKg: number;
  coveragePercent: number;
  status: 'sesuai' | 'belum_lengkap' | 'belum_backup' | 'lebih_backup' | 'backup_saja' | 'parameter_error';
  diameterRows: RebarDiameterUsage[];
  issues: string[];
};

type ForemanMode = 'ahsp' | 'custom' | 'none';
type RABWorkSubcategory = {
  id: string;
  name: string;
};
type RABWorkCategory = {
  id: string;
  name: string;
  subcategories?: RABWorkSubcategory[] | null;
};
type RABDivision = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  workCategories?: RABWorkCategory[] | null;
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
      materialId: row.material_id ? String(row.material_id) : null,
      materialCode: textValue(firstValue(row, ['material_code', 'code', 'item_code']), ''),
      upahId: row.upah_id ? String(row.upah_id) : null,
      alatId: row.alat_id ? String(row.alat_id) : null,
      raw: row,
    };
  }).filter((item) => item.name !== 'Komponen tanpa nama' || item.coefficient !== 0 || item.unitPrice !== 0);
}

type ManualWorkGroup = {
  key: string;
  name: string;
  items: RABItem[];
};

function groupWorkItemsInManualOrder(
  items: RABItem[],
  categories: RABWorkCategory[] = [],
): ManualWorkGroup[] {
  const subcategoryById = new Map<string, { category: RABWorkCategory; subcategory: RABWorkSubcategory }>();
  for (const category of categories) {
    for (const subcategory of category.subcategories ?? []) {
      subcategoryById.set(subcategory.id, { category, subcategory });
    }
  }

  const ordered = [...items].sort(
    (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
  );
  const groupsByKey = new Map<string, ManualWorkGroup>();
  for (const item of ordered) {
    const saved = item.rab_subcategory_id
      ? subcategoryById.get(item.rab_subcategory_id)
      : undefined;
    const name = saved
      ? saved.category.name + ' / ' + saved.subcategory.name
      : getWorkSubcategory(item.code || '');
    // Identitas kategori dari RAB diprioritaskan; kode AHSP hanya fallback
    // untuk item yang belum memiliki subkategori tersimpan.
    const key = saved
      ? 'saved:' + saved.subcategory.id
      : 'ahsp:' + classifyCode(item.code || '');
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groupsByKey.set(key, { key, name, items: [item] });
    }
  }
  return Array.from(groupsByKey.values());
}

/**
 * Reads the analysis saved with a RAB item. Nested AHSP sub-items are expanded
 * recursively and their coefficients are multiplied through each parent level.
 * No Master AHSP lookup is performed during report generation.
 */
function parseRabItemComponents(item: RABItem): SnapshotComponent[] {
  const direct = parseComponents(item.components_snapshot);
  const subitems = asArray(item.subitems_snapshot);

  const expand = (
    entries: unknown[],
    multiplier: number,
    parentNames: string[],
  ): SnapshotComponent[] => entries.flatMap((entry) => {
    const row = asRecord(entry);
    const subitemName = textValue(firstValue(row, ['name', 'item_name', 'description', 'uraian']), 'Sub-item AHSP');
    const coefficient = numberValue(firstValue(row, ['coefficient', 'coef', 'koefisien', 'volume'], 0));
    const lineMultiplier = multiplier * coefficient;
    const pathNames = [...parentNames, subitemName];
    const ownComponents = parseComponents(firstValue(row, ['components', 'items', 'details', 'data'], []));
    const children = asArray(row.subitems);

    if (ownComponents.length > 0 || children.length > 0) {
      return [
        ...ownComponents.map((component) => ({
          ...component,
          name: `${pathNames.join(' / ')} — ${component.name}`,
          coefficient: component.coefficient * lineMultiplier,
          subtotal: component.coefficient * lineMultiplier * component.unitPrice,
        })),
        ...expand(children, lineMultiplier, pathNames),
      ];
    }

    const unitPrice = numberValue(firstValue(row, ['unit_price', 'unitPrice', 'price', 'harga_satuan'], 0));
    if (unitPrice <= 0 || lineMultiplier <= 0) return [];
    const leafName = pathNames.join(' / ');
    return [{
      name: leafName,
      unit: textValue(firstValue(row, ['unit', 'unit_name', 'satuan']), '-'),
      coefficient: lineMultiplier,
      unitPrice,
      subtotal: lineMultiplier * unitPrice,
      type: normalizeType(firstValue(row, ['type', 'category', 'jenis', 'component_type', 'item_type']), leafName, row),
      materialId: row.material_id ? String(row.material_id) : null,
      materialCode: textValue(firstValue(row, ['material_code', 'code', 'item_code']), ''),
      upahId: row.upah_id ? String(row.upah_id) : null,
      alatId: row.alat_id ? String(row.alat_id) : null,
      raw: row,
    }];
  });

  return [...direct, ...expand(subitems, 1, [])];
}

function normalizeUnit(value: string) {
  return value.trim().toLowerCase().replace(/[.\s_-]+/g, '');
}

function isHokUnit(unit: string) {
  return ['oh', 'hok', 'oranghari', 'hariorang', 'hari', 'harikerja'].includes(normalizeUnit(unit));
}

function classifyLaborRole(name: string): 'mandor' | 'kepala_tukang' | 'tukang' | 'pekerja' | 'lainnya' {
  const label = name.toLocaleLowerCase('id-ID');
  if (/\bmandor\b/.test(label)) return 'mandor';
  if (/\bkepala\s+tukang\b/.test(label)) return 'kepala_tukang';
  if (/\b(pembantu|asisten|helper|pekerja|buruh)\b/.test(label)) return 'pekerja';
  if (/\btukang\b/.test(label)) return 'tukang';
  return 'lainnya';
}

function laborRoleLabel(role: ReturnType<typeof classifyLaborRole>) {
  return role === 'mandor' ? 'Mandor'
    : role === 'kepala_tukang' ? 'Kepala Tukang'
    : role === 'tukang' ? 'Tukang'
    : role === 'pekerja' ? 'Pekerja'
    : 'Tenaga kerja lainnya';
}

function isRebarAhspMaterial(component: SnapshotComponent) {
  const label = component.name.toLocaleLowerCase('id-ID');
  return normalizeUnit(component.unit) === 'kg'
    && /\b(besi|tulangan|wiremesh|rebar)\b/.test(label);
}

function calculateBackupRebar(item: RABItem): { diameterRows: RebarDiameterUsage[]; weightKg: number; issues: string[] } {
  const byDiameter = new Map<number, RebarDiameterUsage>();
  const issues: string[] = [];

  for (const detail of item.backupDetails ?? []) {
    const mode = String(detail.calc_mode ?? '').toLowerCase();
    const parameters = asRecord(detail.parameters);
    const multiplier = Math.max(0, numberValue(detail.multiplier ?? 1));

    try {
      if (mode === 'rebar_structure') {
        const result = calculateStructuredRebar(parameters, multiplier);
        result.diameterSummary.forEach((row) => {
          const current = byDiameter.get(row.diameter) ?? {
            diameter: row.diameter, totalLengthM: 0, requiredWeightKg: 0, sourceDetails: 0,
          };
          current.totalLengthM += row.totalLengthM;
          current.requiredWeightKg += row.requiredWeightKg;
          current.sourceDetails += 1;
          byDiameter.set(row.diameter, current);
        });
      } else if (mode === 'rebar') {
        const diameter = numberValue(parameters.diameter);
        const barLength = numberValue(parameters.bar_length);
        const bars = numberValue(parameters.bars);
        if (diameter <= 0 || barLength <= 0 || bars <= 0) {
          throw new Error('Diameter, panjang batang, atau jumlah batang belum valid.');
        }
        const totalLengthM = barLength * bars * multiplier;
        const requiredWeightKg = (diameter * diameter / 162) * totalLengthM;
        const current = byDiameter.get(diameter) ?? {
          diameter, totalLengthM: 0, requiredWeightKg: 0, sourceDetails: 0,
        };
        current.totalLengthM += totalLengthM;
        current.requiredWeightKg += requiredWeightKg;
        current.sourceDetails += 1;
        byDiameter.set(diameter, current);
      }
    } catch (error) {
      issues.push(
        (detail.description || 'Rincian Backup Volume') + ': ' +
        (error instanceof Error ? error.message : 'parameter pembesian tidak dapat dihitung'),
      );
    }
  }

  const diameterRows = Array.from(byDiameter.values()).sort((a, b) => a.diameter - b.diameter);
  return {
    diameterRows,
    weightKg: diameterRows.reduce((sum, row) => sum + row.requiredWeightKg, 0),
    issues,
  };
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
  const [pdfSignatureCount, setPdfSignatureCount] = useState<1 | 2 | 3>(2);
  const [pdfSigners, setPdfSigners] = useState<PdfSigner[]>([
    { role: 'Disusun oleh', name: '', identifier: '' },
    { role: 'Mengetahui', name: '', identifier: '' },
    { role: 'Menyetujui', name: '', identifier: '' },
  ]);

  // Semua nilai berikut hanya hidup di halaman ini dan tidak pernah disimpan ke Supabase.
  const [targetDurationDays, setTargetDurationDays] = useState(66);
  const [workerCount, setWorkerCount] = useState(5);
  const [masonCount, setMasonCount] = useState(6);
  const [foremanMode, setForemanMode] = useState<ForemanMode>('ahsp');
  const [foremanDays, setForemanDays] = useState(0);
  const [materialReductionPercent, setMaterialReductionPercent] = useState(0);
  const [laborReductionPercent, setLaborReductionPercent] = useState(0);

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
    if (!project) return;
    setPdfSigners([
      { role: 'Disusun oleh', name: project.planning_consultant || '', identifier: project.planning_consultant_skk || '' },
      { role: 'Mengetahui', name: project.principal_name || '', identifier: project.principal_nip || '' },
      { role: 'Menyetujui', name: project.supervisory_consultant || '', identifier: project.supervisory_consultant_skk || '' },
    ]);
  }, [project?.id]);
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
  const orderedDivisions = useMemo(
    () => [...divisions]
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
      .map((division) => ({
        ...division,
        items: [...(division.items ?? [])].sort(
          (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
        ),
      })),
    [divisions],
  );
  const allItems = useMemo(() => orderedDivisions.flatMap((division) =>
    (division.items ?? []).map((item) => ({ ...item, divisionName: division.name, divisionId: division.id })),
  ), [orderedDivisions]);

  const totalRAB = useMemo(() => allItems.reduce((sum, item) => sum + numberValue(item.total_price), 0), [allItems]);
  const taxRate = numberValue(project?.tax_rate ?? 11);
  const profitRate = numberValue(project?.profit_margin ?? 10);
  const taxAmount = totalRAB * taxRate / 100;
  const profitAmount = totalRAB * profitRate / 100;
  const grandTotal = totalRAB + taxAmount + profitAmount;

  const summaryRows = useMemo(() => orderedDivisions.map((division) => {
    const rows = groupWorkItemsInManualOrder(division.items ?? [], division.workCategories ?? []).map((group) => ({
      name: group.name,
      count: group.items.length,
      total: group.items.reduce((sum, item) => sum + numberValue(item.total_price), 0),
    }));
    return {
      name: division.name,
      code: division.code,
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      count: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }).filter((division) => division.rows.length > 0), [orderedDivisions]);

  const materialMatrixData = useMemo(() => {
    const summary = new Map<string, {
      key: string; materialId: string | null; materialCode: string | null; name: string;
      unit: string; itemIds: Set<string>; quantity: number; amount: number;
    }>();
    const usages = new Map<string, MaterialUsageRow>();

    for (const item of allItems) {
      for (const component of parseRabItemComponents(item).filter((row) => row.type === 'material')) {
        const materialName = textValue(
          firstValue(component.raw, ['material_name', 'name', 'item_name', 'description']),
          component.name,
        );
        const unitKey = normalizeUnit(component.unit);
        // material_id menjadi identitas utama; komponen lama tanpa ID tetap ditampilkan
        // dengan kunci nama+satuan agar tidak hilang dari rekap.
        const identity = component.materialId
          ? 'id:' + component.materialId + '|' + unitKey
          : 'legacy:' + materialName.trim().toLocaleLowerCase('id-ID') + '|' + unitKey;
        const quantity = component.coefficient * numberValue(item.volume);
        const amount = quantity * component.unitPrice;
        const current = summary.get(identity) ?? {
          key: identity,
          materialId: component.materialId,
          materialCode: component.materialCode,
          name: materialName,
          unit: component.unit,
          itemIds: new Set<string>(),
          quantity: 0,
          amount: 0,
        };
        current.itemIds.add(item.id);
        current.quantity += quantity;
        current.amount += amount;
        if (!current.materialCode && component.materialCode) current.materialCode = component.materialCode;
        summary.set(identity, current);

        const usageKey = item.id + '|' + identity;
        const usage = usages.get(usageKey) ?? {
          key: usageKey,
          divisionName: String((item as RABItem & { divisionName?: string }).divisionName || '-'),
          itemCode: String(item.code || ''),
          itemName: item.name,
          materialId: component.materialId,
          materialCode: component.materialCode,
          materialName,
          unit: component.unit,
          coefficient: 0,
          rabVolume: numberValue(item.volume),
          quantity: 0,
          netQuantity: 0,
        };
        usage.coefficient += component.coefficient;
        usage.quantity += quantity;
        usages.set(usageKey, usage);
      }
    }

    return {
      summary: Array.from(summary.values()).map((row) => ({
        key: row.key,
        materialId: row.materialId,
        materialCode: row.materialCode,
        name: row.name,
        unit: row.unit,
        itemCount: row.itemIds.size,
        quantity: row.quantity,
        amount: row.amount,
        netQuantity: row.quantity * (1 - materialReductionPercent / 100),
        netAmount: row.amount * (1 - materialReductionPercent / 100),
      })).sort((a, b) => a.name.localeCompare(b.name, 'id')),
      usages: Array.from(usages.values()).map((row) => ({
        ...row,
        netQuantity: row.quantity * (1 - materialReductionPercent / 100),
      })).sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'id') || a.itemName.localeCompare(b.itemName, 'id') || a.materialName.localeCompare(b.materialName, 'id')),
    };
  }, [allItems, materialReductionPercent]);

  const materialRows = materialMatrixData.summary;
  const materialUsageRows = materialMatrixData.usages;
  const unlinkedMaterialCount = materialRows.filter((row) => !row.materialId).length;

  const laborRows = useMemo(() => {
    const map = new Map<string, {
      upahId: string | null; name: string; unit: string; coefficient: number; volume: number;
      unitPrice: number; total: number; role: ReturnType<typeof classifyLaborRole>; isHok: boolean;
    }>();
    allItems.forEach((item) => parseRabItemComponents(item).filter((component) => component.type === 'labor').forEach((component) => {
      const role = classifyLaborRole(component.name);
      const key = component.upahId
        ? 'id:' + component.upahId + '|' + normalizeUnit(component.unit)
        : component.name.trim().toLowerCase() + '|' + normalizeUnit(component.unit);
      const current = map.get(key) ?? {
        upahId: component.upahId,
        name: component.name,
        unit: component.unit,
        coefficient: 0,
        volume: 0,
        unitPrice: component.unitPrice,
        total: 0,
        role,
        isHok: isHokUnit(component.unit),
      };
      current.coefficient += component.coefficient;
      current.volume += component.coefficient * numberValue(item.volume);
      current.total += component.coefficient * numberValue(item.volume) * component.unitPrice;
      if (!current.unitPrice) current.unitPrice = component.unitPrice;
      map.set(key, current);
    }));
    return Array.from(map.values()).map((row) => ({
      ...row,
      unitPrice: row.volume > 0 ? row.total / row.volume : row.unitPrice,
    })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [allItems]);

  const laborHokByRole = useMemo(() => {
    const totals = { mandor: 0, kepala_tukang: 0, tukang: 0, pekerja: 0, lainnya: 0 };
    laborRows.forEach((row) => {
      if (!row.isHok) return;
      totals[row.role] += row.volume;
    });
    return totals;
  }, [laborRows]);

  const baseMandorHok = laborHokByRole.mandor;
  const effectiveMandorHok = foremanMode === 'none'
    ? 0
    : foremanMode === 'custom'
      ? Math.max(0, foremanDays)
      : baseMandorHok;

  const plannedLaborRows = useMemo(() => laborRows.map((row) => {
    const plannedVolume = row.role === 'mandor' && row.isHok
      ? (baseMandorHok > 0 ? row.volume * effectiveMandorHok / baseMandorHok : 0)
      : row.volume;
    const grossAmount = plannedVolume * row.unitPrice;
    return {
      ...row,
      plannedVolume,
      grossAmount,
      netAmount: grossAmount * (1 - laborReductionPercent / 100),
    };
  }), [laborRows, baseMandorHok, effectiveMandorHok, laborReductionPercent]);

  const laborGrossTotal = plannedLaborRows.reduce((sum, row) => sum + row.grossAmount, 0);
  const laborNetTotal = plannedLaborRows.reduce((sum, row) => sum + row.netAmount, 0);
  const workerHok = laborHokByRole.pekerja + laborHokByRole.lainnya;
  const masonHok = laborHokByRole.tukang;
  const workerDays = workerCount > 0 ? workerHok / workerCount : 0;
  const masonDays = masonCount > 0 ? masonHok / masonCount : 0;
  const estimatedCrewDays = Math.max(workerDays, masonDays);
  const recommendedWorkerCount = targetDurationDays > 0 ? Math.ceil(workerHok / targetDurationDays) : 0;
  const recommendedMasonCount = targetDurationDays > 0 ? Math.ceil(masonHok / targetDurationDays) : 0;
  const crewDayDifference = Math.abs(workerDays - masonDays);

  const rebarReviewRows = useMemo<ItemRebarReview[]>(() => allItems.map((item) => {
    const components = parseRabItemComponents(item);
    const ahspWeightKg = components
      .filter(isRebarAhspMaterial)
      .reduce((sum, component) => sum + component.coefficient * numberValue(item.volume), 0);
    const backup = calculateBackupRebar(item);
    const backupWeightKg = backup.weightKg;
    const tolerance = Math.max(0.5, ahspWeightKg * 0.01);
    let status: ItemRebarReview['status'] = 'sesuai';
    if (backup.issues.length > 0) status = 'parameter_error';
    else if (ahspWeightKg <= 0 && backupWeightKg > 0) status = 'backup_saja';
    else if (ahspWeightKg > 0 && backupWeightKg <= 0) status = 'belum_backup';
    else if (backupWeightKg < ahspWeightKg - tolerance) status = 'belum_lengkap';
    else if (backupWeightKg > ahspWeightKg + tolerance) status = 'lebih_backup';

    return {
      itemId: item.id,
      divisionName: String((item as RABItem & { divisionName?: string }).divisionName || '-'),
      code: String(item.code || ''),
      name: item.name,
      ahspWeightKg,
      backupWeightKg,
      differenceKg: backupWeightKg - ahspWeightKg,
      coveragePercent: ahspWeightKg > 0 ? backupWeightKg / ahspWeightKg * 100 : (backupWeightKg > 0 ? 100 : 0),
      status,
      diameterRows: backup.diameterRows,
      issues: backup.issues,
    };
  }).filter((row) => row.ahspWeightKg > 0 || row.backupWeightKg > 0 || row.issues.length > 0), [allItems]);

  const rebarTotals = useMemo(() => {
    const byDiameter = new Map<number, RebarDiameterUsage>();
    rebarReviewRows.forEach((item) => item.diameterRows.forEach((row) => {
      const current = byDiameter.get(row.diameter) ?? {
        diameter: row.diameter, totalLengthM: 0, requiredWeightKg: 0, sourceDetails: 0,
      };
      current.totalLengthM += row.totalLengthM;
      current.requiredWeightKg += row.requiredWeightKg;
      current.sourceDetails += row.sourceDetails;
      byDiameter.set(row.diameter, current);
    }));
    return Array.from(byDiameter.values()).sort((a, b) => a.diameter - b.diameter);
  }, [rebarReviewRows]);

  const totalAhspRebarKg = rebarReviewRows.reduce((sum, row) => sum + row.ahspWeightKg, 0);
  const totalBackupRebarKg = rebarReviewRows.reduce((sum, row) => sum + row.backupWeightKg, 0);
  const uncoveredRebarKg = rebarReviewRows.reduce((sum, row) => sum + Math.max(0, row.ahspWeightKg - row.backupWeightKg), 0);



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
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pengaturan Tanda Tangan PDF</h3>
              <p className="mt-1 text-xs text-slate-500">Pilih satu hingga tiga penandatangan dan lengkapi nama serta jabatannya.</p>
            </div>
            <label className="text-xs font-semibold text-slate-600">
              Jumlah penandatangan
              <select value={pdfSignatureCount} onChange={(event) => setPdfSignatureCount(Number(event.target.value) as 1 | 2 | 3)} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value={1}>1 orang · kanan bawah</option>
                <option value={2}>2 orang · kiri dan kanan</option>
                <option value={3}>3 orang · sejajar tengah</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pdfSigners.slice(0,pdfSignatureCount).map((signer,index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-bold text-slate-700">Penandatangan {index + 1}</p>
                <label className="block text-xs font-medium text-slate-600">
                  Jabatan / keterangan
                  <input value={signer.role} onChange={(event) => setPdfSigners((current) => current.map((entry,entryIndex) => entryIndex === index ? {...entry,role:event.target.value} : entry))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  Nama penandatangan
                  <input value={signer.name} onChange={(event) => setPdfSigners((current) => current.map((entry,entryIndex) => entryIndex === index ? {...entry,name:event.target.value} : entry))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nama lengkap" />
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  NIP / SKK / identitas (opsional)
                  <input value={signer.identifier} onChange={(event) => setPdfSigners((current) => current.map((entry,entryIndex) => entryIndex === index ? {...entry,identifier:event.target.value} : entry))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="NIP, SKK, atau keterangan" />
                </label>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="no-print rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">1. Perencanaan Kebutuhan Tenaga Kerja</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              HOK dihitung dari koefisien AHSP × volume RAB seluruh lokasi. Masukkan target hari kerja sesuai rencana Kurva-S, lalu ubah jumlah pekerja dan tukang untuk membandingkan durasinya.
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold text-indigo-700">Simulasi proyek · semua lokasi</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">
            Target durasi Kurva-S (hari kerja)
            <input type="number" min={1} max={365} step={1} value={targetDurationDays}
              onChange={(event) => setTargetDurationDays(Math.max(1, Math.min(365, Math.round(Number(event.target.value) || 1))))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">Nilai awal 66 hari kerja (simulasi 3 bulan × 22 hari); ubah mengikuti rencana Kurva-S proyek.</span>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Jumlah pekerja
            <input type="number" min={1} max={500} step={1} value={workerCount}
              onChange={(event) => setWorkerCount(Math.max(1, Math.min(500, Math.round(Number(event.target.value) || 1))))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">HOK pekerja ÷ jumlah pekerja = hari kerja.</span>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Jumlah tukang
            <input type="number" min={1} max={500} step={1} value={masonCount}
              onChange={(event) => setMasonCount(Math.max(1, Math.min(500, Math.round(Number(event.target.value) || 1))))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">HOK tukang ÷ jumlah tukang = hari kerja.</span>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">HOK pekerja</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatNumber(workerHok, 2)}</p>
            <p className="text-[10px] text-slate-500">Pekerja {formatNumber(laborHokByRole.pekerja, 2)} + tenaga lainnya {formatNumber(laborHokByRole.lainnya, 2)} HOK.</p>
            <p className="text-[10px] text-slate-500">Rencana {formatNumber(workerDays, 1)} hari · rekomendasi {recommendedWorkerCount} orang</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">HOK tukang</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatNumber(masonHok, 2)}</p>
            <p className="text-[10px] text-slate-500">Rencana {formatNumber(masonDays, 1)} hari · rekomendasi {recommendedMasonCount} orang</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">HOK kepala tukang</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatNumber(laborHokByRole.kepala_tukang, 2)}</p>
            <p className="text-[10px] text-slate-500">Ditampilkan sebagai HOK; formasi 1 orang.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">HOK mandor</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatNumber(baseMandorHok, 2)}</p>
            <p className="text-[10px] text-slate-500">{foremanMode === 'none' ? 'Tidak dialokasikan' : foremanMode === 'custom' ? 'Rencana hadir ' + formatNumber(effectiveMandorHok, 2) + ' hari' : 'Mengikuti total HOK AHSP'}.</p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-indigo-100 p-3">
            <p className="text-xs font-bold text-slate-800">Keseimbangan durasi tenaga</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><span className="text-[10px] text-slate-500">Durasi pekerja</span><p className="text-lg font-bold tabular-nums">{formatNumber(workerDays, 1)} hari</p></div>
              <div><span className="text-[10px] text-slate-500">Durasi tukang</span><p className="text-lg font-bold tabular-nums">{formatNumber(masonDays, 1)} hari</p></div>
            </div>
            <div className="mt-2 border-t border-slate-100 pt-2 text-xs">
              <span className="text-slate-500">Selisih durasi:</span>{' '}
              <strong className={crewDayDifference <= 1 ? 'text-emerald-700' : 'text-amber-700'}>{formatNumber(crewDayDifference, 1)} hari</strong>
              <span className="ml-2 text-slate-500">{crewDayDifference <= 1 ? 'Relatif seimbang' : 'Ubah jumlah pekerja/tukang agar durasinya mendekati sama'}</span>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Estimasi waktu tim mengikuti durasi terlama: <strong>{formatNumber(estimatedCrewDays, 1)} hari kerja</strong>.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-800">Kebijakan mandor</p>
            <label className="mt-2 block text-xs font-semibold text-slate-600">
              Alokasi mandor
              <select value={foremanMode} onChange={(event) => {
                const next = event.target.value as ForemanMode;
                setForemanMode(next);
                if (next === 'custom') setForemanDays(baseMandorHok);
              }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="ahsp">Ikuti HOK dari AHSP</option>
                <option value="custom">Atur jumlah hari hadir mandor</option>
                <option value="none">Tanpa mandor</option>
              </select>
            </label>
            {foremanMode === 'custom' ? (
              <label className="mt-2 block text-xs font-semibold text-slate-600">
                Hari hadir mandor
                <input type="number" min={0} max={365} step={0.5} value={foremanDays}
                  onChange={(event) => setForemanDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            ) : null}
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              Kepala tukang tetap ditampilkan sesuai HOK AHSP. Pengaturan mandor di atas hanya memengaruhi simulasi upah dan PDF, bukan snapshot AHSP asli.
            </p>
          </div>
        </div>
      </section>

      <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">2. Pemeriksaan Material dan Pembesian</h2>
            <p className="mt-1 text-xs text-slate-500">Ringkasan dihitung dari snapshot AHSP semua lokasi. Rincian PDF menyertakan jejak per item pekerjaan.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Jenis material</p><p className="text-xl font-bold">{materialRows.length}</p><p className="text-[10px] text-slate-500">{unlinkedMaterialCount} belum memiliki material_id</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Baris penggunaan material</p><p className="text-xl font-bold">{materialUsageRows.length}</p><p className="text-[10px] text-slate-500">Per item RAB dan lokasi</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Besi AHSP</p><p className="text-xl font-bold">{formatNumber(totalAhspRebarKg, 2)} kg</p><p className="text-[10px] text-slate-500">Berdasarkan komponen material bersatuan kg</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Besi dari Backup Volume</p><p className="text-xl font-bold">{formatNumber(totalBackupRebarKg, 2)} kg</p><p className="text-[10px] text-slate-500">Selisih belum ter-backup: {formatNumber(uncoveredRebarKg, 2)} kg</p></div>
        </div>
      </section>

      <section className="no-print rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">3. Override Pengurang Kebutuhan</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Persentase pengurang hanya diterapkan pada rekap kebutuhan dan nilai estimasi PDF. Tidak mengubah koefisien, volume RAB, snapshot AHSP, atau data tersimpan.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Pengurang material (%)
            <input type="number" min={0} max={99} step={0.5} value={materialReductionPercent}
              onChange={(event) => setMaterialReductionPercent(Math.max(0, Math.min(99, Number(event.target.value) || 0)))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">Diterapkan pada volume kebutuhan dan nilai material.</span>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Pengurang upah (%)
            <input type="number" min={0} max={99} step={0.5} value={laborReductionPercent}
              onChange={(event) => setLaborReductionPercent(Math.max(0, Math.min(99, Number(event.target.value) || 0)))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">Diterapkan pada nilai upah simulasi; HOK penjadwalan tetap memakai HOK dasar.</span>
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] text-amber-800">Nilai material setelah pengurang</p><p className="text-base font-bold text-amber-950">{formatRupiah(materialRows.reduce((sum, row) => sum + row.netAmount, 0))}</p></div>
          <div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] text-amber-800">Nilai upah setelah pengurang</p><p className="text-base font-bold text-amber-950">{formatRupiah(laborNetTotal)}</p></div>
        </div>
        <p className="mt-3 text-[10px] text-slate-500">Semua pengaturan ini hanya berlaku untuk sesi halaman saat ini dan tidak disimpan ke database.</p>
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
          <div className="cover-brand" style={{ color: activeTheme.accent }}>JAVAWASTHU MANAGEMENT</div>
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
          <div className={`cover-signatures signature-count-${pdfSignatureCount}`}>
            {pdfSigners.slice(0, pdfSignatureCount).map((signer,index) => (
              <div key={index}>
                <span>{signer.role || `Penandatangan ${index + 1}`}</span>
                <strong>{signer.name || ' '}</strong>
                <small>{signer.identifier || ' '}</small>
              </div>
            ))}
          </div>
          <div className="cover-footer">DOKUMEN RAB · {textValue(project.client)} · {textValue(project.kabupaten_kota)}</div>
        </section>

        {/* 2. REKAPITULASI PEKERJAAN */}
        <section className="report-page">
          <SectionHeading letter="A" title="REKAPITULASI PEKERJAAN" theme={activeTheme} />
          <p className="report-intro">Rekapitulasi disusun per lokasi dan mengikuti kategori serta subkategori pekerjaan yang tersimpan pada RAB masing-masing lokasi.</p>
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
          {orderedDivisions.map((division, divisionIndex) => {
            const rows = division.items ?? [];
            const groups = groupWorkItemsInManualOrder(rows, division.workCategories ?? []);
            let itemNumber = 0;
            return <section className="report-subsection" key={division.id}>
              <h3 style={{background:activeTheme.soft,borderColor:activeTheme.border,color:activeTheme.text}}>{divisionIndex + 1}. {division.name}</h3>
              <table className="report-table compact">
                <thead><tr><th style={{width:'5%'}}>No.</th><th style={{width:'13%'}}>Kode</th><th>Uraian Pekerjaan</th><th style={{width:'7%'}}>Sat.</th><th style={{width:'9%'}}>Volume</th><th style={{width:'19%'}}>Harga Satuan</th><th style={{width:'20%'}}>Jumlah Harga</th></tr></thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="summary-division"><td colSpan={7}><strong>{group.name}</strong></td></tr>
                      {group.items.map((item) => {
                        itemNumber += 1;
                        return <tr key={item.id}>
                          <td className="center">{itemNumber}</td>
                          <td>{item.code || '-'}</td>
                          <td>{item.name}</td>
                          <td className="center">{item.unit || '-'}</td>
                          <td className="number">{formatNumber(numberValue(item.volume),3)}</td>
                          <td className="number">{formatRupiah(numberValue(item.unit_price))}</td>
                          <td className="number">{formatRupiah(numberValue(item.total_price))}</td>
                        </tr>;
                      })}
                    </Fragment>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={7} className="center">Belum ada rincian pada tahapan ini.</td></tr>}
                </tbody>
                <tfoot><tr><th colSpan={6}>JUMLAH {division.name.toUpperCase()}</th><th className="number">{formatRupiah(rows.reduce((sum,item)=>sum+numberValue(item.total_price),0))}</th></tr></tfoot>
              </table>
            </section>;
          })}
        </section>

        {/* 4. RINCIAN AHSP BERDASARKAN SNAPSHOT RAB */}
        <section className="report-page">
          <SectionHeading letter="C" title="RINCIAN ANALISIS HARGA SATUAN PEKERJAAN" theme={activeTheme} />
          <p className="report-intro">Setiap analisa diambil dari snapshot AHSP yang benar-benar tersimpan pada item RAB. Nama pekerjaan mengikuti uraian yang Anda tetapkan di RAB dan seluruh urutan mengikuti susunan manual per lokasi.</p>
          {orderedDivisions.map((division, divisionIndex) => {
            const rows = division.items ?? [];
            return (
              <section className="report-subsection ahsp-menu" key={division.id}>
                <h3 style={{background:activeTheme.soft,borderColor:activeTheme.border,color:activeTheme.text}}>
                  {divisionIndex + 1}. {division.name}
                </h3>
                {rows.map((item,index) => {
                  const components = parseRabItemComponents(item);
                  const grouped = ['material','labor','equipment','other']
                    .map((type) => ({type, rows:components.filter((component) => component.type === type)}))
                    .filter((group) => group.rows.length > 0);
                  return (
                    <section className="report-subsection ahsp-block" key={item.id}>
                      <h4 className="ahsp-item-heading" style={{background:activeTheme.soft,borderColor:activeTheme.border,color:activeTheme.text}}>
                        {index + 1}. {item.name}
                        {item.code ? <small style={{marginLeft:6,fontWeight:500}}>({item.code})</small> : null}
                      </h4>
                      {item.work_group_name?.trim() && <p className="ahsp-work-group">Kelompok item: <strong>{item.work_group_name}</strong></p>}
                      <div className="ahsp-meta">
                        <span>Satuan pekerjaan: <strong>{item.unit || '-'}</strong></span>
                        <span>Volume RAB: <strong>{formatNumber(numberValue(item.volume),4)} {item.unit || ''}</strong></span>
                        <span>Harga satuan RAB: <strong>{formatRupiah(numberValue(item.unit_price))}</strong></span>
                      </div>
                      {grouped.map((group) => (
                        <Fragment key={group.type}>
                          <div className="component-label" style={{color:activeTheme.accent}}>{componentTypeLabel(group.type as SnapshotComponent['type'])}</div>
                          <table className="report-table compact">
                            <thead><tr><th style={{width:'6%'}}>No.</th><th>Uraian</th><th style={{width:'10%'}}>Sat.</th><th style={{width:'14%'}}>Koefisien</th><th style={{width:'14%'}}>Vol. (1 AHSP)</th><th style={{width:'19%'}}>Harga Satuan</th><th style={{width:'19%'}}>Jumlah</th></tr></thead>
                            <tbody>{group.rows.map((component,ci)=><tr key={`${component.name}-${ci}`}><td className="center">{ci+1}</td><td>{component.name}</td><td className="center">{component.unit}</td><td className="number">{formatNumber(component.coefficient,5)}</td><td className="number">{formatNumber(component.coefficient,5)}</td><td className="number">{formatRupiah(component.unitPrice)}</td><td className="number">{formatRupiah(component.subtotal)}</td></tr>)}</tbody>
                            <tfoot><tr><th colSpan={6}>SUBTOTAL {componentTypeLabel(group.type as SnapshotComponent['type'])}</th><th className="number">{formatRupiah(group.rows.reduce((sum,component)=>sum+component.subtotal,0))}</th></tr></tfoot>
                          </table>
                        </Fragment>
                      ))}
                      {components.length===0 && <p className="empty-note">Snapshot komponen AHSP tidak tersedia pada item ini.</p>}
                      <div className="ahsp-total"><span>HARGA SATUAN PEKERJAAN</span><strong>{formatRupiah(numberValue(item.unit_price))}</strong></div>
                    </section>
                  );
                })}
                {rows.length===0 && <p className="empty-note">Belum ada item AHSP pada lokasi ini.</p>}
              </section>
            );
          })}
        </section>

        {/* 5. MATRIKS MATERIAL PER ITEM PEKERJAAN */}
        <section className="report-page">
          <SectionHeading letter="D" title="MATRIKS KEBUTUHAN MATERIAL PER ITEM PEKERJAAN" theme={activeTheme} />
          <p className="report-intro">
            Kebutuhan dihitung dari koefisien komponen material pada snapshot AHSP × volume masing-masing item RAB. Perhitungan mencakup semua lokasi. Pengurang material {formatNumber(materialReductionPercent, 2)}% ditampilkan terpisah sebagai kebutuhan bersih.
          </p>
          <table className="report-table compact">
            <thead>
              <tr>
                <th style={{width:'4%'}}>No.</th>
                <th style={{width:'11%'}}>Lokasi</th>
                <th style={{width:'19%'}}>Item Pekerjaan</th>
                <th>Material</th>
                <th style={{width:'14%'}}>material_id / Kode</th>
                <th style={{width:'7%'}}>Sat.</th>
                <th style={{width:'8%'}}>Koef.</th>
                <th style={{width:'8%'}}>Vol. RAB</th>
                <th style={{width:'10%'}}>Kebutuhan</th>
                <th style={{width:'10%'}}>Setelah Override</th>
              </tr>
            </thead>
            <tbody>
              {materialUsageRows.map((row, index) => (
                <tr key={row.key}>
                  <td className="center">{index + 1}</td>
                  <td>{row.divisionName}</td>
                  <td>{row.itemCode ? row.itemCode + ' · ' : ''}{row.itemName}</td>
                  <td>{row.materialName}</td>
                  <td>{row.materialId || 'Belum terpetakan'}{row.materialCode ? <small> · {row.materialCode}</small> : null}</td>
                  <td className="center">{row.unit}</td>
                  <td className="number">{formatNumber(row.coefficient, 5)}</td>
                  <td className="number">{formatNumber(row.rabVolume, 3)}</td>
                  <td className="number">{formatNumber(row.quantity, 3)}</td>
                  <td className="number">{formatNumber(row.netQuantity, 3)}</td>
                </tr>
              ))}
              {materialUsageRows.length === 0 && <tr><td colSpan={10} className="center">Tidak ditemukan komponen material pada snapshot AHSP RAB.</td></tr>}
            </tbody>
          </table>
          <p className="report-intro">
            Catatan identitas: {unlinkedMaterialCount} jenis material belum mempunyai material_id pada snapshot lama. Komponen tersebut tetap direkap memakai nama dan satuan agar tidak hilang, tetapi perlu diperiksa pemetaannya ke Master Material.
          </p>
        </section>

        {/* 6. REKAP MATERIAL BERDASARKAN IDENTITAS MASTER */}
        <section className="report-page">
          <SectionHeading letter="E" title="REKAP TOTAL KEBUTUHAN MATERIAL PROYEK" theme={activeTheme} />
          <p className="report-intro">
            Baris dengan material_id yang sama digabung sebagai satu jenis material. Nilai setelah override = kebutuhan dasar × (1 − {formatNumber(materialReductionPercent, 2)}%).
          </p>
          <table className="report-table">
            <thead>
              <tr>
                <th style={{width:'5%'}}>No.</th>
                <th>Nama Material</th>
                <th style={{width:'18%'}}>material_id</th>
                <th style={{width:'8%'}}>Sat.</th>
                <th style={{width:'9%'}}>Jumlah Item</th>
                <th style={{width:'12%'}}>Kebutuhan Dasar</th>
                <th style={{width:'12%'}}>Kebutuhan Bersih</th>
                <th style={{width:'17%'}}>Nilai Dasar</th>
                <th style={{width:'17%'}}>Nilai Bersih</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map((row, index) => (
                <tr key={row.key}>
                  <td className="center">{index + 1}</td>
                  <td>{row.name}{row.materialCode ? <small> · {row.materialCode}</small> : null}</td>
                  <td>{row.materialId || 'Belum terpetakan'}</td>
                  <td className="center">{row.unit}</td>
                  <td className="number">{row.itemCount}</td>
                  <td className="number">{formatNumber(row.quantity, 3)}</td>
                  <td className="number">{formatNumber(row.netQuantity, 3)}</td>
                  <td className="number">{formatRupiah(row.amount)}</td>
                  <td className="number">{formatRupiah(row.netAmount)}</td>
                </tr>
              ))}
              {materialRows.length === 0 && <tr><td colSpan={9} className="center">Belum ada material yang dapat direkap.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={7}>TOTAL NILAI MATERIAL</th>
                <th className="number">{formatRupiah(materialRows.reduce((sum, row) => sum + row.amount, 0))}</th>
                <th className="number">{formatRupiah(materialRows.reduce((sum, row) => sum + row.netAmount, 0))}</th>
              </tr>
            </tfoot>
          </table>
          <p className="report-intro">Kuantitas antar-material yang berbeda satuan tidak dijumlahkan menjadi satu angka total. Nilai uang dijumlahkan karena seluruh komponen sudah menggunakan harga snapshot masing-masing.</p>
        </section>

        {/* 7. REKONSILIASI BERAT BESI AHSP DAN BACKUP VOLUME */}
        <section className="report-page">
          <SectionHeading letter="F" title="REKONSILIASI PEMBESIAN AHSP DAN BACKUP VOLUME" theme={activeTheme} />
          <p className="report-intro">
            Berat besi AHSP dihitung dari komponen material bersatuan kg × volume item RAB. Rincian diameter hanya diambil dari Backup Volume dengan mode pembesian lama atau pembesian struktur otomatis yang benar-benar tersedia.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 p-2"><small>Total besi AHSP</small><strong className="block">{formatNumber(totalAhspRebarKg, 2)} kg</strong></div>
            <div className="rounded-lg border border-slate-200 p-2"><small>Total dari Backup Volume</small><strong className="block">{formatNumber(totalBackupRebarKg, 2)} kg</strong></div>
            <div className="rounded-lg border border-slate-200 p-2"><small>Belum ter-backup (estimasi selisih)</small><strong className="block">{formatNumber(uncoveredRebarKg, 2)} kg</strong></div>
          </div>
          <table className="report-table compact" style={{marginTop:8}}>
            <thead>
              <tr>
                <th style={{width:'5%'}}>No.</th>
                <th style={{width:'13%'}}>Lokasi</th>
                <th>Kode / Uraian Pekerjaan</th>
                <th style={{width:'14%'}}>Besi AHSP (kg)</th>
                <th style={{width:'14%'}}>Backup (kg)</th>
                <th style={{width:'13%'}}>Selisih (kg)</th>
                <th style={{width:'10%'}}>Cakupan</th>
                <th style={{width:'15%'}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rebarReviewRows.map((row, index) => {
                const statusLabel = row.status === 'sesuai' ? 'Sesuai'
                  : row.status === 'belum_lengkap' ? 'Backup belum lengkap'
                  : row.status === 'belum_backup' ? 'Belum ada Backup'
                  : row.status === 'lebih_backup' ? 'Backup lebih besar'
                  : row.status === 'backup_saja' ? 'Backup saja'
                  : 'Parameter perlu cek';
                return (
                  <Fragment key={row.itemId}>
                    <tr>
                      <td className="center">{index + 1}</td>
                      <td>{row.divisionName}</td>
                      <td>{row.code ? row.code + ' · ' : ''}{row.name}</td>
                      <td className="number">{formatNumber(row.ahspWeightKg, 2)}</td>
                      <td className="number">{formatNumber(row.backupWeightKg, 2)}</td>
                      <td className="number">{formatNumber(row.differenceKg, 2)}</td>
                      <td className="number">{row.ahspWeightKg > 0 ? formatNumber(row.coveragePercent, 1) + '%' : '—'}</td>
                      <td>{statusLabel}</td>
                    </tr>
                    {row.issues.map((issue, issueIndex) => (
                      <tr key={row.itemId + '-issue-' + issueIndex}><td></td><td colSpan={7} className="empty-note">Pemeriksaan: {issue}</td></tr>
                    ))}
                  </Fragment>
                );
              })}
              {rebarReviewRows.length === 0 && <tr><td colSpan={8} className="center">Tidak ditemukan komponen besi AHSP bersatuan kg atau rincian pembesian pada Backup Volume.</td></tr>}
            </tbody>
          </table>

          <h3 className="mt-3 mb-2 text-sm font-bold" style={{color:activeTheme.text}}>Rekap pembesian dari Backup Volume per diameter</h3>
          <table className="report-table">
            <thead><tr><th style={{width:'8%'}}>No.</th><th>Diameter</th><th style={{width:'26%'}}>Panjang total (m)</th><th style={{width:'28%'}}>Berat hasil hitung (kg)</th><th style={{width:'18%'}}>Sumber rincian</th></tr></thead>
            <tbody>
              {rebarTotals.map((row, index) => (
                <tr key={row.diameter}>
                  <td className="center">{index + 1}</td>
                  <td>Ø{row.diameter} mm</td>
                  <td className="number">{formatNumber(row.totalLengthM, 3)}</td>
                  <td className="number">{formatNumber(row.requiredWeightKg, 3)}</td>
                  <td className="number">{row.sourceDetails}</td>
                </tr>
              ))}
              {rebarTotals.length === 0 && <tr><td colSpan={5} className="center">Belum ada rincian diameter besi dari Backup Volume.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan={3}>TOTAL BERAT DARI BACKUP VOLUME</th><th className="number">{formatNumber(totalBackupRebarKg, 3)} kg</th><th></th></tr></tfoot>
          </table>
          <p className="report-intro">
            Penting: total diameter di atas hanya mencakup item yang memiliki rincian pembesian di Backup Volume. Item dengan status "Belum ada Backup" atau "Backup belum lengkap" tetap dihitung dari AHSP dan selisihnya ditampilkan, tetapi tidak dikarang menjadi diameter tertentu.
          </p>
        </section>

        {/* 8. RENCANA FORMASI DAN DURASI TENAGA KERJA */}
        <section className="report-page">
          <SectionHeading letter="G" title="RENCANA FORMASI TENAGA KERJA DAN DURASI" theme={activeTheme} />
          <p className="report-intro">
            HOK dasar dihitung dari koefisien upah pada snapshot AHSP × volume RAB semua lokasi. Durasi per formasi = HOK ÷ jumlah orang. Target rencana: {targetDurationDays} hari kerja. Estimasi waktu tim mengikuti durasi terlama antara kelompok pekerja dan tukang.
          </p>
          <table className="report-table">
            <thead><tr><th>Kelompok</th><th style={{width:'15%'}}>HOK dasar</th><th style={{width:'15%'}}>HOK rencana</th><th style={{width:'13%'}}>Orang</th><th style={{width:'17%'}}>Durasi</th><th style={{width:'18%'}}>Rekomendasi untuk target</th></tr></thead>
            <tbody>
              <tr><td>Mandor</td><td className="number">{formatNumber(baseMandorHok, 2)}</td><td className="number">{formatNumber(effectiveMandorHok, 2)}</td><td className="number">{foremanMode === 'none' ? '0' : '1'}</td><td className="number">{formatNumber(effectiveMandorHok, 1)} hari kehadiran</td><td>{foremanMode === 'none' ? 'Tidak dialokasikan' : 'Mengikuti HOK / pengaturan mandor'}</td></tr>
              <tr><td>Kepala Tukang</td><td className="number">{formatNumber(laborHokByRole.kepala_tukang, 2)}</td><td className="number">{formatNumber(laborHokByRole.kepala_tukang, 2)}</td><td className="number">1</td><td className="number">{formatNumber(laborHokByRole.kepala_tukang, 1)} hari</td><td>1 orang · sesuai HOK</td></tr>
              <tr><td>Tukang</td><td className="number">{formatNumber(masonHok, 2)}</td><td className="number">{formatNumber(masonHok, 2)}</td><td className="number">{masonCount}</td><td className="number">{formatNumber(masonDays, 1)} hari</td><td>{recommendedMasonCount} orang untuk target</td></tr>
              <tr><td>Pekerja + tenaga kerja lainnya</td><td className="number">{formatNumber(workerHok, 2)}</td><td className="number">{formatNumber(workerHok, 2)}</td><td className="number">{workerCount}</td><td className="number">{formatNumber(workerDays, 1)} hari</td><td>{recommendedWorkerCount} orang untuk target</td></tr>
            </tbody>
          </table>
          <div className="report-totals">
            <div><span>Durasi hasil formasi pekerja</span><strong>{formatNumber(workerDays, 1)} hari</strong></div>
            <div><span>Durasi hasil formasi tukang</span><strong>{formatNumber(masonDays, 1)} hari</strong></div>
            <div><span>Selisih durasi</span><strong>{formatNumber(crewDayDifference, 1)} hari</strong></div>
            <div className="grand" style={{background:activeTheme.soft,borderColor:activeTheme.border}}><span>ESTIMASI DURASI TIM</span><strong style={{color:activeTheme.accent}}>{formatNumber(estimatedCrewDays, 1)} hari kerja</strong></div>
          </div>
          <p className="report-intro">HOK pekerja pada simulasi mencakup kategori pekerja dan tenaga kerja lain yang belum dikenali sebagai mandor, kepala tukang, atau tukang. Komponen upah dengan satuan selain OH/HOK/hari tidak dimasukkan ke perhitungan durasi tenaga, tetapi tetap disertakan pada rincian nilai upah.</p>
        </section>

        {/* 9. RINCIAN UPAH SETELAH KEBIJAKAN */}
        <section className="report-page">
          <SectionHeading letter="H" title="RINCIAN UPAH DAN OVERRIDE TENAGA KERJA" theme={activeTheme} />
          <p className="report-intro">
            Nilai dihitung dari koefisien AHSP × volume RAB. Kebijakan mandor: {foremanMode === 'none' ? 'tanpa mandor' : foremanMode === 'custom' ? 'mandor hadir ' + formatNumber(effectiveMandorHok, 2) + ' hari' : 'mengikuti HOK AHSP'}. Pengurang upah: {formatNumber(laborReductionPercent, 2)}%. HOK dasar untuk penjadwalan tidak dikurangi oleh persentase override upah.
          </p>
          <table className="report-table">
            <thead><tr><th style={{width:'5%'}}>No.</th><th>Uraian Tenaga Kerja</th><th style={{width:'8%'}}>Sat.</th><th style={{width:'11%'}}>HOK/Qty Dasar</th><th style={{width:'11%'}}>HOK/Qty Rencana</th><th style={{width:'16%'}}>Harga Satuan</th><th style={{width:'17%'}}>Nilai Dasar</th><th style={{width:'17%'}}>Nilai Bersih</th></tr></thead>
            <tbody>
              {plannedLaborRows.map((row, index) => (
                <tr key={(row.upahId || row.name) + '-' + row.unit}>
                  <td className="center">{index + 1}</td>
                  <td>{row.name} <small>({laborRoleLabel(row.role)})</small></td>
                  <td className="center">{row.unit}</td>
                  <td className="number">{formatNumber(row.volume, 4)}</td>
                  <td className="number">{formatNumber(row.plannedVolume, 4)}</td>
                  <td className="number">{formatRupiah(row.unitPrice)}</td>
                  <td className="number">{formatRupiah(row.grossAmount)}</td>
                  <td className="number">{formatRupiah(row.netAmount)}</td>
                </tr>
              ))}
              {plannedLaborRows.length === 0 && <tr><td colSpan={8} className="center">Tidak ditemukan komponen upah pada snapshot AHSP RAB.</td></tr>}
            </tbody>
            <tfoot>
              <tr><th colSpan={6}>TOTAL NILAI UPAH</th><th className="number">{formatRupiah(laborGrossTotal)}</th><th className="number">{formatRupiah(laborNetTotal)}</th></tr>
            </tfoot>
          </table>
        </section>

        <footer className="report-footer" style={{borderTop:`2px solid ${activeTheme.accent}`}}>
          <div><strong>JAVAWASTHU MANAGEMENT</strong><span>Rekapitulasi Rencana Anggaran Biaya · {project.title}</span></div>
          <div className={`signature-grid signature-count-${pdfSignatureCount}`}>
            {pdfSigners.slice(0,pdfSignatureCount).map((signer,index) => (
              <div key={index}>
                <span>{signer.role || `Penandatangan ${index + 1}`}</span>
                <strong>{signer.name || ' '}</strong>
                <small>{signer.identifier || ' '}</small>
              </div>
            ))}
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
        .cover-signatures { display:grid; gap:28px; margin-top:35px; }
        .cover-signatures.signature-count-1 { grid-template-columns:1fr; justify-items:end; }
        .cover-signatures.signature-count-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .cover-signatures.signature-count-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .cover-signatures.signature-count-1 div { width:48%; }
        .ahsp-item-heading { margin:0 0 5px; padding:5px 7px; border:1px solid; font-size:8pt; font-weight:800; }
        .ahsp-work-group { margin:0 0 4px; color:#64748b; font-size:7pt; }
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
        .signature-grid { display:grid; gap:12px; margin-top:20px; }
        .signature-grid.signature-count-1 { grid-template-columns:1fr; justify-items:end; }
        .signature-grid.signature-count-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .signature-grid.signature-count-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .signature-grid.signature-count-1 div { width:48%; }
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
