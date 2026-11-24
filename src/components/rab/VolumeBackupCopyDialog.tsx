'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Copy, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SourceItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  isSubitem?: boolean;
  subitemPath?: string | null;
};

type ProjectRow = { id: string; title: string; status: string | null };
type DivisionRow = { id: string; project_id: string; code: string | null; name: string; sort_order?: number | null };
type SubitemSnapshot = {
  masterAhspId: string;
  code?: string;
  name?: string;
  unit?: string;
  subitems?: SubitemSnapshot[];
};
type RabItemRow = {
  id: string;
  division_id: string;
  master_ahsp_id?: string | null;
  code: string;
  name: string;
  unit: string;
  subitems_snapshot?: SubitemSnapshot[] | null;
};
type SubitemChoice = { path: string; code: string; name: string; unit: string; depth: number };

type Props = {
  open: boolean;
  sourceItem: SourceItem;
  sourceDetailsCount: number;
  onClose: () => void;
  onCopied: () => void | Promise<void>;
};

const ROOT_PATH = '__root__';

function flattenSubitems(items: SubitemSnapshot[], parentPath: string[] = [], depth = 0): SubitemChoice[] {
  return items.flatMap((item) => {
    const path = [...parentPath, String(item.masterAhspId)];
    const current: SubitemChoice = {
      path: path.join('/'),
      code: item.code ?? '',
      name: item.name ?? 'Sub-item tanpa nama',
      unit: item.unit ?? '',
      depth,
    };
    return [current, ...flattenSubitems(Array.isArray(item.subitems) ? item.subitems : [], path, depth + 1)];
  });
}

function readableError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Terjadi kesalahan.');
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

export default function VolumeBackupCopyDialog({
  open,
  sourceItem,
  sourceDetailsCount,
  onClose,
  onCopied,
}: Props) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [rabItems, setRabItems] = useState<RabItemRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [targetItemId, setTargetItemId] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [targetPath, setTargetPath] = useState(ROOT_PATH);
  const [mode, setMode] = useState<'replace' | 'append' | ''>('');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [loadingCount, setLoadingCount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProjectId('');
    setDivisionId('');
    setTargetItemId('');
    setTargetSearch('');
    setTargetPath(ROOT_PATH);
    setMode('');
    setExistingCount(null);
    setDivisions([]);
    setRabItems([]);
    setError('');
    let cancelled = false;

    const loadProjects = async () => {
      setLoadingProjects(true);
      try {
        const { data, error: queryError } = await supabase
          .from('projects')
          .select('id, title, status')
          .neq('status', 'DIBATALKAN')
          .order('title', { ascending: true });
        if (queryError) throw queryError;
        if (!cancelled) {
          setProjects(((data ?? []) as ProjectRow[]).filter((project) =>
            ['DRAFT', 'REVIEW'].includes(String(project.status ?? '').toUpperCase()),
          ));
        }
      } catch (loadError) {
        if (!cancelled) setError('Gagal memuat daftar proyek tujuan: ' + readableError(loadError));
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };

    void loadProjects();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setDivisions([]);
    setRabItems([]);
    setDivisionId('');
    setTargetItemId('');
    setTargetSearch('');
    setTargetPath(ROOT_PATH);
    setExistingCount(null);

    const loadDestinations = async () => {
      setLoadingDestinations(true);
      setError('');
      try {
        const { data: divisionRows, error: divisionError } = await supabase
          .from('rab_divisions')
          .select('id, project_id, code, name, sort_order')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true });
        if (divisionError) throw divisionError;
        const loadedDivisions = (divisionRows ?? []) as DivisionRow[];
        if (cancelled) return;
        setDivisions(loadedDivisions);

        if (loadedDivisions.length) {
          const { data: itemRows, error: itemError } = await supabase
            .from('rab_items')
            .select('id, division_id, master_ahsp_id, code, name, unit, subitems_snapshot, sort_order')
            .in('division_id', loadedDivisions.map((division) => division.id))
            .order('sort_order', { ascending: true });
          if (itemError) throw itemError;
          if (!cancelled) setRabItems((itemRows ?? []) as RabItemRow[]);
        }
      } catch (loadError) {
        if (!cancelled) setError('Gagal memuat lokasi dan AHSP tujuan: ' + readableError(loadError));
      } finally {
        if (!cancelled) setLoadingDestinations(false);
      }
    };

    void loadDestinations();
    return () => { cancelled = true; };
  }, [open, projectId]);

  const divisionItems = useMemo(
    () => rabItems.filter((item) => item.division_id === divisionId),
    [rabItems, divisionId],
  );
  const filteredDivisionItems = useMemo(() => {
    const keyword = targetSearch.trim().toLocaleLowerCase('id-ID');
    if (!keyword) return divisionItems;
    return divisionItems.filter((item) =>
      `${item.code} ${item.name}`.toLocaleLowerCase('id-ID').includes(keyword),
    );
  }, [divisionItems, targetSearch]);
  const selectedItem = useMemo(
    () => divisionItems.find((item) => item.id === targetItemId) ?? null,
    [divisionItems, targetItemId],
  );
  const subitemChoices = useMemo(
    () => selectedItem ? flattenSubitems(selectedItem.subitems_snapshot ?? []) : [],
    [selectedItem],
  );
  const sameSourceTarget = Boolean(
    selectedItem &&
    selectedItem.id === sourceItem.id &&
    (targetPath === ROOT_PATH ? !sourceItem.isSubitem : targetPath === (sourceItem.subitemPath ?? null)),
  );
  const projectLabel = useMemo(
    () => projects.find((project) => project.id === projectId)?.title ?? '',
    [projects, projectId],
  );
  const divisionLabel = useMemo(
    () => divisions.find((division) => division.id === divisionId)?.name ?? '',
    [divisions, divisionId],
  );

  useEffect(() => {
    if (!open || !selectedItem || sameSourceTarget) {
      setExistingCount(null);
      return;
    }
    let cancelled = false;
    const loadCount = async () => {
      setLoadingCount(true);
      setExistingCount(null);
      try {
        let query = supabase
          .from('volume_details')
          .select('id', { count: 'exact', head: true })
          .eq('rab_item_id', selectedItem.id);
        query = targetPath === ROOT_PATH
          ? query.is('subitem_path', null)
          : query.eq('subitem_path', targetPath);
        const { count, error: countError } = await query;
        if (countError) throw countError;
        if (!cancelled) setExistingCount(count ?? 0);
      } catch (countError) {
        if (!cancelled) setError('Gagal memeriksa backup yang sudah ada: ' + readableError(countError));
      } finally {
        if (!cancelled) setLoadingCount(false);
      }
    };
    void loadCount();
    return () => { cancelled = true; };
  }, [open, selectedItem, targetPath, sameSourceTarget]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!selectedItem || !mode || sourceDetailsCount < 1 || sameSourceTarget || existingCount === null || saving) return;
    const destinationDescription = [
      projectLabel,
      divisionLabel,
      selectedItem.code + ' - ' + selectedItem.name,
      targetPath === ROOT_PATH
        ? 'Backup volume AHSP induk'
        : 'Backup sub-item ' + (subitemChoices.find((choice) => choice.path === targetPath)?.name ?? ''),
    ].join(' / ');
    const verb = mode === 'replace' ? 'GANTI' : 'TAMBAHKAN';
    const detail = mode === 'replace'
      ? existingCount + ' rincian lama akan diganti dengan ' + sourceDetailsCount + ' rincian dari sumber.'
      : sourceDetailsCount + ' rincian baru akan ditambahkan; ' + existingCount + ' rincian yang sudah ada tetap dipertahankan.';
    const confirmed = window.confirm(
      verb + ' backup volume pada tujuan berikut?\n\n' +
      destinationDescription + '\n\n' +
      detail + '\n\n' +
      'Salinan menjadi data mandiri. Perubahan berikutnya pada sumber tidak mengubah salinan.',
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      const { error: copyError } = await supabase.rpc('copy_volume_backup_between_rab_items', {
        p_source_rab_item_id: sourceItem.id,
        p_source_subitem_path: sourceItem.isSubitem ? sourceItem.subitemPath ?? null : null,
        p_target_rab_item_id: selectedItem.id,
        p_target_subitem_path: targetPath === ROOT_PATH ? null : targetPath,
        p_mode: mode,
      });
      if (copyError) throw copyError;
      await onCopied();
      onClose();
    } catch (copyError) {
      setError('Penyalinan gagal: ' + readableError(copyError));
    } finally {
      setSaving(false);
    }
  };

  const selectedSubitem = subitemChoices.find((choice) => choice.path === targetPath);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-copy-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <Copy className="h-4 w-4" /> Salin backup volume
            </div>
            <h3 id="volume-copy-title" className="mt-1 text-lg font-bold text-slate-900">Pilih AHSP tujuan</h3>
            <p className="mt-1 text-xs text-slate-500">
              Sumber: {sourceItem.code} — {sourceItem.name} {sourceItem.isSubitem ? '(sub-item)' : '(induk)'} · {sourceDetailsCount} rincian
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Tutup dialog salin" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              Proyek tujuan
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loadingProjects || saving} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <option value="">{loadingProjects ? 'Memuat proyek...' : 'Pilih proyek'}</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.status}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Lokasi / kelompok RAB
              <select value={divisionId} onChange={(event) => { setDivisionId(event.target.value); setTargetItemId(''); setTargetSearch(''); setTargetPath(ROOT_PATH); }} disabled={!projectId || loadingDestinations || saving} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <option value="">{loadingDestinations ? 'Memuat lokasi...' : 'Pilih lokasi pekerjaan'}</option>
                {divisions.map((division) => <option key={division.id} value={division.id}>{division.code ? division.code + ' · ' : ''}{division.name}</option>)}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="volume-copy-target-search" className="block text-xs font-semibold text-slate-700">
              Cari item pekerjaan (kode atau nama)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="volume-copy-target-search"
                type="search"
                value={targetSearch}
                onChange={(event) => setTargetSearch(event.target.value)}
                disabled={!divisionId || loadingDestinations || saving}
                placeholder="Contoh: A.1.1.1 atau pekerjaan pasangan bata"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="volume-copy-target-select" className="text-xs font-semibold text-slate-700">AHSP tujuan</label>
              <span className="text-[10px] font-medium text-slate-400">
                {divisionId ? `${filteredDivisionItems.length} dari ${divisionItems.length} item` : 'Pilih lokasi terlebih dahulu'}
              </span>
            </div>
            <select id="volume-copy-target-select" value={targetItemId} onChange={(event) => { setTargetItemId(event.target.value); setTargetPath(ROOT_PATH); }} disabled={!divisionId || loadingDestinations || saving} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="">{!divisionId ? 'Pilih lokasi pekerjaan terlebih dahulu' : filteredDivisionItems.length ? 'Pilih AHSP' : 'Item pekerjaan tidak ditemukan'}</option>
              {filteredDivisionItems.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
            </select>
            {divisionId && targetSearch.trim() && filteredDivisionItems.length === 0 && (
              <p className="text-[10px] text-amber-700">Tidak ada item yang cocok. Coba kata kunci lain atau periksa lokasi / kelompok RAB.</p>
            )}
          </div>

          {selectedItem && (
            <label className="block text-xs font-semibold text-slate-700">
              Tingkat backup tujuan
              <select value={targetPath} onChange={(event) => setTargetPath(event.target.value)} disabled={saving} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <option value={ROOT_PATH}>AHSP induk · {selectedItem.unit}</option>
                {subitemChoices.map((choice) => (
                  <option key={choice.path} value={choice.path}>
                    {'　'.repeat(choice.depth)}{choice.code ? choice.code + ' — ' : ''}{choice.name} {choice.unit ? '(' + choice.unit + ')' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedItem && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              {sameSourceTarget ? (
                <p className="font-semibold text-rose-700">Sumber dan tujuan adalah backup yang sama. Pilih AHSP atau sub-item tujuan yang berbeda.</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-800">Backup yang sudah ada di tujuan</p>
                  <p className="mt-1 text-slate-600">
                    {loadingCount ? 'Memeriksa jumlah rincian...' : existingCount === null ? 'Jumlah backup belum dapat diperiksa.' : existingCount + ' rincian'}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-800">Tentukan perlakuan backup tujuan setiap kali menyalin</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setMode('replace')} disabled={saving} className={'rounded-xl border p-3 text-left transition ' + (mode === 'replace' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 hover:border-slate-300')}>
                <span className="block text-sm font-bold text-slate-900">Ganti</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Hapus rincian backup tujuan yang lama, lalu isi dengan salinan dari sumber.</span>
              </button>
              <button type="button" onClick={() => setMode('append')} disabled={saving} className={'rounded-xl border p-3 text-left transition ' + (mode === 'append' ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300')}>
                <span className="block text-sm font-bold text-slate-900">Tambahkan</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Pertahankan rincian lama dan tambahkan semua rincian dari sumber.</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Semua uraian, referensi gambar, mode dan parameter rumus, faktor pengali, serta hasil setiap rincian ikut disalin. ID rincian dibuat baru sehingga hasil salinan berdiri sendiri dan dapat diedit tanpa mengubah sumber.
          </div>

          {selectedSubitem && <p className="text-[11px] text-slate-500">Lokasi sasaran: sub-item {selectedSubitem.code} — {selectedSubitem.name}.</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={saving || !selectedItem || !mode || sourceDetailsCount < 1 || sameSourceTarget || existingCount === null || loadingCount}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {saving ? 'Menyalin...' : 'Salin backup'}
          </button>
        </footer>
      </section>
    </div>
  );
}
