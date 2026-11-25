'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  Printer,
  RefreshCw,
  Loader2,
  AlertCircle,
  Wallet,
  ClipboardList,
} from 'lucide-react';
import { fetchProjectDetail } from '@/lib/services/projectService';
import { formatRupiah } from '@/lib/format';

type RabItem = {
  id: string;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  volume?: number | string | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
  sort_order?: number | null;
  work_group_id?: string | null;
  work_group_name?: string | null;
};

type RabDivision = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  items?: RabItem[] | null;
};

type CurveProject = {
  id: string;
  title: string;
  client?: string | null;
  location?: string | null;
  status?: string | null;
  project_category?: 'REGULER' | 'PORTOFOLIO';
  total_value?: number | string | null;
  school_npsn?: string | null;
  principal_name?: string | null;
  principal_nip?: string | null;
  principal_nik?: string | null;
  p2sp_chair_name?: string | null;
  planning_consultant?: string | null;
  planning_consultant_skk?: string | null;
  supervisory_consultant?: string | null;
  supervisory_consultant_skk?: string | null;
  kabupaten_kota?: string | null;
  start_date?: string | null;
  contract_start_date?: string | null;
  divisions?: RabDivision[] | null;
};

type SourceWorkRow = {
  id: string;
  code: string;
  name: string;
  divisionName: string;
  divisionOrder: number;
  itemOrder: number;
  itemCount: number;
  total: number;
};

type WorkRow = SourceWorkRow & {
  weight: number;
  allocations: number[];
  startWeek: number;
  endWeek: number;
};

type PeriodRow = {
  index: number;
  monthIndex: number;
  weekInMonth: number;
  cumulative: number;
  weight: number;
  amount: number;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const localMonthValue = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const monthDate = (monthValue: string, offset = 0): Date => {
  const [yearPart, monthPart] = monthValue.split('-');
  const year = Number(yearPart) || new Date().getFullYear();
  const month = (Number(monthPart) || 1) - 1;
  return new Date(year, month + offset, 1);
};

const monthLabel = (date: Date): string =>
  new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);

const decimal = (value: number, digits = 2): string =>
  value.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const percent = (value: number, digits = 2): string => `${decimal(value, digits)}%`;

/**
 * Bentuk distribusi kumulatif rencana pada pola S.
 * Hasil antarpekan adalah selisih nilai kumulatif dua periode berurutan.
 */
const sCurveProgress = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 100;
  const numerator = t * t;
  const denominator = numerator + (1 - t) * (1 - t);
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
};

function normalizeStageName(value: string): string {
  return value
    .toLocaleLowerCase('id-ID')
    .trim()
    .replace(/[.,;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Menggabungkan tahapan dengan nama yang sama dari seluruh divisi/lokasi.
 * Dengan demikian, Persiapan Kelas A dan Persiapan Kelas B menjadi satu tahap
 * yang dijadwalkan pada rentang minggu yang sama.
 */
function makeWorkRows(divisions: RabDivision[]): SourceWorkRow[] {
  type StageAccumulator = {
    id: string;
    codeSet: Set<string>;
    name: string;
    divisionNames: string[];
    divisionOrder: number;
    itemOrder: number;
    itemCount: number;
    total: number;
  };

  const stages = new Map<string, StageAccumulator>();
  const sortedDivisions = [...divisions].sort(
    (a, b) => numberValue(a.sort_order) - numberValue(b.sort_order),
  );

  sortedDivisions.forEach((division, divisionIndex) => {
    const items = [...(division.items ?? [])].sort(
      (a, b) => numberValue(a.sort_order) - numberValue(b.sort_order),
    );
    const localGroups = new Map<string, {
      codes: string[];
      name: string;
      itemOrder: number;
      total: number;
      count: number;
    }>();

    items.forEach((item, itemIndex) => {
      const groupKey = item.work_group_id
        ? `group:${item.work_group_id}`
        : `item:${item.id}`;
      const existing = localGroups.get(groupKey);
      const code = String(item.code ?? '').trim();
      const itemName = String(item.name ?? 'Item pekerjaan tanpa nama').trim();

      if (existing) {
        if (code && !existing.codes.includes(code)) existing.codes.push(code);
        existing.total += numberValue(item.total_price);
        existing.count += 1;
        existing.itemOrder = Math.min(existing.itemOrder, itemIndex);
      } else {
        localGroups.set(groupKey, {
          codes: code ? [code] : [],
          name: String(item.work_group_name ?? '').trim() || itemName,
          itemOrder: itemIndex,
          total: numberValue(item.total_price),
          count: 1,
        });
      }
    });

    [...localGroups.values()].forEach((item) => {
      if (item.total <= 0) return;

      const stageKey = normalizeStageName(item.name);
      const existingStage = stages.get(stageKey);
      if (existingStage) {
        item.codes.forEach((code) => existingStage.codeSet.add(code));
        if (!existingStage.divisionNames.includes(division.name)) {
          existingStage.divisionNames.push(division.name);
        }
        existingStage.divisionOrder = Math.min(existingStage.divisionOrder, divisionIndex);
        existingStage.itemOrder = Math.min(existingStage.itemOrder, item.itemOrder);
        existingStage.itemCount += item.count;
        existingStage.total += item.total;
      } else {
        stages.set(stageKey, {
          id: stageKey || `stage-${divisionIndex}-${item.itemOrder}`,
          codeSet: new Set(item.codes),
          name: item.name,
          divisionNames: [division.name],
          divisionOrder: divisionIndex,
          itemOrder: item.itemOrder,
          itemCount: item.count,
          total: item.total,
        });
      }
    });
  });

  return [...stages.values()]
    .sort((a, b) => a.itemOrder - b.itemOrder || a.divisionOrder - b.divisionOrder)
    .map((stage) => ({
      id: stage.id,
      code: [...stage.codeSet].join(', '),
      name: stage.name,
      divisionName: stage.divisionNames.join(', '),
      divisionOrder: stage.divisionOrder,
      itemOrder: stage.itemOrder,
      itemCount: stage.itemCount,
      total: stage.total,
    }));
}

function formatShortRupiah(value: number): string {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  }
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt`;
  }
  return formatRupiah(value);
}

export default function CurvaSRencanaPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [project, setProject] = useState<CurveProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [startMonth, setStartMonth] = useState(localMonthValue);
  const [durationMonths, setDurationMonths] = useState(3);

  const loadData = useCallback(async (refresh = false) => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');

    try {
      const result = await fetchProjectDetail(projectId);
      const projectData = result ? (result as unknown as CurveProject) : null;
      setProject(projectData);
      const projectStart = projectData?.start_date ?? projectData?.contract_start_date;
      if (projectStart && /^\d{4}-\d{2}/.test(projectStart)) {
        setStartMonth(projectStart.slice(0, 7));
      }
    } catch (error) {
      console.error('Gagal memuat data Kurva-S:', error);
      setProject(null);
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat data proyek.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sourceRows = useMemo(
    () => makeWorkRows(project?.divisions ?? []),
    [project?.divisions],
  );

  const totalRAB = useMemo(
    () => sourceRows.reduce((sum, row) => sum + row.total, 0),
    [sourceRows],
  );

  // Satu bulan dibagi menjadi empat periode mingguan.
  const periods = useMemo<PeriodRow[]>(() => {
    const count = Math.max(4, Math.min(24, Math.round(durationMonths) * 4));
    return Array.from({ length: count }, (_, index) => {
      const progress = sCurveProgress((index + 1) / count);
      const previous = sCurveProgress(index / count);
      const weight = Math.max(0, progress - previous);
      const monthIndex = Math.floor(index / 4);
      return {
        index,
        monthIndex,
        weekInMonth: (index % 4) + 1,
        cumulative: progress,
        weight,
        amount: totalRAB * weight / 100,
      };
    });
  }, [durationMonths, totalRAB]);

  const scheduledRows = useMemo<WorkRow[]>(() => {
    if (totalRAB <= 0 || periods.length === 0) return [];

    const boundaries = [0, ...periods.map((period) => period.cumulative)];
    let runningWeight = 0;

    return sourceRows.map((row) => {
      const weight = row.total / totalRAB * 100;
      const taskStart = runningWeight;
      const taskEnd = taskStart + weight;
      runningWeight = taskEnd;

      const allocations = periods.map((_, periodIndex) => {
        const periodStart = boundaries[periodIndex];
        const periodEnd = boundaries[periodIndex + 1];
        return Math.max(
          0,
          Math.min(taskEnd, periodEnd) - Math.max(taskStart, periodStart),
        );
      });

      const activeWeeks = allocations
        .map((value, index) => value > 0.0000001 ? index : -1)
        .filter((index) => index >= 0);

      return {
        ...row,
        weight,
        allocations,
        startWeek: activeWeeks.length ? activeWeeks[0] + 1 : 1,
        endWeek: activeWeeks.length ? activeWeeks[activeWeeks.length - 1] + 1 : 1,
      };
    });
  }, [sourceRows, totalRAB, periods]);

  const cumulativePath = useMemo(() => {
    if (periods.length === 0) return '';
    return periods.map((period, index) => {
      const x = ((index + 0.5) / periods.length) * 1000;
      const y = (1 - period.cumulative / 100) * 1000;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  }, [periods]);

  const totalWeight = scheduledRows.reduce((sum, row) => sum + row.weight, 0);
  const weeklyRowHeightMm = scheduledRows.length > 0
    ? Math.max(2.15, Math.min(4.1, 108 / scheduledRows.length))
    : 3.2;
  const printTableFontPt = scheduledRows.length > 0
    ? Math.max(4, Math.min(6.2, 145 / scheduledRows.length))
    : 5.5;
  const principalIdentityNumber = project?.principal_nik || project?.principal_nip || '—';

  const renderScheduleTable = (mode: 'screen' | 'print') => {
    const isPrint = mode === 'print';
    const weekCount = periods.length;
    const weekColumnWidth = 62 / weekCount;

    return (
      <div className={isPrint ? 'curve-table-print' : 'curve-table-screen'}>
        <div
          className="curve-table-overlay-anchor"
          style={{
            '--curve-row-height': `${weeklyRowHeightMm}mm`,
            '--curve-header-height': '8mm',
            '--curve-table-font': `${printTableFontPt}pt`,
          } as CSSProperties}
        >
          <table className="curve-week-table">
            <colgroup>
              <col style={{ width: '3.5%' }} />
              <col style={{ width: '23.5%' }} />
              <col style={{ width: '7%' }} />
              {periods.map((period) => (
                <col key={period.index} style={{ width: `${weekColumnWidth}%` }} />
              ))}
              <col style={{ width: '4%' }} />
            </colgroup>
            <thead>
              <tr className="curve-month-row">
                <th rowSpan={2}>No.</th>
                <th rowSpan={2}>Uraian Pekerjaan</th>
                <th rowSpan={2}>Bobot (%)</th>
                {Array.from({ length: durationMonths }, (_, monthIndex) => (
                  <th key={monthIndex} colSpan={4}>
                    {monthLabel(monthDate(startMonth, monthIndex)).toUpperCase()}
                  </th>
                ))}
                <th rowSpan={2}>Keterangan</th>
              </tr>
              <tr className="curve-week-row">
                {periods.map((period) => (
                  <th key={period.index}>W{period.weekInMonth}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scheduledRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="curve-cell-center">{index + 1}</td>
                  <td className="curve-work-description" title={`${row.name} — ${row.divisionName}`}>
                    <span>{row.name} <em>({row.divisionName})</em></span>
                  </td>
                  <td className="curve-cell-number">{decimal(row.weight)}</td>
                  {row.allocations.map((allocation, periodIndex) => (
                    <td
                      key={periodIndex}
                      className={`curve-cell-number curve-week-value ${allocation > 0.0000001 ? 'curve-week-active' : ''}`}
                    >
                      {allocation > 0.0000001 ? decimal(allocation) : ''}
                    </td>
                  ))}
                  <td className="curve-cell-center curve-time-cell">
                    {`B${Math.floor((row.startWeek - 1) / 4) + 1}${Math.floor((row.endWeek - 1) / 4) + 1 !== Math.floor((row.startWeek - 1) / 4) + 1 ? `–B${Math.floor((row.endWeek - 1) / 4) + 1}` : ''}`}
                  </td>
                </tr>
              ))}
              {scheduledRows.length === 0 && (
                <tr><td colSpan={periods.length + 4} className="curve-empty-row">Belum ada item pekerjaan RAB bernilai positif.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="curve-total-row">
                <th colSpan={2}>TOTAL</th>
                <th className="curve-cell-number">{decimal(totalWeight)}</th>
                {periods.map((period) => <th key={period.index} className="curve-cell-number">{decimal(period.weight)}</th>)}
                <th />
              </tr>
              <tr className="curve-planned-row">
                <th colSpan={3}>PROGRES RENCANA</th>
                {periods.map((period) => <td key={period.index} className="curve-cell-number">{decimal(period.weight)}</td>)}
                <td />
              </tr>
              <tr className="curve-cumulative-row">
                <th colSpan={3}>TOTAL KUMULATIF PROGRES RENCANA</th>
                {periods.map((period) => <td key={period.index} className="curve-cell-number">{decimal(period.cumulative)}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>

          {scheduledRows.length > 0 && (
            <svg
              className="curve-inline-line"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{
                left: '34%',
                top: '8mm',
                width: '62%',
                height: `${weeklyRowHeightMm * scheduledRows.length}mm`,
              }}
            >
              <path d={cumulativePath} fill="none" stroke="#ffffff" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
              <path d={cumulativePath} fill="none" stroke="#b64b4b" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              {periods.map((period, index) => {
                const x = ((index + 0.5) / periods.length) * 1000;
                const y = (1 - period.cumulative / 100) * 1000;
                const showLabel = periods.length <= 16 || index % 2 === 1 || index === periods.length - 1;
                return (
                  <g key={period.index}>
                    <circle cx={x} cy={y} r="12" fill="#b64b4b" stroke="#fff" strokeWidth="5" />
                    {showLabel && (
                      <text
                        x={x}
                        y={y < 125 ? y + 40 : y - 25}
                        textAnchor="middle"
                        fontSize={periods.length > 16 ? 20 : 24}
                        fontWeight="700"
                        fill="#334155"
                        stroke="#fff"
                        strokeWidth="5"
                        paintOrder="stroke"
                      >
                        {decimal(period.cumulative, 1)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="min-h-[70vh] bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />
          Memuat data proyek...
        </div>
      </main>
    );
  }

  if (errorMessage || !project) {
    return (
      <main className="min-h-[70vh] bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-bold">Data proyek belum dapat dimuat</h1>
              <p className="mt-1 text-sm text-red-600">{errorMessage || 'Proyek tidak ditemukan atau tidak memiliki akses.'}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => void loadData(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </button>
            <Link href={`/proyek/${projectId}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Kembali ke RAB
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const startLabel = monthLabel(monthDate(startMonth));
  const endLabel = monthLabel(monthDate(startMonth, durationMonths - 1));

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div id="curva-s-screen" className="mx-auto max-w-[1600px] space-y-4 print:hidden">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-800">JAVAWASTHU MANAGEMENT</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Kurva-S Rencana</h1>
            <p className="mt-1 text-sm text-slate-500">{project.title} · {project.client || project.location || 'Data proyek'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/proyek/${project.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Kembali ke RAB
            </Link>
            <button type="button" onClick={() => void loadData(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Segarkan
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
              <Printer className="h-4 w-4" /> Cetak / PDF
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Wallet className="h-4 w-4 text-emerald-700" /> Nilai RAB</div>
            <div className="mt-1.5 text-xl font-extrabold text-slate-900">{formatShortRupiah(totalRAB)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><ClipboardList className="h-4 w-4 text-emerald-700" /> Jumlah pekerjaan</div>
            <div className="mt-1.5 text-xl font-extrabold text-slate-900">{scheduledRows.length} item</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><CalendarDays className="h-4 w-4 text-emerald-700" /> Periode</div>
            <div className="mt-1.5 text-lg font-extrabold text-slate-900">{startLabel} – {endLabel}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="font-extrabold text-slate-900">Waktu pelaksanaan</h2>
            <p className="mt-1 text-sm text-slate-500">Pilih bulan mulai dan lamanya pelaksanaan.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Bulan mulai</span>
              <input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value || localMonthValue())} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Durasi (bulan)</span>
              <input type="number" min={1} max={6} step={1} value={durationMonths} onChange={(event) => setDurationMonths(Math.max(1, Math.min(6, Math.round(Number(event.target.value) || 1))))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800" />
            </label>
            <div className="flex flex-wrap gap-2">
              {[3, 4, 5, 6].map((month) => (
                <button key={month} type="button" onClick={() => setDurationMonths(month)} className={`rounded-lg border px-3 py-2.5 text-sm font-bold ${durationMonths === month ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {month} bln
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="font-extrabold text-slate-900">Rencana waktu pelaksanaan</h2>
            <p className="mt-1 text-sm text-slate-500">{project.title} · {project.client || 'Pemilik proyek'} · {durationMonths} bulan</p>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[1150px]">
              {renderScheduleTable('screen')}
            </div>
          </div>
        </section>
      </div>

      <section id="curva-s-print" aria-label="Rencana waktu pelaksanaan" className="hidden">
        {project.project_category === 'PORTOFOLIO' && (
          <div className="curve-portfolio-watermark" aria-hidden="true">LAPORAN DUMMY/SAMPEL</div>
        )}
        <header className="curve-report-heading">
          <div className="curve-report-title">
            <strong>JAVAWASTHU MANAGEMENT</strong>
            <h1>RENCANA WAKTU PELAKSANAAN</h1>
          </div>
          <div className="curve-report-duration">
            <strong>{durationMonths} BULAN</strong>
            <span>{startLabel} – {endLabel}</span>
          </div>
        </header>

        <section className="curve-project-identity">
          <div className="curve-project-name"><span>Nama Kegiatan</span><strong>{project.title || '—'}</strong></div>
          <div><span>Pemilik / Instansi</span><strong>{project.client || '—'}</strong></div>
          <div><span>Lokasi Pekerjaan</span><strong>{project.location || '—'}</strong></div>
          <div><span>Kabupaten / Kota</span><strong>{project.kabupaten_kota || '—'}</strong></div>
          <div><span>NPSN</span><strong>{project.school_npsn || '—'}</strong></div>
          <div><span>Nilai RAB</span><strong>{formatRupiah(totalRAB)}</strong></div>
          {project.p2sp_chair_name ? <div><span>Ketua P2SP</span><strong>{project.p2sp_chair_name}</strong></div> : null}
          {project.supervisory_consultant ? <div><span>Konsultan Pengawas</span><strong>{project.supervisory_consultant}</strong></div> : null}
        </section>

        <section className="curve-report-table-section">
          {renderScheduleTable('print')}
        </section>

        <footer className="curve-report-signatures">
          <div className="curve-signature-block">
            <strong>KONSULTAN PERENCANA</strong>
            <div className="curve-signature-gap" />
            <b>{project.planning_consultant || '...................................................'}</b>
            <span>No. SKK: {project.planning_consultant_skk || '................................'}</span>
          </div>
          <div className="curve-signature-block">
            <strong>MENGETAHUI, KEPALA SEKOLAH</strong>
            <div className="curve-signature-gap" />
            <b>{project.principal_name || '...................................................'}</b>
            <span>NIK / NIP: {principalIdentityNumber}</span>
          </div>
        </footer>
      </section>

      <style jsx global>{`
        .curve-table-overlay-anchor {
          position: relative;
          width: 100%;
          min-width: 0;
          --curve-row-height: 3.2mm;
        }
        .curve-week-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          color: #111827;
          font-family: Arial, Helvetica, sans-serif;
          font-variant-numeric: tabular-nums;
        }
        .curve-week-table th,
        .curve-week-table td {
          border: 1px solid #5d6670;
          padding: .7px 1.1px;
          vertical-align: middle;
          overflow: hidden;
        }
        .curve-week-table thead tr { height: 4mm; }
        .curve-week-table thead th {
          background: #f1f3f5;
          text-align: center;
          font-size: 6.2pt;
          line-height: 1;
          font-weight: 800;
          white-space: nowrap;
        }
        .curve-week-table thead .curve-week-row th { font-size: 5.8pt; }
        .curve-week-table tbody tr { height: var(--curve-row-height); }
        .curve-week-table tbody td {
          font-size: var(--curve-table-font);
          line-height: 1;
          white-space: nowrap;
        }
        .curve-cell-center { text-align: center; }
        .curve-cell-number { text-align: center; }
        .curve-work-description {
          text-align: left;
          padding-left: 2px !important;
        }
        .curve-work-description span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 600;
        }
        .curve-work-description em {
          color: #475569;
          font-style: normal;
          font-weight: 400;
        }
        .curve-week-value { color: #64748b; }
        .curve-week-active {
          background: #ffed00;
          color: #111827;
          font-weight: 700;
        }
        .curve-time-cell { font-size: 5.3pt !important; }
        .curve-week-table tfoot th,
        .curve-week-table tfoot td {
          height: 3.4mm;
          background: #f4f6f7;
          font-size: 5.8pt;
          line-height: 1;
          font-weight: 800;
          white-space: nowrap;
        }
        .curve-week-table tfoot .curve-total-row th { background: #e5e7eb; }
        .curve-week-table tfoot .curve-planned-row th,
        .curve-week-table tfoot .curve-planned-row td { background: #f7f7f7; }
        .curve-week-table tfoot .curve-cumulative-row th,
        .curve-week-table tfoot .curve-cumulative-row td { background: #e9eef3; }
        .curve-empty-row { height: 12mm; text-align: center; font-size: 8pt !important; color: #64748b; }
        .curve-inline-line {
          position: absolute;
          z-index: 4;
          display: block;
          overflow: visible;
          pointer-events: none;
        }
        .curve-table-screen .curve-inline-line { opacity: .92; }
        .curve-report-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 1.2px solid #111827;
          padding-bottom: 1.2mm;
        }
        .curve-report-title strong {
          display: block;
          margin-bottom: .5mm;
          font-size: 7pt;
          letter-spacing: .13em;
        }
        .curve-report-title h1 {
          margin: 0;
          font-size: 12pt;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .04em;
        }
        .curve-report-duration {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: .5mm;
          font-size: 6.5pt;
        }
        .curve-report-duration strong { font-size: 8pt; }
        .curve-project-identity {
          display: grid;
          grid-template-columns: 2fr 1.1fr 1.35fr 1.3fr .7fr 1.15fr 1.2fr;
          gap: 1.4mm 3mm;
          padding: 2mm 0;
          border-bottom: 1px solid #9ca3af;
        }
        .curve-project-identity > div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: .4mm;
        }
        .curve-project-identity span {
          color: #4b5563;
          font-size: 5.2pt;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: .035em;
        }
        .curve-project-identity strong {
          overflow-wrap: anywhere;
          color: #111827;
          font-size: 6.4pt;
          line-height: 1.15;
        }
        .curve-project-name { grid-column: span 2; }
        .curve-report-table-section { padding-top: 2mm; }
        .curve-table-print .curve-week-table thead tr { height: 4mm; }
        .curve-table-print .curve-week-table tbody tr { height: var(--curve-row-height); }
        .curve-table-print .curve-week-table tbody td { font-size: var(--curve-table-font); }
        .curve-report-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25mm;
          padding: 2mm 20mm 0;
          margin-top: 2mm;
          border-top: 1px solid #9ca3af;
        }
        .curve-signature-block {
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          color: #111827;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.1;
        }
        .curve-signature-block > strong { font-size: 6.2pt; }
        .curve-signature-gap { height: 7mm; }
        .curve-signature-block b {
          max-width: 100%;
          border-bottom: 1px solid #111827;
          padding: 0 3mm .5mm;
          font-size: 6.5pt;
          text-align: center;
        }
        .curve-signature-block span { margin-top: .7mm; font-size: 5.8pt; }
        @page { size: A4 landscape; margin: 10mm; }
        #curva-s-print { display: none; }
        .curve-portfolio-watermark { display:none; }

        @media print {
          html, body {
            width: 277mm !important;
            min-width: 277mm !important;
            min-height: 190mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #curva-s-screen { display: none !important; }
          #curva-s-print,
          #curva-s-print * { visibility: visible !important; }
          .curve-portfolio-watermark { display:block!important; position:fixed!important; z-index:9999!important; top:43%!important; left:0!important; width:100%!important; transform:rotate(-32deg)!important; color:#9f1239!important; opacity:.14!important; font-size:30pt!important; font-weight:900!important; letter-spacing:4px!important; text-align:center!important; white-space:nowrap!important; pointer-events:none!important; }
          #curva-s-print {
            display: block !important;
            position: relative !important;
            width: 277mm !important;
            height: 190mm !important;
            max-height: 190mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #fff !important;
            color: #111827 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            writing-mode: horizontal-tb !important;
            direction: ltr !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            break-after: avoid-page !important;
          }
          #curva-s-print * {
            box-sizing: border-box !important;
            writing-mode: horizontal-tb !important;
            direction: ltr !important;
            transform: none !important;
          }
          .curve-report-signatures,
          .curve-report-table-section,
          .curve-project-identity { break-inside: avoid !important; page-break-inside: avoid !important; }
          .curve-week-table { break-inside: avoid !important; page-break-inside: avoid !important; }
          .curve-week-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          .curve-week-table thead { display: table-header-group !important; }
          .curve-week-table tfoot { display: table-row-group !important; }
          .curve-table-print .curve-inline-line { opacity: 1 !important; }
        }
      `}</style>
    </main>
  );
}
