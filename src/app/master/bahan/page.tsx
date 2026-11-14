'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import {
  Layers,
  Package,
  Search,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/format';

type MaterialItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  category: string | null;
  updated_at?: string | null;
};

type FormMode = 'create' | 'edit' | 'copy';

type MaterialForm = {
  code: string;
  name: string;
  unit: string;
  unitPrice: string;
  category: string;
};

type MaterialCategoryDefinition = {
  label: string;
  prefix: string;
  description: string;
};

// Kategori baku sekaligus rumus prefix kode material.
// Format kode: PREFIX-0001, PREFIX-0002, dan seterusnya.
const MATERIAL_CATEGORIES: MaterialCategoryDefinition[] = [
  { label: 'Bahan Umum', prefix: 'UMU', description: 'Material umum yang belum masuk kelompok khusus' },
  { label: 'Semen & Perekat', prefix: 'SEM', description: 'Semen, mortar, nat, lem keramik, dan perekat' },
  { label: 'Pasir & Agregat', prefix: 'AGR', description: 'Pasir, split, kerikil, abu batu, dan agregat' },
  { label: 'Beton & Mortar', prefix: 'BET', description: 'Beton ready mix, beton pracetak, mortar siap pakai' },
  { label: 'Bata & Material Dinding', prefix: 'DND', description: 'Bata merah, hebel, batako, roster, dan panel dinding' },
  { label: 'Besi & Baja', prefix: 'BES', description: 'Besi beton, baja profil, wiremesh, dan plat' },
  { label: 'Kayu & Produk Olahan', prefix: 'KAY', description: 'Kayu, plywood, multipleks, MDF, dan papan olahan' },
  { label: 'Atap & Plafon', prefix: 'ATP', description: 'Genteng, metal roof, spandek, gypsum, dan plafon' },
  { label: 'Keramik, Granit & Batu Alam', prefix: 'KRG', description: 'Keramik, homogeneous tile, granit, marmer, dan batu alam' },
  { label: 'Cat & Finishing', prefix: 'FIN', description: 'Cat, coating, thinner, politur, dan bahan finishing' },
  { label: 'Plumbing & Sanitair', prefix: 'PLB', description: 'Pipa, fitting, kran, kloset, wastafel, dan sanitair' },
  { label: 'Listrik & Elektrikal', prefix: 'ELK', description: 'Kabel, saklar, stop kontak, lampu, dan panel listrik' },
  { label: 'Aluminium, Kaca & Aksesori', prefix: 'KAL', description: 'Aluminium, kaca, kusen, handle, dan aksesori' },
  { label: 'Waterproofing & Bahan Kimia', prefix: 'WPF', description: 'Waterproofing, bonding agent, additive, dan bahan kimia konstruksi' },
  { label: 'Pengikat & Fastener', prefix: 'PGT', description: 'Paku, sekrup, baut, dynabolt, dan angkur' },
  { label: 'Interior & Furnitur', prefix: 'INT', description: 'HPL, edging, hardware kabinet, dan material interior' },
  { label: 'Lain-lain', prefix: 'LLN', description: 'Material yang belum tersedia pada kategori di atas' },
];

// Pilihan satuan baku untuk material konstruksi. Nilai yang disimpan
// tetap berupa singkatan konsisten agar mudah dipakai di AHSP/RAB.
const MATERIAL_UNIT_GROUPS: Array<{
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    label: 'Panjang',
    options: [
      { value: 'm', label: 'Meter (m)' },
      { value: 'm1', label: "Meter lari / panjang (m')" },
      { value: 'cm', label: 'Sentimeter (cm)' },
      { value: 'mm', label: 'Milimeter (mm)' },
    ],
  },
  {
    label: 'Luas',
    options: [
      { value: 'm2', label: 'Meter persegi (m²)' },
      { value: 'cm2', label: 'Sentimeter persegi (cm²)' },
    ],
  },
  {
    label: 'Volume',
    options: [
      { value: 'm3', label: 'Meter kubik (m³)' },
      { value: 'cm3', label: 'Sentimeter kubik (cm³)' },
    ],
  },
  {
    label: 'Berat',
    options: [
      { value: 'kg', label: 'Kilogram (kg)' },
      { value: 'gr', label: 'Gram (gr)' },
      { value: 'kw', label: 'Kuintal (kw)' },
      { value: 'ton', label: 'Ton' },
    ],
  },
  {
    label: 'Cairan',
    options: [
      { value: 'ltr', label: 'Liter (ltr)' },
      { value: 'ml', label: 'Mililiter (ml)' },
      { value: 'galon', label: 'Galon' },
      { value: 'drum', label: 'Drum' },
    ],
  },
  {
    label: 'Kuantitas / Barang',
    options: [
      { value: 'bh', label: 'Buah (bh)' },
      { value: 'pcs', label: 'Pieces (pcs)' },
      { value: 'unit', label: 'Unit' },
      { value: 'btg', label: 'Batang (btg)' },
      { value: 'lbr', label: 'Lembar (lbr)' },
      { value: 'keping', label: 'Keping' },
      { value: 'potong', label: 'Potong' },
      { value: 'papan', label: 'Papan' },
      { value: 'set', label: 'Set' },
      { value: 'pasang', label: 'Pasang' },
      { value: 'titik', label: 'Titik' },
      { value: 'lubang', label: 'Lubang' },
    ],
  },
  {
    label: 'Kemasan / Pengiriman',
    options: [
      { value: 'zak', label: 'Zak' },
      { value: 'sak', label: 'Sak' },
      { value: 'karung', label: 'Karung' },
      { value: 'dus', label: 'Dus' },
      { value: 'pack', label: 'Pack' },
      { value: 'roll', label: 'Roll' },
      { value: 'ikat', label: 'Ikat' },
      { value: 'botol', label: 'Botol' },
      { value: 'kaleng', label: 'Kaleng' },
      { value: 'rit', label: 'Rit' },
      { value: 'trip', label: 'Trip' },
      { value: 'dumptruck', label: 'Dump Truck' },
      { value: 'colt', label: 'Colt' },
      { value: 'galon', label: 'Galon' },
      { value: 'ember', label: 'Ember' },
    ],
  },
  {
    label: 'Waktu / Satuan pekerjaan',
    options: [
      { value: 'jam', label: 'Jam' },
      { value: 'hari', label: 'Hari' },
      { value: 'bulan', label: 'Bulan' },
      { value: 'ls', label: 'Lump sum (ls)' },
    ],
  },
];

const MATERIAL_UNIT_VALUES = MATERIAL_UNIT_GROUPS.flatMap((group) =>
  group.options.map((option) => option.value),
);
const CUSTOM_UNIT_VALUE = '__custom__';

const DEFAULT_CATEGORY = 'Bahan Umum';
const DEFAULT_FORM: MaterialForm = {
  code: '',
  name: '',
  unit: 'm3',
  unitPrice: '0',
  category: DEFAULT_CATEGORY,
};

function getCategoryPrefix(category: string): string {
  return MATERIAL_CATEGORIES.find((item) => item.label === category)?.prefix ?? 'LLN';
}

async function generateNextMaterialCode(category: string): Promise<string> {
  const prefix = getCategoryPrefix(category);
  const { data, error } = await supabase
    .from('master_materials')
    .select('code')
    .ilike('code', `${prefix}-%`)
    .limit(5000);

  if (error) throw error;

  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const maxNumber = (data ?? []).reduce((maximum, row) => {
    const match = String(row.code ?? '').match(pattern);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(4, '0')}`;
}

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

export default function MasterBahanPage() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [form, setForm] = useState<MaterialForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [codeGenerating, setCodeGenerating] = useState(false);
  const codeRequestRef = useRef(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');


const loadMaterials = useCallback(async (showRefreshState = false) => {
  if (showRefreshState) setRefreshing(true);
  else setLoading(true);

  setErrorMessage('');

  try {
    const PAGE_SIZE = 1000;
    let from = 0;
    const allMaterials: MaterialItem[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('master_materials')
        .select('id, code, name, unit, unit_price, category, updated_at')
        .order('code', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data ?? []) as MaterialItem[];

      // Berhenti ketika tidak ada data lagi.
      if (page.length === 0) break;

      allMaterials.push(...page);

      // Gunakan jumlah data yang benar-benar diterima
      // sebagai offset halaman berikutnya.
      from += page.length;
    }

    setMaterials(allMaterials);
  } catch (error) {
    console.error('Gagal memuat master bahan:', error);
    setErrorMessage(
      `Gagal memuat data bahan: ${getErrorMessage(error)}`
    );
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);


  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setIsModalOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, submitting]);

  const categories = useMemo(() => {
    const uniqueCategories = new Set(
      materials.map((item) => item.category?.trim() || DEFAULT_CATEGORY),
    );
    return ['ALL', ...Array.from(uniqueCategories).sort((a, b) => a.localeCompare(b, 'id'))];
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');

    return materials.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.name.toLocaleLowerCase('id').includes(keyword) ||
        item.code.toLocaleLowerCase('id').includes(keyword) ||
        (item.category ?? DEFAULT_CATEGORY).toLocaleLowerCase('id').includes(keyword);

      const matchesCategory =
        selectedCategory === 'ALL' ||
        (item.category?.trim() || DEFAULT_CATEGORY) === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [materials, search, selectedCategory]);

  const updateForm = (field: keyof MaterialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const generateAndSetCode = async (category: string) => {
    const requestId = ++codeRequestRef.current;
    setCodeGenerating(true);
    setErrorMessage('');

    try {
      const nextCode = await generateNextMaterialCode(category);
      if (requestId === codeRequestRef.current) {
        setForm((current) => ({ ...current, category, code: nextCode }));
      }
    } catch (error) {
      console.error('Gagal membentuk kode material:', error);
      if (requestId === codeRequestRef.current) {
        setForm((current) => ({ ...current, category, code: '' }));
        setErrorMessage(`Kode otomatis belum dapat dibuat: ${getErrorMessage(error)}. Periksa izin SELECT tabel master_materials.`);
      }
    } finally {
      if (requestId === codeRequestRef.current) setCodeGenerating(false);
    }
  };

  const handleCategoryChange = (category: string) => {
    // Set kode kosong lebih dahulu agar kode kategori sebelumnya tidak ikut tersimpan.
    setForm((current) => ({ ...current, category, code: '' }));
    void generateAndSetCode(category);
  };

  const openCreateModal = () => {
    setFormMode('create');
    setEditingItem(null);
    setForm(DEFAULT_FORM);
    setErrorMessage('');
    setIsModalOpen(true);
    void generateAndSetCode(DEFAULT_CATEGORY);
  };

  const openEditModal = (item: MaterialItem) => {
    codeRequestRef.current += 1;
    setCodeGenerating(false);
    setFormMode('edit');
    setEditingItem(item);
    setForm({
      code: item.code,
      name: item.name,
      unit: item.unit,
      unitPrice: String(item.unit_price ?? 0),
      category: item.category || DEFAULT_CATEGORY,
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const openCopyModal = (item: MaterialItem) => {
    const category = item.category || DEFAULT_CATEGORY;
    setFormMode('copy');
    setEditingItem(null);
    setForm({
      code: '',
      name: `${item.name} (Salinan)`,
      unit: item.unit,
      unitPrice: String(item.unit_price ?? 0),
      category,
    });
    setErrorMessage('');
    setIsModalOpen(true);
    void generateAndSetCode(category);
  };

  const closeModal = () => {
    if (submitting) return;
    codeRequestRef.current += 1;
    setCodeGenerating(false);
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || codeGenerating) return;

    const cleanName = form.name.trim();
    const cleanUnit = form.unit.trim();
    const cleanCategory = form.category.trim();
    const price = Number(form.unitPrice);

    if (!cleanName || !cleanUnit || !cleanCategory) {
      setErrorMessage('Nama material, satuan, dan kategori wajib diisi.');
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setErrorMessage('Harga satuan harus berupa angka yang valid dan tidak boleh negatif.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      // Kode dibuat ulang tepat sebelum simpan untuk mengurangi risiko nomor ganda.
      // Saat edit tanpa perubahan kategori, kode lama tetap dipertahankan.
      const categoryChanged = Boolean(
        formMode === 'edit' && editingItem &&
        (editingItem.category || DEFAULT_CATEGORY) !== cleanCategory,
      );
      let finalCode = form.code.trim();
      if (formMode !== 'edit' || categoryChanged || !finalCode) {
        finalCode = await generateNextMaterialCode(cleanCategory);
      }

      if (!finalCode) throw new Error('Kode material otomatis tidak berhasil dibuat.');

      let duplicateQuery = supabase
        .from('master_materials')
        .select('id')
        .eq('code', finalCode)
        .limit(1);
      if (formMode === 'edit' && editingItem) {
        duplicateQuery = duplicateQuery.neq('id', editingItem.id);
      }
      const { data: duplicateRows, error: duplicateCheckError } = await duplicateQuery;
      if (duplicateCheckError) throw duplicateCheckError;
      if ((duplicateRows ?? []).length > 0) {
        // Kode mungkin baru dipakai oleh pengguna lain setelah daftar dimuat.
        finalCode = await generateNextMaterialCode(cleanCategory);
      }

      const payload = {
        code: finalCode,
        name: cleanName,
        unit: cleanUnit,
        unit_price: price,
        category: cleanCategory,
      };

      if (formMode === 'edit' && editingItem) {
        const { error } = await supabase
          .from('master_materials')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingItem.id);
        if (error) throw error;
        setSuccessMessage('Data bahan berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('master_materials').insert(payload);
        if (error) throw error;
        setSuccessMessage(
          formMode === 'copy'
            ? `Duplikasi bahan berhasil disimpan dengan kode ${finalCode}.`
            : `Bahan baru berhasil ditambahkan dengan kode ${finalCode}.`,
        );
      }

      setIsModalOpen(false);
      setEditingItem(null);
      await loadMaterials(true);
    } catch (error) {
      console.error('Gagal menyimpan bahan:', error);
      const message = getErrorMessage(error);
      setErrorMessage(
        message.toLowerCase().includes('duplicate') || message.includes('23505')
          ? 'Kode bahan sudah terdaftar. Silakan simpan kembali agar sistem membentuk nomor berikutnya.'
          : `Gagal menyimpan bahan: ${message}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: MaterialItem) => {
    const confirmed = window.confirm(
      `Hapus bahan "${item.name}" (${item.code}) dari database?\n\nTindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed || deletingId) return;

    setDeletingId(item.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase
        .from('master_materials')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      setMaterials((current) => current.filter((material) => material.id !== item.id));
      setSuccessMessage(`Bahan "${item.name}" berhasil dihapus.`);
    } catch (error) {
      console.error('Gagal menghapus bahan:', error);
      setErrorMessage(`Gagal menghapus bahan: ${getErrorMessage(error)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('ALL');
  };

  const modalTitle =
    formMode === 'edit'
      ? 'Edit Master Bahan'
      : formMode === 'copy'
        ? 'Duplikasi Master Bahan'
        : 'Tambah Bahan Baru';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Database Pusat · Manajemen Harga Material</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Master Bahan & Material
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Kelola data material dan harga satuan yang digunakan sebagai referensi
            perhitungan AHSP.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadMaterials(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Segarkan
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Bahan
          </button>
        </div>
      </header>

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
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1">{errorMessage || successMessage}</p>
          <button
            type="button"
            onClick={() => {
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="rounded p-0.5 opacity-70 transition hover:opacity-100"
            aria-label="Tutup notifikasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Cari kode, nama, atau kategori bahan..."
                value={search}
                onChange={handleSearchChange}
                aria-label="Cari material"
                className={`${inputClassName} bg-slate-50 pl-9`}
              />
            </div>

            <div className="relative w-full sm:w-64">
              <SlidersHorizontal
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                aria-label="Filter kategori"
                className={`${inputClassName} appearance-none bg-slate-50 pl-9`}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'ALL' ? 'Semua Kategori' : category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 lg:justify-end">
            <span>
              Menampilkan{' '}
              <strong className="font-semibold text-slate-800">
                {filteredMaterials.length}
              </strong>{' '}
              dari {materials.length} material
            </span>
            {(search || selectedCategory !== 'ALL') && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Reset filter
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="w-32 px-5 py-4">Kode</th>
                <th scope="col" className="px-5 py-4">Nama Material</th>
                <th scope="col" className="w-24 px-4 py-4 text-center">Satuan</th>
                <th scope="col" className="w-48 px-5 py-4">Kategori</th>
                <th scope="col" className="w-48 px-5 py-4 text-right">Harga Satuan</th>
                <th scope="col" className="w-36 px-5 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-600" />
                    Memuat data master bahan...
                  </td>
                </tr>
              ) : filteredMaterials.length > 0 ? (
                filteredMaterials.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-slate-600">
                      {item.code}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex max-w-full rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                        {item.category || DEFAULT_CATEGORY}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums text-slate-900">
                      {formatRupiah(Number(item.unit_price ?? 0))}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openCopyModal(item)}
                          title="Duplikasi material"
                          aria-label={`Duplikasi ${item.name}`}
                          className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit material"
                          aria-label={`Edit ${item.name}`}
                          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          disabled={deletingId === item.id}
                          title="Hapus material"
                          aria-label={`Hapus ${item.name}`}
                          className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Package className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      {materials.length === 0
                        ? 'Belum ada data material'
                        : 'Material tidak ditemukan'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {materials.length === 0
                        ? 'Tambahkan material pertama untuk mulai membangun database harga.'
                        : 'Coba ubah kata kunci atau kategori pencarian.'}
                    </p>
                    {materials.length === 0 ? (
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <Plus className="h-4 w-4" />
                        Tambah Material
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Reset pencarian
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-modal-title"
            className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <h2 id="material-modal-title" className="font-bold text-slate-900">
                  {modalTitle}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pilih kategori; sistem membentuk kode material secara otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Tutup formulir"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5 p-6">
              {errorMessage && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="material-code" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Kode Bahan Otomatis
                  </label>
                  <input
                    id="material-code"
                    type="text"
                    readOnly
                    value={form.code}
                    placeholder={codeGenerating ? 'Membentuk kode...' : 'Kode dibuat otomatis'}
                    className={`${inputClassName} cursor-not-allowed bg-slate-100 font-mono font-bold tracking-wide text-emerald-800`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {codeGenerating
                      ? 'Sedang mengambil nomor urut dari database...'
                      : `Format: ${getCategoryPrefix(form.category)}-0001, ${getCategoryPrefix(form.category)}-0002, dan seterusnya.`}
                  </p>
                </div>

                <div>
                  <label htmlFor="material-unit" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Satuan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="material-unit"
                    required
                    value={MATERIAL_UNIT_VALUES.includes(form.unit) ? form.unit : CUSTOM_UNIT_VALUE}
                    onChange={(event) =>
                      updateForm(
                        'unit',
                        event.target.value === CUSTOM_UNIT_VALUE ? '' : event.target.value,
                      )
                    }
                    className={inputClassName}
                  >
                    <option value="">Pilih satuan</option>
                    {MATERIAL_UNIT_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value={CUSTOM_UNIT_VALUE}>Lainnya — isi satuan sendiri</option>
                  </select>
                  {!MATERIAL_UNIT_VALUES.includes(form.unit) && (
                    <div className="mt-2">
                      <label htmlFor="material-unit-custom" className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Tulis satuan khusus <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="material-unit-custom"
                        type="text"
                        required
                        maxLength={20}
                        placeholder="Contoh: m1/hari atau batang/paket"
                        value={form.unit}
                        onChange={(event) => updateForm('unit', event.target.value)}
                        className={inputClassName}
                      />
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Pilih satuan baku agar konsisten dalam AHSP. Satuan lama atau satuan khusus tetap dapat digunakan melalui pilihan Lainnya.
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="material-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Nama Material / Bahan <span className="text-rose-500">*</span>
                </label>
                <input
                  id="material-name"
                  type="text"
                  required
                  maxLength={150}
                  placeholder="Contoh: Kayu Jati / Semen Portland"
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  className={inputClassName}
                />
              </div>

              <div>
                <label htmlFor="material-category" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Kategori Bahan <span className="text-rose-500">*</span>
                </label>
                <select
                  id="material-category"
                  required
                  value={form.category}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className={inputClassName}
                >
                  {MATERIAL_CATEGORIES.map((category) => (
                    <option key={category.label} value={category.label}>
                      {category.label} ({category.prefix})
                    </option>
                  ))}
                  {form.category && !MATERIAL_CATEGORIES.some((category) => category.label === form.category) && (
                    <option value={form.category}>
                      {form.category} (kategori lama · LLN)
                    </option>
                  )}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {MATERIAL_CATEGORIES.find((category) => category.label === form.category)?.description
                    ?? 'Kategori lama dipertahankan; kode baru menggunakan prefix LLN.'}
                </p>
              </div>

              <div>
                <label htmlFor="material-price" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Harga Satuan (Rupiah) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    Rp
                  </span>
                  <input
                    id="material-price"
                    type="number"
                    min="0"
                    step="any"
                    required
                    inputMode="decimal"
                    value={form.unitPrice}
                    onChange={(event) => updateForm('unitPrice', event.target.value)}
                    className={`${inputClassName} pl-10 text-right tabular-nums`}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Masukkan harga per satuan material, tanpa pemisah ribuan.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || codeGenerating || !form.code}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {submitting ? 'Menyimpan...' : codeGenerating ? 'Membentuk Kode...' : 'Simpan Material'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
