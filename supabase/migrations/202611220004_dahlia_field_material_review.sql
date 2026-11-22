-- Dahlia Field material request review API for existing Purchasing users.
-- Review approval is a PR decision only; it never creates a Purchase Order.

create or replace function public.dahlia_field_list_material_requests_for_review(
  p_project_id uuid default null
)
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
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
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
    where (p_project_id is null or r.project_id = p_project_id)
      and public.dahlia_project_category_access(r.project_id)
      and (
        public.dahlia_has_company_permission('procurement.request.review')
        or public.dahlia_has_project_execution_permission(r.project_id, 'procurement.request.review')
        or public.dahlia_has_project_execution_permission(r.project_id, 'project.manage')
      )
    group by r.id, p.id, p.title, p.client
    order by
      case r.priority when 'urgent' then 0 else 1 end,
      r.created_at desc;
end;
$function$;

create or replace function public.dahlia_field_review_material_request(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dahlia_private, auth, pg_temp
as $function$
declare
  v_request public.field_material_requests;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '28000';
  end if;
  if p_request_id is null
     or p_decision not in ('under_review', 'approved', 'rejected') then
    raise exception 'Permintaan dan keputusan yang valid wajib dipilih.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and nullif(trim(coalesce(p_rejection_reason, '')), '') is null then
    raise exception 'Alasan penolakan wajib diisi.' using errcode = '22023';
  end if;

  select * into v_request
  from public.field_material_requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Permintaan material tidak ditemukan.' using errcode = 'P0002';
  end if;

  if not public.dahlia_project_category_access(v_request.project_id)
     or not (
       public.dahlia_has_company_permission('procurement.request.review')
       or public.dahlia_has_project_execution_permission(v_request.project_id, 'procurement.request.review')
       or public.dahlia_has_project_execution_permission(v_request.project_id, 'project.manage')
     ) then
    raise exception 'Akun tidak memiliki kewenangan meninjau permintaan pada proyek ini.' using errcode = '42501';
  end if;

  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'Permintaan sudah ditindaklanjuti dan tidak dapat ditinjau ulang dari antrean ini.' using errcode = '23514';
  end if;

  v_status := p_decision;
  update public.field_material_requests
  set status = v_status,
      rejection_reason = case
        when v_status = 'rejected' then trim(p_rejection_reason)
        else null
      end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return jsonb_build_object(
    'request_id', v_request.id,
    'request_number', v_request.request_number,
    'status', v_request.status,
    'message', case v_request.status
      when 'under_review' then 'Permintaan ditandai sedang ditinjau.'
      when 'approved' then 'Permintaan material disetujui untuk ditindaklanjuti Purchasing. PO tetap dibuat melalui menu Proses Purchasing.'
      else 'Permintaan material ditolak.'
    end
  );
end;
$function$;

revoke all on function public.dahlia_field_list_material_requests_for_review(uuid) from public, anon;
revoke all on function public.dahlia_field_review_material_request(uuid, text, text) from public, anon;

grant execute on function public.dahlia_field_list_material_requests_for_review(uuid) to authenticated;
grant execute on function public.dahlia_field_review_material_request(uuid, text, text) to authenticated;

comment on function public.dahlia_field_review_material_request(uuid, text, text) is
  'Allows existing procurement request reviewers to review a field requisition. Approval never creates an official Purchase Order.';
