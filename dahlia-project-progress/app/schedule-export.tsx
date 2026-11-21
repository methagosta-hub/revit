"use client";

import { useMemo, useState } from "react";
import { FileDown, CheckSquare, Square } from "lucide-react";
import type { BoqItem, Project, WorkMenu } from "@/lib/types";
import { itemAmount, itemPlannedPercent } from "@/lib/curve";
import { dateLabel, money, number } from "@/lib/formatters";

type SignerKey = "school_head" | "p2sp" | "planner" | "supervisor";
type Week = { index: number; start: string; end: string; monthKey: string; monthLabel: string };
type ScheduleRow = { item: BoqItem; weight: number; amount: number; weekly: number[] };
type SignerOption = { key: SignerKey; label: string; title: string };

const SIGNERS: SignerOption[] = [
  { key: "school_head", label: "Kepala Sekolah", title: "Kepala Sekolah" },
  { key: "p2sp", label: "P2SP", title: "P2SP" },
  { key: "planner", label: "Perencana", title: "Perencana" },
  { key: "supervisor", label: "Pengawas", title: "Pengawas" },
];

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function buildWeeks(project: Project): Week[] {
  const result: Week[] = [];
  let cursor = parseLocalDate(project.start_date);
  const finalDate = parseLocalDate(project.end_date);
  while (cursor <= finalDate) {
    const start = dateKey(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > finalDate) weekEnd.setTime(finalDate.getTime());
    const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);
    result.push({
      index: result.length + 1,
      start,
      end: dateKey(weekEnd),
      monthKey: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      monthLabel,
    });
    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function percent(value: number) {
  return `${number(value, 2)}%`;
}

function ScheduleCurve({ values }: { values: number[] }) {
  const width = 1080;
  const height = 190;
  const left = 42;
  const right = 18;
  const top = 12;
  const bottom = 30;
  const x = (index: number) => left + (values.length <= 1 ? 0 : index / (values.length - 1)) * (width - left - right);
  const y = (value: number) => top + (100 - Math.max(0, Math.min(100, value))) / 100 * (height - top - bottom);
  const path = values.map((value, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  return (
    <div className="schedule-curve">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kurva progres rencana kumulatif mingguan">
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#dce3eb" strokeDasharray="4 4" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#65758b">{value}%</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#2d69b1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => (
          <circle key={index} cx={x(index)} cy={y(value)} r="3.2" fill="#2d69b1" stroke="#fff" strokeWidth="1.5">
            <title>Minggu ${index + 1}: ${percent(value)}</title>
          </circle>
        ))}
        {values.map((value, index) => {
          const shouldLabel = index === 0 || index === values.length - 1 || index % Math.max(1, Math.ceil(values.length / 10)) === 0;
          return shouldLabel ? <text key={`label-${index}`} x={x(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="#65758b">M{index + 1}</text> : null;
        })}
      </svg>
    </div>
  );
}

export default function ScheduleExport({ project, menu, items }: { project: Project; menu: WorkMenu; items: BoqItem[] }) {
  const [selectedSigners, setSelectedSigners] = useState<SignerKey[]>(["school_head", "p2sp", "planner", "supervisor"]);
  const weeks = useMemo(() => buildWeeks(project), [project.start_date, project.end_date]);
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + itemAmount(item), 0), [items]);
  const rows = useMemo<ScheduleRow[]>(() => items.map((item) => {
    const amount = itemAmount(item);
    const weight = totalAmount > 0 ? amount / totalAmount * 100 : 0;
    let previous = itemPlannedPercent(item, project, shiftDate(project.start_date, -1));
    const weekly = weeks.map((week) => {
      const current = itemPlannedPercent(item, project, week.end);
      const contribution = Math.max(0, current - previous) * weight / 100;
      previous = current;
      return contribution;
    });
    return { item, amount, weight, weekly };
  }), [items, project, weeks, totalAmount]);

  const monthGroups = useMemo(() => {
    const result: { key: string; label: string; count: number }[] = [];
    for (const week of weeks) {
      const current = result[result.length - 1];
      if (current?.key === week.monthKey) current.count += 1;
      else result.push({ key: week.monthKey, label: week.monthLabel, count: 1 });
    }
    return result;
  }, [weeks]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, ScheduleRow[]>();
    for (const row of rows) {
      const key = row.item.work_group?.trim() || "Umum";
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    return Array.from(groups.entries());
  }, [rows]);

  const weeklyTotals = weeks.map((_, index) => rows.reduce((sum, row) => sum + row.weekly[index], 0));
  const cumulative = weeklyTotals.reduce<number[]>((values, value) => {
    values.push((values[values.length - 1] || 0) + value);
    return values;
  }, []);
  const selectedOptions = SIGNERS.filter((signer) => selectedSigners.includes(signer.key));
  const reportDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  function toggleSigner(key: SignerKey) {
    setSelectedSigners((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  }

  return (
    <section className="schedule-export-screen">
      <div className="card schedule-controls">
        <div className="card-title">
          <div>
            <h3>Export Jadwal Pelaksanaan Pekerjaan</h3>
            <p>Format landscape mengikuti contoh lampiran: rekap nilai, bobot, rencana mingguan, bobot kumulatif, dan kurva progres.</p>
          </div>
          <button className="btn primary" type="button" onClick={() => window.print()} disabled={!items.length}>
            <FileDown size={14} /> Cetak / Simpan PDF
          </button>
        </div>
        <div className="signer-toolbar">
          <strong>Pilih penandatangan</strong>
          <div className="signer-actions">
            <button type="button" className="btn small soft" onClick={() => setSelectedSigners(SIGNERS.map((signer) => signer.key))}><CheckSquare size={12} /> Pilih semua</button>
            <button type="button" className="btn small" onClick={() => setSelectedSigners([])}><Square size={12} /> Kosongkan</button>
          </div>
        </div>
        <div className="signer-options">
          {SIGNERS.map((signer) => (
            <label key={signer.key} className="signer-option">
              <input type="checkbox" checked={selectedSigners.includes(signer.key)} onChange={() => toggleSigner(signer.key)} />
              <span>{signer.label}</span>
              <small>{project[signer.key] || "Nama belum diisi pada identitas proyek"}</small>
            </label>
          ))}
        </div>
        <div className="info-box" style={{ marginTop: 12 }}>
          Gunakan tombol cetak lalu pilih <strong>Save as PDF / Simpan sebagai PDF</strong> pada dialog printer browser. Jika seluruh kotak dicentang, keempat pejabat akan tampil pada lembar tanda tangan.
        </div>
      </div>

      <article className="pdf-document">
        <header className="pdf-heading">
          <h1>JADWAL PELAKSANAAN PEKERJAAN</h1>
          <h2>{project.name.toLocaleUpperCase("id-ID")}</h2>
          <h3>{menu.name.toLocaleUpperCase("id-ID")}</h3>
          {project.npsn && <p>NO. NPSN : {project.npsn}</p>}
          <p>{project.address || project.location || "Alamat sekolah belum diisi"}</p>
          <p>Periode: {dateLabel(project.start_date)} – {dateLabel(project.end_date)}</p>
        </header>

        {!items.length ? <div className="empty-state">Belum ada item RAB pada menu ini.</div> : (
          <>
            <div className="pdf-table-wrap">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="schedule-no">No.</th>
                    <th rowSpan={2} className="schedule-description">Uraian Item Pekerjaan</th>
                    <th rowSpan={2} className="schedule-money">Jumlah Harga (Rp.)</th>
                    <th rowSpan={2} className="schedule-weight">Bobot Rencana (%)</th>
                    {monthGroups.map((group) => <th key={group.key} colSpan={group.count}>{group.label}</th>)}
                    <th rowSpan={2} className="schedule-note">Ket</th>
                  </tr>
                  <tr>
                    {weeks.map((week) => <th key={week.index} className="schedule-week" title={`${week.start} s.d. ${week.end}`}>M{week.index}<small>{dateLabel(week.start, { day: "2-digit", month: "short" })}</small></th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let itemNo = 0;
                    return groupedRows.map(([groupName, groupRows]) => {
                      const groupAmount = groupRows.reduce((sum, row) => sum + row.amount, 0);
                      const groupWeight = groupRows.reduce((sum, row) => sum + row.weight, 0);
                      const groupWeekly = weeks.map((_, index) => groupRows.reduce((sum, row) => sum + row.weekly[index], 0));
                      return (
                        <tbody key={groupName}>
                          <tr className="schedule-group-row">
                            <td colSpan={2}>{groupName.toLocaleUpperCase("id-ID")}</td>
                            <td className="num">{money(groupAmount)}</td>
                            <td className="num">{percent(groupWeight)}</td>
                            {groupWeekly.map((value, index) => <td key={index} className="num">{value > 0.0005 ? number(value, 2) : "—"}</td>)}
                            <td />
                          </tr>
                          {groupRows.map((row) => {
                            itemNo += 1;
                            return (
                              <tr key={row.item.id}>
                                <td className="num">{itemNo}</td>
                                <td className="schedule-item-description">
                                  <strong>{row.item.description}</strong>
                                  <small>{row.item.item_code} · {row.item.quantity} {row.item.unit}</small>
                                </td>
                                <td className="num">{money(row.amount)}</td>
                                <td className="num">{percent(row.weight)}</td>
                                {row.weekly.map((value, index) => <td key={index} className="num">{value > 0.0005 ? number(value, 2) : ""}</td>)}
                                <td />
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr className="schedule-total-row">
                    <th colSpan={2}>TOTAL RAB / BOBOT RENCANA MINGGUAN</th>
                    <th className="num">{money(totalAmount)}</th>
                    <th className="num">100,00%</th>
                    {weeklyTotals.map((value, index) => <th key={index} className="num">{number(value, 2)}</th>)}
                    <th />
                  </tr>
                  <tr className="schedule-cumulative-row">
                    <th colSpan={4}>PROGRES RENCANA KUMULATIF MINGGUAN (%)</th>
                    {cumulative.map((value, index) => <th key={index} className="num">{number(value, 2)}</th>)}
                    <th />
                  </tr>
                </tfoot>
              </table>
            </div>

            <section className="pdf-curve-section">
              <h3>KURVA RENCANA PROGRES KUMULATIF MINGGUAN (%)</h3>
              <ScheduleCurve values={cumulative} />
            </section>

            <footer className="pdf-signatures">
              <div className="pdf-signature-date">
                {project.location || project.address || "Tempat"}, {reportDate}
              </div>
              <div className={`pdf-signature-grid signers-${Math.max(1, selectedOptions.length)}`}>
                {selectedOptions.map((signer) => (
                  <div key={signer.key} className="pdf-signature">
                    <strong>{project.name.toLocaleUpperCase("id-ID")}</strong>
                    <span>{signer.title}</span>
                    <div className="signature-space" />
                    <u>{project[signer.key] || ""}</u>
                  </div>
                ))}
              </div>
              {selectedOptions.length === 0 && <p className="pdf-no-signers">Penandatangan belum dipilih.</p>}
            </footer>
          </>
        )}
      </article>
    </section>
  );
}
