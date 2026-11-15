import { supabase } from '@/lib/supabase';
import type { MyAccess, SignInCredentials, UserProfile } from '@/types/auth';

export async function signInWithPassword(credentials: SignInCredentials) {
  const email = credentials.email.trim().toLowerCase();
  if (!email || !credentials.password) {
    throw new Error('Email dan kata sandi wajib diisi.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: credentials.password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export async function getMyAccess(): Promise<MyAccess> {
  const user = await getCurrentUser();
  if (!user) return { profile: null, roles: [], permissions: [] };

  const { data, error } = await supabase.rpc('get_my_access');
  if (error) throw new Error(`Gagal membaca hak akses pengguna: ${error.message}`);

  const payload = (data ?? {}) as Partial<MyAccess>;
  return {
    profile: (payload.profile ?? null) as UserProfile | null,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };
}

export async function updateMyProfile(input: {
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
}) {
  const fullName = input.full_name.trim();
  if (!fullName) throw new Error('Nama lengkap wajib diisi.');

  const { error } = await supabase.rpc('update_my_profile', {
    p_full_name: fullName,
    p_phone: input.phone?.trim() || null,
    p_avatar_url: input.avatar_url?.trim() || null,
  });
  if (error) throw new Error(`Gagal memperbarui profil: ${error.message}`);
}

export function subscribeToAuthChanges(
  callback: (event: string, session: unknown) => void,
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}

export function hasPermission(
  access: MyAccess | null | undefined,
  permissionCode: string,
  projectId?: string | null,
): boolean {
  if (!access?.profile?.is_active) return false;
  return access.permissions.some((permission) =>
    permission.code === permissionCode &&
    (permission.project_id === null || permission.project_id === (projectId ?? null)),
  );
}

export function hasRole(
  access: MyAccess | null | undefined,
  roleCode: string,
  projectId?: string | null,
): boolean {
  if (!access?.profile?.is_active) return false;
  return access.roles.some((role) =>
    role.code === roleCode &&
    (role.project_id === null || role.project_id === (projectId ?? null)),
  );
}
