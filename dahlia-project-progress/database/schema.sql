-- Dahlia Project Progress - initial schema
-- Jalankan hanya pada Supabase project yang khusus untuk aplikasi Kurva S.
-- Semua tabel memakai RLS dan kebijakan kepemilikan berbasis auth.uid().

begin;

create table if not exists public.progress_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  client_name text not null default '',
  location text not null default '',
  contract_number text not null default '',
  start_date date not null,
  end_date date not null,
  current_boq_version integer not null default 1 check (current_boq_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_project_date_check check (end_date >= start_date)
);

create index if not exists progress_projects_owner_updated_idx
  on public.progress_projects(owner_id, updated_at desc);

create table if not exists public.progress_boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.progress_projects(id) on delete cascade,
  boq_version integer not null default 1 check (boq_version >= 1),
  item_code text not null,
  work_group text not null default 'Umum',
  description text not null check (length(trim(description)) > 0),
  unit text not null default 'ls',
  quantity numeric(16,4) not null default 1 check (quantity >= 0),
  unit_price numeric(16,2) not null default 0 check (unit_price >= 0),
  planned_start_date date,
  planned_end_date date,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_boq_item_date_check
    check (planned_start_date is null or planned_end_date is null or planned_end_date >= planned_start_date),
  constraint progress_boq_item_code_unique unique(project_id, boq_version, item_code)
);

create index if not exists progress_boq_items_project_version_idx
  on public.progress_boq_items(project_id, boq_version, sort_order);

create table if not exists public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.progress_projects(id) on delete cascade,
  boq_version integer not null check (boq_version >= 1),
  report_date date not null,
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft','approved')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_report_per_day_unique unique(project_id, boq_version, report_date)
);

create index if not exists progress_reports_project_date_idx
  on public.progress_reports(project_id, boq_version, report_date);

create table if not exists public.progress_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.progress_reports(id) on delete cascade,
  boq_item_id uuid not null references public.progress_boq_items(id) on delete restrict,
  cumulative_percent numeric(7,3) not null check (cumulative_percent >= 0 and cumulative_percent <= 100),
  boq_amount_snapshot numeric(16,2) not null check (boq_amount_snapshot >= 0),
  weight_snapshot numeric(12,8) not null check (weight_snapshot >= 0 and weight_snapshot <= 100),
  weighted_progress_snapshot numeric(12,8) not null check (weighted_progress_snapshot >= 0 and weighted_progress_snapshot <= 100),
  created_at timestamptz not null default now(),
  constraint progress_report_item_unique unique(report_id, boq_item_id)
);

create index if not exists progress_report_items_report_idx
  on public.progress_report_items(report_id);

alter table public.progress_projects enable row level security;
alter table public.progress_boq_items enable row level security;
alter table public.progress_reports enable row level security;
alter table public.progress_report_items enable row level security;

-- Projects: each user sees and manages only projects they own.
drop policy if exists "progress_projects_owner_all" on public.progress_projects;
create policy "progress_projects_owner_all" on public.progress_projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- BOQ rows inherit ownership from their project.
drop policy if exists "progress_boq_items_owner_all" on public.progress_boq_items;
create policy "progress_boq_items_owner_all" on public.progress_boq_items
  for all to authenticated
  using (exists (
    select 1 from public.progress_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.progress_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

-- Reports inherit ownership from their project.
drop policy if exists "progress_reports_owner_all" on public.progress_reports;
create policy "progress_reports_owner_all" on public.progress_reports
  for all to authenticated
  using (exists (
    select 1 from public.progress_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.progress_projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

-- Detail snapshots inherit ownership from their report and project.
drop policy if exists "progress_report_items_owner_all" on public.progress_report_items;
create policy "progress_report_items_owner_all" on public.progress_report_items
  for all to authenticated
  using (exists (
    select 1
    from public.progress_reports r
    join public.progress_projects p on p.id = r.project_id
    where r.id = report_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.progress_reports r
    join public.progress_projects p on p.id = r.project_id
    join public.progress_boq_items i on i.id = boq_item_id
      and i.project_id = r.project_id and i.boq_version = r.boq_version
    where r.id = report_id and p.owner_id = (select auth.uid())
  ));

-- Explicit Data API grants: table exposure is separate from RLS.
grant select, insert, update, delete on public.progress_projects to authenticated;
grant select, insert, update, delete on public.progress_boq_items to authenticated;
grant select, insert, update, delete on public.progress_reports to authenticated;
grant select, insert, update, delete on public.progress_report_items to authenticated;

-- Atomic save: each report date stores a complete cumulative snapshot for all active
-- BOQ items in the project's current version. The invoker's RLS still applies.
create or replace function public.progress_save_report(
  p_project_id uuid,
  p_report_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $function$
declare
  v_project public.progress_projects%rowtype;
  v_report_id uuid;
  v_total_amount numeric(16,2);
  v_item_count integer;
  v_payload_count integer;
  v_row jsonb;
  v_item_id uuid;
  v_percent numeric(7,3);
  v_amount numeric(16,2);
  v_weight numeric(12,8);
begin
  select * into v_project
  from public.progress_projects
  where id = p_project_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Proyek tidak ditemukan atau akses ditolak';
  end if;
  if p_report_date < v_project.start_date or p_report_date > v_project.end_date then
    raise exception 'Tanggal laporan harus berada dalam rentang proyek';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Rincian progres tidak valid';
  end if;

  select count(*), coalesce(sum(quantity * unit_price), 0)
  into v_item_count, v_total_amount
  from public.progress_boq_items
  where project_id = p_project_id
    and boq_version = v_project.current_boq_version
    and is_active = true;

  v_payload_count := jsonb_array_length(p_items);
  if v_item_count = 0 or v_total_amount <= 0 then
    raise exception 'RAB aktif belum memiliki nilai yang dapat dibobotkan';
  end if;
  if v_payload_count <> v_item_count then
    raise exception 'Semua item RAB aktif wajib dikirim dalam laporan progres';
  end if;

  insert into public.progress_reports(
    project_id, boq_version, report_date, notes, status, created_by, updated_at
  ) values (
    p_project_id, v_project.current_boq_version, p_report_date,
    coalesce(p_notes, ''), 'draft', auth.uid(), now()
  )
  on conflict(project_id, boq_version, report_date) do update set
    notes = excluded.notes,
    updated_at = now()
  returning id into v_report_id;

  delete from public.progress_report_items where report_id = v_report_id;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_row->>'item_id')::uuid;
    v_percent := (v_row->>'cumulative_percent')::numeric;

    if v_percent < 0 or v_percent > 100 then
      raise exception 'Persentase kumulatif harus berada antara 0 dan 100';
    end if;

    select quantity * unit_price into v_amount
    from public.progress_boq_items
    where id = v_item_id
      and project_id = p_project_id
      and boq_version = v_project.current_boq_version
      and is_active = true;

    if not found then
      raise exception 'Item RAB tidak ditemukan pada versi aktif';
    end if;

    v_weight := v_amount / v_total_amount * 100;
    insert into public.progress_report_items(
      report_id, boq_item_id, cumulative_percent,
      boq_amount_snapshot, weight_snapshot, weighted_progress_snapshot
    ) values (
      v_report_id, v_item_id, v_percent,
      v_amount, v_weight, v_weight * v_percent / 100
    );
  end loop;

  return v_report_id;
end;
$function$;

revoke all on function public.progress_save_report(uuid,date,text,jsonb) from public, anon;
grant execute on function public.progress_save_report(uuid,date,text,jsonb) to authenticated;

-- Create a new RAB baseline revision without changing reports already saved.
create or replace function public.progress_create_boq_revision(p_project_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $function$
declare
  v_project public.progress_projects%rowtype;
  v_next_version integer;
begin
  select * into v_project
  from public.progress_projects
  where id = p_project_id and owner_id = auth.uid()
  for update;
  if not found then raise exception 'Proyek tidak ditemukan atau akses ditolak'; end if;

  v_next_version := v_project.current_boq_version + 1;
  insert into public.progress_boq_items(
    project_id, boq_version, item_code, work_group, description, unit,
    quantity, unit_price, planned_start_date, planned_end_date, sort_order, is_active
  )
  select
    project_id, v_next_version, item_code, work_group, description, unit,
    quantity, unit_price, planned_start_date, planned_end_date, sort_order, is_active
  from public.progress_boq_items
  where project_id = p_project_id
    and boq_version = v_project.current_boq_version
    and is_active = true;

  update public.progress_projects
  set current_boq_version = v_next_version, updated_at = now()
  where id = p_project_id;

  return v_next_version;
end;
$function$;

revoke all on function public.progress_create_boq_revision(uuid) from public, anon;
grant execute on function public.progress_create_boq_revision(uuid) to authenticated;

commit;
