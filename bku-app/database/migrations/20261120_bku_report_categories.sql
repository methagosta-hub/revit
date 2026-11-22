begin;

-- Master kategori rekap BKU. Data bersifat global untuk semua akun pada database BKU ini.
-- Penambahan kategori baru dilakukan melalui Supabase SQL Editor.
create table if not exists public.bku_report_categories (
  transaction_type text not null check (transaction_type in ('IN','OUT')),
  code text not null check (length(trim(code)) > 0),
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (transaction_type, code)
);

alter table public.bku_report_categories enable row level security;

drop policy if exists "BKU authenticated users read report categories" on public.bku_report_categories;
create policy "BKU authenticated users read report categories"
  on public.bku_report_categories
  for select to authenticated
  using (true);

revoke all on public.bku_report_categories from anon, authenticated;
grant select on public.bku_report_categories to authenticated;

-- Kategori kas keluar. Kode 'upah' tetap dipakai agar transaksi gaji lama
-- dan transaksi otomatis dari modul Absensi & Gaji tetap kompatibel.
insert into public.bku_report_categories (transaction_type, code, label, sort_order)
values
  ('OUT','material','Pembelian material',10),
  ('OUT','upah','Gaji Harian Tukang',20),
  ('OUT','operasional','Operasional proyek',30),
  ('OUT','transportasi','Transportasi',40),
  ('OUT','konsumsi','Konsumsi',50),
  ('OUT','ape','APE',60),
  ('OUT','meubeler','Meubeler',70),
  ('OUT','smkk','SMKK',80),
  ('OUT','lainnya','Lain-lain',90)
on conflict (transaction_type, code) do nothing;

-- Kategori kas masuk yang telah digunakan aplikasi.
insert into public.bku_report_categories (transaction_type, code, label, sort_order)
values
  ('IN','modal','Modal / dana proyek',10),
  ('IN','termin','Penerimaan termin',20),
  ('IN','pengembalian','Pengembalian dana',30),
  ('IN','lainnya','Pemasukan lainnya',40)
on conflict (transaction_type, code) do nothing;

commit;

-- CONTOH MENAMBAHKAN KATEGORI BARU MELALUI SUPABASE SQL EDITOR:
-- insert into public.bku_report_categories (transaction_type, code, label, sort_order)
-- values ('OUT', 'contoh_kategori', 'Nama Kategori Baru', 100)
-- on conflict (transaction_type, code) do update
-- set label = excluded.label, sort_order = excluded.sort_order, is_active = true;
--
-- Mengubah status kategori:
-- update public.bku_report_categories
-- set is_active = false
-- where transaction_type = 'OUT' and code = 'contoh_kategori';
