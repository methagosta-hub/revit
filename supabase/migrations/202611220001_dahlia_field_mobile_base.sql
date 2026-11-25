-- Dahlia Field mobile: additive schema only.
-- This migration is intentionally NOT applied to production by this change.
-- Apply it first to an isolated Supabase staging branch after review.

create schema if not exists dahlia_private;
revoke all on schema dahlia_private from public, anon, authenticated;

create table if not exists dahlia_private.field_user_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  field_role text not null check (field_role in ('internal', 'subcontractor')),
  employee_id uuid null references public.employees(id) on delete restrict,
  subcontractor_id uuid null references public.subcontractors(id) on delete restrict,
  linked_by uuid null references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_user_links_identity_check check (
    (field_role = 'internal' and employee_id is not null and subcontractor_id is null)
    or
    (field_role = 'subcontractor' and employee_id is null and subcontractor_id is not null)
  )
);

create index if not exists field_user_links_employee_idx
  on dahlia_private.field_user_links(employee_id)
  where employee_id is not null;

create index if not exists field_user_links_subcontractor_idx
  on dahlia_private.field_user_links(subcontractor_id)
  where subcontractor_id is not null;

alter table dahlia_private.field_user_links enable row level security;

create table if not exists dahlia_private.field_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  action text not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table dahlia_private.field_operations enable row level security;

create table if not exists public.field_material_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique
    default ('PR-FLD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  project_id uuid not null references public.projects(id) on delete restrict,
  request_date date not null default current_date,
  required_date date not null,
  priority text not null default 'normal'
    check (priority in ('normal', 'urgent')),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected', 'converted', 'cancelled')),
  notes text null,
  rejection_reason text null,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_material_requests_project_date_idx
  on public.field_material_requests(project_id, request_date desc);

create index if not exists field_material_requests_created_by_idx
  on public.field_material_requests(created_by, created_at desc);

create table if not exists public.field_material_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.field_material_requests(id) on delete cascade,
  material_id uuid null references public.master_materials(id) on delete set null,
  item_name text not null check (length(trim(item_name)) > 0),
  unit text not null check (length(trim(unit)) > 0),
  quantity numeric(18, 3) not null check (quantity > 0),
  notes text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists field_material_request_items_request_idx
  on public.field_material_request_items(request_id, sort_order);

alter table public.field_material_requests enable row level security;
alter table public.field_material_request_items enable row level security;

-- All access is through narrowly-scoped RPCs. Do not expose direct table writes.
revoke all on table public.field_material_requests from public, anon, authenticated;
revoke all on table public.field_material_request_items from public, anon, authenticated;
revoke all on table dahlia_private.field_user_links from public, anon, authenticated;
revoke all on table dahlia_private.field_operations from public, anon, authenticated;

create or replace function dahlia_private.field_user_is_internal()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select exists (
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
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select exists (
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

create or replace function dahlia_private.field_user_employee_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select l.employee_id
  from dahlia_private.field_user_links l
  join public.user_profiles up on up.id = l.user_id and up.is_active = true
  join public.employees e on e.id = l.employee_id and e.status = 'active'
  where l.user_id = auth.uid() and l.field_role = 'internal';
$function$;

create or replace function dahlia_private.field_user_subcontractor_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select l.subcontractor_id
  from dahlia_private.field_user_links l
  join public.user_profiles up on up.id = l.user_id and up.is_active = true
  join public.subcontractors s on s.id = l.subcontractor_id and s.status = 'active'
  where l.user_id = auth.uid() and l.field_role = 'subcontractor';
$function$;

create or replace function dahlia_private.field_user_can_access_subcontract_segment(p_segment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select p_segment_id is not null
     and dahlia_private.field_user_is_subcontractor()
     and exists (
       select 1
       from public.execution_segments es
       join public.project_work_packages wp on wp.id = es.package_id
       where es.id = p_segment_id
         and es.executor_type = 'subcontractor'
         and es.subcontractor_id = dahlia_private.field_user_subcontractor_id()
         and public.dahlia_project_category_access(wp.project_id)
     );
$function$;

create or replace function dahlia_private.field_user_can_bill_for_subcontractor(p_subcontractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select p_subcontractor_id is not null
     and p_subcontractor_id = dahlia_private.field_user_subcontractor_id();
$function$;

revoke all on function dahlia_private.field_user_is_internal() from public, anon, authenticated;
revoke all on function dahlia_private.field_user_is_subcontractor() from public, anon, authenticated;
revoke all on function dahlia_private.field_user_employee_id() from public, anon, authenticated;
revoke all on function dahlia_private.field_user_subcontractor_id() from public, anon, authenticated;
revoke all on function dahlia_private.field_user_can_access_subcontract_segment(uuid) from public, anon, authenticated;
revoke all on function dahlia_private.field_user_can_bill_for_subcontractor(uuid) from public, anon, authenticated;

create or replace function public.dahlia_field_link_user(
  p_user_id uuid,
  p_field_role text,
  p_employee_id uuid default null,
  p_subcontractor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.dahlia_has_company_permission('user.manage') then
    raise exception 'Hanya pengguna dengan permission Kelola pengguna yang dapat menautkan akun Dahlia Field.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_field_role not in ('internal', 'subcontractor') then
    raise exception 'Pengguna dan jenis akun lapangan wajib dipilih.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.user_profiles up
    where up.id = p_user_id and up.is_active = true
  ) then
    raise exception 'Profil pengguna tidak ditemukan atau sedang nonaktif.' using errcode = '23503';
  end if;

  if p_field_role = 'internal' then
    if p_employee_id is null or p_subcontractor_id is not null then
      raise exception 'Akun internal harus ditautkan ke satu data karyawan.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.employees e
      where e.id = p_employee_id and e.status = 'active'
    ) then
      raise exception 'Data karyawan tidak ditemukan atau tidak aktif.' using errcode = '23503';
    end if;
  else
    if p_subcontractor_id is null or p_employee_id is not null then
      raise exception 'Akun subkontraktor harus ditautkan ke satu data subkontraktor.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.subcontractors s
      where s.id = p_subcontractor_id and s.status = 'active'
    ) then
      raise exception 'Data subkontraktor tidak ditemukan atau tidak aktif.' using errcode = '23503';
    end if;
  end if;

  insert into dahlia_private.field_user_links (
    user_id, field_role, employee_id, subcontractor_id, linked_by, linked_at, updated_at
  )
  values (
    p_user_id, p_field_role, p_employee_id, p_subcontractor_id, auth.uid(), now(), now()
  )
  on conflict (user_id) do update
    set field_role = excluded.field_role,
        employee_id = excluded.employee_id,
        subcontractor_id = excluded.subcontractor_id,
        linked_by = auth.uid(),
        linked_at = now(),
        updated_at = now();
end;
$function$;

create or replace function public.dahlia_field_unlink_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.dahlia_has_company_permission('user.manage') then
    raise exception 'Hanya pengguna dengan permission Kelola pengguna yang dapat melepas tautan akun Dahlia Field.'
      using errcode = '42501';
  end if;
  delete from dahlia_private.field_user_links where user_id = p_user_id;
end;
$function$;

revoke all on function public.dahlia_field_link_user(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.dahlia_field_unlink_user(uuid) from public, anon;
grant execute on function public.dahlia_field_link_user(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.dahlia_field_unlink_user(uuid) to authenticated;

comment on schema dahlia_private is
  'Private implementation schema for Dahlia Field account links and idempotent offline operation receipts.';
comment on table public.field_material_requests is
  'Field-originated material requisitions. This is a PR request, not an official Purchase Order.';
comment on table public.field_material_request_items is
  'Line items for field material requisitions; Purchasing creates any official PO separately.';
