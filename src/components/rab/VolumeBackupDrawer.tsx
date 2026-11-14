'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Ruler,
  DraftingCompass,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  RotateCcw,
  LockKeyhole,
  Sigma,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';
import { recalculateProjectTotalFromRabItem } from '@/lib/services/projectService';

type CalcMode = 'standard' | 'wall_area' | 'frame_length' | 'glass_area' | 'opening_count' | 'trapezoid' | 'rebar' | 'custom_formula';

type OpeningDimension = { label?: string; width: number | string; height: number | string; quantity: number | string };
type FrameSegment = { label?: string; length: number | string; quantity: number | string };
type GlassPanel = { label?: string; width: number | string; height: number | string; quantity: number | string };
type OpeningUnit = { label?: string; quantity: number | string };

type VolumeParameters = {
  length?: number | string;
  width?: number | string;
  height?: number | string;
  quantity?: number | string;
  top_width?: number | string;
  bottom_width?: number | string;
  depth?: number | string;
  diameter?: number | string;
  bar_length?: number | string;
  bars?: number | string;
  formula?: string;
  wall_height?: number | string;
  wall_length?: number | string;
  openings?: OpeningDimension[];
  frame_material?: 'aluminium' | 'kayu' | string;
  frame_segments?: FrameSegment[];
  glass_panels?: GlassPanel[];
  opening_units?: OpeningUnit[];
  [key: string]: unknown;
};

export type VolumeBackupSubitemSnapshot = {
  masterAhspId: string;
  code?: string;
  name?: string;
  unit?: string;
  coefficient: number;
  unit_price: number;
  line_total: number;
  notes?: string | null;
  components?: Array<{
    name: string;
    unit: string;
    coefficient: number;
    unit_price: number;
    type: 'material' | 'labor' | 'equipment';
    material_id?: string;
    upah_id?: string;
    alat_id?: string;
  }>;
  subitems?: VolumeBackupSubitemSnapshot[];
  volume_backup?: {
    original_coefficient: number;
    total_volume: number;
    details_count: number;
    updated_at: string;
  } | null;
};

export type VolumeBackupRabItem = {
  /** ID rab_items induk, dipakai sebagai foreign key seluruh detail volume. */
  id: string;
  code: string;
  name: string;
  unit: string;
  volume: number | string;
  unit_price: number | string;
  total_price?: number | string;
  /** true bila drawer sedang menghitung koefisien salah satu sub-item. */
  isSubitem?: boolean;
  /** Jalur ID masterAhspId dari root hingga sub-item target, dipisah tanda /. */
  subitemPath?: string | null;
  /** Snapshot root untuk memperbarui node sasaran secara aman. */
  subitems_snapshot?: VolumeBackupSubitemSnapshot[] | null;
  /** Volume baris RAB induk untuk estimasi kontribusi sub-item. */
  parentVolume?: number | string;
};

type VolumeDetail = {
  id: string;
  rab_item_id: string;
  subitem_path?: string | null;
  description: string;
  drawing_ref: string | null;
  multiplier: number | string | null;
  calc_mode: CalcMode | null;
  parameters: VolumeParameters | null;
  subtotal: number | string | null;
  created_at: string;
};

type FormState = {
  description: string;
  drawingRef: string;
  multiplier: string;
  calcMode: CalcMode;
  parameters: VolumeParameters;
};

type Props = {
  open: boolean;
  item: VolumeBackupRabItem | null;
  onClose: () => void;
  /** Dipanggil setelah backup target (induk atau sub-item) dan harga RAB tersinkron. */
  onSaved?: (totalVolume: number) => void | Promise<void>;
};

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const DEFAULT_FORM: FormState = {
  description: '',
  drawingRef: '',
  multiplier: '1',
  calcMode: 'standard',
  parameters: { length: '1', width: '1', height: '1', quantity: '1' },
};

const MODE_OPTIONS: Array<{ value: CalcMode; label: string; description: string }> = [
  { value: 'standard', label: 'Dimensi standar / 3D', description: 'Panjang × lebar × tinggi × jumlah' },
  { value: 'wall_area', label: 'Luas 2 dimensi / dinding', description: 'Tinggi × total panjang dinding − luas pintu dan jendela' },
  { value: 'frame_length', label: 'Kusen aluminium / kayu', description: 'Akumulasi panjang profil, batang, tiang, ambang, dan mullion (m¹)' },
  { value: 'glass_area', label: 'Kaca (luas bidang)', description: 'Lebar × tinggi setiap panel kaca × jumlah (m²)' },
  { value: 'opening_count', label: 'Bukaan (unit)', description: 'Jumlah unit pintu, jendela, ventilasi, atau bukaan lainnya' },
  { value: 'trapezoid', label: 'Penampang trapesium', description: 'Untuk galian saluran, talud, dan penampang' },
  { value: 'rebar', label: 'Berat pembesian', description: 'Berat besi berdasarkan diameter dan panjang' },
  { value: 'custom_formula', label: 'Rumus khusus', description: 'Masukkan operasi hitung sesuai kebutuhan' },
];

function defaultParametersForMode(mode: CalcMode): VolumeParameters {
  switch (mode) {
    case 'standard': return { length: '1', width: '1', height: '1', quantity: '1' };
    case 'wall_area': return { wall_height: '3', wall_length: '10', openings: [{ label: 'Pintu', width: '0.9', height: '2.1', quantity: '1' }] };
    case 'frame_length': return { frame_material: 'aluminium', frame_segments: [{ label: 'Profil kusen vertikal kiri', length: '2.1', quantity: '2' }, { label: 'Profil kusen horizontal atas', length: '0.9', quantity: '1' }] };
    case 'glass_area': return { glass_panels: [{ label: 'Panel kaca 1', width: '0.8', height: '1.2', quantity: '1' }] };
    case 'opening_count': return { opening_units: [{ label: 'Unit pintu/jendela', quantity: '1' }] };
    case 'trapezoid': return { top_width: '1', bottom_width: '1', depth: '1', length: '1', quantity: '1' };
    case 'rebar': return { diameter: '10', bar_length: '1', bars: '1' };
    case 'custom_formula': return { formula: '' };
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rounded4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function formatNumber(value: number, maximumFractionDigits = 4): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function safeExpression(expression: string): number {
  // Parser aritmetika sederhana. Tidak menggunakan eval/Function.
  const source = expression.replace(/\s+/g, '');
  if (!source || !/^[0-9.+\-*/()]+$/.test(source)) {
    throw new Error('Rumus hanya boleh berisi angka, titik desimal, +, -, ×, ÷, dan tanda kurung.');
  }

  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
  if (tokens.join('') !== source) throw new Error('Format rumus tidak valid.');

  let index = 0;
  const parseExpression = (): number => {
    let value = parseTerm();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = parseFactor();
      if (operator === '/' && right === 0) throw new Error('Pembagian dengan nol tidak diperbolehkan.');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const parseFactor = (): number => {
    const token = tokens[index];
    if (token === '+' || token === '-') {
      index += 1;
      const value = parseFactor();
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      index += 1;
      const value = parseExpression();
      if (tokens[index] !== ')') throw new Error('Kurung tutup belum lengkap.');
      index += 1;
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      throw new Error('Angka atau operator pada rumus tidak lengkap.');
    }
    index += 1;
    return Number(token);
  };

  const result = parseExpression();
  if (index !== tokens.length) throw new Error('Ada bagian rumus yang belum terbaca.');
  if (!Number.isFinite(result) || result < 0) throw new Error('Hasil rumus harus angka valid dan tidak negatif.');
  return result;
}

function calculateBase(mode: CalcMode, parameters: VolumeParameters): number {
  const p = (key: keyof VolumeParameters, fallback = 1, allowZero = false) => {
    const raw = parameters[key] ?? fallback;
    if (String(raw).trim() === '') throw new Error(`Nilai ${String(key)} belum diisi.`);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
      throw new Error(`Nilai ${String(key)} harus ${allowZero ? 'nol atau lebih' : 'lebih besar dari nol'}.`);
    }
    return value;
  };

  if (mode === 'standard') {
    return p('length') * p('width') * p('height') * p('quantity');
  }
  if (mode === 'wall_area') {
    const wallHeight = p('wall_height');
    const wallLength = p('wall_length');
    const grossArea = wallHeight * wallLength;
    const openings = Array.isArray(parameters.openings) ? parameters.openings : [];
    const openingArea = openings.reduce((sum, opening, index) => {
      const width = Number(opening.width ?? 0);
      const height = Number(opening.height ?? 0);
      const quantity = Number(opening.quantity ?? 1);
      if (![width, height, quantity].every(Number.isFinite) || width < 0 || height < 0 || quantity < 0) {
        throw new Error(`Dimensi opening ke-${index + 1} tidak valid.`);
      }
      if ((width === 0) !== (height === 0)) {
        throw new Error(`Lebar dan tinggi opening ke-${index + 1} harus diisi bersama.`);
      }
      if (width === 0 && height === 0) return sum;
      if (quantity === 0) return sum;
      return sum + width * height * quantity;
    }, 0);
    if (openingArea > grossArea + 0.0000001) {
      throw new Error('Total luas opening tidak boleh melebihi luas kotor dinding.');
    }
    return Math.max(0, grossArea - openingArea);
  }
  if (mode === 'frame_length') {
    const segments = Array.isArray(parameters.frame_segments) ? parameters.frame_segments : [];
    if (segments.length === 0) throw new Error('Tambahkan minimal satu komponen/profil kusen.');
    return segments.reduce((sum, segment, index) => {
      const length = Number(segment.length);
      const quantity = Number(segment.quantity);
      if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Panjang dan jumlah komponen kusen baris ke-${index + 1} harus lebih besar dari nol.`);
      }
      return sum + length * quantity;
    }, 0);
  }
  if (mode === 'glass_area') {
    const panels = Array.isArray(parameters.glass_panels) ? parameters.glass_panels : [];
    if (panels.length === 0) throw new Error('Tambahkan minimal satu bidang/panel kaca.');
    return panels.reduce((sum, panel, index) => {
      const width = Number(panel.width);
      const height = Number(panel.height);
      const quantity = Number(panel.quantity);
      if (![width, height, quantity].every(Number.isFinite) || width <= 0 || height <= 0 || quantity <= 0) {
        throw new Error(`Lebar, tinggi, dan jumlah panel kaca baris ke-${index + 1} harus lebih besar dari nol.`);
      }
      return sum + width * height * quantity;
    }, 0);
  }
  if (mode === 'opening_count') {
    const units = Array.isArray(parameters.opening_units) ? parameters.opening_units : [];
    if (units.length === 0) throw new Error('Tambahkan minimal satu jenis bukaan.');
    return units.reduce((sum, opening, index) => {
      const quantity = Number(opening.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Jumlah unit bukaan baris ke-${index + 1} harus bilangan bulat lebih besar dari nol.`);
      }
      return sum + quantity;
    }, 0);
  }
  if (mode === 'trapezoid') {
    const top = p('top_width', 0, true);
    const bottom = p('bottom_width', 0, true);
    if (top + bottom <= 0) throw new Error('Lebar atas dan bawah tidak boleh sama-sama nol.');
    const depth = p('depth', 0);
    const length = p('length', 0);
    const quantity = p('quantity', 1);
    return ((top + bottom) / 2) * depth * length * quantity;
  }
  if (mode === 'rebar') {
    const diameter = p('diameter', 0);
    const barLength = p('bar_length', 0);
    const bars = p('bars', 0);
    // Rumus pendekatan berat teoritis besi: d² / 162 kg per meter (d dalam mm).
    return ((diameter * diameter) / 162) * barLength * bars;
  }
  return safeExpression(String(parameters.formula ?? ''));
}

function normalizeParameters(mode: CalcMode, parameters: VolumeParameters): VolumeParameters {
  if (mode === 'custom_formula') return { formula: String(parameters.formula ?? '').trim() };
  if (mode === 'wall_area') {
    const openings = Array.isArray(parameters.openings) ? parameters.openings : [];
    return {
      wall_height: Number(parameters.wall_height),
      wall_length: Number(parameters.wall_length),
      openings: openings.map((opening) => ({
        label: String(opening.label ?? '').trim(),
        width: Number(opening.width ?? 0),
        height: Number(opening.height ?? 0),
        quantity: Number(opening.quantity ?? 1),
      })),
    };
  }
  if (mode === 'frame_length') {
    const segments = Array.isArray(parameters.frame_segments) ? parameters.frame_segments : [];
    return {
      frame_material: parameters.frame_material === 'kayu' ? 'kayu' : 'aluminium',
      frame_segments: segments.map((segment) => ({ label: String(segment.label ?? '').trim(), length: Number(segment.length), quantity: Number(segment.quantity) })),
    };
  }
  if (mode === 'glass_area') {
    const panels = Array.isArray(parameters.glass_panels) ? parameters.glass_panels : [];
    return { glass_panels: panels.map((panel) => ({ label: String(panel.label ?? '').trim(), width: Number(panel.width), height: Number(panel.height), quantity: Number(panel.quantity) })) };
  }
  if (mode === 'opening_count') {
    const units = Array.isArray(parameters.opening_units) ? parameters.opening_units : [];
    return { opening_units: units.map((opening) => ({ label: String(opening.label ?? '').trim(), quantity: Number(opening.quantity) })) };
  }
  const numericKeys: Record<'standard' | 'trapezoid' | 'rebar', Array<keyof VolumeParameters>> = {
    standard: ['length', 'width', 'height', 'quantity'],
    trapezoid: ['top_width', 'bottom_width', 'depth', 'length', 'quantity'],
    rebar: ['diameter', 'bar_length', 'bars'],
  };
  return Object.fromEntries(numericKeys[mode].map((key) => [key, Number(parameters[key])]));
}

function calculateSubtotal(mode: CalcMode, parameters: VolumeParameters, multiplier: number): number {
  return rounded4(calculateBase(mode, parameters) * multiplier);
}

function modeLabel(mode: CalcMode | null): string {
  return MODE_OPTIONS.find((option) => option.value === (mode ?? 'standard'))?.label ?? 'Dimensi standar';
}

/**
 * Susun ulang rumus dari parameters JSONB agar detail yang sudah tersimpan
 * tetap dapat dibaca saat drawer dibuka kembali.
 */
function calculationExpression(row: VolumeDetail, unit: string): string {
  const parameters = row.parameters ?? {};
  const value = (key: keyof VolumeParameters, fallback = 1) =>
    formatNumber(toNumber(parameters[key], fallback), 4);
  const multiplier = formatNumber(toNumber(row.multiplier, 1), 2);
  const subtotal = formatNumber(toNumber(row.subtotal), 4);
  const mode = row.calc_mode ?? 'standard';

  let expression = '';
  if (mode === 'standard') {
    expression = `${value('length')} m × ${value('width')} m × ${value('height')} m × ${value('quantity')} kali`;
  } else if (mode === 'wall_area') {
    const openings = Array.isArray(parameters.openings) ? parameters.openings : [];
    const openingText = openings
      .filter((opening) => Number(opening.width) > 0 && Number(opening.height) > 0 && Number(opening.quantity) > 0)
      .map((opening) => `${String(opening.label || 'Opening')}: (${formatNumber(Number(opening.width), 3)} × ${formatNumber(Number(opening.height), 3)} × ${formatNumber(Number(opening.quantity), 2)} bh)`)
      .join(' + ') || '0 m² (tanpa opening)';
    expression = `(${value('wall_height')} m × ${value('wall_length')} m) − (${openingText})`;
  } else if (mode === 'frame_length') {
    const segments = Array.isArray(parameters.frame_segments) ? parameters.frame_segments : [];
    const material = parameters.frame_material === 'kayu' ? 'Kusen kayu' : 'Kusen aluminium';
    const detail = segments.map((segment) => `${String(segment.label || 'Profil')} (${formatNumber(Number(segment.length) || 0, 3)} m × ${formatNumber(Number(segment.quantity) || 0, 2)} bh)`).join(' + ') || 'belum ada komponen';
    const lengthTotal = segments.reduce((sum, segment) => sum + (Number(segment.length) || 0) * (Number(segment.quantity) || 0), 0);
    expression = `${material}: ${detail}. Total panjang = ${formatNumber(lengthTotal, 4)} m`;
  } else if (mode === 'glass_area') {
    const panels = Array.isArray(parameters.glass_panels) ? parameters.glass_panels : [];
    const detail = panels.map((panel) => `${String(panel.label || 'Panel')} (${formatNumber(Number(panel.width) || 0, 3)} m × ${formatNumber(Number(panel.height) || 0, 3)} m × ${formatNumber(Number(panel.quantity) || 0, 2)} bh)`).join(' + ') || 'belum ada panel';
    const areaTotal = panels.reduce((sum, panel) => sum + (Number(panel.width) || 0) * (Number(panel.height) || 0) * (Number(panel.quantity) || 0), 0);
    expression = `Kaca: ${detail}. Total luas = ${formatNumber(areaTotal, 4)} m²`;
  } else if (mode === 'opening_count') {
    const units = Array.isArray(parameters.opening_units) ? parameters.opening_units : [];
    const detail = units.map((opening) => `${String(opening.label || 'Bukaan')} (${formatNumber(Number(opening.quantity) || 0, 0)} unit)`).join(' + ') || 'belum ada bukaan';
    const countTotal = units.reduce((sum, opening) => sum + (Number(opening.quantity) || 0), 0);
    expression = `Bukaan: ${detail}. Total unit = ${formatNumber(countTotal, 0)}`;
  } else if (mode === 'trapezoid') {
    expression = `((${value('top_width', 0)} m + ${value('bottom_width', 0)} m) ÷ 2) × ${value('depth', 0)} m × ${value('length', 0)} m × ${value('quantity')} kali`;
  } else if (mode === 'rebar') {
    expression = `(Ø${value('diameter', 0)}² ÷ 162) × ${value('bar_length', 0)} m × ${value('bars', 0)} batang`;
  } else {
    expression = String(parameters.formula ?? '').trim() || 'Rumus khusus belum tercatat';
  }

  return `${expression} × faktor ${multiplier} = ${subtotal} ${unit}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Terjadi kesalahan yang tidak diketahui.';
}

function parameterValue(parameters: VolumeParameters, key: keyof VolumeParameters, fallback = '1'): string {
  const value = parameters[key];
  return value === undefined || value === null ? fallback : String(value);
}

function money2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function findSubitemAtPath(
  items: VolumeBackupSubitemSnapshot[],
  path: string[],
): VolumeBackupSubitemSnapshot | null {
  if (!path.length) return null;
  const current = items.find((entry) => String(entry.masterAhspId) === path[0]);
  if (!current) return null;
  if (path.length === 1) return current;
  return findSubitemAtPath(Array.isArray(current.subitems) ? current.subitems : [], path.slice(1));
}

/**
 * Mengganti koefisien satu sub-item berdasarkan volume backup.
 * delta dikembalikan dalam satuan harga AHSP induk per 1 satuan pekerjaan induk.
 * Untuk target bertingkat, perubahan harga diteruskan ke setiap level ancestor.
 */
function updateSubitemCoefficient(
  items: VolumeBackupSubitemSnapshot[],
  path: string[],
  coefficient: number,
  metadata: {
    original_coefficient: number;
    total_volume: number;
    details_count: number;
    updated_at: string;
  } | null,
): { items: VolumeBackupSubitemSnapshot[]; delta: number; found: boolean } {
  if (!path.length) return { items, delta: 0, found: false };

  let found = false;
  let delta = 0;

  const updatedItems = items.map((entry) => {
    if (String(entry.masterAhspId) !== path[0]) return entry;

    found = true;
    const oldCoefficient = Number(entry.coefficient || 0);
    const currentUnitPrice = Number(entry.unit_price || 0);

    if (path.length === 1) {
      const nextCoefficient = coefficient;
      delta = (nextCoefficient - oldCoefficient) * currentUnitPrice;
      return {
        ...entry,
        coefficient: nextCoefficient,
        line_total: money2(nextCoefficient * currentUnitPrice),
        volume_backup: metadata,
      };
    }

    const nested = updateSubitemCoefficient(
      Array.isArray(entry.subitems) ? entry.subitems : [],
      path.slice(1),
      coefficient,
      metadata,
    );
    if (!nested.found) {
      found = false;
      return entry;
    }

    const nextUnitPrice = money2(currentUnitPrice + nested.delta);
    delta = oldCoefficient * nested.delta;
    return {
      ...entry,
      unit_price: nextUnitPrice,
      line_total: money2(oldCoefficient * nextUnitPrice),
      subitems: nested.items,
    };
  });

  return { items: updatedItems, delta, found };
}

function isSubitemBackupTarget(item: VolumeBackupRabItem | null | undefined): boolean {
  // subitemPath menjadi discriminator yang kuat. Jangan bergantung hanya pada
  // flag isSubitem karena objek target dapat melewati beberapa komponen UI.
  return Boolean(
    item &&
      (item.isSubitem === true ||
        (typeof item.subitemPath === 'string' && item.subitemPath.trim().length > 0)),
  );
}

export default function VolumeBackupDrawer({ open, item, onClose, onSaved }: Props) {
  const [details, setDetails] = useState<VolumeDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isSubitemTarget = isSubitemBackupTarget(item);

  const loadDetails = useCallback(async (): Promise<VolumeDetail[]> => {
    if (!item?.id) return [];
    setLoading(true);
    setError('');
    try {
      if (isSubitemBackupTarget(item) && !item.subitemPath?.trim()) {
        throw new Error('Jalur sub-item tidak tersedia. Tutup drawer lalu buka kembali dari rincian sub-item.');
      }

      let query = supabase
        .from('volume_details')
        .select('id, rab_item_id, subitem_path, description, drawing_ref, multiplier, calc_mode, parameters, subtotal, created_at')
        .eq('rab_item_id', item.id);

      // Satu rab_item_id dapat memiliki banyak backup volume. Jalur sub-item
      // wajib dipakai sebagai kunci kedua agar backup anak tidak terbaca/tertulis
      // sebagai backup volume pekerjaan induk.
      query = isSubitemBackupTarget(item)
        ? query.eq('subitem_path', item.subitemPath as string)
        : query.is('subitem_path', null);

      const { data, error: queryError } = await query.order('created_at', { ascending: true });
      if (queryError) throw queryError;
      const rows = (data ?? []) as VolumeDetail[];
      setDetails(rows);
      return rows;
    } catch (loadError) {
      setError(`Gagal memuat backup volume: ${getErrorMessage(loadError)}`);
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, [item?.id, item?.isSubitem, item?.subitemPath]);

  useEffect(() => {
    if (!open || !item?.id) return;
    if (isSubitemBackupTarget(item) && !item.subitemPath?.trim()) {
      setError('Jalur sub-item tidak tersedia. Tutup drawer dan buka kembali dari daftar sub-item.');
      return;
    }
    setForm(DEFAULT_FORM);
    setFormOpen(true);
    setEditingId(null);
    setSuccess('');
    void loadDetails();
  }, [open, item?.id, loadDetails]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const totalVolume = useMemo(
    () => rounded4(details.reduce((sum, row) => sum + toNumber(row.subtotal), 0)),
    [details],
  );
  const multiplierValue = Number(form.multiplier);
  const preview = useMemo(() => {
    if (!Number.isFinite(multiplierValue) || multiplierValue < 0 || multiplierValue > 999.99) return null;
    try {
      return calculateSubtotal(form.calcMode, form.parameters, multiplierValue);
    } catch {
      return null;
    }
  }, [form.calcMode, form.parameters, multiplierValue]);

  const updateParameter = (key: keyof VolumeParameters, value: string) => {
    setForm((current) => ({
      ...current,
      parameters: { ...current.parameters, [key]: value },
    }));
  };

  const updateOpening = (index: number, key: keyof OpeningDimension, value: string) => {
    setForm((current) => {
      const openings = Array.isArray(current.parameters.openings) ? [...current.parameters.openings] : [];
      openings[index] = { ...openings[index], [key]: value };
      return { ...current, parameters: { ...current.parameters, openings } };
    });
  };

  const addOpening = () => {
    setForm((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        openings: [...(Array.isArray(current.parameters.openings) ? current.parameters.openings : []), { label: '', width: '0', height: '0', quantity: '1' }],
      },
    }));
  };

  const removeOpening = (index: number) => {
    setForm((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        openings: (Array.isArray(current.parameters.openings) ? current.parameters.openings : []).filter((_, i) => i !== index),
      },
    }));
  };

  const updateFrameSegment = (index: number, key: keyof FrameSegment, value: string) => {
    setForm((current) => {
      const rows = Array.isArray(current.parameters.frame_segments) ? [...current.parameters.frame_segments] : [];
      rows[index] = { ...rows[index], [key]: value };
      return { ...current, parameters: { ...current.parameters, frame_segments: rows } };
    });
  };
  const addFrameSegment = () => setForm((current) => ({ ...current, parameters: { ...current.parameters, frame_segments: [...(Array.isArray(current.parameters.frame_segments) ? current.parameters.frame_segments : []), { label: '', length: '1', quantity: '1' }] } }));
  const removeFrameSegment = (index: number) => setForm((current) => ({ ...current, parameters: { ...current.parameters, frame_segments: (Array.isArray(current.parameters.frame_segments) ? current.parameters.frame_segments : []).filter((_, i) => i !== index) } }));

  const updateGlassPanel = (index: number, key: keyof GlassPanel, value: string) => {
    setForm((current) => {
      const rows = Array.isArray(current.parameters.glass_panels) ? [...current.parameters.glass_panels] : [];
      rows[index] = { ...rows[index], [key]: value };
      return { ...current, parameters: { ...current.parameters, glass_panels: rows } };
    });
  };
  const addGlassPanel = () => setForm((current) => ({ ...current, parameters: { ...current.parameters, glass_panels: [...(Array.isArray(current.parameters.glass_panels) ? current.parameters.glass_panels : []), { label: '', width: '1', height: '1', quantity: '1' }] } }));
  const removeGlassPanel = (index: number) => setForm((current) => ({ ...current, parameters: { ...current.parameters, glass_panels: (Array.isArray(current.parameters.glass_panels) ? current.parameters.glass_panels : []).filter((_, i) => i !== index) } }));

  const updateOpeningUnit = (index: number, key: keyof OpeningUnit, value: string) => {
    setForm((current) => {
      const rows = Array.isArray(current.parameters.opening_units) ? [...current.parameters.opening_units] : [];
      rows[index] = { ...rows[index], [key]: value };
      return { ...current, parameters: { ...current.parameters, opening_units: rows } };
    });
  };
  const addOpeningUnit = () => setForm((current) => ({ ...current, parameters: { ...current.parameters, opening_units: [...(Array.isArray(current.parameters.opening_units) ? current.parameters.opening_units : []), { label: '', quantity: '1' }] } }));
  const removeOpeningUnit = (index: number) => setForm((current) => ({ ...current, parameters: { ...current.parameters, opening_units: (Array.isArray(current.parameters.opening_units) ? current.parameters.opening_units : []).filter((_, i) => i !== index) } }));

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setFormOpen(false);
    setError('');
  };

  const startEdit = (row: VolumeDetail) => {
    setEditingId(row.id);
    setForm({
      description: row.description,
      drawingRef: row.drawing_ref ?? '',
      multiplier: String(row.multiplier ?? 1),
      calcMode: row.calc_mode ?? 'standard',
      parameters: row.parameters ?? {},
    });
    setFormOpen(true);
    setError('');
    setSuccess('');
  };

  const syncRabVolume = async (rows: VolumeDetail[]) => {
    if (!item) return;
    const sum = rounded4(rows.reduce((total, row) => total + toNumber(row.subtotal), 0));
    // Nilai yang dikembalikan ke drawer adalah volume induk atau koefisien
    // efektif sub-item, sesuai target perhitungan yang sedang dibuka.
    let appliedVolume = sum;

    if (!isSubitemBackupTarget(item)) {
      // Hanya backup volume pekerjaan induk yang boleh mengubah rab_items.volume.
      const unitPrice = toNumber(item.unit_price);
      const totalPrice = money2(sum * unitPrice);
      const { error: updateError } = await supabase
        .from('rab_items')
        .update({ volume: sum, total_price: totalPrice, is_volume_from_backup: true })
        .eq('id', item.id);
      if (updateError) throw updateError;
    } else {
      if (!item.subitemPath?.trim()) throw new Error('Jalur sub-item tidak ditemukan. Tutup drawer lalu buka kembali dari rincian sub-item.');

      // Ambil snapshot terbaru untuk menghindari menimpa perubahan sub-item lain.
      const { data: rabRow, error: fetchError } = await supabase
        .from('rab_items')
        .select('volume, unit_price, subitems_snapshot')
        .eq('id', item.id)
        .single();
      if (fetchError) throw fetchError;

      const snapshot = Array.isArray(rabRow.subitems_snapshot)
        ? (rabRow.subitems_snapshot as VolumeBackupSubitemSnapshot[])
        : [];
      const path = item.subitemPath.split('/').filter(Boolean);
      const targetBefore = findSubitemAtPath(snapshot, path);
      if (!targetBefore) throw new Error('Sub-item tidak ditemukan pada snapshot RAB. Muat ulang halaman proyek dan coba kembali.');

      // Jika semua detail backup dihapus, pulihkan koefisien awal sebelum backup pertama.
      const originalCoefficient = toNumber(
        targetBefore.volume_backup?.original_coefficient,
        toNumber(targetBefore.coefficient),
      );
      const nextCoefficient = rows.length > 0 ? sum : originalCoefficient;
      appliedVolume = nextCoefficient;
      const metadata = rows.length > 0 ? {
        original_coefficient: originalCoefficient,
        total_volume: sum,
        details_count: rows.length,
        updated_at: new Date().toISOString(),
      } : null;
      const changed = updateSubitemCoefficient(snapshot, path, nextCoefficient, metadata);
      if (!changed.found) throw new Error('Sub-item tidak ditemukan pada snapshot RAB. Muat ulang halaman proyek dan coba kembali.');

      // Perubahan koefisien sub-item mengubah harga satuan AHSP induk.
      // Volume baris induk tidak berubah; total RAB dihitung ulang dari unit price baru.
      const nextUnitPrice = money2(toNumber(rabRow.unit_price) + changed.delta);
      const nextTotalPrice = money2(toNumber(rabRow.volume) * nextUnitPrice);
      // Penting: pada target sub-item, jangan pernah mengirim kolom `volume`
      // atau `is_volume_from_backup` ke rab_items. Yang berubah hanya snapshot
      // sub-item serta harga induk; volume fisik item utama wajib tetap sama.
      const { error: updateError } = await supabase
        .from('rab_items')
        .update({
          subitems_snapshot: changed.items,
          unit_price: nextUnitPrice,
          total_price: nextTotalPrice,
        })
        .eq('id', item.id);
      if (updateError) throw updateError;
    }

    // Sinkronkan nilai total proyek dari seluruh total_price item RAB.
    await recalculateProjectTotalFromRabItem(item.id);
    await onSaved?.(appliedVolume);
  };

  const saveDetail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || saving) return;

    const description = form.description.trim();
    const drawingRef = form.drawingRef.trim();
    const multiplier = Number(form.multiplier);
    if (!description) {
      setError('Uraian perhitungan wajib diisi.');
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 999.99 || Math.abs(multiplier * 100 - Math.round(multiplier * 100)) > 1e-8) {
      setError('Faktor pengali harus antara 0 sampai 999,99 dengan maksimal 2 angka desimal.');
      return;
    }

    let subtotal: number;
    let normalizedParameters: VolumeParameters;
    try {
      normalizedParameters = normalizeParameters(form.calcMode, form.parameters);
      subtotal = calculateSubtotal(form.calcMode, normalizedParameters, multiplier);
    } catch (calculationError) {
      setError(getErrorMessage(calculationError));
      return;
    }
    if (!Number.isFinite(subtotal) || subtotal < 0 || subtotal > 99999999.9999) {
      setError('Hasil volume di luar batas kolom numeric(12,4).');
      return;
    }

    const payload = {
      rab_item_id: item.id,
      subitem_path: isSubitemTarget ? item.subitemPath : null,
      description,
      drawing_ref: drawingRef || null,
      multiplier,
      calc_mode: form.calcMode,
      parameters: normalizedParameters,
      subtotal,
    };

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingId) {
        let updateQuery = supabase
          .from('volume_details')
          .update(payload)
          .eq('id', editingId)
          .eq('rab_item_id', item.id);
        updateQuery = isSubitemTarget
          ? updateQuery.eq('subitem_path', item.subitemPath as string)
          : updateQuery.is('subitem_path', null);
        const { error: updateError } = await updateQuery;
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('volume_details').insert(payload);
        if (insertError) throw insertError;
      }

      const rows = await loadDetails();
      await syncRabVolume(rows);
      setSuccess(editingId ? 'Rincian perhitungan berhasil diperbarui.' : 'Rincian perhitungan berhasil ditambahkan.');
      setForm(DEFAULT_FORM);
      setEditingId(null);
      setFormOpen(false);
    } catch (saveError) {
      setError(`Gagal menyimpan perhitungan: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteDetail = async (row: VolumeDetail) => {
    if (!item || deletingId) return;
    const confirmed = window.confirm(`Hapus rincian volume "${row.description}"?`);
    if (!confirmed) return;
    setDeletingId(row.id);
    setError('');
    setSuccess('');
    try {
      let deleteQuery = supabase
        .from('volume_details')
        .delete()
        .eq('id', row.id)
        .eq('rab_item_id', item.id);
      deleteQuery = isSubitemTarget
        ? deleteQuery.eq('subitem_path', item.subitemPath as string)
        : deleteQuery.is('subitem_path', null);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
      const rows = await loadDetails();
      await syncRabVolume(rows);
      if (editingId === row.id) resetForm();
      setSuccess('Rincian volume berhasil dihapus dan total RAB diperbarui.');
    } catch (deleteError) {
      setError(`Gagal menghapus rincian: ${getErrorMessage(deleteError)}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (!open || !item) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-drawer-title"
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-50 shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
              <Ruler className="h-4 w-4" />
              {isSubitemTarget ? 'Backup Volume Sub-item' : 'Backup Volume Pekerjaan'}
            </div>
            <h2 id="volume-drawer-title" className="text-lg font-bold text-slate-900">{isSubitemTarget ? "Perhitungan Koefisien Sub-item" : "Perhitungan Volume"}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{item.code}</p>
            <p className="mt-0.5 max-w-xl text-sm font-semibold leading-5 text-slate-800">{item.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Tutup backup volume" className="ml-3 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{isSubitemTarget ? "Satuan sub-item terkunci" : "Satuan AHSP terkunci"}</p>
              <div className="mt-1 flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-emerald-700" />
                <strong className="text-lg text-slate-900">{item.unit}</strong>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{isSubitemTarget ? "Koefisien terhitung" : "Total volume terhitung"}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-900">{formatNumber(totalVolume)} <span className="text-xs font-semibold">{item.unit}</span></p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{isSubitemTarget ? `Koefisien tersimpan saat ini: ${formatNumber(toNumber(item.volume))} ${item.unit} per 1 satuan AHSP induk. Hasil hitungan baru diterapkan setelah detail disimpan; volume induk tetap.` : "Total volume merupakan penjumlahan seluruh subtotal detail. Satuan mengikuti Master AHSP dan tidak dapat diubah di sini."}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {(error || success) && (
            <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="min-w-0 flex-1">{error || success}</span>
              <button type="button" aria-label="Tutup pesan" onClick={() => { setError(''); setSuccess(''); }}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Rincian perhitungan</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Catat setiap area, ruang, sisi, atau bagian pekerjaan secara terpisah.</p>
              </div>
              {!formOpen && (
                <button type="button" onClick={() => { setForm(DEFAULT_FORM); setEditingId(null); setFormOpen(true); setError(''); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                  <Plus className="h-3.5 w-3.5" /> Tambah detail
                </button>
              )}
            </div>

            {formOpen && (
              <form onSubmit={saveDetail} className="space-y-4 border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-900">{editingId ? 'Edit rincian volume' : 'Tambah rincian volume'}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Isi uraian dan dimensi sesuai gambar kerja.</p>
                  </div>
                  <button type="button" onClick={resetForm} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50" aria-label="Tutup formulir">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="text-xs font-semibold text-slate-700">Uraian perhitungan *
                    <input required maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Contoh: Dinding ruang tamu sisi utara" className={`${INPUT} mt-1.5`} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Referensi gambar
                    <input maxLength={100} value={form.drawingRef} onChange={(event) => setForm((current) => ({ ...current, drawingRef: event.target.value }))} placeholder="A-01 / Detail 02" className={`${INPUT} mt-1.5`} />
                  </label>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Metode perhitungan *</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {MODE_OPTIONS.map((option) => (
                      <button key={option.value} type="button" onClick={() => setForm((current) => ({ ...current, calcMode: option.value, parameters: defaultParametersForMode(option.value) }))} className={`rounded-xl border p-3 text-left transition ${form.calcMode === option.value ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <span className="block text-xs font-bold text-slate-800">{option.label}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-slate-500">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {form.calcMode === 'standard' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Dimensi (meter) dan jumlah</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {([
                        ['length', 'Panjang (m)'], ['width', 'Lebar (m)'], ['height', 'Tinggi (m)'], ['quantity', 'Jumlah'],
                      ] as Array<[keyof VolumeParameters, string]>).map(([key, label]) => (
                        <label key={key} className="text-[11px] font-semibold text-slate-600">{label}
                          <input type="number" min="0" step="any" value={parameterValue(form.parameters, key)} onChange={(event) => updateParameter(key, event.target.value)} className={`${INPUT} mt-1.5 text-right tabular-nums`} />
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400">Untuk pekerjaan luas (m²), gunakan tinggi = 1. Untuk pekerjaan panjang, gunakan lebar = 1 dan tinggi = 1. Sesuaikan dimensi dengan satuan AHSP.</p>
                  </div>
                )}

                {form.calcMode === 'wall_area' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Luas dinding (2 dimensi)</p>
                      <p className="mt-1 text-[10px] text-slate-500">Luas bersih dinding = tinggi dinding × total panjang dinding − total luas pintu/jendela.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-[11px] font-semibold text-slate-600">Tinggi dinding (m)
                        <input type="number" min="0" step="any" value={parameterValue(form.parameters, 'wall_height')} onChange={(event) => updateParameter('wall_height', event.target.value)} className={`${INPUT} mt-1.5 text-right tabular-nums`} />
                      </label>
                      <label className="text-[11px] font-semibold text-slate-600">Total panjang seluruh dinding (m)
                        <input type="number" min="0" step="any" value={parameterValue(form.parameters, 'wall_length')} onChange={(event) => updateParameter('wall_length', event.target.value)} className={`${INPUT} mt-1.5 text-right tabular-nums`} />
                      </label>
                    </div>
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-700">Opening pintu dan jendela</p>
                          <p className="text-[10px] text-slate-400">Masukkan tiap tipe bukaan; jumlah dikalikan otomatis.</p>
                        </div>
                        <button type="button" onClick={addOpening} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50">
                          <Plus className="h-3.5 w-3.5" /> Tambah opening
                        </button>
                      </div>
                      {(Array.isArray(form.parameters.openings) ? form.parameters.openings : []).map((opening, index) => (
                        <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1.3fr)_1fr_1fr_90px_36px]">
                          <label className="text-[10px] font-semibold text-slate-600">Nama bukaan
                            <input value={String(opening.label ?? '')} onChange={(event) => updateOpening(index, 'label', event.target.value)} placeholder="Pintu utama / Jendela" className={`${INPUT} mt-1`} />
                          </label>
                          <label className="text-[10px] font-semibold text-slate-600">Lebar (m)
                            <input type="number" min="0" step="any" value={String(opening.width ?? '0')} onChange={(event) => updateOpening(index, 'width', event.target.value)} className={`${INPUT} mt-1 text-right`} />
                          </label>
                          <label className="text-[10px] font-semibold text-slate-600">Tinggi (m)
                            <input type="number" min="0" step="any" value={String(opening.height ?? '0')} onChange={(event) => updateOpening(index, 'height', event.target.value)} className={`${INPUT} mt-1 text-right`} />
                          </label>
                          <label className="text-[10px] font-semibold text-slate-600">Jumlah
                            <input type="number" min="0" step="1" value={String(opening.quantity ?? '1')} onChange={(event) => updateOpening(index, 'quantity', event.target.value)} className={`${INPUT} mt-1 text-right`} />
                          </label>
                          <button type="button" onClick={() => removeOpening(index)} aria-label={`Hapus opening ${index + 1}`} className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {(Array.isArray(form.parameters.openings) ? form.parameters.openings : []).length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[10px] text-slate-400">Tidak ada opening yang dikurangkan.</p>
                      )}
                    </div>
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">Contoh: tinggi dinding 3 m × panjang total 20 m = 60 m². Dikurangi 2 pintu (0,9 × 2,1 m) dan 3 jendela (1,2 × 1,0 m), luas bersih = 52,62 m².</p>
                  </div>
                )}

                {form.calcMode === 'frame_length' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Rincian panjang kusen / profil (m¹)</p>
                        <p className="mt-1 text-[10px] text-slate-500">Pisahkan setiap profil atau batang: tiang, ambang atas/bawah, mullion, transom, sash, glazing bead, penguat, atau komponen kayu.</p>
                      </div>
                      <label className="text-[10px] font-semibold text-slate-600 sm:w-44">Material kusen
                        <select value={String(form.parameters.frame_material ?? 'aluminium')} onChange={(event) => updateParameter('frame_material', event.target.value)} className={`${INPUT} mt-1`}>
                          <option value="aluminium">Aluminium</option><option value="kayu">Kayu</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <p className="text-[11px] font-bold text-slate-700">Daftar potongan / profil</p>
                      <button type="button" onClick={addFrameSegment} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" /> Tambah komponen</button>
                    </div>
                    {(Array.isArray(form.parameters.frame_segments) ? form.parameters.frame_segments : []).map((segment, index) => (
                      <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1.5fr)_1fr_100px_36px]">
                        <label className="text-[10px] font-semibold text-slate-600">Nama profil / komponen
                          <input value={String(segment.label ?? '')} onChange={(event) => updateFrameSegment(index, 'label', event.target.value)} placeholder="Contoh: Tiang vertikal kiri" className={`${INPUT} mt-1`} />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-600">Panjang (m)
                          <input type="number" min="0" step="any" value={String(segment.length ?? '')} onChange={(event) => updateFrameSegment(index, 'length', event.target.value)} className={`${INPUT} mt-1 text-right`} />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-600">Jumlah potong
                          <input type="number" min="0" step="any" value={String(segment.quantity ?? '')} onChange={(event) => updateFrameSegment(index, 'quantity', event.target.value)} className={`${INPUT} mt-1 text-right`} />
                        </label>
                        <button type="button" onClick={() => removeFrameSegment(index)} aria-label={`Hapus komponen kusen ${index + 1}`} className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">Total panjang = Σ (panjang setiap potongan × jumlah). Gunakan satuan pekerjaan AHSP meter/m¹. Rincian profil yang kompleks dapat ditambahkan sebanyak yang diperlukan.</p>
                  </div>
                )}

                {form.calcMode === 'glass_area' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Rincian bidang kaca (m²)</p><p className="mt-1 text-[10px] text-slate-500">Pisahkan panel berdasarkan ukuran, jenis kaca, atau posisi.</p></div>
                      <button type="button" onClick={addGlassPanel} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" /> Tambah panel</button>
                    </div>
                    {(Array.isArray(form.parameters.glass_panels) ? form.parameters.glass_panels : []).map((panel, index) => (
                      <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_90px_36px]">
                        <label className="text-[10px] font-semibold text-slate-600">Nama / jenis kaca<input value={String(panel.label ?? '')} onChange={(event) => updateGlassPanel(index, 'label', event.target.value)} placeholder="Kaca bening 5 mm" className={`${INPUT} mt-1`} /></label>
                        <label className="text-[10px] font-semibold text-slate-600">Lebar (m)<input type="number" min="0" step="any" value={String(panel.width ?? '')} onChange={(event) => updateGlassPanel(index, 'width', event.target.value)} className={`${INPUT} mt-1 text-right`} /></label>
                        <label className="text-[10px] font-semibold text-slate-600">Tinggi (m)<input type="number" min="0" step="any" value={String(panel.height ?? '')} onChange={(event) => updateGlassPanel(index, 'height', event.target.value)} className={`${INPUT} mt-1 text-right`} /></label>
                        <label className="text-[10px] font-semibold text-slate-600">Jumlah panel<input type="number" min="0" step="1" value={String(panel.quantity ?? '')} onChange={(event) => updateGlassPanel(index, 'quantity', event.target.value)} className={`${INPUT} mt-1 text-right`} /></label>
                        <button type="button" onClick={() => removeGlassPanel(index)} aria-label={`Hapus panel kaca ${index + 1}`} className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">Total luas kaca = Σ (lebar × tinggi × jumlah panel). Gunakan AHSP kaca dengan satuan m².</p>
                  </div>
                )}

                {form.calcMode === 'opening_count' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Daftar unit bukaan</p><p className="mt-1 text-[10px] text-slate-500">Hitung unit pintu, jendela, ventilasi, atau set bukaan.</p></div>
                      <button type="button" onClick={addOpeningUnit} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" /> Tambah bukaan</button>
                    </div>
                    {(Array.isArray(form.parameters.opening_units) ? form.parameters.opening_units : []).map((opening, index) => (
                      <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_130px_36px]">
                        <label className="text-[10px] font-semibold text-slate-600">Jenis bukaan<input value={String(opening.label ?? '')} onChange={(event) => updateOpeningUnit(index, 'label', event.target.value)} placeholder="Pintu utama / jendela kamar" className={`${INPUT} mt-1`} /></label>
                        <label className="text-[10px] font-semibold text-slate-600">Jumlah unit<input type="number" min="1" step="1" value={String(opening.quantity ?? '')} onChange={(event) => updateOpeningUnit(index, 'quantity', event.target.value)} className={`${INPUT} mt-1 text-right`} /></label>
                        <button type="button" onClick={() => removeOpeningUnit(index)} aria-label={`Hapus jenis bukaan ${index + 1}`} className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">Total bukaan = Σ jumlah unit. Gunakan AHSP dengan satuan unit, bh, atau set sesuai definisi pekerjaan.</p>
                  </div>
                )}

                {form.calcMode === 'trapezoid' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Dimensi penampang trapesium (meter)</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {([
                        ['top_width', 'Lebar atas'], ['bottom_width', 'Lebar bawah'], ['depth', 'Kedalaman'], ['length', 'Panjang saluran'], ['quantity', 'Jumlah'],
                      ] as Array<[keyof VolumeParameters, string]>).map(([key, label]) => (
                        <label key={key} className="text-[11px] font-semibold text-slate-600">{label}
                          <input type="number" min="0" step="any" value={parameterValue(form.parameters, key, '0')} onChange={(event) => updateParameter(key, event.target.value)} className={`${INPUT} mt-1.5 text-right tabular-nums`} />
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400">Luas penampang rata-rata × panjang × jumlah. Cocok untuk menghitung volume galian atau timbunan berbentuk trapesium.</p>
                  </div>
                )}

                {form.calcMode === 'rebar' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Data pembesian</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="text-[11px] font-semibold text-slate-600">Diameter (mm)
                        <input type="number" min="0" step="any" value={parameterValue(form.parameters, 'diameter', '10')} onChange={(event) => updateParameter('diameter', event.target.value)} className={`${INPUT} mt-1.5 text-right`} />
                      </label>
                      <label className="text-[11px] font-semibold text-slate-600">Panjang per batang (m)
                        <input type="number" min="0" step="any" value={parameterValue(form.parameters, 'bar_length')} onChange={(event) => updateParameter('bar_length', event.target.value)} className={`${INPUT} mt-1.5 text-right`} />
                      </label>
                      <label className="text-[11px] font-semibold text-slate-600">Jumlah batang
                        <input type="number" min="0" step="any" value={parameterValue(form.parameters, 'bars')} onChange={(event) => updateParameter('bars', event.target.value)} className={`${INPUT} mt-1.5 text-right`} />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400">Berat teoritis dihitung dengan pendekatan d²/162 × panjang × jumlah. Hasil satuan kg; cocok untuk AHSP dengan satuan kg.</p>
                  </div>
                )}

                {form.calcMode === 'custom_formula' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <label className="text-xs font-semibold text-slate-700">Rumus aritmetika
                      <input value={parameterValue(form.parameters, 'formula', '')} onChange={(event) => updateParameter('formula', event.target.value)} placeholder="Contoh: (2.5 + 3.2) * 2.8" className={`${INPUT} mt-1.5 font-mono`} />
                    </label>
                    <p className="text-[10px] text-slate-400">Gunakan angka dan operator +, -, *, /, serta tanda kurung. Tidak menggunakan kode program atau fungsi eksternal.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <label className="text-xs font-semibold text-slate-700">Faktor pengali
                    <input type="number" min="0" max="999.99" step="0.01" value={form.multiplier} onChange={(event) => setForm((current) => ({ ...current, multiplier: event.target.value }))} className={`${INPUT} mt-1.5 text-right tabular-nums`} />
                  </label>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Hasil sementara</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-emerald-950">{preview === null ? 'Periksa rumus/dimensi' : `${formatNumber(preview)} ${item.unit}`}</p>
                    <p className="mt-0.5 text-[10px] text-emerald-700">Subtotal detail setelah faktor pengali</p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={resetForm} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                  <button type="submit" disabled={saving || preview === null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Simpan rincian volume'}
                  </button>
                </div>
              </form>
            )}

            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Daftar backup volume</h4>
                  <p className="mt-0.5 text-[10px] text-slate-500">{details.length} baris perhitungan tersimpan</p>
                </div>
                <button type="button" onClick={() => void loadDetails()} disabled={loading} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50">
                  <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Segarkan
                </button>
              </div>

              {loading ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-600" />Memuat rincian volume...</div>
              ) : details.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                  <DraftingCompass className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-700">Belum ada rincian volume</p>
                  <p className="mt-1 text-[11px] text-slate-500">Tambahkan perhitungan pertama berdasarkan gambar kerja atau ukuran lapangan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {details.map((row, index) => (
                    <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">#{index + 1}</span>
                            <span className="text-[10px] font-semibold text-emerald-700">{modeLabel(row.calc_mode)}</span>
                            {row.drawing_ref && <span className="text-[10px] text-slate-400">Gambar: {row.drawing_ref}</span>}
                          </div>
                          <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-900">{row.description}</p>
                          <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2">
                            <p className="text-[9px] font-bold uppercase tracking-wide text-blue-700">Rumus dan hasil perhitungan</p>
                            <p className="mt-1 break-words text-[11px] font-medium leading-5 text-slate-700">
                              {calculationExpression(row, item.unit)}
                            </p>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">Faktor pengali: {formatNumber(toNumber(row.multiplier, 1), 2)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">{formatNumber(toNumber(row.subtotal))}</p>
                          <p className="text-[10px] text-slate-500">{item.unit}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2">
                        <button type="button" onClick={() => startEdit(row)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                        <button type="button" onClick={() => void deleteDetail(row)} disabled={deletingId === row.id} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Sigma className="h-4 w-4 text-emerald-700" /><h3 className="text-xs font-bold text-slate-900">Rekapitulasi volume</h3></div>
              <span className="text-[10px] font-semibold text-slate-500">{details.length} detail</span>
            </div>
            <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] text-slate-500">{isSubitemTarget ? 'Koefisien kebutuhan per 1 satuan AHSP induk' : 'Total volume yang akan digunakan pada RAB'}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatNumber(totalVolume)} <span className="text-sm font-semibold text-slate-500">{item.unit}</span></p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] text-slate-500">{isSubitemTarget ? 'Kontribusi biaya pada volume induk' : 'Estimasi total biaya'}</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-emerald-800">{formatRupiah(totalVolume * toNumber(item.unit_price) * (isSubitemTarget ? toNumber(item.parentVolume, 1) : 1))}</p>
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500"><FileText className="mr-1 inline h-3 w-3" /> {isSubitemTarget ? 'Setelah disimpan, hasil backup menggantikan koefisien sub-item, memperbarui harga satuan induk, dan menghitung ulang total RAB proyek. Detail tetap terpisah dari backup volume induk.' : 'Setelah detail pertama disimpan, volume manual sebelumnya akan digantikan jumlah seluruh subtotal backup. Setiap perubahan berikutnya menyinkronkan volume dan total harga ke baris RAB.'}</p>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
          <span className="text-[10px] text-slate-400">Data disimpan pada <strong>public.volume_details</strong>{isSubitemTarget ? " dengan jalur sub-item terpisah" : ""}</span>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Tutup</button>
        </footer>
      </aside>
    </div>
  );
}
