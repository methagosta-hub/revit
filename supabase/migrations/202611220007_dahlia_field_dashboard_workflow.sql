-- Dahlia Field / Dashboard integration.
-- Adds administrator linking UI APIs and an atomic PR -> Purchase Order workflow.
-- Apply only after the matching dashboard and mobile client changes are reviewed.

-- Enforce one active Field account mapping per employee. There are currently no
-- duplicate mappings in production at migration-preparation time.
create unique index if not exists field_user_links_employee_unique_idx
  on dahlia_private.field_user_links(employee_id)
  where employee_id is not null;

alter table public.field_material_requests
  add column if not exists converted_purchase_order_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'field_material_requests_converted_po_fk'
      and conrelid = 'public.field_material_requests'::regclass
  ) then
    alter table public.field_material_requests
      add constraint field_material_requests_converted_po_fk
      foreign key (converted_purchase_order_id)
      references public.project_purchase_orders(id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists field_material_requests_converted_po_unique_idx
  on public.field_material_requests(converted_purchase_order_id)
  where converted_purchase_order_id is not null;

-- Administrator-only employee directory for the account-linking panel.
create or replace function public.dahlia_field_list_linkable_employees(
  p_search text default null
)
returns table (
  employee_id uuid,
  employee_number text,
  full_name text,
  preferred_name text,
  position_title text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if auth.uid() is null
     or not public.dahlia_has_company_permission('user.manage') then
    raise exception 'Hanya administrator dengan izin Kelola Pengguna yang dapat melihat daftar karyawan untuk penautan.'
      using errcode = '42501';
  end if;

  return query
    select e.id,
           e.employee_number::text,
           e.full_name::text,
           e.preferred_name::text,
           e.position_title::text
    from public.employees e
    where e.status = 'active'
      and (
        v_search is null
        or e.full_name ilike '%' || v_search || '%'
        or coalesce(e.preferred_name, '') ilike '%' || v_search || '%'
        or coalesce(e.employee_number, '') ilike '%' || v_search || '%'
      )
    order by e.full_name
    limit 250;
end;
$function$;

-- Returns only the Field mapping for the selected user; it does not expose the
-- private mapping table to the browser.
create or replace function public.dahlia_field_get_user_link(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not public.dahlia_has_company_permission('user.manage') then
    raise exception 'Hanya administrator dengan izin Kelola Pengguna yang dapat melihat tautan Dahlia Field.'
      using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.user_profiles up where up.id = p_user_id
  ) then
    raise exception 'Akun pengguna tidak ditemukan.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'linked', true,
    'field_role', l.field_role,
    'employee_id', l.employee_id,
    'employee_number', e.employee_number,
    'employee_name', e.full_name,
    'preferred_name', e.preferred_name,
    'position_title', e.position_title,
    'subcontractor_id', l.subcontractor_id
  )
  into v_result
  from dahlia_private.field_user_links l
  left join public.employees e on e.id = l.employee_id
  where l.user_id = p_user_id;

  return coalesce(v_result, jsonb_build_object(
    'linked', false,
    'field_role', null,
    'employee_id', null,
    'employee_number', null,
    'employee_name', null,
    'preferred_name', null,
    'position_title', null,
    'subcontractor_id', null
  ));
end;
$function$;

-- Purchasing queue: only approved requests that have not yet become a PO.
create or replace function public.dahlia_field_list_approved_requests_for_purchasing()
returns table (
  request_id uuid,
  request_number text,
  project_id uuid,
  project_title text,
  client text,
  request_date date,
  required_date date,
  priority text,
  status text,
  notes text,
  rejection_reason text,
  created_by uuid,
  created_at timestamptz,
  reviewed_at timestamptz,
  item_count bigint,
  items jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null
     or not public.has_company_role(array['director', 'admin', 'purchasing']::text[]) then
    raise exception 'Hanya Purchasing, Direktur, atau Admin perusahaan yang dapat memuat PR untuk dibuat menjadi PO.'
      using errcode = '42501';
  end if;

  return query
    select r.id,
           r.request_number::text,
           r.project_id,
           p.title::text,
           p.client::text,
           r.request_date,
           r.required_date,
           r.priority::text,
           r.status::text,
           r.notes,
           r.rejection_reason,
           r.created_by,
           r.created_at,
           r.reviewed_at,
           count(i.id),
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', i.id,
                 'material_id', i.material_id,
                 'item_name', i.item_name,
                 'unit', i.unit,
                 'quantity', i.quantity,
                 'notes', i.notes,
                 'sort_order', i.sort_order
               ) order by i.sort_order, i.created_at
             ) filter (where i.id is not null),
             '[]'::jsonb
           )
    from public.field_material_requests r
    join public.projects p on p.id = r.project_id
    left join public.field_material_request_items i on i.request_id = r.id
    where r.status = 'approved'
      and r.converted_purchase_order_id is null
      and public.dahlia_project_category_access(r.project_id)
    group by r.id, p.id, p.title, p.client
    order by
      case r.priority when 'urgent' then 0 else 1 end,
      r.created_at asc;
end;
$function$;

-- Atomically converts one approved Field PR into a normal Purchase Order.
-- The buyer supplies one positive unit price per original PR item. The existing
-- create_project_purchase_order RPC still generates the PO number, totals and
-- pending_approval status and applies its existing purchasing authorization.
create or replace function public.dahlia_field_create_purchase_order_from_request(
  p_request_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_expected_date date default null,
  p_notes text default null,
  p_item_prices jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_request public.field_material_requests;
  v_item_count integer;
  v_price_count integer;
  v_distinct_price_count integer;
  v_items jsonb;
  v_po_id uuid;
  v_po_notes text;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;

  if not public.has_company_role(array['director', 'admin', 'purchasing']::text[]) then
    raise exception 'Hanya Purchasing, Direktur, atau Admin perusahaan yang dapat membuat PO dari PR.'
      using errcode = '42501';
  end if;

  if p_request_id is null or p_supplier_id is null or p_order_date is null then
    raise exception 'PR, supplier, dan tanggal PO wajib dipilih.' using errcode = '22023';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'Perkiraan tiba tidak boleh sebelum tanggal PO.' using errcode = '22023';
  end if;

  if p_item_prices is null or jsonb_typeof(p_item_prices) is distinct from 'array'
     or jsonb_array_length(p_item_prices) = 0
     or jsonb_array_length(p_item_prices) > 200 then
    raise exception 'Harga harus diisi untuk seluruh rincian PR (maksimal 200 baris).'
      using errcode = '22023';
  end if;

  select * into v_request
  from public.field_material_requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Permintaan material tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'Hanya PR yang sudah disetujui yang dapat dibuat menjadi PO.' using errcode = '23514';
  end if;

  if v_request.converted_purchase_order_id is not null then
    raise exception 'PR ini sudah pernah dikonversi menjadi PO.' using errcode = '23505';
  end if;

  select count(*)::integer
    into v_item_count
  from public.field_material_request_items i
  where i.request_id = v_request.id;

  select count(*)::integer,
         count(distinct value->>'item_id')::integer
    into v_price_count, v_distinct_price_count
  from jsonb_array_elements(p_item_prices) as prices(value);

  if v_item_count = 0
     or v_price_count <> v_item_count
     or v_distinct_price_count <> v_item_count then
    raise exception 'Jumlah harga tidak sama dengan jumlah item PR atau ada item duplikat.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_item_prices) as prices(value)
    where coalesce(value->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(value->>'unit_price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
       or case
            when coalesce(value->>'unit_price', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
              then (value->>'unit_price')::numeric <= 0
            else true
          end
       or not exists (
         select 1
         from public.field_material_request_items i
         where i.id::text = value->>'item_id'
           and i.request_id = v_request.id
       )
  ) then
    raise exception 'Setiap item PR harus memiliki ID yang valid dan harga satuan lebih besar dari nol.'
      using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'material_code', null,
      'material_name', i.item_name,
      'unit', i.unit,
      'quantity_ordered', i.quantity,
      'unit_price', (price.value->>'unit_price')::numeric,
      'notes', nullif(trim(coalesce(i.notes, '')), '')
    )
    order by i.sort_order, i.created_at
  )
  into v_items
  from public.field_material_request_items i
  join lateral (
    select value
    from jsonb_array_elements(p_item_prices) as prices(value)
    where value->>'item_id' = i.id::text
    limit 1
  ) price on true
  where i.request_id = v_request.id;

  v_po_notes := concat_ws(
    E'\n\n',
    'Sumber permintaan lapangan: ' || v_request.request_number,
    nullif(trim(coalesce(p_notes, '')), '')
  );

  v_po_id := public.create_project_purchase_order(
    v_request.project_id,
    p_supplier_id,
    p_order_date,
    p_expected_date,
    v_po_notes,
    v_items
  );

  update public.field_material_requests
  set status = 'converted',
      converted_purchase_order_id = v_po_id,
      updated_at = now()
  where id = v_request.id;

  return v_po_id;
end;
$function$;

revoke all on function public.dahlia_field_list_linkable_employees(text) from public, anon;
revoke all on function public.dahlia_field_get_user_link(uuid) from public, anon;
revoke all on function public.dahlia_field_list_approved_requests_for_purchasing() from public, anon;
revoke all on function public.dahlia_field_create_purchase_order_from_request(uuid, uuid, date, date, text, jsonb) from public, anon;

grant execute on function public.dahlia_field_list_linkable_employees(text) to authenticated;
grant execute on function public.dahlia_field_get_user_link(uuid) to authenticated;
grant execute on function public.dahlia_field_list_approved_requests_for_purchasing() to authenticated;
grant execute on function public.dahlia_field_create_purchase_order_from_request(uuid, uuid, date, date, text, jsonb) to authenticated;

comment on function public.dahlia_field_create_purchase_order_from_request(uuid, uuid, date, date, text, jsonb) is
  'Atomically converts one approved Dahlia Field material requisition into an ordinary pending-approval Purchase Order, recording its source PR.';
