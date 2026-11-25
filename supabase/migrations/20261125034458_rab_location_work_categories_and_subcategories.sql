create table if not exists public.rab_work_categories (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.rab_divisions(id) on delete cascade,
  name varchar(255) not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  legacy_key text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint rab_work_categories_id_division_unique unique (id, division_id)
);

create unique index if not exists rab_work_categories_legacy_key_unique
  on public.rab_work_categories (division_id, legacy_key)
  where legacy_key is not null;

create table if not exists public.rab_work_subcategories (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null,
  category_id uuid not null,
  name varchar(255) not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  legacy_key text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint rab_work_subcategories_id_division_unique unique (id, division_id),
  constraint rab_work_subcategories_category_division_fk
    foreign key (category_id, division_id)
    references public.rab_work_categories (id, division_id)
    on delete cascade
);

create unique index if not exists rab_work_subcategories_legacy_key_unique
  on public.rab_work_subcategories (category_id, legacy_key)
  where legacy_key is not null;

alter table public.rab_items
  add column if not exists rab_subcategory_id uuid;

alter table public.rab_items
  add constraint rab_items_subcategory_division_fk
  foreign key (rab_subcategory_id, division_id)
  references public.rab_work_subcategories (id, division_id)
  on delete restrict;

create index if not exists rab_work_categories_division_sort_idx
  on public.rab_work_categories (division_id, sort_order, created_at);
create index if not exists rab_work_subcategories_category_sort_idx
  on public.rab_work_subcategories (category_id, sort_order, created_at);
create index if not exists rab_items_subcategory_id_idx
  on public.rab_items (rab_subcategory_id)
  where rab_subcategory_id is not null;

alter table public.rab_work_categories enable row level security;
alter table public.rab_work_subcategories enable row level security;
grant select, insert, update, delete on public.rab_work_categories to authenticated;
grant select, insert, update, delete on public.rab_work_subcategories to authenticated;

create policy rab_work_categories_select_scoped
on public.rab_work_categories for select to authenticated
using (
  exists (
    select 1 from public.rab_divisions d
    where d.id = rab_work_categories.division_id
      and public.dahlia_rab_has_any_project_permission(
        d.project_id,
        array[
          'rab.read','rab.manage','project.read','finance.read','warehouse.issue',
          'warehouse.manage','warehouse.receive','procurement.request.create',
          'procurement.request.review','report.read','spj.create','spj.review','spj.approve'
        ]::text[]
      )
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
);

create policy rab_work_categories_insert_manage
on public.rab_work_categories for insert to authenticated
with check (
  exists (
    select 1 from public.rab_divisions d
    where d.id = rab_work_categories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_write_access(to_jsonb(d.*))
  )
);

create policy rab_work_categories_update_manage
on public.rab_work_categories for update to authenticated
using (
  exists (
    select 1 from public.rab_divisions d
    where d.id = rab_work_categories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
)
with check (
  exists (
    select 1 from public.rab_divisions d
    where d.id = rab_work_categories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_write_access(to_jsonb(d.*))
  )
);

create policy rab_work_categories_delete_manage
on public.rab_work_categories for delete to authenticated
using (
  exists (
    select 1 from public.rab_divisions d
    where d.id = rab_work_categories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
);

create policy rab_work_subcategories_select_scoped
on public.rab_work_subcategories for select to authenticated
using (
  exists (
    select 1
    from public.rab_work_categories c
    join public.rab_divisions d on d.id = c.division_id
    where c.id = rab_work_subcategories.category_id
      and c.division_id = rab_work_subcategories.division_id
      and public.dahlia_rab_has_any_project_permission(
        d.project_id,
        array[
          'rab.read','rab.manage','project.read','finance.read','warehouse.issue',
          'warehouse.manage','warehouse.receive','procurement.request.create',
          'procurement.request.review','report.read','spj.create','spj.review','spj.approve'
        ]::text[]
      )
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
);

create policy rab_work_subcategories_insert_manage
on public.rab_work_subcategories for insert to authenticated
with check (
  exists (
    select 1
    from public.rab_work_categories c
    join public.rab_divisions d on d.id = c.division_id
    where c.id = rab_work_subcategories.category_id
      and c.division_id = rab_work_subcategories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_write_access(to_jsonb(d.*))
  )
);

create policy rab_work_subcategories_update_manage
on public.rab_work_subcategories for update to authenticated
using (
  exists (
    select 1
    from public.rab_work_categories c
    join public.rab_divisions d on d.id = c.division_id
    where c.id = rab_work_subcategories.category_id
      and c.division_id = rab_work_subcategories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
)
with check (
  exists (
    select 1
    from public.rab_work_categories c
    join public.rab_divisions d on d.id = c.division_id
    where c.id = rab_work_subcategories.category_id
      and c.division_id = rab_work_subcategories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_write_access(to_jsonb(d.*))
  )
);

create policy rab_work_subcategories_delete_manage
on public.rab_work_subcategories for delete to authenticated
using (
  exists (
    select 1
    from public.rab_work_categories c
    join public.rab_divisions d on d.id = c.division_id
    where c.id = rab_work_subcategories.category_id
      and c.division_id = rab_work_subcategories.division_id
      and public.dahlia_rab_has_any_project_permission(d.project_id, array['rab.manage']::text[])
      and public.dahlia_project_write_access()
      and public.dahlia_project_row_category_access(to_jsonb(d.*))
  )
);