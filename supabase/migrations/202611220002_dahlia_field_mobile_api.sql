-- Dahlia Field RPC API.
-- Public functions are the only client entry points; tables remain non-readable directly.
-- All writes are idempotent per authenticated user + operation UUID.

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

create or replace function public.dahlia_field_list_attendance_roster(
  p_project_id uuid,
  p_attendance_date date
)
returns table (
  employee_id uuid,
  employee_number text,
  full_name text,
  preferred_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_internal() then
    raise exception 'Fitur absensi hanya tersedia untuk akun internal yang sudah ditautkan.' using errcode = '42501';
  end if;
  if p_project_id is null or p_attendance_date is null then
    raise exception 'Proyek dan tanggal absensi wajib dipilih.' using errcode = '22023';
  end if;
  if not (
    public.dahlia_can_record_attendance_project(p_project_id)
    or public.dahlia_has_company_permission('attendance.manage')
  ) then
    raise exception 'Akun tidak memiliki izin mencatat absensi pada proyek ini.' using errcode = '42501';
  end if;
  if not public.dahlia_project_category_access(p_project_id) then
    raise exception 'Proyek tidak tersedia untuk akun ini.' using errcode = '42501';
  end if;

  return query
    select e.id, e.employee_number::text, e.full_name::text, e.preferred_name::text
    from public.employees e
    where e.status = 'active'
      and public.dahlia_employee_assigned_to_project(e.id, p_project_id, p_attendance_date)
    order by e.full_name;
end;
$function$;

create or replace function public.dahlia_field_submit_attendance(
  p_operation_id uuid,
  p_employee_id uuid,
  p_project_id uuid,
  p_attendance_date date,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_cached dahlia_private.field_operations;
  v_row public.attendance_records;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if p_operation_id is null or p_employee_id is null or p_project_id is null or p_attendance_date is null or p_check_in_at is null then
    raise exception 'Data absensi belum lengkap.' using errcode = '22023';
  end if;
  if not dahlia_private.field_user_is_internal() then
    raise exception 'Akun ini bukan akun internal Dahlia Field.' using errcode = '42501';
  end if;
  if p_attendance_date > current_date then
    raise exception 'Tanggal absensi tidak boleh berada di masa mendatang.' using errcode = '22023';
  end if;
  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'Jam pulang tidak boleh lebih awal daripada jam masuk.' using errcode = '22023';
  end if;
  if not (
    public.dahlia_can_record_attendance_project(p_project_id)
    or public.dahlia_has_company_permission('attendance.manage')
  ) then
    raise exception 'Akun tidak memiliki izin mencatat absensi pada proyek ini.' using errcode = '42501';
  end if;
  if not public.dahlia_project_category_access(p_project_id)
     or not public.dahlia_employee_assigned_to_project(p_employee_id, p_project_id, p_attendance_date) then
    raise exception 'Karyawan tidak ditugaskan pada proyek tersebut atau proyek tidak dapat diakses.' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'employee_id', p_employee_id,
    'project_id', p_project_id,
    'attendance_date', p_attendance_date,
    'check_in_at', p_check_in_at,
    'check_out_at', p_check_out_at,
    'notes', nullif(trim(coalesce(p_notes, '')), '')
  );

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_operation_id::text));
  select * into v_cached
  from dahlia_private.field_operations o
  where o.user_id = auth.uid() and o.operation_id = p_operation_id;

  if found then
    if v_cached.action <> 'attendance' or v_cached.request_payload <> v_payload then
      raise exception 'ID operasi sudah digunakan untuk data yang berbeda.' using errcode = '22023';
    end if;
    return v_cached.result_payload;
  end if;

  select * into v_row
  from public.attendance_records ar
  where ar.employee_id = p_employee_id and ar.attendance_date = p_attendance_date;

  if found then
    v_result := jsonb_build_object(
      'duplicate', true,
      'message', 'Absensi karyawan pada tanggal ini sudah tercatat.',
      'id', v_row.id,
      'attendance_number', v_row.attendance_number
    );
  else
    insert into public.attendance_records (
      employee_id, attendance_date, attendance_status, approval_status,
      check_in_at, check_out_at, break_minutes, record_source,
      record_origin_project_id, notes
    )
    values (
      p_employee_id, p_attendance_date, 'present', 'submitted',
      p_check_in_at, p_check_out_at, 0, 'flutter',
      p_project_id, nullif(trim(coalesce(p_notes, '')), '')
    )
    returning * into v_row;

    v_result := jsonb_build_object(
      'duplicate', false,
      'message', 'Absensi berhasil diajukan untuk verifikasi Personalia.',
      'id', v_row.id,
      'attendance_number', v_row.attendance_number,
      'approval_status', v_row.approval_status,
      'record_source', v_row.record_source
    );
  end if;

  insert into dahlia_private.field_operations(user_id, operation_id, action, request_payload, result_payload)
  values (auth.uid(), p_operation_id, 'attendance', v_payload, v_result);

  return v_result;
end;
$function$;

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

create or replace function public.dahlia_field_list_material_requests(p_project_id uuid default null)
returns table (
  request_id uuid,
  request_number text,
  project_id uuid,
  project_title text,
  request_date date,
  required_date date,
  priority text,
  status text,
  notes text,
  item_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_internal() then
    raise exception 'Riwayat permintaan material hanya tersedia untuk akun internal.' using errcode = '42501';
  end if;

  return query
    select r.id, r.request_number, r.project_id, p.title::text,
           r.request_date, r.required_date, r.priority, r.status, r.notes,
           count(i.id), r.created_at
    from public.field_material_requests r
    join public.projects p on p.id = r.project_id
    left join public.field_material_request_items i on i.request_id = r.id
    where r.created_by = auth.uid()
      and (p_project_id is null or r.project_id = p_project_id)
      and public.dahlia_project_category_access(r.project_id)
    group by r.id, p.id, p.title
    order by r.created_at desc;
end;
$function$;

create or replace function public.dahlia_field_list_my_segments()
returns table (
  segment_id uuid,
  segment_number text,
  segment_title text,
  execution_method text,
  segment_status text,
  project_id uuid,
  project_title text,
  package_id uuid,
  package_name text,
  unit_rate numeric,
  agreed_amount numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_subcontractor() then
    raise exception 'Daftar kontrak hanya tersedia untuk akun subkontraktor yang ditautkan.' using errcode = '42501';
  end if;

  return query
    select es.id, es.segment_number::text, es.segment_title::text,
           es.execution_method::text, es.status::text,
           p.id, p.title::text, wp.id, wp.package_name::text,
           es.unit_rate, es.agreed_amount
    from public.execution_segments es
    join public.project_work_packages wp on wp.id = es.package_id
    join public.projects p on p.id = wp.project_id
    where es.executor_type = 'subcontractor'
      and es.subcontractor_id = dahlia_private.field_user_subcontractor_id()
      and es.status in ('active', 'closed')
      and public.dahlia_project_category_access(p.id)
    order by p.title, wp.package_name, es.segment_number;
end;
$function$;

create or replace function public.dahlia_field_list_segment_items(p_segment_id uuid)
returns table (
  segment_item_id uuid,
  segment_id uuid,
  segment_number text,
  segment_title text,
  project_id uuid,
  project_title text,
  item_name text,
  unit text,
  allocated_quantity numeric,
  unit_rate numeric,
  execution_method text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_project_id uuid;
  v_subcontractor_access boolean := false;
begin
  if auth.uid() is null or p_segment_id is null then
    raise exception 'Sesi atau segmen pekerjaan tidak ditemukan.' using errcode = '22023';
  end if;

  select wp.project_id, es.executor_type = 'subcontractor'
    into v_project_id, v_subcontractor_access
  from public.execution_segments es
  join public.project_work_packages wp on wp.id = es.package_id
  where es.id = p_segment_id;

  if v_project_id is null then
    raise exception 'Segmen pekerjaan tidak ditemukan.' using errcode = '23503';
  end if;

  if dahlia_private.field_user_is_subcontractor() then
    if not dahlia_private.field_user_can_access_subcontract_segment(p_segment_id) then
      raise exception 'Segmen bukan milik akun subkontraktor ini.' using errcode = '42501';
    end if;
  elsif dahlia_private.field_user_is_internal() then
    if not (
      public.dahlia_has_project_execution_permission(v_project_id, 'execution.read')
      or public.dahlia_has_project_execution_permission(v_project_id, 'execution.report.create')
      or public.dahlia_has_project_execution_permission(v_project_id, 'project.manage')
    ) then
      raise exception 'Akun tidak memiliki akses pelaksanaan pada proyek ini.' using errcode = '42501';
    end if;
  else
    raise exception 'Akun belum ditautkan ke Dahlia Field.' using errcode = '42501';
  end if;

  if not public.dahlia_project_category_access(v_project_id) then
    raise exception 'Proyek tidak tersedia untuk akun ini.' using errcode = '42501';
  end if;

  return query
    select si.id, es.id, es.segment_number::text, es.segment_title::text,
           p.id, p.title::text, wpi.item_name::text, wpi.unit::text,
           si.allocated_quantity, es.unit_rate, es.execution_method::text
    from public.execution_segment_items si
    join public.execution_segments es on es.id = si.segment_id
    join public.project_work_packages wp on wp.id = es.package_id
    join public.projects p on p.id = wp.project_id
    join public.project_work_package_items wpi on wpi.id = si.package_item_id
    where si.segment_id = p_segment_id
    order by wpi.sort_order, wpi.item_name;
end;
$function$;

create or replace function public.dahlia_field_submit_progress(
  p_operation_id uuid,
  p_segment_item_id uuid,
  p_report_date date,
  p_quantity numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_cached dahlia_private.field_operations;
  v_segment_id uuid;
  v_project_id uuid;
  v_executor_type text;
  v_row public.execution_progress_entries;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if p_operation_id is null or p_segment_item_id is null or p_report_date is null
     or p_quantity is null or p_quantity <= 0 then
    raise exception 'Tanggal, item pekerjaan, dan volume positif wajib diisi.' using errcode = '22023';
  end if;
  if p_report_date > current_date then
    raise exception 'Tanggal laporan progres tidak boleh berada di masa mendatang.' using errcode = '22023';
  end if;

  select si.segment_id, wp.project_id, es.executor_type
    into v_segment_id, v_project_id, v_executor_type
  from public.execution_segment_items si
  join public.execution_segments es on es.id = si.segment_id
  join public.project_work_packages wp on wp.id = es.package_id
  where si.id = p_segment_item_id;

  if v_segment_id is null then
    raise exception 'Item pekerjaan tidak ditemukan.' using errcode = '23503';
  end if;

  if dahlia_private.field_user_is_subcontractor() then
    if v_executor_type <> 'subcontractor'
       or not dahlia_private.field_user_can_access_subcontract_segment(v_segment_id) then
      raise exception 'Akun hanya dapat melaporkan progres pada segmen kontraknya sendiri.' using errcode = '42501';
    end if;
  elsif dahlia_private.field_user_is_internal() then
    if not (
      public.dahlia_has_project_execution_permission(v_project_id, 'execution.report.create')
      or public.dahlia_has_project_execution_permission(v_project_id, 'project.manage')
    ) then
      raise exception 'Akun tidak memiliki izin mengajukan progres pada proyek ini.' using errcode = '42501';
    end if;
  else
    raise exception 'Akun belum ditautkan ke Dahlia Field.' using errcode = '42501';
  end if;

  if not public.dahlia_project_category_access(v_project_id) then
    raise exception 'Proyek tidak tersedia untuk akun ini.' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'segment_item_id', p_segment_item_id,
    'report_date', p_report_date,
    'quantity', p_quantity,
    'notes', nullif(trim(coalesce(p_notes, '')), '')
  );

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_operation_id::text));
  select * into v_cached
  from dahlia_private.field_operations o
  where o.user_id = auth.uid() and o.operation_id = p_operation_id;

  if found then
    if v_cached.action <> 'progress' or v_cached.request_payload <> v_payload then
      raise exception 'ID operasi sudah digunakan untuk data yang berbeda.' using errcode = '22023';
    end if;
    return v_cached.result_payload;
  end if;

  insert into public.execution_progress_entries(
    segment_item_id, report_date, quantity_submitted, status, notes, submitted_by
  )
  values (
    p_segment_item_id, p_report_date, p_quantity, 'submitted',
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning * into v_row;

  v_result := jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'quantity_submitted', v_row.quantity_submitted,
    'message', 'Laporan progres berhasil diajukan untuk pemeriksaan.'
  );

  insert into dahlia_private.field_operations(user_id, operation_id, action, request_payload, result_payload)
  values (auth.uid(), p_operation_id, 'progress', v_payload, v_result);

  return v_result;
end;
$function$;

-- Restrict function access to signed-in application users. Private helpers and tables stay inaccessible.
revoke all on function public.dahlia_field_get_context() from public, anon;
revoke all on function public.dahlia_field_list_projects() from public, anon;
revoke all on function public.dahlia_field_list_attendance_roster(uuid, date) from public, anon;
revoke all on function public.dahlia_field_submit_attendance(uuid, uuid, uuid, date, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) from public, anon;
revoke all on function public.dahlia_field_list_material_requests(uuid) from public, anon;
revoke all on function public.dahlia_field_list_my_segments() from public, anon;
revoke all on function public.dahlia_field_list_segment_items(uuid) from public, anon;
revoke all on function public.dahlia_field_submit_progress(uuid, uuid, date, numeric, text) from public, anon;

grant execute on function public.dahlia_field_get_context() to authenticated;
grant execute on function public.dahlia_field_list_projects() to authenticated;
grant execute on function public.dahlia_field_list_attendance_roster(uuid, date) to authenticated;
grant execute on function public.dahlia_field_submit_attendance(uuid, uuid, uuid, date, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.dahlia_field_list_material_requests(uuid) to authenticated;
grant execute on function public.dahlia_field_list_my_segments() to authenticated;
grant execute on function public.dahlia_field_list_segment_items(uuid) to authenticated;
grant execute on function public.dahlia_field_submit_progress(uuid, uuid, date, numeric, text) to authenticated;

comment on function public.dahlia_field_submit_attendance(uuid, uuid, uuid, date, timestamptz, timestamptz, text) is
  'Idempotent attendance capture for Dahlia Field; records remain submitted and require Personalia verification.';
comment on function public.dahlia_field_submit_material_request(uuid, uuid, date, text, text, jsonb) is
  'Creates a field material requisition only. It does not create or approve an official Purchase Order.';
comment on function public.dahlia_field_submit_progress(uuid, uuid, date, numeric, text) is
  'Idempotent progress submission using existing execution progress validation triggers; it does not approve progress.';
