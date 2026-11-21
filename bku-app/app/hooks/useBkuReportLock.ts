"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Book } from "@/app/lib/bku/types";

type BkuClient = SupabaseClient;
type BookLock = {
  book_id: string;
  locked_through_date: string | null;
  created_by: string;
  locked_by: string | null;
  locked_at: string | null;
  updated_at: string;
};

const LOCK_SELECT = "book_id,locked_through_date,created_by,locked_by,locked_at,updated_at";

export function useBkuReportLock(supabase: BkuClient | null, session: Session | null, book: Book | null) {
  const [lock, setLock] = useState<BookLock | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !session?.user || !book?.id) {
      setLock(null);
      return;
    }
    setLock(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.from("bku_book_locks")
        .select(LOCK_SELECT).eq("book_id", book.id).maybeSingle();
      if (error) throw error;
      setLock((data || null) as BookLock | null);
    } finally {
      setLoading(false);
    }
  }, [supabase, session?.user?.id, book?.id]);

  useEffect(() => { void refresh().catch(() => setLock(null)); }, [refresh]);

  const setLockedThroughDate = useCallback(async (value: string | null) => {
    if (!supabase || !session?.user || !book?.id) throw new Error("Sesi akun atau buku kas tidak tersedia.");
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < book.start_date)) {
      throw new Error("Tanggal penguncian harus sama dengan atau setelah tanggal mulai proyek.");
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        book_id: book.id,
        locked_through_date: value,
        created_by: session.user.id,
        locked_by: value ? session.user.id : null,
        locked_at: value ? now : null,
        updated_at: now,
      };
      const { data, error } = await supabase.from("bku_book_locks")
        .upsert(payload, { onConflict: "book_id" })
        .select(LOCK_SELECT).single();
      if (error) throw error;
      setLock(data as BookLock);
      return data as BookLock;
    } finally {
      setSaving(false);
    }
  }, [supabase, session?.user?.id, book?.id, book?.start_date]);

  const lockedThroughDate = lock?.locked_through_date || null;
  const isDateLocked = useCallback((value: string) => Boolean(lockedThroughDate && value <= lockedThroughDate), [lockedThroughDate]);

  return { lock, lockedThroughDate, isDateLocked, loading, saving, refresh, setLockedThroughDate };
}
