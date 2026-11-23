'use client';

import { Plus, Trash2 } from 'lucide-react';
import { defaultRebarStructureParameters, type RebarStructureKind } from '@/lib/volume-calculation';

type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

const INPUT = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';
const LABEL = 'block text-[11px] font-semibold text-slate-600';
const STRUCTURES: Array<{ value: RebarStructureKind; label: string }> = [
  { value: 'footplat', label: 'Footplat' },
  { value: 'pedestal', label: 'Pedestal' },
  { value: 'beam', label: 'Balok / Sloof / Ring Balok' },
  { value: 'column', label: 'Kolom' },
  { value: 'slab', label: 'Plat lantai / dak' },
  { value: 'stair', label: 'Tangga dan bordes' },
];

export default function RebarStructureFields({ value, onChange }: Props) {
  const structure = String(value.structure_type || 'beam') as RebarStructureKind;
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  const read = (key: string, fallback = '') => String(value[key] ?? fallback);
  const groups = Array.isArray(value.longitudinal_groups) ? value.longitudinal_groups as Array<Record<string, unknown>> : [];
  const updateGroup = (index: number, key: string, next: string) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], [key]: next };
    set('longitudinal_groups', updated);
  };
  const addGroup = () => set('longitudinal_groups', [...groups, {
    label: 'Tulangan tambahan', diameter_mm: '', bars_per_member: '', positions_per_member: '1',
    length_mode: 'fixed', fixed_length_m: '', extra_length_m: '',
  }]);
  const removeGroup = (index: number) => set('longitudinal_groups', groups.filter((_, i) => i !== index));

  const field = (key: string, label: string, unit: string, hint?: string) => (
    <label className={LABEL}>{label} {unit ? <span className="font-normal text-slate-400">({unit})</span> : null}
      <input type="number" min="0" step="any" value={read(key)} onChange={(event) => set(key, event.target.value)} className={INPUT} placeholder="Isi sesuai gambar kerja" />
      {hint ? <span className="mt-1 block text-[9px] font-normal leading-4 text-slate-400">{hint}</span> : null}
    </label>
  );

  const isLinear = ['beam', 'column', 'pedestal'].includes(structure);
  const isFlat = structure === 'footplat' || structure === 'slab';
  const lengthLabel = structure === 'beam' ? 'Panjang keseluruhan balok' : structure === 'column' ? 'Tinggi kolom' : 'Kedalaman pedestal';

  return (
    <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <label className={LABEL}>Jenis struktur pembesian
          <select value={structure} onChange={(event) => onChange(defaultRebarStructureParameters(event.target.value as RebarStructureKind) as Record<string, unknown>)} className={INPUT}>
            {STRUCTURES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-[10px] leading-4 text-emerald-900">
          Hasil otomatis: panjang total besi, berat teoritis (kg), dan estimasi kebutuhan batang stok menurut diameter
        </div>
      </div>

      {isLinear && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('member_length_m', lengthLabel, 'm')}
            {field('member_count', 'Jumlah elemen', 'unit')}
            {field('cover_mm', 'Selimut beton elemen', 'mm')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 pt-3">
            <div>
              <p className="text-[11px] font-bold text-slate-700">Tulangan utama / memanjang</p>
              <p className="text-[9px] text-slate-500">Pisahkan tulangan menerus, tumpuan, lapangan, atau tambahan lain dalam baris tersendiri.</p>
            </div>
            <button type="button" onClick={addGroup} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-emerald-700"><Plus className="h-3.5 w-3.5" /> Tambah set tulangan</button>
          </div>
          {groups.map((group, index) => (
            <div key={String(group.id || index)} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-6">
              <label className={LABEL + ' sm:col-span-2'}>Nama set tulangan
                <input value={String(group.label ?? '')} onChange={(event) => updateGroup(index, 'label', event.target.value)} className={INPUT} placeholder="Utama / tumpuan / lapangan" />
              </label>
              <label className={LABEL}>Diameter (mm)
                <input type="number" min="0" step="1" value={String(group.diameter_mm ?? '')} onChange={(event) => updateGroup(index, 'diameter_mm', event.target.value)} className={INPUT} />
              </label>
              <label className={LABEL}>Batang per penampang
                <input type="number" min="0" step="1" value={String(group.bars_per_member ?? '')} onChange={(event) => updateGroup(index, 'bars_per_member', event.target.value)} className={INPUT} />
              </label>
              <label className={LABEL}>Posisi / segmen
                <input type="number" min="1" step="1" value={String(group.positions_per_member ?? '1')} onChange={(event) => updateGroup(index, 'positions_per_member', event.target.value)} className={INPUT} />
              </label>
              <label className={LABEL}>Model panjang
                <select value={String(group.length_mode ?? 'member')} onChange={(event) => updateGroup(index, 'length_mode', event.target.value)} className={INPUT}>
                  <option value="member">Sepanjang elemen</option><option value="fixed">Panjang potongan manual</option>
                </select>
              </label>
              {String(group.length_mode) === 'fixed' ? (
                <label className={LABEL}>Panjang potongan (m)
                  <input type="number" min="0" step="any" value={String(group.fixed_length_m ?? '')} onChange={(event) => updateGroup(index, 'fixed_length_m', event.target.value)} className={INPUT} />
                </label>
              ) : null}
              <label className={LABEL}>Tambahan panjang per batang (m)
                <input type="number" min="0" step="any" value={String(group.extra_length_m ?? '')} onChange={(event) => updateGroup(index, 'extra_length_m', event.target.value)} className={INPUT} placeholder="Lap / penyaluran" />
              </label>
              <div className="flex items-end justify-end sm:col-span-1">
                <button type="button" onClick={() => removeGroup(index)} disabled={groups.length <= 1} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /> Hapus</button>
              </div>
            </div>
          ))}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-bold text-slate-700">Sengkang / cincin</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {field('tie_width_mm', 'Lebar sengkang', 'mm')}
              {field('tie_depth_mm', structure === 'column' || structure === 'pedestal' ? 'Tebal sisi kedua' : 'Tinggi sengkang', 'mm')}
              {field('tie_spacing_mm', 'Jarak antar sengkang', 'mm')}
              {field('tie_diameter_mm', 'Diameter sengkang', 'mm')}
              {field('tie_cover_mm', 'Selimut ke sengkang', 'mm')}
              {field('tie_hook_mm', 'Panjang kait tiap ujung', 'mm')}
              {field('tie_end_offset_mm', 'Jarak sengkang dari ujung', 'mm')}
            </div>
            <p className="text-[9px] leading-4 text-slate-500">Jumlah cincin dihitung dari panjang/tinggi/kedalaman elemen dan jarak maksimum yang diinput. Panjang potong memperhitungkan dimensi bersih, selimut, serta dua kait sesuai nilai yang Anda masukkan.</p>
          </div>
        </>
      )}

      {isFlat && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('flat_length_m', structure === 'footplat' ? 'Panjang footplat' : 'Panjang bidang plat', 'm')}
            {field('flat_width_m', structure === 'footplat' ? 'Lebar footplat' : 'Lebar bidang plat', 'm')}
            {field('member_count', 'Jumlah footplat / bidang', 'unit')}
            {field('layers', 'Jumlah layer / lapis', 'layer')}
            {field('cover_mm', 'Selimut beton', 'mm')}
            {field('lap_allowance_mm', 'Tambahan sambungan per batang', 'mm')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-bold text-slate-700">Tulangan dua arah</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {field('spacing_x_mm', 'Jarak arah X', 'mm')}
              {field('diameter_x_mm', 'Diameter arah X', 'mm')}
              {field('spacing_y_mm', 'Jarak arah Y', 'mm')}
              {field('diameter_y_mm', 'Diameter arah Y', 'mm')}
            </div>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">Jumlah batang = pembulatan ke atas (dimensi bersih ÷ jarak) + 1. Panjang setiap batang dihitung dari dimensi bersih setelah selimut ditambah allowance sambungan.</p>
          </div>
        </>
      )}

      {structure === 'stair' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('step_count', 'Jumlah anak tangga', 'anak tangga')}
            {field('tread_width_m', 'Lebar injakan / antrede', 'm')}
            {field('riser_height_m', 'Tinggi tanjakan / optrede', 'm')}
            {field('stair_width_m', 'Lebar tangga', 'm')}
            {field('flight_count', 'Jumlah bidang / flight', 'bidang')}
            {field('cover_mm', 'Selimut beton', 'mm')}
            {field('waist_thickness_mm', 'Tebal pelat badan tangga', 'mm')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-bold text-slate-700">Tulangan utama bidang miring</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {field('stair_main_diameter_mm', 'Diameter utama', 'mm')}
              {field('stair_main_spacing_mm', 'Jarak utama melintang lebar', 'mm')}
              {field('stair_main_layers', 'Jumlah layer', 'layer')}
              {field('stair_main_anchor_mm', 'Tambahan penyaluran per batang', 'mm')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-bold text-slate-700">Tulangan pembagi tangga</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {field('stair_distribution_diameter_mm', 'Diameter pembagi', 'mm')}
              {field('stair_distribution_spacing_mm', 'Jarak tulangan pembagi', 'mm')}
              {field('stair_distribution_layers', 'Jumlah layer', 'layer')}
              {field('stair_distribution_extra_mm', 'Tambahan panjang per batang', 'mm')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-slate-700">Tulangan bordes</p>
              <label className={LABEL}>Jumlah bordes
                <input type="number" min="0" step="1" value={read('landing_count', '0')} onChange={(event) => set('landing_count', event.target.value)} className={INPUT} />
              </label>
            </div>
            {Number(value.landing_count || 0) > 0 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {field('landing_length_m', 'Panjang bordes', 'm')}
                {field('landing_width_m', 'Lebar bordes', 'm')}
                {field('landing_layers', 'Jumlah layer bordes', 'layer')}
                {field('landing_lap_allowance_mm', 'Tambahan sambungan bordes', 'mm')}
                {field('landing_thickness_mm', 'Tebal bordes', 'mm')}
                {field('landing_diameter_x_mm', 'Diameter arah X', 'mm')}
                {field('landing_spacing_x_mm', 'Jarak arah X', 'mm')}
                {field('landing_diameter_y_mm', 'Diameter arah Y', 'mm')}
                {field('landing_spacing_y_mm', 'Jarak arah Y', 'mm')}
              </div>
            ) : <p className="text-[9px] text-slate-400">Isi jumlah bordes bila ada; dimensi dan tulangan bordes akan dihitung terpisah.</p>}
          </div>
        </>
      )}

      <div className="grid gap-3 border-t border-emerald-100 pt-3 sm:grid-cols-2">
        {field('stock_length_m', 'Panjang batang stok', 'm')}
        {field('waste_pct', 'Allowance waste pemotongan', '%')}
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[9px] leading-4 text-amber-900">
        Kalkulator ini adalah estimasi kuantitas / bar bending take-off menggunakan tabel berat nominal SNI 2052:2024, bukan pemeriksaan kapasitas atau desain struktur. Panjang kait, penyaluran, sambungan lewatan, selimut, dan detail penempatan harus mengikuti gambar struktur serta verifikasi perencana. Default panjang stok 12 m (pilihan panjang standar juga dapat diubah menjadi 10 m).
      </p>
    </section>
  );
}
