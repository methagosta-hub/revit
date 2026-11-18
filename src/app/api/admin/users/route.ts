import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RoleScope = 'company' | 'project' | 'both';
type RoleRow = { id: string; code: string; name: string; scope: RoleScope };
type AssignmentInput = {
  role_id: string;
  project_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
};
type NormalizedAssignment = {
  role_id: string;
  project_id: string | null;
  valid_from: string;
  valid_until: string | null;
};
type AdminContext = { actorId: string; admin: SupabaseClient };
type RevokeResult = { ok: true } | { ok: false; message: string; status: number };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isResponse(value: AdminContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isEffective(validFrom: string, validUntil: string | null, revokedAt: string | null): boolean {
  const today = jakartaToday();
  return !revokedAt && validFrom <= today && (!validUntil || validUntil >= today);
}

async function getAdminContext(request: NextRequest): Promise<AdminContext | NextResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return jsonError('Sesi login diperlukan.', 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return jsonError('Konfigurasi server Supabase belum lengkap. Pastikan URL, anon key, dan SUPABASE_SECRET_KEY tersedia di environment server.', 500);
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

  // Server secret hanya dipakai setelah token dan kewenangan pemanggil tervalidasi.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { actorId: userData.user.id, admin };
}

async function validateAssignments(
  admin: SupabaseClient,
  input: unknown,
  isDemoUser = false,
): Promise<{ rows: NormalizedAssignment[]; error?: string }> {
  if (!Array.isArray(input) || input.length === 0) {
    return { rows: [], error: 'Pilih minimal satu penugasan role untuk pengguna.' };
  }
  if (input.length > 50) return { rows: [], error: 'Maksimal 50 penugasan dalam satu proses.' };

  const requested = input as AssignmentInput[];
  const roleIds = [...new Set(requested.map((item) => String(item?.role_id ?? '').trim()).filter(Boolean))];
  if (!roleIds.length) return { rows: [], error: 'Peran pengguna tidak valid.' };

  const { data: roles, error: roleError } = await admin
    .from('app_roles').select('id, code, name, scope').in('id', roleIds);
  if (roleError) return { rows: [], error: `Gagal membaca daftar peran: ${roleError.message}` };
  const byId = new Map<string, RoleRow>((roles ?? []).map((role: RoleRow) => [role.id, role]));
  if (byId.size !== roleIds.length) return { rows: [], error: 'Salah satu peran tidak ditemukan.' };

  const projectIds = [...new Set(requested
    .map((item) => item?.project_id)
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map((id) => id.trim()))];
  if (projectIds.length) {
    const { data: projects, error: projectError } = await admin
      .from('projects').select('id, project_category').in('id', projectIds);
    if (projectError) return { rows: [], error: `Gagal memeriksa proyek: ${projectError.message}` };
    if ((projects ?? []).length !== projectIds.length) return { rows: [], error: 'Salah satu proyek tidak ditemukan.' };
    const expectedCategory = isDemoUser ? 'PORTOFOLIO' : 'REGULER';
    const wrongCategory = (projects ?? []).find((project: { id: string; project_category: string | null }) => project.project_category !== expectedCategory);
    if (wrongCategory) return { rows: [], error: isDemoUser
      ? 'Akun PORTOFOLIO hanya boleh ditugaskan ke proyek kategori PORTOFOLIO.'
      : 'Akun reguler tidak boleh ditugaskan ke proyek PORTOFOLIO.' };
  }
  if (isDemoUser && requested.some((item) => !item.project_id)) {
    return { rows: [], error: 'Akun PORTOFOLIO wajib menggunakan role proyek, bukan role global perusahaan.' };
  }

  const today = jakartaToday();
  const normalized: NormalizedAssignment[] = [];
  const seen = new Set<string>();
  for (const item of requested) {
    const roleId = String(item?.role_id ?? '').trim();
    const role = byId.get(roleId);
    if (!role) return { rows: [], error: 'Peran tidak valid.' };

    const projectId = typeof item.project_id === 'string' && item.project_id.trim()
      ? item.project_id.trim() : null;
    const validFrom = item.valid_from == null || item.valid_from === '' ? today : item.valid_from;
    const validUntil = item.valid_until == null || item.valid_until === '' ? null : item.valid_until;

    if (isDemoUser && role.scope === 'company') {
      return { rows: [], error: `Role ${role.name} berlaku global dan tidak diperbolehkan untuk akun PORTOFOLIO.` };
    }
    if (role.scope === 'company' && projectId) {
      return { rows: [], error: `Peran ${role.name} hanya berlaku di tingkat perusahaan.` };
    }
    if (role.scope === 'project' && !projectId) {
      return { rows: [], error: `Peran ${role.name} wajib ditugaskan pada proyek tertentu.` };
    }
    if (!isIsoDate(validFrom)) return { rows: [], error: `Tanggal mulai untuk ${role.name} tidak valid.` };
    if (validUntil !== null && !isIsoDate(validUntil)) {
      return { rows: [], error: `Tanggal berakhir untuk ${role.name} tidak valid.` };
    }
    if (validUntil && validUntil < validFrom) {
      return { rows: [], error: `Tanggal berakhir untuk ${role.name} tidak boleh sebelum tanggal mulai.` };
    }
    if (['director', 'admin'].includes(role.code)) {
      if (projectId || validUntil || validFrom > today) {
        return { rows: [], error: 'Role Direktur/Administrator harus berupa penugasan perusahaan yang berlaku segera dan tanpa tanggal berakhir.' };
      }
    }

    const key = `${roleId}:${projectId ?? 'COMPANY'}`;
    if (seen.has(key)) return { rows: [], error: `Penugasan ${role.name} pada cakupan yang sama tercantum lebih dari sekali.` };
    seen.add(key);
    normalized.push({ role_id: roleId, project_id: projectId, valid_from: validFrom, valid_until: validUntil });
  }
  return { rows: normalized };
}

async function writeAudit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  recordId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  tableName = 'user_role_assignments',
) {
  const { error } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    old_data: oldData,
    new_data: newData,
    metadata: { source: 'user_project_assignment_center' },
  });
  if (error) console.warn('Audit penugasan pengguna tidak tersimpan:', error.message);
}

async function hasOtherActiveCompanyAdmin(
  admin: SupabaseClient,
  excludedAssignmentId?: string,
  excludedUserId?: string,
): Promise<{ allowed: boolean; error?: string }> {
  const { data: roles, error: rolesError } = await admin
    .from('app_roles').select('id').in('code', ['director', 'admin']);
  if (rolesError) return { allowed: false, error: rolesError.message };
  const roleIds = (roles ?? []).map((row: { id: string }) => row.id);
  if (!roleIds.length) return { allowed: false, error: 'Role Direktur/Administrator tidak ditemukan.' };

  const { data: assignments, error: assignmentsError } = await admin
    .from('user_role_assignments')
    .select('id, user_id, valid_from, valid_until, revoked_at')
    .in('role_id', roleIds)
    .is('project_id', null)
    .is('revoked_at', null);
  if (assignmentsError) return { allowed: false, error: assignmentsError.message };

  const today = jakartaToday();
  const userIds = [...new Set((assignments ?? [])
    .filter((row) => row.id !== excludedAssignmentId && row.valid_from <= today && (!row.valid_until || row.valid_until >= today))
    .map((row) => row.user_id)
    .filter((id) => !excludedUserId || id !== excludedUserId))];
  if (!userIds.length) return { allowed: false };
  const { data: profiles, error: profilesError } = await admin
    .from('user_profiles').select('id').in('id', userIds).eq('is_active', true);
  if (profilesError) return { allowed: false, error: profilesError.message };
  return { allowed: (profiles ?? []).length > 0 };
}

async function getAssignment(admin: SupabaseClient, assignmentId: string, userId?: string) {
  let query = admin.from('user_role_assignments')
    .select('id, user_id, role_id, project_id, assigned_by, assigned_at, valid_from, valid_until, revoked_at, revoked_by, revocation_reason');
  query = query.eq('id', assignmentId);
  if (userId) query = query.eq('user_id', userId);
  return query.maybeSingle();
}

async function revokeAssignment(
  admin: SupabaseClient,
  actorId: string,
  userId: string,
  assignmentId: string,
  reason: string,
): Promise<RevokeResult> {
  const { data: assignment, error: readError } = await getAssignment(admin, assignmentId, userId);
  if (readError || !assignment) return { ok: false, message: 'Penugasan tidak ditemukan.', status: 404 };
  if (assignment.revoked_at) return { ok: false, message: 'Penugasan ini sudah pernah dicabut.', status: 409 };

  const { data: role, error: roleError } = await admin.from('app_roles')
    .select('id, code, name').eq('id', assignment.role_id).maybeSingle();
  if (roleError || !role) return { ok: false, message: 'Role penugasan tidak ditemukan.', status: 404 };

  if (['director', 'admin'].includes(role.code) && assignment.project_id === null
    && isEffective(assignment.valid_from, assignment.valid_until, assignment.revoked_at)) {
    if (userId === actorId) return { ok: false, message: 'Anda tidak dapat mencabut akses Direktur/Administrator milik akun sendiri.', status: 400 };
    const adminCheck = await hasOtherActiveCompanyAdmin(admin, assignmentId);
    if (adminCheck.error) return { ok: false, message: `Gagal memeriksa administrator lain: ${adminCheck.error}`, status: 500 };
    if (!adminCheck.allowed) {
      return { ok: false, message: 'Penugasan ini merupakan akses Direktur/Administrator aktif terakhir. Tambahkan administrator aktif lain sebelum mencabutnya.', status: 409 };
    }
  }

  const revokedAt = new Date().toISOString();
  const update = { revoked_at: revokedAt, revoked_by: actorId, revocation_reason: reason.trim() };
  const { data: revokedRow, error } = await admin.from('user_role_assignments')
    .update(update).eq('id', assignmentId).is('revoked_at', null).select('id').maybeSingle();
  if (error) return { ok: false, message: `Penugasan gagal dicabut: ${error.message}`, status: 400 };
  if (!revokedRow) return { ok: false, message: 'Penugasan sudah berubah atau dicabut oleh proses lain. Muat ulang halaman.', status: 409 };

  await writeAudit(admin, actorId, 'user.assignment.revoked', assignmentId, assignment, { ...assignment, ...update });
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext(request);
  if (isResponse(context)) return context;
  const { admin } = context;

  const [profilesResult, assignmentsResult, rolesResult, projectsResult, authUsersResult] = await Promise.all([
    admin.from('user_profiles')
      .select('id, employee_code, full_name, phone, avatar_url, is_active, is_demo_user, created_at, updated_at')
      .order('full_name'),
    admin.from('user_role_assignments')
      .select('id, user_id, role_id, project_id, assigned_by, assigned_at, valid_from, valid_until, revoked_at, revoked_by, revocation_reason')
      .order('assigned_at', { ascending: false }),
    admin.from('app_roles').select('id, code, name, scope, description').order('name'),
    admin.from('projects').select('id, title, status, project_category').order('title'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const failed = [profilesResult.error, assignmentsResult.error, rolesResult.error, projectsResult.error, authUsersResult.error].find(Boolean);
  if (failed) return jsonError(`Gagal memuat direktori pengguna: ${failed.message}`, 500);

  const roles = (rolesResult.data ?? []) as RoleRow[];
  const roleMap = new Map<string, RoleRow & { description?: string | null }>(roles.map((role) => [role.id, role] as const));
  const projectMap = new Map<string, string>((projectsResult.data ?? []).map((project: { id: string; title: string }) => [project.id, project.title]));
  const profileNameMap = new Map<string, string>((profilesResult.data ?? []).map((profile: { id: string; full_name: string }) => [profile.id, profile.full_name]));
  const emailMap = new Map<string, string>((authUsersResult.data.users ?? []).map((user) => [user.id, user.email ?? '']));
  const users = (profilesResult.data ?? []).map((profile) => ({
    ...profile,
    email: emailMap.get(profile.id) ?? '',
    assignments: (assignmentsResult.data ?? [])
      .filter((assignment) => assignment.user_id === profile.id)
      .map((assignment) => ({
        ...assignment,
        role: roleMap.get(assignment.role_id) ?? null,
        project_title: assignment.project_id ? projectMap.get(assignment.project_id) ?? 'Proyek tidak ditemukan' : null,
        assigned_by_name: assignment.assigned_by ? profileNameMap.get(assignment.assigned_by) ?? null : null,
        revoked_by_name: assignment.revoked_by ? profileNameMap.get(assignment.revoked_by) ?? null : null,
      })),
  }));
  return NextResponse.json({ users, roles, projects: projectsResult.data ?? [], server_date: jakartaToday() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Format email tidak valid.');
  if (password.length < 8) return jsonError('Kata sandi sementara minimal 8 karakter.');

  const isDemoUser = body.is_demo_user === true;
  const validated = await validateAssignments(admin, body.role_assignments, isDemoUser);
  if (validated.error) return jsonError(validated.error);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName, phone },
  });
  if (createError || !created.user) return jsonError(createError?.message ?? 'Akun Auth gagal dibuat.', 400);

  const newUserId = created.user.id;
  const { error: profileError } = await admin.from('user_profiles').upsert({
    id: newUserId, full_name: fullName, phone, employee_code: employeeCode, is_active: true,
    is_demo_user: isDemoUser,
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

  await writeAudit(admin, actorId, 'user.created', newUserId, null, {
    full_name: fullName, email, employee_code: employeeCode, is_demo_user: body.is_demo_user === true, role_assignments: validated.rows,
  }, 'user_profiles');
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

  const { data: targetProfile, error: targetError } = await admin.from('user_profiles')
    .select('id, is_active, is_demo_user').eq('id', userId).maybeSingle();
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
    if (typeof body.is_demo_user === 'boolean' && body.is_demo_user !== targetProfile.is_demo_user) {
      const { count, error: assignmentsError } = await admin.from('user_role_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('revoked_at', null);
      if (assignmentsError) return jsonError(`Gagal memeriksa penugasan akun: ${assignmentsError.message}`, 500);
      if ((count ?? 0) > 0) {
        return jsonError('Cabut seluruh penugasan role yang masih aktif terlebih dahulu. Setelah mode akun diubah, tambahkan kembali role dengan cakupan kategori proyek yang sesuai.');
      }
      update.is_demo_user = body.is_demo_user;
    }
    if (typeof body.is_active === 'boolean') {
      if (userId === actorId && body.is_active === false) return jsonError('Anda tidak dapat menonaktifkan akun sendiri.');
      if (body.is_active === false && targetProfile.is_active) {
        const adminCheck = await hasOtherActiveCompanyAdmin(admin, undefined, userId);
        if (adminCheck.error) return jsonError(`Gagal memeriksa administrator lain: ${adminCheck.error}`, 500);
        if (!adminCheck.allowed) return jsonError('Akun ini adalah satu-satunya Direktur/Administrator aktif. Tambahkan administrator lain sebelum menonaktifkannya.');
      }
      update.is_active = body.is_active;
    }
    if (!Object.keys(update).length) return jsonError('Tidak ada perubahan profil yang dikirim.');
    const { error } = await admin.from('user_profiles').update(update).eq('id', userId);
    if (error) return jsonError(`Profil gagal diperbarui: ${error.message}`, 400);
    await writeAudit(admin, actorId, 'user.profile.updated', userId, {
      id: userId, previous_is_active: targetProfile.is_active,
    }, update, 'user_profiles');
    return NextResponse.json({ success: true });
  }

  if (action === 'add_role') {
    const validated = await validateAssignments(admin, [{
      role_id: body.role_id as string,
      project_id: (body.project_id as string | null) ?? null,
      valid_from: body.valid_from as string | null | undefined,
      valid_until: body.valid_until as string | null | undefined,
    }], targetProfile.is_demo_user === true);
    if (validated.error) return jsonError(validated.error);
    const { data: inserted, error } = await admin.from('user_role_assignments').insert({
      user_id: userId, ...validated.rows[0], assigned_by: actorId,
    }).select('id').single();
    if (error || !inserted) return jsonError(`Peran gagal ditambahkan: ${error?.message ?? 'Penugasan tidak diterima.'}`, 400);
    await writeAudit(admin, actorId, 'user.assignment.created', inserted.id, null, {
      user_id: userId, ...validated.rows[0], assigned_by: actorId,
    });
    return NextResponse.json({ success: true, assignment_id: inserted.id });
  }

  if (action === 'update_assignment') {
    const assignmentId = String(body.assignment_id ?? '').trim();
    if (!assignmentId) return jsonError('ID penugasan wajib diisi.');
    const { data: assignment, error: readError } = await getAssignment(admin, assignmentId, userId);
    if (readError || !assignment) return jsonError('Penugasan tidak ditemukan.', 404);
    if (assignment.revoked_at) return jsonError('Penugasan yang sudah dicabut tidak dapat diubah.', 409);

    const validFrom = body.valid_from === undefined ? assignment.valid_from : body.valid_from;
    const validUntil = body.valid_until === undefined ? assignment.valid_until : (body.valid_until || null);
    if (!isIsoDate(validFrom)) return jsonError('Tanggal mulai tidak valid.');
    if (validUntil !== null && !isIsoDate(validUntil)) return jsonError('Tanggal berakhir tidak valid.');
    if (validUntil && validUntil < validFrom) return jsonError('Tanggal berakhir tidak boleh sebelum tanggal mulai.');

    const { data: role, error: roleError } = await admin.from('app_roles')
      .select('code').eq('id', assignment.role_id).maybeSingle();
    if (roleError || !role) return jsonError('Role penugasan tidak ditemukan.', 404);
    if (['director', 'admin'].includes(role.code) && (assignment.project_id !== null || validUntil !== null || validFrom > jakartaToday())) {
      return jsonError('Masa berlaku role Direktur/Administrator harus tetap aktif segera dan tanpa tanggal berakhir.');
    }

    const next = { valid_from: validFrom, valid_until: validUntil };
    const { data: updatedRow, error } = await admin.from('user_role_assignments').update(next)
      .eq('id', assignmentId).eq('user_id', userId).is('revoked_at', null).select('id').maybeSingle();
    if (error) return jsonError(`Masa berlaku gagal diperbarui: ${error.message}`, 400);
    if (!updatedRow) return jsonError('Penugasan sudah berubah atau dicabut oleh proses lain. Muat ulang halaman.', 409);
    await writeAudit(admin, actorId, 'user.assignment.dates_updated', assignmentId, assignment, { ...assignment, ...next });
    return NextResponse.json({ success: true });
  }

  if (action === 'revoke_role' || action === 'remove_role') {
    const assignmentId = String(body.assignment_id ?? '').trim();
    if (!assignmentId) return jsonError('ID penugasan role wajib diisi.');
    const reason = String(body.reason ?? (action === 'remove_role' ? 'Dicabut melalui pengelolaan pengguna.' : '')).trim();
    if (!reason) return jsonError('Alasan pencabutan wajib diisi.');
    if (reason.length > 500) return jsonError('Alasan pencabutan maksimal 500 karakter.');
    const result = await revokeAssignment(admin, actorId, userId, assignmentId, reason);
    if (!result.ok) return jsonError(result.message, result.status);
    return NextResponse.json({ success: true });
  }

  return jsonError('Aksi pengelolaan pengguna tidak dikenali.');
}