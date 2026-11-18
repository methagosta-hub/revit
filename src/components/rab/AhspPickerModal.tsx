'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  X,
  Layers,
  Package,
  Wrench,
  Plus,
  Loader2,
  AlertCircle,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';

export type AhspSnapshotComponent = {
  material_id?: string;
  upah_id?: string;
  alat_id?: string;
  name: string;
  unit: string;
  coefficient: number;
  unit_price: number;
  type: 'material' | 'labor' | 'equipment';
  isLegacySummary?: boolean;
};

export type AhspSnapshotSubitem = {
  // masterAhspId berisi ID sub-item custom; pada data lama berisi ID AHSP anak.
  masterAhspId: string;
  code: string;
  name: string;
  unit: string;
  coefficient: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  components: AhspSnapshotComponent[];
  subitems: AhspSnapshotSubitem[];
};

export type SelectedAhspPayload = {
  masterAhspId: string;
  code: string;
  name: string;
  unit: string;
  volume: number;
  unitPrice: number;
  totalPrice: number;
  componentsSnapshot: AhspSnapshotComponent[];
  subitemsSnapshot: AhspSnapshotSubitem[];
};

export type SelectedAhspBatchPayload = {
  groupName: string;
  mode?: 'separate' | 'group';
  items: SelectedAhspPayload[];
};

type MasterAhspRecord = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  category?: string | null;
  labor_cost?: number | null;
  material_cost?: number | null;
  equipment_cost?: number | null;
  total_price?: number | null;
  calculated_total_price?: number;
  components?: AhspSnapshotComponent[] | null;
  subitems?: AhspSnapshotSubitem[];
};

type MasterAhspComponentRow = AhspSnapshotComponent & {
  id: string;
  ahsp_id: string;
  coefficient: number | string;
  unit_price: number | string;
  sort_order?: number;
};

type MasterAhspSubitemRow = {
  id: string;
  parent_ahsp_id: string;
  child_ahsp_id?: string | null;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  coefficient: number | string;
  notes?: string | null;
  components?: AhspSnapshotComponent[] | null;
  total_price?: number | string | null;
  sort_order?: number;
};

type Props = {
  open: boolean;
  divisionId: string | null;
  divisionName: string;
  onClose: () => void;
  onAdd: (payload: SelectedAhspBatchPayload) => Promise<void>;
};

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function legacyComponentsFor(item: MasterAhspRecord): AhspSnapshotComponent[] {
  const legacy: AhspSnapshotComponent[] = [];
  const rows: Array<{
    type: AhspSnapshotComponent['type'];
    name: string;
    amount: number;
  }> = [
    { type: 'labor', name: 'Total Upah (data lama)', amount: numberValue(item.labor_cost) },
    { type: 'material', name: 'Total Bahan (data lama)', amount: numberValue(item.material_cost) },
    { type: 'equipment', name: 'Total Alat (data lama)', amount: numberValue(item.equipment_cost) },
  ];

  rows.forEach(({ type, name, amount }) => {
    if (amount > 0) {
      legacy.push({
        name,
        unit: 'total',
        coefficient: 1,
        unit_price: amount,
        type,
        isLegacySummary: true,
      });
    }
  });
  return legacy;
}

function componentsFor(
  item: MasterAhspRecord,
  relationalRows?: MasterAhspComponentRow[],
): AhspSnapshotComponent[] {
  const relational = (relationalRows ?? []).map((component) => ({
    ...(component.material_id ? { material_id: component.material_id } : {}),
    ...(component.upah_id ? { upah_id: component.upah_id } : {}),
    ...(component.alat_id ? { alat_id: component.alat_id } : {}),
    name: String(component.name ?? ''),
    unit: String(component.unit ?? ''),
    coefficient: numberValue(component.coefficient),
    unit_price: numberValue(component.unit_price),
    type: component.type,
  }));
  if (relational.length > 0) return relational;

  if (Array.isArray(item.components) && item.components.length > 0) {
    return item.components.map((component) => ({
      ...(component.material_id ? { material_id: component.material_id } : {}),
      ...(component.upah_id ? { upah_id: component.upah_id } : {}),
      ...(component.alat_id ? { alat_id: component.alat_id } : {}),
      name: String(component.name ?? ''),
      unit: String(component.unit ?? ''),
      coefficient: numberValue(component.coefficient),
      unit_price: numberValue(component.unit_price),
      type: component.type,
      ...(component.isLegacySummary ? { isLegacySummary: true } : {}),
    }));
  }
  return legacyComponentsFor(item);
}

function itemUnitPrice(item: MasterAhspRecord): number {
  if (Number.isFinite(item.calculated_total_price)) {
    return Number(item.calculated_total_price);
  }
  const explicit = numberValue(item.total_price);
  if (explicit > 0) return explicit;
  return (
    numberValue(item.labor_cost) +
    numberValue(item.material_cost) +
    numberValue(item.equipment_cost)
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

export default function AhspPickerModal({
  open,
  divisionId,
  divisionName,
  onClose,
  onAdd,
}: Props) {
  const [records, setRecords] = useState<MasterAhspRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [volume, setVolume] = useState('1');
  const [groupName, setGroupName] = useState('');
  const [insertionMode, setInsertionMode] = useState<'separate' | 'group'>('separate');
  const [queuedItems, setQueuedItems] = useState<SelectedAhspPayload[]>([]);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!open) return;

    // Setiap sesi penyusunan dimulai dari daftar kosong agar pilihan dari
    // item pekerjaan sebelumnya tidak ikut tersimpan tanpa sengaja.
    setSearch('');
    setCategory('ALL');
    setSelectedId('');
    setBulkSelectedIds([]);
    setVolume('1');
    setGroupName('');
    setInsertionMode('separate');
    setQueuedItems([]);
    setActionError('');

    let active = true;

    async function loadMasterAhsp() {
      setLoading(true);
      setLoadError('');
      setActionError('');

      try {
        // Baca AHSP induk, komponen langsung, dan relasi AHSP turunan.
        // Tabel relasional adalah sumber utama; JSONB components hanya fallback.
        const [ahspResult, componentResult, subitemResult] = await Promise.all([
          supabase.from('master_ahsp').select('*').order('code', { ascending: true }),
          supabase.from('master_ahsp_components').select('*').order('sort_order', { ascending: true }),
          supabase.from('master_ahsp_subitems').select('*').order('sort_order', { ascending: true }),
        ]);

        if (ahspResult.error) throw ahspResult.error;
        if (componentResult.error) throw componentResult.error;
        if (subitemResult.error) throw subitemResult.error;
        if (!active) return;

        const masters = (ahspResult.data ?? []) as MasterAhspRecord[];
        const componentRows = (componentResult.data ?? []) as MasterAhspComponentRow[];
        const subitemRows = (subitemResult.data ?? []) as MasterAhspSubitemRow[];

        const masterById = new Map(masters.map((row) => [row.id, row]));
        const componentsByAhsp = new Map<string, MasterAhspComponentRow[]>();
        componentRows.forEach((row) => {
          const group = componentsByAhsp.get(row.ahsp_id) ?? [];
          group.push(row);
          componentsByAhsp.set(row.ahsp_id, group);
        });
        const childrenByParent = new Map<string, MasterAhspSubitemRow[]>();
        subitemRows.forEach((row) => {
          const group = childrenByParent.get(row.parent_ahsp_id) ?? [];
          group.push(row);
          childrenByParent.set(row.parent_ahsp_id, group);
        });

        const directComponentsById = new Map<string, AhspSnapshotComponent[]>();
        const directPriceById = new Map<string, number>();
        masters.forEach((master) => {
          const directComponents = componentsFor(master, componentsByAhsp.get(master.id));
          directComponentsById.set(master.id, directComponents);
          // labor/material/equipment pada Master AHSP menyimpan biaya langsung.
          // total_price database sudah mencakup sub-item, sehingga tidak boleh
          // ditambahkan lagi dengan sub-item saat membentuk total di browser.
          const hasRelational = (componentsByAhsp.get(master.id)?.length ?? 0) > 0;
          const hasJson = Array.isArray(master.components) && master.components.length > 0;
          const direct = hasRelational || hasJson
            ? directComponents.reduce((sum, component) => sum + component.coefficient * component.unit_price, 0)
            : numberValue(master.labor_cost) + numberValue(master.material_cost) + numberValue(master.equipment_cost);
          // Beberapa data AHSP lama hanya mengisi total_price tanpa rincian
          // biaya langsung. Gunakan total_price sebagai fallback hanya bila
          // item tersebut tidak memiliki anak; parent komposit dihitung dari
          // biaya langsung + sub-item agar tidak terjadi penjumlahan ganda.
          const hasChildren = (childrenByParent.get(master.id)?.length ?? 0) > 0;
          const hasDirectBreakdown =
            hasRelational ||
            hasJson ||
            numberValue(master.labor_cost) > 0 ||
            numberValue(master.material_cost) > 0 ||
            numberValue(master.equipment_cost) > 0;
          const legacyFallback = !hasChildren && !hasDirectBreakdown
            ? numberValue(master.total_price)
            : 0;
          directPriceById.set(master.id, direct + legacyFallback);
        });

        const priceCache = new Map<string, number>();
        const fullPrice = (id: string, visited = new Set<string>()): number => {
          if (visited.size === 0 && priceCache.has(id)) return priceCache.get(id)!;
          const base = directPriceById.get(id);
          if (base === undefined) return 0;
          if (visited.has(id)) return base;
          const nextVisited = new Set(visited);
          nextVisited.add(id);
          const childTotal = (childrenByParent.get(id) ?? []).reduce((sum, link) => {
            const customComponents = Array.isArray(link.components) ? link.components : [];
            const componentPrice = customComponents.reduce(
              (componentSum, component) =>
                componentSum + numberValue(component.coefficient) * numberValue(component.unit_price),
              0,
            );
            const legacyChildPrice = link.child_ahsp_id
              ? fullPrice(link.child_ahsp_id, nextVisited)
              : 0;
            const rowPrice = link.child_ahsp_id
              ? legacyChildPrice
              : customComponents.length > 0
                ? componentPrice
                : link.total_price !== null && link.total_price !== undefined
                  ? numberValue(link.total_price)
                  : 0;
            return sum + numberValue(link.coefficient) * rowPrice;
          }, 0);
          const total = base + childTotal;
          if (visited.size === 0) priceCache.set(id, total);
          return total;
        };

        const buildSubitems = (parentId: string, visited = new Set<string>()): AhspSnapshotSubitem[] => {
          if (visited.has(parentId)) return [];
          const nextVisited = new Set(visited);
          nextVisited.add(parentId);
          return (childrenByParent.get(parentId) ?? []).map((link) => {
            const child = link.child_ahsp_id ? masterById.get(link.child_ahsp_id) : undefined;
            const storedComponents = Array.isArray(link.components) ? link.components : [];
            const childComponents = child ? (directComponentsById.get(child.id) ?? []) : [];
            // Simpan ID relasi master bahan/upah/alat di snapshot RAB, sekaligus
            // menormalkan angka agar hasil hitung konsisten untuk sub-item kustom.
            const components: AhspSnapshotComponent[] = (storedComponents.length > 0 ? storedComponents : childComponents).map((component) => ({
              ...(component.material_id ? { material_id: component.material_id } : {}),
              ...(component.upah_id ? { upah_id: component.upah_id } : {}),
              ...(component.alat_id ? { alat_id: component.alat_id } : {}),
              name: String(component.name ?? ''),
              unit: String(component.unit ?? ''),
              coefficient: numberValue(component.coefficient),
              unit_price: numberValue(component.unit_price),
              type: component.type,
              ...(component.isLegacySummary ? { isLegacySummary: true } : {}),
            }));
            const coefficient = numberValue(link.coefficient);
            const componentPrice = components.reduce(
              (sum, component) => sum + numberValue(component.coefficient) * numberValue(component.unit_price),
              0,
            );
            const unitPrice = child
              ? fullPrice(child.id, nextVisited)
              : components.length > 0
                ? componentPrice
                : link.total_price !== null && link.total_price !== undefined
                  ? numberValue(link.total_price)
                  : 0;
            return {
              masterAhspId: link.id,
              code: link.code ?? child?.code ?? '',
              name: link.name ?? child?.name ?? 'Sub-item pekerjaan',
              unit: link.unit ?? child?.unit ?? '',
              coefficient,
              unit_price: unitPrice,
              line_total: coefficient * unitPrice,
              notes: link.notes ?? null,
              components,
              subitems: child ? buildSubitems(child.id, nextVisited) : [],
            };
          });
        };

        const loaded = masters.map((master) => ({
          ...master,
          components: directComponentsById.get(master.id) ?? [],
          calculated_total_price: fullPrice(master.id),
          subitems: buildSubitems(master.id),
        }));

        setRecords(loaded);
        setSelectedId((current) => loaded.some((row) => row.id === current) ? current : (loaded[0]?.id ?? ''));
      } catch (error) {
        if (!active) return;
        console.error('Gagal memuat Master AHSP beserta sub-item:', error);
        setLoadError(`Gagal mengambil Master AHSP/sub-item: ${describeError(error)}. Pastikan migrasi master_ahsp_subitems sudah dijalankan dan akses SELECT tersedia.`);
        setRecords([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMasterAhsp();

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setCategory('ALL');
      setSelectedId('');
      setVolume('1');
      setActionError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !adding) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, adding, onClose]);

  const categories = useMemo(
    () => [
      'ALL',
      ...Array.from(
        new Set(records.map((item) => item.category?.trim() || 'Umum')),
      ).sort((a, b) => a.localeCompare(b, 'id')),
    ],
    [records],
  );

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');

    return records.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.code.toLocaleLowerCase('id').includes(keyword) ||
        item.name.toLocaleLowerCase('id').includes(keyword) ||
        (item.category ?? '').toLocaleLowerCase('id').includes(keyword);

      const matchesCategory =
        category === 'ALL' || (item.category?.trim() || 'Umum') === category;

      return matchesSearch && matchesCategory;
    });
  }, [records, search, category]);

  const selectedItem = records.find((item) => item.id === selectedId) ?? null;
  const selectedComponents = selectedItem ? (selectedItem.components ?? componentsFor(selectedItem)) : [];
  const selectedSubitems = selectedItem?.subitems ?? [];
  const volumeNumber = Number(volume);
  const unitPrice = selectedItem ? itemUnitPrice(selectedItem) : 0;
  const totalPrice =
    Number.isFinite(volumeNumber) && volumeNumber > 0
      ? volumeNumber * unitPrice
      : 0;

  const handleAddToQueue = () => {
    if (!selectedItem || !divisionId) {
      setActionError('Pilih AHSP terlebih dahulu.');
      return;
    }

    const lockedUnit = String(selectedItem.unit ?? '').trim();
    if (!lockedUnit) {
      setActionError('AHSP induk ini belum memiliki satuan dan hanya berfungsi sebagai kelompok. Isi satuan di Master AHSP bila ingin memasukkannya langsung ke RAB.');
      return;
    }

    if (!volume.trim() || !Number.isFinite(volumeNumber) || volumeNumber <= 0) {
      setActionError('Volume harus berupa angka lebih besar dari nol.');
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(totalPrice)) {
      setActionError('Harga satuan atau total harga AHSP tidak valid.');
      return;
    }

    const payload: SelectedAhspPayload = {
      masterAhspId: selectedItem.id,
      code: selectedItem.code,
      name: selectedItem.name,
      unit: lockedUnit,
      volume: volumeNumber,
      unitPrice,
      totalPrice,
      componentsSnapshot: selectedComponents,
      subitemsSnapshot: selectedSubitems,
    };

    setQueuedItems((current) => {
      const existingIndex = current.findIndex((item) => item.masterAhspId === payload.masterAhspId);
      if (existingIndex === -1) return [...current, payload];
      return current.map((item, index) => index === existingIndex ? payload : item);
    });
    setActionError('');
  };

  const handleAddSelectedToQueue = () => {
    if (bulkSelectedIds.length === 0) {
      setActionError('Centang minimal satu AHSP pada daftar.');
      return;
    }

    const selectedRecords = records.filter((record) => bulkSelectedIds.includes(record.id));
    const invalidRecords = selectedRecords.filter((record) => !String(record.unit ?? '').trim());
    if (invalidRecords.length > 0) {
      setActionError(`AHSP tanpa satuan tidak dapat dijadikan item RAB: ${invalidRecords.map((item) => item.code).join(', ')}.`);
      return;
    }

    const payloads = selectedRecords.map((record): SelectedAhspPayload => {
      const existing = queuedItems.find((item) => item.masterAhspId === record.id);
      const components = record.components ?? componentsFor(record);
      const price = itemUnitPrice(record);
      const itemVolume = existing?.volume ?? 1;
      return {
        masterAhspId: record.id,
        code: record.code,
        name: record.name,
        unit: String(record.unit ?? '').trim(),
        volume: itemVolume,
        unitPrice: price,
        totalPrice: Number((itemVolume * price).toFixed(2)),
        componentsSnapshot: components,
        subitemsSnapshot: record.subitems ?? [],
      };
    });

    setQueuedItems((current) => {
      const byId = new Map(current.map((item) => [item.masterAhspId, item]));
      payloads.forEach((item) => byId.set(item.masterAhspId, item));
      return Array.from(byId.values());
    });
    setActionError('');
  };

  const handleSaveBatch = async () => {
    if (queuedItems.length === 0) {
      setActionError('Pilih dan masukkan minimal satu AHSP ke daftar item pekerjaan.');
      return;
    }
    const cleanGroupName = insertionMode === 'group' && queuedItems.length > 1
      ? groupName.trim()
      : queuedItems.length === 1
        ? queuedItems[0].name.trim()
        : '';
    if (insertionMode === 'group' && queuedItems.length > 1 && !cleanGroupName) {
      setActionError('Isi nama item pekerjaan untuk menggabungkan AHSP sebagai satu pekerjaan.');
      return;
    }
    if (cleanGroupName.length > 255) {
      setActionError('Nama item pekerjaan maksimal 255 karakter.');
      return;
    }
    if (queuedItems.some((item) => !Number.isFinite(item.volume) || item.volume <= 0)) {
      setActionError('Periksa kembali volume setiap AHSP. Semua volume harus lebih besar dari nol.');
      return;
    }

    setAdding(true);
    setActionError('');
    try {
      await onAdd({ groupName: cleanGroupName, mode: insertionMode, items: queuedItems });
      onClose();
    } catch (error) {
      console.error('Gagal menyimpan paket AHSP ke RAB:', error);
      setActionError(describeError(error));
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !adding) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ahsp-picker-title"
        className="my-auto flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
              <Layers className="h-4 w-4" />
              Database AHSP Global
            </div>
            <h2 id="ahsp-picker-title" className="font-bold text-slate-900">
              Susun Item Pekerjaan dari Beberapa AHSP
            </h2>
            <p className="mt-1 truncate text-xs text-slate-500">
              Tujuan: {divisionName || 'Lokasi pekerjaan'} · pilih banyak AHSP sekaligus, lalu masukkan sebagai item terpisah atau subpekerjaan
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            aria-label="Tutup pemilih AHSP"
            className="ml-3 rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="flex min-h-0 flex-col border-b border-slate-100 lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kode atau uraian pekerjaan..."
                  aria-label="Cari AHSP"
                  className={`${INPUT_CLASS} bg-slate-50 pl-9`}
                />
              </div>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Filter kategori AHSP"
                className={`${INPUT_CLASS} bg-slate-50`}
              >
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value === 'ALL' ? 'Semua Kategori' : value}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Menampilkan {filteredRecords.length} dari {records.length} analisa
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="px-5 py-14 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-600" />
                  Memuat Master AHSP...
                </div>
              ) : loadError ? (
                <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mb-2 h-4 w-4" />
                  {loadError}
                </div>
              ) : filteredRecords.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredRecords.map((item) => {
                    const isSelected = selectedId === item.id;
                    const isBulkSelected = bulkSelectedIds.includes(item.id);

                    return (
                      <div key={item.id} className={`flex items-stretch gap-2 px-3 py-2 transition ${isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}>
                        <label className="flex shrink-0 cursor-pointer items-center px-1" title="Pilih AHSP untuk input massal">
                          <input
                            type="checkbox"
                            checked={isBulkSelected}
                            onChange={(event) => setBulkSelectedIds((current) => event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id))}
                            disabled={!item.unit?.trim()}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-30"
                            aria-label={`Pilih ${item.code} sebagai item RAB terpisah`}
                          />
                        </label>
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(item.id);
                            const queued = queuedItems.find((entry) => entry.masterAhspId === item.id);
                            setVolume(queued ? String(queued.volume) : '1');
                            setActionError('');
                          }}
                          className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition ${isSelected ? 'ring-1 ring-inset ring-emerald-200' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold text-emerald-700">{item.code}</p>
                              <p className="mt-1 text-sm font-semibold leading-5 text-slate-900">{item.name}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span className={`rounded px-2 py-0.5 ${item.unit?.trim() ? 'bg-slate-100' : 'bg-amber-50 text-amber-700'}`}>{item.unit?.trim() || 'Kelompok'}</span>
                                <span>{item.category || 'Umum'}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-bold tabular-nums text-slate-900">{formatRupiah(itemUnitPrice(item))}</p>
                              {isSelected && <CheckCircle2 className="ml-auto mt-2 h-4 w-4 text-emerald-600" />}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-14 text-center">
                  <Package className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    {records.length === 0 ? 'Master AHSP masih kosong' : 'AHSP tidak ditemukan'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {records.length === 0
                      ? 'Tambahkan analisa melalui menu Master AHSP terlebih dahulu.'
                      : 'Ubah kata kunci atau kategori pencarian.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto p-4 sm:p-5">
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold text-slate-800">Cara memasukkan AHSP</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${insertionMode === 'separate' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                  <input type="radio" name="ahsp-insertion-mode" checked={insertionMode === 'separate'} onChange={() => setInsertionMode('separate')} className="mt-0.5 text-emerald-600" />
                  <span><strong className="block text-xs text-slate-900">Item pekerjaan terpisah</strong><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">Setiap AHSP menjadi satu baris/item RAB sendiri. Ini pilihan utama untuk input massal.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${insertionMode === 'group' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                  <input type="radio" name="ahsp-insertion-mode" checked={insertionMode === 'group'} onChange={() => setInsertionMode('group')} className="mt-0.5 text-indigo-600" />
                  <span><strong className="block text-xs text-slate-900">Gabungkan sebagai subpekerjaan</strong><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">Beberapa AHSP ditempatkan dalam satu kelompok pekerjaan seperti cara sebelumnya.</span></span>
                </label>
              </div>
            </div>
            {insertionMode === 'group' && queuedItems.length > 1 ? (
              <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                <label htmlFor="ahsp-work-group-name" className="mb-1.5 block text-xs font-bold text-indigo-950">Nama item pekerjaan induk</label>
                <input
                  id="ahsp-work-group-name"
                  type="text"
                  maxLength={255}
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Contoh: Pembuatan Kolom K1 30 x 30 cm"
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <p className="mt-1.5 text-[10px] leading-4 text-indigo-800">Nama induk ini akan menaungi semua AHSP pilihan sebagai satu kelompok pekerjaan.</p>
              </div>
            ) : insertionMode === 'separate' ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <p className="text-xs font-bold text-emerald-950">Setiap AHSP akan menjadi item RAB mandiri</p>
                <p className="mt-1 text-[10px] leading-4 text-emerald-800">Kode, uraian, satuan, analisa, dan harga mengikuti masing-masing Master AHSP. Volume dapat diubah per item dari daftar pilihan.</p>
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Pilih sedikitnya dua AHSP untuk membuat satu kelompok subpekerjaan.</p>
              </div>
            )}
            {selectedItem ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Detail analisa terpilih
                  </p>
                  <h3 className="mt-1 font-bold leading-5 text-slate-900">
                    {selectedItem.name}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {selectedItem.code}
                  </p>
                  {selectedItem.unit?.trim() ? (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Satuan AHSP terkunci:</span>
                      <strong className="font-mono">{selectedItem.unit}</strong>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      AHSP ini merupakan induk kelompok tanpa satuan. Rincian sub-item dapat dilihat, tetapi induk tidak dapat dimasukkan langsung ke RAB. Isi satuan di Master AHSP bila ingin menggunakannya sebagai item RAB.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-700">
                    Komponen pembentuk harga
                  </p>
                  {selectedComponents.length > 0 ? (
                    <div className="space-y-2">
                      {selectedComponents.map((component, index) => (
                        <div
                          key={`${component.material_id ?? component.type}-${index}`}
                          className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800">
                              {component.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              {component.type === 'material'
                                ? 'Material'
                                : component.type === 'labor'
                                  ? 'Upah'
                                  : 'Alat'}{' '}
                              · Indeks {numberValue(component.coefficient)} {component.unit}
                            </p>
                          </div>
                          <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">
                            {formatRupiah(
                              numberValue(component.coefficient) *
                                numberValue(component.unit_price),
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Rincian komponen belum tersedia. Harga satuan menggunakan total AHSP
                      yang tersimpan.
                    </p>
                  )}
                </div>

                {selectedSubitems.length > 0 && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                    <p className="mb-2 text-xs font-semibold text-violet-900">
                      Sub-item pekerjaan ({selectedSubitems.length})
                    </p>
                    <div className="space-y-2">
                      {selectedSubitems.map((subitem, index) => (
                        <div key={`${subitem.masterAhspId}-${index}`} className="rounded-lg border border-violet-100 bg-white p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-[10px] text-violet-700">{subitem.code}</p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-800">{subitem.name}</p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                Koefisien {subitem.coefficient} {subitem.unit} · {subitem.subitems.length} sub-item lanjutan
                              </p>
                              {subitem.notes && <p className="mt-1 text-[10px] italic text-slate-500">{subitem.notes}</p>}
                              {subitem.components.length > 0 && (
                                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                  {subitem.components.map((component, componentIndex) => (
                                    <p key={`${component.name}-${componentIndex}`} className="text-[10px] text-slate-500">
                                      {component.type === 'material' ? 'Bahan' : component.type === 'labor' ? 'Upah' : 'Alat'}: {component.name} · {numberValue(component.coefficient)} {component.unit} × {formatRupiah(numberValue(component.unit_price))}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] text-slate-500">{subitem.unit}</p>
                              <p className="text-xs font-bold tabular-nums text-slate-800">{formatRupiah(subitem.line_total)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-violet-800">
                      Harga AHSP induk sudah memperhitungkan koefisien dan harga seluruh sub-item. Rincian ini akan disimpan sebagai snapshot saat dimasukkan ke RAB.
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <label htmlFor="ahsp-volume" className="mb-1.5 block text-xs font-semibold text-emerald-900">
                    Volume pekerjaan ({selectedItem.unit?.trim() || 'induk kelompok tanpa satuan'})
                  </label>
                  <input
                    id="ahsp-volume"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={volume}
                    onChange={(event) => {
                      setVolume(event.target.value);
                      setActionError('');
                    }}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm tabular-nums outline-none focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-emerald-800">
                    <span>Harga satuan</span>
                    <strong className="tabular-nums">{formatRupiah(unitPrice)}</strong>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-emerald-200 pt-3 text-sm text-emerald-950">
                    <span className="font-semibold">Total item</span>
                    <strong className="text-lg tabular-nums">{formatRupiah(totalPrice)}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddToQueue}
                  disabled={adding || !selectedItem.unit?.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {adding ? 'Memproses...' : queuedItems.some((item) => item.masterAhspId === selectedItem.id) ? 'Perbarui AHSP dalam Daftar' : 'Tambahkan AHSP ke Daftar'}
                </button>
              </div>
            ) : (
              <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                <Info className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">Pilih analisa AHSP</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Klik salah satu pekerjaan pada daftar untuk melihat rincian dan memasukkan volume.
                </p>
              </div>
            )}

            <section className="mt-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Daftar AHSP untuk RAB</h4>
                  <p className="text-[10px] text-slate-500">{queuedItems.length} AHSP dipilih</p>
                </div>
                <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-800">
                  {formatRupiah(queuedItems.reduce((sum, item) => sum + (Number.isFinite(item.totalPrice) ? item.totalPrice : 0), 0))}
                </span>
              </div>
              {bulkSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddSelectedToQueue}
                  disabled={adding}
                  className="m-3 inline-flex w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Tambahkan {bulkSelectedIds.length} AHSP tercentang ke daftar
                </button>
              )}
              {queuedItems.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {queuedItems.map((item) => (
                    <div key={item.masterAhspId} className="flex items-start gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] font-bold text-emerald-700">{item.code}</p>
                        <p className="mt-0.5 text-xs font-semibold leading-4 text-slate-800">{item.name}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{item.unit} · {formatRupiah(item.unitPrice)} / {item.unit}</p>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-[10px] text-slate-500">Volume</p>
                        <p className="text-xs font-bold tabular-nums text-slate-800">{Number.isFinite(item.volume) ? numberValue(item.volume).toLocaleString('id-ID') : '-'}</p>
                        <p className="mt-1 text-[10px] font-bold tabular-nums text-slate-800">
                          {formatRupiah(item.totalPrice)}
                        </p>
                        <p className="mt-1 text-[9px] text-indigo-600">Klik untuk ubah</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQueuedItems((current) => current.filter((entry) => entry.masterAhspId !== item.masterAhspId))}
                        disabled={adding}
                        className="mt-5 rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        title="Keluarkan AHSP dari daftar"
                        aria-label={`Hapus ${item.name} dari daftar`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-4 text-center text-xs text-slate-500">
                  Belum ada AHSP. Pilih analisa di sebelah kiri, isi volumenya, lalu klik Tambahkan AHSP ke Daftar.
                </p>
              )}
            </section>

            {actionError && (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSaveBatch()}
              disabled={adding || queuedItems.length === 0 || (insertionMode === 'group' && queuedItems.length > 1 && !groupName.trim())}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {adding ? 'Menyimpan seluruh AHSP...' : insertionMode === 'group' && queuedItems.length > 1 ? `Simpan ${queuedItems.length} AHSP sebagai satu kelompok` : `Simpan ${queuedItems.length} AHSP sebagai item terpisah`}
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}
