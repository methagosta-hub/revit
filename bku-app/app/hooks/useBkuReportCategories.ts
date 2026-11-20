"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory } from "@/app/lib/bku/types";

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
        .eq("is_active", true)
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

  useEffect(() => {
    if (session?.user) void refresh();
    else {
      setCategories([]);
      setError("");
    }
  }, [session?.user?.id, refresh]);

  return { categories, loading, error, refresh };
}
