-- Enforce that new Field material requests can only target active projects.
-- Existing requisitions are intentionally preserved as historical records.

create or replace function public.dahlia_field_list_material_request_projects()
returns table (
  project_id uuid,
  title text,
  client text,
  location text,
  access_scope text,
  status text
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

  if not dahlia_private.field_user_is_internal() then
    raise exception 'Daftar proyek permintaan material hanya tersedia untuk akun internal.' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.title::text,
      p.client::text,
      p.location::text,
      'internal'::text,
      p.status::text
    from public.projects p
    where p.status::text = 'DIKERJAKAN'
      and (
        public.dahlia_has_project_execution_permission(p.id, 'procurement.request.create')
        or public.dahlia_has_project_execution_permission(p.id, 'project.manage')
      )
      and public.dahlia_project_category_access(p.id)
    order by p.title;
end;
$function$;

revoke all on function public.dahlia_field_list_material_request_projects() from public, anon;
grant execute on function public.dahlia_field_list_material_request_projects() to authenticated;

create or replace function public.dahlia_field_submit_material_request(
  p_operation_id uuid,
  p_project_id uuid,
  p_required_date date,
  p_priority text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_cached dahlia_private.field_operations;
  v_request public.field_material_requests;
  v_result jsonb;
  v_line record;
  v_order integer := 0;
  v_project_status text;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if p_operation_id is null or p_project_id is null or p_required_date is null then
    raise exception 'Proyek, tanggal kebutuhan, dan ID operasi wajib diisi.' using errcode = '22023';
  end if;
  if not dahlia_private.field_user_is_internal() then
    raise exception 'Permintaan material hanya tersedia untuk akun internal.' using errcode = '42501';
  end if;
  if p_required_date < current_date then
    raise exception 'Tanggal kebutuhan tidak boleh berada di masa lalu.' using errcode = '22023';
  end if;
  if coalesce(p_priority, 'normal') not in ('normal', 'urgent') then
    raise exception 'Prioritas permintaan tidak valid.' using errcode = '22023';
  end if;
  if not (
    public.dahlia_has_project_execution_permission(p_project_id, 'procurement.request.create')
    or public.dahlia_has_project_execution_permission(p_project_id, 'project.manage')
  ) or not public.dahlia_project_category_access(p_project_id) then
    raise exception 'Akun tidak memiliki izin mengajukan kebutuhan material pada proyek ini.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Permintaan harus berisi 1 sampai 50 baris material.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      material_id uuid, item_name text, unit text, quantity numeric, notes text
    )
    where nullif(trim(coalesce(x.item_name, '')), '') is null
       or nullif(trim(coalesce(x.unit, '')), '') is null
       or x.quantity is null or x.quantity <= 0
  ) then
    raise exception 'Nama material, satuan, dan jumlah positif wajib diisi pada setiap baris.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'project_id', p_project_id,
    'required_date', p_required_date,
    'priority', coalesce(p_priority, 'normal'),
    'notes', nullif(trim(coalesce(p_notes, '')), ''),
    'items', p_items
  );

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_operation_id::text));
  select * into v_cached
  from dahlia_private.field_operations o
  where o.user_id = auth.uid() and o.operation_id = p_operation_id;

  if found then
    if v_cached.action <> 'material_request' or v_cached.request_payload <> v_payload then
      raise exception 'ID operasi sudah digunakan untuk data yang berbeda.' using errcode = '22023';
    end if;
    return v_cached.result_payload;
  end if;

  -- Lock the project row until this transaction finishes so its lifecycle
  -- status cannot change between validation and requisition insertion.
  select p.status::text
    into v_project_status
  from public.projects p
  where p.id = p_project_id
  for share;

  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_project_status <> 'DIKERJAKAN' then
    raise exception
      'Permintaan material hanya dapat diajukan untuk proyek berstatus DIKERJAKAN. Status proyek saat ini: %',
      v_project_status
      using errcode = '23514';
  end if;

  insert into public.field_material_requests(
    project_id, required_date, priority, status, notes, created_by
  )
  values (
    p_project_id, p_required_date, coalesce(p_priority, 'normal'), 'submitted',
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning * into v_request;

  for v_line in
    select x.material_id, x.item_name, x.unit, x.quantity, x.notes
    from jsonb_to_recordset(p_items) as x(
      material_id uuid, item_name text, unit text, quantity numeric, notes text
    )
  loop
    insert into public.field_material_request_items(
      request_id, material_id, item_name, unit, quantity, notes, sort_order
    )
    values (
      v_request.id, v_line.material_id, trim(v_line.item_name), trim(v_line.unit),
      v_line.quantity, nullif(trim(coalesce(v_line.notes, '')), ''), v_order
    );
    v_order := v_order + 1;
  end loop;

  v_result := jsonb_build_object(
    'id', v_request.id,
    'request_number', v_request.request_number,
    'status', v_request.status,
    'message', 'Permintaan material berhasil diajukan. Purchasing akan meninjau dan menyiapkan PO terpisah.'
  );

  insert into dahlia_private.field_operations(user_id, operation_id, action, request_payload, result_payload)
  values (auth.uid(), p_operation_id, 'material_request', v_payload, v_result);

  return v_result;
end;
$function$;

revoke all on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) to authenticated;

-- A database trigger is the final guard for any insertion path, including
-- future RPCs or administrative scripts. Updates to the review status are not
-- blocked, and historical requisitions are not modified.
create or replace function dahlia_private.guard_field_material_request_active_project()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_project_status text;
begin
  select p.status::text
    into v_project_status
  from public.projects p
  where p.id = new.project_id
  for share;

  if not found then
    raise exception 'Proyek permintaan material tidak ditemukan.' using errcode = '23503';
  end if;

  if v_project_status <> 'DIKERJAKAN' then
    raise exception
      'Permintaan material hanya dapat ditautkan ke proyek berstatus DIKERJAKAN. Status proyek saat ini: %',
      v_project_status
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function dahlia_private.guard_field_material_request_active_project() from public, anon, authenticated;

drop trigger if exists field_material_requests_active_project_guard
  on public.field_material_requests;

create trigger field_material_requests_active_project_guard
before insert or update of project_id
on public.field_material_requests
for each row
execute function dahlia_private.guard_field_material_request_active_project();

comment on function public.dahlia_field_list_material_request_projects() is
  'Lists only DIKERJAKAN projects for internal Field material requisitions.';
comment on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) is
  'Submits idempotent field material requisitions only for DIKERJAKAN projects. A requisition is not a Purchase Order.';
