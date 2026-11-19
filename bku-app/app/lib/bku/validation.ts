import type { Draft } from "./types";
import { amountValue, parseDecimal, parseUnitPrice } from "./formatters";

export function validateDrafts(drafts: Draft[], editingTransactionId: string | null): string | null {
  if (editingTransactionId && drafts.length > 1) {
    const source = drafts[0];
    const splitGroupId = source?.split_group_id;
    if (!source || source.transaction_type !== "OUT" || !splitGroupId || drafts.slice(1).some((draft) =>
      draft.transaction_type !== "OUT" || draft.split_group_id !== splitGroupId
    )) {
      return "Nota tambahan pada mode ubah hanya boleh dibuat melalui tindakan Potong ke nota baru.";
    }
  }

  const valid = drafts.filter((draft) => draft.transaction_type === "OUT"
    ? draft.details.some((line) => line.name.trim() && parseUnitPrice(line.unit_price) > 0 && parseDecimal(line.volume) > 0)
    : draft.description.trim() && amountValue(draft.amount) > 0);

  if (!valid.length) {
    return "Isi minimal satu rincian material untuk nota pengeluaran, atau uraian dan nominal untuk pemasukan / transfer.";
  }

  if (editingTransactionId && valid.length !== drafts.length) {
    return "Setiap nota hasil perubahan harus memiliki rincian yang lengkap. Periksa kembali baris material sebelum menyimpan.";
  }

  const hasIncompleteDetail = valid.some((draft) => draft.transaction_type === "OUT" && draft.details.some((line) =>
    (line.name.trim() || line.unit_price.trim() || line.volume.trim()) &&
    (!line.name.trim() || parseUnitPrice(line.unit_price) <= 0 || parseDecimal(line.volume) <= 0)
  ));
  if (hasIncompleteDetail) {
    return "Lengkapi nama material, harga satuan, dan volume pada setiap baris nota yang digunakan.";
  }

  if (valid.some((draft) => draft.transaction_type === "TRANSFER" && draft.from_account === draft.to_account)) {
    return "Rekening asal dan tujuan transfer harus berbeda.";
  }

  return null;
}

export function getValidDrafts(drafts: Draft[]) {
  return drafts.filter((draft) => draft.transaction_type === "OUT"
    ? draft.details.some((line) => line.name.trim() && parseUnitPrice(line.unit_price) > 0 && parseDecimal(line.volume) > 0)
    : draft.description.trim() && amountValue(draft.amount) > 0);
}
