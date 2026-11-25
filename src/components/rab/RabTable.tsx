'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
  ListTree,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Ruler,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import VolumeBackupDrawer, { type VolumeBackupRabItem } from '@/components/rab/VolumeBackupDrawer';
import { formatRupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export type RabComponentSnapshot = {
  name: string;
  unit: string;
  coefficient: number;
  unit_price: number;
  type: 'material' | 'labor' | 'equipment';
  material_id?: string;
  upah_id?: string;
  alat_id?: string;
  isLegacySummary?: boolean;
};

export type RabSubitemSnapshot = {
  masterAhspId: string;
  code: string;
  name: string;
  unit: string;
  coefficient: number;
  unit_price: number;
  line_total: number;
  notes?: string | null;
  components?: RabComponentSnapshot[];
  subitems?: RabSubitemSnapshot[];
  volume_backup?: {
    original_coefficient: number;
    total_volume: number;
    details_count: number;
    updated_at: string;
  } | null;
};

export type RabTableItem = {
  id: string;
  master_ahsp_id?: string | null;
  code: string;
  name: string;
  unit: string;
  volume: number;
  unit_price: number;
  total_price: number;
  components_snapshot?: RabComponentSnapshot[] | null;
  subitems_snapshot?: RabSubitemSnapshot[] | null;
  /** ID dan nama kelompok item pekerjaan yang memuat beberapa AHSP. */
  work_group_id?: string | null;
  work_group_name?: string | null;
  rab_subcategory_id?: string | null;
  sort_order?: number | null;
  is_volume_from_backup?: boolean;
  /** Rincian backup volume JSONB yang dimuat untuk ekspor PDF per lokasi. */
  backupDetails?: Array<{
    id: string;
    rab_item_id: string;
    subitem_path?: string | null;
    description: string;
    drawing_ref?: string | null;
    multiplier: number | string | null;
    calc_mode: string | null;
    parameters: Record<string, unknown> | null;
    subtotal: number | string | null;
  }> | null;
};

export type RabItemUpdate = {
  code: string;
  name: string;
  volume: number;
  total_price: number;
};

export type RabComponentsUpdate = {
  components_snapshot: RabComponentSnapshot[];
  subitems_snapshot: RabSubitemSnapshot[];
  unit_price: number;
  total_price: number;
};

type Props = {
  items: RabTableItem[];
  onUpdate: (id: string, changes: RabItemUpdate) => Promise<void>;
  onUpdateComponents?: (id: string, changes: RabComponentsUpdate) => Promise<void>;
  onDelete: (item: RabTableItem) => Promise<void>;
  onVolumeUpdated?: () => void | Promise<void>;
  /** Persists a complete manual row order within this location. */
  onReorder?: (orderedIds: string[]) => Promise<void>;
  subcategories?: Array<{ id: string; name: string; categoryName: string }>;
  onMoveItem?: (itemId: string, subcategoryId: string) => Promise<void>;
  /** Allows reordering at FINAL RAB while normal editing remains locked. */
  canReorder?: boolean;
  readOnly?: boolean;
};

type EditForm = {
  code: string;
  name: string;
  volume: string;
};

const INPUT_CLASS =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';

function fmtNumber(value: number): string {
  return Number(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  });
}

function typeLabel(type: RabComponentSnapshot['type']): string {
  if (type === 'material') return 'Bahan';
  if (type === 'labor') return 'Upah';
  return 'Alat';
}

function componentAmount(components: RabComponentSnapshot[]): number {
  return components.reduce(
    (sum, component) =>
      sum + Number(component.coefficient || 0) * Number(component.unit_price || 0),
    0,
  );
}

/**
 * Hitung ulang snapshot sub-item secara rekursif.
 * Sub-item tanpa rincian langsung/anak mempertahankan harga snapshot lamanya.
 */
function recalculateSubitems(items: RabSubitemSnapshot[]): RabSubitemSnapshot[] {
  return items.map((item) => {
    const children = recalculateSubitems(item.subitems ?? []);
    const components = item.components ?? [];
    const hasBreakdown = components.length > 0 || children.length > 0;
    const unitPrice = hasBreakdown
      ? componentAmount(components) + children.reduce(
          (sum, child) => sum + Number(child.coefficient || 0) * Number(child.unit_price || 0),
          0,
        )
      : Number(item.unit_price || 0);
    return {
      ...item,
      components,
      subitems: children,
      unit_price: unitPrice,
      line_total: Number(item.coefficient || 0) * unitPrice,
    };
  });
}

function patchComponentsAtPath(
  rootComponents: RabComponentSnapshot[],
  rootSubitems: RabSubitemSnapshot[],
  path: number[],
  nextComponents: RabComponentSnapshot[],
): { components: RabComponentSnapshot[]; subitems: RabSubitemSnapshot[] } {
  if (path.length === 0) return { components: nextComponents, subitems: rootSubitems };
  const [index, ...rest] = path;
  const subitems = rootSubitems.map((item, currentIndex) => {
    if (currentIndex !== index) return item;
    if (rest.length === 0) return { ...item, components: nextComponents };
    return {
      ...item,
      subitems: patchComponentsAtPath([], item.subitems ?? [], rest, nextComponents).subitems,
    };
  });
  return { components: rootComponents, subitems };
}

function patchSubitemCoefficient(
  items: RabSubitemSnapshot[],
  path: number[],
  coefficient: number,
): RabSubitemSnapshot[] {
  if (path.length === 0) return items;
  const [index, ...rest] = path;
  return items.map((item, currentIndex) => {
    if (currentIndex !== index) return item;
    if (rest.length === 0) return { ...item, coefficient };
    return { ...item, subitems: patchSubitemCoefficient(item.subitems ?? [], rest, coefficient) };
  });
}

function getComponentsAtPath(
  rootComponents: RabComponentSnapshot[],
  rootSubitems: RabSubitemSnapshot[],
  path: number[],
): RabComponentSnapshot[] {
  if (path.length === 0) return rootComponents;
  const [index, ...rest] = path;
  const target = rootSubitems[index];
  if (!target) return [];
  if (rest.length === 0) return target.components ?? [];
  return getComponentsAtPath([], target.subitems ?? [], rest);
}

function getSubitemAtPath(items: RabSubitemSnapshot[], path: number[]): RabSubitemSnapshot | null {
  if (path.length === 0) return null;
  const [index, ...rest] = path;
  const target = items[index];
  if (!target) return null;
  return rest.length === 0 ? target : getSubitemAtPath(target.subitems ?? [], rest);
}

function legacySummaryComponent(unitPrice: number, unit: string): RabComponentSnapshot {
  return {
    name: 'Nilai analisa lama (belum dirinci)',
    unit: unit || 'ls',
    coefficient: 1,
    unit_price: unitPrice,
    type: 'material',
    isLegacySummary: true,
  };
}

type MasterComponentRow = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  unit_price: number | string | null;
  category?: string | null;
};

type MasterComponentOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  category: string;
  type: RabComponentSnapshot['type'];
};

type ComponentPickerFilter = 'all' | RabComponentSnapshot['type'];

function ComponentLines({
  components,
  editing,
  onChange,
  onAdd,
}: {
  components: RabComponentSnapshot[];
  editing: boolean;
  onChange: (components: RabComponentSnapshot[]) => void;
  onAdd?: () => void;
}) {
  const total = componentAmount(components);

  return (
    <div className="space-y-2">
      {components.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2">Nama komponen</th>
                <th className="w-32 px-3 py-2 text-right">Koefisien</th>
                <th className="w-20 px-3 py-2">Sat.</th>
                <th className="w-40 px-3 py-2 text-right">Harga komponen</th>
                <th className="w-40 px-3 py-2 text-right">Jumlah</th>
                {editing && <th className="w-12 px-3 py-2 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {components.map((component, index) => {
                const amount = Number(component.coefficient || 0) * Number(component.unit_price || 0);
                return (
                  <tr key={(component.material_id ?? component.upah_id ?? component.alat_id ?? component.name) + '-' + index}>
                    <td className="px-3 py-2">
                      <span className={'inline-flex rounded px-1.5 py-1 text-[10px] font-semibold ' + (
                        component.isLegacySummary
                          ? 'bg-slate-100 text-slate-600'
                          : component.type === 'material'
                            ? 'bg-sky-50 text-sky-700'
                            : component.type === 'labor'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-violet-50 text-violet-700'
                      )}>
                        {component.isLegacySummary ? 'Ringkasan lama' : typeLabel(component.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {editing ? (
                        <input
                          type="text"
                          maxLength={255}
                          value={component.name}
                          aria-label={'Nama komponen ' + component.name}
                          onChange={(event) => onChange(components.map((entry, entryIndex) => entryIndex === index
                            ? { ...entry, name: event.target.value }
                            : entry))}
                          className={INPUT_CLASS}
                        />
                      ) : component.name}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={component.coefficient}
                          aria-label={'Koefisien ' + component.name}
                          onChange={(event) => onChange(components.map((entry, entryIndex) => entryIndex === index
                            ? { ...entry, coefficient: Number(event.target.value || 0) }
                            : entry))}
                          className={INPUT_CLASS + ' text-right tabular-nums'}
                        />
                      ) : (
                        <span className="tabular-nums text-slate-600">{fmtNumber(Number(component.coefficient || 0))}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{component.unit || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={component.unit_price}
                          aria-label={'Harga komponen ' + component.name}
                          onChange={(event) => onChange(components.map((entry, entryIndex) => entryIndex === index
                            ? { ...entry, unit_price: Number(event.target.value || 0) }
                            : entry))}
                          className={INPUT_CLASS + ' text-right tabular-nums'}
                        />
                      ) : (
                        <span className="whitespace-nowrap tabular-nums text-slate-600">{formatRupiah(Number(component.unit_price || 0))}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                      {formatRupiah(amount)}
                    </td>
                    {editing && (
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onChange(components.filter((_, currentIndex) => currentIndex !== index))}
                          title={'Hapus komponen ' + component.name}
                          aria-label={'Hapus komponen ' + component.name}
                          className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={5} className="px-3 py-2 text-right text-[10px] font-bold text-slate-600">Subtotal komponen</td>
                <td className="px-3 py-2 text-right text-xs font-bold tabular-nums text-slate-900">{formatRupiah(total)}</td>
                {editing && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Belum ada komponen langsung pada tingkat AHSP ini. Tambahkan bahan, upah, atau alat dari master untuk membentuk harga satuan.
        </p>
      )}
      {editing && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah komponen dari Master Material / Upah / Alat
        </button>
      )}
    </div>
  );
}

function SubitemComponents({
  items,
  parentItem,
  editing,
  path = [],
  idPath = [],
  onComponentsChange,
  onCoefficientChange,
  onOpenVolume,
  onAddComponents,
}: {
  items: RabSubitemSnapshot[];
  parentItem: RabTableItem;
  editing: boolean;
  path?: number[];
  idPath?: string[];
  onComponentsChange: (path: number[], components: RabComponentSnapshot[]) => void;
  onCoefficientChange: (path: number[], coefficient: number) => void;
  onOpenVolume: (target: VolumeBackupRabItem) => void;
  onAddComponents: (path: number[]) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((subitem, index) => {
        const currentPath = [...path, index];
        const currentIdPath = [...idPath, String(subitem.masterAhspId)];
        const hasBackup = Boolean(subitem.volume_backup?.details_count);
        const target: VolumeBackupRabItem = {
          id: parentItem.id,
          code: subitem.code,
          name: subitem.name,
          unit: subitem.unit,
          volume: subitem.coefficient,
          unit_price: subitem.unit_price,
          total_price: subitem.line_total,
          isSubitem: true,
          subitemPath: currentIdPath.join('/'),
          subitems_snapshot: parentItem.subitems_snapshot ?? [],
          parentVolume: parentItem.volume,
        };

        return (
          <div key={String(subitem.masterAhspId) + '-' + currentPath.join('-')} className="rounded-lg border border-violet-100 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold text-violet-700">{subitem.code}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{subitem.unit}</span>
                  {hasBackup && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Volume dihitung</span>}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-800">{subitem.name}</p>
                {subitem.notes && <p className="mt-1 text-[10px] italic text-slate-500">{subitem.notes}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <label className="text-[9px] text-slate-400">
                  Koefisien sub-item
                  {editing ? (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={subitem.coefficient}
                      aria-label={'Koefisien sub-item ' + subitem.name}
                      onChange={(event) => onCoefficientChange(currentPath, Number(event.target.value || 0))}
                      className={INPUT_CLASS + ' mt-1 w-28 text-right tabular-nums'}
                    />
                  ) : (
                    <span className="mt-1 block text-xs font-semibold tabular-nums text-slate-700">{fmtNumber(Number(subitem.coefficient || 0))}</span>
                  )}
                </label>
                <div className="text-[9px] text-slate-400">
                  Harga satuan terkunci
                  <p className="mt-1 text-xs font-semibold tabular-nums text-slate-700">{formatRupiah(Number(subitem.unit_price || 0))}</p>
                </div>
                {!editing && (
                  <button
                    type="button"
                    onClick={() => onOpenVolume(target)}
                    className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <Ruler className="h-3 w-3" />
                    {hasBackup ? 'Ubah backup volume' : 'Backup volume'}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Komponen bahan, upah & alat</p>
              <ComponentLines
                components={subitem.components ?? []}
                editing={editing}
                onChange={(components) => onComponentsChange(currentPath, components)}
                onAdd={() => onAddComponents(currentPath)}
              />
              {(subitem.subitems?.length ?? 0) > 0 && (
                <div className="border-l-2 border-violet-100 pl-3">
                  <p className="mb-2 text-[10px] font-bold text-violet-700">Sub-item lanjutan</p>
                  <SubitemComponents
                    items={subitem.subitems ?? []}
                    parentItem={parentItem}
                    editing={editing}
                    path={currentPath}
                    idPath={currentIdPath}
                    onComponentsChange={onComponentsChange}
                    onCoefficientChange={onCoefficientChange}
                    onOpenVolume={onOpenVolume}
                    onAddComponents={onAddComponents}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompositionEditor({
  item,
  onSave,
  onOpenVolume,
}: {
  item: RabTableItem;
  onSave?: (changes: RabComponentsUpdate) => Promise<void>;
  onOpenVolume: (target: VolumeBackupRabItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [components, setComponents] = useState<RabComponentSnapshot[]>(item.components_snapshot ?? []);
  const [subitems, setSubitems] = useState<RabSubitemSnapshot[]>(item.subitems_snapshot ?? []);
  const [pickerTargetPath, setPickerTargetPath] = useState<number[] | null>(null);
  const [masterOptions, setMasterOptions] = useState<MasterComponentOption[]>([]);
  const [masterLoaded, setMasterLoaded] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<ComponentPickerFilter>('all');
  const [selectedMasterKeys, setSelectedMasterKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!editing) {
      setComponents(item.components_snapshot ?? []);
      setSubitems(item.subitems_snapshot ?? []);
    }
  }, [item.components_snapshot, item.subitems_snapshot, editing]);

  const updateComponents = (path: number[], next: RabComponentSnapshot[]) => {
    const result = patchComponentsAtPath(components, subitems, path, next);
    setComponents(result.components);
    setSubitems(result.subitems);
  };

  const updateCoefficient = (path: number[], coefficient: number) => {
    setSubitems((current) => patchSubitemCoefficient(current, path, coefficient));
  };

  const loadMasterOptions = async () => {
    const [materialsResult, laborResult, equipmentResult] = await Promise.all([
      supabase.from('master_materials').select('id, code, name, unit, unit_price, category').order('code', { ascending: true }),
      supabase.from('master_upah').select('id, code, name, unit, unit_price, category').order('code', { ascending: true }),
      supabase.from('master_alat').select('id, code, name, unit, unit_price, category').order('code', { ascending: true }),
    ]);

    if (materialsResult.error) throw materialsResult.error;
    if (laborResult.error) throw laborResult.error;
    if (equipmentResult.error) throw equipmentResult.error;

    const normalize = (rows: MasterComponentRow[] | null, type: RabComponentSnapshot['type']): MasterComponentOption[] =>
      (rows ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code ?? ''),
        name: String(row.name ?? ''),
        unit: String(row.unit ?? ''),
        unit_price: Number(row.unit_price ?? 0),
        category: String(row.category ?? ''),
        type,
      }));

    const options = [
      ...normalize(materialsResult.data as MasterComponentRow[] | null, 'material'),
      ...normalize(laborResult.data as MasterComponentRow[] | null, 'labor'),
      ...normalize(equipmentResult.data as MasterComponentRow[] | null, 'equipment'),
    ].sort((left, right) => left.code.localeCompare(right.code, 'id'));
    setMasterOptions(options);
    setMasterLoaded(true);
  };

  const openComponentPicker = async (path: number[]) => {
    setPickerTargetPath(path);
    setPickerError('');
    setPickerSearch('');
    setPickerFilter('all');
    setSelectedMasterKeys([]);
    if (masterLoaded) return;

    setPickerLoading(true);
    try {
      await loadMasterOptions();
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : 'Gagal memuat Master Material, Upah, dan Alat.');
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredMasterOptions = masterOptions.filter((option) => {
    if (pickerFilter !== 'all' && option.type !== pickerFilter) return false;
    const query = pickerSearch.trim().toLocaleLowerCase('id');
    if (!query) return true;
    return [option.code, option.name, option.unit, option.category].join(' ').toLocaleLowerCase('id').includes(query);
  });

  const addSelectedMasterComponents = () => {
    if (pickerTargetPath === null || !selectedMasterKeys.length) return;
    const selected = masterOptions
      .filter((option) => selectedMasterKeys.includes(option.type + ':' + option.id))
      .map((option): RabComponentSnapshot => ({
        name: option.name,
        unit: option.unit,
        coefficient: 1,
        unit_price: option.unit_price,
        type: option.type,
        ...(option.type === 'material' ? { material_id: option.id } : {}),
        ...(option.type === 'labor' ? { upah_id: option.id } : {}),
        ...(option.type === 'equipment' ? { alat_id: option.id } : {}),
      }));
    if (!selected.length) return;

    const current = getComponentsAtPath(components, subitems, pickerTargetPath);
    let existing = current;
    if (existing.length === 0) {
      if (pickerTargetPath.length === 0 && subitems.length === 0 && Number(item.unit_price || 0) > 0) {
        // Pertahankan harga snapshot lama yang belum memiliki rincian sebelum menambahkan komponen baru.
        existing = [legacySummaryComponent(Number(item.unit_price), item.unit)];
      } else if (pickerTargetPath.length > 0) {
        const target = getSubitemAtPath(subitems, pickerTargetPath);
        if (target && (target.subitems?.length ?? 0) === 0 && Number(target.unit_price || 0) > 0) {
          existing = [legacySummaryComponent(Number(target.unit_price), target.unit)];
        }
      }
    }
    updateComponents(pickerTargetPath, [...existing, ...selected]);
    setPickerTargetPath(null);
    setSelectedMasterKeys([]);
  };

  const cancel = () => {
    setComponents(item.components_snapshot ?? []);
    setSubitems(item.subitems_snapshot ?? []);
    setEditing(false);
    setError('');
    setPickerTargetPath(null);
  };

  const save = async () => {
    if (!onSave || saving) return;
    const allComponents = [
      ...components,
      ...collectSubitemComponents(subitems),
    ];
    if (allComponents.some((component) =>
      !String(component.name ?? '').trim() ||
      !Number.isFinite(Number(component.coefficient)) || Number(component.coefficient) < 0 ||
      !Number.isFinite(Number(component.unit_price)) || Number(component.unit_price) < 0
    )) {
      setError('Nama komponen wajib diisi. Koefisien dan harga komponen harus berupa angka valid dan tidak negatif.');
      return;
    }

    const normalizedSubitems = recalculateSubitems(subitems);
    const hasBreakdown = components.length > 0 || normalizedSubitems.length > 0;
    const unitPrice = hasBreakdown
      ? componentAmount(components) + normalizedSubitems.reduce(
          (sum, subitem) => sum + Number(subitem.coefficient || 0) * Number(subitem.unit_price || 0),
          0,
        )
      : Number(item.unit_price || 0);
    const totalPrice = Number((unitPrice * Number(item.volume || 0)).toFixed(2));

    setSaving(true);
    setError('');
    try {
      await onSave({
        components_snapshot: components,
        subitems_snapshot: normalizedSubitems,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan rincian komponen.');
    } finally {
      setSaving(false);
    }
  };

  const hasDetails = components.length > 0 || subitems.length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-violet-950">Rincian komponen AHSP proyek</p>
          <p className="mt-0.5 text-[10px] text-violet-700">Snapshot proyek · perubahan nama, koefisien, dan harga hanya berlaku di RAB ini, tidak mengubah Master.</p>
        </div>
        {onSave && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button type="button" onClick={cancel} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" /> Batal
                </button>
                <button type="button" onClick={() => void save()} disabled={saving || pickerTargetPath !== null} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? 'Menyimpan...' : 'Simpan perubahan RAB'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => { setEditing(true); setError(''); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50">
                <Pencil className="h-3.5 w-3.5" /> Edit komponen AHSP
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="space-y-4">
        <section className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Komponen langsung AHSP induk</p>
          <ComponentLines
            components={components}
            editing={editing}
            onChange={setComponents}
            onAdd={() => void openComponentPicker([])}
          />
        </section>
        {subitems.length > 0 && (
          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-800">Sub-item pekerjaan</p>
            <SubitemComponents
              items={subitems}
              parentItem={item}
              editing={editing}
              onComponentsChange={updateComponents}
              onCoefficientChange={updateCoefficient}
              onOpenVolume={onOpenVolume}
              onAddComponents={(path) => void openComponentPicker(path)}
            />
          </section>
        )}
        {!hasDetails && !editing && (
          <p className="rounded-lg border border-dashed border-violet-200 bg-white px-3 py-3 text-xs text-slate-500">
            Snapshot ini belum memiliki rincian komponen. Gunakan Edit komponen AHSP untuk mulai membentuknya dari Master Material, Upah, atau Alat.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-4 border-t border-violet-100 pt-3 text-xs">
          <span className="text-slate-500">Harga satuan hasil analisa (terkunci):</span>
          <strong className="tabular-nums text-slate-900">
            {formatRupiah(
              editing
                ? (components.length || subitems.length
                  ? componentAmount(components) + recalculateSubitems(subitems).reduce((sum, subitem) => sum + Number(subitem.coefficient || 0) * Number(subitem.unit_price || 0), 0)
                  : Number(item.unit_price || 0))
                : Number(item.unit_price || 0),
            )}
          </strong>
        </div>
      </div>

      {pickerTargetPath !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="rab-component-picker-title" className="my-auto flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
              <div>
                <h3 id="rab-component-picker-title" className="text-sm font-bold text-slate-900">Tambah komponen dari Master</h3>
                <p className="mt-1 text-xs text-slate-500">Pilih bahan, tenaga kerja, atau alat. Data disalin ke snapshot proyek dan tidak mengubah Master.</p>
              </div>
              <button type="button" onClick={() => setPickerTargetPath(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Tutup pemilih komponen">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
              {pickerError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{pickerError}</p>}
              <div className="flex flex-wrap gap-2">
                {([
                  ['all', 'Semua'],
                  ['material', 'Material'],
                  ['labor', 'Upah'],
                  ['equipment', 'Alat'],
                ] as Array<[ComponentPickerFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPickerFilter(value)}
                    className={'rounded-full border px-3 py-1.5 text-xs font-semibold ' + (pickerFilter === value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  placeholder="Cari kode, nama, satuan, atau kategori..."
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
              {pickerLoading ? (
                <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat Master Material, Upah, dan Alat...</div>
              ) : filteredMasterOptions.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[28px_minmax(0,1fr)_90px_125px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase text-slate-500 sm:grid-cols-[32px_minmax(0,1fr)_110px_150px]">
                    <span>Pilih</span><span>Komponen</span><span className="text-center">Satuan</span><span className="text-right">Harga master</span>
                  </div>
                  <div className="max-h-[46vh] divide-y divide-slate-100 overflow-y-auto">
                    {filteredMasterOptions.map((option) => {
                      const key = option.type + ':' + option.id;
                      const checked = selectedMasterKeys.includes(key);
                      return (
                        <label key={key} className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_90px_125px] items-center gap-2 px-3 py-2.5 text-xs hover:bg-emerald-50/50 sm:grid-cols-[32px_minmax(0,1fr)_110px_150px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedMasterKeys((current) => checked ? current.filter((entry) => entry !== key) : [...current, key])}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800">{option.name}</span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">{option.code}{option.category ? ' · ' + option.category : ''}</span>
                            <span className="mt-0.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{typeLabel(option.type)}</span>
                          </span>
                          <span className="text-center text-slate-500">{option.unit || '-'}</span>
                          <span className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-700">{formatRupiah(option.unit_price)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  {masterLoaded ? 'Tidak ada komponen yang cocok dengan pencarian ini.' : 'Master belum berhasil dimuat. Periksa izin baca tabel Master lalu coba buka kembali pemilih komponen.'}
                </p>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
              <p className="text-xs text-slate-500">{selectedMasterKeys.length} komponen dipilih · koefisien awal setiap komponen 1</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPickerTargetPath(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="button" onClick={addSelectedMasterComponents} disabled={!selectedMasterKeys.length || pickerLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" /> Tambahkan {selectedMasterKeys.length} komponen
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function collectSubitemComponents(items: RabSubitemSnapshot[]): RabComponentSnapshot[] {
  return items.flatMap((item) => [
    ...(item.components ?? []),
    ...collectSubitemComponents(item.subitems ?? []),
  ]);
}

export default function RabTable({ items, onUpdate, onUpdateComponents, onDelete, onVolumeUpdated, onReorder, subcategories, onMoveItem, canReorder = false, readOnly = false }: Props) {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({ code: '', name: '', volume: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [volumeItem, setVolumeItem] = useState<VolumeBackupRabItem | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (editingId && !items.some((item) => item.id === editingId)) setEditingId(null);
  }, [items, editingId]);

  const beginEdit = (item: RabTableItem) => {
    setEditingId(item.id);
    setForm({
      code: item.code ?? '',
      name: item.name ?? '',
      volume: String(item.volume ?? 0),
    });
    setFormError('');
  };

  const saveEdit = async (itemId: string) => {
    if (saving) return;
    const code = form.code.trim();
    const name = form.name.trim();
    const volume = Number(form.volume);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return setFormError('Item RAB tidak ditemukan. Muat ulang halaman lalu coba kembali.');
    const lockedUnitPrice = Number(item.unit_price || 0);
    if (!code || !name) return setFormError('Kode dan uraian pekerjaan wajib diisi.');
    if (!form.volume.trim() || !Number.isFinite(volume) || volume < 0) {
      return setFormError('Volume harus berupa angka valid dan tidak negatif.');
    }
    setSaving(true);
    setFormError('');
    try {
      await onUpdate(itemId, { code, name, volume, total_price: Number((volume * lockedUnitPrice).toFixed(2)) });
      setEditingId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal memperbarui item RAB.');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (targetId: string) => {
    if (!canReorder || !onReorder || !draggedId || draggedId === targetId || reordering) return;
    const orderedItems = [...items];
    const fromIndex = orderedItems.findIndex((item) => item.id === draggedId);
    const toIndex = orderedItems.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [movedItem] = orderedItems.splice(fromIndex, 1);
    orderedItems.splice(toIndex, 0, movedItem);
    if (orderedItems.every((item, index) => item.id === items[index]?.id)) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }

    setReordering(true);
    setFormError('');
    setDraggedId(null);
    setDropTargetId(null);
    try {
      await onReorder(orderedItems.map((item) => item.id));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menyimpan urutan item RAB.');
    } finally {
      setReordering(false);
    }
  };

  const handleDelete = async (item: RabTableItem) => {
    if (reordering) return;
    const confirmed = window.confirm(`Hapus "${item.code} - ${item.name}" dari RAB proyek ini?`);
    if (!confirmed || deletingId) return;
    setDeletingId(item.id);
    setFormError('');
    try {
      await onDelete(item);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menghapus item RAB.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      {formError && <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:mx-5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span></div>}
      <table className="w-full min-w-[1050px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <th className="w-20 px-3 py-3">Urutan</th><th className="w-32 px-3 py-3">Kode</th><th className="px-3 py-3">Uraian Pekerjaan</th><th className="w-28 px-3 py-3 text-right">Volume</th><th className="w-20 px-3 py-3 text-center">Sat</th><th className="w-40 px-3 py-3 text-right">Harga Satuan</th><th className="w-44 px-4 py-3 text-right">Total Harga</th><th className="w-32 px-3 py-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {items.length ? items.map((item, index) => {
            const isEditing = !readOnly && editingId === item.id;
            const previewTotal = Math.max(0, Number(form.volume) || 0) * Math.max(0, Number(item.unit_price) || 0);
            const hasDetails = Boolean((item.components_snapshot?.length ?? 0) || (item.subitems_snapshot?.length ?? 0));
            const canEditComposition = !readOnly && Boolean(onUpdateComponents);
            const detailsOpen = expandedDetails[item.id] ?? false;
            const volumeTarget: VolumeBackupRabItem = {
              id: item.id, code: item.code, name: item.name, unit: item.unit,
              volume: item.volume, unit_price: item.unit_price, total_price: item.total_price,
              subitems_snapshot: item.subitems_snapshot ?? [], parentVolume: item.volume,
            };
            return (
              <Fragment key={item.id}>
                <tr
                  onDragOver={(event) => {
                    if (!canReorder || !draggedId || draggedId === item.id || reordering) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropTargetId(item.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleReorder(item.id);
                  }}
                  className={`align-top transition-colors hover:bg-slate-50/70 ${draggedId === item.id ? 'opacity-40' : ''} ${dropTargetId === item.id ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-300' : ''}`}
                >
                  <td className="px-3 py-3.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {canReorder && onReorder && (
                        <span
                          draggable={!reordering && !editingId && !deletingId}
                          onDragStart={(event) => {
                            if (!canReorder || !onReorder || reordering || editingId || deletingId) {
                              event.preventDefault();
                              return;
                            }
                            setDraggedId(item.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', item.id);
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDropTargetId(null);
                          }}
                          title="Tarik untuk mengubah urutan"
                          aria-label={`Tarik untuk mengurutkan ${item.name}`}
                          className={`inline-flex cursor-grab touch-none items-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing ${reordering ? 'opacity-40' : ''}`}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-4 tabular-nums">{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    {isEditing ? <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className={INPUT_CLASS} aria-label="Kode pekerjaan" /> : <div><span className="font-mono text-xs text-slate-600">{item.code || '-'}</span>{item.master_ahsp_id && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Link2 className="h-3 w-3" />Master AHSP</span>}</div>}
                  </td>
                  <td className="px-3 py-3.5">
                    {isEditing ? <textarea rows={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`${INPUT_CLASS} resize-y`} aria-label="Uraian pekerjaan" /> : (
                      <div>
                        {item.work_group_name?.trim() && <span className="mb-1 inline-flex rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{item.work_group_name}</span>}
                        <span className="block font-medium leading-5 text-slate-900">{item.name}</span>
                        {!readOnly && onMoveItem && (subcategories?.length ?? 0) > 0 && (
                          <label className="mt-2 flex max-w-xl flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            <span>Pindahkan ke:</span>
                            <select
                              value={item.rab_subcategory_id ?? ''}
                              onChange={(event) => {
                                const nextId = event.target.value;
                                if (nextId && nextId !== item.rab_subcategory_id) {
                                  void onMoveItem(item.id, nextId).catch((error) => setFormError(error instanceof Error ? error.message : 'Gagal memindahkan item.'));
                                }
                              }}
                              className="max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700"
                              aria-label={'Pindahkan kategori untuk ' + item.name}
                            >
                              {(subcategories ?? []).map((subcategory) => (
                                <option key={subcategory.id} value={subcategory.id}>{subcategory.categoryName} · {subcategory.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    {isEditing ? <input type="number" min="0" step="any" value={form.volume} onChange={(event) => setForm((current) => ({ ...current, volume: event.target.value }))} className={`${INPUT_CLASS} text-right tabular-nums`} aria-label="Volume" /> : <span className="tabular-nums text-slate-700">{fmtNumber(Number(item.volume))}</span>}
                  </td>
                  <td className="px-3 py-3.5 text-center"><span title="Satuan mengikuti snapshot Master AHSP" className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${item.master_ahsp_id ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{item.master_ahsp_id && <Lock className="h-3 w-3" />}{item.unit || '-'}</span></td>
                  <td className="px-3 py-3.5 text-right">
                    <span title="Harga satuan dikunci dan dihitung otomatis dari komponen AHSP" className="inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums text-slate-700"><Lock className="h-3 w-3 text-slate-400" />{formatRupiah(Number(item.unit_price || 0))}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(isEditing ? previewTotal : Number(item.total_price || 0))}</td>
                  <td className="px-3 py-3.5"><div className="flex items-center justify-center gap-1">
                    {isEditing ? <><button type="button" onClick={() => void saveEdit(item.id)} disabled={saving} title="Simpan perubahan" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button><button type="button" onClick={() => { setEditingId(null); setFormError(''); }} disabled={saving} title="Batal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></> : <>
                      {(hasDetails || canEditComposition) && <button type="button" onClick={() => setExpandedDetails((current) => ({ ...current, [item.id]: !detailsOpen }))} aria-expanded={detailsOpen} title={detailsOpen ? 'Tutup rincian AHSP' : 'Buka / edit komponen AHSP'} className="rounded-lg p-2 text-violet-700 hover:bg-violet-50">{detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ListTree className="h-4 w-4" />}</button>}
                      {!readOnly && <button type="button" onClick={() => setVolumeItem(volumeTarget)} disabled={Boolean(editingId) || Boolean(deletingId) || reordering} title="Backup volume" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Ruler className="h-4 w-4" /></button>}
                      {!readOnly && <button type="button" onClick={() => beginEdit(item)} disabled={Boolean(editingId) || Boolean(deletingId) || reordering} title="Edit item RAB" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Pencil className="h-4 w-4" /></button>}
                      {!readOnly && <button type="button" onClick={() => void handleDelete(item)} disabled={Boolean(editingId) || deletingId === item.id || reordering} title="Hapus item RAB" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40">{deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                    </>}
                  </div></td>
                </tr>
                {(hasDetails || canEditComposition) && detailsOpen && (
                  <tr className="bg-violet-50/20"><td colSpan={8} className="px-4 py-3 sm:px-6"><CompositionEditor item={item} onSave={!readOnly && onUpdateComponents ? (changes) => onUpdateComponents(item.id, changes) : undefined} onOpenVolume={(target) => { if (!readOnly) setVolumeItem(target); }} /></td></tr>
                )}
              </Fragment>
            );
          }) : <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">Belum ada item pekerjaan pada lokasi ini.</td></tr>}
        </tbody>
        {items.length > 0 && <tfoot><tr className="border-t border-slate-200 bg-slate-50/70"><td colSpan={7} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">Subtotal kelompok</td><td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold tabular-nums text-slate-900">{formatRupiah(items.reduce((sum, item) => sum + Number(item.total_price || 0), 0))}</td></tr></tfoot>}
      </table>
      <VolumeBackupDrawer
        open={!readOnly && Boolean(volumeItem)}
        item={volumeItem}
        onClose={() => setVolumeItem(null)}
        onSaved={async () => { await onVolumeUpdated?.(); }}
      />
    </div>
  );
}
