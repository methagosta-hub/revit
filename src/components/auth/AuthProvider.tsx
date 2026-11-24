'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  getMyAccess,
  hasPermission,
  hasRole,
  signInWithPassword,
  signOut as signOutService,
} from '@/lib/services/authService';
import type { MyAccess, SignInCredentials } from '@/types/auth';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  access: MyAccess | null;
  loading: boolean;
  accessError: string;
  refreshAccess: () => Promise<MyAccess | null>;
  signIn: (credentials: SignInCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permissionCode: string, projectId?: string | null) => boolean;
  hasRoleCode: (roleCode: string, projectId?: string | null) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');

  const refreshAccess = useCallback(async (): Promise<MyAccess | null> => {
    try {
      const result = await getMyAccess();
      setAccess(result);
      setAccessError('');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hak akses tidak dapat dibaca.';
      setAccess(null);
      setAccessError(message);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadForSession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession?.user) {
        setAccess(null);
        setAccessError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await refreshAccess();
      if (!active) return;
      if (result && !result.profile) {
        setAccessError('Profil pengguna belum tersedia. Hubungi administrator perusahaan.');
      }
      setLoading(false);
    };

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Perpanjangan token adalah proses normal. Jangan memicu pemeriksaan akses
      // penuh karena RequireAuth akan melepas halaman dan membuang state formulir.
      if (event === 'TOKEN_REFRESHED' && nextSession?.user) {
        window.setTimeout(() => {
          if (active) setSession(nextSession);
        }, 0);
        return;
      }

      // Event autentikasi selain refresh token dapat mengubah identitas atau akses.
      // Jalankan pemeriksaan jaringan setelah callback auth selesai.
      window.setTimeout(() => {
        if (active) void loadForSession(nextSession);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) {
        setAccessError(error.message);
        setLoading(false);
        return;
      }
      void loadForSession(sessionData.session);
    }).catch((error: unknown) => {
      if (!active) return;
      setAccessError(error instanceof Error ? error.message : 'Sesi pengguna tidak dapat diperiksa.');
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refreshAccess]);

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    setLoading(true);
    setAccessError('');
    try {
      const result = await signInWithPassword(credentials);
      setSession(result.session);
      const nextAccess = await refreshAccess();
      if (!nextAccess?.profile) {
        await signOutService();
        setSession(null);
        throw new Error('Profil akun belum tersedia. Pastikan akun sudah dibuat oleh administrator.');
      }
      if (!nextAccess.profile.is_active) {
        await signOutService();
        setSession(null);
        setAccess(null);
        throw new Error('Akun Anda sedang dinonaktifkan. Hubungi administrator perusahaan.');
      }
      if (nextAccess.roles.length === 0) {
        await signOutService();
        setSession(null);
        setAccess(null);
        throw new Error('Akun belum memiliki peran perusahaan atau proyek. Hubungi Direktur/Administrator.');
      }
    } finally {
      setLoading(false);
    }
  }, [refreshAccess]);

  const signOut = useCallback(async () => {
    await signOutService();
    setSession(null);
    setAccess(null);
    setAccessError('');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    access,
    loading,
    accessError,
    refreshAccess,
    signIn,
    signOut,
    can: (permissionCode, projectId) => hasPermission(access, permissionCode, projectId),
    hasRoleCode: (roleCode, projectId) => hasRole(access, roleCode, projectId),
  }), [session, access, loading, accessError, refreshAccess, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return context;
}
