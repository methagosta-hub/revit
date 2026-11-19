"use client";

import { Trash2 } from "lucide-react";
import type { DetailLine, Material } from "@/app/lib/bku/types";
import { money, materialOptionsByCategory, parseDecimal, parseUnitPrice, detailLineTotal, fieldClass } from "@/app/lib/bku/formatters";
import { FormField } from "@/app/components/layout/FormField";

export function TransactionDetailRow({
  line,
  index,
  materials,
  canRemove,
  onChange,
  onMaterialSelect,
  onRemove,
  selected = false,
  canSelect = false,
  onToggleSelect,
}: {
  line: DetailLine;
  index: number;
  materials: Material[];
  canRemove: boolean;
  onChange: (patch: Partial<DetailLine>) => void;
  onMaterialSelect: (materialId: string) => void;
  onRemove: () => void;
  selected?: boolean;
  canSelect?: boolean;
  onToggleSelect?: (checked: boolean) => void;
}) {
  const options = materialOptionsByCategory(materials);
  return (
    <div className={`rounded-2xl border p-3 transition sm:p-4 ${selected ? "border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-100" : "border-slate-200 bg-slate-50/70"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rincian material {index + 1}</span>
        <div className="flex items-center gap-3">
          {canSelect && <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50">
            <input type="checkbox" checked={selected} onChange={(event) => onToggleSelect?.(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
            Gabungkan ke nota baru
          </label>}
          {canRemove && <button type="button" onClick={onRemove} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={12} />Hapus baris</button>}
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <FormField label="Pilih dari katalog" className="md:col-span-2 xl:col-span-3"><select value={line.material_id || ""} onChange={(event) => onMaterialSelect(event.target.value)} className={fieldClass}><option value="">Material baru / input manual</option>{options.map(({ category, items }) => <optgroup key={category} label={category}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit} · {money(Number(item.unit_price))}</option>)}</optgroup>)}</select></FormField>
        <FormField label="Nama material / barang" className="md:col-span-2 xl:col-span-3"><input value={line.name} onChange={(event) => onChange({ name: event.target.value, material_id: "" })} placeholder="Contoh: Semen Portland 50 kg" className={fieldClass} /></FormField>
        <FormField label="Harga satuan (Rp)" className="xl:col-span-2"><input inputMode="numeric" value={line.unit_price} onChange={(event) => onChange({ unit_price: event.target.value })} placeholder="0" className={fieldClass} /></FormField>
        <FormField label="Volume" className="xl:col-span-1"><input inputMode="decimal" value={line.volume} onChange={(event) => onChange({ volume: event.target.value })} placeholder="0" className={fieldClass} /></FormField>
        <FormField label="Satuan" className="xl:col-span-1"><input value={line.unit} onChange={(event) => onChange({ unit: event.target.value })} placeholder="sak / m³" className={fieldClass} /></FormField>
        <div className="flex min-w-0 flex-col justify-end rounded-xl border border-slate-200 bg-white px-3 py-2 xl:col-span-2"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Total baris</p><p className="mt-1 break-words text-sm font-black text-slate-900">{money(detailLineTotal(line))}</p></div>
      </div>
      {(line.unit_price || line.volume) && (parseUnitPrice(line.unit_price) <= 0 || parseDecimal(line.volume) <= 0) && <p className="mt-2 text-[10px] font-medium text-amber-700">Isi harga satuan dan volume dengan nilai lebih dari nol.</p>}
    </div>
  );
}
