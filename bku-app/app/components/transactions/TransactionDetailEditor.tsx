"use client";

import { useState } from "react";
import { Plus, ReceiptText, Scissors, X } from "lucide-react";
import type { DetailLine, Draft, Material } from "@/app/lib/bku/types";
import { detailLineTotal, draftDetailsTotal, money } from "@/app/lib/bku/formatters";
import { TransactionDetailRow } from "./TransactionDetailRow";

export function TransactionDetailEditor({
  draft,
  materials,
  onAdd,
  onRemove,
  onLineChange,
  onMaterialSelect,
  onSplitLines,
  allowSplit,
}: {
  draft: Draft;
  materials: Material[];
  onAdd: () => void;
  onRemove: (lineIndex: number) => void;
  onLineChange: (lineIndex: number, patch: Partial<DetailLine>) => void;
  onMaterialSelect: (lineIndex: number, materialId: string) => void;
  onSplitLines?: (lineIndexes: number[]) => void;
  allowSplit?: boolean;
}) {
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const canSelect = Boolean(allowSplit && draft.details.length > 1);
  const selectedValidIndexes = selectedIndexes.filter((index) => index >= 0 && index < draft.details.length);
  const selectedCount = selectedValidIndexes.length;
  const selectedTotal = selectedValidIndexes.reduce((sum, index) => sum + detailLineTotal(draft.details[index]), 0);
  const canMoveSelected = canSelect && selectedCount > 0 && selectedCount < draft.details.length;

  function toggleSelected(index: number, checked: boolean) {
    setSelectedIndexes((current) => checked
      ? Array.from(new Set([...current, index])).sort((a, b) => a - b)
      : current.filter((item) => item !== index));
  }

  function removeLine(index: number) {
    setSelectedIndexes((current) => current.filter((item) => item !== index).map((item) => item > index ? item - 1 : item));
    onRemove(index);
  }

  function selectAllExceptOne() {
    setSelectedIndexes(draft.details.map((_line, index) => index).filter((index) => index !== 0));
  }

  function splitSelectedLines() {
    if (!canMoveSelected || !onSplitLines) return;
    onSplitLines(selectedValidIndexes);
    setSelectedIndexes([]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><ReceiptText size={16} /></span><div><h4 className="text-sm font-black text-slate-800">Rincian nota pengeluaran</h4><p className="text-[10px] text-slate-500">Satu nota dapat memuat banyak material / barang.</p></div></div>
        <button type="button" onClick={onAdd} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-50"><Plus size={14} />Tambah material</button>
      </div>

      {canSelect && <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-black text-emerald-950">Pilih beberapa rincian sekaligus</p><p className="mt-0.5 text-[10px] leading-5 text-emerald-800">Semua rincian yang dipilih akan digabung menjadi satu nota baru.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={selectAllExceptOne} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50">Pilih semua kecuali 1</button>{selectedCount > 0 && <button type="button" onClick={() => setSelectedIndexes([])} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-white"><X size={12}/>Batal pilih</button>}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 pt-3">
          <div><p className="text-sm font-black tabular-nums text-emerald-950">{selectedCount} dari {draft.details.length} rincian dipilih</p><p className="text-[10px] text-emerald-800">Nilai rincian terpilih: <strong>{money(selectedTotal)}</strong></p></div>
          <button type="button" onClick={splitSelectedLines} disabled={!canMoveSelected} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Scissors size={14}/>Potong {selectedCount} rincian ke 1 nota baru</button>
        </div>
        {selectedCount === draft.details.length && <p className="mt-2 text-[10px] font-semibold text-amber-800">Sisakan minimal satu rincian pada nota utama agar nota asal tidak kosong.</p>}
      </div>}

      <div className="space-y-3">{draft.details.map((line, index) => <TransactionDetailRow key={index} line={line} index={index} materials={materials} canRemove={draft.details.length > 1} onChange={(patch) => onLineChange(index, patch)} onMaterialSelect={(id) => onMaterialSelect(index, id)} onRemove={() => removeLine(index)} canSelect={canSelect} selected={selectedValidIndexes.includes(index)} onToggleSelect={(checked) => toggleSelected(index, checked)} />)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-600">Jumlah seluruh rincian nota</span><strong className="text-lg font-black text-emerald-800">{money(draftDetailsTotal(draft))}</strong></div>
      {draftDetailsTotal(draft) > 2_000_000 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">Pengingat pemeriksaan nota di atas Rp2 juta. Catat nominal sebenarnya sesuai bukti pembelian; sistem tidak memecah transaksi secara semu.</p>}
    </section>
  );
}
