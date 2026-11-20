"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, Check, ChevronDown, ChevronRight, Layers3, RefreshCw, Search, Sparkles } from "lucide-react";
import type { Book, MaterialGroup, MaterialAlias, MaterialPurchaseRecord } from "@/app/lib/bku/types";
import { money, numberFormat, fieldClass } from "@/app/lib/bku/formatters";
import { FormField } from "@/app/components/layout/FormField";

type UnitTotal = { unit: string; volume: number; amount: number };
type MaterialTotal = { name: string; normalizedName: string; amount: number; units: UnitTotal[]; records: MaterialPurchaseRecord[] };
type GroupTotal = { group: MaterialGroup; amount: number; materialCount: number; materials: MaterialTotal[] };
type UnmappedTotal = { name: string; normalizedName: string; amount: number; units: UnitTotal[]; records: MaterialPurchaseRecord[]; suggestedGroupId: string };

const autoPrefixes: Record<string, string[]> = {
  "semen": ["semen "],
  "pasir": ["pasir "],
  "batu & agregat": ["batu ", "batu", "split ", "kerikil", "koral", "screening"],
  "besi & baja": ["besi ", "besi", "wiremesh", "hollow "],
  "bata & dinding": ["bata ", "batako", "hebel"],
  "kayu": ["kayu ", "papan ", "balok kayu"],
  "pipa & plumbing": ["pipa ", "knee pvc", "lem pvc", "elbow pvc"],
  "keramik & granit": ["keramik ", "keramik", "granit ", "granit", "homogeneous tile"],
  "cat & finishing": ["cat ", "plamir ", "thinner"],
  "atap": ["atap ", "genteng", "nok atap", "spandek", "galvalum"],
  "plafon": ["gypsum ", "grc ", "panel plafon", "furing"],
  "instalasi listrik": ["kabel ", "mcb ", "lampu ", "saklar ", "stop kontak", "conduit"],
  "sanitary": ["kloset", "wastafel", "kran ", "shower", "floor drain"],
  "waterproofing & sealant": ["waterproofing", "membrane ", "sealant", "waterstop"],
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}

function addUnit(units: Map<string, UnitTotal>, record: MaterialPurchaseRecord) {
  const unit = record.unit.trim() || "satuan tidak diisi";
  const current = units.get(unit) || { unit, volume: 0, amount: 0 };
  current.volume += record.volume;
  current.amount += record.amount;
  units.set(unit, current);
}

function formatUnits(units: UnitTotal[]) {
  return units.map((item) => `${numberFormat(item.volume)} ${item.unit}`).join(" · ");
}

export function MaterialSummaryView({
  books,
  selectedBookId,
  groups,
  aliases,
  records,
  loading,
  error,
  onRefresh,
  onCreateGroup,
  onMapMaterial,
  onEditRecord,
}: {
  books: Book[];
  selectedBookId: string;
  groups: MaterialGroup[];
  aliases: MaterialAlias[];
  records: MaterialPurchaseRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onCreateGroup: (name: string) => Promise<MaterialGroup>;
  onMapMaterial: (groupId: string, materialName: string) => Promise<unknown>;
  onEditRecord: (record: MaterialPurchaseRecord) => void;
}) {
  const [bookFilter, setBookFilter] = useState(selectedBookId);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [expandedGroup, setExpandedGroup] = useState("");
  const [expandedMaterialKey, setExpandedMaterialKey] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setBookFilter(selectedBookId);
  }, [selectedBookId]);

  const aliasMap = useMemo(() => new Map(aliases.map((alias) => [normalizeName(alias.normalized_name), alias.group_id])), [aliases]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const filteredRecords = useMemo(() => records.filter((record) =>
    (bookFilter === "all" || !bookFilter || record.book_id === bookFilter)
    && (!startDate || record.transaction_date >= startDate)
    && (!endDate || record.transaction_date <= endDate)
  ), [records, bookFilter, startDate, endDate]);

  const { grouped, unmapped, totalAmount, unmappedAmount } = useMemo(() => {
    const groupMaps = new Map<string, Map<string, { name: string; amount: number; units: Map<string, UnitTotal>; records: MaterialPurchaseRecord[] }>>();
    const ungroupedMap = new Map<string, { name: string; amount: number; units: Map<string, UnitTotal>; records: MaterialPurchaseRecord[] }>>();
    let allAmount = 0;
    let pendingAmount = 0;

    for (const record of filteredRecords) {
      allAmount += record.amount;
      const groupId = aliasMap.get(record.normalized_name);
      if (groupId && groupById.has(groupId)) {
        const materials = groupMaps.get(groupId) || new Map();
        const material = materials.get(record.normalized_name) || {
          name: record.name,
          amount: 0,
          units: new Map<string, UnitTotal>(),
          records: [],
        };
        material.amount += record.amount;
        addUnit(material.units, record);
        material.records.push(record);
        materials.set(record.normalized_name, material);
        groupMaps.set(groupId, materials);
      } else {
        const material = ungroupedMap.get(record.normalized_name) || {
          name: record.name,
          amount: 0,
          units: new Map<string, UnitTotal>(),
          records: [],
        };
        material.amount += record.amount;
        addUnit(material.units, record);
        material.records.push(record);
        ungroupedMap.set(record.normalized_name, material);
        pendingAmount += record.amount;
      }
    }

    const result: GroupTotal[] = [];
    for (const [groupId, materialsMap] of groupMaps) {
      const group = groupById.get(groupId);
      if (!group) continue;
      const materials: MaterialTotal[] = Array.from(materialsMap.entries()).map(([normalizedName, material]) => ({
        name: material.name,
        normalizedName,
        amount: material.amount,
        units: Array.from(material.units.values()).sort((a, b) => a.unit.localeCompare(b.unit)),
        records: [...material.records].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.entry_no - a.entry_no),
      })).sort((a, b) => a.name.localeCompare(b.name));
      result.push({
        group,
        amount: materials.reduce((sum, item) => sum + item.amount, 0),
        materialCount: materials.length,
        materials,
      });
    }

    const pending: UnmappedTotal[] = Array.from(ungroupedMap.entries()).map(([normalizedName, item]) => {
      const suggested = groups.find((group) => {
        const prefixes = autoPrefixes[normalizeName(group.name)] || [];
        return prefixes.some((prefix) => normalizedName.startsWith(prefix));
      });
      return {
        name: item.name,
        normalizedName,
        amount: item.amount,
        units: Array.from(item.units.values()).sort((a, b) => a.unit.localeCompare(b.unit)),
        records: [...item.records].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.entry_no - a.entry_no),
        suggestedGroupId: suggested?.id || "",
      };
    }).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

    return {
      grouped: result.sort((a, b) => b.amount - a.amount),
      unmapped: pending,
      totalAmount: allAmount,
      unmappedAmount: pendingAmount,
    };
  }, [filteredRecords, aliasMap, groupById, groups]);

  const visibleGroups = grouped.filter((item) => !search || item.group.name.toLowerCase().includes(search.toLowerCase())
    || item.materials.some((material) => material.name.toLowerCase().includes(search.toLowerCase())));
  const visibleUnmapped = unmapped.filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()));

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGroup(true);
    setNotice("");
    try {
      const created = await onCreateGroup(newGroupName);
      setNewGroupName("");
      setNotice(`Kelompok ${created.name} berhasil dibuat.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Kelompok material gagal dibuat.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleMapMaterial(name: string, groupId: string) {
    if (!groupId) return;
    setSavingName(name);
    setNotice("");
    try {
      await onMapMaterial(groupId, name);
      setSelectedGroups((current) => ({ ...current, [normalizeName(name)]: groupId }));
      setNotice(`Material ${name} berhasil dipetakan dan akan dikelompokkan otomatis berikutnya.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Pemetaan material gagal disimpan.");
    } finally {
      setSavingName("");
    }
  }

  async function handleApplySuggestions() {
    const suggestions = unmapped.filter((item) => item.suggestedGroupId);
    if (!suggestions.length) return;
    setSavingName("__bulk__");
    setNotice("");
    let mapped = 0;
    try {
      for (const item of suggestions) {
        await onMapMaterial(item.suggestedGroupId, item.name);
        mapped += 1;
      }
      setNotice(`${mapped} nama material berhasil dikelompokkan berdasarkan saran otomatis.`);
    } catch (cause) {
      setNotice(`${mapped} nama berhasil dipetakan. Sisanya belum tersimpan: ${cause instanceof Error ? cause.message : "terjadi kesalahan"}`);
    } finally {
      setSavingName("");
    }
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Analisis kebutuhan</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">Rekapitulasi kebutuhan material</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Biaya dijumlahkan lintas satuan. Kuantitas tetap dipisahkan menurut satuannya, misalnya dump, colt, m³, sak, batang, dan lainnya.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Muat ulang</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">Total belanja material</p><p className="mt-2 text-xl font-black tabular-nums text-slate-900">{money(totalAmount)}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">Kelompok terpetakan</p><p className="mt-2 text-xl font-black tabular-nums text-emerald-700">{grouped.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">Nama material terdata</p><p className="mt-2 text-xl font-black tabular-nums text-slate-900">{new Set(filteredRecords.map((item) => item.normalized_name)).size}</p></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[10px] font-semibold text-amber-800">Belum dipetakan</p><p className="mt-2 text-xl font-black tabular-nums text-amber-900">{money(unmappedAmount)}</p><p className="mt-1 text-[10px] text-amber-800">{unmapped.length} nama material perlu diperiksa</p></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Lingkup proyek">
            <select value={bookFilter || "all"} onChange={(event) => setBookFilter(event.target.value)} className={fieldClass}>
              <option value="all">Semua proyek</option>
              {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
            </select>
          </FormField>
          <FormField label="Tanggal awal"><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className={fieldClass}/></FormField>
          <FormField label="Tanggal akhir"><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className={fieldClass}/></FormField>
          <FormField label="Cari kelompok / material"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mis. semen atau pasir" className={fieldClass + " pl-9"}/></div></FormField>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div><h4 className="text-sm font-black text-slate-900">Rekap berdasarkan kelompok</h4><p className="mt-1 text-[10px] text-slate-500">Buka kelompok untuk melihat jenis material, kuantitas per satuan, dan nilainya.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{grouped.length} kelompok</span>
        </div>
        {loading ? <div className="p-8 text-center text-xs font-semibold text-slate-500"><RefreshCw size={17} className="mx-auto mb-2 animate-spin"/>Menghitung rekap material…</div> : visibleGroups.length ? (
          <div className="divide-y divide-slate-100">
            {visibleGroups.map((item) => {
              const expanded = expandedGroup === item.group.id;
              const unitTotals = new Map<string, UnitTotal>();
              for (const material of item.materials) for (const unit of material.units) {
                const current = unitTotals.get(unit.unit) || { unit: unit.unit, volume: 0, amount: 0 };
                current.volume += unit.volume;
                current.amount += unit.amount;
                unitTotals.set(unit.unit, current);
              }
              return <div key={item.group.id}>
                <button type="button" onClick={() => setExpandedGroup(expanded ? "" : item.group.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Boxes size={17}/></span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{item.group.name}</strong><span className="mt-1 block text-[10px] text-slate-500">{item.materialCount} nama material · {formatUnits(Array.from(unitTotals.values())) || "Satuan belum terdata"}</span></span>
                  <strong className="text-sm font-black tabular-nums text-slate-900">{money(item.amount)}</strong>
                  {expanded ? <ChevronDown size={17} className="text-slate-400"/> : <ChevronRight size={17} className="text-slate-400"/>}
                </button>
                {expanded && <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Jenis material</th><th className="px-2 py-2">Kuantitas per satuan</th><th className="px-2 py-2">Penelusuran</th><th className="px-2 py-2 text-right">Total biaya</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {item.materials.map((material) => {
                        const expandedMaterial = expandedMaterialKey === material.normalizedName;
                        const unitVariants = new Set(material.records.map((record) => record.unit.trim().toLocaleLowerCase("id-ID")));
                        const priceVariants = new Set(material.records.map((record) => `${record.unit.trim().toLocaleLowerCase("id-ID")}|${record.unit_price}`));
                        return <>
                          <tr key={material.normalizedName}>
                            <td className="px-2 py-3 font-semibold text-slate-800">
                              {material.name}
                              {unitVariants.size > 1 && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Periksa variasi satuan</span>}
                              {priceVariants.size > unitVariants.size && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Harga satuan bervariasi</span>}
                            </td>
                            <td className="px-2 py-3 text-slate-600">{formatUnits(material.units)}</td>
                            <td className="px-2 py-3">
                              <button type="button" onClick={() => setExpandedMaterialKey(expandedMaterial ? "" : material.normalizedName)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50">
                                {expandedMaterial ? "Tutup daftar nota" : `Lihat ${material.records.length} nota`}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-right font-bold tabular-nums text-slate-900">{money(material.amount)}</td>
                          </tr>
                          {expandedMaterial && <tr><td colSpan={4} className="bg-white px-3 py-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-slate-800">Nota sumber untuk {material.name}</strong><span className="text-[10px] text-slate-500">{material.records.length} rincian transaksi ditemukan</span></div>
                            <div className="space-y-2">
                              {material.records.map((record) => <div key={record.transaction_id + ":" + record.detail_index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-emerald-800">{new Date(`${record.transaction_date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} · {record.book_name}</p>
                                  <p className="mt-1 truncate text-xs font-bold text-slate-800">{record.receipt_number ? `Nota ${record.receipt_number}` : `Nomor urut #${record.entry_no}`} · {record.description || "Tanpa uraian"}</p>
                                  <p className="mt-1 text-[10px] text-slate-500">{record.store_name ? `Toko: ${record.store_name} · ` : ""}{numberFormat(record.volume)} {record.unit} × {money(record.unit_price)} = {money(record.amount)}</p>
                                </div>
                                <button type="button" onClick={() => onEditRecord(record)} className="rounded-lg bg-emerald-700 px-3 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-800">Perbaiki nota</button>
                              </div>)}
                            </div>
                            <p className="mt-2 text-[10px] leading-5 text-slate-500">Harga atau satuan yang berbeda hanya ditandai untuk pemeriksaan. Perubahan dilakukan pada nota asli dan harus disesuaikan dengan bukti belanja.</p>
                          </td></tr>}
                        </>;
                      })}
                    </tbody>
                    <tfoot><tr><td className="px-2 py-3 font-black text-slate-900">Total kelompok</td><td className="px-2 py-3 text-[10px] font-semibold text-slate-600">{formatUnits(Array.from(unitTotals.values()))}</td><td className="px-2 py-3 text-[10px] text-slate-500">Rekap dihitung dari nota sumber</td><td className="px-2 py-3 text-right font-black text-emerald-800">{money(item.amount)}</td></tr></tfoot>
                  </table>
                </div>}
              </div>;
            })}
          </div>
        ) : <div className="p-8 text-center"><Layers3 size={26} className="mx-auto text-slate-300"/><p className="mt-2 text-sm font-bold text-slate-700">Belum ada material yang terpetakan</p><p className="mt-1 text-xs text-slate-500">Petakan nama material di bagian bawah agar muncul di rekap kelompok.</p></div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="text-sm font-black text-slate-900">Pemetaan nama material</h4><p className="mt-1 max-w-2xl text-[10px] leading-5 text-slate-500">Nama yang belum dikenal ditampilkan di sini. Saran otomatis hanya membantu memilih; setelah Anda mengonfirmasi satu kali, nama itu langsung masuk ke kelompok yang benar untuk rekap berikutnya.</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <form onSubmit={handleCreateGroup} className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-none"><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Nama kelompok baru" className={fieldClass + " min-w-[180px] flex-1 sm:w-48"}/><button type="submit" disabled={savingGroup || !newGroupName.trim()} className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14}/>Tambah</button></form>
            <button type="button" onClick={() => void handleApplySuggestions()} disabled={savingName === "__bulk__" || !unmapped.some((item) => item.suggestedGroupId)} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-40"><Sparkles size={14}/>{savingName === "__bulk__" ? "Menerapkan…" : "Terapkan saran otomatis"}</button>
          </div>
        </div>

        {visibleUnmapped.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Nama material dari nota</th><th className="px-3 py-3">Kuantitas tercatat</th><th className="px-3 py-3 text-right">Biaya</th><th className="px-3 py-3">Kelompok</th><th className="px-3 py-3">Aksi</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visibleUnmapped.map((item) => {
              const chosen = selectedGroups[item.normalizedName] || item.suggestedGroupId;
              return <tr key={item.normalizedName}>
                <td className="px-3 py-3"><strong className="block text-slate-800">{item.name}</strong>{item.suggestedGroupId && <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700"><Sparkles size={11}/>Ada saran kelompok otomatis</span>}</td>
                <td className="px-3 py-3 text-[10px] text-slate-600">{formatUnits(item.units)}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{money(item.amount)}</td>
                <td className="px-3 py-3"><select value={chosen} onChange={(event) => setSelectedGroups((current) => ({ ...current, [item.normalizedName]: event.target.value }))} className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px]"><option value="">Pilih kelompok</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></td>
                <td className="px-3 py-3"><button type="button" onClick={() => void handleMapMaterial(item.name, chosen)} disabled={!chosen || savingName === item.name} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 disabled:opacity-40">{savingName === item.name ? "Menyimpan…" : "Petakan"}</button></td>
              </tr>;
            })}
          </tbody>
        </table></div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">{filteredRecords.length === 0 ? "Belum ada rincian pembelian material pada filter ini." : unmapped.length === 0 ? <><Check size={15} className="mr-1 inline"/>Semua nama material pada filter ini sudah terpetakan.</> : "Tidak ada nama material yang cocok dengan pencarian."}</div>}

        <details className="mt-4 rounded-xl border border-slate-200">
          <summary className="cursor-pointer px-3 py-3 text-xs font-bold text-slate-700">Kelola alias yang sudah dipetakan ({aliases.length})</summary>
          <div className="overflow-x-auto border-t border-slate-100 p-3">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Nama alias</th><th className="px-2 py-2">Kelompok saat ini</th><th className="px-2 py-2">Ubah kelompok</th><th className="px-2 py-2">Aksi</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {aliases.map((alias) => {
                  const currentGroup = groupById.get(alias.group_id);
                  const chosen = selectedGroups[normalizeName(alias.material_name)] || alias.group_id;
                  return <tr key={alias.id}>
                    <td className="px-2 py-2.5 font-semibold text-slate-800">{alias.material_name}</td>
                    <td className="px-2 py-2.5 text-slate-600">{currentGroup?.name || "Kelompok tidak aktif"}</td>
                    <td className="px-2 py-2.5"><select value={chosen} onChange={(event) => setSelectedGroups((current) => ({ ...current, [normalizeName(alias.material_name)]: event.target.value }))} className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px]"><option value="">Pilih kelompok</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></td>
                    <td className="px-2 py-2.5"><button type="button" onClick={() => void handleMapMaterial(alias.material_name, chosen)} disabled={!chosen || savingName === alias.material_name} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700 disabled:opacity-40">{savingName === alias.material_name ? "Menyimpan…" : "Simpan"}</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <p className="text-[10px] leading-5 text-slate-400">Catatan: jumlah volume tidak dijumlahkan lintas satuan. Contohnya 2 dump, 3 colt, dan 8 m³ tetap ditampilkan terpisah. Nilai rupiah tetap dapat dijumlahkan pada tingkat kelompok.</p>
    </section>
  );
}
