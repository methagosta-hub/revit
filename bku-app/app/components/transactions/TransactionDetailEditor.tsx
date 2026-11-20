"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, ReceiptText, Scissors, Trash2, X } from "lucide-react";
import type { DetailLine, Draft, Material } from "@/app/lib/bku/types";
import {
  blankDetail,
  detailLineTotal,
  draftDetailsTotal,
  materialOptionsByCategory,
  money,
  parseDecimal,
  parseUnitPrice,
} from "@/app/lib/bku/formatters";

function isEmptyLine(line: DetailLine) {
  return !line.name.trim() && !line.unit_price.trim() && !line.volume.trim() && !line.material_id;
}

export function TransactionDetailEditor({
  draft,
  materials,
  onAdd,
  onRemove,
  onLineChange,
  onSplitLines,
  allowSplit,
  focusLineIndex,
}: {
  draft: Draft;
  materials: Material[];
  onAdd: (line: DetailLine) => void;
  onRemove: (lineIndex: number) => void;
  onLineChange: (lineIndex: number, patch: Partial<DetailLine>) => void;
  onSplitLines?: (lineIndexes: number[]) => void;
  allowSplit?: boolean;
  focusLineIndex?: number;
}) {
  const initialLine = Number.isInteger(focusLineIndex) ? draft.details[focusLineIndex as number] : undefined;
  const [entryLine, setEntryLine] = useState<DetailLine>(() => initialLine ? { ...initialLine } : blankDetail());
  const [editingIndex, setEditingIndex] = useState<number | null>(() => initialLine ? focusLineIndex as number : null);
  const [entryError, setEntryError] = useState("");
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const composerRef = useRef<HTMLDivElement>(null);
  const groupedMaterials = useMemo(() => materialOptionsByCategory(materials), [materials]);
  const visibleLines = draft.details
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !isEmptyLine(line));
  const canSelect = Boolean(allowSplit && visibleLines.length > 1);
  const selectedValidIndexes = selectedIndexes.filter((index) => draft.details[index] && !isEmptyLine(draft.details[index]));
  const selectedCount = selectedValidIndexes.length;
  const selectedTotal = selectedValidIndexes.reduce((sum, index) => sum + detailLineTotal(draft.details[index]), 0);
  const canMoveSelected = canSelect && selectedCount > 0 && selectedCount < visibleLines.length;
  const total = draftDetailsTotal(draft);

  useEffect(() => {
    if (initialLine) composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function updateEntry(patch: Partial<DetailLine>) {
    setEntryLine((current) => ({ ...current, ...patch }));
    setEntryError("");
  }

  function selectMaterial(materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    if (!material) {
      updateEntry({ material_id: "" });
      return;
    }
    updateEntry({
      material_id: material.id,
      name: material.name,
      unit_price: String(material.unit_price),
      unit: material.unit,
    });
  }

  function clearEntry() {
    setEntryLine(blankDetail());
    setEditingIndex(null);
    setEntryError("");
  }

  function submitEntry() {
    const name = entryLine.name.trim();
    if (!name) {
      setEntryError("Nama material wajib diisi.");
      return;
    }
    if (parseDecimal(entryLine.volume) <= 0) {
      setEntryError("Volume harus lebih dari nol.");
      return;
    }
    if (parseUnitPrice(entryLine.unit_price) <= 0) {
      setEntryError("Harga satuan harus lebih dari nol.");
      return;
    }
    if (!entryLine.unit.trim()) {
      setEntryError("Satuan material wajib diisi.");
      return;
    }

    const normalized: DetailLine = { ...entryLine, name, unit: entryLine.unit.trim() };
    if (editingIndex !== null) {
      onLineChange(editingIndex, normalized);
    } else {
      const emptyIndex = draft.details.findIndex(isEmptyLine);
      if (emptyIndex >= 0) onLineChange(emptyIndex, normalized);
      else onAdd(normalized);
    }
    clearEntry();
  }

  function beginEdit(index: number) {
    const line = draft.details[index];
    if (!line) return;
    setEntryLine({ ...line });
    setEditingIndex(index);
    setEntryError("");
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeLine(index: number) {
    setSelectedIndexes((current) => current
      .filter((item) => item !== index)
      .map((item) => item > index ? item - 1 : item));
    if (editingIndex === index) clearEntry();
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
    onRemove(index);
  }

  function toggleSelected(index: number, checked: boolean) {
    setSelectedIndexes((current) => checked
      ? Array.from(new Set([...current, index])).sort((a, b) => a - b)
      : current.filter((item) => item !== index));
  }

  function selectAllExceptOne() {
    setSelectedIndexes(visibleLines.slice(1).map(({ index }) => index));
  }

  function splitSelectedLines() {
    if (!canMoveSelected || !onSplitLines) return;
    onSplitLines(selectedValidIndexes);
    setSelectedIndexes([]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText size={18} /></span>
          <div>
            <h4 className="text-sm font-black text-slate-800">Rincian nota pengeluaran</h4>
            <p className="text-[10px] text-slate-500">Input material dan pantau daftar dalam satu ruang kerja.</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600">{visibleLines.length} material</span>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.35fr)]">
        <div ref={composerRef} className="min-w-0 self-start lg:sticky lg:top-0">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-emerald-950">{editingIndex === null ? "Input material" : "Ubah material"}</p>
                <p className="mt-0.5 text-[10px] text-emerald-800">{editingIndex === null ? "Isi satu material, lalu tambahkan ke daftar." : `Sedang mengubah material nomor ${editingIndex + 1}.`}</p>
              </div>
              {editingIndex !== null && <button type="button" onClick={clearEntry} className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Batal mengubah material"><X size={16} /></button>}
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-slate-600">
                Pilih dari katalog material
                <select value={entryLine.material_id} onChange={(event) => selectMaterial(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                  <option value="">Material baru / input manual</option>
                  {groupedMaterials.map(({ category, items }) => <optgroup key={category} label={category}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit} · {money(Number(item.unit_price))}</option>)}</optgroup>)}
                </select>
              </label>

              <label className="block text-[10px] font-bold text-slate-600">
                Nama material / barang
                <input autoComplete="off" value={entryLine.name} onChange={(event) => updateEntry({ name: event.target.value, material_id: "" })} placeholder="Contoh: Semen Portland 50 kg" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-[10px] font-bold text-slate-600">
                  Volume
                  <input inputMode="decimal" value={entryLine.volume} onChange={(event) => updateEntry({ volume: event.target.value })} placeholder="0" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </label>
                <label className="block text-[10px] font-bold text-slate-600">
                  Satuan
                  <input value={entryLine.unit} onChange={(event) => updateEntry({ unit: event.target.value })} placeholder="sak / m³" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </label>
              </div>

              <label className="block text-[10px] font-bold text-slate-600">
                Harga satuan (Rp)
                <input inputMode="numeric" value={entryLine.unit_price} onChange={(event) => updateEntry({ unit_price: event.target.value })} placeholder="0" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </label>

              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
                <span className="text-[10px] font-bold text-slate-500">Total material</span>
                <strong className="text-sm font-black tabular-nums text-emerald-800">{money(detailLineTotal(entryLine))}</strong>
              </div>

              {entryError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">{entryError}</p>}

              <button type="button" onClick={submitEntry} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800">
                {editingIndex === null ? <Plus size={15} /> : <Check size={15} />}
                {editingIndex === null ? "Tambahkan material ke daftar" : "Simpan perubahan material"}
              </button>
              {editingIndex !== null && <button type="button" onClick={clearEntry} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Batal mengubah</button>}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-black text-slate-800">Daftar material ditambahkan</h5>
              <p className="mt-0.5 text-[10px] text-slate-500">Pilih Edit untuk memuat kembali material ke panel input.</p>
            </div>
            <span className="text-[10px] font-bold tabular-nums text-slate-500">{visibleLines.length} baris</span>
          </div>

          {canSelect && <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-black text-emerald-950">Pilih beberapa rincian sekaligus</p><p className="mt-0.5 text-[10px] leading-5 text-emerald-800">Rincian terpilih akan digabung menjadi satu nota baru.</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={selectAllExceptOne} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50">Pilih semua kecuali 1</button>{selectedCount > 0 && <button type="button" onClick={() => setSelectedIndexes([])} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-white"><X size={12} />Batal pilih</button>}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 pt-3">
              <div><p className="text-sm font-black tabular-nums text-emerald-950">{selectedCount} dari {visibleLines.length} rincian dipilih</p><p className="text-[10px] text-emerald-800">Nilai terpilih: <strong>{money(selectedTotal)}</strong></p></div>
              <button type="button" onClick={splitSelectedLines} disabled={!canMoveSelected} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Scissors size={14} />Potong {selectedCount} rincian ke 1 nota baru</button>
            </div>
            {selectedCount === visibleLines.length && <p className="mt-2 text-[10px] font-semibold text-amber-800">Sisakan minimal satu rincian pada nota utama agar nota asal tidak kosong.</p>}
          </div>}

          <div className="max-h-[54vh] min-h-[220px] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50/60 p-2 pr-1 sm:p-3">
            {visibleLines.length === 0 ? <div className="flex min-h-[190px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-5 text-center"><ReceiptText size={24} className="text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-600">Belum ada material</p><p className="mt-1 max-w-xs text-[10px] leading-5 text-slate-400">Isi panel Input Material di samping, lalu tekan Tambahkan material ke daftar.</p></div> : visibleLines.map(({ line, index }) => <article key={index} className={`rounded-xl border bg-white p-3 transition ${selectedValidIndexes.includes(index) ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200"}`}>
              <div className="flex items-start gap-2.5">
                {canSelect && <input type="checkbox" aria-label={`Pilih material ${line.name}`} checked={selectedValidIndexes.includes(index)} onChange={(event) => toggleSelected(index, event.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-700" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Material {index + 1}</p>
                      <h6 className="mt-0.5 break-words text-xs font-bold text-slate-800">{line.name}</h6>
                      <p className="mt-1 text-[10px] text-slate-500">{line.volume || "0"} {line.unit} × {money(parseUnitPrice(line.unit_price))}</p>
                    </div>
                    <strong className="shrink-0 text-xs font-black tabular-nums text-slate-900">{money(detailLineTotal(line))}</strong>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                    <button type="button" onClick={() => beginEdit(index)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={11} />Edit</button>
                    <button type="button" onClick={() => removeLine(index)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={11} />Hapus</button>
                  </div>
                </div>
              </div>
            </article>)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-bold text-slate-600">Jumlah seluruh rincian nota</span>
        <strong className="text-lg font-black tabular-nums text-emerald-800">{money(total)}</strong>
      </div>
      {total > 2_000_000 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">Pengingat pemeriksaan nota di atas Rp2 juta. Catat nominal sebenarnya sesuai bukti pembelian; sistem tidak memecah transaksi secara semu.</p>}
    </section>
  );
}
