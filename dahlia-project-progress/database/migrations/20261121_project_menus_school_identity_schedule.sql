-- Dahlia Project Progress: project -> work menus -> BOQ items
-- School identity and printable weekly work schedule with selectable signatories.
-- Apply only to the Supabase project used by dahlia-project-progress.

begin;

-- School / project identity. Keep legacy columns intact for compatibility.
alter table public.progress_projects
  add column if not exists school_head text not null default '',
  add column if not exists planner text not null default '',
  add column if not exists supervisor text not null default '',
  add column if not exists p2sp text not null default '',
  add column if not exists address text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists npsn text not null default '';

-- A project may contain several independent work menus (Kelas Baru, Toilet, etc.).
create table if not exists public.progress_project_menus (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.progress_projects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  sort_order integer not null default 0,
  current_boq_version integer not null default 1 check (current_boq_version >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_project_menus_name_unique unique(project_id, name)
);

create index if not exists progress_project_menus_project_order_idx
  on public.progress_project_menus(project_id, is_active desc, sort_order, name);

alter table public.progress_project_menus enable row level security;

drop policy if exists progress_project_menus_owner_all on public.progress_project_menus;
create policy progress_project_menus_owner_all
  on public.progress_project_menus
  for all to authenticated
  using (exists (
    select 1 from public.progress_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.progress_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.progress_project_menus to authenticated;

-- Backfill one menu for every existing project. All existing BOQ rows and reports
-- are migrated to that same menu, preserving historical item/report identifiers.
insert into public.progress_project_menus(project_id, name, description, sort_order, current_boq_version)
select p.id, 'RAB Utama', 'Menu awal hasil migrasi dari data RAB proyek yang sudah ada.', 0,
       greatest(p.current_boq_version, 1)
from public.progress_projects p
where not exists (
  select 1 from public.progress_project_menus m where m.project_id = p.id
);

alter table public.progress_boq_items
  add column if not exists menu_id uuid;

update public.progress_boq_items i
set menu_id = m.id
from public.progress_project_menus m
where m.project_id = i.project_id
  and i.menu_id is null
  and m.name = 'RAB Utama';

-- For any project that already had menus before a rerun/custom setup, attach
-- remaining legacy items to its first menu deterministically.
update public.progress_boq_items i
set menu_id = (
  select m.id
  from public.progress_project_menus m
  where m.project_id = i.project_id
  order by m.sort_order, m.created_at, m.id
  limit 1
)
where i.menu_id is null;

do $boq_menu_fk$
begin
  if exists (select 1 from public.progress_boq_items where menu_id is null) then
    raise exception 'Migrasi menu gagal: masih ada item BOQ tanpa menu.';
  end if;
end;
$boq_menu_fk$;

alter table public.progress_boq_items
  alter column menu_id set not null;

alter table public.progress_boq_items
  drop constraint if exists progress_boq_item_code_unique;

alter table public.progress_boq_items
  drop constraint if exists progress_boq_items_menu_id_fkey;

alter table public.progress_boq_items
  add constraint progress_boq_items_menu_id_fkey
  foreign key (menu_id) references public.progress_project_menus(id) on delete cascade;

alter table public.progress_boq_items
  drop constraint if exists progress_boq_item_menu_code_unique;

alter table public.progress_boq_items
  add constraint progress_boq_item_menu_code_unique
  unique(menu_id, boq_version, item_code);

create index if not exists progress_boq_items_menu_version_order_idx
  on public.progress_boq_items(menu_id, boq_version, sort_order, item_code);

-- Reports are menu-scoped so each menu has its own progress curve and history.
alter table public.progress_reports
  add column if not exists menu_id uuid;

update public.progress_reports r
set menu_id = m.id
from public.progress_project_menus m
where m.project_id = r.project_id
  and r.menu_id is null
  and m.name = 'RAB Utama';

update public.progress_reports r
set menu_id = (
  select m.id
  from public.progress_project_menus m
  where m.project_id = r.project_id
  order by m.sort_order, m.created_at, m.id
  limit 1
)
where r.menu_id is null;

do $report_menu_fk$
begin
  if exists (select 1 from public.progress_reports where menu_id is null) then
    raise exception 'Migrasi menu gagal: masih ada laporan progres tanpa menu.';
  end if;
end;
$report_menu_fk$;

alter table public.progress_reports
  alter column menu_id set not null;

alter table public.progress_reports
  drop constraint if exists progress_report_per_day_unique;

alter table public.progress_reports
  drop constraint if exists progress_report_menu_per_day_unique;

alter table public.progress_reports
  add constraint progress_report_menu_per_day_unique
  unique(menu_id, boq_version, report_date);

alter table public.progress_reports
  drop constraint if exists progress_reports_menu_id_fkey;

alter table public.progress_reports
  add constraint progress_reports_menu_id_fkey
  foreign key (menu_id) references public.progress_project_menus(id) on delete cascade;

create index if not exists progress_reports_menu_date_idx
  on public.progress_reports(menu_id, boq_version, report_date);

-- Strengthen BOQ and report RLS to ensure menu/project relationships match.
drop policy if exists progress_boq_items_owner_all on public.progress_boq_items;
create policy progress_boq_items_owner_all
  on public.progress_boq_items
  for all to authenticated
  using (exists (
    select 1
    from public.progress_project_menus m
    join public.progress_projects p on p.id = m.project_id
    where m.id = progress_boq_items.menu_id
      and m.project_id = progress_boq_items.project_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.progress_project_menus m
    join public.progress_projects p on p.id = m.project_id
    where m.id = progress_boq_items.menu_id
      and m.project_id = progress_boq_items.project_id
      and p.owner_id = (select auth.uid())
  ));

drop policy if exists progress_reports_owner_all on public.progress_reports;
create policy progress_reports_owner_all
  on public.progress_reports
  for all to authenticated
  using (exists (
    select 1 from public.progress_projects p
    join public.progress_project_menus m on m.project_id = p.id
    where p.id = progress_reports.project_id and m.id = progress_reports.menu_id
      and p.owner_id = (select auth.uid())
  ))
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.progress_projects p
      join public.progress_project_menus m on m.project_id = p.id
      where p.id = progress_reports.project_id and m.id = progress_reports.menu_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists progress_report_items_owner_all on public.progress_report_items;
create policy progress_report_items_owner_all
  on public.progress_report_items
  for all to authenticated
  using (exists (
    select 1
    from public.progress_reports r
    join public.progress_projects p on p.id = r.project_id
    join public.progress_project_menus m on m.id = r.menu_id and m.project_id = p.id
    where r.id = report_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.progress_reports r
    join public.progress_projects p on p.id = r.project_id
    join public.progress_project_menus m on m.id = r.menu_id and m.project_id = p.id
    join public.progress_boq_items i
      on i.id = boq_item_id
     and i.project_id = r.project_id
     and i.menu_id = r.menu_id
     and i.boq_version = r.boq_version
    where r.id = report_id and p.owner_id = (select auth.uid())
  ));

-- Atomic full-menu progress snapshot. Weight denominator is the selected menu's BOQ,
-- not the sum of all menus in its parent project.
drop function if exists public.progress_save_report(uuid, date, text, jsonb);

create or replace function public.progress_save_report(
  p_project_id uuid,
  p_menu_id uuid,
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
  v_menu public.progress_project_menus%rowtype;
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
  where id = p_project_id and owner_id = auth.uid();

  if not found then
    raise exception 'Proyek tidak ditemukan atau akses ditolak';
  end if;

  select * into v_menu
  from public.progress_project_menus
  where id = p_menu_id
    and project_id = p_project_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Menu pekerjaan tidak ditemukan atau sedang dinonaktifkan';
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
    and menu_id = p_menu_id
    and boq_version = v_menu.current_boq_version
    and is_active = true;

  v_payload_count := jsonb_array_length(p_items);
  if v_item_count = 0 or v_total_amount <= 0 then
    raise exception 'RAB aktif pada menu ini belum memiliki nilai yang dapat dibobotkan';
  end if;
  if v_payload_count <> v_item_count then
    raise exception 'Semua item RAB aktif pada menu ini wajib dikirim dalam laporan progres';
  end if;

  insert into public.progress_reports(
    project_id, menu_id, boq_version, report_date, notes, status, created_by, updated_at
  ) values (
    p_project_id, p_menu_id, v_menu.current_boq_version, p_report_date,
    coalesce(p_notes, ''), 'draft', auth.uid(), now()
  )
  on conflict(menu_id, boq_version, report_date) do update set
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
      and menu_id = p_menu_id
      and boq_version = v_menu.current_boq_version
      and is_active = true;

    if not found then
      raise exception 'Item RAB tidak ditemukan pada menu dan versi aktif';
    end if;

    if exists (
      select 1
      from public.progress_reports previous_report
      join public.progress_report_items previous_item on previous_item.report_id = previous_report.id
      where previous_report.menu_id = p_menu_id
        and previous_report.boq_version = v_menu.current_boq_version
        and previous_report.report_date < p_report_date
        and previous_item.boq_item_id = v_item_id
        and previous_item.cumulative_percent > v_percent
    ) then
      raise exception 'Progres % tidak boleh lebih kecil dari laporan tanggal sebelumnya', v_item_id;
    end if;

    if exists (
      select 1
      from public.progress_reports next_report
      join public.progress_report_items next_item on next_item.report_id = next_report.id
      where next_report.menu_id = p_menu_id
        and next_report.boq_version = v_menu.current_boq_version
        and next_report.report_date > p_report_date
        and next_item.boq_item_id = v_item_id
        and next_item.cumulative_percent < v_percent
    ) then
      raise exception 'Progres % melampaui laporan tanggal berikutnya; periksa urutan snapshot', v_item_id;
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

revoke all on function public.progress_save_report(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.progress_save_report(uuid, uuid, date, text, jsonb) to authenticated;

-- Drop the previous project-scoped function before reusing its UUID signature with menu semantics.
drop function if exists public.progress_create_boq_revision(uuid);

-- Create a new baseline version for only the selected menu.
create function public.progress_create_boq_revision(p_menu_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $function$
declare
  v_menu public.progress_project_menus%rowtype;
  v_project public.progress_projects%rowtype;
  v_next_version integer;
begin
  select * into v_menu
  from public.progress_project_menus
  where id = p_menu_id and is_active = true
  for update;
  if not found then raise exception 'Menu tidak ditemukan atau tidak aktif'; end if;

  select * into v_project
  from public.progress_projects
  where id = v_menu.project_id and owner_id = auth.uid();
  if not found then raise exception 'Proyek tidak ditemukan atau akses ditolak'; end if;

  v_next_version := v_menu.current_boq_version + 1;
  insert into public.progress_boq_items(
    project_id, menu_id, boq_version, item_code, work_group, description, unit,
    quantity, unit_price, planned_start_date, planned_end_date, sort_order, is_active
  )
  select
    project_id, menu_id, v_next_version, item_code, work_group, description, unit,
    quantity, unit_price, planned_start_date, planned_end_date, sort_order, is_active
  from public.progress_boq_items
  where menu_id = p_menu_id
    and boq_version = v_menu.current_boq_version
    and is_active = true;

  update public.progress_project_menus
  set current_boq_version = v_next_version, updated_at = now()
  where id = p_menu_id;

  return v_next_version;
end;
$function$;

revoke all on function public.progress_create_boq_revision(uuid) from public, anon;
grant execute on function public.progress_create_boq_revision(uuid) to authenticated;

commit;
