begin;

-- Aktifkan pengelolaan master kategori melalui aplikasi.
-- Tabel tetap hanya dapat dibaca langsung oleh pengguna terautentikasi;
-- perubahan dilakukan melalui RPC SECURITY DEFINER dengan pemeriksaan sesi.

create or replace function public.bku_create_report_category(
  p_transaction_type text,
  p_code text,
  p_label text,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_type text := upper(btrim(coalesce(p_transaction_type, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan untuk mengelola kategori.' using errcode = '42501';
  end if;
  if v_type not in ('IN', 'OUT') then
    raise exception 'Jenis transaksi harus Kas Masuk atau Kas Keluar.';
  end if;
  if v_code = '' or length(v_code) > 40 or v_code !~ '^[a-z0-9]+(_[a-z0-9]+)*$' then
    raise exception 'Kode kategori tidak valid.';
  end if;
  if v_label = '' or length(v_label) > 80 then
    raise exception 'Nama kategori wajib diisi dan maksimal 80 karakter.';
  end if;
  if p_sort_order is null or p_sort_order < 0 or p_sort_order > 9999 then
    raise exception 'Urutan kategori harus berupa angka 0 sampai 9999.';
  end if;

  insert into public.bku_report_categories (transaction_type, code, label, sort_order, is_active)
  values (v_type, v_code, v_label, p_sort_order, true);
end;
$function$;

create or replace function public.bku_update_report_category(
  p_transaction_type text,
  p_code text,
  p_label text,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_type text := upper(btrim(coalesce(p_transaction_type, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan untuk mengelola kategori.' using errcode = '42501';
  end if;
  if v_type not in ('IN', 'OUT') then
    raise exception 'Jenis transaksi harus Kas Masuk atau Kas Keluar.';
  end if;
  if v_code = '' or length(v_code) > 40 or v_code !~ '^[a-z0-9]+(_[a-z0-9]+)*$' then
    raise exception 'Kode kategori tidak valid.';
  end if;
  if v_label = '' or length(v_label) > 80 then
    raise exception 'Nama kategori wajib diisi dan maksimal 80 karakter.';
  end if;
  if p_sort_order is null or p_sort_order < 0 or p_sort_order > 9999 then
    raise exception 'Urutan kategori harus berupa angka 0 sampai 9999.';
  end if;

  update public.bku_report_categories
     set label = v_label,
         sort_order = p_sort_order
   where transaction_type = v_type
     and code = v_code;

  if not found then
    raise exception 'Kategori yang akan diubah tidak ditemukan.';
  end if;
end;
$function$;

create or replace function public.bku_set_report_category_active(
  p_transaction_type text,
  p_code text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_type text := upper(btrim(coalesce(p_transaction_type, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan untuk mengelola kategori.' using errcode = '42501';
  end if;
  if v_type not in ('IN', 'OUT') then
    raise exception 'Jenis transaksi harus Kas Masuk atau Kas Keluar.';
  end if;
  if v_code = '' then
    raise exception 'Kode kategori wajib diisi.';
  end if;
  if p_is_active is null then
    raise exception 'Status kategori tidak valid.';
  end if;
  if v_type = 'OUT' and v_code = 'upah' and p_is_active = false then
    raise exception 'Kategori Gaji Harian Tukang terhubung dengan modul Absensi & Gaji dan tidak dapat dinonaktifkan.';
  end if;

  update public.bku_report_categories
     set is_active = p_is_active
   where transaction_type = v_type
     and code = v_code;

  if not found then
    raise exception 'Kategori yang akan diubah tidak ditemukan.';
  end if;
end;
$function$;

revoke all on function public.bku_create_report_category(text, text, text, integer) from public;
revoke all on function public.bku_create_report_category(text, text, text, integer) from anon;
grant execute on function public.bku_create_report_category(text, text, text, integer) to authenticated;

revoke all on function public.bku_update_report_category(text, text, text, integer) from public;
revoke all on function public.bku_update_report_category(text, text, text, integer) from anon;
grant execute on function public.bku_update_report_category(text, text, text, integer) to authenticated;

revoke all on function public.bku_set_report_category_active(text, text, boolean) from public;
revoke all on function public.bku_set_report_category_active(text, text, boolean) from anon;
grant execute on function public.bku_set_report_category_active(text, text, boolean) to authenticated;

-- Baris ini berasal dari contoh template lama, bukan kategori riil.
-- Nonaktifkan, jangan hapus, agar aman bila pernah terpakai pada transaksi.
update public.bku_report_categories
   set is_active = false
 where transaction_type = 'OUT'
   and code = 'kode_baru'
   and label = 'Nama Kategori Baru';

commit;
