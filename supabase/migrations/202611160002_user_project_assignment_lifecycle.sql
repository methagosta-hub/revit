-- Dahlia Management System
-- Penugasan role pengguna ke perusahaan/proyek dengan masa berlaku dan pencabutan berjejak.
-- Migration ini additive terhadap data assignment lama; tidak menghapus riwayat.

begin;

do $preflight$
begin
  if to_regclass('public.user_role_assignments') is null
     or to_regclass('public.app_roles') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.app_permissions') is null
     or to_regclass('public.user_profiles') is null then
    raise exception 'Fondasi Company Access belum lengkap. Pastikan migration 202611150001_company_access.sql sudah dijalankan.';
  end if;
  if to_regclass('public.projects') is null then
    raise exception 'Tabel public.projects tidak ditemukan.';
  end if;
  if to_regclass('public.subcontractors') is null
     or to_regclass('public.execution_progress_entries') is null then
    raise exception 'Objek Migration 012 belum lengkap. Jalankan/selesaikan Migration 012 sebelum migration lifecycle assignment ini.';
  end if;
  if to_regclass('public.attendance_records') is null
     or to_regclass('public.attendance_period_controls') is null
     or to_regclass('public.attendance_audit_logs') is null
     or to_regclass('public.employee_daily_assignments') is null
     or to_regclass('public.project_work_assignments') is null then
    raise exception 'Objek absensi/penempatan Migration 008, 009, dan 011 belum lengkap. Pastikan seluruh migration personalia terkait telah dijalankan.';
  end if;
  if to_regprocedure('public.dahlia_has_company_permission(text)') is null
     or to_regprocedure('public.dahlia_has_project_execution_permission(uuid,text)') is null
     or to_regprocedure('public.dahlia_can_read_project_personnel(uuid)') is null
     or to_regprocedure('public.dahlia_can_record_attendance_project(uuid)') is null
     or to_regprocedure('public.dahlia_can_read_attendance_project(uuid)') is null
     or to_regprocedure('public.dahlia_can_access_employee_attendance(uuid,date)') is null
     or to_regprocedure('public.dahlia_can_external_reporting(text)') is null then
    raise exception 'Helper permission modul belum lengkap. Pastikan migration Company Access, Personalia, Pelaksanaan, Absensi, dan Laporan Eksternal sudah dijalankan.';
  end if;
end;
$preflight$;

alter table public.user_role_assignments
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.user_profiles(id) on delete restrict,
  add column if not exists revocation_reason text;

-- Penugasan lama tetap aktif dan tanggal awal mengikuti waktu pemberian aslinya.
update public.user_role_assignments
set valid_from = coalesce(valid_from, (assigned_at at time zone 'Asia/Jakarta')::date, current_date)
where valid_from is null;

alter table public.user_role_assignments
  alter column valid_from set default ((now() at time zone 'Asia/Jakarta')::date),
  alter column valid_from set not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_role_assignments'::regclass
      and conname = 'user_role_assignments_valid_dates_check'
  ) then
    alter table public.user_role_assignments
      add constraint user_role_assignments_valid_dates_check
      check (valid_until is null or valid_until >= valid_from);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_role_assignments'::regclass
      and conname = 'user_role_assignments_revocation_check'
  ) then
    alter table public.user_role_assignments
      add constraint user_role_assignments_revocation_check
      check (
        (revoked_at is null and revoked_by is null and revocation_reason is null)
        or (
          revoked_at is not null
          and revoked_by is not null
          and revocation_reason is not null
          and length(trim(revocation_reason)) > 0
        )
      );
  end if;
end;
$constraints$;

-- Unique hanya untuk assignment yang belum dicabut. Baris yang dicabut tetap menjadi riwayat.
drop index if exists public.user_role_assignments_company_unique;
drop index if exists public.user_role_assignments_project_unique;
create unique index user_role_assignments_company_unique
  on public.user_role_assignments(user_id, role_id)
  where project_id is null and revoked_at is null;
create unique index user_role_assignments_project_unique
  on public.user_role_assignments(user_id, role_id, project_id)
  where project_id is not null and revoked_at is null;

create index if not exists user_role_assignments_effective_idx
  on public.user_role_assignments(user_id, valid_from, valid_until)
  where revoked_at is null;

comment on column public.user_role_assignments.valid_from is 'Tanggal mulai berlakunya role untuk pengguna pada cakupan perusahaan/proyek.';
comment on column public.user_role_assignments.valid_until is 'Tanggal terakhir berlakunya role; NULL berarti tidak memiliki tanggal akhir.';
comment on column public.user_role_assignments.revoked_at is 'Waktu pencabutan akses. Baris assignment disimpan sebagai riwayat, tidak dihapus.';
comment on column public.user_role_assignments.revoked_by is 'Pengguna administrator yang mencabut assignment.';
comment on column public.user_role_assignments.revocation_reason is 'Alasan wajib saat assignment dicabut.';

create or replace function public.dahlia_role_assignment_is_effective(
  p_valid_from date,
  p_valid_until date,
  p_revoked_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_revoked_at is null
     and p_valid_from <= (now() at time zone 'Asia/Jakarta')::date
     and (p_valid_until is null or p_valid_until >= (now() at time zone 'Asia/Jakarta')::date);
$$;
revoke all on function public.dahlia_role_assignment_is_effective(date, date, timestamptz) from public, anon;
grant execute on function public.dahlia_role_assignment_is_effective(date, date, timestamptz) to authenticated;

-- Fungsi pemeriksaan role dasar: assignment harus aktif menurut tanggal dan belum dicabut.
create or replace function public.has_company_role(p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and ura.project_id is null
      and ar.code = any(p_role_codes)
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

create or replace function public.has_project_role(p_project_id uuid, p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_project_id is not null and exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and (ura.project_id is null or ura.project_id = p_project_id)
      and ar.code = any(p_role_codes)
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(up)
      from public.user_profiles up
      where up.id = auth.uid()
    ),
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ar.id,
          'code', ar.code,
          'name', ar.name,
          'scope', ar.scope,
          'project_id', ura.project_id,
          'assignment_id', ura.id,
          'valid_from', ura.valid_from,
          'valid_until', ura.valid_until
        ) order by ar.name, ura.project_id nulls first
      )
      from public.user_role_assignments ura
      join public.app_roles ar on ar.id = ura.role_id
      join public.user_profiles up on up.id = ura.user_id
      where ura.user_id = auth.uid()
        and up.is_active = true
        and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'code', ap.code,
        'project_id', ura.project_id
      ))
      from public.user_role_assignments ura
      join public.app_roles ar on ar.id = ura.role_id
      join public.role_permissions rp on rp.role_id = ar.id
      join public.app_permissions ap on ap.id = rp.permission_id
      join public.user_profiles up on up.id = ura.user_id
      where ura.user_id = auth.uid()
        and up.is_active = true
        and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
    ), '[]'::jsonb)
  );
$$;

-- Company-scoped permissions (HR, Finance, Purchasing, Director, etc.).
create or replace function public.dahlia_has_company_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.role_permissions rp on rp.role_id = ar.id
    join public.app_permissions ap on ap.id = rp.permission_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and ura.project_id is null
      and ap.code = p_permission_code
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

-- Project-scoped permission helper used by execution RLS and RPC.
create or replace function public.dahlia_has_project_execution_permission(
  p_project_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_project_id is not null and p_permission_code is not null and exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.role_permissions rp on rp.role_id = ar.id
    join public.app_permissions ap on ap.id = rp.permission_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and (ura.project_id is null or ura.project_id = p_project_id)
      and up.is_active = true
      and ap.code = p_permission_code
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

-- Project-scoped employee roster access.
create or replace function public.dahlia_can_read_project_personnel(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_project_id is not null and exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.role_permissions rp on rp.role_id = ar.id
    join public.app_permissions ap on ap.id = rp.permission_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and (ura.project_id is null or ura.project_id = p_project_id)
      and ap.code in ('personnel.read', 'personnel.manage')
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

-- Attendance permissions are also restricted by the assignment validity window.
create or replace function public.dahlia_can_record_attendance_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_project_id is not null and exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.role_permissions rp on rp.role_id = ar.id
    join public.app_permissions ap on ap.id = rp.permission_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and (ura.project_id is null or ura.project_id = p_project_id)
      and ap.code in ('attendance.record', 'attendance.manage')
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

create or replace function public.dahlia_can_read_attendance_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_project_id is not null and exists (
    select 1
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    join public.role_permissions rp on rp.role_id = ar.id
    join public.app_permissions ap on ap.id = rp.permission_id
    join public.user_profiles up on up.id = ura.user_id
    where ura.user_id = auth.uid()
      and (ura.project_id is null or ura.project_id = p_project_id)
      and ap.code in ('attendance.read', 'attendance.record', 'attendance.manage')
      and up.is_active = true
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
  );
$$;

-- Exact employee/project/date relationship. This prevents a project recorder from
-- writing or viewing the same employee's attendance under a different project.
create or replace function public.dahlia_employee_assigned_to_project(
  p_employee_id uuid,
  p_project_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_employee_id is not null
     and p_project_id is not null
     and p_date is not null
     and public.dahlia_can_read_attendance_project(p_project_id)
     and (
       exists (
         select 1
         from public.employee_daily_assignments eda
         where eda.employee_id = p_employee_id
           and eda.assignment_type = 'project'
           and eda.project_id = p_project_id
           and eda.assignment_date = p_date
           and eda.status <> 'cancelled'
       )
       or exists (
         select 1
         from public.project_work_assignments pwa
         where pwa.employee_id = p_employee_id
           and pwa.project_id = p_project_id
           and pwa.start_date <= p_date
           and (pwa.end_date is null or pwa.end_date >= p_date)
           and pwa.status in ('active', 'completed')
       )
     );
$$;
revoke all on function public.dahlia_employee_assigned_to_project(uuid, uuid, date) from public, anon;
grant execute on function public.dahlia_employee_assigned_to_project(uuid, uuid, date) to authenticated;

-- Defense-in-depth trigger: RLS remains the first barrier, but this also protects
-- writes made through future RPCs that might run with elevated privileges.
create or replace function public.dahlia_enforce_attendance_project_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.dahlia_has_company_permission('attendance.manage')
     or public.dahlia_has_company_permission('attendance.record') then
    return new;
  end if;

  if not public.dahlia_can_record_attendance_project(new.record_origin_project_id) then
    raise exception 'Akun tidak memiliki hak mencatat absensi pada proyek asal ini.' using errcode = '42501';
  end if;
  if not public.dahlia_employee_assigned_to_project(
    new.employee_id, new.record_origin_project_id, new.attendance_date
  ) then
    raise exception 'Karyawan tidak ditugaskan pada proyek tersebut pada tanggal absensi.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.dahlia_enforce_attendance_project_scope() from public, anon;
drop trigger if exists attendance_records_project_scope_guard on public.attendance_records;
create trigger attendance_records_project_scope_guard
before insert or update on public.attendance_records
for each row execute function public.dahlia_enforce_attendance_project_scope();


-- Project-scoped attendance must work without requiring a company-global permission.
-- Company HR can still read/manage globally; project users are restricted to assigned projects.
drop policy if exists attendance_records_read_011 on public.attendance_records;
create policy attendance_records_read_011
on public.attendance_records for select to authenticated
using (
  public.dahlia_has_company_permission('attendance.manage')
  or public.dahlia_has_company_permission('attendance.read')
  or (
    record_origin_project_id is not null
    and public.dahlia_can_read_attendance_project(record_origin_project_id)
    and public.dahlia_employee_assigned_to_project(employee_id, record_origin_project_id, attendance_date)
  )
  or (public.dahlia_has_company_permission('attendance.record') and created_by = auth.uid())
);

drop policy if exists attendance_records_insert_011 on public.attendance_records;
create policy attendance_records_insert_011
on public.attendance_records for insert to authenticated
with check (
  public.dahlia_has_company_permission('attendance.manage')
  or (
    approval_status in ('draft', 'submitted')
    and (
      public.dahlia_has_company_permission('attendance.record')
      or (
        public.dahlia_can_record_attendance_project(record_origin_project_id)
        and public.dahlia_employee_assigned_to_project(employee_id, record_origin_project_id, attendance_date)
      )
    )
  )
);

drop policy if exists attendance_records_update_011 on public.attendance_records;
create policy attendance_records_update_011
on public.attendance_records for update to authenticated
using (
  public.dahlia_has_company_permission('attendance.manage')
  or (
    attendance_date = current_date
    and approval_status in ('draft', 'submitted', 'rejected')
    and (
      public.dahlia_has_company_permission('attendance.record')
      or (
        public.dahlia_can_record_attendance_project(record_origin_project_id)
        and public.dahlia_employee_assigned_to_project(employee_id, record_origin_project_id, attendance_date)
      )
    )
  )
  or (
    public.dahlia_has_company_permission('attendance.record')
    and created_by = auth.uid()
    and attendance_date = current_date
    and approval_status in ('draft', 'submitted', 'rejected')
  )
)
with check (
  public.dahlia_has_company_permission('attendance.manage')
  or (
    attendance_date = current_date
    and approval_status in ('draft', 'submitted', 'rejected')
    and (
      public.dahlia_has_company_permission('attendance.record')
      or (
        public.dahlia_can_record_attendance_project(record_origin_project_id)
        and public.dahlia_employee_assigned_to_project(employee_id, record_origin_project_id, attendance_date)
      )
    )
  )
  or (
    public.dahlia_has_company_permission('attendance.record')
    and created_by = auth.uid()
    and attendance_date = current_date
    and approval_status in ('draft', 'submitted', 'rejected')
  )
);

-- External reports are company scoped; both built-in and custom grants honor the same dates.
create or replace function public.dahlia_can_external_reporting(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.has_company_role(array['director','admin']::text[])
    or exists (
      select 1
      from public.user_role_assignments ura
      join public.app_roles ar on ar.id = ura.role_id
      join public.role_permissions rp on rp.role_id = ar.id
      join public.app_permissions ap on ap.id = rp.permission_id
      join public.user_profiles up on up.id = ura.user_id
      where ura.user_id = auth.uid()
        and ura.project_id is null
        and up.is_active = true
        and ap.code = p_permission
        and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
    )
  );
$$;

-- Two policies in Migration 012 contain inline assignment checks rather than the shared helper.
-- Re-create them so they honor the same effective-date and revocation rules.
drop policy if exists subcontractors_read_012 on public.subcontractors;
create policy subcontractors_read_012 on public.subcontractors for select to authenticated
using (exists (
  select 1 from public.user_role_assignments ura
  join public.app_roles ar on ar.id = ura.role_id
  join public.role_permissions rp on rp.role_id = ar.id
  join public.app_permissions ap on ap.id = rp.permission_id
  join public.user_profiles up on up.id = ura.user_id
  where ura.user_id = auth.uid()
    and up.is_active = true
    and ap.code in ('project.read', 'project.manage', 'execution.read', 'execution.progress.review')
    and (ura.project_id is null or public.dahlia_can_access_project_execution(ura.project_id, false))
    and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at)
));

drop policy if exists execution_progress_entries_insert_012 on public.execution_progress_entries;
create policy execution_progress_entries_insert_012 on public.execution_progress_entries for insert to authenticated
with check (
  exists (
    select 1
    from public.execution_segment_items si
    join public.execution_segments s on s.id = si.segment_id
    join public.project_work_packages p on p.id = s.package_id
    where si.id = segment_item_id
      and (
        public.dahlia_can_access_project_execution(p.project_id, true)
        or public.dahlia_has_project_execution_permission(p.project_id, 'execution.report.create')
      )
  )
);

-- Restore the intended grants after replacing the security-definer helper definitions.
revoke all on function public.has_company_role(text[]) from public;
revoke all on function public.has_project_role(uuid, text[]) from public;
revoke all on function public.get_my_access() from public;
revoke all on function public.dahlia_has_company_permission(text) from public;
revoke all on function public.dahlia_has_project_execution_permission(uuid, text) from public;
revoke all on function public.dahlia_can_read_project_personnel(uuid) from public;
revoke all on function public.dahlia_can_record_attendance_project(uuid) from public;
revoke all on function public.dahlia_can_read_attendance_project(uuid) from public;
revoke all on function public.dahlia_can_external_reporting(text) from public;
grant execute on function public.has_company_role(text[]) to authenticated;
grant execute on function public.has_project_role(uuid, text[]) to authenticated;
grant execute on function public.get_my_access() to authenticated;
grant execute on function public.dahlia_has_company_permission(text) to authenticated;
grant execute on function public.dahlia_has_project_execution_permission(uuid, text) to authenticated;
grant execute on function public.dahlia_can_read_project_personnel(uuid) to authenticated;
grant execute on function public.dahlia_can_record_attendance_project(uuid) to authenticated;
grant execute on function public.dahlia_can_read_attendance_project(uuid) to authenticated;
grant execute on function public.dahlia_can_external_reporting(text) to authenticated;
grant execute on function public.dahlia_employee_assigned_to_project(uuid, uuid, date) to authenticated;

commit;