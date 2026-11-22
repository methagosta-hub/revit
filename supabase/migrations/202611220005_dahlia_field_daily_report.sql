-- Dahlia Field: idempotent gateway for the existing daily-report workflow.
-- Additive migration. Review and apply to staging before any production rollout.

create or replace function public.dahlia_field_submit_daily_report(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_existing_action text;
  v_existing_request jsonb;
  v_existing_result jsonb;
  v_report_id uuid;
  v_project_id uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if not dahlia_private.field_user_is_internal() then
    raise exception 'Laporan harian hanya tersedia untuk akun tim internal.' using errcode = '42501';
  end if;
  if p_operation_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Identitas operasi dan payload laporan wajib diisi.' using errcode = '22023';
  end if;

  v_project_id := nullif(p_payload->>'project_id', '')::uuid;
  if v_project_id is null then
    raise exception 'Proyek laporan wajib dipilih.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext(p_operation_id::text));

  select action, request_payload, result_payload
    into v_existing_action, v_existing_request, v_existing_result
  from dahlia_private.field_operations
  where user_id = v_user and operation_id = p_operation_id;

  if found then
    if v_existing_action <> 'daily_report' or v_existing_request <> p_payload then
      raise exception 'ID operasi sudah digunakan untuk payload yang berbeda.' using errcode = '23505';
    end if;
    return v_existing_result || jsonb_build_object('duplicate', true);
  end if;

  v_report_id := public.dahlia_save_daily_report(
    nullif(p_payload->>'report_id', '')::uuid,
    v_project_id,
    nullif(p_payload->>'division_id', '')::uuid,
    nullif(p_payload->>'report_date', '')::date,
    coalesce(nullif(p_payload->>'weather', ''), 'clear'),
    coalesce(p_payload->>'field_condition', ''),
    coalesce(p_payload->>'work_summary', ''),
    nullif(p_payload->>'start_time', '')::time,
    nullif(p_payload->>'end_time', '')::time,
    coalesce(p_payload->>'obstacles', ''),
    coalesce(p_payload->>'follow_up', ''),
    coalesce((p_payload->>'submit')::boolean, false),
    coalesce(p_payload->'work_items', '[]'::jsonb),
    coalesce(p_payload->'labor', '[]'::jsonb),
    coalesce(p_payload->'materials', '[]'::jsonb),
    coalesce(p_payload->'equipment', '[]'::jsonb)
  );

  v_result := jsonb_build_object('report_id', v_report_id, 'duplicate', false);

  insert into dahlia_private.field_operations (
    user_id, operation_id, action, request_payload, result_payload
  ) values (
    v_user, p_operation_id, 'daily_report', p_payload, v_result
  );

  return v_result;
end;
$function$;

revoke all on function public.dahlia_field_submit_daily_report(uuid, jsonb) from public, anon;
grant execute on function public.dahlia_field_submit_daily_report(uuid, jsonb) to authenticated;
