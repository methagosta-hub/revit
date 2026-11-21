import type { Project, BoqItem, Report, ReportItem, CurvePoint } from "./types";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dayDifference(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

export function itemPlannedPercent(item: BoqItem, project: Project, date: string) {
  const start = item.planned_start_date || project.start_date;
  const end = item.planned_end_date || project.end_date;
  if (date < start) return 0;
  if (date >= end) return 100;
  const duration = Math.max(1, dayDifference(start, end));
  const progress = Math.max(0, Math.min(1, dayDifference(start, date) / duration));
  // Smoothstep: awal dan akhir pekerjaan lebih landai, bagian tengah lebih cepat.
  return 100 * progress * progress * (3 - 2 * progress);
}

export function itemAmount(item: BoqItem) {
  return Number(item.quantity || 0) * Number(item.unit_price || 0);
}

export function calculateWeights(items: BoqItem[]) {
  const total = items.reduce((sum, item) => sum + itemAmount(item), 0);
  return {
    total,
    weights: Object.fromEntries(items.map((item) => [
      item.id,
      total > 0 ? itemAmount(item) / total * 100 : 0,
    ])) as Record<string, number>,
  };
}

export function plannedProgress(project: Project, items: BoqItem[], date: string) {
  const { total } = calculateWeights(items);
  if (total <= 0) return 0;
  return items.reduce((sum, item) => {
    const weight = itemAmount(item) / total * 100;
    return sum + weight * itemPlannedPercent(item, project, date) / 100;
  }, 0);
}

export function reportProgress(items: ReportItem[]) {
  return items.reduce((sum, item) => sum + Number(item.weighted_progress_snapshot || 0), 0);
}

export function buildCurvePoints(
  project: Project,
  items: BoqItem[],
  reports: Report[],
  reportItems: ReportItem[],
): CurvePoint[] {
  const byReport = new Map<string, number>();
  for (const report of reports) {
    const total = reportItems
      .filter((item) => item.report_id === report.id)
      .reduce((sum, item) => sum + Number(item.weighted_progress_snapshot || 0), 0);
    byReport.set(report.report_date, total);
  }

  const dates = new Set<string>([project.start_date, project.end_date, ...reports.map((item) => item.report_date)]);
  const start = parseDate(project.start_date);
  const end = parseDate(project.end_date);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  for (let offset = 7; offset < totalDays; offset += 7) {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    dates.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  }
  return Array.from(dates).sort().map((date) => ({
    date,
    planned: plannedProgress(project, items, date),
    actual: byReport.has(date) ? byReport.get(date)! : null,
  }));
}
