"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Book, MaterialGroup, MaterialAlias, MaterialPurchaseRecord } from "@/app/lib/bku/types";

type BkuClient = SupabaseClient;

function normalizeMaterialName(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}

export function useBkuMaterialSummary(
  supabase: BkuClient | null,
  session: Session | null,
  books: Book[],
) {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [aliases, setAliases] = useState<MaterialAlias[]>([]);
  const [records, setRecords] = useState<MaterialPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bookIdsKey = books.map((book) => book.id).sort().join(",");
  const bookNamesKey = books.map((book) => `${book.id}:${book.name}`).sort().join("|");
  const bookNameById = new Map(books.map((book) => [book.id, book.name]));

  const refresh = useCallback(async () => {
    if (!supabase || !session?.user || !bookIdsKey) {
      setGroups([]);
      setAliases([]);
      setRecords([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { error: defaultsError } = await supabase.rpc("bku_ensure_material_group_defaults");
      if (defaultsError) throw defaultsError;

      const [groupResult, aliasResult] = await Promise.all([
        supabase.from("bku_material_groups")
          .select("id,created_by,name,is_active,created_at")
          .eq("is_active", true)
          .order("name"),
        supabase.from("bku_material_aliases")
          .select("id,created_by,group_id,material_name,normalized_name,created_at")
          .order("material_name"),
      ]);
      if (groupResult.error) throw groupResult.error;
      if (aliasResult.error) throw aliasResult.error;

      const bookIds = bookIdsKey.split(",").filter(Boolean);
      const allRecords: MaterialPurchaseRecord[] = [];
      const pageSize = 1000;

      for (const bookId of bookIds) {
        let offset = 0;
        while (true) {
          const { data, error: transactionError } = await supabase
            .from("bku_transactions")
            .select("id,book_id,transaction_date,entry_no,receipt_number,description,store_name,transaction_type,details")
            .eq("book_id", bookId)
            .eq("transaction_type", "OUT")
            .order("transaction_date", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (transactionError) throw transactionError;

          const rows = data || [];
          for (const transaction of rows) {
            const details = Array.isArray(transaction.details) ? transaction.details as Array<{
              name?: unknown;
              unit?: unknown;
              volume?: unknown;
              unit_price?: unknown;
              line_total?: unknown;
            }> : [];
            for (const [detailIndex, detail] of details.entries()) {
              const name = String(detail.name || "").trim();
              if (!name) continue;
              const volume = Number(detail.volume || 0);
              const unitPrice = Number(detail.unit_price || 0);
              const amount = Number(detail.line_total ?? volume * unitPrice);
              allRecords.push({
                transaction_id: String(transaction.id),
                book_id: String(transaction.book_id),
                book_name: bookNameById.get(String(transaction.book_id)) || "Proyek tidak diketahui",
                transaction_date: String(transaction.transaction_date),
                entry_no: Number(transaction.entry_no || 0),
                receipt_number: transaction.receipt_number ? String(transaction.receipt_number) : null,
                description: String(transaction.description || ""),
                store_name: String(transaction.store_name || ""),
                detail_index: detailIndex,
                name,
                normalized_name: normalizeMaterialName(name),
                unit: String(detail.unit || "satuan tidak diisi").trim() || "satuan tidak diisi",
                volume: Number.isFinite(volume) ? volume : 0,
                unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
                amount: Number.isFinite(amount) ? amount : 0,
              });
            }
          }

          if (rows.length < pageSize) break;
          offset += pageSize;
        }
      }

      setGroups((groupResult.data || []) as MaterialGroup[]);
      setAliases((aliasResult.data || []) as MaterialAlias[]);
      setRecords(allRecords);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rekap material gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [supabase, session?.user?.id, bookIdsKey, bookNamesKey]);

  useEffect(() => {
    if (session?.user && books.length) void refresh();
    else {
      setGroups([]);
      setAliases([]);
      setRecords([]);
    }
  }, [session?.user?.id, bookIdsKey, refresh]);

  const createGroup = useCallback(async (name: string) => {
    if (!supabase || !session?.user) throw new Error("Sesi akun tidak tersedia.");
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Nama kelompok wajib diisi.");

    const { data, error: insertError } = await supabase.from("bku_material_groups")
      .insert({ name: cleanName, created_by: session.user.id })
      .select("id,created_by,name,is_active,created_at")
      .single();
    if (insertError) {
      if (insertError.message.toLowerCase().includes("duplicate")) {
        throw new Error("Nama kelompok tersebut sudah tersedia.");
      }
      throw insertError;
    }
    const group = data as MaterialGroup;
    setGroups((current) => [...current, group].sort((a, b) => a.name.localeCompare(b.name)));
    return group;
  }, [supabase, session?.user?.id]);

  const mapMaterial = useCallback(async (groupId: string, materialName: string) => {
    if (!supabase) throw new Error("Supabase BKU belum dikonfigurasi.");
    const { data, error: mapError } = await supabase.rpc("bku_map_material_alias", {
      p_group_id: groupId,
      p_material_name: materialName.trim(),
    });
    if (mapError) throw mapError;
    const saved = data as MaterialAlias;
    setAliases((current) => [
      ...current.filter((item) => item.normalized_name !== saved.normalized_name),
      saved,
    ].sort((a, b) => a.material_name.localeCompare(b.material_name)));
    return saved;
  }, [supabase]);

  return { groups, aliases, records, loading, error, refresh, createGroup, mapMaterial };
}
