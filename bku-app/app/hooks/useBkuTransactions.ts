"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Book, Draft, Material, SchoolStore, StoredDetail, Transaction, SaveEntriesInput } from "@/app/lib/bku/types";
import { amountValue, detailLineTotal, parseDecimal, parseUnitPrice } from "@/app/lib/bku/formatters";
import { getValidDrafts, validateDrafts } from "@/app/lib/bku/validation";
import { moveTransactionsToDate } from "@/app/lib/bku/transaction-movement";

type BkuClient = SupabaseClient;
const TRANSACTION_SELECT = "id,book_id,transaction_date,created_at,entry_no,transaction_type,category,description,amount,account,from_account,to_account,receipt_number,evidence_path,details,store_id,store_name,split_group_id,split_group_label,split_group_total";
const MATERIAL_SELECT = "id,book_id,category,name,unit,unit_price,price_basis,is_seed,is_active";

type SaveOptions = SaveEntriesInput & { session: Session | null };

async function refreshSplitGroup(supabase: BkuClient, bookId: string, groupId: string) {
  const { data, error } = await supabase.from("bku_transactions")
    .select("id,amount").eq("book_id", bookId).eq("split_group_id", groupId);
  if (error) throw error;
  const rows = (data || []) as Array<{ id: string; amount: number }>;
  if (rows.length < 2) {
    const { error: clearError } = await supabase.from("bku_transactions").update({
      split_group_id: null,
      split_group_label: null,
      split_group_total: null,
    }).eq("book_id", bookId).eq("split_group_id", groupId);
    if (clearError) throw clearError;
    return;
  }
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const { error: updateError } = await supabase.from("bku_transactions").update({ split_group_total: total })
    .eq("book_id", bookId).eq("split_group_id", groupId);
  if (updateError) throw updateError;
}

export function useBkuTransactions(supabase: BkuClient | null, session: Session | null, book: Book | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stores, setStores] = useState<SchoolStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTransactions = useCallback(async (bookId: string) => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("bku_transactions")
      .select(TRANSACTION_SELECT)
      .eq("book_id", bookId)
      .order("transaction_date", { ascending: true })
      .order("entry_no", { ascending: true });
    if (queryError) throw queryError;
    setTransactions((data || []) as Transaction[]);
  }, [supabase]);

  const loadSchoolResources = useCallback(async (bookId: string) => {
    if (!supabase) return;
    const [materialResult, storeResult] = await Promise.all([
      supabase.from("bku_materials").select(MATERIAL_SELECT)
        .eq("is_active", true).or(`book_id.is.null,book_id.eq.${bookId}`).order("category").order("name"),
      supabase.from("bku_stores").select("id,book_id,name,address,phone").eq("book_id", bookId).order("name"),
    ]);
    if (materialResult.error) throw materialResult.error;
    if (storeResult.error) throw storeResult.error;
    setMaterials((materialResult.data || []) as Material[]);
    setStores((storeResult.data || []) as SchoolStore[]);
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!book?.id) {
      setTransactions([]);
      setMaterials([]);
      setStores([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadTransactions(book.id), loadSchoolResources(book.id)]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Data transaksi gagal dimuat.";
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [book?.id, loadTransactions, loadSchoolResources]);

  useEffect(() => {
    if (book?.id && session?.user) void refresh().catch(() => undefined);
    else {
      setTransactions([]);
      setMaterials([]);
      setStores([]);
    }
  }, [book?.id, session?.user?.id, refresh]);

  const saveEntries = useCallback(async ({ drafts, targetDate, editingTransactionId, session: activeSession }: SaveOptions) => {
    if (!supabase || !book || !activeSession?.user) throw new Error("Sesi akun atau buku kas tidak tersedia.");
    const validationError = validateDrafts(drafts, editingTransactionId);
    if (validationError) throw new Error(validationError);
    const valid = getValidDrafts(drafts);
    const original = editingTransactionId ? transactions.find((tx) => tx.id === editingTransactionId) : null;
    if (editingTransactionId && !original) throw new Error("Nota yang akan diubah tidak ditemukan. Muat ulang buku kas, lalu coba kembali.");

    let firstEntryNo: number;
    let firstSplitEntryNo: number | null = null;
    if (original && original.transaction_date === targetDate) {
      firstEntryNo = original.entry_no;
      if (valid.length > 1) {
        const { data: latestEntry, error: entryError } = await supabase.from("bku_transactions")
          .select("entry_no").eq("book_id", book.id).eq("transaction_date", targetDate)
          .order("entry_no", { ascending: false }).limit(1).maybeSingle();
        if (entryError) throw entryError;
        firstSplitEntryNo = Math.max(Number(latestEntry?.entry_no || 0), original.entry_no) + 1;
      }
    } else {
      const { data: latestEntry, error: entryError } = await supabase.from("bku_transactions")
        .select("entry_no").eq("book_id", book.id).eq("transaction_date", targetDate)
        .order("entry_no", { ascending: false }).limit(1).maybeSingle();
      if (entryError) throw entryError;
      firstEntryNo = Number(latestEntry?.entry_no || 0) + 1;
    }

    const resolvedStores = new Map<string, SchoolStore>(stores.map((item) => [item.name.toLowerCase(), item] as [string, SchoolStore]));
    const resolvedMaterials = new Map<string, Material>(materials.map((item) => [item.name.toLowerCase() + "|" + item.unit, item] as [string, Material]));
    const records: Record<string, unknown>[] = [];
    const splitGroupTotals = new Map<string, number>();
    const splitGroupCounts = new Map<string, number>();
    for (const draft of valid) {
      if (draft.split_group_id) {
        splitGroupCounts.set(draft.split_group_id, (splitGroupCounts.get(draft.split_group_id) || 0) + 1);
        const draftAmount = draft.transaction_type === "OUT"
          ? draft.details.reduce((sum, line) => sum + detailLineTotal(line), 0)
          : amountValue(draft.amount);
        splitGroupTotals.set(draft.split_group_id, (splitGroupTotals.get(draft.split_group_id) || 0) + draftAmount);
      }
    }

    for (const [index, draft] of valid.entries()) {
      const entryNo = editingTransactionId && original?.transaction_date === targetDate
        ? (index === 0 ? firstEntryNo : (firstSplitEntryNo ?? firstEntryNo + 1) + index - 1)
        : firstEntryNo + index;
      let storeId = draft.store_id || null;
      let storeName = draft.store_name.trim();
      if (storeId) {
        storeName = stores.find((item) => item.id === storeId)?.name || storeName;
      } else if (storeName) {
        const existingStore = resolvedStores.get(storeName.toLowerCase());
        if (existingStore) {
          storeId = existingStore.id;
          storeName = existingStore.name;
        } else {
          const { data: newStore, error: storeError } = await supabase.from("bku_stores").insert({
            book_id: book.id,
            name: storeName,
            created_by: activeSession.user.id,
          }).select("id,book_id,name,address,phone").single();
          if (storeError) throw storeError;
          const createdStore = newStore as SchoolStore;
          resolvedStores.set(createdStore.name.toLowerCase(), createdStore);
          setStores((current) => current.some((item) => item.id === createdStore.id) ? current : [...current, createdStore].sort((a, b) => a.name.localeCompare(b.name)));
          storeId = createdStore.id;
          storeName = createdStore.name;
        }
      }

      const detailRows: StoredDetail[] = [];
      if (draft.transaction_type === "OUT") {
        for (const line of draft.details.filter((item) => item.name.trim() && parseUnitPrice(item.unit_price) > 0 && parseDecimal(item.volume) > 0)) {
          let materialId = line.material_id || null;
          const key = line.name.trim().toLowerCase() + "|" + line.unit;
          const matching = resolvedMaterials.get(key);
          if (!materialId && matching) materialId = matching.id;
          if (!materialId && !matching) {
            const { data: customMaterial, error: materialError } = await supabase.from("bku_materials").insert({
              book_id: book.id,
              category: "Material tambahan",
              name: line.name.trim(),
              unit: line.unit.trim() || "pcs",
              unit_price: parseUnitPrice(line.unit_price),
              price_basis: "Harga aktual dari nota",
              is_seed: false,
              created_by: activeSession.user.id,
            }).select(MATERIAL_SELECT).single();
            if (materialError && !materialError.message.toLowerCase().includes("duplicate")) throw materialError;
            if (customMaterial) {
              const savedMaterial = customMaterial as Material;
              materialId = savedMaterial.id;
              resolvedMaterials.set(savedMaterial.name.toLowerCase() + "|" + savedMaterial.unit, savedMaterial);
              setMaterials((current) => current.some((item) => item.id === savedMaterial.id) ? current : [...current, savedMaterial]);
            }
          }
          detailRows.push({
            material_id: materialId,
            name: line.name.trim(),
            unit_price: parseUnitPrice(line.unit_price),
            volume: parseDecimal(line.volume),
            unit: line.unit.trim() || "pcs",
            line_total: detailLineTotal(line),
          });
        }
      }

      // Bukti nota lama tetap melekat pada nota utama; nota hasil potongan
      // tidak mewarisi foto/PDF nota lama secara otomatis.
      let evidencePath = editingTransactionId && index > 0 ? null : (original?.evidence_path || null);
      if (draft.file) {
        const safeName = draft.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `${activeSession.user.id}/${book.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("bku-evidence").upload(storagePath, draft.file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        evidencePath = storagePath;
      }

      records.push({
        book_id: book.id,
        transaction_date: targetDate,
        entry_no: entryNo,
        transaction_type: draft.transaction_type,
        category: draft.category,
        description: draft.transaction_type === "OUT"
          ? (draft.description.trim() || detailRows.map((line) => line.name).join(", ").slice(0, 250))
          : draft.description.trim(),
        amount: draft.transaction_type === "OUT" ? detailRows.reduce((sum, line) => sum + line.line_total, 0) : amountValue(draft.amount),
        details: detailRows,
        account: draft.transaction_type === "TRANSFER" ? null : draft.account,
        from_account: draft.transaction_type === "TRANSFER" ? draft.from_account : null,
        to_account: draft.transaction_type === "TRANSFER" ? draft.to_account : null,
        receipt_number: draft.receipt_number.trim() || null,
        evidence_path: evidencePath,
        store_id: storeId,
        store_name: storeName,
        split_group_id: draft.split_group_id || null,
        split_group_label: draft.split_group_label || null,
        split_group_total: draft.split_group_id
          ? (Number(splitGroupCounts.get(draft.split_group_id) || 0) > 1 ? splitGroupTotals.get(draft.split_group_id) : Number(draft.split_group_total || 0) || (draft.transaction_type === "OUT" ? detailRows.reduce((sum, line) => sum + line.line_total, 0) : amountValue(draft.amount)))
          : null,
      });
    }

    if (editingTransactionId) {
      // Insert nota hasil potongan dahulu. Jika pembaruan nota utama gagal,
      // coba hapus kembali nota baru agar tidak meninggalkan duplikasi transaksi.
      const childRecords = records.slice(1).map((record) => ({ ...record, created_by: activeSession.user.id }));
      let insertedChildIds: string[] = [];
      if (childRecords.length) {
        const { data: insertedChildren, error: insertChildrenError } = await supabase.from("bku_transactions")
          .insert(childRecords).select("id");
        if (insertChildrenError) throw insertChildrenError;
        insertedChildIds = (insertedChildren || []).map((row: { id: string }) => row.id);
      }

      const { data: updatedOriginal, error: updateError } = await supabase.from("bku_transactions").update(records[0])
        .eq("id", editingTransactionId).eq("book_id", book.id).select("id").maybeSingle();
      const updateFailure = updateError || (!updatedOriginal
        ? new Error("Nota utama tidak berhasil diperbarui. Tidak ada perubahan yang diterapkan pada nota utama.")
        : null);
      if (updateFailure) {
        if (insertedChildIds.length) {
          const { error: cleanupError } = await supabase.from("bku_transactions").delete()
            .eq("book_id", book.id).in("id", insertedChildIds);
          if (cleanupError) {
            throw new Error(`${updateFailure.message}. Pembersihan nota hasil potongan juga gagal: ${cleanupError.message}. Periksa transaksi pada tanggal tersebut sebelum mencoba lagi.`);
          }
        }
        throw updateFailure;
      }
    } else {
      const insertRecords = records.map((record) => ({ ...record, created_by: activeSession.user.id }));
      const { error: insertError } = await supabase.from("bku_transactions").insert(insertRecords);
      if (insertError) throw insertError;
    }

    const groupIds = Array.from(new Set(valid.map((draft) => draft.split_group_id).filter((value): value is string => Boolean(value))));
    for (const groupId of groupIds) await refreshSplitGroup(supabase, book.id, groupId);
    await loadTransactions(book.id);
  }, [supabase, book, session?.user?.id, transactions, stores, materials, loadTransactions]);

  const deleteTransaction = useCallback(async (transaction: Transaction) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const { error: deleteError } = await supabase.from("bku_transactions").delete()
      .eq("id", transaction.id).eq("book_id", book.id);
    if (deleteError) throw deleteError;
    if (transaction.split_group_id) await refreshSplitGroup(supabase, book.id, transaction.split_group_id);
    await loadTransactions(book.id);
  }, [supabase, book?.id, loadTransactions]);

  const moveTransactions = useCallback(async (transactionIds: string[], targetDate: string) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const result = await moveTransactionsToDate({
      supabase,
      bookId: book.id,
      transactions,
      transactionIds,
      targetDate,
    });
    if (result.moved) await loadTransactions(book.id);
    return result;
  }, [supabase, book?.id, transactions, loadTransactions]);

  const shiftProjectSchedule = useCallback(async (targetDate: string) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const { data, error: rpcError } = await supabase.rpc("bku_shift_project_schedule", {
      p_book_id: book.id,
      p_new_start_date: targetDate,
    });
    if (rpcError) throw rpcError;
    await loadTransactions(book.id);
    return Number(data || 0);
  }, [supabase, book?.id, loadTransactions]);

  const createEvidenceUrl = useCallback(async (path: string) => {
    if (!supabase) throw new Error("Supabase BKU belum dikonfigurasi.");
    const { data, error: urlError } = await supabase.storage.from("bku-evidence").createSignedUrl(path, 60);
    if (urlError) throw urlError;
    return data.signedUrl;
  }, [supabase]);

  return {
    transactions,
    materials,
    stores,
    loading,
    error,
    setError,
    refresh,
    loadTransactions,
    saveEntries,
    deleteTransaction,
    moveTransactions,
    shiftProjectSchedule,
    createEvidenceUrl,
  };
}
