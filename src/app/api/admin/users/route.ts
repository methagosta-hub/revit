import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RoleRow = {
  id: string;
  code: string;
  name: string;
  scope: 'company' | 'project' | 'both';
};
type AssignmentInput = { role_id: string; project_id?: string | null };
type AdminContext = { actorId: string; admin: SupabaseClient };

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
    return jsonError('Konfigurasi server Supabase belum lengkap. Pastikan SUPABASE_SECRET_KEY sudah diatur di .env.local.', 500);
  }

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return jsonError('Sesi login tidak valid atau sudah berakhir.', 401);

  const { data: isAdmin, error: accessError } = await caller.rpc('is_company_admin');
  if (accessError) return jsonError(`Pemeriksaan kewenangan gagal: ${accessError.message}`, 403);
  if (isAdmin !== true) return jsonError('Hanya Direktur atau Administrator yang dapat mengelola pengguna.', 403);

  // Service-role key hanya digunakan di server route ini, tidak pernah dikirim ke browser.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { actorId: userData.user.id, admin };
}

async function validateAssignments(
  admin: SupabaseClient,
  input: unknown,
): Promise<{ rows: Array<{ role_id: string; project_id: string | null }>; error?: string }> {
  if (!Array.isArray(input) || input.length === 0) {
    return { rows: [], error: 'Pilih minimal satu peran untuk pengguna.' };
  }
  if (input.length > 10) return { rows: [], error: 'Maksimal 10 penugasan per perintah.' };

  const requested = input as AssignmentInput[];
  const roleIds = [...new Set(requested.map((item) => String(item?.role_id ?? '').trim()).filter(Boolean))];
  if (!roleIds.length) return { rows: [], error: 'Peran pengguna tidak valid.' };

  const { data: roles, error: roleError } = await admin
    .from('app_roles')
    .select('id, code, name, scope')
    .in('id', roleIds);
  if (roleError) return { rows: [], error: `Gagal membaca daftar peran: ${roleError.message}` };

  const byId = new Map<string, RoleRow>((roles ?? []).map((role: RoleRow) => [role.id, role]));
  if (byId.size !== roleIds.length) return { rows: [], error: 'Salah satu peran tidak ditemukan.' };

  const projectIds = [...new Set(requested.map((item) => item?.project_id).filter((id): id is string => typeof id === 'string' && Boolean(id)))];
  if (projectIds.length) {
    const { data: projects, error: projectError } = await admin
      .from('projects')
      .select('id')
      .in('id', projectIds);
    if (projectError) return { rows: [], error: `Gagal memeriksa proyek: ${projectError.message}` };
    if ((projects ?? []).length !== projectIds.length) return { rows: [], error: 'Salah satu proyek tidak ditemukan.' };
  }

  const normalized: Array<{ role_id: string; project_id: string | null }> = [];
  const seen = new Set<string>();
  for (const item of requested) {
    const roleId = String(item?.role_id ?? '').trim();
    const role = byId.get(roleId);
    if (!role) return { rows: [], error: 'Peran tidak valid.' };
    const projectId = typeof item.project_id === 'string' && item.project_id.trim() ? item.project_id.trim() : null;
    if (role.scope === 'company' && projectId) {
      return { rows: [], error: `Peran ${role.name} hanya berlaku di tingkat perusahaan.` };
    }
    if (role.scope === 'project' && !projectId) {
      return { rows: [], error: `Peran ${role.name} wajib ditugaskan pada proyek tertentu.` };
    }
    const key = `${roleId}:${projectId ?? 'COMPANY'}`;
    if (seen.has(key)) return { rows: [], error: `Penugasan ${role.name} tercantum lebih dari sekali.` };
    seen.add(key);
    normalized.push({ role_id: roleId, project_id: projectId });
  }
  return { rows: normalized };
}

async function writeAudit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  recordId: string,
  newData: Record<string, unknown>,
) {
  const { error } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action,
    table_name: 'user_profiles',
    record_id: recordId,
    new_data: newData,
  });
  if (error) console.warn('Audit log pengguna tidak tersimpan:', error.message);
}

async function hasOtherActiveCompanyAdmin(
  admin: SupabaseClient,
  excludedUserId: string,
  excludedAssignmentId?: string,
): Promise<{ allowed: boolean; error?: string }> {
  const { data: adminRoles, error: rolesError } = await admin
    .from('app_roles')
    .select('id')
    .in('code', ['director', 'admin']);
  if (rolesError) return { allowed: false, error: rolesError.message };
  const roleIds = (adminRoles ?? []).map((row: { id: string }) => row.id);
  if (!roleIds.length) return { allowed: false, error: 'Peran Direktur/Administrator tidak ditemukan.' };

  let query = admin
    .from('user_role_assignments')
    .select('user_id')
    .in('role_id', roleIds)
    .is('project_id', null);
  if (excludedAssignmentId) query = query.neq('id', excludedAssignmentId);
  const { data: assignments, error: assignmentsError } = await query;
  if (assignmentsError) return { allowed: false, error: assignmentsError.message };

  const userIds = [...new Set((assignments ?? []).map((row: { user_id: string }) => row.user_id).filter((id: string) => id !== excludedUserId))];
  if (!userIds.length) return { allowed: false };

  const { data: profiles, error: profilesError } = await admin
    .from('user_profiles')
    .select('id')
    .in('id', userIds)
    .eq('is_active', true);
  if (profilesError) return { allowed: false, error: profilesError.message };
  return { allowed: (profiles ?? []).length > 0 };
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin } = context;

  const [profilesResult, assignmentsResult, rolesResult, projectsResult, authUsersResult] = await Promise.all([
    admin.from('user_profiles')
      .select('id, employee_code, full_name, phone, avatar_url, is_active, created_at, updated_at')
      .order('full_name'),
    admin.from('user_role_assignments').select('id, user_id, role_id, project_id, assigned_at'),
    admin.from('app_roles').select('id, code, name, scope').order('name'),
    admin.from('projects').select('id, title').order('title'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const failed = [profilesResult.error, assignmentsResult.error, rolesResult.error, projectsResult.error, authUsersResult.error].find(Boolean);
  if (failed) return jsonError(`Gagal memuat direktori pengguna: ${failed.message}`, 500);

  const roles = (rolesResult.data ?? []) as RoleRow[];
  const roleMap = new Map<string, RoleRow>(roles.map((role) => [role.id, role] as [string, RoleRow]));
  const projectMap = new Map<string, string>((projectsResult.data ?? []).map((project: { id: string; title: string }) => [project.id, project.title] as [string, string]));
  const emailMap = new Map<string, string>((authUsersResult.data.users ?? []).map((user) => [user.id, user.email ?? ''] as [string, string]));

  const users = (profilesResult.data ?? []).map((profile) => ({
    ...profile,
    email: emailMap.get(profile.id) ?? '',
    assignments: (assignmentsResult.data ?? [])
      .filter((assignment) => assignment.user_id === profile.id)
      .map((assignment) => ({
        ...assignment,
        role: roleMap.get(assignment.role_id) ?? null,
        project_title: assignment.project_id ? projectMap.get(assignment.project_id) ?? 'Proyek tidak ditemukan' : null,
      })),
  }));

  return NextResponse.json({ users, roles, projects: projectsResult.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin, actorId } = context;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Format permintaan tidak valid.'); }

  const fullName = String(body.full_name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const phone = String(body.phone ?? '').trim() || null;
  const employeeCode = String(body.employee_code ?? '').trim() || null;
  if (!fullName || !email || !password) return jsonError('Nama lengkap, email dan kata sandi sementara wajib diisi.');
  if (password.length < 8) return jsonError('Kata sandi sementara minimal 8 karakter.');

  const validated = await validateAssignments(admin, body.role_assignments);
  if (validated.error) return jsonError(validated.error);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (createError || !created.user) return jsonError(createError?.message ?? 'Akun Auth gagal dibuat.', 400);

  const newUserId = created.user.id;
  const { error: profileError } = await admin.from('user_profiles').upsert({
    id: newUserId,
    full_name: fullName,
    phone,
    employee_code: employeeCode,
    is_active: true,
  }, { onConflict: 'id' });

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId);
    return jsonError(`Profil pengguna gagal disiapkan: ${profileError.message}`, 500);
  }

  const assignmentRows = validated.rows.map((row) => ({ ...row, user_id: newUserId, assigned_by: actorId }));
  const { error: assignmentError } = await admin.from('user_role_assignments').insert(assignmentRows);
  if (assignmentError) {
    await admin.auth.admin.deleteUser(newUserId);
    return jsonError(`Penugasan peran gagal. Akun yang baru dibuat telah dibatalkan: ${assignmentError.message}`, 400);
  }

  await writeAudit(admin, actorId, 'user.created', newUserId, {
    full_name: fullName,
    email,
    employee_code: employeeCode,
    role_assignments: validated.rows,
  });
  return NextResponse.json({ success: true, user_id: newUserId }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin, actorId } = context;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Format permintaan tidak valid.'); }

  const action = String(body.action ?? '');
  const userId = String(body.user_id ?? '').trim();
  if (!userId) return jsonError('ID pengguna wajib diisi.');

  const { data: targetProfile, error: targetError } = await admin
    .from('user_profiles').select('id, is_active').eq('id', userId).maybeSingle();
  if (targetError || !targetProfile) return jsonError('Pengguna tidak ditemukan.', 404);

  if (action === 'update_profile') {
    const update: Record<string, unknown> = {};
    if (typeof body.full_name === 'string') {
      const name = body.full_name.trim();
      if (!name) return jsonError('Nama lengkap tidak boleh kosong.');
      update.full_name = name;
    }
    if (typeof body.phone === 'string') update.phone = body.phone.trim() || null;
    if (typeof body.employee_code === 'string') update.employee_code = body.employee_code.trim() || null;
    if (typeof body.is_active === 'boolean') {
      if (userId === actorId && body.is_active === false) return jsonError('Anda tidak dapat menonaktifkan akun sendiri.');
      if (body.is_active === false && targetProfile.is_active) {
        const adminCheck = await hasOtherActiveCompanyAdmin(admin, userId);
        if (adminCheck.error) return jsonError(`Gagal memeriksa administrator lain: ${adminCheck.error}`, 500);
        if (!adminCheck.allowed) return jsonError('Akun ini adalah satu-satunya Direktur/Administrator aktif. Tambahkan administrator lain sebelum menonaktifkannya.');
      }
      update.is_active = body.is_active;
    }
    if (!Object.keys(update).length) return jsonError('Tidak ada perubahan profil yang dikirim.');
    const { error } = await admin.from('user_profiles').update(update).eq('id', userId);
    if (error) return jsonError(`Profil gagal diperbarui: ${error.message}`, 400);
    await writeAudit(admin, actorId, 'user.profile.updated', userId, update);
    return NextResponse.json({ success: true });
  }

  if (action === 'add_role') {
    const validated = await validateAssignments(admin, [{ role_id: body.role_id as string, project_id: (body.project_id as string | null) ?? null }]);
    if (validated.error) return jsonError(validated.error);
    const { error } = await admin.from('user_role_assignments').insert({
      user_id: userId,
      role_id: validated.rows[0].role_id,
      project_id: validated.rows[0].project_id,
      assigned_by: actorId,
    });
    if (error) return jsonError(`Peran gagal ditambahkan: ${error.message}`, 400);
    await writeAudit(admin, actorId, 'user.role.added', userId, validated.rows[0]);
    return NextResponse.json({ success: true });
  }

  if (action === 'remove_role') {
    const assignmentId = String(body.assignment_id ?? '').trim();
    if (!assignmentId) return jsonError('ID penugasan peran wajib diisi.');
    const { data: assignment, error: readError } = await admin
      .from('user_role_assignments')
      .select('id, user_id, role_id, project_id')
      .eq('id', assignmentId)
      .eq('user_id', userId)
      .single();
    if (readError || !assignment) return jsonError('Penugasan peran tidak ditemukan.', 404);

    const { data: role } = await admin.from('app_roles').select('id, code').eq('id', assignment.role_id).single();
    if (role && ['director', 'admin'].includes(role.code) && assignment.project_id === null) {
      const adminCheck = await hasOtherActiveCompanyAdmin(admin, userId, assignmentId);
      if (adminCheck.error) return jsonError(`Gagal memeriksa administrator lain: ${adminCheck.error}`, 500);
      // User yang sama boleh tetap punya peran direktur/admin lain; periksa setelah assignment dikecualikan.
      const { data: remainingForUser } = await admin
        .from('user_role_assignments').select('id, role_id').eq('user_id', userId).is('project_id', null).neq('id', assignmentId);
      const remainingRoleIds = (remainingForUser ?? []).map((item: { role_id: string }) => item.role_id);
      const { data: remainingAdminRoles } = remainingRoleIds.length
        ? await admin.from('app_roles').select('code').in('id', remainingRoleIds).in('code', ['director', 'admin'])
        : { data: [] as Array<{ code: string }> };
      if (!adminCheck.allowed && !(targetProfile.is_active && (remainingAdminRoles ?? []).length)) {
        return jsonError('Penugasan ini merupakan satu-satunya akses Direktur/Administrator aktif. Tambahkan administrator lain sebelum menghapusnya.');
      }
    }

    const { error } = await admin.from('user_role_assignments').delete().eq('id', assignmentId);
    if (error) return jsonError(`Peran gagal dihapus: ${error.message}`, 400);
    await writeAudit(admin, actorId, 'user.role.removed', userId, { assignment_id: assignmentId, role_id: assignment.role_id });
    return NextResponse.json({ success: true });
  }

  return jsonError('Aksi pengelolaan pengguna tidak dikenali.');
}
