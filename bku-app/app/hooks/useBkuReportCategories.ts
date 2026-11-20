"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory, ReportCategoryInput } from "@/app/lib/bku/types";

export function useBkuReportCategories(supabase: SupabaseClient | null, session: Session | null) {
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase || !session?.user) {
      setCategories([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("bku_report_categories")
        .select("transaction_type,code,label,sort_order,is_active")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (queryError) throw queryError;
      setCategories((data || []) as ReportCategory[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Master kategori rekap gagal dimuat.");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, session?.user?.id]);

  const save = useCallback(async (input: ReportCategoryInput, isNew: boolean) => {
    if (!supabase || !session?.user) throw new Error("Sesi login BKU sudah berakhir. Silakan masuk kembali.");
    const functionName = isNew ? "bku_create_report_category" : "bku_update_report_category";
    const { error: mutationError } = await supabase.rpc(functionName, {
      p_transaction_type: input.transaction_type,
      p_code: input.code,
      p_label: input.label,
      p_sort_order: input.sort_order,
    });
    if (mutationError) throw mutationError;
    await refresh();
  }, [supabase, session?.user?.id, refresh]);

  const setActive = useCallback(async (category: ReportCategory, isActive: boolean) => {
    if (!supabase || !session?.user) throw new Error("Sesi login BKU sudah berakhir. Silakan masuk kembali.");
    const { error: mutationError } = await supabase.rpc("bku_set_report_category_active", {
      p_transaction_type: category.transaction_type,
      p_code: category.code,
      p_is_active: isActive,
    });
    if (mutationError) throw mutationError;
    await refresh();
  }, [supabase, session?.user?.id, refresh]);

  useEffect(() => {
    if (session?.user) void refresh();
    else {
      setCategories([]);
      setError("");
    }
  }, [session?.user?.id, refresh]);

  return { categories, loading, error, refresh, save, setActive };
}
