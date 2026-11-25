'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EffectivePermission, MyAccess } from '@/types/auth';
import { supabase } from '@/lib/supabase';

type AppAccessState = {
  loading: boolean;
  error: string | null;
  hasPermission: (code: string, projectId?: string | null) => boolean;
  hasCompanyPermission: (code: string) => boolean;
};

/**
 * Reads the same effective, date-aware permissions used by database RLS.
 * Fail-closed: an RPC error or missing access payload grants no UI actions.
 */
export function useAppAccess(): AppAccessState {
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;

    const load = async () => {
      const version = ++requestVersion;
      try {
        const { data, error: accessError } = await supabase.rpc('get_my_access');
        if (accessError) throw accessError;

        const access = (data ?? null) as MyAccess | null;
        const nextPermissions = Array.isArray(access?.permissions)
          ? access.permissions.filter(
              (item): item is EffectivePermission =>
                Boolean(item) &&
                typeof item.code === 'string' &&
                (item.project_id === null || typeof item.project_id === 'string'),
            )
          : [];

        if (!active || version !== requestVersion) return;
        setPermissions(nextPermissions);
        setError(null);
      } catch (caught) {
        if (!active || version !== requestVersion) return;
        setPermissions([]);
        setError(caught instanceof Error ? caught.message : 'Gagal memeriksa hak akses.');
      } finally {
        if (active && version === requestVersion) setLoading(false);
      }
    };

    void load();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED hanya memperbarui kredensial sesi, bukan hak akses.
      // Hindari loading ulang yang dapat mengganggu formulir pada halaman master.
      if (event === 'TOKEN_REFRESHED') return;
      setLoading(true);
      void load();
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const hasPermission = useCallback(
    (code: string, projectId?: string | null) =>
      permissions.some(
        (permission) =>
          permission.code === code &&
          (permission.project_id === null ||
            (typeof projectId === 'string' && permission.project_id === projectId)),
      ),
    [permissions],
  );

  const hasCompanyPermission = useCallback(
    (code: string) =>
      permissions.some((permission) => permission.code === code && permission.project_id === null),
    [permissions],
  );

  return { loading, error, hasPermission, hasCompanyPermission };
}
