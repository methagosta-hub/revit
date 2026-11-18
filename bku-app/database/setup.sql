-- Jalankan HANYA pada proyek Supabase baru khusus BKU.
-- JANGAN jalankan pada proyek Supabase utama Dahlia.

create extension if not exists pgcrypto;

create table if not exists public.bku_books (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
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
  transaction_type text not null check (transaction_type in ('IN','OUT','TRANSFER')),
  category text not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(15,2) not null check (amount > 0),
  account text check (account in ('CASH','BANK')),
  from_account text check (from_account in ('CASH','BANK')),
  to_account text check (to_account in ('CASH','BANK')),
  receipt_number text,
  evidence_path text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bku_transaction_account_shape check (
    (transaction_type in ('IN','OUT') and account is not null and from_account is null and to_account is null)
    or
    (transaction_type = 'TRANSFER' and account is null and from_account is not null and to_account is not null and from_account <> to_account)
  )
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
    and exists (select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

drop policy if exists "BKU owners update transactions" on public.bku_transactions;
create policy "BKU owners update transactions" on public.bku_transactions
  for update to authenticated using (
    exists (select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  ) with check (
    created_by = auth.uid()
    and exists (select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
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