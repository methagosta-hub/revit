"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, FileDown, Layers, RefreshCw, Square } from "lucide-react";
import type { BoqItem, Project, WorkMenu } from "@/lib/types";
import { getProgressSupabase } from "@/lib/supabase";
import { itemAmount, itemPlannedPercent } from "@/lib/curve";
import { dateLabel, money, number } from "@/lib/formatters";

type SignerKey = "school_head" | "p2sp" | "planner" | "supervisor";
type DisplayMode = "divisions" | "summary";
type MenuSettings = { include: boolean; mode: DisplayMode; order: number };
type Week = { index: number; start: string; end: string; monthKey: string; monthLabel: string };
type LineKind = "menu-heading" | "division" | "summary";
type ScheduleLine = {
  key: string;
  kind: LineKind;
  menuName: string;
  title: string;
  numberLabel: string;
  amount: number;
  weight: number;
  weekly: number[];
  cumulative: number[];
  completion: number[];
};
type MonthGroup = { key: string; label: string; startIndex: number; count: number };
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

function addDays(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function buildWeeks(project: Project): Week[] {
  const result: Week[] = [];
  const finalDate = parseLocalDate(project.end_date);
  let cursor = parseLocalDate(project.start_date);

  while (cursor <= finalDate) {
    const start = dateKey(cursor);
    const endDate = new Date(cursor);
    endDate.setDate(endDate.getDate() + 6);
    if (endDate > finalDate) endDate.setTime(finalDate.getTime());
    const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);
    result.push({
      index: result.length + 1,
      start,
      end: dateKey(endDate),
      monthKey: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      monthLabel,
    });
    cursor = new Date(endDate);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildMonthGroups(weeks: Week[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  weeks.forEach((week, index) => {
    const last = groups[groups.length - 1];
    if (last?.key === week.monthKey) {
      last.count += 1;
    } else {
      groups.push({
        key: week.monthKey,
        label: `BULAN KE ${groups.length + 1} · ${week.monthLabel}`,
        startIndex: index,
        count: 1,
      });
    }
  });
  return groups;
}

function roman(value: number) {
  const values: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let numberValue = Math.max(1, value);
  let result = "";
  for (const [amount, label] of values) {
    while (numberValue >= amount) {
      result += label;
      numberValue -= amount;
    }
  }
  return result;
}

function percent(value: number) {
  return `${number(value, 2)}%`;
}

function shadeForCompletion(value: number) {
  const strength = Math.max(0, Math.min(1, value / 100));
  const lightness = 96 - strength * 58;
  return {
    backgroundColor: `hsl(207 72% ${lightness}%)`,
    color: strength > 0.57 ? "#ffffff" : "#19364f",
  };
}

function ScheduleCurve({ values }: { values: number[] }) {
  if (!values.length) return null;
  const width = 1120;
  const height = 220;
  const left = 50;
  const right = 20;
  const top = 18;
  const bottom = 35;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (index: number) => left + (values.length <= 1 ? 0 : index / (values.length - 1)) * innerWidth;
  const y = (value: number) => top + (100 - Math.max(0, Math.min(100, value))) / 100 * innerHeight;
  const path = values.map((value, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const visibleLabels = values.map((_, index) => index).filter((index) =>
    index === 0 || index === values.length - 1 || index % Math.max(1, Math.ceil(values.length / 12)) === 0
  );

  return (
    <div className="schedule-curve">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kurva S gabungan progres rencana kumulatif mingguan">
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#dbe5ee" strokeDasharray="4 5" />
            <text x={left - 9} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#60758a">{value}%</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#226ca8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => (
          <circle key={index} cx={x(index)} cy={y(value)} r="4" fill="#226ca8" stroke="#ffffff" strokeWidth="1.5">
            <title>Minggu ${index + 1}: ${percent(value)}</title>
          </circle>
        ))}
        {visibleLabels.map((index) => (
          <text key={index} x={x(index)} y={height - 10} textAnchor="middle" fontSize="10" fill="#60758a">
            M{index + 1}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function ScheduleExport({ project, menus }: { project: Project; menus: WorkMenu[] }) {
  const supabase = useMemo(() => getProgressSupabase(), []);
  const [itemsByMenu, setItemsByMenu] = useState<Record<string, BoqItem[]>>({});
  const [settings, setSettings] = useState<Record<string, MenuSettings>>({});
  const [selectedSigners, setSelectedSigners] = useState<SignerKey[]>(["school_head", "p2sp", "planner", "supervisor"]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const reportDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const activeMenus = useMemo(
    () => menus.filter((menu) => menu.is_active).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [menus]
  );

  useEffect(() => {
    setSettings((current) => {
      const next: Record<string, MenuSettings> = {};
      activeMenus.forEach((menu, index) => {
        next[menu.id] = current[menu.id] || {
          include: true,
          mode: "divisions",
          order: index + 1,
        };
      });
      return next;
    });
  }, [activeMenus]);

  const loadItems = useCallback(async () => {
    if (!supabase) {
      setLoadError("Koneksi database Dahlia Project Progress belum tersedia.");
      return;
    }
    if (!activeMenus.length) {
      setItemsByMenu({});
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const results = await Promise.all(activeMenus.map(async (menu) => {
        const { data, error } = await supabase
          .from("progress_boq_items")
          .select("*")
          .eq("project_id", project.id)
          .eq("menu_id", menu.id)
          .eq("boq_version", menu.current_boq_version)
          .eq("is_active", true)
          .order("sort_order")
          .order("item_code");
        if (error) throw error;
        return [menu.id, (data || []) as BoqItem[]] as const;
      }));
      setItemsByMenu(Object.fromEntries(results));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Rincian RAB menu gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [supabase, project.id, activeMenus]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const orderedMenus = useMemo(() => activeMenus.slice().sort((a, b) =>
    (settings[a.id]?.order || a.sort_order) - (settings[b.id]?.order || b.sort_order)
  ), [activeMenus, settings]);

  const selectedMenus = useMemo(() => orderedMenus.filter((menu) => settings[menu.id]?.include !== false), [orderedMenus, settings]);

  const weeks = useMemo(() => buildWeeks(project), [project.start_date, project.end_date]);
  const months = useMemo(() => buildMonthGroups(weeks), [weeks]);
  const allSelectedItems = useMemo(
    () => selectedMenus.flatMap((menu) => itemsByMenu[menu.id] || []),
    [selectedMenus, itemsByMenu]
  );
  const totalAmount = useMemo(
    () => allSelectedItems.reduce((sum, item) => sum + itemAmount(item), 0),
    [allSelectedItems]
  );

  const plannedByItem = useMemo(() => {
    const values: Record<string, { weekly: number[]; cumulative: number[]; completion: number[] }> = {};
    const previousDate = addDays(project.start_date, -1);

    allSelectedItems.forEach((item) => {
      const amount = itemAmount(item);
      const itemWeekly: number[] = [];
      const itemCumulative: number[] = [];
      const itemCompletion: number[] = [];
      let previous = itemPlannedPercent(item, project, previousDate);
      let cumulative = 0;

      weeks.forEach((week) => {
        const current = itemPlannedPercent(item, project, week.end);
        const delta = Math.max(0, current - previous);
        cumulative = current;
        itemWeekly.push(totalAmount > 0 ? amount / totalAmount * delta : 0);
        itemCumulative.push(totalAmount > 0 ? amount / totalAmount * current : 0);
        itemCompletion.push(current);
        previous = current;
      });

      values[item.id] = { weekly: itemWeekly, cumulative: itemCumulative, completion: itemCompletion };
    });
    return values;
  }, [allSelectedItems, project, weeks, totalAmount]);

  const weeklyTotals = useMemo(
    () => weeks.map((_, index) => allSelectedItems.reduce((sum, item) => sum + (plannedByItem[item.id]?.weekly[index] || 0), 0)),
    [weeks, allSelectedItems, plannedByItem]
  );
  const cumulativeTotals = useMemo(() => {
    let total = 0;
    return weeklyTotals.map((value) => {
      total += value;
      return total;
    });
  }, [weeklyTotals]);

  const lines = useMemo<ScheduleLine[]>(() => {
    const result: ScheduleLine[] = [];
    let menuNumber = 0;

    function makeLine(key: string, kind: LineKind, menuName: string, title: string, numberLabel: string, items: BoqItem[]) {
      const amount = items.reduce((sum, item) => sum + itemAmount(item), 0);
      const weekly = weeks.map((_, index) =>
        items.reduce((sum, item) => sum + (plannedByItem[item.id]?.weekly[index] || 0), 0)
      );
      const cumulative = weeks.map((_, index) =>
        items.reduce((sum, item) => sum + (plannedByItem[item.id]?.cumulative[index] || 0), 0)
      );
      const completion = weeks.map((_, index) => {
        if (amount <= 0) return 0;
        return items.reduce((sum, item) => sum + itemAmount(item) * (plannedByItem[item.id]?.completion[index] || 0), 0) / amount;
      });
      result.push({
        key, kind, menuName, title, numberLabel, amount,
        weight: totalAmount > 0 ? amount / totalAmount * 100 : 0,
        weekly, cumulative, completion,
      });
    }

    selectedMenus.forEach((menu) => {
      const items = itemsByMenu[menu.id] || [];
      if (!items.length) return;
      menuNumber += 1;
      const mode = settings[menu.id]?.mode || "divisions";

      if (mode === "summary") {
        makeLine(`menu:${menu.id}`, "summary", menu.name, menu.name, `${menuNumber}.`, items);
        return;
      }

      result.push({
        key: `heading:${menu.id}`,
        kind: "menu-heading",
        menuName: menu.name,
        title: menu.name,
        numberLabel: `${menuNumber}.`,
        amount: 0,
        weight: 0,
        weekly: weeks.map(() => 0),
        cumulative: weeks.map(() => 0),
        completion: weeks.map(() => 0),
      });

      const groups = new Map<string, BoqItem[]>();
      items.forEach((item) => {
        const label = item.work_group?.trim() || "Umum";
        groups.set(label, [...(groups.get(label) || []), item]);
      });

      let divisionNumber = 0;
      groups.forEach((groupItems, label) => {
        divisionNumber += 1;
        makeLine(
          `division:${menu.id}:${label}`,
          "division",
          menu.name,
          label,
          `${roman(divisionNumber)}.`,
          groupItems
        );
      });
    });

    return result;
  }, [selectedMenus, itemsByMenu, settings, weeks, plannedByItem, totalAmount]);

  const selectedOptions = SIGNERS.filter((signer) => selectedSigners.includes(signer.key));
  const menusWithoutItems = selectedMenus.filter((menu) => !(itemsByMenu[menu.id] || []).length);

  function updateMenuSetting(menuId: string, patch: Partial<MenuSettings>) {
    setSettings((current) => ({
      ...current,
      [menuId]: {
        include: current[menuId]?.include ?? true,
        mode: current[menuId]?.mode || "divisions",
        order: current[menuId]?.order || activeMenus.findIndex((menu) => menu.id === menuId) + 1,
        ...patch,
      },
    }));
  }

  function selectAllMenus() {
    setSettings((current) => {
      const next = { ...current };
      activeMenus.forEach((menu, index) => {
        next[menu.id] = { include: true, mode: next[menu.id]?.mode || "divisions", order: next[menu.id]?.order || index + 1 };
      });
      return next;
    });
  }

  function clearMenus() {
    setSettings((current) => {
      const next = { ...current };
      activeMenus.forEach((menu) => {
        next[menu.id] = { include: false, mode: next[menu.id]?.mode || "divisions", order: next[menu.id]?.order || menu.sort_order };
      });
      return next;
    });
  }

  function moveMenu(menuId: string, direction: -1 | 1) {
    const ordered = orderedMenus.slice();
    const index = ordered.findIndex((menu) => menu.id === menuId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const first = ordered[index];
    const second = ordered[nextIndex];
    setSettings((current) => ({
      ...current,
      [first.id]: { ...(current[first.id] || { include: true, mode: "divisions", order: index + 1 }), order: nextIndex + 1 },
      [second.id]: { ...(current[second.id] || { include: true, mode: "divisions", order: nextIndex + 1 }), order: index + 1 },
    }));
  }

  function toggleSigner(key: SignerKey) {
    setSelectedSigners((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  }

  return (
    <section className="schedule-builder">
      <div className="card schedule-builder-card">
        <div className="schedule-builder-heading">
          <div>
            <div className="eyebrow">PROJECT SCHEDULE WORKSPACE</div>
            <h3>Kerangka Penyusunan Kurva S</h3>
            <p>Pilih menu yang ingin dimasukkan ke Kurva S gabungan. Atur apakah tiap menu ditampilkan per divisi atau cukup satu baris ringkas.</p>
          </div>
          <div className="schedule-builder-actions">
            <button type="button" className="btn soft" onClick={selectAllMenus}><CheckSquare size={13} /> Pilih semua menu</button>
            <button type="button" className="btn" onClick={clearMenus}><Square size={13} /> Kosongkan</button>
            <button type="button" className="btn" onClick={() => void loadItems()} disabled={loading}><RefreshCw size={13} /> {loading ? "Memuat…" : "Refresh RAB"}</button>
          </div>
        </div>

        {loadError && <div className="error-box" style={{ marginBottom: 12 }}>{loadError}</div>}
        {loading && <div className="info-box" style={{ marginBottom: 12 }}>Memuat RAB dari seluruh menu proyek…</div>}
        {!activeMenus.length && <div className="empty-state"><Layers size={25} /><h3>Belum ada menu aktif</h3><p>Tambahkan menu pekerjaan terlebih dahulu sebelum menyusun Kurva S.</p></div>}

        <div className="curve-menu-config-list">
          {orderedMenus.map((menu, index) => {
            const config = settings[menu.id] || { include: true, mode: "divisions" as DisplayMode, order: index + 1 };
            const count = (itemsByMenu[menu.id] || []).length;
            const menuTotal = (itemsByMenu[menu.id] || []).reduce((sum, item) => sum + itemAmount(item), 0);
            return (
              <div key={menu.id} className={`curve-menu-config ${config.include ? "included" : ""}`}>
                <label className="curve-menu-select">
                  <input type="checkbox" checked={config.include} onChange={(event) => updateMenuSetting(menu.id, { include: event.target.checked })} />
                  <span className="curve-menu-select-copy">
                    <strong>{menu.name}</strong>
                    <small>{count} item · {money(menuTotal)} · RAB v{menu.current_boq_version}</small>
                  </span>
                </label>
                <div className="curve-menu-controls">
                  <span className="curve-config-label">Tampilan pada PDF</span>
                  <div className="curve-mode-switch">
                    <button type="button" className={config.mode === "divisions" ? "active" : ""} onClick={() => updateMenuSetting(menu.id, { mode: "divisions" })}>Per divisi</button>
                    <button type="button" className={config.mode === "summary" ? "active" : ""} onClick={() => updateMenuSetting(menu.id, { mode: "summary" })}>Ringkas</button>
                  </div>
                </div>
                <div className="curve-menu-order">
                  <span className="curve-config-label">Urutan</span>
                  <div>
                    <button type="button" className="icon-btn" title="Naikkan urutan" onClick={() => moveMenu(menu.id, -1)} disabled={index === 0}><ArrowUp size={13} /></button>
                    <button type="button" className="icon-btn" title="Turunkan urutan" onClick={() => moveMenu(menu.id, 1)} disabled={index === activeMenus.length - 1}><ArrowDown size={13} /></button>
                  </div>
                </div>
                {!count && <span className="curve-menu-empty">Belum ada rincian BOQ aktif</span>}
              </div>
            );
          })}
        </div>

        <div className="curve-selection-summary">
          <span><strong>{selectedMenus.length}</strong> dari {activeMenus.length} menu dipilih</span>
          <span><strong>{allSelectedItems.length}</strong> item BOQ</span>
          <span><strong>{money(totalAmount)}</strong> total RAB yang dihitung sebagai 100%</span>
        </div>

        <div className="signer-toolbar">
          <strong>Penandatangan dokumen PDF</strong>
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
      </div>

      <article className="pdf-document">
        <header className="pdf-heading">
          <h1>JADWAL PELAKSANAAN PEKERJAAN</h1>
          <h2>{project.name.toLocaleUpperCase("id-ID")}</h2>
          <h3>KURVA S GABUNGAN SELURUH MENU PEKERJAAN</h3>
          {project.npsn && <p>NO. NPSN : {project.npsn}</p>}
          <p>{project.address || project.location || "Alamat sekolah belum diisi"}</p>
          {project.phone && <p>Telepon: {project.phone}</p>}
          {project.contract_number && <p>No. Kontrak: {project.contract_number}</p>}
          <p>Periode: {dateLabel(project.start_date)} – {dateLabel(project.end_date)}</p>
          <p className="pdf-selected-menu-names">Menu: {selectedMenus.map((menu) => menu.name).join(" · ") || "Belum ada menu dipilih"}</p>
        </header>

        {loading ? <div className="empty-state">Memuat rincian RAB menu…</div> :
          !selectedMenus.length ? <div className="empty-state">Pilih minimal satu menu untuk menyusun Kurva S gabungan.</div> :
          !totalAmount ? <div className="empty-state">Menu yang dipilih belum memiliki nilai RAB lebih dari nol.</div> :
          (
            <>
              {menusWithoutItems.length > 0 && (
                <div className="pdf-warning">
                  Menu tanpa item aktif tidak akan masuk perhitungan: {menusWithoutItems.map((menu) => menu.name).join(", ")}
                </div>
              )}
              <div className="pdf-table-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="schedule-no">No.</th>
                      <th rowSpan={2} className="schedule-description">Uraian Item Pekerjaan</th>
                      <th rowSpan={2} className="schedule-money">Jumlah Harga (Rp.)</th>
                      <th rowSpan={2} className="schedule-weight">Bobot Rencana (%)</th>
                      {months.map((month) => (
                        <th key={month.key} colSpan={month.count}>{month.label}</th>
                      ))}
                      <th rowSpan={2} className="schedule-note">Ket.</th>
                    </tr>
                    <tr>
                      {weeks.map((week) => (
                        <th key={week.index} className="schedule-week" title={`${week.start} s.d. ${week.end}`}>
                          M{week.index}
                          <small>{dateLabel(week.start, { day: "2-digit", month: "short" })}–{dateLabel(week.end, { day: "2-digit", month: "short" })}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className={`schedule-row-${line.kind}`}>
                        <td className="num schedule-line-number">{line.numberLabel}</td>
                        <td className="schedule-item-description">
                          <strong>{line.title}</strong>
                          {line.kind === "division" && <small>{line.menuName}</small>}
                        </td>
                        <td className="num">{line.kind === "menu-heading" ? "" : money(line.amount)}</td>
                        <td className="num">{line.kind === "menu-heading" ? "" : percent(line.weight)}</td>
                        {line.weekly.map((value, index) => {
                          const completion = line.completion[index] || 0;
                          const shade = shadeForCompletion(completion);
                          const hasWork = value > 0.0005 && line.kind !== "menu-heading";
                          return (
                            <td
                              key={index}
                              className={hasWork ? "num schedule-heat-cell" : "num"}
                              style={hasWork ? shade : undefined}
                              title={hasWork ? `Minggu ${index + 1}: bobot ${percent(value)}, progres kumulatif baris ${percent(completion)}` : undefined}
                            >
                              {hasWork ? number(value, 2) : ""}
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="schedule-total-row">
                      <th colSpan={2}>TOTAL BOBOT RENCANA MINGGUAN</th>
                      <th className="num">{money(totalAmount)}</th>
                      <th className="num">100,00%</th>
                      {weeklyTotals.map((value, index) => <th key={index} className="num">{number(value, 2)}</th>)}
                      <th />
                    </tr>
                    <tr className="schedule-cumulative-row">
                      <th colSpan={4}>PROGRES RENCANA KUMULATIF MINGGUAN (%)</th>
                      {cumulativeTotals.map((value, index) => <th key={index} className="num">{number(value, 2)}</th>)}
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="schedule-heat-legend">
                <strong>Intensitas arsiran menunjukkan progres kumulatif divisi/menu pada akhir minggu.</strong>
                <span><i className="heat-swatch light" /> Awal</span>
                <span><i className="heat-swatch medium" /> Berkembang</span>
                <span><i className="heat-swatch dark" /> Mendekati selesai</span>
              </div>

              <section className="pdf-curve-section">
                <h3>KURVA S GABUNGAN · PROGRES RENCANA KUMULATIF MINGGUAN (%)</h3>
                <ScheduleCurve values={cumulativeTotals} />
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

      <div className="schedule-export-action">
        <button className="btn primary" type="button" onClick={() => window.print()} disabled={loading || !selectedMenus.length || totalAmount <= 0 || !!loadError}>
          <FileDown size={14} /> Cetak / Simpan PDF
        </button>
        <span>Dokumen landscape A3 · pilih “Save as PDF” pada dialog cetak browser</span>
      </div>
    </section>
  );
}
