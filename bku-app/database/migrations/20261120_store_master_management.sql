begin;

alter table public.bku_stores
  add column if not exists notes text not null default '',
  add column if not exists is_active boolean not null default true;

create index if not exists bku_stores_book_active_name_idx
  on public.bku_stores(book_id, is_active, name);

-- Hubungkan transaksi lama yang masih menyimpan nama toko saja.
update public.bku_transactions t
set store_id = s.id,
    store_name = s.name
from public.bku_stores s
where t.book_id = s.book_id
  and t.store_id is null
  and nullif(btrim(coalesce(t.store_name, '')), '') is not null
  and lower(btrim(t.store_name)) = lower(btrim(s.name));

-- Perubahan master dan nama pada seluruh transaksi terkait dilakukan atomik.
create or replace function public.bku_save_store(
  p_book_id uuid,
  p_name text,
  p_store_id uuid default null,
  p_address text default '',
  p_phone text default '',
  p_notes text default '',
  p_is_active boolean default true
)
returns public.bku_stores
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_store public.bku_stores;
  v_previous_name text;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak tersedia.';
  end if;

  if not exists (
    select 1 from public.bku_books b
    where b.id = p_book_id and b.created_by = auth.uid()
  ) then
    raise exception 'Buku kas tidak ditemukan atau akses ditolak.';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Nama toko wajib diisi.';
  end if;

  if p_store_id is null then
    insert into public.bku_stores(book_id, name, address, phone, notes, is_active, created_by)
    values (
      p_book_id,
      btrim(p_name),
      coalesce(btrim(p_address), ''),
      coalesce(btrim(p_phone), ''),
      coalesce(btrim(p_notes), ''),
      coalesce(p_is_active, true),
      auth.uid()
    )
    returning * into v_store;

    update public.bku_transactions t
    set store_id = v_store.id,
        store_name = v_store.name
    where t.book_id = p_book_id
      and t.store_id is null
      and lower(btrim(coalesce(t.store_name, ''))) = lower(btrim(v_store.name));
  else
    select * into v_store
    from public.bku_stores s
    where s.id = p_store_id and s.book_id = p_book_id
    for update;

    if not found then
      raise exception 'Data toko tidak ditemukan atau akses ditolak.';
    end if;

    v_previous_name := v_store.name;

    update public.bku_stores
    set name = btrim(p_name),
        address = coalesce(btrim(p_address), ''),
        phone = coalesce(btrim(p_phone), ''),
        notes = coalesce(btrim(p_notes), ''),
        is_active = coalesce(p_is_active, true)
    where id = p_store_id and book_id = p_book_id
    returning * into v_store;

    update public.bku_transactions t
    set store_id = v_store.id,
        store_name = v_store.name
    where t.book_id = p_book_id
      and (
        t.store_id = v_store.id
        or (
          t.store_id is null
          and lower(btrim(coalesce(t.store_name, ''))) = lower(btrim(v_previous_name))
        )
      );
  end if;

  return v_store;
exception
  when unique_violation then
    raise exception 'Nama toko sudah digunakan pada buku kas ini. Gunakan nama lain.';
end;
$$;

grant execute on function public.bku_save_store(uuid, text, uuid, text, text, text, boolean) to authenticated;

commit;
