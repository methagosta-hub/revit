-- Dahlia BKU - pemecahan nota dan modul absensi/penggajian mingguan
-- Jalankan HANYA pada proyek Supabase BKU yang terpisah dari database utama Dahlia.
-- Migrasi bersifat idempotent. Tidak menghapus atau mengubah transaksi lama.

begin;

-- Kelompok nota untuk menandai beberapa nota yang berasal dari pemisahan rincian/bukti.
alter table public.bku_transactions
  add column if not exists split_group_id uuid,
  add column if not exists split_group_label text,
  add column if not exists split_group_total numeric(15,2);

create index if not exists bku_transactions_split_group_idx
  on public.bku_transactions(book_id, split_group_id)
  where split_group_id is not null;

-- Master pekerja. Pekerja yang sudah tidak dipakai dinonaktifkan, bukan dihapus.
create table if not exists public.bku_workers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.bku_books(id) on delete cascade,
  worker_type text not null check (worker_type in ('TUKANG','PEKERJA')),
  name text not null check (length(trim(name)) > 0),
  daily_rate numeric(15,2) not null check (daily_rate >= 0),
  joined_on date not null default current_date,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bku_workers_id_book_unique unique(id, book_id)
);

create index if not exists bku_workers_book_active_name_idx
  on public.bku_workers(book_id, is_active, worker_type, name);

-- Satu baris untuk satu pekerja pada satu tanggal kerja.
-- Tarif dan nama disalin sebagai snapshot agar histori upah tetap benar jika master berubah.
create table if not exists public.bku_worker_attendance (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.bku_books(id) on delete cascade,
  worker_id uuid not null,
  work_date date not null,
  hok numeric(5,2) not null check (hok >= 0 and hok <= 1),
  daily_rate_snapshot numeric(15,2) not null check (daily_rate_snapshot >= 0),
  amount numeric(15,2) not null check (amount >= 0),
  worker_name_snapshot text not null,
  worker_type_snapshot text not null check (worker_type_snapshot in ('TUKANG','PEKERJA')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bku_attendance_worker_book_fk
    foreign key(worker_id, book_id) references public.bku_workers(id, book_id) on delete cascade,
  constraint bku_attendance_worker_day_unique unique(worker_id, work_date)
);

create index if not exists bku_worker_attendance_book_date_idx
  on public.bku_worker_attendance(book_id, work_date, worker_id);

-- Satu rekap penggajian per minggu dan tertaut ke satu transaksi kas keluar.
create table if not exists public.bku_payroll_weeks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.bku_books(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  pay_date date not null,
  total_hok numeric(12,2) not null default 0 check (total_hok >= 0),
  total_amount numeric(15,2) not null default 0 check (total_amount >= 0),
  transaction_id uuid references public.bku_transactions(id) on delete set null,
  account text not null default 'CASH' check (account in ('CASH','BANK')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bku_payroll_week_unique unique(book_id, week_start),
  constraint bku_payroll_monday_check check (extract(isodow from week_start) = 1),
  constraint bku_payroll_range_check check (week_end = week_start + 5),
  constraint bku_payroll_pay_date_check check (pay_date between week_start and week_end)
);

create index if not exists bku_payroll_weeks_book_week_idx
  on public.bku_payroll_weeks(book_id, week_start);

alter table public.bku_workers enable row level security;
alter table public.bku_worker_attendance enable row level security;
alter table public.bku_payroll_weeks enable row level security;

drop policy if exists "BKU owners read workers" on public.bku_workers;
create policy "BKU owners read workers" on public.bku_workers
  for select to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners insert workers" on public.bku_workers;
create policy "BKU owners insert workers" on public.bku_workers
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners update workers" on public.bku_workers;
create policy "BKU owners update workers" on public.bku_workers
  for update to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  ) with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

drop policy if exists "BKU owners read worker attendance" on public.bku_worker_attendance;
create policy "BKU owners read worker attendance" on public.bku_worker_attendance
  for select to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners insert worker attendance" on public.bku_worker_attendance;
create policy "BKU owners insert worker attendance" on public.bku_worker_attendance
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners update worker attendance" on public.bku_worker_attendance;
create policy "BKU owners update worker attendance" on public.bku_worker_attendance
  for update to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  ) with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners delete worker attendance" on public.bku_worker_attendance;
create policy "BKU owners delete worker attendance" on public.bku_worker_attendance
  for delete to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

drop policy if exists "BKU owners read payroll weeks" on public.bku_payroll_weeks;
create policy "BKU owners read payroll weeks" on public.bku_payroll_weeks
  for select to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners insert payroll weeks" on public.bku_payroll_weeks;
create policy "BKU owners insert payroll weeks" on public.bku_payroll_weeks
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );
drop policy if exists "BKU owners update payroll weeks" on public.bku_payroll_weeks;
create policy "BKU owners update payroll weeks" on public.bku_payroll_weeks
  for update to authenticated using (
    exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  ) with check (
    created_by = auth.uid()
    and exists(select 1 from public.bku_books b where b.id = book_id and b.created_by = auth.uid())
  );

-- RPC atomik: mengganti absensi minggu tersebut dan membuat/memperbarui satu transaksi OUT kategori upah.
create or replace function public.bku_save_weekly_payroll(
  p_book_id uuid,
  p_week_start date,
  p_pay_date date,
  p_account text,
  p_attendance jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_week_end date;
  v_item jsonb;
  v_worker_id uuid;
  v_worker_name text;
  v_worker_type text;
  v_master_worker_name text;
  v_master_worker_type text;
  v_rate numeric(15,2);
  v_joined_on date;
  v_seen_workers uuid[] := array[]::uuid[];
  v_hok numeric(5,2);
  v_worker_hok numeric(12,2);
  v_worker_total numeric(15,2);
  v_total_hok numeric(12,2) := 0;
  v_total_amount numeric(15,2) := 0;
  v_day integer;
  v_work_date date;
  v_details jsonb := '[]'::jsonb;
  v_existing public.bku_payroll_weeks%rowtype;
  v_transaction_id uuid;
  v_entry_no integer;
  v_receipt text;
  v_description text;
begin
  select created_by into v_owner
  from public.bku_books
  where id = p_book_id and created_by = auth.uid()
  for update;
  if not found then raise exception 'Buku kas tidak ditemukan atau akses ditolak'; end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Tanggal awal minggu harus hari Senin';
  end if;
  v_week_end := p_week_start + 5;
  if p_pay_date is null or p_pay_date < p_week_start or p_pay_date > v_week_end then
    raise exception 'Tanggal pembayaran harus berada pada Senin sampai Sabtu minggu tersebut';
  end if;
  if p_account is null or p_account not in ('CASH','BANK') then raise exception 'Metode pembayaran tidak valid'; end if;
  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Format absensi tidak valid';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_book_id::text || p_week_start::text));

  -- Hapus dan buat ulang absensi hanya untuk enam hari minggu yang sedang disimpan.
  delete from public.bku_worker_attendance
  where book_id = p_book_id and work_date between p_week_start and v_week_end;

  for v_item in select value from jsonb_array_elements(p_attendance)
  loop
    v_worker_id := (v_item->>'worker_id')::uuid;
    if v_worker_id = any(v_seen_workers) then
      raise exception 'Pekerja yang sama dikirim lebih dari satu kali dalam satu minggu';
    end if;
    v_seen_workers := array_append(v_seen_workers, v_worker_id);
    select name, worker_type, daily_rate, joined_on
      into v_master_worker_name, v_master_worker_type, v_rate, v_joined_on
    from public.bku_workers
    where id = v_worker_id and book_id = p_book_id and created_by = auth.uid();
    if not found then raise exception 'Pekerja % tidak ditemukan atau bukan milik buku kas ini', v_worker_id; end if;
    -- Simpan snapshot nama, jenis, dan tarif agar perubahan master tidak mengubah histori minggu lama.
    v_worker_name := coalesce(nullif(v_item->>'worker_name_snapshot', ''), v_master_worker_name);
    v_worker_type := coalesce(nullif(v_item->>'worker_type_snapshot', ''), v_master_worker_type);
    if v_worker_type not in ('TUKANG','PEKERJA') then raise exception 'Jenis pekerja tidak valid'; end if;
    if nullif(v_item->>'daily_rate', '') is not null then
      v_rate := (v_item->>'daily_rate')::numeric;
    end if;
    if v_rate < 0 then raise exception 'Tarif harian pekerja tidak boleh negatif'; end if;

    v_worker_hok := 0;
    v_worker_total := 0;
    for v_day in 0..5 loop
      v_hok := coalesce(nullif(v_item->'days'->>v_day, '')::numeric, 0);
      if v_hok < 0 or v_hok > 1 then raise exception 'HOK harian harus berada antara 0 sampai 1'; end if;
      if mod(v_hok * 4, 1) <> 0 then raise exception 'HOK harus menggunakan kelipatan 0,25'; end if;
      if v_hok > 0 then
        v_work_date := p_week_start + v_day;
        if v_work_date < v_joined_on then raise exception 'Absensi % tidak boleh sebelum tanggal mulai bergabung %', v_worker_name, v_joined_on; end if;
        insert into public.bku_worker_attendance(
          book_id, worker_id, work_date, hok, daily_rate_snapshot, amount,
          worker_name_snapshot, worker_type_snapshot, created_by
        ) values (
          p_book_id, v_worker_id, v_work_date, v_hok, v_rate, round(v_rate * v_hok, 2),
          v_worker_name, v_worker_type, auth.uid()
        );
        v_worker_hok := v_worker_hok + v_hok;
        v_worker_total := v_worker_total + round(v_rate * v_hok, 2);
      end if;
    end loop;
    if v_worker_hok > 0 then
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'material_id', null,
        'name', v_worker_name || ' · ' || case when v_worker_type = 'TUKANG' then 'Tukang' else 'Pekerja' end,
        'unit_price', v_rate,
        'volume', v_worker_hok,
        'unit', 'HOK',
        'line_total', v_worker_total
      ));
      v_total_hok := v_total_hok + v_worker_hok;
      v_total_amount := v_total_amount + v_worker_total;
    end if;
  end loop;

  if v_total_amount <= 0 then raise exception 'Belum ada HOK yang diisi. Total gaji minggu ini masih nol.'; end if;

  select * into v_existing from public.bku_payroll_weeks
  where book_id = p_book_id and week_start = p_week_start
  for update;

  v_description := 'Pembayaran upah pekerja minggu ' || to_char(p_week_start, 'DD Mon YYYY') || ' – ' || to_char(v_week_end, 'DD Mon YYYY');
  v_receipt := 'UPH-' || to_char(p_week_start, 'YYYYMMDD');

  if v_existing.id is not null and v_existing.transaction_id is not null then
    select entry_no into v_entry_no from public.bku_transactions
    where id = v_existing.transaction_id and book_id = p_book_id;
    if not found then v_entry_no := null; end if;
  else
    v_entry_no := null;
  end if;

  if v_entry_no is null then
    select coalesce(max(entry_no), 0) + 1 into v_entry_no
    from public.bku_transactions
    where book_id = p_book_id and transaction_date = p_pay_date;
  elsif exists (
    select 1 from public.bku_transactions
    where id = v_existing.transaction_id and transaction_date <> p_pay_date
  ) then
    select coalesce(max(entry_no), 0) + 1 into v_entry_no
    from public.bku_transactions
    where book_id = p_book_id and transaction_date = p_pay_date;
  end if;

  if v_existing.id is not null and v_existing.transaction_id is not null
     and exists(select 1 from public.bku_transactions where id = v_existing.transaction_id and book_id = p_book_id) then
    v_transaction_id := v_existing.transaction_id;
    update public.bku_transactions set
      transaction_date = p_pay_date,
      entry_no = v_entry_no,
      transaction_type = 'OUT',
      category = 'upah',
      description = v_description,
      amount = v_total_amount,
      account = p_account,
      from_account = null,
      to_account = null,
      receipt_number = v_receipt,
      details = v_details,
      store_id = null,
      store_name = ''
    where id = v_transaction_id and book_id = p_book_id;
  else
    insert into public.bku_transactions(
      book_id, transaction_date, entry_no, transaction_type, category,
      description, amount, account, from_account, to_account,
      receipt_number, details, store_id, store_name, created_by
    ) values (
      p_book_id, p_pay_date, v_entry_no, 'OUT', 'upah',
      v_description, v_total_amount, p_account, null, null,
      v_receipt, v_details, null, '', auth.uid()
    ) returning id into v_transaction_id;
  end if;

  insert into public.bku_payroll_weeks(
    book_id, week_start, week_end, pay_date, total_hok, total_amount,
    transaction_id, account, created_by, updated_at
  ) values (
    p_book_id, p_week_start, v_week_end, p_pay_date, v_total_hok, v_total_amount,
    v_transaction_id, p_account, auth.uid(), now()
  )
  on conflict(book_id, week_start) do update set
    week_end = excluded.week_end,
    pay_date = excluded.pay_date,
    total_hok = excluded.total_hok,
    total_amount = excluded.total_amount,
    transaction_id = excluded.transaction_id,
    account = excluded.account,
    updated_at = now();

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'week_start', p_week_start,
    'week_end', v_week_end,
    'pay_date', p_pay_date,
    'total_hok', v_total_hok,
    'total_amount', v_total_amount,
    'workers_paid', jsonb_array_length(v_details)
  );
end;
$$;

revoke all on function public.bku_save_weekly_payroll(uuid,date,date,text,jsonb) from public;
grant execute on function public.bku_save_weekly_payroll(uuid,date,date,text,jsonb) to authenticated;

grant select, insert, update on public.bku_workers to authenticated;
grant select, insert, update, delete on public.bku_worker_attendance to authenticated;
grant select, insert, update on public.bku_payroll_weeks to authenticated;

commit;
