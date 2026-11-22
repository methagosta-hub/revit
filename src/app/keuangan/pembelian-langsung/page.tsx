'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  Banknote,
  ArrowRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  LoaderCircle,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import {
  fetchDirectMaterialPurchases,
  fetchDirectPurchaseDivisions,
  fetchDirectPurchaseSetup,
  recordDirectMaterialPurchase,
  voidDirectMaterialPurchase,
  type DirectMaterialPurchase,
  type DirectMaterialPurchaseInput,
  type DirectMaterialPurchaseLineInput,
  type DirectPurchaseDivision,
  type DirectPurchaseMethod,
  type DirectPurchaseProject,
  type DirectPurchaseSupplier,
  type DirectPurchaseMaterial,
} from '@/lib/services/directMaterialPurchaseService';

const DRAFT_KEY = 'dahlia:direct-material-purchase:draft:v1';
const money = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const labelClass = 'block text-sm font-semibold text-slate-700';

interface PurchaseForm {
  project_id: string;
  rab_division_id: string;
  purchase_date: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  payment_method: DirectPurchaseMethod;
  reference_number: string;
  notes: string;
  items: DirectMaterialPurchaseLineInput[];
}

function emptyLine(): DirectMaterialPurchaseLineInput {
  return {
    material_id: null,
    material_code: '',
    material_name: '',
    unit: 'pcs',
    quantity_received: 1,
    quantity_damaged: 0,
    unit_price: 0,
    notes: '',
  };
}

function emptyForm(): PurchaseForm {
  return {
    project_id: '', rab_division_id: '', purchase_date: today(),
    supplier_id: '', supplier_name: '', invoice_number: '',
    payment_method: 'bank_transfer', reference_number: '', notes: '',
    items: [emptyLine()],
  };
}

function DirectMaterialPurchaseContent() {
  const [projects, setProjects] = useState<DirectPurchaseProject[]>([]);
  const [suppliers, setSuppliers] = useState<DirectPurchaseSupplier[]>([]);
  const [materials, setMaterials] = useState<DirectPurchaseMaterial[]>([]);
  const [divisions, setDivisions] = useState<DirectPurchaseDivision[]>([]);
  const [rows, setRows] = useState<DirectMaterialPurchase[]>([]);
  const [form, setForm] = useState<PurchaseForm>(emptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [materialPickerIndex, setMaterialPickerIndex] = useState<number | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialCategory, setMaterialCategory] = useState('all');
  const [draftReady, setDraftReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'void'>('all');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [setup, purchases] = await Promise.all([
        fetchDirectPurchaseSetup(),
        fetchDirectMaterialPurchases(),
      ]);
      setProjects(setup.projects);
      setSuppliers(setup.suppliers);
      setMaterials(setup.materials);
      setRows(purchases);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Data pembelian langsung gagal dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Restore the in-progress form only after mount, then persist every edit in this tab session.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PurchaseForm>;
        setForm({ ...emptyForm(), ...saved, items: Array.isArray(saved.items) && saved.items.length ? saved.items : [emptyLine()] });
        setFormOpen(true);
      }
    } catch {
      try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* Browser storage may be disabled. */ }
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady || !formOpen) return;
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* Browser storage may be disabled. */ }
  }, [form, draftReady, formOpen]);

  useEffect(() => {
    let active = true;
    if (!form.project_id) {
      setDivisions([]);
      return () => { active = false; };
    }
    void fetchDirectPurchaseDivisions(form.project_id)
      .then((items) => { if (active) setDivisions(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Divisi proyek gagal dimuat.'); });
    return () => { active = false; };
  }, [form.project_id]);

  const total = useMemo(() => form.items.reduce((sum, item) => {
    const quantity = Number(item.quantity_received) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    return sum + quantity * unitPrice;
  }, 0), [form.items]);

  const activeRows = rows.filter((row) => row.status === 'confirmed');
  const totalPurchases = activeRows.reduce((sum, row) => sum + row.total_amount, 0);
  const filteredRows = rows.filter((row) => {
    const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
    const term = search.trim().toLocaleLowerCase('id-ID');
    const matchesSearch = !term || [
      row.purchase_number, row.project_title, row.supplier_name,
      row.invoice_number ?? '', ...row.items.map((item) => item.material_name),
    ].join(' ').toLocaleLowerCase('id-ID').includes(term);
    return matchesStatus && matchesSearch;
  });

  const materialCategories = useMemo(
    () => [...new Set(materials.map((item) => item.category?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'id')),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    const term = materialSearch.trim().toLocaleLowerCase('id-ID');
    return materials.filter((item) => {
      const matchesCategory = materialCategory === 'all' || item.category === materialCategory;
      const haystack = [item.code, item.name, item.unit, item.category ?? ''].join(' ').toLocaleLowerCase('id-ID');
      return matchesCategory && (!term || haystack.includes(term));
    });
  }, [materials, materialSearch, materialCategory]);

  const updateForm = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateLine = (index: number, key: keyof DirectMaterialPurchaseLineInput, value: string | number | null) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, [key]: value }
        : item),
    }));
  };

  const selectCatalogMaterial = (index: number, materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? material
          ? { ...item, material_id: material.id, material_code: material.code, material_name: material.name, unit: material.unit, unit_price: material.unit_price }
          : { ...item, material_id: null }
        : item),
    }));
    setMaterialPickerIndex(null);
    setMaterialSearch('');
    setMaterialCategory('all');
  };

  const openMaterialPicker = (index: number) => {
    setMaterialPickerIndex(index);
    setMaterialSearch('');
    setMaterialCategory('all');
  };

  const continueWizard = () => {
    setError('');
    if (wizardStep === 0) {
      if (!form.project_id) return setError('Pilih proyek tujuan terlebih dahulu.');
      if (!form.purchase_date) return setError('Tanggal pembelian wajib diisi.');
      if (!form.supplier_name.trim()) return setError('Nama supplier wajib diisi.');
      setWizardStep(1);
      return;
    }
    if (wizardStep === 1) {
      const invalidLine = form.items.findIndex((item) =>
        !item.material_name.trim() || !item.unit.trim() ||
        Number(item.quantity_received) <= 0 ||
        Number(item.quantity_damaged) < 0 ||
        Number(item.quantity_damaged) > Number(item.quantity_received) ||
        Number(item.unit_price) < 0
      );
      if (invalidLine >= 0) return setError(`Periksa kembali rincian Material ${invalidLine + 1}. Nama, satuan, jumlah, dan harga harus valid.`);
      if (total <= 0) return setError('Total pembelian harus lebih besar dari nol.');
      setWizardStep(2);
    }
  };

  const addLine = () => setForm((current) => ({ ...current, items: [...current.items, emptyLine()] }));
  const removeLine = (index: number) => setForm((current) => ({
    ...current,
    items: current.items.length <= 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index),
  }));

  const canSave = Boolean(form.project_id && form.supplier_name.trim())
    && form.items.length > 0
    && form.items.every((item) => item.material_name.trim() && item.unit.trim()
      && Number(item.quantity_received) > 0
      && Number(item.quantity_damaged) >= 0
      && Number(item.quantity_damaged) <= Number(item.quantity_received)
      && Number(item.unit_price) >= 0)
    && total > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: DirectMaterialPurchaseInput = {
        project_id: form.project_id,
        purchase_date: form.purchase_date,
        supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name.trim(),
        rab_division_id: form.rab_division_id || null,
        invoice_number: form.invoice_number.trim(),
        payment_method: form.payment_method,
        reference_number: form.reference_number.trim(),
        notes: form.notes.trim(),
        items: form.items.map((item) => ({
          material_id: item.material_id ?? null,
          material_code: item.material_code?.trim() || null,
          material_name: item.material_name.trim(),
          unit: item.unit.trim(),
          quantity_received: Number(item.quantity_received),
          quantity_damaged: Number(item.quantity_damaged || 0),
          unit_price: Number(item.unit_price),
          notes: item.notes?.trim() || null,
        })),
      };
      const result = await recordDirectMaterialPurchase(payload);
      try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* The saved transaction is already committed. */ }
      setForm(emptyForm());
      setFormOpen(false);
      setSuccess(`Pembelian ${result.purchase_number} berhasil dicatat. Kas keluar ${money(result.total_amount)} otomatis masuk ke rekap keuangan dan stok proyek bertambah.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pembelian material gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelPurchase(item: DirectMaterialPurchase) {
    const reason = window.prompt(`Alasan pembatalan ${item.purchase_number}:`);
    if (!reason?.trim()) return;
    setError('');
    setSuccess('');
    try {
      await voidDirectMaterialPurchase(item.id, reason);
      setSuccess(`${item.purchase_number} dibatalkan. Mutasi kas keluar ikut dibatalkan dan stok dikoreksi otomatis.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pembelian gagal dibatalkan.');
    }
  }

  function startNewForm() {
    const hasDraft = Boolean(form.project_id || form.supplier_name.trim() || form.invoice_number.trim()
      || form.items.some((item) => item.material_name.trim() || Number(item.unit_price) > 0));
    if (hasDraft && !window.confirm('Ada isian pembelian yang belum disimpan. Ganti dengan formulir baru?')) return;
    setError('');
    setSuccess('');
    setForm(emptyForm());
    setWizardStep(0);
    setFormOpen(true);
  }

  function discardDraft() {
    if (!window.confirm('Buang seluruh isian pembelian yang belum disimpan?')) return;
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* Browser storage may be disabled. */ }
    setForm(emptyForm());
    setFormOpen(false);
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700">Keuangan / Pengadaan Material</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Pembelian Material Langsung</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Catat pembelian material proyek tanpa menunggu Purchase Order. Pembelian langsung dibukukan ke kas keluar dan menambah stok material yang diterima.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <button type="button" onClick={startNewForm} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Pembelian baru
          </button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><ClipboardList className="h-4 w-4" /> Transaksi aktif</div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{activeRows.length}</p>
          <p className="mt-1 text-xs text-slate-500">Pembelian langsung tercatat</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800"><ArrowDownRight className="h-4 w-4" /> Kas keluar</div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-emerald-950">{money(totalPurchases)}</p>
          <p className="mt-1 text-xs text-emerald-800">Nilai transaksi aktif</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Boxes className="h-4 w-4" /> Jenis material</div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{new Set(activeRows.flatMap((row) => row.items.map((item) => item.material_name.toLowerCase()))).size}</p>
          <p className="mt-1 text-xs text-slate-500">Nama material unik pada transaksi aktif</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-800"><ShieldCheck className="h-4 w-4" /> Hak akses</div>
          <p className="mt-2 text-base font-extrabold text-blue-950">Keuangan · Direktur/Owner</p>
          <p className="mt-1 text-xs text-blue-800">Admin juga dapat mengelola</p>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-bold">Alur pembelian langsung</p>
        <p className="mt-1 leading-6">Pilih proyek dan supplier → masukkan material serta jumlah yang benar-benar diterima → masukkan bukti pembayaran → simpan. Sistem membuat catatan pembelian, kas keluar, dan penambahan stok secara bersamaan. Tidak ada PO yang dibuat.</p>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-5">
          <form onSubmit={submit} className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-2xl">
            <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-5 py-5 text-white sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full border-[28px] border-white/5" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                    <Sparkles className="h-3.5 w-3.5" /> Pembelian langsung · Tanpa PO
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">Buat transaksi pembelian</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-50/80 sm:text-sm">Ikuti tiga langkah singkat. Draft tersimpan otomatis pada sesi browser ini.</p>
                </div>
                <button type="button" onClick={() => setFormOpen(false)} aria-label="Tutup formulir" className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/20">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mt-6 grid grid-cols-3 gap-2">
                {[
                  { title: 'Informasi', note: 'Proyek & supplier', icon: Building2 },
                  { title: 'Material', note: `${form.items.length} baris barang`, icon: Boxes },
                  { title: 'Pembayaran', note: 'Periksa & simpan', icon: CreditCard },
                ].map((step, index) => {
                  const Icon = step.icon;
                  const active = wizardStep === index;
                  const done = wizardStep > index;
                  return (
                    <div key={step.title} className={`rounded-2xl border px-3 py-2.5 transition sm:px-4 sm:py-3 ${active ? 'border-white/40 bg-white text-slate-950 shadow-lg' : done ? 'border-emerald-300/30 bg-emerald-400/15 text-white' : 'border-white/10 bg-white/5 text-emerald-100/65'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-emerald-100 text-emerald-800' : done ? 'bg-emerald-300/20 text-emerald-100' : 'bg-white/10 text-white/70'}`}>
                          {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold sm:text-sm">{step.title}</p>
                          <p className={`hidden truncate text-[10px] sm:block ${active ? 'text-slate-500' : 'text-current opacity-70'}`}>{step.note}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
              {wizardStep === 0 && (
                <section className="mx-auto max-w-4xl space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-800"><Building2 className="h-5 w-5" /></div>
                    <div><h3 className="text-lg font-extrabold text-slate-900">Informasi pembelian</h3><p className="mt-1 text-sm text-slate-500">Tentukan proyek dan pemasok agar transaksi tercatat pada unit kerja yang benar.</p></div>
                  </div>
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5">
                    <label className={labelClass}>Proyek tujuan *
                      <select required value={form.project_id} onChange={(event) => { updateForm('project_id', event.target.value); updateForm('rab_division_id', ''); }} className={inputClass}>
                        <option value="">Pilih proyek</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>Divisi / lokasi RAB
                      <select value={form.rab_division_id} onChange={(event) => updateForm('rab_division_id', event.target.value)} disabled={!form.project_id} className={inputClass}>
                        <option value="">Belum dialokasikan</option>
                        {divisions.map((division) => <option key={division.id} value={division.id}>{division.code ? `${division.code} · ` : ''}{division.name}</option>)}
                      </select>
                      <span className="mt-1 block text-[11px] font-normal text-slate-400">Opsional. Bisa dialokasikan kemudian melalui rekap keuangan.</span>
                    </label>
                    <label className={labelClass}>Tanggal pembelian *
                      <input required type="date" value={form.purchase_date} onChange={(event) => updateForm('purchase_date', event.target.value)} className={inputClass} />
                    </label>
                    <label className={labelClass}>Supplier terdaftar
                      <select value={form.supplier_id} onChange={(event) => {
                        const supplier = suppliers.find((item) => item.id === event.target.value);
                        setForm((current) => ({ ...current, supplier_id: event.target.value, supplier_name: supplier?.name ?? (event.target.value ? current.supplier_name : '') }));
                      }} className={inputClass}>
                        <option value="">Pilih supplier atau isi manual</option>
                        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>Nama supplier *
                      <input required maxLength={255} value={form.supplier_name} onChange={(event) => { updateForm('supplier_name', event.target.value); if (form.supplier_id) updateForm('supplier_id', ''); }} className={inputClass} placeholder="Nama toko / pemasok" />
                    </label>
                    <label className={labelClass}>Nomor invoice / nota
                      <input maxLength={120} value={form.invoice_number} onChange={(event) => updateForm('invoice_number', event.target.value)} className={inputClass} placeholder="Nomor nota pembelian (opsional)" />
                    </label>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                    <p className="text-xs leading-5">Pembelian ini tidak membuat Purchase Order. Catatan pembelian, kas keluar, dan penerimaan stok diproses sebagai satu transaksi.</p>
                  </div>
                </section>
              )}

              {wizardStep === 1 && (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-violet-100 p-3 text-violet-800"><Boxes className="h-5 w-5" /></div>
                      <div><h3 className="text-lg font-extrabold text-slate-900">Rincian material</h3><p className="mt-1 text-sm text-slate-500">Cari nama atau kode material. Pilih dari katalog tanpa harus menelusuri daftar panjang.</p></div>
                    </div>
                    <button type="button" onClick={addLine} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100">
                      <Plus className="h-4 w-4" /> Tambah material
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, index) => {
                      const lineTotal = (Number(item.quantity_received) || 0) * (Number(item.unit_price) || 0);
                      const accepted = Math.max(0, (Number(item.quantity_received) || 0) - (Number(item.quantity_damaged) || 0));
                      return (
                        <article key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-extrabold text-white">{String(index + 1).padStart(2, '0')}</span>
                              <div><p className="text-sm font-extrabold text-slate-900">Material {index + 1}</p><p className="text-[11px] text-slate-500">{item.material_id ? 'Terhubung dengan Master Bahan' : 'Input manual / belum dipilih dari katalog'}</p></div>
                            </div>
                            <button type="button" onClick={() => removeLine(index)} disabled={form.items.length <= 1} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /> Hapus</button>
                          </div>
                          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.8fr)]">
                            <div className="space-y-3">
                              <button type="button" onClick={() => openMaterialPicker(index)} className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/70 p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm"><PackageSearch className="h-5 w-5" /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Katalog Master Bahan</span>
                                  <span className="mt-0.5 block truncate text-sm font-extrabold text-slate-900">{item.material_name || 'Cari & pilih material'}</span>
                                  <span className="mt-0.5 block text-[11px] text-slate-500">{item.material_code ? `${item.material_code} · ${item.unit}` : 'Gunakan pencarian nama, kode, satuan, atau kategori'}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 transition group-hover:translate-x-0.5">Cari <ArrowRight className="h-3.5 w-3.5" /></span>
                              </button>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_130px]">
                                <label className={labelClass}>Nama material *
                                  <input required maxLength={255} value={item.material_name} onChange={(event) => { updateLine(index, 'material_name', event.target.value); updateLine(index, 'material_id', null); }} className={inputClass} placeholder="Contoh: Semen Portland" />
                                </label>
                                <label className={labelClass}>Kode material
                                  <input maxLength={100} value={item.material_code ?? ''} onChange={(event) => { updateLine(index, 'material_code', event.target.value); updateLine(index, 'material_id', null); }} className={inputClass} placeholder="Opsional" />
                                </label>
                                <label className={labelClass}>Satuan *
                                  <input required maxLength={50} value={item.unit} onChange={(event) => { updateLine(index, 'unit', event.target.value); updateLine(index, 'material_id', null); }} className={inputClass} placeholder="sak / pcs / m³" />
                                </label>
                              </div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3.5">
                              <div className="grid grid-cols-2 gap-3">
                                <label className={labelClass}>Diterima *
                                  <input required type="number" min="0.001" step="0.001" value={item.quantity_received} onChange={(event) => updateLine(index, 'quantity_received', Number(event.target.value))} className={inputClass} />
                                </label>
                                <label className={labelClass}>Rusak / ditolak
                                  <input type="number" min="0" step="0.001" value={item.quantity_damaged} onChange={(event) => updateLine(index, 'quantity_damaged', Number(event.target.value))} className={inputClass} />
                                </label>
                                <label className={`${labelClass} col-span-2`}>Harga satuan (Rp) *
                                  <input required type="number" min="0" step="1" value={item.unit_price} onChange={(event) => updateLine(index, 'unit_price', Number(event.target.value))} className={inputClass} />
                                </label>
                              </div>
                              <div className="mt-3 rounded-xl bg-white p-3">
                                <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold text-slate-500">Subtotal baris</span><strong className="text-sm font-extrabold tabular-nums text-slate-950">{money(lineTotal)}</strong></div>
                                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[11px] text-slate-500">Masuk stok</span><strong className="text-xs font-bold text-emerald-700">{accepted.toLocaleString('id-ID')} {item.unit || 'satuan'}</strong></div>
                              </div>
                              {Number(item.quantity_damaged) > Number(item.quantity_received) && <p className="mt-2 text-[11px] font-semibold text-rose-700">Jumlah rusak tidak boleh melebihi jumlah diterima.</p>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">{form.items.length} baris material · volume diterima akan menambah stok setelah dikurangi jumlah rusak.</p>
                    <p className="text-base font-extrabold tabular-nums text-slate-900">{money(total)}</p>
                  </div>
                </section>
              )}

              {wizardStep === 2 && (
                <section className="mx-auto max-w-4xl space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-amber-100 p-3 text-amber-800"><CreditCard className="h-5 w-5" /></div>
                    <div><h3 className="text-lg font-extrabold text-slate-900">Pembayaran & konfirmasi</h3><p className="mt-1 text-sm text-slate-500">Periksa total dan pastikan pembelian sudah dibayar sebelum disimpan.</p></div>
                  </div>
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="mb-2 text-xs font-bold text-slate-600">Metode pembayaran *</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { value: 'bank_transfer', label: 'Transfer bank', icon: CreditCard },
                          { value: 'cash', label: 'Tunai', icon: Banknote },
                          { value: 'other', label: 'Lainnya', icon: FileText },
                        ].map((method) => {
                          const Icon = method.icon;
                          const active = form.payment_method === method.value;
                          return <button key={method.value} type="button" onClick={() => updateForm('payment_method', method.value as DirectPurchaseMethod)} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-bold transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-100' : 'border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{method.label}{active && <Check className="ml-auto h-4 w-4" />}</button>;
                        })}
                      </div>
                    </div>
                    <label className={labelClass}>Nomor referensi pembayaran
                      <input maxLength={120} value={form.reference_number} onChange={(event) => updateForm('reference_number', event.target.value)} className={inputClass} placeholder="No. transfer / bukti pembayaran" />
                    </label>
                    <label className={labelClass}>Catatan transaksi
                      <input maxLength={1000} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} className={inputClass} placeholder="Keterangan tambahan (opsional)" />
                    </label>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div><p className="text-sm font-extrabold text-slate-900">Ringkasan transaksi</p><p className="text-[11px] text-slate-500">{form.supplier_name} · {projects.find((item) => item.id === form.project_id)?.title ?? 'Proyek'}</p></div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">Tanpa PO</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {form.items.map((item, index) => <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                        <div className="min-w-0"><p className="truncate font-bold text-slate-800">{item.material_name || `Material ${index + 1}`}</p><p className="mt-0.5 text-slate-500">{item.quantity_received} {item.unit} × {money(Number(item.unit_price))}</p></div>
                        <strong className="shrink-0 tabular-nums text-slate-900">{money(Number(item.quantity_received) * Number(item.unit_price))}</strong>
                      </div>)}
                    </div>
                    <div className="grid gap-3 bg-slate-950 p-4 text-white sm:grid-cols-3">
                      <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total pembelian</p><p className="mt-1 text-lg font-extrabold tabular-nums">{money(total)}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Kas keluar</p><p className="mt-1 text-lg font-extrabold tabular-nums">{money(total)}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Masuk stok</p><p className="mt-1 text-lg font-extrabold">{form.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity_received) - Number(item.quantity_damaged)), 0).toLocaleString('id-ID')} unit-item</p></div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
                    <p>Pembelian ini dianggap sudah dibayar. Saat disimpan, sistem membuat satu transaksi kas keluar untuk rekap keuangan. Material rusak/ditolak tercatat tetapi tidak menambah stok.</p>
                  </div>
                </section>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-7">
              <button type="button" onClick={wizardStep === 0 ? discardDraft : () => { setError(''); setWizardStep((step) => Math.max(0, step - 1)); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                {wizardStep === 0 ? <Trash2 className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                {wizardStep === 0 ? 'Buang draft' : 'Kembali'}
              </button>
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-slate-400 sm:inline">Langkah {wizardStep + 1} dari 3</span>
                {wizardStep < 2 ? (
                  <button type="button" onClick={continueWizard} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800">
                    Lanjut <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="submit" disabled={saving || !canSave} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Menyimpan...' : 'Konfirmasi & simpan pembelian'}
                  </button>
                )}
              </div>
            </footer>

            {materialPickerIndex !== null && (
              <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-5">
                <section role="dialog" aria-modal="true" aria-labelledby="material-picker-title" className="flex max-h-[88%] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-white shadow-2xl">
                  <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
                    <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">Master bahan</p><h3 id="material-picker-title" className="mt-1 text-lg font-extrabold text-slate-900">Cari material</h3><p className="mt-1 text-xs text-slate-500">Ketik nama atau kode. Hasil langsung menyaring katalog.</p></div>
                    <button type="button" onClick={() => setMaterialPickerIndex(null)} aria-label="Tutup katalog" className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"><X className="h-4 w-4" /></button>
                  </header>
                  <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-700" />
                      <input autoFocus value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Cari nama material, kode, satuan..." className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/60 py-3.5 pl-12 pr-11 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" />
                      {materialSearch && <button type="button" onClick={() => setMaterialSearch('')} aria-label="Hapus pencarian" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-white"><X className="h-4 w-4" /></button>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMaterialCategory('all')} className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${materialCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Semua kategori</button>
                      {materialCategories.map((category) => <button key={category} type="button" onClick={() => setMaterialCategory(category)} className={`max-w-[180px] truncate rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${materialCategory === category ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{category}</button>)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{filteredMaterials.length.toLocaleString('id-ID')} material ditemukan</span><span>Ketik untuk menyaring katalog</span></div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    {filteredMaterials.length === 0 ? (
                      <div className="grid min-h-40 place-items-center text-center">
                        <div><PackageSearch className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-700">Material tidak ditemukan</p><p className="mt-1 text-xs text-slate-500">Coba kata kunci lain atau gunakan input manual.</p></div>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {filteredMaterials.map((material) => <button key={material.id} type="button" onClick={() => selectCatalogMaterial(materialPickerIndex, material.id)} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:shadow-sm">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-emerald-100 group-hover:text-emerald-800"><Boxes className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-slate-900">{material.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{material.code} · {material.unit}{material.category ? ` · ${material.category}` : ''}</span><span className="mt-1 block text-xs font-bold tabular-nums text-emerald-800">{money(material.unit_price)} <span className="font-normal text-slate-400">/ {material.unit}</span></span></span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" />
                        </button>)}
                      </div>
                    )}
                  </div>
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <button type="button" onClick={() => { updateLine(materialPickerIndex, 'material_id', null); setMaterialPickerIndex(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-900">Input material manual</button>
                    <button type="button" onClick={() => setMaterialPickerIndex(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Tutup katalog</button>
                  </footer>
                </section>
              </div>
            )}
          </form>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredRows.length > 0 ? <div className="border-b border-slate-100 bg-emerald-50/40 p-4"><h2 className="font-bold text-slate-900">Cetak bukti pembelian langsung</h2><p className="mb-3 text-xs text-slate-600">Pilih transaksi kas tersimpan untuk membuka dialog cetak atau Simpan sebagai PDF.</p><div className="grid gap-3 lg:grid-cols-2">{filteredRows.map((row) => (
          <article key={`pdf-${row.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm">
            <div><p className="font-bold text-emerald-800">{row.purchase_number}</p><p className="text-xs text-slate-600">{row.project_title} · {row.supplier_name} · {money(row.total_amount)}</p></div>
            <BusinessDocumentPdfButton
              identity={{ type: 'direct_purchase', code: row.purchase_number, title: 'Bukti Pembelian Langsung', sourceStatus: row.status, generatedAt: new Date().toISOString(), projectName: row.project_title, period: dateLabel(row.purchase_date), classification: 'Dokumen keuangan dan pengadaan' }}
              sections={[
                { title: 'Identitas transaksi', details: [
                  { label: 'Nomor transaksi', value: row.purchase_number }, { label: 'Proyek', value: row.project_title },
                  { label: 'Divisi RAB', value: row.division_name ?? 'Umum / tidak ditentukan' }, { label: 'Supplier', value: row.supplier_name },
                  { label: 'Tanggal pembelian', value: dateLabel(row.purchase_date) }, { label: 'No. invoice', value: row.invoice_number ?? 'Tidak dicatat' },
                  { label: 'Metode pembayaran', value: row.payment_method }, { label: 'Referensi pembayaran', value: row.reference_number ?? 'Tidak dicatat' },
                ] },
                { title: 'Rincian barang', columns: ['No', 'Kode', 'Nama barang', 'Diterima', 'Rusak', 'Satuan', 'Harga satuan', 'Jumlah'], rows: row.items.map((item, index) => [index + 1, item.material_code ?? '—', item.material_name, item.quantity_received, item.quantity_damaged, item.unit, money(item.unit_price), money(item.line_total)]) },
                { title: 'Nilai transaksi', details: [{ label: 'Total', value: money(row.total_amount) }], paragraphs: [row.notes?.trim() || 'Tidak ada catatan tambahan pada transaksi sumber.'] },
              ]}
            />
          </article>
        ))}</div></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div><h2 className="font-extrabold text-slate-900">Riwayat pembelian langsung</h2><p className="mt-1 text-xs text-slate-500">Transaksi tanpa PO yang sudah masuk ke mutasi kas dan stok.</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative min-w-[200px] flex-1 sm:flex-none"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor, supplier, material..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" /></div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Semua status</option><option value="confirmed">Aktif</option><option value="void">Dibatalkan</option></select>
          </div>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat pembelian...</div>
          : filteredRows.length === 0 ? <div className="p-12 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Belum ada pembelian yang cocok</p><p className="mt-1 text-xs text-slate-500">Catat pembelian baru atau ubah kata kunci pencarian.</p></div>
            : <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nomor / tanggal</th><th className="px-4 py-3">Proyek / lokasi</th><th className="px-4 py-3">Supplier / material</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Pembayaran</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-800">{row.purchase_number}<p className="mt-1 text-xs font-normal text-slate-500">{row.purchase_date}</p>{row.invoice_number && <p className="mt-1 text-[11px] font-normal text-slate-400">Nota: {row.invoice_number}</p>}</td>
                  <td className="px-4 py-3">{row.project_title}<p className="mt-1 text-xs text-slate-500">{row.division_name ?? 'Belum dialokasikan ke divisi'}</p></td>
                  <td className="px-4 py-3">{row.supplier_name}<p className="mt-1 max-w-[320px] text-xs leading-5 text-slate-500">{row.items.map((item) => `${item.material_name} (${item.quantity_received} ${item.unit})`).join(' · ')}</p></td>
                  <td className={`px-4 py-3 text-right font-extrabold tabular-nums ${row.status === 'void' ? 'text-slate-400 line-through' : 'text-rose-700'}`}>{money(row.total_amount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.payment_method === 'bank_transfer' ? 'Transfer bank' : row.payment_method === 'cash' ? 'Tunai' : 'Lainnya'}<p className="mt-1 text-slate-400">{row.reference_number || 'Tanpa referensi'}</p></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status === 'confirmed' ? 'Aktif' : 'Dibatalkan'}</span></td>
                  <td className="px-4 py-3">{row.status === 'confirmed' ? <button type="button" onClick={() => void cancelPurchase(row)} className="text-xs font-bold text-rose-700 hover:underline">Batalkan</button> : <span className="text-xs text-slate-400">—</span>}</td>
                </tr>)}
              </tbody>
            </table></div>}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p><strong className="text-slate-700">Kontrol pembukuan:</strong> pembelian langsung menghasilkan satu transaksi kas keluar, bukan pembayaran PO. Rekap keuangan menghitungnya dari <code>company_cash_transactions</code>; rincian pembelian tetap tersedia pada riwayat ini. Pembatalan akan membatalkan mutasi kas pasangannya. Sistem menolak pembatalan apabila material dari transaksi tersebut sudah terpakai sehingga stok akan menjadi negatif.</p>
      </div>
    </div>
  );
}

export default function DirectMaterialPurchasePage() {
  return <RequireAuth permission="finance.direct_purchase.manage"><DirectMaterialPurchaseContent /></RequireAuth>;
}
