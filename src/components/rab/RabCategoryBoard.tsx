'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { GripVertical, Layers3, ListTree } from 'lucide-react';
import RabTable, {
  type RabTableItem,
  type RabItemUpdate,
  type RabComponentsUpdate,
} from '@/components/rab/RabTable';

export type RabCategoryClassification = {
  key: string;
  prefix: string;
  fieldCode: string;
  fieldLabel: string;
  divisionCode: string;
  divisionName: string;
  subdivisionCode: string;
  subdivisionName: string;
  mapped: boolean;
};

export type RabCategoryGroup = {
  key: string;
  prefix: string;
  classification: RabCategoryClassification;
  items: RabTableItem[];
};

type SubcategoryNode = {
  key: string;
  label: string;
  prefix: string;
  items: RabTableItem[];
};

type CategoryNode = {
  key: string;
  label: string;
  subcategories: SubcategoryNode[];
};

type FieldNode = {
  key: string;
  label: string;
  categories: CategoryNode[];
};

type DragState =
  | { level: 'field'; key: string }
  | { level: 'category'; key: string; parentKey: string }
  | { level: 'subcategory'; key: string; parentKey: string };

type Props = {
  groups: RabCategoryGroup[];
  onUpdate: (id: string, changes: RabItemUpdate) => Promise<void>;
  onUpdateComponents?: (id: string, changes: RabComponentsUpdate) => Promise<void>;
  onDelete: (item: RabTableItem) => Promise<void>;
  onVolumeUpdated?: () => void | Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  canReorder?: boolean;
  readOnly?: boolean;
};

function buildTree(groups: RabCategoryGroup[]): FieldNode[] {
  const fields: FieldNode[] = [];

  for (const group of groups) {
    const classification = group.classification;
    const fieldKey = classification.fieldCode || classification.fieldLabel;
    let field = fields.find((entry) => entry.key === fieldKey);
    if (!field) {
      field = { key: fieldKey, label: classification.fieldLabel, categories: [] };
      fields.push(field);
    }

    const categoryKey = `${fieldKey}::${classification.divisionCode || classification.divisionName}`;
    let category = field.categories.find((entry) => entry.key === categoryKey);
    if (!category) {
      category = { key: categoryKey, label: classification.divisionName, subcategories: [] };
      field.categories.push(category);
    }

    const subcategoryKey = classification.key || group.key;
    let subcategory = category.subcategories.find((entry) => entry.key === subcategoryKey);
    if (!subcategory) {
      subcategory = {
        key: subcategoryKey,
        label: classification.subdivisionName,
        prefix: group.prefix,
        items: [],
      };
      category.subcategories.push(subcategory);
    }
    subcategory.items.push(...group.items);
  }

  return fields;
}

function flattenIds(fields: FieldNode[]): string[] {
  return fields.flatMap((field) =>
    field.categories.flatMap((category) =>
      category.subcategories.flatMap((subcategory) =>
        subcategory.items.map((item) => item.id),
      ),
    ),
  );
}

function moveWithin<T extends { key: string }>(rows: T[], fromKey: string, toKey: string): T[] {
  const next = [...rows];
  const fromIndex = next.findIndex((row) => row.key === fromKey);
  const toIndex = next.findIndex((row) => row.key === toKey);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return next;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function RabCategoryBoard({
  groups,
  onUpdate,
  onUpdateComponents,
  onDelete,
  onVolumeUpdated,
  onReorder,
  canReorder = false,
  readOnly = false,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const tree = useMemo(() => buildTree(groups), [groups]);

  const persistOrder = async (nextTree: FieldNode[]) => {
    const orderedIds = flattenIds(nextTree);
    if (!orderedIds.length || savingOrder) return;
    setSavingOrder(true);
    try {
      await onReorder(orderedIds);
    } finally {
      setSavingOrder(false);
      setDragState(null);
    }
  };

  const handleGroupDrop = async (
    level: DragState['level'],
    targetKey: string,
    parentKey?: string,
  ) => {
    if (!canReorder || !dragState || dragState.level !== level || dragState.key === targetKey || savingOrder) return;
    const nextTree = buildTree(groups);

    if (level === 'field' && dragState.level === 'field') {
      await persistOrder(moveWithin(nextTree, dragState.key, targetKey));
      return;
    }

    if (level === 'category' && dragState.level === 'category' && parentKey && dragState.parentKey === parentKey) {
      const parent = nextTree.find((field) => field.key === parentKey);
      if (!parent) return;
      parent.categories = moveWithin(parent.categories, dragState.key, targetKey);
      await persistOrder(nextTree);
      return;
    }

    if (level === 'subcategory' && dragState.level === 'subcategory' && parentKey && dragState.parentKey === parentKey) {
      const parent = nextTree.flatMap((field) => field.categories).find((category) => category.key === parentKey);
      if (!parent) return;
      parent.subcategories = moveWithin(parent.subcategories, dragState.key, targetKey);
      await persistOrder(nextTree);
    }
  };

  const handleItemReorder = async (subcategoryKey: string, orderedIds: string[]) => {
    const nextTree = buildTree(groups);
    const subcategory = nextTree
      .flatMap((field) => field.categories)
      .flatMap((category) => category.subcategories)
      .find((entry) => entry.key === subcategoryKey);
    if (!subcategory) throw new Error('Kategori item tidak ditemukan. Muat ulang RAB lalu coba kembali.');

    const itemById = new Map(subcategory.items.map((item) => [item.id, item]));
    if (orderedIds.length !== itemById.size || orderedIds.some((id) => !itemById.has(id))) {
      throw new Error('Susunan item berubah saat proses drag-and-drop. Segarkan RAB lalu ulangi.');
    }
    subcategory.items = orderedIds.map((id) => itemById.get(id)!);
    await persistOrder(nextTree);
  };

  const dragHandleProps = (state: DragState) => ({
    draggable: canReorder && !savingOrder,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (!canReorder || savingOrder) {
        event.preventDefault();
        return;
      }
      setDragState(state);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.key);
    },
    onDragEnd: () => setDragState(null),
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!canReorder || !dragState || dragState.level !== state.level || dragState.key === state.key || savingOrder) return;
      if ('parentKey' in state && 'parentKey' in dragState && state.parentKey !== dragState.parentKey) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void handleGroupDrop(state.level, state.key, 'parentKey' in state ? state.parentKey : undefined);
    },
  });

  if (groups.length === 0) {
    return <div className="px-5 py-8 text-center text-sm text-slate-400">Belum ada item AHSP pada lokasi ini.</div>;
  }

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-emerald-700" /> Susunan RAB bertingkat: Bidang / Divisi → Kategori → Subkategori → Item</span>
        {canReorder && <span className="font-medium text-emerald-700">Tarik ikon pegangan untuk mengurutkan setiap tingkat</span>}
      </div>

      {tree.map((field, fieldIndex) => (
        <section
          key={field.key}
          className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${dragState?.level === 'field' && dragState.key === field.key ? 'opacity-50' : ''}`}
        >
          <div
            {...dragHandleProps({ level: 'field', key: field.key })}
            className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-3"
          >
            {canReorder && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400 active:cursor-grabbing" />}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-white">{fieldIndex + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bidang / Menu AHSP</p>
              <h4 className="text-sm font-bold text-slate-900">{field.label}</h4>
            </div>
            <span className="text-[10px] font-semibold text-slate-500">{field.categories.reduce((sum, category) => sum + category.subcategories.reduce((n, subcategory) => n + subcategory.items.length, 0), 0)} item</span>
          </div>

          <div className="space-y-3 p-3">
            {field.categories.map((category, categoryIndex) => (
              <section
                key={category.key}
                className={`overflow-hidden rounded-lg border border-indigo-100 bg-indigo-50/30 ${dragState?.level === 'category' && dragState.key === category.key ? 'opacity-50' : ''}`}
              >
                <div
                  {...dragHandleProps({ level: 'category', key: category.key, parentKey: field.key })}
                  className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-3 py-2.5"
                >
                  {canReorder && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-indigo-400 active:cursor-grabbing" />}
                  <ListTree className="h-4 w-4 shrink-0 text-indigo-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Kategori pekerjaan {categoryIndex + 1}</p>
                    <h5 className="text-xs font-bold text-indigo-950">{category.label}</h5>
                  </div>
                  <span className="text-[10px] text-indigo-700">{category.subcategories.length} subkategori</span>
                </div>

                <div className="space-y-3 p-3">
                  {category.subcategories.map((subcategory, subcategoryIndex) => (
                    <section
                      key={subcategory.key}
                      className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${dragState?.level === 'subcategory' && dragState.key === subcategory.key ? 'opacity-50' : ''}`}
                    >
                      <div
                        {...dragHandleProps({ level: 'subcategory', key: subcategory.key, parentKey: category.key })}
                        className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5"
                      >
                        {canReorder && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400 active:cursor-grabbing" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subkategori {subcategoryIndex + 1} {subcategory.prefix ? `· ${subcategory.prefix}` : ''}</p>
                          <h6 className="text-xs font-bold text-slate-800">{subcategory.label}</h6>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{subcategory.items.length} item</span>
                      </div>
                      <RabTable
                        items={subcategory.items}
                        onUpdate={onUpdate}
                        onUpdateComponents={onUpdateComponents}
                        onDelete={onDelete}
                        onVolumeUpdated={onVolumeUpdated}
                        onReorder={(orderedIds) => handleItemReorder(subcategory.key, orderedIds)}
                        canReorder={canReorder}
                        readOnly={readOnly}
                      />
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
