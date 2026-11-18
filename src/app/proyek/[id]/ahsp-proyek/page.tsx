'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  MapPin,
  FileSpreadsheet,
  Layers,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Plus,
  Database,
} from 'lucide-react';
import AhspPickerModal, {
  type SelectedAhspBatchPayload,
} from '@/components/rab/AhspPickerModal';
import RabTable, {
  type RabTableItem,
  type RabItemUpdate,
  type RabComponentsUpdate,
} from '@/components/rab/RabTable';
import { fetchProjectDetail, recalculateProjectTotal } from '@/lib/services/projectService';
import { generateRABExcel } from '@/lib/excel-generator';
import { formatRupiah } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/types/rab';

type RABDivision = {
  id: string;
  name: string;
  code?: string;
  items?: RabTableItem[] | null;
};

type WorkspaceProject = Omit<Project, 'divisions'> & {
  id: string;
  title: string;
  client?: string;
  location?: string;
  status?: string;
  divisions?: RABDivision[] | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan yang tidak diketahui.';
}

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [activeDivisionName, setActiveDivisionName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadData = useCallback(async (showRefreshState = false) => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const data = await fetchProjectDetail(projectId);
      setProject(data ? (data as unknown as WorkspaceProject) : null);
    } catch (error) {
      console.error('Gagal memuat detail proyek:', error);
      setProject(null);
      setErrorMessage(`Gagal memuat data proyek: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const divisions = project?.divisions ?? [];

  const divisionTotals = useMemo(
    () =>
      divisions.map((division) => ({
        id: division.id,
        total: (division.items ?? []).reduce(
          (sum, item) => sum + Number(item.total_price || 0),
          0,
        ),
      })),
    [divisions],
  );

  const totalRAB = useMemo(
    () => divisionTotals.reduce((sum, division) => sum + division.total, 0),
    [divisionTotals],
  );

  const totalItems = useMemo(
    () => divisions.reduce((sum, division) => sum + (division.items?.length ?? 0), 0),
    [divisions],
  );

  const openAhspPicker = (divisionId: string, divisionName: string) => {
    setActiveDivisionId(divisionId);
    setActiveDivisionName(divisionName);
    setErrorMessage('');
    setSuccessMessage('');
    setPickerOpen(true);
  };

  const handleAddAhsp = async (batch: SelectedAhspBatchPayload) => {
    if (!activeDivisionId || submitting) {
      throw new Error('Divisi tujuan belum dipilih.');
    }

    if (!batch.items.length) {
      throw new Error('Pilih minimal satu AHSP untuk dimasukkan ke RAB.');
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      // Cegah item AHSP yang sama tersimpan dua kali dalam satu batch.
      const masterIds = batch.items.map((item) => item.masterAhspId);
      const uniqueMasterIds = [...new Set(masterIds)];

      if (uniqueMasterIds.length !== batch.items.length) {
        throw new Error('AHSP yang sama terpilih lebih dari sekali. Periksa daftar sebelum menyimpan.');
      }

      // Ambil ulang identitas dari Master AHSP agar kode, uraian, dan satuan
      // tidak bergantung pada nilai yang dikirim dari browser.
      const { data: masterRows, error: masterError } = await supabase
        .from('master_ahsp')
        .select('id, code, name, unit')
        .in('id', uniqueMasterIds);

      if (masterError) throw masterError;

      type MasterAhspIdentity = {
        id: string;
        code: string;
        name: string;
        unit: string | null;
      };

      const masterById = new Map<string, MasterAhspIdentity>();
      (masterRows ?? []).forEach((row: MasterAhspIdentity) => {
        masterById.set(row.id, row);
      });

      if (masterById.size !== uniqueMasterIds.length) {
        throw new Error('Sebagian AHSP tidak ditemukan pada Master AHSP. Muat ulang pemilih AHSP dan coba kembali.');
      }

      const currentDivision = divisions.find(
        (division) => division.id === activeDivisionId,
      );

      if (!currentDivision) {
        throw new Error('Divisi tujuan tidak ditemukan. Segarkan halaman lalu coba kembali.');
      }

      const baseSortOrder = (currentDivision.items ?? []).reduce(
        (max, item) => Math.max(max, Number(item.sort_order ?? 0)),
        0,
      );

      const insertRows = batch.items.map((payload, index) => {
        const sourceAhsp = masterById.get(payload.masterAhspId);
        const lockedUnit = String(sourceAhsp?.unit ?? '').trim();

        if (!sourceAhsp || !lockedUnit) {
          throw new Error(
            `AHSP ${payload.code} belum memiliki satuan yang valid di Master AHSP.`,
          );
        }

        if (!Number.isFinite(payload.volume) || payload.volume <= 0) {
          throw new Error(`Volume AHSP ${payload.code} harus lebih besar dari nol.`);
        }

        if (!Number.isFinite(payload.unitPrice) || payload.unitPrice < 0) {
          throw new Error(`Harga satuan AHSP ${payload.code} tidak valid.`);
        }

        const totalPrice = Number(
          (payload.volume * payload.unitPrice).toFixed(2),
        );

        if (!Number.isFinite(totalPrice)) {
          throw new Error(`Total harga AHSP ${payload.code} tidak valid.`);
        }

        return {
          division_id: activeDivisionId,
          master_ahsp_id: sourceAhsp.id,
          code: sourceAhsp.code,
          name: sourceAhsp.name,
          // Satuan dikunci dari Master AHSP saat dimasukkan ke proyek.
          unit: lockedUnit,
          volume: payload.volume,
          unit_price: payload.unitPrice,
          total_price: totalPrice,
          components_snapshot: payload.componentsSnapshot,
          is_volume_from_backup: false,
          sort_order: baseSortOrder + index + 1,
        };
      });

      // Satu operasi insert untuk seluruh batch agar tidak menyimpan sebagian
      // item bila salah satu baris gagal divalidasi oleh database.
      const { error } = await supabase
        .from('rab_items')
        .insert(insertRows);

      if (error) throw error;

      await loadData(true);

      setSuccessMessage(
        `${insertRows.length} AHSP berhasil ditambahkan ke divisi ${activeDivisionName}.`,
      );
    } catch (error) {
      console.error('Gagal menambahkan batch AHSP ke RAB:', error);
      setErrorMessage(`Gagal menambahkan AHSP: ${getErrorMessage(error)}`);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateItem = async (itemId: string, changes: RabItemUpdate) => {
    try {
      const { error } = await supabase
        .from('rab_items')
        .update({
          code: changes.code,
          name: changes.name,
          // Kolom unit tidak disertakan: satuan RAB adalah snapshot terkunci
          // dari Master AHSP ketika item pertama kali dimasukkan.
          volume: changes.volume,
          total_price: changes.total_price,
        })
        .eq('id', itemId);

      if (error) throw error;

      await loadData(true);
      setSuccessMessage('Item RAB berhasil diperbarui. Snapshot AHSP lainnya tetap tidak berubah.');
    } catch (error) {
      console.error('Gagal memperbarui item RAB:', error);
      setErrorMessage(`Gagal memperbarui item RAB: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateComponents = async (itemId: string, changes: RabComponentsUpdate) => {
    try {
      // Menyimpan hanya snapshot milik item proyek ini; master tidak disentuh.
      const { error } = await supabase
        .from('rab_items')
        .update({
          components_snapshot: changes.components_snapshot,
          subitems_snapshot: changes.subitems_snapshot,
          unit_price: changes.unit_price,
          total_price: changes.total_price,
        })
        .eq('id', itemId);

      if (error) throw error;
      if (projectId) await recalculateProjectTotal(projectId);
      await loadData(true);
      setSuccessMessage('Rincian nama, koefisien, harga komponen, dan komposisi AHSP berhasil disimpan pada snapshot proyek. Master tidak berubah.');
    } catch (error) {
      console.error('Gagal memperbarui snapshot komponen RAB:', error);
      setErrorMessage('Gagal memperbarui komponen AHSP: ' + getErrorMessage(error));
      throw error;
    }
  };

  const handleDeleteItem = async (item: RabTableItem) => {
    try {
      const { error } = await supabase
        .from('rab_items')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await loadData(true);
      setSuccessMessage(`Item "${item.code}" berhasil dihapus dari RAB proyek.`);
    } catch (error) {
      console.error('Gagal menghapus item RAB:', error);
      setErrorMessage(`Gagal menghapus item RAB: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const handleExportExcel = async () => {
    if (!project || isExporting) return;

    setIsExporting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await generateRABExcel(project as unknown as Project);
      setSuccessMessage('File Excel RAB berhasil disiapkan.');
    } catch (error) {
      console.error('Gagal mengekspor Excel:', error);
      setErrorMessage(`Gagal mengekspor Excel: ${getErrorMessage(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-slate-500">
            Memuat data Workspace Proyek dari Supabase...
          </p>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Calculator className="h-7 w-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Proyek Tidak Ditemukan</h1>
        <p className="text-sm text-slate-500">
          Dokumen RAB tidak tersedia atau terjadi kendala saat memuat data.
        </p>
        {errorMessage && (
          <p role="alert" className="mx-auto max-w-xl text-sm text-rose-600">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Proyek
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Daftar Proyek
          </Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">
            <Layers className="h-4 w-4" />
            <span>Workspace Proyek · ID: {project.id}</span>
          </div>
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {project.title}
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/master/ahsp"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Database className="h-4 w-4" />
            Master AHSP
          </Link>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={isExporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {isExporting ? 'Menyiapkan Excel...' : 'Export Excel Profesional'}
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
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p className="min-w-0 flex-1">{errorMessage || successMessage}</p>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => {
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="opacity-70 transition hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-slate-400">Klien / Pemilik</p>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Building2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="break-words">{project.client || '-'}</span>
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-slate-400">Lokasi Proyek</p>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="break-words">{project.location || '-'}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Status Dokumen</p>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {project.status || 'Draft'}
          </span>
        </div>
        <div className="space-y-1 sm:text-left xl:text-right">
          <p className="text-xs font-medium text-slate-400">Total Akumulasi RAB</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {formatRupiah(totalRAB)}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rincian Anggaran Biaya per Divisi
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {divisions.length} divisi · {totalItems} item pekerjaan
            </p>
          </div>
          <span className="text-xs text-slate-400">
            AHSP dipilih dari database master dan disimpan sebagai snapshot proyek
          </span>
        </div>

        {divisions.length > 0 ? (
          divisions.map((division, divisionIndex) => {
            const divisionTotal =
              divisionTotals.find((entry) => entry.id === division.id)?.total ?? 0;
            const items = division.items ?? [];

            return (
              <article
                key={division.id || divisionIndex}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                      {divisionIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold uppercase tracking-wide text-slate-900">
                        {division.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {items.length} item pekerjaan
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-sm font-bold tabular-nums text-slate-900">
                      {formatRupiah(divisionTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAhspPicker(division.id, division.name)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah dari Master AHSP
                    </button>
                  </div>
                </div>

                <RabTable
                  items={items}
                  onUpdate={handleUpdateItem}
                  onUpdateComponents={handleUpdateComponents}
                  onDelete={handleDeleteItem}
                />
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Calculator className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              Belum ada divisi atau rincian RAB
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tambahkan divisi melalui pengelolaan proyek untuk mulai menyusun RAB.
            </p>
          </div>
        )}

        {divisions.length > 0 && (
          <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Total keseluruhan RAB
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Akumulasi seluruh subtotal divisi
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-900">
              {formatRupiah(totalRAB)}
            </p>
          </div>
        )}
      </section>

      <AhspPickerModal
        open={pickerOpen}
        divisionId={activeDivisionId}
        divisionName={activeDivisionName}
        onClose={() => {
          setPickerOpen(false);
          setActiveDivisionId(null);
          setActiveDivisionName('');
        }}
        onAdd={handleAddAhsp}
      />
    </main>
  );
}
