"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getProgressSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_PROGRESS_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_PROGRESS_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  if (!client) {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
