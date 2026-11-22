"use client";

import type { FormEvent } from "react";
import { FileUp, Plus, Store } from "lucide-react";
import type { DetailLine, Draft, Material, MaterialPurchaseRecord, ReportCategory, SchoolStore, TxType } from "@/app/lib/bku/types";
import { amountValue, draftDetailsTotal, expenseCategories, fieldClass, incomeCategories, money } from "@/app/lib/bku/formatters";
import { AppModal } from "@/app/components/layout/AppModal";
import { FormField } from "@/app/components/layout/FormField";
import { TransactionDetailEditor } from "./TransactionDetailEditor";

export function TransactionFormModal({
  open,
  date,
  onDateChange,
  drafts,
  materials,
  stores,
  editing,
  saving,
  error,
  onClearError,
  onClose,
  onSave,
  onDraftChange,
  onLineChange,
  onAddDetail,
  onRemoveDetail,
  onAddDraft,
  onRemoveDraft,
  onSplitDetails,
  materialCorrection,
  reportCategories,
}: {
  open: boolean;
  materialCorrection?: MaterialPurchaseRecord | null;
  reportCategories: ReportCategory[];
  date: string;
  onDateChange: (date: string) => void;
  drafts: Draft[];
  materials: Material[];
  stores: SchoolStore[];
  editing: boolean;
  saving: boolean;
  error?: string;
  onClearError: () => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (index: number, patch: Partial<Draft>) => void;
  onLineChange: (draftIndex: number, lineIndex: number, patch: Partial<Draft["details"][number]>) => void;
  onAddDetail: (draftIndex: number, line: DetailLine) => void;
  onRemoveDetail: (draftIndex: number, lineIndex: number) => void;
  onAddDraft: () => void;
  onRemoveDraft: (index: number) => void;
  onSplitDetails: (draftIndex: number, lineIndexes: number[]) => void;
}) {
  if (!open) return null;
  return (
    <AppModal title={editing ? "Ubah nota / transaksi" : "Catat transaksi baru"} subtitle="Isi tanggal dan rincian transaksi. Satu nota pengeluaran dapat berisi banyak material." onClose={onClose} wide>
      <form onSubmit={onSave} className="space-y-4">
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[minmax(220px,340px)_1fr] sm:items-end">
          <FormField label="Tanggal transaksi"><input type="date" required value={date} onChange={(event) => onDateChange(event.target.value)} className={fieldClass} /></FormField>
          <p className="text-[11px] leading-5 text-slate-500">{editing ? "Tanggal dapat diubah. Setelah disimpan, nota akan berpindah ke tanggal tujuan dan nomor urut disesuaikan." : "Semua nota dalam form ini akan dicatat pada tanggal yang dipilih."}</p>
        </div>
        {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><span>{error}</span><button type="button" onClick={onClearError} className="font-bold">Tutup</button></div>}
        {materialCorrection && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-[11px] leading-5 text-emerald-950">
          <p className="font-black">Koreksi dari Rekap Material · baris #{materialCorrection.detail_index + 1}</p>
          <p className="mt-1">Material: <strong>{materialCorrection.name}</strong> · {materialCorrection.volume} {materialCorrection.unit} · harga satuan {money(materialCorrection.unit_price)}.</p>
          <p className="mt-1">Editor rincian di bawah sudah diarahkan ke baris ini. Sesuaikan nama, satuan, atau harga berdasarkan nota/bukti asli, lalu simpan perubahan nota.</p>
        </div>}
        {editing && <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-[11px] leading-5 text-amber-950">
          <p className="font-black">Pengaturan baris saat mengubah nota</p>
          <p className="mt-1"><strong>Potong ke nota baru:</strong> centang satu atau beberapa rincian. Semua rincian terpilih akan digabung ke dalam satu nota baru, sedangkan rincian yang tidak dipilih tetap berada di nota utama. Nota baru dibuat setelah tombol simpan ditekan.</p>
          <p><strong>Hapus baris:</strong> keluarkan baris material dari nota yang sedang diedit. Jumlah nota dihitung ulang saat disimpan.</p>
        </div>}
        {drafts.map((draft, index) => {
          const dynamicOptions = reportCategories.filter((item) => item.transaction_type === draft.transaction_type && item.is_active);
          const categoryOptions = dynamicOptions.length
            ? dynamicOptions.map((item) => [item.code, item.label] as const)
            : draft.transaction_type === "IN" ? incomeCategories
              : draft.transaction_type === "OUT" ? expenseCategories
                : [["transfer", "Pemindahan saldo"]] as const;
          return <section key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Nota / transaksi {index + 1}</p><p className="mt-0.5 text-xs text-slate-500">{draft.transaction_type === "OUT" ? "Catatan pengeluaran" : draft.transaction_type === "IN" ? "Catatan pemasukan" : "Pemindahan saldo"}</p></div>{drafts.length > 1 && !editing && <button type="button" onClick={() => onRemoveDraft(index)} className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50">Hapus nota ini</button>}</div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FormField label="Jenis transaksi"><select value={draft.transaction_type} disabled={editing} onChange={(event) => onDraftChange(index, { transaction_type: event.target.value as TxType, category: event.target.value === "IN" ? "modal" : event.target.value === "TRANSFER" ? "transfer" : "material" })} className={fieldClass}><option value="OUT">Kas keluar</option><option value="IN">Kas masuk</option><option value="TRANSFER">Transfer tunai ↔ bank</option></select></FormField>
            <FormField label="Kategori"><select value={draft.category} onChange={(event) => onDraftChange(index, { category: event.target.value })} className={fieldClass}>{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
            {draft.transaction_type !== "OUT" && <FormField label="Nominal (Rp)"><input required inputMode="numeric" value={draft.amount} onChange={(event) => onDraftChange(index, { amount: event.target.value })} placeholder="0" className={fieldClass} />{amountValue(draft.amount) > 2_000_000 && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Periksa nominal terhadap bukti transaksi.</span>}</FormField>}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <FormField label={draft.transaction_type === "OUT" ? "Uraian / nama toko (opsional)" : "Uraian transaksi"}><input required={draft.transaction_type !== "OUT"} value={draft.description} onChange={(event) => onDraftChange(index, { description: event.target.value })} placeholder={draft.transaction_type === "OUT" ? "Contoh: Belanja material pekerjaan pondasi" : "Contoh: Dana bantuan masuk"} className={fieldClass} /></FormField>
            <FormField label="Nomor nota / referensi"><input value={draft.receipt_number} onChange={(event) => onDraftChange(index, { receipt_number: event.target.value })} placeholder="Opsional" className={fieldClass} /></FormField>
          </div>
          {draft.transaction_type === "OUT" && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <FormField label="Pilih toko yang pernah digunakan"><select value={draft.store_id} onChange={(event) => { const store = stores.find((item) => item.id === event.target.value); onDraftChange(index, { store_id: event.target.value, store_name: store?.name || "" }); }} className={fieldClass}><option value="">Tidak memilih toko / isi manual</option>{stores.filter((store) => store.is_active || store.id === draft.store_id).map((store) => <option key={store.id} value={store.id} disabled={!store.is_active}>{store.name}{!store.is_active ? " (Nonaktif — transaksi lama)" : ""}</option>)}</select></FormField>
            <FormField label="Nama toko / pemasok (opsional)"><div className="relative"><Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={draft.store_name} onChange={(event) => onDraftChange(index, { store_name: event.target.value, store_id: "" })} placeholder="Boleh dikosongkan" className={`${fieldClass} pl-9`} /></div></FormField>
          </div>}
          {draft.transaction_type === "OUT" && <TransactionDetailEditor draft={draft} materials={materials} onAdd={(line) => onAddDetail(index, line)} onRemove={(lineIndex) => onRemoveDetail(index, lineIndex)} onLineChange={(lineIndex, patch) => onLineChange(index, lineIndex, patch)} onSplitLines={(lineIndexes) => onSplitDetails(index, lineIndexes)} allowSplit={draft.transaction_type === "OUT" && draft.details.length > 1} focusLineIndex={index === 0 ? materialCorrection?.detail_index : undefined} />}
          {draft.transaction_type === "TRANSFER" ? <div className="grid gap-3 sm:grid-cols-2"><FormField label="Dari rekening"><select value={draft.from_account} onChange={(event) => onDraftChange(index, { from_account: event.target.value as Draft["from_account"] })} className={fieldClass}><option value="CASH">Tunai</option><option value="BANK">Bank</option></select></FormField><FormField label="Ke rekening"><select value={draft.to_account} onChange={(event) => onDraftChange(index, { to_account: event.target.value as Draft["to_account"] })} className={fieldClass}><option value="BANK">Bank</option><option value="CASH">Tunai</option></select></FormField></div> : <div className="max-w-sm"><FormField label="Sumber / metode pembayaran"><select value={draft.account} onChange={(event) => onDraftChange(index, { account: event.target.value as Draft["account"] })} className={fieldClass}><option value="CASH">Tunai</option><option value="BANK">Non-tunai / rekening bank</option></select></FormField></div>}
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50/40"><FileUp size={17} className="shrink-0 text-emerald-700"/><span className="min-w-0 flex-1 truncate">{draft.file ? draft.file.name : "Lampirkan foto nota / bukti transfer (opsional)"}</span><input type="file" accept="image/*,.pdf" className="sr-only" onChange={(event) => onDraftChange(index, { file: event.target.files?.[0] || null })}/></label>
        </section>;
        })}
        {!editing && <button type="button" onClick={onAddDraft} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-400 px-4 py-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"><Plus size={16}/>Tambah nota lain pada tanggal ini</button>}
        {drafts.length > 1 && <section className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-800">{editing ? "Ringkasan perubahan nota" : "Ringkasan transaksi hari ini"}</p><p className="text-[10px] text-slate-500">{editing ? `Nota utama akan diperbarui dan ${drafts.length - 1} nota hasil potongan akan dibuat baru.` : "Setiap nota tetap disimpan sebagai transaksi tersendiri pada tanggal yang sama."}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{drafts.length} nota</span></div><div className="mt-3 space-y-1.5">{drafts.map((draft, index) => <div key={index} className="flex items-center justify-between gap-3 text-[11px]"><span className="min-w-0 truncate text-slate-600">Nota {index + 1} · {draft.receipt_number || draft.description || "Belum diberi keterangan"}</span><strong className="shrink-0 tabular-nums text-slate-800">{money(draft.transaction_type === "OUT" ? draftDetailsTotal(draft) : amountValue(draft.amount))}</strong></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-600">{editing ? "Total nota setelah perubahan" : "Total seluruh nota tanggal ini"}</span><strong className="text-base font-black text-emerald-800">{money(drafts.reduce((sum, draft) => sum + (draft.transaction_type === "OUT" ? draftDetailsTotal(draft) : amountValue(draft.amount)), 0))}</strong></div></section>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="max-w-2xl text-[10px] leading-5 text-slate-400">Anda dapat memindahkan baris material ke nota terpisah. Gunakan hanya untuk pembelian atau bukti transaksi yang memang terpisah; jangan memecah satu faktur tunggal hanya untuk menghindari pajak atau batas administrasi.</p><div className="flex gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">Batal</button><button type="submit" disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50">{saving ? "Menyimpan…" : editing ? "Simpan perubahan nota" : "Simpan transaksi"}</button></div></div>
      </form>
    </AppModal>
  );
}
