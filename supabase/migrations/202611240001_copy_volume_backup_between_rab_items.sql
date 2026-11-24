-- Copy an entire volume-backup set into another AHSP target in one transaction.
-- The destination can be a root AHSP row or a nested sub-item path.

create or replace function public.dahlia_volume_backup_update_subitems(
  p_items jsonb,
  p_path text[],
  p_total_volume numeric,
  p_detail_count integer,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_next_entry jsonb;
  v_nested jsonb;
  v_items jsonb := '[]'::jsonb;
  v_found boolean := false;
  v_delta numeric := 0;
  v_original_coefficient numeric := 0;
  v_old_coefficient numeric;
  v_current_unit_price numeric;
  v_next_unit_price numeric;
begin
  if coalesce(array_length(p_path, 1), 0) = 0 then
    return jsonb_build_object('items', coalesce(p_items, '[]'::jsonb), 'found', false, 'delta', 0, 'original_coefficient', 0);
  end if;

  for v_entry in
    select value
      from jsonb_array_elements(
        case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
      )
  loop
    v_next_entry := v_entry;

    if not v_found and v_entry->>'masterAhspId' = p_path[1] then
      v_old_coefficient := coalesce(nullif(v_entry->>'coefficient', '')::numeric, 0);
      v_current_unit_price := coalesce(nullif(v_entry->>'unit_price', '')::numeric, 0);

      if array_length(p_path, 1) = 1 then
        v_original_coefficient := coalesce(
          nullif(v_entry #>> '{volume_backup,original_coefficient}', '')::numeric,
          v_old_coefficient
        );

        v_next_entry := jsonb_set(v_next_entry, '{coefficient}', to_jsonb(p_total_volume), true);
        v_next_entry := jsonb_set(v_next_entry, '{line_total}', to_jsonb(round(p_total_volume * v_current_unit_price, 2)), true);
        v_next_entry := jsonb_set(
          v_next_entry,
          '{volume_backup}',
          jsonb_build_object(
            'original_coefficient', v_original_coefficient,
            'total_volume', p_total_volume,
            'details_count', p_detail_count,
            'updated_at', p_updated_at
          ),
          true
        );
        v_delta := (p_total_volume - v_old_coefficient) * v_current_unit_price;
        v_found := true;
      else
        v_nested := public.dahlia_volume_backup_update_subitems(
          v_entry->'subitems',
          p_path[2:array_length(p_path, 1)],
          p_total_volume,
          p_detail_count,
          p_updated_at
        );

        if coalesce((v_nested->>'found')::boolean, false) then
          v_next_unit_price := round(
            v_current_unit_price + coalesce((v_nested->>'delta')::numeric, 0),
            2
          );
          v_next_entry := jsonb_set(v_next_entry, '{subitems}', v_nested->'items', true);
          v_next_entry := jsonb_set(v_next_entry, '{unit_price}', to_jsonb(v_next_unit_price), true);
          v_next_entry := jsonb_set(
            v_next_entry,
            '{line_total}',
            to_jsonb(round(v_old_coefficient * v_next_unit_price, 2)),
            true
          );
          v_delta := v_old_coefficient * coalesce((v_nested->>'delta')::numeric, 0);
          v_original_coefficient := coalesce((v_nested->>'original_coefficient')::numeric, 0);
          v_found := true;
        end if;
      end if;
    end if;

    v_items := v_items || jsonb_build_array(v_next_entry);
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'found', v_found,
    'delta', v_delta,
    'original_coefficient', v_original_coefficient
  );
end;
$$;

revoke all on function public.dahlia_volume_backup_update_subitems(jsonb, text[], numeric, integer, timestamptz) from public, anon;

create or replace function public.copy_volume_backup_between_rab_items(
  p_source_rab_item_id uuid,
  p_source_subitem_path text,
  p_target_rab_item_id uuid,
  p_target_subitem_path text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_item public.rab_items;
  v_target_item public.rab_items;
  v_source_project_id uuid;
  v_target_project_id uuid;
  v_source_status text;
  v_target_status text;
  v_source_path text := nullif(trim(coalesce(p_source_subitem_path, '')), '');
  v_target_path text := nullif(trim(coalesce(p_target_subitem_path, '')), '');
  v_source_count integer := 0;
  v_existing_count integer := 0;
  v_copied_count integer := 0;
  v_target_count integer := 0;
  v_total_volume numeric := 0;
  v_next_unit_price numeric := 0;
  v_project_total numeric := 0;
  v_subitem_result jsonb;
  v_path_parts text[];
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak ditemukan.' using errcode = '42501';
  end if;

  if p_source_rab_item_id is null or p_target_rab_item_id is null then
    raise exception 'AHSP sumber dan tujuan wajib dipilih.' using errcode = '22023';
  end if;

  if lower(trim(coalesce(p_mode, ''))) not in ('replace', 'append') then
    raise exception 'Pilih perlakuan Ganti atau Tambahkan sebelum menyalin.' using errcode = '22023';
  end if;

  if p_source_rab_item_id = p_target_rab_item_id
     and v_source_path is not distinct from v_target_path then
    raise exception 'Sumber dan tujuan tidak boleh merupakan backup yang sama.' using errcode = '22023';
  end if;

  -- Lock both AHSP rows in a stable order to serialize writes to the destination
  -- and avoid concurrent copies producing an inconsistent calculated total.
  perform 1
    from public.rab_items
   where id in (p_source_rab_item_id, p_target_rab_item_id)
   order by id
   for update;

  select * into v_source_item
    from public.rab_items
   where id = p_source_rab_item_id;
  if not found then
    raise exception 'AHSP sumber tidak ditemukan atau tidak dapat diakses.' using errcode = 'P0002';
  end if;

  select * into v_target_item
    from public.rab_items
   where id = p_target_rab_item_id;
  if not found then
    raise exception 'AHSP tujuan tidak ditemukan atau tidak dapat diakses.' using errcode = 'P0002';
  end if;

  select project_id into v_source_project_id
    from public.rab_divisions
   where id = v_source_item.division_id;
  select project_id into v_target_project_id
    from public.rab_divisions
   where id = v_target_item.division_id;

  if v_source_project_id is null or v_target_project_id is null then
    raise exception 'Proyek AHSP sumber atau tujuan tidak ditemukan.' using errcode = '23503';
  end if;

  if not public.dahlia_project_category_access(v_source_project_id)
     or not (
       public.dahlia_has_project_execution_permission(v_source_project_id, 'project.read')
       or public.dahlia_has_project_execution_permission(v_source_project_id, 'rab.manage')
       or public.dahlia_has_project_execution_permission(v_source_project_id, 'project.manage')
     ) then
    raise exception 'Akun tidak memiliki akses membaca backup AHSP sumber.' using errcode = '42501';
  end if;

  if not public.dahlia_project_write_access()
     or not public.dahlia_project_category_access(v_target_project_id)
     or not (
       public.dahlia_has_project_execution_permission(v_target_project_id, 'rab.manage')
       or public.dahlia_has_project_execution_permission(v_target_project_id, 'project.manage')
     ) then
    raise exception 'Akun tidak memiliki izin mengubah RAB pada proyek tujuan.' using errcode = '42501';
  end if;

  select status into v_source_status from public.projects where id = v_source_project_id;
  select status into v_target_status from public.projects where id = v_target_project_id;

  if upper(coalesce(v_target_status, '')) not in ('DRAFT', 'REVIEW') then
    raise exception 'RAB tujuan terkunci pada status %. Kembalikan proyek ke DRAFT atau REVIEW untuk menerima salinan.', coalesce(v_target_status, 'TIDAK DIKETAHUI') using errcode = '23514';
  end if;

  if v_source_path is not null and (
    jsonb_typeof(v_source_item.subitems_snapshot) is distinct from 'array'
  ) then
    raise exception 'Snapshot sub-item sumber tidak tersedia.' using errcode = '22023';
  end if;
  if v_target_path is not null and (
    jsonb_typeof(v_target_item.subitems_snapshot) is distinct from 'array'
  ) then
    raise exception 'Snapshot sub-item tujuan tidak tersedia.' using errcode = '22023';
  end if;

  if v_source_path is null then
    select count(*) into v_source_count
      from public.volume_details
     where rab_item_id = p_source_rab_item_id
       and subitem_path is null;
  else
    select count(*) into v_source_count
      from public.volume_details
     where rab_item_id = p_source_rab_item_id
       and subitem_path = v_source_path;
  end if;

  if v_source_count = 0 then
    raise exception 'Backup volume sumber belum memiliki rincian untuk disalin.' using errcode = '22023';
  end if;

  if v_target_path is null then
    select count(*) into v_existing_count
      from public.volume_details
     where rab_item_id = p_target_rab_item_id
       and subitem_path is null;
  else
    select count(*) into v_existing_count
      from public.volume_details
     where rab_item_id = p_target_rab_item_id
       and subitem_path = v_target_path;
  end if;

  if lower(trim(p_mode)) = 'replace' then
    if v_target_path is null then
      delete from public.volume_details
       where rab_item_id = p_target_rab_item_id
         and subitem_path is null;
    else
      delete from public.volume_details
       where rab_item_id = p_target_rab_item_id
         and subitem_path = v_target_path;
    end if;
  end if;

  if v_source_path is null then
    insert into public.volume_details (
      rab_item_id, subitem_path, description, drawing_ref,
      multiplier, calc_mode, parameters, subtotal, created_at
    )
    select
      p_target_rab_item_id, v_target_path, description, drawing_ref,
      multiplier, calc_mode, parameters, subtotal,
      clock_timestamp() + ((row_number() over (order by created_at, id) - 1) * interval '1 millisecond')
      from public.volume_details
     where rab_item_id = p_source_rab_item_id
       and subitem_path is null
     order by created_at, id;
  else
    insert into public.volume_details (
      rab_item_id, subitem_path, description, drawing_ref,
      multiplier, calc_mode, parameters, subtotal, created_at
    )
    select
      p_target_rab_item_id, v_target_path, description, drawing_ref,
      multiplier, calc_mode, parameters, subtotal,
      clock_timestamp() + ((row_number() over (order by created_at, id) - 1) * interval '1 millisecond')
      from public.volume_details
     where rab_item_id = p_source_rab_item_id
       and subitem_path = v_source_path
     order by created_at, id;
  end if;

  get diagnostics v_copied_count = row_count;

  if v_copied_count <> v_source_count then
    raise exception 'Jumlah rincian yang tersalin tidak sesuai. Transaksi dibatalkan.' using errcode = '40001';
  end if;

  if v_target_path is null then
    select count(*), coalesce(sum(subtotal), 0)
      into v_target_count, v_total_volume
      from public.volume_details
     where rab_item_id = p_target_rab_item_id
       and subitem_path is null;

    update public.rab_items
       set volume = v_total_volume,
           total_price = round(v_total_volume * coalesce(v_target_item.unit_price, 0), 2),
           is_volume_from_backup = true
     where id = p_target_rab_item_id;
  else
    select count(*), coalesce(sum(subtotal), 0)
      into v_target_count, v_total_volume
      from public.volume_details
     where rab_item_id = p_target_rab_item_id
       and subitem_path = v_target_path;

    v_path_parts := string_to_array(v_target_path, '/');
    if coalesce(array_length(v_path_parts, 1), 0) = 0
       or exists (select 1 from unnest(v_path_parts) part where trim(part) = '') then
      raise exception 'Jalur sub-item tujuan tidak valid.' using errcode = '22023';
    end if;

    v_subitem_result := public.dahlia_volume_backup_update_subitems(
      v_target_item.subitems_snapshot,
      v_path_parts,
      v_total_volume,
      v_target_count,
      now()
    );

    if not coalesce((v_subitem_result->>'found')::boolean, false) then
      raise exception 'Sub-item tujuan tidak ditemukan pada snapshot AHSP.' using errcode = '22023';
    end if;

    v_next_unit_price := round(
      coalesce(v_target_item.unit_price, 0) + coalesce((v_subitem_result->>'delta')::numeric, 0),
      2
    );

    update public.rab_items
       set subitems_snapshot = v_subitem_result->'items',
           unit_price = v_next_unit_price,
           total_price = round(coalesce(v_target_item.volume, 0) * v_next_unit_price, 2)
     where id = p_target_rab_item_id;
  end if;

  select round(coalesce(sum(ri.total_price), 0), 2)
    into v_project_total
    from public.rab_divisions d
    join public.rab_items ri on ri.division_id = d.id
   where d.project_id = v_target_project_id;

  update public.projects
     set total_value = v_project_total,
         updated_at = now()
   where id = v_target_project_id;

  return jsonb_build_object(
    'copied_count', v_copied_count,
    'destination_existing_count', v_existing_count,
    'destination_total_count', v_target_count,
    'total_volume', v_total_volume,
    'project_total', v_project_total,
    'target_is_subitem', v_target_path is not null
  );
end;
$$;

revoke all on function public.copy_volume_backup_between_rab_items(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.copy_volume_backup_between_rab_items(uuid, text, uuid, text, text) to authenticated;
