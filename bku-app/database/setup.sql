-- Jalankan HANYA pada proyek Supabase baru khusus BKU.
-- JANGAN jalankan pada proyek Supabase utama Dahlia.

create extension if not exists pgcrypto;

create table if not exists public.bku_books (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  school_head text not null default '',
  planner text not null default '',
  supervisor text not null default '',
  p2sp text not null default '',
  address text not null default '',
  phone text not null default '',
  npsn text not null default '',
  start_date date not null default current_date,
  opening_cash numeric(15,2) not null default 0 check (opening_cash >= 0),
  opening_bank numeric(15,2) not null default 0 check (opening_bank >= 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.bku_transactions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.bku_books(id) on delete cascade,
  transaction_date date not null,
  entry_no integer not null check (entry_no >= 1),
  transaction_type text not null check (transaction_type in ('IN','OUT','TRANSFER')),
  category text not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(15,2) not null check (amount > 0),
  account text check (account in ('CASH','BANK')),
  from_account text check (from_account in ('CASH','BANK')),
  to_account text check (to_account in ('CASH','BANK')),
  receipt_number text,
  evidence_path text,
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bku_transaction_day_entry_unique unique (book_id, transaction_date, entry_no),
  constraint bku_transaction_account_shape check (
    (transaction_type in ('IN','OUT') and account is not null and from_account is null and to_account is null)
    or
    (transaction_type = 'TRANSFER' and account is null and from_account is not null and to_account is not null and from_account <> to_account)
  )
);

-- Migrasi aman untuk database BKU yang sudah pernah menjalankan versi awal setup.sql.
alter table public.bku_books add column if not exists school_head text not null default '';
alter table public.bku_books add column if not exists planner text not null default '';
alter table public.bku_books add column if not exists supervisor text not null default '';
alter table public.bku_books add column if not exists p2sp text not null default '';
alter table public.bku_books add column if not exists address text not null default '';
alter table public.bku_books add column if not exists phone text not null default '';
alter table public.bku_books add column if not exists npsn text not null default '';
alter table public.bku_transactions add column if not exists details jsonb not null default '[]'::jsonb;


-- Direktori toko terpisah untuk setiap sekolah / buku kas.
create table if not exists public.bku_stores (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.bku_books(id) on delete cascade,
 name text not null check(length(trim(name))>0),
 address text not null default '',
 phone text not null default '',
 notes text not null default '',
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create unique index if not exists bku_stores_book_name_uidx on public.bku_stores(book_id,lower(name));

-- book_id NULL berisi master katalog. book_id terisi berisi material khusus sekolah.
create table if not exists public.bku_materials (
 id uuid primary key default gen_random_uuid(),
 book_id uuid references public.bku_books(id) on delete cascade,
 category text not null,
 name text not null check(length(trim(name))>0),
 unit text not null,
 unit_price numeric(15,2) not null default 0 check(unit_price>=0),
 price_basis text not null default 'Acuan estimasi Indonesia 2026',
 is_seed boolean not null default false,
 is_active boolean not null default true,
 created_by uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create unique index if not exists bku_materials_seed_name_unit_uidx
 on public.bku_materials(lower(name),unit) where book_id is null;
create unique index if not exists bku_materials_school_name_unit_uidx
 on public.bku_materials(book_id,lower(name),unit) where book_id is not null;

alter table public.bku_transactions add column if not exists store_id uuid references public.bku_stores(id) on delete set null;
alter table public.bku_transactions add column if not exists store_name text not null default '';

alter table public.bku_stores enable row level security;
alter table public.bku_materials enable row level security;

drop policy if exists "BKU owners read stores" on public.bku_stores;
create policy "BKU owners read stores" on public.bku_stores for select to authenticated using (
 exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners create stores" on public.bku_stores;
create policy "BKU owners create stores" on public.bku_stores for insert to authenticated with check (
 created_by=auth.uid() and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners update stores" on public.bku_stores;
create policy "BKU owners update stores" on public.bku_stores for update to authenticated using (
 exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
) with check (
 created_by=auth.uid() and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners delete stores" on public.bku_stores;
create policy "BKU owners delete stores" on public.bku_stores for delete to authenticated using (
 exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);

drop policy if exists "BKU users read material catalog" on public.bku_materials;
create policy "BKU users read material catalog" on public.bku_materials for select to authenticated using (
 book_id is null or exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners create school materials" on public.bku_materials;
create policy "BKU owners create school materials" on public.bku_materials for insert to authenticated with check (
 book_id is not null and created_by=auth.uid()
 and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners update school materials" on public.bku_materials;
create policy "BKU owners update school materials" on public.bku_materials for update to authenticated using (
 book_id is not null and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
) with check (
 book_id is not null and created_by=auth.uid()
 and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);
drop policy if exists "BKU owners delete school materials" on public.bku_materials;
create policy "BKU owners delete school materials" on public.bku_materials for delete to authenticated using (
 book_id is not null and exists(select 1 from public.bku_books b where b.id=book_id and b.created_by=auth.uid())
);

create index if not exists bku_transactions_book_date_idx
  on public.bku_transactions(book_id, transaction_date, created_at, id);

alter table public.bku_books enable row level security;
alter table public.bku_transactions enable row level security;

drop policy if exists "BKU owners read books" on public.bku_books;
create policy "BKU owners read books" on public.bku_books
  for select to authenticated using (created_by = auth.uid());

drop policy if exists "BKU owners create books" on public.bku_books;
create policy "BKU owners create books" on public.bku_books
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "BKU owners update books" on public.bku_books;
create policy "BKU owners update books" on public.bku_books
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "BKU owners delete books" on public.bku_books;
create policy "BKU owners delete books" on public.bku_books
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "BKU owners read transactions" on public.bku_transactions;
create policy "BKU owners read transactions" on public.bku_transactions
  for select to authenticated using (
    exists (select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

drop policy if exists "BKU owners create transactions" on public.bku_transactions;
create policy "BKU owners create transactions" on public.bku_transactions
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.bku_books b where b.id = bku_transactions.book_id and b.created_by = auth.uid())
    and (store_id is null or exists (
      select 1 from public.bku_stores st where st.id = bku_transactions.store_id and st.book_id = bku_transactions.book_id
    ))
  );

drop policy if exists "BKU owners update transactions" on public.bku_transactions;
create policy "BKU owners update transactions" on public.bku_transactions
  for update to authenticated using (
    exists (select 1 from public.bku_books b where b.id = bku_transactions.book_id and b.created_by = auth.uid())
  ) with check (
    created_by = auth.uid()
    and exists (select 1 from public.bku_books b where b.id = bku_transactions.book_id and b.created_by = auth.uid())
    and (store_id is null or exists (
      select 1 from public.bku_stores st where st.id = bku_transactions.store_id and st.book_id = bku_transactions.book_id
    ))
  );

drop policy if exists "BKU owners delete transactions" on public.bku_transactions;
create policy "BKU owners delete transactions" on public.bku_transactions
  for delete to authenticated using (
    exists (select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bku-evidence', 'bku-evidence', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "BKU user upload evidence" on storage.objects;
create policy "BKU user upload evidence" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'bku-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "BKU user read evidence" on storage.objects;
create policy "BKU user read evidence" on storage.objects
  for select to authenticated using (
    bucket_id = 'bku-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "BKU user delete evidence" on storage.objects;
create policy "BKU user delete evidence" on storage.objects
  for delete to authenticated using (
    bucket_id = 'bku-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Izin tabel untuk akun aplikasi BKU. RLS tetap membatasi akses per sekolah.
grant select, insert, update, delete on public.bku_stores to authenticated;
grant select, insert, update, delete on public.bku_materials to authenticated;

-- Sumber acuan harga:
-- * Peraturan Bupati Magelang No. 6 Tahun 2026 (standar harga, CFS baja ringan, aluminium, semen):
--   https://peraturan.bpk.go.id/Download/418689/1787732563-2026pb3308006.pdf
-- * Median harga dasar nasional dari 11 kota, edisi 16 November 2026:
--   https://bangun.com/harga-bahan
-- * Pembanding kisaran pasar bahan bangunan 2026:
--   https://www.propertyday.id/harga-bahan-bangunan-2026/
-- Katalog adalah estimasi harga referensi, bukan penawaran toko; cek ulang spesifikasi dan harga lokal.
-- Master katalog sekitar 200 material umum untuk konstruksi / rehabilitasi sekolah (210 item).
-- Harga acuan estimasi nasional per November 2026, bukan penawaran vendor.
-- Sesuaikan merek, ketebalan, mutu, volume, ongkir, pajak, dan lokasi sekolah.
insert into public.bku_materials(category,name,unit,unit_price,price_basis,is_seed)
values
('Persiapan & Tanah','Pembersihan lahan manual','m2',5000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Pengupasan tanah humus','m3',55000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Urugan tanah pilihan','m3',160000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Urugan sirtu','m3',235000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Tanah merah urug','m3',170000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Geotextile non woven 150 gsm','m2',14500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Plastik cor 0,10 mm','kg',26000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Papan bouwplank 2/20','btg',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Patok kayu 5/7','btg',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Persiapan & Tanah','Benang bangunan 100 m','roll',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Pasir pasang','m3',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Pasir beton','m3',350000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Pasir cor bersih','m3',370000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Batu split 1/2','m3',385000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Batu split 2/3','m3',360000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Batu belah pondasi','m3',330000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Batu kali bulat','m3',325000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Kerikil beton','m3',325000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Batu screening','m3',320000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pasir & Batu','Sirtu urug','m3',235000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Semen Portland PCC 50 kg','sak',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Semen Portland PCC 40 kg','sak',61000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Semen putih 20 kg','sak',155000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Mortar pasangan bata 40 kg','sak',78000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Mortar plester 40 kg','sak',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Mortar acian 20 kg','sak',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Perekat bata ringan 40 kg','sak',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Perekat keramik 25 kg','sak',98000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Nat keramik 1 kg','kg',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Semen & Mortar','Semen instan waterproof 20 kg','sak',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton ready mix K-175','m3',1050000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton ready mix K-225','m3',1120000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton ready mix K-250','m3',1175000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton ready mix K-300','m3',1250000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton ready mix K-350','m3',1330000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Beton instan 25 kg','sak',48000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Wiremesh M6 2,1 x 5,4 m','lbr',330000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Wiremesh M8 2,1 x 5,4 m','lbr',620000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Besi begel siap pakai 8 mm','kg',15500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Beton & Cor','Curing compound beton','ltr',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton polos 8 mm SNI x 12 m','btg',43000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton polos 10 mm SNI x 12 m','btg',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton polos 12 mm SNI x 12 m','btg',98000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton ulir 10 mm SNI x 12 m','btg',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton ulir 13 mm SNI x 12 m','btg',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton ulir 16 mm SNI x 12 m','btg',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi beton ulir 19 mm SNI x 12 m','btg',265000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Kawat bendrat','kg',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Plat strip besi 3 mm','kg',19000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Besi & Struktur','Besi siku 40 x 40 x 3 mm','btg',155000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Bata merah press','bh',950,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Bata merah biasa','bh',800,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Bata ringan AAC 7,5 cm','m3',890000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Bata ringan AAC 10 cm','m3',960000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Batako press','bh',4200,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Roster beton 20 x 20 cm','bh',9000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Roster beton 20 x 40 cm','bh',15000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Roster keramik 20 x 20 cm','bh',49000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','Hebel lem perekat 40 kg','sak',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Bata & Dinding','GRC board 4 mm partisi 1,2 x 2,4 m','lbr',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Rangka atap baja ringan C75 tebal 0,75 mm','m2',175000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Rangka atap baja ringan C75 tebal 1,00 mm','m2',205000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Profil C baja ringan 0,75 mm x 6 m','btg',115000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Profil C baja ringan 1,00 mm x 6 m','btg',148000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Reng baja ringan 0,40 mm x 6 m','btg',48000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Reng baja ringan 0,45 mm x 6 m','btg',56000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Reng baja ringan 0,55 mm x 6 m','btg',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Track / kanal U baja ringan x 6 m','btg',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Hollow galvanis 2 x 4 cm x 4 m','btg',62000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Rangka Atap Baja Ringan','Hollow galvanis 4 x 4 cm x 4 m','btg',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek galvalum 0,30 mm lebar efektif 1 m','m',75000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek galvalum 0,35 mm lebar efektif 1 m','m',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek galvalum 0,40 mm lebar efektif 1 m','m',98000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek galvalum 0,45 mm lebar efektif 1 m','m',112000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek pasir 0,30 mm','m',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap spandek pasir 0,35 mm','m',118000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap trimdek galvalum 0,35 mm','m',92000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap gelombang galvalum 0,30 mm','m',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap transparan polycarbonate 1 mm','m2',95000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Atap Spandek & Galvalum','Atap uPVC single layer 0,8 mm','m',145000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Bubungan / nok plat galvalum 0,30 mm','m',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Bubungan / nok plat galvalum 0,35 mm','m',52000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Talang jurai galvalum 0,35 mm','m',58000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Talang air galvalum 0,30 mm','m',48000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Lisplang metal galvalum','m',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Flashing dinding galvalum','m',45000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Sekrup roofing SDS 12 x 50','pcs',650,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Sekrup roofing washer EPDM','pcs',850,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Aluminium foil atap single side','m2',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Aksesoris Atap','Aluminium foil atap double side','m2',28500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Gypsum board 9 mm 1,2 x 2,4 m','lbr',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Gypsum board 12 mm 1,2 x 2,4 m','lbr',92000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','GRC board 4 mm 1,2 x 2,4 m','lbr',72000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','GRC board 6 mm 1,2 x 2,4 m','lbr',112000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Rangka hollow plafon 2 x 4 x 4 m','btg',62000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Rangka hollow plafon 4 x 4 x 4 m','btg',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Furing metal 0,30 mm x 4 m','btg',24000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Wall angle plafon 3 m','btg',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Lis plafon PVC 4 m','btg',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Plafon & Rangka','Panel plafon PVC 20 cm x 4 m','lbr',38000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil kusen aluminium 3 inch silver','btg',145000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil kusen aluminium 3 inch hitam','btg',165000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil kusen aluminium 4 inch silver','btg',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil kusen aluminium 4 inch hitam','btg',210000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil daun pintu aluminium','btg',135000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil jendela aluminium sliding','btg',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Profil aluminium mullion','btg',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Kusen aluminium fabrikasi 3 inch','m',295000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Kusen aluminium fabrikasi 4 inch','m',325000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Profil Aluminium Kusen','Pintu aluminium toilet set','unit',1250000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca bening 5 mm','m2',175000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca bening 6 mm','m2',225000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca tempered 8 mm','m2',650000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca tempered 10 mm','m2',850000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca es / buram 5 mm','m2',210000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Kaca rayban 5 mm','m2',245000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Karet kaca aluminium','m',4500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Roller jendela sliding','set',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Handle jendela aluminium','pcs',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Kaca & Fitting Aluminium','Engsel pivot aluminium','set',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Daun pintu engineering wood','unit',650000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Daun pintu panel kayu solid','unit',1250000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Daun pintu PVC kamar mandi','unit',380000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Kusen kayu meranti','set',750000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Engsel pintu stainless 4 inch','pcs',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Kunci pintu cylindrical','set',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Kunci pintu mortise','set',165000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Door closer hidrolik','unit',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Grendel pintu stainless','pcs',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pintu & Pengunci','Handle pintu stainless','set',75000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik lantai 40 x 40 kelas standar','m2',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik lantai 50 x 50 kelas standar','m2',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik lantai 60 x 60 kelas standar','m2',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Granit tile 60 x 60 kelas standar','m2',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Granit tile 60 x 120 kelas standar','m2',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik dinding 25 x 40','m2',110000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik kamar mandi anti slip 30 x 30','m2',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Keramik tangga nosing 30 cm','pcs',22500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Plint keramik 10 cm','m',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Keramik & Granit','Batu alam andesit bakar','m2',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat interior ekonomis 5 kg','pail',95000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat interior premium 25 kg','pail',650000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat eksterior weatherproof 25 kg','pail',950000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat dasar alkali resisting 20 kg','pail',420000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat kayu dan besi 1 kg','kaleng',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Cat besi anti karat 1 kg','kaleng',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Plamir tembok 5 kg','pail',75000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Thinner 1 ltr','ltr',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Amplas halus 1 lembar','lbr',5000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Cat & Finishing','Kuas cat 3 inch','pcs',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Waterproofing coating 4 kg','pail',145000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Waterproofing coating 20 kg','pail',580000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Membrane bakar 3 mm','m2',95000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Membrane bakar 4 mm','m2',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Sealant silikon 300 ml','tube',38000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','PU sealant 600 ml','sausage',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Expanding foam 750 ml','can',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Waterstop PVC 20 cm','m',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Sika grout 5 kg','pail',95000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Waterproofing & Sealant','Semen pelapis anti bocor 1 kg','kg',18500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 1/2 inch x 4 m','btg',18500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 3/4 inch x 4 m','btg',26500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 1 inch x 4 m','btg',38000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 2 inch x 4 m','btg',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 3 inch x 4 m','btg',105000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC AW 4 inch x 4 m','btg',155000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PVC D 3 inch x 4 m','btg',78000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Pipa PPR PN20 1/2 inch x 4 m','btg',68000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Knee PVC 1/2 inch','pcs',1500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Pipa & Plumbing','Lem PVC 400 gram','kaleng',42000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Kloset jongkok porselen','unit',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Kloset duduk standar','unit',1250000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Wastafel gantung standar','unit',480000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Kran air kuningan 1/2 inch','pcs',55000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Shower set standar','set',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Floor drain stainless 4 inch','pcs',38000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Bak kontrol beton 40 x 40','unit',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Septic tank bio 1000 liter','unit',2850000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Tandon air 1000 liter','unit',1650000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Sanitary & Air','Pompa air 125 watt','unit',950000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Kabel NYM 2 x 1,5 mm roll 50 m','roll',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Kabel NYM 2 x 2,5 mm roll 50 m','roll',425000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Kabel NYM 3 x 2,5 mm roll 50 m','roll',620000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Kabel NYA 1,5 mm roll 100 m','roll',185000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Kabel NYA 2,5 mm roll 100 m','roll',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Pipa conduit 20 mm x 3 m','btg',12500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','MCB 1 phase 6A','pcs',48000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','MCB 1 phase 16A','pcs',52000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','ELCB 2P 25A','pcs',285000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Instalasi Listrik','Stop kontak tanam standar','pcs',35000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Saklar tunggal tanam','pcs',22000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Saklar seri tanam','pcs',32000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Lampu LED 9 watt','pcs',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Lampu LED 18 watt','pcs',48000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Lampu panel LED 18 watt','pcs',85000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Lampu emergency LED','pcs',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Fitting lampu plafon','pcs',8500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Kotak MCB 8 grup','unit',95000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Ground rod tembaga 5/8 inch','btg',125000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Lampu & Aksesoris Listrik','Kabel grounding BC 16 mm','m',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Paku beton 5 cm','kg',28000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Paku kayu 7 cm','kg',26000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Dynabolt 10 x 75 mm','pcs',5500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Baut roofing 12 x 50','pcs',650,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Kawat las RB 26 2,6 mm','kg',32000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Mata gerinda potong 4 inch','pcs',8500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Mata bor besi 6 mm','pcs',12000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Lakban kertas 2 inch','roll',18000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Sarung tangan kerja','pasang',12000,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true),
('Tools & Consumables','Masker respirator debu','pcs',4500,'Acuan estimasi Indonesia 2026 · konfirmasi harga toko lokal',true)
on conflict (lower(name),unit) where book_id is null
do update set category=excluded.category,unit_price=excluded.unit_price,
 price_basis=excluded.price_basis,is_active=true,is_seed=true;


-- Geser tanggal mulai proyek beserta semua nota pada / setelah tanggal mulai lama.
create or replace function public.bku_shift_project_schedule(p_book_id uuid,p_new_start_date date)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_old_start date; v_delta integer; v_moved integer;
begin
 select start_date into v_old_start from public.bku_books
 where id=p_book_id and created_by=auth.uid() for update;
 if not found then raise exception 'Buku kas tidak ditemukan atau akses ditolak'; end if;
 if p_new_start_date is null or p_new_start_date=v_old_start then return 0; end if;
 v_delta:=p_new_start_date-v_old_start;
 select count(*) into v_moved from public.bku_transactions
 where book_id=p_book_id and transaction_date>=v_old_start;
 with numbered as (
  select id,(1000000000+row_number() over(order by transaction_date,entry_no,created_at,id))::integer as temp_no
  from public.bku_transactions where book_id=p_book_id
 )
 update public.bku_transactions t set entry_no=numbered.temp_no
 from numbered where t.id=numbered.id;
 update public.bku_transactions set transaction_date=transaction_date+v_delta
 where book_id=p_book_id and transaction_date>=v_old_start;
 with ranked as (
  select id,row_number() over(partition by transaction_date order by entry_no,created_at,id)::integer as rn
  from public.bku_transactions where book_id=p_book_id
 )
 update public.bku_transactions t set entry_no=ranked.rn from ranked where t.id=ranked.id;
 update public.bku_books set start_date=p_new_start_date where id=p_book_id;
 return v_moved;
end;
$$;
revoke all on function public.bku_shift_project_schedule(uuid,date) from public;
grant execute on function public.bku_shift_project_schedule(uuid,date) to authenticated;
