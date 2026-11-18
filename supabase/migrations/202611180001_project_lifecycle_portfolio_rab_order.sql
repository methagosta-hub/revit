-- Dahlia Management System: project lifecycle, PORTOFOLIO isolation, and RAB ordering
-- Apply this migration in Supabase after the existing Company Access migrations.

do $preflight$
begin
  if to_regclass('public.projects') is null
     or to_regclass('public.user_profiles') is null
     or to_regclass('public.user_role_assignments') is null
     or to_regclass('public.app_roles') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.app_permissions') is null
     or to_regclass('public.rab_divisions') is null
     or to_regclass('public.rab_items') is null then
    raise exception 'Migration membutuhkan tabel projects, user_profiles, akses peran, rab_divisions, dan rab_items.';
  end if;
  if to_regprocedure('public.dahlia_role_assignment_is_effective(date,date,timestamptz)') is null then
    raise exception 'Helper dahlia_role_assignment_is_effective belum tersedia. Jalankan migration akses pengguna terlebih dahulu.';
  end if;
  if to_regprocedure('public.is_company_admin()') is null then
    raise exception 'Fungsi is_company_admin belum tersedia. Pastikan modul pengelolaan pengguna sudah terpasang.';
  end if;
end;
$preflight$;

alter table public.user_profiles
  add column if not exists is_demo_user boolean not null default false;

alter table public.projects
  add column if not exists project_category text;

update public.projects
set project_category = coalesce(nullif(upper(trim(project_category)), ''), 'REGULER');

alter table public.projects
  alter column project_category set default 'REGULER',
  alter column project_category set not null;

alter table public.projects
  drop constraint if exists projects_project_category_check;

alter table public.projects
  add constraint projects_project_category_check
  check (project_category in ('REGULER', 'PORTOFOLIO'));

-- Remove the old three-value CHECK first; otherwise rewriting 'Draft'
-- to 'DRAFT' would be rejected by the previous constraint.
alter table public.projects
  drop constraint if exists projects_status_check;

-- Normalisasi tiga status lama tanpa mengubah proyek yang sudah memiliki
-- status baru. Nilai yang tidak dikenal dihentikan agar tidak diam-diam hilang.
do $normalize_status$
begin
  if exists (
    select 1
    from public.projects
    where upper(trim(coalesce(status, ''))) not in (
      '', 'DRAFT', 'REVIEW', 'FINAL', 'FINAL RAB', 'DIKERJAKAN', 'SELESAI'
    )
  ) then
    raise exception 'Ditemukan status proyek yang belum dikenal. Periksa data projects.status sebelum menjalankan migrasi.';
  end if;
end;
$normalize_status$;

update public.projects
set status = case upper(trim(coalesce(status, '')))
  when '' then 'DRAFT'
  when 'DRAFT' then 'DRAFT'
  when 'REVIEW' then 'REVIEW'
  when 'FINAL' then 'FINAL RAB'
  when 'FINAL RAB' then 'FINAL RAB'
  when 'DIKERJAKAN' then 'DIKERJAKAN'
  when 'SELESAI' then 'SELESAI'
  else 'DRAFT'
end;

alter table public.projects
  alter column status set default 'DRAFT',
  alter column status set not null;

alter table public.projects
  add constraint projects_status_check
  check (status in ('DRAFT', 'REVIEW', 'FINAL RAB', 'DIKERJAKAN', 'SELESAI'));

create table if not exists public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  old_status text,
  new_status text not null check (new_status in ('DRAFT', 'REVIEW', 'FINAL RAB', 'DIKERJAKAN', 'SELESAI')),
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists project_status_history_project_date_idx
  on public.project_status_history(project_id, changed_at desc);

-- Only the trusted administrator API (service role) may change the account
-- category. Any non-revoked role assignment must first be removed so that a
-- user's effective scope cannot silently change under existing assignments.
create or replace function public.dahlia_guard_user_demo_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $dahlia_profile_guard$
begin
  if tg_op = 'INSERT' then
    if new.is_demo_user is true and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Hanya administrator yang dapat membuat akun PORTOFOLIO.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.is_demo_user is distinct from old.is_demo_user then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Hanya administrator yang dapat mengubah kategori akun.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.user_role_assignments
      where user_id = new.id and revoked_at is null
    ) then
      raise exception 'Cabut seluruh penugasan role sebelum mengubah kategori akun.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$dahlia_profile_guard$;

drop trigger if exists user_profiles_demo_mode_guard on public.user_profiles;
create trigger user_profiles_demo_mode_guard
before insert or update of is_demo_user on public.user_profiles
for each row execute function public.dahlia_guard_user_demo_mode();

-- Scope project visibility by the account mode. Demo accounts can only access
-- PORTOFOLIO projects; regular accounts can only access REGULER projects.
create or replace function public.dahlia_project_category_value_access(p_project_category text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.is_active = true
      and (
        p_project_category = case when up.is_demo_user then 'PORTOFOLIO' else 'REGULER' end
        or coalesce(public.is_company_admin(), false)
      )
  );
$$;

create or replace function public.dahlia_project_category_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.dahlia_project_category_value_access(p.project_category)
  );
$$;

revoke all on function public.dahlia_project_category_value_access(text) from public, anon;
grant execute on function public.dahlia_project_category_value_access(text) to authenticated;
revoke all on function public.dahlia_project_category_access(uuid) from public, anon;
grant execute on function public.dahlia_project_category_access(uuid) to authenticated;

-- PORTOFOLIO accounts are deliberately read-only. Company administrators
-- retain the ability to prepare and maintain sample projects.
create or replace function public.dahlia_project_write_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $dahlia_project_write$
  select exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid()
      and up.is_active = true
      and (not up.is_demo_user or coalesce(public.is_company_admin(), false))
  );
$dahlia_project_write$;

create or replace function public.dahlia_project_category_write_value_access(p_project_category text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $dahlia_category_write$
  select public.dahlia_project_write_access()
     and public.dahlia_project_category_value_access(p_project_category);
$dahlia_category_write$;

revoke all on function public.dahlia_project_write_access() from public, anon;
grant execute on function public.dahlia_project_write_access() to authenticated;
revoke all on function public.dahlia_project_category_write_value_access(text) from public, anon;
grant execute on function public.dahlia_project_category_write_value_access(text) to authenticated;

-- Row-level category scope for every project-linked table. Company-wide rows
-- with no project remain visible only to REGULER accounts, never to demo users.
create or replace function public.dahlia_project_row_category_access(p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_is_demo boolean;
  v_package_id uuid;
  v_segment_id uuid;
  v_segment_item_id uuid;
  v_contract_id uuid;
  v_purchase_order_id uuid;
  v_report_id uuid;
  v_issue_id uuid;
  v_receipt_id uuid;
  v_request_id uuid;
  v_payment_transaction_id uuid;
  v_obligation_id uuid;
  v_external_report_id uuid;
  v_division_id uuid;
  v_rab_item_id uuid;
begin
  select coalesce(is_demo_user, false)
    into v_is_demo
    from public.user_profiles
   where id = auth.uid() and is_active = true;
  if not found then return false; end if;

  v_project_id := coalesce(
    nullif(p_row->>'project_id', '')::uuid,
    nullif(p_row->>'record_origin_project_id', '')::uuid
  );
  v_package_id := nullif(p_row->>'package_id', '')::uuid;
  v_segment_id := nullif(p_row->>'segment_id', '')::uuid;
  v_segment_item_id := nullif(p_row->>'segment_item_id', '')::uuid;
  v_contract_id := nullif(p_row->>'contract_id', '')::uuid;
  v_purchase_order_id := nullif(p_row->>'purchase_order_id', '')::uuid;
  v_report_id := nullif(p_row->>'report_id', '')::uuid;
  v_issue_id := nullif(p_row->>'issue_id', '')::uuid;
  v_receipt_id := nullif(p_row->>'receipt_id', '')::uuid;
  v_request_id := nullif(p_row->>'request_id', '')::uuid;
  v_payment_transaction_id := nullif(p_row->>'payment_transaction_id', '')::uuid;
  v_obligation_id := nullif(p_row->>'obligation_id', '')::uuid;
  v_external_report_id := nullif(p_row->>'report_id', '')::uuid;
  v_division_id := nullif(p_row->>'division_id', '')::uuid;
  v_rab_item_id := nullif(p_row->>'rab_item_id', '')::uuid;

  if v_project_id is null and v_package_id is not null then
    select project_id into v_project_id from public.project_work_packages where id = v_package_id;
  end if;
  if v_project_id is null and v_segment_id is not null then
    select p.project_id into v_project_id
      from public.execution_segments es
      join public.project_work_packages p on p.id = es.package_id
     where es.id = v_segment_id;
  end if;
  if v_project_id is null and v_segment_item_id is not null then
    select p.project_id into v_project_id
      from public.execution_segment_items esi
      join public.execution_segments es on es.id = esi.segment_id
      join public.project_work_packages p on p.id = es.package_id
     where esi.id = v_segment_item_id;
  end if;
  if v_project_id is null and v_contract_id is not null then
    select project_id into v_project_id from public.execution_contract_register where id = v_contract_id;
  end if;
  if v_project_id is null and v_purchase_order_id is not null then
    select project_id into v_project_id from public.project_purchase_orders where id = v_purchase_order_id;
  end if;
  if v_project_id is null and v_report_id is not null then
    select project_id into v_project_id from public.project_daily_reports where id = v_report_id;
  end if;
  if v_project_id is null and v_issue_id is not null then
    select project_id into v_project_id from public.project_material_issues where id = v_issue_id;
  end if;
  if v_project_id is null and v_receipt_id is not null then
    select project_id into v_project_id from public.project_material_receipts where id = v_receipt_id;
  end if;
  if v_project_id is null and v_division_id is not null then
    select project_id into v_project_id from public.rab_divisions where id = v_division_id;
  end if;
  if v_project_id is null and v_rab_item_id is not null then
    select d.project_id into v_project_id
      from public.rab_items ri
      join public.rab_divisions d on d.id = ri.division_id
     where ri.id = v_rab_item_id;
  end if;
  if v_project_id is null and v_request_id is not null then
    select p.project_id into v_project_id
      from public.subcontract_payment_requests spr
      join public.execution_segments es on es.id = spr.segment_id
      join public.project_work_packages p on p.id = es.package_id
     where spr.id = v_request_id;
  end if;
  if v_project_id is null and v_obligation_id is not null then
    select project_id into v_project_id from public.payment_obligations where id = v_obligation_id;
  end if;
  if v_project_id is null and v_payment_transaction_id is not null then
    select project_id into v_project_id from public.payment_transactions where id = v_payment_transaction_id;
  end if;
  if v_project_id is null and v_external_report_id is not null then
    select project_id into v_project_id from public.external_report_books where id = v_external_report_id;
  end if;

  if v_project_id is null then
    return not v_is_demo;
  end if;
  return public.dahlia_project_category_access(v_project_id);
end;
$$;

revoke all on function public.dahlia_project_row_category_access(jsonb) from public, anon;
grant execute on function public.dahlia_project_row_category_access(jsonb) to authenticated;

create or replace function public.dahlia_project_row_category_write_access(p_row jsonb)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $dahlia_row_write$
  select public.dahlia_project_write_access()
     and public.dahlia_project_row_category_access(p_row);
$dahlia_row_write$;

revoke all on function public.dahlia_project_row_category_write_access(jsonb) from public, anon;
grant execute on function public.dahlia_project_row_category_write_access(jsonb) to authenticated;

-- Add a restrictive category policy to project-linked tables which already use
-- RLS. Existing permission policies still decide what each role can do.
do $install_category_policies$
declare
  v_table text;
  v_tables text[] := array[
    'project_purchase_orders',
    'project_purchase_order_items',
    'project_supplier_payments',
    'company_cash_transactions',
    'employee_daily_assignments',
    'project_work_assignments',
    'attendance_records',
    'project_daily_reports',
    'project_daily_report_work_items',
    'project_daily_report_labor',
    'project_daily_report_materials',
    'project_daily_report_equipment',
    'project_material_issues',
    'project_material_issue_items',
    'project_material_receipts',
    'project_material_receipt_items',
    'project_material_usages',
    'project_work_packages',
    'project_work_package_items',
    'execution_segments',
    'execution_segment_items',
    'execution_progress_entries',
    'execution_change_orders',
    'execution_contract_register',
    'execution_contract_documents',
    'subcontract_payment_terms',
    'subcontract_payment_requests',
    'payment_obligations',
    'payroll_cost_allocations',
    'rab_divisions',
    'rab_items',
    'volume_details',
    'user_role_assignments',
    'finance_recap_documents',
    'subcontract_retention_balances',
    'subcontract_payment_request_progress',
    'payment_transactions',
    'payment_transaction_allocations',
    'payment_audit_logs',
    'execution_audit_logs',
    'project_daily_report_photos',
    'external_report_books',
    'external_report_ledger_entries',
    'external_report_wage_snapshots',
    'external_report_adjustments',
    'external_report_audit_logs'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null
       and exists (
         select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
       ) then
      execute format('drop policy if exists %I on public.%I', v_table || '_category_scope_restrictive', v_table);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (public.dahlia_project_row_category_access(to_jsonb(%I))) with check (public.dahlia_project_row_category_write_access(to_jsonb(%I)))',
        v_table || '_category_scope_restrictive',
        v_table,
        v_table,
        v_table
      );
      execute format('drop policy if exists %I on public.%I', v_table || '_delete_write_guard', v_table);
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (public.dahlia_project_write_access() and public.dahlia_project_row_category_access(to_jsonb(%I)))',
        v_table || '_delete_write_guard',
        v_table,
        v_table
      );
    end if;
  end loop;
end;
$install_category_policies$;

-- Restrictive policy adds a category boundary even when an older permissive
-- projects policy grants broad company-level project visibility.
drop policy if exists projects_category_scope_restrictive on public.projects;
create policy projects_category_scope_restrictive
  on public.projects as restrictive
  for all to authenticated
  using (public.dahlia_project_category_access(id))
  with check (public.dahlia_project_category_write_value_access(project_category));

drop policy if exists projects_delete_write_guard on public.projects;
create policy projects_delete_write_guard
  on public.projects as restrictive
  for delete to authenticated
  using (public.dahlia_project_write_access() and public.dahlia_project_category_access(id));

-- Preserve the existing effective role-assignment logic while enforcing the
-- REGULER/PORTOFOLIO account boundary across project-scoped RLS checks.
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
  select p_project_id is not null
     and p_permission_code is not null
     and public.dahlia_project_category_access(p_project_id)
     and exists (
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

revoke all on function public.dahlia_has_project_execution_permission(uuid, text) from public, anon;
grant execute on function public.dahlia_has_project_execution_permission(uuid, text) to authenticated;

-- Demo users must be assigned to an individual PORTOFOLIO project, never to a
-- company-wide role assignment that could expose operational data.
create or replace function public.dahlia_guard_demo_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_demo boolean;
  v_category text;
begin
  select coalesce(is_demo_user, false)
    into v_is_demo
    from public.user_profiles
   where id = new.user_id;

  if v_is_demo and new.project_id is null then
    raise exception 'Akun dummy harus menggunakan penugasan khusus proyek PORTOFOLIO.' using errcode = '42501';
  end if;

  if new.project_id is not null then
    select project_category into v_category from public.projects where id = new.project_id;
    if v_category is distinct from case when v_is_demo then 'PORTOFOLIO' else 'REGULER' end then
      raise exception 'Penugasan akun hanya boleh menggunakan kategori proyek yang sesuai dengan jenis akunnya.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_role_assignments_demo_scope on public.user_role_assignments;
create trigger user_role_assignments_demo_scope
before insert or update of user_id, project_id on public.user_role_assignments
for each row execute function public.dahlia_guard_demo_role_assignment();

-- Prevent any direct status change through the general project save RPC or a
-- client UPDATE. The audited transition RPC sets a transaction-local flag.
create or replace function public.dahlia_guard_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
begin
  if not public.dahlia_project_write_access() then
    raise exception 'Akun PORTOFOLIO hanya memiliki akses baca. Perubahan proyek sampel dikelola administrator perusahaan.' using errcode = '42501';
  end if;

  if not public.dahlia_project_category_value_access(new.project_category) then
    raise exception 'Akun ini tidak dapat menulis data pada kategori proyek tersebut.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if upper(coalesce(new.status, '')) <> 'DRAFT' then
      raise exception 'Proyek baru harus dimulai dengan status DRAFT.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('dahlia.project_status_transition', true), '') <> 'on' then
    raise exception 'Status proyek hanya boleh diubah melalui alur transisi resmi.' using errcode = '42501';
  end if;

  if new.project_category is distinct from old.project_category then
    raise exception 'Kategori proyek REGULER/PORTOFOLIO tidak dapat diubah setelah proyek dibuat.' using errcode = '23514';
  end if;
  return new;
end;
$;

create or replace function public.transition_project_status(
  p_project_id uuid,
  p_new_status text,
  p_reason text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_new_status text := upper(trim(coalesce(p_new_status, '')));
  v_old_status text;
  v_allowed boolean := false;
begin
  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if v_project.id is null then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if not public.dahlia_project_write_access() then
    raise exception 'Akun PORTOFOLIO hanya memiliki akses baca. Hubungi administrator perusahaan untuk mengubah data proyek.' using errcode = '42501';
  end if;
  if not public.dahlia_has_project_execution_permission(p_project_id, 'project.manage') then
    raise exception 'Tidak memiliki izin mengubah status proyek.' using errcode = '42501';
  end if;
  if v_new_status not in ('DRAFT', 'REVIEW', 'FINAL RAB', 'DIKERJAKAN', 'SELESAI') then
    raise exception 'Status proyek tidak valid.' using errcode = '22023';
  end if;

  v_allowed := case v_project.status
    when 'DRAFT' then v_new_status in ('DRAFT', 'REVIEW')
    when 'REVIEW' then v_new_status in ('REVIEW', 'DRAFT', 'FINAL RAB')
    when 'FINAL RAB' then v_new_status in ('FINAL RAB', 'REVIEW', 'DIKERJAKAN')
    when 'DIKERJAKAN' then v_new_status in ('DIKERJAKAN', 'SELESAI')
    when 'SELESAI' then v_new_status = 'SELESAI'
    else false
  end;

  if not v_allowed then
    raise exception 'Perpindahan status dari % ke % tidak diizinkan.', v_project.status, v_new_status using errcode = '23514';
  end if;
  if v_project.status = v_new_status then
    return v_project;
  end if;

  v_old_status := v_project.status;
  perform set_config('dahlia.project_status_transition', 'on', true);

  update public.projects
     set status = v_new_status,
         updated_at = now()
   where id = p_project_id
   returning * into v_project;

  insert into public.project_status_history(project_id, old_status, new_status, reason, changed_by)
  values (p_project_id, v_old_status, v_new_status, nullif(trim(coalesce(p_reason, '')), ''), auth.uid());

  return v_project;
end;
$$;

drop trigger if exists projects_status_transition_guard on public.projects;
create trigger projects_status_transition_guard
before insert or update on public.projects
for each row execute function public.dahlia_guard_project_status_change();

-- Atomic category ordering: every item ID passed must belong to this division.
-- Other grouped work items retain their relative precedence; the reordered
-- AHSP category items are assigned consecutive sort_order values after them.
create or replace function public.reorder_project_rab_categories(
  p_division_id uuid,
  p_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_item_count integer;
  v_ordered_count integer;
  v_offset integer;
begin
  select project_id into v_project_id
  from public.rab_divisions
  where id = p_division_id;

  if v_project_id is null then
    raise exception 'Lokasi RAB tidak ditemukan.' using errcode = 'P0002';
  end if;
  if not public.dahlia_project_write_access() then
    raise exception 'Akun PORTOFOLIO hanya memiliki akses baca. Administrator perusahaan dapat mengatur RAB sampel.' using errcode = '42501';
  end if;
  if not public.dahlia_has_project_execution_permission(v_project_id, 'rab.manage')
     and not public.dahlia_has_project_execution_permission(v_project_id, 'project.manage') then
    raise exception 'Tidak memiliki izin mengubah urutan kategori RAB.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = v_project_id and status in ('DRAFT', 'REVIEW', 'FINAL RAB')) then
    raise exception 'Urutan kategori RAB hanya dapat diubah sebelum proyek masuk tahap DIKERJAKAN.' using errcode = '23514';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'Daftar item urutan RAB tidak boleh kosong.' using errcode = '22023';
  end if;
  if cardinality(p_item_ids) <> (select count(distinct x) from unnest(p_item_ids) as t(x)) then
    raise exception 'Daftar item urutan RAB mengandung ID ganda.' using errcode = '22023';
  end if;

  select count(*) into v_item_count
  from public.rab_items
  where division_id = p_division_id
    and id = any(p_item_ids);

  v_ordered_count := cardinality(p_item_ids);
  if v_item_count <> v_ordered_count then
    raise exception 'Sebagian item tidak termasuk dalam lokasi RAB yang dipilih.' using errcode = '23514';
  end if;

  select coalesce(max(sort_order), 0) into v_offset
  from public.rab_items
  where division_id = p_division_id
    and not (id = any(p_item_ids));

  update public.rab_items ri
     set sort_order = v_offset + ordered.ordinality
    from unnest(p_item_ids) with ordinality as ordered(item_id, ordinality)
   where ri.id = ordered.item_id
     and ri.division_id = p_division_id;

  return v_ordered_count;
end;
$$;

revoke all on function public.reorder_project_rab_categories(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_project_rab_categories(uuid, uuid[]) to authenticated;

-- Every listed project transaction is write-enabled only while the project is
-- DIKERJAKAN. Global/company entries with a null project_id remain supported.
create or replace function public.dahlia_guard_active_project_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_project_id uuid;
  v_package_id uuid;
  v_segment_id uuid;
  v_segment_item_id uuid;
  v_contract_id uuid;
  v_purchase_order_id uuid;
  v_report_id uuid;
  v_issue_id uuid;
  v_receipt_id uuid;
  v_request_id uuid;
  v_obligation_id uuid;
  v_payment_transaction_id uuid;
  v_project public.projects;
begin
  v_project_id := coalesce(nullif(v_row->>'project_id', '')::uuid, nullif(v_row->>'record_origin_project_id', '')::uuid);
  v_package_id := nullif(v_row->>'package_id', '')::uuid;
  v_segment_id := nullif(v_row->>'segment_id', '')::uuid;
  v_segment_item_id := nullif(v_row->>'segment_item_id', '')::uuid;
  v_contract_id := nullif(v_row->>'contract_id', '')::uuid;
  v_purchase_order_id := nullif(v_row->>'purchase_order_id', '')::uuid;
  v_report_id := nullif(v_row->>'report_id', '')::uuid;
  v_issue_id := nullif(v_row->>'issue_id', '')::uuid;
  v_receipt_id := nullif(v_row->>'receipt_id', '')::uuid;
  v_request_id := nullif(v_row->>'request_id', '')::uuid;
  v_obligation_id := nullif(v_row->>'obligation_id', '')::uuid;
  v_payment_transaction_id := nullif(v_row->>'payment_transaction_id', '')::uuid;

  if v_project_id is null and v_package_id is not null and to_regclass('public.project_work_packages') is not null then
    select project_id into v_project_id from public.project_work_packages where id = v_package_id;
  end if;
  if v_project_id is null and v_segment_id is not null
     and to_regclass('public.execution_segments') is not null
     and to_regclass('public.project_work_packages') is not null then
    select p.project_id into v_project_id
      from public.execution_segments es
      join public.project_work_packages p on p.id = es.package_id
     where es.id = v_segment_id;
  end if;
  if v_project_id is null and v_segment_item_id is not null
     and to_regclass('public.execution_segment_items') is not null
     and to_regclass('public.execution_segments') is not null
     and to_regclass('public.project_work_packages') is not null then
    select p.project_id into v_project_id
      from public.execution_segment_items esi
      join public.execution_segments es on es.id = esi.segment_id
      join public.project_work_packages p on p.id = es.package_id
     where esi.id = v_segment_item_id;
  end if;
  if v_project_id is null and v_contract_id is not null
     and to_regclass('public.execution_contract_register') is not null then
    select project_id into v_project_id from public.execution_contract_register where id = v_contract_id;
  end if;
  if v_project_id is null and v_purchase_order_id is not null
     and to_regclass('public.project_purchase_orders') is not null then
    select project_id into v_project_id from public.project_purchase_orders where id = v_purchase_order_id;
  end if;
  if v_project_id is null and v_report_id is not null
     and to_regclass('public.project_daily_reports') is not null then
    select project_id into v_project_id from public.project_daily_reports where id = v_report_id;
  end if;
  if v_project_id is null and v_issue_id is not null
     and to_regclass('public.project_material_issues') is not null then
    select project_id into v_project_id from public.project_material_issues where id = v_issue_id;
  end if;
  if v_project_id is null and v_receipt_id is not null
     and to_regclass('public.project_material_receipts') is not null then
    select project_id into v_project_id from public.project_material_receipts where id = v_receipt_id;
  end if;
  if v_project_id is null and v_request_id is not null
     and to_regclass('public.subcontract_payment_requests') is not null then
    select p.project_id into v_project_id
      from public.subcontract_payment_requests spr
      join public.execution_segments es on es.id = spr.segment_id
      join public.project_work_packages p on p.id = es.package_id
     where spr.id = v_request_id;
  end if;
  if v_project_id is null and v_obligation_id is not null
     and to_regclass('public.payment_obligations') is not null then
    select project_id into v_project_id from public.payment_obligations where id = v_obligation_id;
  end if;
  if v_project_id is null and v_payment_transaction_id is not null
     and to_regclass('public.payment_transactions') is not null then
    select project_id into v_project_id from public.payment_transactions where id = v_payment_transaction_id;
  end if;

  if v_project_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into v_project from public.projects where id = v_project_id;
  if v_project.id is null then
    raise exception 'Proyek transaksi tidak ditemukan.' using errcode = '23503';
  end if;
  if not public.dahlia_project_category_access(v_project_id) then
    raise exception 'Akun ini tidak dapat menulis transaksi pada kategori proyek tersebut.' using errcode = '42501';
  end if;
  if not public.dahlia_project_write_access() then
    raise exception 'Akun PORTOFOLIO hanya memiliki akses baca. Transaksi sampel dikelola oleh administrator perusahaan.' using errcode = '42501';
  end if;
  if v_project.status <> 'DIKERJAKAN' then
    raise exception 'Perubahan transaksi proyek hanya diperbolehkan saat status DIKERJAKAN. Status sekarang: %.', v_project.status using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $install_transaction_guards$
declare
  v_table text;
  v_tables text[] := array[
    'project_purchase_orders',
    'project_supplier_payments',
    'company_cash_transactions',
    'employee_daily_assignments',
    'project_work_assignments',
    'attendance_records',
    'project_daily_reports',
    'project_material_usages',
    'project_material_issues',
    'project_material_receipts',
    'material_issues',
    'goods_receipts',
    'payment_obligations',
    'payroll_cost_allocations',
    'project_work_packages',
    'project_work_package_items',
    'execution_segments',
    'execution_segment_items',
    'execution_progress_entries',
    'execution_change_orders',
    'execution_contract_register',
    'execution_contract_documents',
    'subcontract_payment_terms',
    'subcontract_payment_requests',
    'project_daily_report_work_items',
    'project_daily_report_labor',
    'project_daily_report_materials',
    'project_daily_report_equipment',
    'project_material_issue_items',
    'project_material_receipt_items',
    'subcontract_retention_balances',
    'subcontract_payment_request_progress',
    'payment_transactions',
    'payment_transaction_allocations',
    'payment_audit_logs',
    'execution_audit_logs',
    'project_daily_report_photos',
    'finance_recap_documents'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name=v_table
           and column_name in ('project_id','package_id','segment_id','segment_item_id','contract_id','purchase_order_id','report_id','issue_id','receipt_id','request_id','obligation_id','payment_transaction_id')
       ) then
      execute format('drop trigger if exists %I on public.%I', v_table || '_active_project_guard', v_table);
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each row execute function public.dahlia_guard_active_project_transaction()',
        v_table || '_active_project_guard',
        v_table
      );
    end if;
  end loop;
end;
$install_transaction_guards$;

-- RAB can be edited during DRAFT/REVIEW. After FINAL RAB, only category ordering
-- remains editable so the approved baseline values are not accidentally changed.
create or replace function public.dahlia_guard_rab_editable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_project_id uuid;
  v_division_id uuid;
  v_rab_item_id uuid;
  v_project public.projects;
begin
  if tg_table_name = 'rab_divisions' then
    v_project_id := nullif(v_row->>'project_id', '')::uuid;
  elsif tg_table_name = 'rab_items' then
    v_division_id := nullif(v_row->>'division_id', '')::uuid;
    select project_id into v_project_id from public.rab_divisions where id = v_division_id;
  else
    v_rab_item_id := nullif(v_row->>'rab_item_id', '')::uuid;
    select d.project_id into v_project_id
      from public.rab_items ri join public.rab_divisions d on d.id = ri.division_id
     where ri.id = v_rab_item_id;
  end if;

  if v_project_id is null then
    raise exception 'Proyek untuk data RAB tidak ditemukan.' using errcode = '23503';
  end if;
  if not public.dahlia_project_category_access(v_project_id) then
    raise exception 'Akun ini tidak dapat mengubah RAB pada kategori proyek tersebut.' using errcode = '42501';
  end if;
  if not public.dahlia_project_write_access() then
    raise exception 'Akun PORTOFOLIO hanya memiliki akses baca terhadap dokumen sampel.' using errcode = '42501';
  end if;
  if not public.dahlia_has_project_execution_permission(v_project_id, 'rab.manage')
     and not public.dahlia_has_project_execution_permission(v_project_id, 'project.manage') then
    raise exception 'Tidak memiliki izin mengubah RAB proyek ini.' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = v_project_id;

  if v_project.status in ('DRAFT', 'REVIEW') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Some project-management RPCs touch updated_at even when the RAB values
    -- are unchanged. Permit those no-op writes without reopening the baseline.
    if tg_table_name = 'rab_items' and v_project.status = 'FINAL RAB'
       and (v_row - 'sort_order' - 'updated_at') = (v_old - 'sort_order' - 'updated_at') then
      return new;
    end if;
    if tg_table_name <> 'rab_items'
       and (v_row - 'updated_at') = (v_old - 'updated_at') then
      return new;
    end if;
    if tg_table_name = 'rab_items' and v_project.status in ('DIKERJAKAN', 'SELESAI')
       and (v_row - 'updated_at') = (v_old - 'updated_at') then
      return new;
    end if;
  end if;

  raise exception 'RAB terkunci pada status %. Kembalikan status ke REVIEW untuk mengubah isi RAB.', v_project.status using errcode = '23514';
end;
$$;

drop trigger if exists rab_items_editable_guard on public.rab_items;
create trigger rab_items_editable_guard
before insert or update or delete on public.rab_items
for each row execute function public.dahlia_guard_rab_editable();

drop trigger if exists rab_divisions_editable_guard on public.rab_divisions;
create trigger rab_divisions_editable_guard
before insert or update or delete on public.rab_divisions
for each row execute function public.dahlia_guard_rab_editable();

do $install_volume_details_guard$
begin
  if to_regclass('public.volume_details') is not null then
    execute 'drop trigger if exists volume_details_editable_guard on public.volume_details';
    execute 'create trigger volume_details_editable_guard before insert or update or delete on public.volume_details for each row execute function public.dahlia_guard_rab_editable()';
  end if;
end;
$install_volume_details_guard$;

alter table public.project_status_history enable row level security;
drop policy if exists project_status_history_read on public.project_status_history;
create policy project_status_history_read
  on public.project_status_history for select to authenticated
  using (
    public.dahlia_has_project_execution_permission(project_id, 'project.read')
    or public.dahlia_has_project_execution_permission(project_id, 'project.manage')
  );

grant select on public.project_status_history to authenticated;
