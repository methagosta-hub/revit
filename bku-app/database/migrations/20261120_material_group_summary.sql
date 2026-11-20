begin;

-- Kelompok dan alias material dimiliki oleh akun, sehingga dapat dipakai lintas proyek.
create table if not exists public.bku_material_groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists bku_material_groups_owner_name_uidx
  on public.bku_material_groups(created_by, lower(name));

create table if not exists public.bku_material_aliases (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.bku_material_groups(id) on delete cascade,
  material_name text not null check (length(trim(material_name)) > 0),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  constraint bku_material_aliases_owner_name_unique unique(created_by, normalized_name)
);

create index if not exists bku_material_aliases_group_idx
  on public.bku_material_aliases(created_by, group_id);

alter table public.bku_material_groups enable row level security;
alter table public.bku_material_aliases enable row level security;

drop policy if exists "BKU owners read material groups" on public.bku_material_groups;
create policy "BKU owners read material groups" on public.bku_material_groups
  for select to authenticated using (created_by = auth.uid());
drop policy if exists "BKU owners create material groups" on public.bku_material_groups;
create policy "BKU owners create material groups" on public.bku_material_groups
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "BKU owners update material groups" on public.bku_material_groups;
create policy "BKU owners update material groups" on public.bku_material_groups
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "BKU owners delete material groups" on public.bku_material_groups;
create policy "BKU owners delete material groups" on public.bku_material_groups
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "BKU owners read material aliases" on public.bku_material_aliases;
create policy "BKU owners read material aliases" on public.bku_material_aliases
  for select to authenticated using (
    created_by = auth.uid()
    and exists (
      select 1 from public.bku_material_groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );
drop policy if exists "BKU owners create material aliases" on public.bku_material_aliases;
create policy "BKU owners create material aliases" on public.bku_material_aliases
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.bku_material_groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );
drop policy if exists "BKU owners update material aliases" on public.bku_material_aliases;
create policy "BKU owners update material aliases" on public.bku_material_aliases
  for update to authenticated using (created_by = auth.uid()) with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.bku_material_groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );
drop policy if exists "BKU owners delete material aliases" on public.bku_material_aliases;
create policy "BKU owners delete material aliases" on public.bku_material_aliases
  for delete to authenticated using (created_by = auth.uid());

grant select, insert, update, delete on public.bku_material_groups to authenticated;
grant select, insert, update, delete on public.bku_material_aliases to authenticated;

-- Membuat kelompok standar untuk akun baru maupun akun yang sudah memiliki transaksi lama.
create or replace function public.bku_ensure_material_group_defaults()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group record;
  v_alias record;
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sesi pengguna tidak tersedia.';
  end if;

  for v_group in
    select unnest(array[
      'Semen',
      'Pasir',
      'Batu & Agregat',
      'Besi & Baja',
      'Bata & Dinding',
      'Kayu',
      'Pipa & Plumbing',
      'Keramik & Granit',
      'Cat & Finishing',
      'Atap',
      'Plafon',
      'Instalasi Listrik',
      'Sanitary',
      'Waterproofing & Sealant'
    ]) as name
  loop
    insert into public.bku_material_groups(created_by, name)
    values (v_user_id, v_group.name)
    on conflict (created_by, lower(name)) do nothing;
  end loop;

  for v_alias in
    select * from (values
      ('Semen','Semen'),
      ('Semen','Semen Portland'),
      ('Semen','Semen Dynamix'),
      ('Semen','Semen Tiga Roda'),
      ('Semen','Semen Merah Putih'),
      ('Semen','Semen Padang'),
      ('Pasir','Pasir'),
      ('Pasir','Pasir Urug'),
      ('Pasir','Pasir Cor'),
      ('Pasir','Pasir Beton'),
      ('Pasir','Pasir Galunggung'),
      ('Pasir','Pasir Pasang'),
      ('Batu & Agregat','Batu Split'),
      ('Batu & Agregat','Batu Belah'),
      ('Batu & Agregat','Batu Kali'),
      ('Batu & Agregat','Kerikil'),
      ('Batu & Agregat','Koral'),
      ('Besi & Baja','Besi Beton'),
      ('Besi & Baja','Wiremesh'),
      ('Besi & Baja','Besi Hollow'),
      ('Bata & Dinding','Bata Merah'),
      ('Bata & Dinding','Bata Ringan'),
      ('Bata & Dinding','Hebel'),
      ('Bata & Dinding','Batako'),
      ('Kayu','Kayu'),
      ('Kayu','Papan'),
      ('Kayu','Balok Kayu'),
      ('Pipa & Plumbing','Pipa PVC'),
      ('Pipa & Plumbing','Pipa AW'),
      ('Pipa & Plumbing','Pipa D'),
      ('Pipa & Plumbing','Knee PVC'),
      ('Keramik & Granit','Keramik'),
      ('Keramik & Granit','Granit'),
      ('Keramik & Granit','Homogeneous Tile'),
      ('Cat & Finishing','Cat'),
      ('Cat & Finishing','Plamir'),
      ('Cat & Finishing','Thinner'),
      ('Atap','Atap Spandek'),
      ('Atap','Atap Galvalum'),
      ('Atap','Genteng'),
      ('Plafon','Gypsum Board'),
      ('Plafon','GRC Board'),
      ('Plafon','Panel Plafon PVC'),
      ('Instalasi Listrik','Kabel'),
      ('Instalasi Listrik','MCB'),
      ('Instalasi Listrik','Lampu LED'),
      ('Instalasi Listrik','Saklar'),
      ('Instalasi Listrik','Stop Kontak'),
      ('Sanitary','Kloset'),
      ('Sanitary','Wastafel'),
      ('Sanitary','Kran'),
      ('Sanitary','Shower'),
      ('Waterproofing & Sealant','Waterproofing'),
      ('Waterproofing & Sealant','Membrane Bakar'),
      ('Waterproofing & Sealant','Sealant'),
      ('Waterproofing & Sealant','Waterstop')
    ) as seed(group_name, material_name)
  loop
    select g.id into v_group_id
    from public.bku_material_groups g
    where g.created_by = v_user_id and lower(g.name) = lower(v_alias.group_name)
    limit 1;

    insert into public.bku_material_aliases(created_by, group_id, material_name, normalized_name)
    values (
      v_user_id,
      v_group_id,
      v_alias.material_name,
      lower(regexp_replace(btrim(v_alias.material_name), '\s+', ' ', 'g'))
    )
    on conflict (created_by, normalized_name) do nothing;
  end loop;
end;
$$;

revoke all on function public.bku_ensure_material_group_defaults() from public;
grant execute on function public.bku_ensure_material_group_defaults() to authenticated;

-- Alias yang dikonfirmasi pengguna berlaku otomatis pada rekap selanjutnya.
create or replace function public.bku_map_material_alias(
  p_group_id uuid,
  p_material_name text
)
returns public.bku_material_aliases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.bku_material_aliases;
  v_normalized text;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak tersedia.';
  end if;

  if nullif(btrim(coalesce(p_material_name, '')), '') is null then
    raise exception 'Nama material wajib diisi.';
  end if;

  if not exists (
    select 1 from public.bku_material_groups g
    where g.id = p_group_id and g.created_by = auth.uid() and g.is_active = true
  ) then
    raise exception 'Kelompok material tidak ditemukan atau tidak aktif.';
  end if;

  v_normalized := lower(regexp_replace(btrim(p_material_name), '\s+', ' ', 'g'));

  insert into public.bku_material_aliases(created_by, group_id, material_name, normalized_name)
  values (auth.uid(), p_group_id, btrim(p_material_name), v_normalized)
  on conflict (created_by, normalized_name)
  do update set group_id = excluded.group_id, material_name = excluded.material_name
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.bku_map_material_alias(uuid, text) from public;
grant execute on function public.bku_map_material_alias(uuid, text) to authenticated;

commit;
