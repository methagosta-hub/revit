import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminContext = { actorId: string; admin: SupabaseClient };
type RoleScope = 'company' | 'project' | 'both';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isResponse(value: AdminContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

async function getAdminContext(request: NextRequest): Promise<AdminContext | NextResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return jsonError('Sesi login diperlukan.', 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return jsonError('Konfigurasi server Supabase belum lengkap. Periksa URL, anon key, dan server secret.', 500);
  }

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return jsonError('Sesi login tidak valid atau sudah berakhir.', 401);

  const { data: isAdmin, error: accessError } = await caller.rpc('is_company_admin');
  if (accessError) return jsonError(`Pemeriksaan kewenangan gagal: ${accessError.message}`, 403);
  if (isAdmin !== true) return jsonError('Hanya Direktur atau Administrator yang dapat mengelola katalog role.', 403);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { actorId: userData.user.id, admin };
}

async function writeAudit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  roleId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
) {
  const { error } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action,
    table_name: 'app_roles',
    record_id: roleId,
    old_data: oldData,
    new_data: newData,
    metadata: { source: 'role_permission_center' },
  });
  if (error) console.warn('Audit perubahan role tidak tersimpan:', error.message);
}

function isValidScope(value: unknown): value is RoleScope {
  return value === 'company' || value === 'project' || value === 'both';
}

function cleanPermissionIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map((id) => String(id ?? '').trim());
  if (ids.some((id) => !id)) return null;
  return [...new Set(ids)];
}

async function validatePermissionIds(admin: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return { valid: true as const };
  const { data, error } = await admin.from('app_permissions').select('id').in('id', ids);
  if (error) return { valid: false as const, error: `Gagal memeriksa katalog otoritas: ${error.message}` };
  if ((data ?? []).length !== ids.length) return { valid: false as const, error: 'Salah satu permission tidak ditemukan di katalog.' };
  return { valid: true as const };
}

async function getRoleWithPermissions(admin: SupabaseClient, roleId: string) {
  const [{ data: role, error: roleError }, { data: grants, error: grantsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    admin.from('app_roles').select('id, code, name, scope, description, is_system, created_at').eq('id', roleId).maybeSingle(),
    admin.from('role_permissions').select('permission_id').eq('role_id', roleId),
    admin.from('user_role_assignments').select('id').eq('role_id', roleId).is('revoked_at', null),
  ]);
  if (roleError || grantsError || assignmentsError) {
    return { error: roleError?.message || grantsError?.message || assignmentsError?.message || 'Gagal membaca role.' };
  }
  if (!role) return { error: 'Role tidak ditemukan.' };
  return {
    role,
    permissionIds: (grants ?? []).map((row: { permission_id: string }) => row.permission_id),
    assignmentCount: (assignments ?? []).length,
  };
}

async function applyPermissionChanges(admin: SupabaseClient, roleId: string, nextIds: string[]) {
  const current = await getRoleWithPermissions(admin, roleId);
  if ('error' in current) return { error: current.error };

  const currentSet = new Set(current.permissionIds);
  const nextSet = new Set(nextIds);
  const removeIds = current.permissionIds.filter((id) => !nextSet.has(id));
  const addIds = nextIds.filter((id) => !currentSet.has(id));

  if (removeIds.length) {
    const { error } = await admin.from('role_permissions')
      .delete().eq('role_id', roleId).in('permission_id', removeIds);
    if (error) return { error: `Gagal mencabut otoritas: ${error.message}` };
  }

  if (addIds.length) {
    const { error } = await admin.from('role_permissions').insert(
      addIds.map((permission_id) => ({ role_id: roleId, permission_id })),
    );
    if (error) {
      // Best-effort compensation: restore grants removed earlier if the insert fails.
      if (removeIds.length) {
        await admin.from('role_permissions').insert(
          removeIds.map((permission_id) => ({ role_id: roleId, permission_id })),
        );
      }
      return { error: `Gagal menambahkan otoritas. Perubahan sebelumnya dipulihkan bila memungkinkan: ${error.message}` };
    }
  }
  return { permissionIds: nextIds };
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin } = context;

  const [rolesResult, permissionsResult, grantsResult, assignmentsResult] = await Promise.all([
    admin.from('app_roles')
      .select('id, code, name, scope, description, is_system, created_at')
      .order('is_system', { ascending: false })
      .order('name'),
    admin.from('app_permissions')
      .select('id, code, name, module, description')
      .order('module')
      .order('name'),
    admin.from('role_permissions').select('role_id, permission_id'),
    admin.from('user_role_assignments').select('role_id, user_id').is('revoked_at', null),
  ]);

  const failed = [rolesResult.error, permissionsResult.error, grantsResult.error, assignmentsResult.error].find(Boolean);
  if (failed) return jsonError(`Gagal memuat katalog role & permission: ${failed.message}`, 500);

  const grantRows = grantsResult.data ?? [];
  const assignmentRows = assignmentsResult.data ?? [];
  const roles = (rolesResult.data ?? []).map((role) => ({
    ...role,
    permission_ids: grantRows
      .filter((grant) => grant.role_id === role.id)
      .map((grant) => grant.permission_id),
    assigned_users_count: new Set(
      assignmentRows.filter((assignment) => assignment.role_id === role.id).map((assignment) => assignment.user_id),
    ).size,
    assignment_count: assignmentRows.filter((assignment) => assignment.role_id === role.id).length,
  }));

  return NextResponse.json(
    { roles, permissions: permissionsResult.data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin, actorId } = context;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Format permintaan tidak valid.'); }

  const action = String(body.action ?? 'create');
  if (action !== 'create') return jsonError('Aksi POST tidak dikenal.');

  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim();
  const scope = body.scope;
  const permissionIds = cleanPermissionIds(body.permission_ids);
  if (!name) return jsonError('Nama role wajib diisi.');
  if (name.length > 120) return jsonError('Nama role maksimal 120 karakter.');
  if (description.length > 500) return jsonError('Deskripsi maksimal 500 karakter.');
  if (!isValidScope(scope)) return jsonError('Scope role tidak valid.');
  if (!permissionIds) return jsonError('Daftar permission tidak valid.');

  const permissionCheck = await validatePermissionIds(admin, permissionIds);
  if (!permissionCheck.valid) return jsonError(permissionCheck.error, 400);

  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'role';
  const code = `custom_${slug}_${crypto.randomUUID().slice(0, 8)}`;
  const { data: role, error: roleError } = await admin.from('app_roles').insert({
    code,
    name,
    scope,
    description: description || null,
    is_system: false,
  }).select('id, code, name, scope, description, is_system, created_at').single();
  if (roleError || !role) return jsonError(`Role gagal dibuat: ${roleError?.message ?? 'Data role tidak diterima.'}`, 400);

  if (permissionIds.length) {
    const { error } = await admin.from('role_permissions').insert(
      permissionIds.map((permission_id) => ({ role_id: role.id, permission_id })),
    );
    if (error) {
      await admin.from('app_roles').delete().eq('id', role.id);
      return jsonError(`Otoritas role gagal disimpan. Role baru telah dibatalkan: ${error.message}`, 400);
    }
  }

  await writeAudit(admin, actorId, 'role.created', role.id, null, {
    code: role.code,
    name: role.name,
    scope: role.scope,
    description: role.description,
    permission_ids: permissionIds,
  });
  return NextResponse.json({ success: true, role }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin, actorId } = context;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Format permintaan tidak valid.'); }

  const roleId = String(body.role_id ?? '').trim();
  if (!roleId) return jsonError('ID role wajib diisi.');
  const current = await getRoleWithPermissions(admin, roleId);
  if ('error' in current) return jsonError(current.error ?? 'Role tidak ditemukan atau gagal dibaca.', 404);
  const { role, permissionIds: oldPermissionIds, assignmentCount } = current;

  if (['director', 'admin'].includes(role.code)) {
    return jsonError('Otoritas inti Direktur dan Administrator dikunci untuk melindungi akses pengendali sistem.', 403);
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return jsonError('Nama role tidak boleh kosong.');
    if (name.length > 120) return jsonError('Nama role maksimal 120 karakter.');
    update.name = name;
  }
  if (typeof body.description === 'string') {
    const description = body.description.trim();
    if (description.length > 500) return jsonError('Deskripsi maksimal 500 karakter.');
    update.description = description || null;
  }
  if (body.scope !== undefined) {
    if (!isValidScope(body.scope)) return jsonError('Scope role tidak valid.');
    if (body.scope !== role.scope && assignmentCount > 0) {
      return jsonError('Scope tidak dapat diubah karena role ini sudah digunakan pada penugasan pengguna. Cabut atau pindahkan penugasan terlebih dahulu.');
    }
    update.scope = body.scope;
  }

  let nextPermissionIds = oldPermissionIds;
  if (body.permission_ids !== undefined) {
    const parsed = cleanPermissionIds(body.permission_ids);
    if (!parsed) return jsonError('Daftar permission tidak valid.');
    const permissionCheck = await validatePermissionIds(admin, parsed);
    if (!permissionCheck.valid) return jsonError(permissionCheck.error, 400);
    nextPermissionIds = parsed;
  }

  const before = {
    name: role.name,
    scope: role.scope,
    description: role.description,
    permission_ids: oldPermissionIds,
  };

  if (Object.keys(update).length) {
    const { error } = await admin.from('app_roles').update(update).eq('id', roleId);
    if (error) return jsonError(`Informasi role gagal diperbarui: ${error.message}`, 400);
  }

  if (body.permission_ids !== undefined) {
    const applied = await applyPermissionChanges(admin, roleId, nextPermissionIds);
    if ('error' in applied) {
      // Restore role metadata if grant changes could not be completed.
      if (Object.keys(update).length) await admin.from('app_roles').update({
        name: role.name,
        scope: role.scope,
        description: role.description,
      }).eq('id', roleId);
      return jsonError(applied.error ?? 'Perubahan permission gagal diterapkan.', 400);
    }
  }

  const changed = {
    ...before,
    after: {
      ...before,
      ...update,
      permission_ids: nextPermissionIds,
    },
  };
  await writeAudit(admin, actorId, 'role.updated', roleId, before, changed.after);
  return NextResponse.json({ success: true, role_id: roleId });
}

export async function DELETE(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin, actorId } = context;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Format permintaan tidak valid.'); }
  const roleId = String(body.role_id ?? '').trim();
  if (!roleId) return jsonError('ID role wajib diisi.');

  const current = await getRoleWithPermissions(admin, roleId);
  if ('error' in current) return jsonError(current.error ?? 'Role tidak ditemukan atau gagal dibaca.', 404);
  if (current.role.is_system) return jsonError('Role bawaan sistem tidak dapat dihapus.');
  if (current.assignmentCount > 0) {
    return jsonError(`Role masih digunakan oleh ${current.assignmentCount} penugasan. Pindahkan atau cabut semua penugasan sebelum menghapus role.`);
  }

  const { error } = await admin.from('app_roles').delete().eq('id', roleId);
  if (error) return jsonError(`Role gagal dihapus: ${error.message}`, 400);
  await writeAudit(admin, actorId, 'role.deleted', roleId, {
    code: current.role.code,
    name: current.role.name,
    scope: current.role.scope,
    description: current.role.description,
    permission_ids: current.permissionIds,
  }, null);
  return NextResponse.json({ success: true });
}