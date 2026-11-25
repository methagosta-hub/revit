-- Dahlia Field subcontractor read scopes and payment wrapper.
-- The existing payment calculation/locking/retention rules remain the source of truth.

create or replace function dahlia_private.field_user_can_bill_for_subcontractor(p_subcontractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
  select p_subcontractor_id is not null
     and p_subcontractor_id = dahlia_private.field_user_subcontractor_id()
     and dahlia_private.field_user_is_subcontractor();
$function$;

revoke all on function dahlia_private.field_user_can_bill_for_subcontractor(uuid) from public, anon, authenticated;

-- Preserve every existing financial validation in this function. The only authorization
-- extension is a narrowly-scoped allowance for the user linked to this exact subcontractor.
create or replace function public.dahlia_submit_subcontract_payment_request_v2(
  p_segment_id uuid,
  p_term_id uuid,
  p_request_date date,
  p_gross_amount numeric,
  p_retention_amount numeric default 0,
  p_deduction_amount numeric default 0,
  p_notes text default null,
  p_progress_lines jsonb default '[]'::jsonb
)
returns public.subcontract_payment_requests
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, pg_temp
as $function$
declare
  v_segment public.execution_segments;
  v_package public.project_work_packages;
  v_contract public.execution_contract_register;
  v_term public.subcontract_payment_terms;
  v_row public.subcontract_payment_requests;
  v_line record;
  v_gross numeric(18,2) := 0;
  v_claimed numeric(18,2) := 0;
  v_available numeric(18,2) := 0;
  v_count integer := 0;
  v_request_date date := coalesce(p_request_date,current_date);
begin
  if auth.uid() is null then raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000'; end if;
  select * into v_segment from public.execution_segments where id = p_segment_id for update;
  if v_segment.id is null or v_segment.executor_type <> 'subcontractor' then raise exception 'Segmen subkontraktor tidak ditemukan.' using errcode = 'P0002'; end if;
  if v_segment.status not in ('active','closed') then raise exception 'Tagihan hanya dapat diajukan pada segmen aktif atau segmen yang sudah ditutup.' using errcode = '23514'; end if;
  select * into v_package from public.project_work_packages where id = v_segment.package_id;
  if not (
    public.dahlia_has_project_execution_permission(v_package.project_id,'project.manage')
    or public.dahlia_has_company_permission('execution.payment.manage')
    or public.dahlia_has_company_permission('payroll.manage')
    or (
      dahlia_private.field_user_can_bill_for_subcontractor(v_segment.subcontractor_id)
      and public.dahlia_project_category_access(v_package.project_id)
    )
  ) then
    raise exception 'Tidak memiliki izin mengajukan tagihan subkontraktor pada proyek ini.' using errcode = '42501';
  end if;
  select * into v_contract from public.execution_contract_register where segment_id = p_segment_id for update;
  if v_contract.id is null then raise exception 'Register kontrak subkontraktor tidak ditemukan.' using errcode = '23514'; end if;
  if v_request_date > current_date then raise exception 'Tanggal pengajuan tagihan tidak boleh di masa mendatang.' using errcode = '22023'; end if;

  if v_segment.execution_method = 'subcontract_unit' then
    if v_segment.unit_rate is null or v_segment.unit_rate <= 0 then
      raise exception 'Tarif kontrak harga satuan belum diisi atau tidak valid.' using errcode = '23514';
    end if;
    if exists (select 1 from public.subcontract_payment_requests old_req
                where old_req.segment_id = p_segment_id
                  and old_req.legacy_unlinked_progress = true
                  and old_req.legacy_reconciled_at is null
                  and old_req.status in ('submitted','approved')) then
      raise exception 'Segmen memiliki tagihan harga satuan historis tanpa rincian progres. Rekonsiliasi tagihan lama terlebih dahulu sebelum membuat tagihan baru.' using errcode = '23514';
    end if;
    if p_term_id is not null then raise exception 'Kontrak harga satuan tidak menggunakan termin tetap.' using errcode = '23514'; end if;
    if p_progress_lines is null or jsonb_typeof(p_progress_lines) <> 'array' then
      raise exception 'Rincian progres harus berbentuk daftar.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_progress_lines) = 0 then
      raise exception 'Pilih minimal satu progres yang sudah disetujui dan isi volume yang ditagihkan.' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_to_recordset(p_progress_lines) as x(progress_entry_id uuid, quantity numeric)) <>
       (select count(distinct progress_entry_id) from jsonb_to_recordset(p_progress_lines) as x(progress_entry_id uuid, quantity numeric)) then
      raise exception 'Progres yang sama tidak boleh dicantumkan dua kali dalam satu tagihan.' using errcode = '22023';
    end if;
    for v_line in
      select x.progress_entry_id, x.quantity
        from jsonb_to_recordset(p_progress_lines) as x(progress_entry_id uuid, quantity numeric)
       order by x.progress_entry_id
    loop
      if v_line.quantity is null or v_line.quantity <= 0 then raise exception 'Volume tagihan harus lebih besar dari nol.' using errcode = '22023'; end if;
      perform 1 from public.execution_progress_entries where id = v_line.progress_entry_id for update;
      if not exists (
        select 1 from public.execution_progress_entries pe
        join public.execution_segment_items si on si.id = pe.segment_item_id
        where pe.id = v_line.progress_entry_id and pe.status = 'approved' and si.segment_id = p_segment_id
      ) then raise exception 'Setiap progres harus berstatus disetujui dan berasal dari segmen kontrak yang dipilih.' using errcode = '23514'; end if;
      v_gross := v_gross + round(v_line.quantity * v_segment.unit_rate,2);
      v_count := v_count + 1;
    end loop;
    if v_gross <= 0 then raise exception 'Nilai tagihan hasil perhitungan tidak valid.' using errcode = '23514'; end if;
  elsif v_segment.execution_method in ('subcontract_lump_sum','subcontract_all_in') then
    if p_progress_lines is not null and jsonb_typeof(p_progress_lines) = 'array' and jsonb_array_length(p_progress_lines) > 0 then
      raise exception 'Kontrak lump sum/all-in menggunakan termin. Jangan mengirim rincian progres harga satuan.' using errcode = '23514';
    end if;
    if p_term_id is null then raise exception 'Pilih termin kontrak sebelum membuat tagihan.' using errcode = '22023'; end if;
    select * into v_term from public.subcontract_payment_terms
     where id = p_term_id and segment_id = p_segment_id and status = 'active' for update;
    if v_term.id is null then raise exception 'Termin tidak aktif atau bukan milik segmen kontrak yang dipilih.' using errcode = '23514'; end if;
    if p_gross_amount is null or p_gross_amount <= 0 then raise exception 'Nilai tagihan harus lebih besar dari nol.' using errcode = '22023'; end if;
    select coalesce(sum(gross_amount),0) into v_claimed
      from public.subcontract_payment_requests
     where term_id = p_term_id and status in ('submitted','approved');
    v_available := greatest(v_term.term_amount_snapshot - v_claimed,0);
    if p_gross_amount > v_available + 0.000001 then
      raise exception 'Tagihan melebihi sisa hak tagih termin. Batas tersedia saat ini: %', v_available using errcode = '23514';
    end if;
    v_gross := p_gross_amount;
  else
    raise exception 'Metode pelaksanaan ini bukan metode pembayaran subkontraktor.' using errcode = '23514';
  end if;

  if coalesce(p_retention_amount,0) < 0 or coalesce(p_deduction_amount,0) < 0 then raise exception 'Retensi dan potongan tidak boleh negatif.' using errcode = '22023'; end if;
  if coalesce(p_retention_amount,0) + coalesce(p_deduction_amount,0) >= v_gross then raise exception 'Retensi dan potongan harus lebih kecil dari nilai bruto.' using errcode = '23514'; end if;
  if coalesce(p_deduction_amount,0) > 0 and nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Catatan atau bukti dasar potongan wajib diisi.' using errcode = '22023'; end if;

  insert into public.subcontract_payment_requests(
    segment_id, term_id, request_date, gross_amount, retention_amount,
    deduction_amount, status, notes, submitted_by, submitted_at, legacy_unlinked_progress
  ) values (
    p_segment_id, p_term_id, v_request_date, v_gross, coalesce(p_retention_amount,0),
    coalesce(p_deduction_amount,0), 'submitted', nullif(trim(coalesce(p_notes,'')),''), auth.uid(), now(), false
  ) returning * into v_row;

  if v_segment.execution_method = 'subcontract_unit' then
    for v_line in
      select x.progress_entry_id, x.quantity
        from jsonb_to_recordset(p_progress_lines) as x(progress_entry_id uuid, quantity numeric)
       order by x.progress_entry_id
    loop
      insert into public.subcontract_payment_request_progress(request_id,progress_entry_id,quantity_claimed,unit_rate_snapshot,gross_amount)
      values (v_row.id,v_line.progress_entry_id,v_line.quantity,v_segment.unit_rate,round(v_line.quantity*v_segment.unit_rate,2));
    end loop;
    if abs((select coalesce(sum(gross_amount),0) from public.subcontract_payment_request_progress where request_id=v_row.id) - v_row.gross_amount) > 0.01 then
      raise exception 'Rincian progres tidak sama dengan total bruto tagihan.' using errcode = '23514';
    end if;
  end if;
  return v_row;
end;
$function$;

create or replace function public.dahlia_field_list_my_progress_claims(p_segment_id uuid)
returns table (
  progress_entry_id uuid,
  report_date date,
  quantity_approved numeric,
  segment_item_id uuid,
  segment_id uuid,
  segment_number text,
  unit_rate numeric,
  project_id uuid,
  project_title text,
  package_id uuid,
  package_name text,
  item_name text,
  unit text,
  claimed_quantity numeric,
  available_quantity numeric,
  available_value numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_can_access_subcontract_segment(p_segment_id) then
    raise exception 'Data progres klaim hanya dapat dilihat oleh subkontraktor pemilik segmen.' using errcode = '42501';
  end if;

  return query
    select v.progress_entry_id, v.report_date, v.quantity_approved,
           v.segment_item_id, v.segment_id, v.segment_number::text,
           v.unit_rate, v.project_id, v.project_title::text,
           v.package_id, v.package_name::text, v.item_name::text,
           v.unit::text, v.claimed_quantity, v.available_quantity, v.available_value
    from public.subcontract_unit_progress_available v
    where v.segment_id = p_segment_id
      and v.available_quantity > 0
    order by v.report_date, v.item_name;
end;
$function$;

create or replace function public.dahlia_field_list_my_terms(p_segment_id uuid)
returns table (
  term_id uuid,
  term_number text,
  segment_id uuid,
  term_name text,
  calculation_basis text,
  percentage numeric,
  fixed_amount numeric,
  term_amount_snapshot numeric,
  due_date date,
  trigger_description text,
  status text,
  available_to_claim numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_can_access_subcontract_segment(p_segment_id) then
    raise exception 'Data termin hanya dapat dilihat oleh subkontraktor pemilik segmen.' using errcode = '42501';
  end if;

  return query
    select t.term_id, t.term_number::text, t.segment_id, t.term_name::text,
           t.calculation_basis::text, t.percentage, t.fixed_amount,
           t.term_amount_snapshot, t.due_date, t.trigger_description::text,
           t.status::text, t.available_to_claim
    from public.subcontract_term_financial_summary t
    where t.segment_id = p_segment_id
      and t.status = 'active'
      and t.available_to_claim > 0
    order by t.term_number;
end;
$function$;

create or replace function public.dahlia_field_list_my_payment_requests(p_segment_id uuid default null)
returns table (
  request_id uuid,
  request_number text,
  segment_id uuid,
  segment_number text,
  segment_title text,
  project_title text,
  request_date date,
  gross_amount numeric,
  retention_amount numeric,
  deduction_amount numeric,
  net_amount numeric,
  status text,
  rejection_reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not dahlia_private.field_user_is_subcontractor() then
    raise exception 'Riwayat tagihan hanya tersedia untuk akun subkontraktor.' using errcode = '42501';
  end if;

  return query
    select r.id, r.request_number::text, es.id, es.segment_number::text,
           es.segment_title::text, p.title::text, r.request_date,
           r.gross_amount, r.retention_amount, r.deduction_amount, r.net_amount,
           r.status::text, r.rejection_reason::text
    from public.subcontract_payment_requests r
    join public.execution_segments es on es.id = r.segment_id
    join public.project_work_packages wp on wp.id = es.package_id
    join public.projects p on p.id = wp.project_id
    where es.subcontractor_id = dahlia_private.field_user_subcontractor_id()
      and es.executor_type = 'subcontractor'
      and (p_segment_id is null or es.id = p_segment_id)
      and public.dahlia_project_category_access(p.id)
    order by r.request_date desc, r.created_at desc;
end;
$function$;

create or replace function public.dahlia_field_submit_payment_request(
  p_operation_id uuid,
  p_segment_id uuid,
  p_term_id uuid,
  p_request_date date,
  p_gross_amount numeric,
  p_retention_amount numeric,
  p_deduction_amount numeric,
  p_notes text,
  p_progress_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_cached dahlia_private.field_operations;
  v_row public.subcontract_payment_requests;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if p_operation_id is null or p_segment_id is null then
    raise exception 'ID operasi dan segmen kontrak wajib diisi.' using errcode = '22023';
  end if;
  if not dahlia_private.field_user_can_access_subcontract_segment(p_segment_id) then
    raise exception 'Akun hanya dapat mengajukan tagihan untuk kontrak subkontraktor miliknya.' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'segment_id', p_segment_id,
    'term_id', p_term_id,
    'request_date', p_request_date,
    'gross_amount', p_gross_amount,
    'retention_amount', coalesce(p_retention_amount, 0),
    'deduction_amount', coalesce(p_deduction_amount, 0),
    'notes', nullif(trim(coalesce(p_notes, '')), ''),
    'progress_lines', coalesce(p_progress_lines, '[]'::jsonb)
  );

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_operation_id::text));
  select * into v_cached
  from dahlia_private.field_operations o
  where o.user_id = auth.uid() and o.operation_id = p_operation_id;

  if found then
    if v_cached.action <> 'payment_request' or v_cached.request_payload <> v_payload then
      raise exception 'ID operasi sudah digunakan untuk data yang berbeda.' using errcode = '22023';
    end if;
    return v_cached.result_payload;
  end if;

  v_row := public.dahlia_submit_subcontract_payment_request_v2(
    p_segment_id,
    p_term_id,
    coalesce(p_request_date, current_date),
    p_gross_amount,
    coalesce(p_retention_amount, 0),
    coalesce(p_deduction_amount, 0),
    p_notes,
    coalesce(p_progress_lines, '[]'::jsonb)
  );

  v_result := jsonb_build_object(
    'id', v_row.id,
    'request_number', v_row.request_number,
    'gross_amount', v_row.gross_amount,
    'retention_amount', v_row.retention_amount,
    'deduction_amount', v_row.deduction_amount,
    'net_amount', v_row.net_amount,
    'status', v_row.status,
    'message', 'Permintaan pembayaran berhasil diajukan untuk pemeriksaan. Pencairan tetap diproses oleh Finance.'
  );

  insert into dahlia_private.field_operations(user_id, operation_id, action, request_payload, result_payload)
  values (auth.uid(), p_operation_id, 'payment_request', v_payload, v_result);

  return v_result;
end;
$function$;

revoke all on function public.dahlia_submit_subcontract_payment_request_v2(uuid, uuid, date, numeric, numeric, numeric, text, jsonb) from public, anon;
revoke all on function public.dahlia_field_list_my_progress_claims(uuid) from public, anon;
revoke all on function public.dahlia_field_list_my_terms(uuid) from public, anon;
revoke all on function public.dahlia_field_list_my_payment_requests(uuid) from public, anon;
revoke all on function public.dahlia_field_submit_payment_request(uuid, uuid, uuid, date, numeric, numeric, numeric, text, jsonb) from public, anon;

grant execute on function public.dahlia_submit_subcontract_payment_request_v2(uuid, uuid, date, numeric, numeric, numeric, text, jsonb) to authenticated;
grant execute on function public.dahlia_field_list_my_progress_claims(uuid) to authenticated;
grant execute on function public.dahlia_field_list_my_terms(uuid) to authenticated;
grant execute on function public.dahlia_field_list_my_payment_requests(uuid) to authenticated;
grant execute on function public.dahlia_field_submit_payment_request(uuid, uuid, uuid, date, numeric, numeric, numeric, text, jsonb) to authenticated;

comment on function public.dahlia_field_submit_payment_request(uuid, uuid, uuid, date, numeric, numeric, numeric, text, jsonb) is
  'Idempotent, identity-scoped subcontractor payment claim; delegates all amount, approved-progress, term, retention and deduction validation to the existing v2 payment function.';
