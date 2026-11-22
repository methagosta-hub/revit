-- Dahlia Field: read-only monitoring mode for company Director accounts.
-- Additive migration. Apply to staging for verification before any production rollout.

create or replace function dahlia_private.field_user_is_director()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
  select auth.uid() is not null
     and public.dahlia_has_company_permission('project.read')
     and exists (
       select 1
       from public.user_role_assignments ura
       join public.app_roles ar on ar.id = ura.role_id
       join public.user_profiles up on up.id = ura.user_id
       where ura.user_id = auth.uid()
         and ura.project_id is null
         and ar.code = 'director'
         and up.is_active = true
         and public.dahlia_role_assignment_is_effective(
           ura.valid_from, ura.valid_until, ura.revoked_at
         )
     );
$function$;

revoke all on function dahlia_private.field_user_is_director()
  from public, anon, authenticated;


-- An account carrying the Director company role is read-only in Dahlia Field,
-- even if an older employee/subcontractor link remains attached to that user.
create or replace function dahlia_private.field_user_is_internal()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
  select not dahlia_private.field_user_is_director()
     and exists (
       select 1
       from dahlia_private.field_user_links l
       join public.user_profiles up on up.id = l.user_id
       join public.employees e on e.id = l.employee_id and e.status = 'active'
       where l.user_id = auth.uid()
         and l.field_role = 'internal'
         and up.is_active = true
     );
$function$;

create or replace function dahlia_private.field_user_is_subcontractor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
  select not dahlia_private.field_user_is_director()
     and exists (
       select 1
       from dahlia_private.field_user_links l
       join public.user_profiles up on up.id = l.user_id
       join public.subcontractors s on s.id = l.subcontractor_id
       where l.user_id = auth.uid()
         and l.field_role = 'subcontractor'
         and up.is_active = true
         and s.status = 'active'
     );
$function$;

revoke all on function dahlia_private.field_user_is_internal()
  from public, anon, authenticated;
revoke all on function dahlia_private.field_user_is_subcontractor()
  from public, anon, authenticated;

create or replace function public.dahlia_field_get_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_profile public.user_profiles;
  v_link dahlia_private.field_user_links;
  v_roles jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;

  select * into v_profile
  from public.user_profiles up
  where up.id = auth.uid() and up.is_active = true;

  if v_profile.id is null then
    raise exception 'Profil pengguna tidak aktif atau tidak ditemukan.' using errcode = '42501';
  end if;

  if dahlia_private.field_user_is_director() then
    select coalesce(jsonb_agg(distinct ar.code order by ar.code), '[]'::jsonb)
      into v_roles
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    where ura.user_id = auth.uid()
      and ura.project_id is null
      and public.dahlia_role_assignment_is_effective(
        ura.valid_from, ura.valid_until, ura.revoked_at
      );

    return jsonb_build_object(
      'user_id', auth.uid(),
      'full_name', v_profile.full_name,
      'field_role', 'director',
      'employee_id', null,
      'subcontractor_id', null,
      'role_codes', v_roles
    );
  end if;

  select * into v_link
  from dahlia_private.field_user_links l
  where l.user_id = auth.uid();

  if v_link.user_id is null then
    raise exception 'Akun belum ditautkan ke data karyawan atau subkontraktor. Hubungi Administrator Dahlia.'
      using errcode = '42501';
  end if;

  if v_link.field_role = 'internal' then
    select coalesce(jsonb_agg(distinct ar.code order by ar.code), '[]'::jsonb)
      into v_roles
    from public.user_role_assignments ura
    join public.app_roles ar on ar.id = ura.role_id
    where ura.user_id = auth.uid()
      and public.dahlia_role_assignment_is_effective(ura.valid_from, ura.valid_until, ura.revoked_at);
  end if;

  return jsonb_build_object(
    'user_id', auth.uid(),
    'full_name', v_profile.full_name,
    'field_role', v_link.field_role,
    'employee_id', v_link.employee_id,
    'subcontractor_id', v_link.subcontractor_id,
    'role_codes', v_roles
  );
end;
$function$;

revoke all on function public.dahlia_field_get_context() from public, anon;
grant execute on function public.dahlia_field_get_context() to authenticated;

create or replace function public.dahlia_field_list_projects()
returns table (
  project_id uuid,
  title text,
  client text,
  location text,
  access_scope text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;

  if dahlia_private.field_user_is_director() then
    return query
      select p.id, p.title::text, p.client::text, p.location::text, 'director'::text
      from public.projects p
      order by p.title;
    return;
  end if;

  if dahlia_private.field_user_is_internal() then
    return query
      select distinct p.id, p.title::text, p.client::text, p.location::text, 'internal'::text
      from public.projects p
      where public.dahlia_has_project_execution_permission(p.id, 'project.read')
         or public.dahlia_has_project_execution_permission(p.id, 'attendance.record')
         or public.dahlia_has_project_execution_permission(p.id, 'execution.report.create')
         or public.dahlia_has_project_execution_permission(p.id, 'procurement.request.create')
      order by 2;
    return;
  end if;

  if dahlia_private.field_user_is_subcontractor() then
    return query
      select distinct p.id, p.title::text, p.client::text, p.location::text, 'subcontractor'::text
      from public.execution_contract_register cr
      join public.execution_segments es on es.id = cr.segment_id
      join public.projects p on p.id = cr.project_id
      where cr.subcontractor_id = dahlia_private.field_user_subcontractor_id()
        and cr.contract_status in ('active', 'closed')
        and es.executor_type = 'subcontractor'
        and es.status in ('active', 'closed')
        and public.dahlia_project_category_access(p.id)
      order by 2;
    return;
  end if;

  raise exception 'Akun belum memiliki tautan Dahlia Field yang aktif.' using errcode = '42501';
end;
$function$;

revoke all on function public.dahlia_field_list_projects() from public, anon;
grant execute on function public.dahlia_field_list_projects() to authenticated;

create or replace function public.dahlia_field_list_director_projects()
returns table (
  project_id uuid,
  title text,
  client text,
  location text,
  project_status text,
  daily_report_count bigint,
  submitted_report_count bigint,
  last_report_date date,
  last_work_summary text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_director() then
    raise exception 'Pemantauan seluruh proyek hanya tersedia untuk akun Director.' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.title::text,
      p.client::text,
      p.location::text,
      p.status::text,
      count(r.id)::bigint,
      count(r.id) filter (where r.status <> 'draft')::bigint,
      max(r.report_date),
      (
        select nullif(trim(latest.work_summary), '')
        from public.project_daily_reports latest
        where latest.project_id = p.id
        order by latest.report_date desc, latest.created_at desc
        limit 1
      )::text
    from public.projects p
    left join public.project_daily_reports r on r.project_id = p.id
    group by p.id, p.title, p.client, p.location, p.status
    order by p.title;
end;
$function$;

revoke all on function public.dahlia_field_list_director_projects() from public, anon;
grant execute on function public.dahlia_field_list_director_projects() to authenticated;

create or replace function public.dahlia_field_list_director_daily_reports(p_project_id uuid)
returns table (
  report_id uuid,
  report_number text,
  report_date date,
  status text,
  weather text,
  work_summary text,
  obstacles text,
  follow_up text,
  field_condition text,
  start_time text,
  end_time text,
  submitted_at timestamptz,
  foreman_name text,
  labor_count bigint,
  material_count bigint,
  equipment_count bigint,
  work_item_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_director() then
    raise exception 'Riwayat laporan proyek hanya tersedia untuk akun Director.' using errcode = '42501';
  end if;

  if p_project_id is null or not exists (
    select 1 from public.projects p where p.id = p_project_id
  ) then
    raise exception 'Proyek tidak ditemukan.' using errcode = '22023';
  end if;

  return query
    select
      r.id,
      r.report_number::text,
      r.report_date,
      r.status::text,
      r.weather::text,
      r.work_summary,
      r.obstacles,
      r.follow_up,
      r.field_condition,
      r.start_time::text,
      r.end_time::text,
      r.submitted_at,
      up.full_name::text,
      (select count(*) from public.project_daily_report_labor l where l.report_id = r.id)::bigint,
      (select count(*) from public.project_daily_report_materials m where m.report_id = r.id)::bigint,
      (select count(*) from public.project_daily_report_equipment e where e.report_id = r.id)::bigint,
      (select count(*) from public.project_daily_report_work_items w where w.report_id = r.id)::bigint
    from public.project_daily_reports r
    left join public.user_profiles up on up.id = r.foreman_user_id
    where r.project_id = p_project_id
    order by r.report_date desc, r.created_at desc
    limit 100;
end;
$function$;

revoke all on function public.dahlia_field_list_director_daily_reports(uuid) from public, anon;
grant execute on function public.dahlia_field_list_director_daily_reports(uuid) to authenticated;

comment on function public.dahlia_field_list_director_projects() is
  'Read-only project overview for active company Director users.';
comment on function public.dahlia_field_list_director_daily_reports(uuid) is
  'Read-only daily-report history for one project, restricted to active company Director users.';
