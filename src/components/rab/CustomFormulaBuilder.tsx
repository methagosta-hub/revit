'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  describeCustomBuilder,
  traceCustomBuilder,
  type CustomFormulaNode,
  type CustomFormulaParameters,
  type ArithmeticOperator,
} from '@/lib/volume-calculation';

type Props = {
  value: CustomFormulaParameters;
  onChange: (next: CustomFormulaParameters) => void;
};

const INPUT = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10';
const OPERATORS: Array<{ value: ArithmeticOperator; label: string }> = [
  { value: '+', label: 'Tambah (+)' },
  { value: '-', label: 'Kurang (−)' },
  { value: '*', label: 'Kali (×)' },
  { value: '/', label: 'Bagi (÷)' },
];
const makeId = () => 'node-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const newValue = (label = 'Sub-kategori'): CustomFormulaNode => ({
  id: makeId(), label, kind: 'value', value: '', unit: '', operator: '+',
});
const newGroup = (label = 'Kelompok perhitungan'): CustomFormulaNode => ({
  id: makeId(), label, kind: 'group', operator: '+', children: [newValue('Sub-kategori 1')],
});

function updateAtPath(nodes: CustomFormulaNode[], path: number[], change: (node: CustomFormulaNode) => CustomFormulaNode): CustomFormulaNode[] {
  return nodes.map((node, index) => {
    if (index !== path[0]) return node;
    if (path.length === 1) return change(node);
    return { ...node, children: updateAtPath(node.children || [], path.slice(1), change) };
  });
}
function removeAtPath(nodes: CustomFormulaNode[], path: number[]): CustomFormulaNode[] {
  if (path.length === 1) return nodes.filter((_, index) => index !== path[0]);
  return nodes.map((node, index) => index === path[0]
    ? { ...node, children: removeAtPath(node.children || [], path.slice(1)) }
    : node);
}

export default function CustomFormulaBuilder({ value, onChange }: Props) {
  const [selectedByParent, setSelectedByParent] = useState<Record<string, string[]>>({});
  const [groupNotice, setGroupNotice] = useState('');
  const groups = value.groups || [];
  const parentKeyForPath = (path: number[]) => path.join('.');
  const toggleSelection = (parentKey: string, nodeId: string, checked: boolean) => {
    setSelectedByParent((current) => {
      const selected = new Set(current[parentKey] || []);
      if (checked) selected.add(nodeId);
      else selected.delete(nodeId);
      return { ...current, [parentKey]: Array.from(selected) };
    });
  };
  const replace = (next: CustomFormulaNode[]) => onChange({ ...value, groups: next });
  const updateNode = (path: number[], change: (node: CustomFormulaNode) => CustomFormulaNode) =>
    replace(updateAtPath(groups, path, change));
  const removeNode = (path: number[]) => replace(removeAtPath(groups, path));
  const appendNode = (path: number[], node: CustomFormulaNode) =>
    updateNode(path, (current) => ({ ...current, children: [...(current.children || []), node] }));

  const wrapSelectedChildren = (path: number[], children: CustomFormulaNode[]) => {
    const key = parentKeyForPath(path);
    const selectedIds = selectedByParent[key] || [];
    const selectedIndexes = children
      .map((child, childIndex) => selectedIds.includes(child.id) ? childIndex : -1)
      .filter((childIndex) => childIndex >= 0);

    if (selectedIndexes.length < 2) {
      setGroupNotice('Pilih minimal dua sub-kategori untuk membuat tanda kurung.');
      return;
    }
    const first = selectedIndexes[0];
    const last = selectedIndexes[selectedIndexes.length - 1];
    if (last - first + 1 !== selectedIndexes.length) {
      setGroupNotice('Pilih baris yang berurutan agar urutan operasi tetap terjaga.');
      return;
    }

    const selectedNodes = children.slice(first, last + 1);
    const wrapped = newGroup('Kelompok (...)');
    wrapped.operator = selectedNodes[0].operator || '+';
    wrapped.children = selectedNodes.map((child, childIndex) =>
      childIndex === 0 ? { ...child, operator: '+' } : child,
    );
    const nextChildren = [
      ...children.slice(0, first),
      wrapped,
      ...children.slice(last + 1),
    ];
    updateNode(path, (current) => ({ ...current, children: nextChildren }));
    setSelectedByParent((current) => ({ ...current, [key]: [] }));
    setGroupNotice('');
  };

  const renderNode = (node: CustomFormulaNode, path: number[], depth: number, index: number): ReactNode => {
    const group = node.kind === 'group';
    const parentKey = parentKeyForPath(path.slice(0, -1));
    const selected = (selectedByParent[parentKey] || []).includes(node.id);
    return (
      <div key={node.id} className={depth === 0 ? 'rounded-xl border border-violet-200 bg-white p-3' : 'rounded-lg border border-slate-200 bg-slate-50 p-2'}>
        <div className="grid items-end gap-2 sm:grid-cols-[18px_minmax(0,1fr)_150px_36px]">
          {depth > 0 ? (
            <input
              type="checkbox"
              aria-label="Pilih baris untuk dikelompokkan"
              checked={selected}
              onChange={(event) => toggleSelection(parentKey, node.id, event.target.checked)}
              className="mb-2 h-4 w-4 accent-violet-600"
            />
          ) : <span />}
          <label className="text-[10px] font-semibold text-slate-600">{depth === 0 ? 'Nama kategori' : group ? 'Nama kelompok (tanda kurung)' : 'Identitas sub-kategori'}
            <input value={node.label} onChange={(event) => updateNode(path, (current) => ({ ...current, label: event.target.value }))} className={INPUT} placeholder={group ? 'Kategori A' : 'Luas bersih'} />
          </label>
          {index > 0 ? (
            <label className="text-[10px] font-semibold text-slate-600">Operasi dari baris sebelumnya
              <select value={node.operator || '+'} onChange={(event) => updateNode(path, (current) => ({ ...current, operator: event.target.value as ArithmeticOperator }))} className={INPUT}>
                {OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
              </select>
            </label>
          ) : <span className="text-[9px] text-slate-400">{depth === 0 ? 'Kategori pertama menjadi dasar ekspresi.' : 'Sub-kategori pertama.'}</span>}
          <button type="button" onClick={() => removeNode(path)} disabled={depth === 0 && groups.length <= 1} className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-30" title="Hapus baris"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>

        {!group ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
            <label className="text-[10px] font-semibold text-slate-600">Nilai angka
              <input type="number" step="any" value={String(node.value ?? '')} onChange={(event) => updateNode(path, (current) => ({ ...current, value: event.target.value }))} className={INPUT} placeholder="Masukkan angka" />
            </label>
            <label className="text-[10px] font-semibold text-slate-600">Satuan / keterangan
              <input value={String(node.unit ?? '')} onChange={(event) => updateNode(path, (current) => ({ ...current, unit: event.target.value }))} className={INPUT} placeholder="m, m², bh..." />
            </label>
          </div>
        ) : (
          <div className="mt-3 space-y-2 border-l-2 border-violet-200 pl-3">
            {(node.children || []).map((child, childIndex) => renderNode(child, [...path, childIndex], depth + 1, childIndex))}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => appendNode(path, newValue('Sub-kategori ' + ((node.children || []).length + 1)))} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-violet-700"><Plus className="h-3 w-3" /> Tambah sub-kategori</button>
              {depth < 12 ? <button type="button" onClick={() => appendNode(path, newGroup('Kelompok dalam kurung'))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-600"><Plus className="h-3 w-3" /> Tambah kelompok ( )</button> : null}
              {(selectedByParent[parentKeyForPath(path)] || []).length > 0 ? (
                <button type="button" onClick={() => wrapSelectedChildren(path, node.children || [])} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-700">
                  Kelompokkan baris terpilih ({(selectedByParent[parentKeyForPath(path)] || []).length})
                </button>
              ) : null}
            </div>
            {groupNotice ? <p className="text-[9px] text-amber-700">{groupNotice}</p> : null}
          </div>
        )}
      </div>
    );
  };

  let preview: ReturnType<typeof traceCustomBuilder> | null = null;
  let previewError = '';
  try {
    preview = traceCustomBuilder(value);
  } catch (error) {
    previewError = error instanceof Error ? error.message : 'Lengkapi struktur rumus.';
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Rumus kustom bertingkat</p><p className="text-[9px] text-slate-500">Bentuk kategori, sub-kategori, dan sub-sub kategori. Operator antarbaris dapat dipilih sendiri.</p></div>
        <button type="button" onClick={() => replace([...groups, newGroup('Kategori ' + String.fromCharCode(65 + groups.length))])} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-violet-700"><Plus className="h-3.5 w-3.5" /> Tambah kategori</button>
      </div>
      {groups.map((group, index) => renderNode(group, [index], 0, index))}
      <div className="rounded-lg border border-violet-200 bg-white px-3 py-3">
        <p className="text-[9px] font-bold uppercase tracking-wide text-violet-700">Pratinjau cara perhitungan</p>
        {previewError ? (
          <p className="mt-2 text-[10px] leading-5 text-rose-600">{previewError}</p>
        ) : preview ? (
          <div className="mt-2 space-y-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Struktur berdasarkan kategori</p>
              <p className="mt-1 break-words text-[10px] leading-5 text-slate-700">{preview.expression}</p>
            </div>
            <div className="rounded-md bg-slate-50 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Substitusi angka</p>
              <p className="mt-1 break-words font-mono text-[11px] font-semibold leading-5 text-slate-800">{preview.numericExpression}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Tahapan operasional</p>
              {preview.steps.length ? (
                <ol className="mt-1 space-y-1">
                  {preview.steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2 text-[10px] leading-5 text-slate-700" style={{ paddingLeft: Math.min(step.depth, 8) * 10 }}>
                      <span className="shrink-0 font-semibold text-violet-700">{index + 1}.</span>
                      <span className="font-mono">{step.expression} = {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(step.result)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-[10px] text-slate-500">Belum ada operasi antar-subkategori.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <span className="text-[9px] text-slate-500">Hasil akhir rumus dasar</span>
              <strong className="text-sm tabular-nums text-violet-900">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(preview.result)}</strong>
            </div>
          </div>
        ) : null}
      </div>
      <p className="text-[9px] leading-4 text-slate-500">Tombol “Tambah kelompok ( )” membuat kelompok operasi yang dihitung lebih dahulu. Kelompok dapat dibuat bertingkat, dan urutan langkah ini juga digunakan saat menampilkan Backup Volume di PDF.</p>
    </section>
  );
}
