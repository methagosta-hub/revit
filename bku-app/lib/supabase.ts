import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getBkuSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_BKU_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}