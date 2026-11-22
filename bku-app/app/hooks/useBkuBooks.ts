"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Book, NewBookInput, ProfileInput } from "@/app/lib/bku/types";

type BkuClient = SupabaseClient;
const BOOK_SELECT = "id,name,school_head,planner,supervisor,p2sp,address,phone,npsn,start_date,opening_cash,opening_bank";

export function useBkuBooks(supabase: BkuClient | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setAuthError(sessionError.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("bku_books")
        .select(BOOK_SELECT)
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      const nextBooks = (data || []) as Book[];
      setBooks(nextBooks);
      setBook((current) => nextBooks.find((item) => item.id === current?.id) || nextBooks[0] || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Daftar buku kas gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [supabase, session?.user?.id]);

  useEffect(() => {
    if (session?.user) void loadBooks();
    else {
      setBooks([]);
      setBook(null);
    }
  }, [session?.user?.id, loadBooks]);

  const signInOrRegister = useCallback(async () => {
    if (!supabase) throw new Error("Supabase BKU belum dikonfigurasi.");
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      setSession(result.data.session);
      if (authMode === "register" && !result.data.session) {
        setAuthError("Pendaftaran diterima. Periksa email untuk konfirmasi sebelum masuk.");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Autentikasi gagal.";
      setAuthError(message);
      throw cause;
    } finally {
      setAuthLoading(false);
    }
  }, [supabase, authMode, email, password]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setSession(null);
    setBooks([]);
    setBook(null);
  }, [supabase]);

  const createBook = useCallback(async (input: NewBookInput) => {
    if (!supabase || !session?.user) throw new Error("Sesi akun BKU tidak tersedia.");
    const { data, error: insertError } = await supabase.from("bku_books").insert({
      name: input.name.trim(),
      school_head: input.school_head.trim(),
      planner: input.planner.trim(),
      supervisor: input.supervisor.trim(),
      p2sp: input.p2sp.trim(),
      address: "",
      phone: "",
      npsn: "",
      start_date: input.start_date,
      opening_cash: input.opening_cash,
      opening_bank: input.opening_bank,
      created_by: session.user.id,
    }).select(BOOK_SELECT).single();
    if (insertError) throw insertError;
    const created = data as Book;
    setBooks((current) => [created, ...current]);
    setBook(created);
    return created;
  }, [supabase, session?.user?.id]);

  const saveProfile = useCallback(async (input: ProfileInput) => {
    if (!supabase || !book) throw new Error("Pilih buku kas terlebih dahulu.");
    const { data, error: updateError } = await supabase.from("bku_books").update({
      name: input.name.trim(),
      school_head: input.school_head.trim(),
      planner: input.planner.trim(),
      supervisor: input.supervisor.trim(),
      p2sp: input.p2sp.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      npsn: input.npsn.trim(),
    }).eq("id", book.id).select(BOOK_SELECT).single();
    if (updateError) throw updateError;
    const updated = data as Book;
    setBook(updated);
    setBooks((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }, [supabase, book]);

  return {
    session,
    authLoading,
    authMode,
    setAuthMode,
    email,
    setEmail,
    password,
    setPassword,
    authError,
    setAuthError,
    signInOrRegister,
    signOut,
    books,
    setBooks,
    book,
    setBook,
    loadBooks,
    createBook,
    saveProfile,
    loading,
    error,
    setError,
  };
}
