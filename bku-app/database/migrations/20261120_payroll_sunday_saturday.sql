-- Dahlia BKU - periode kerja Minggu sampai Sabtu, pembayaran setiap Sabtu.
-- Jalankan HANYA pada proyek Supabase BKU (bukan database utama Dahlia).
-- Migrasi mempertahankan seluruh baris absensi dan total penggajian historis.

begin;

-- Validasi agar migrasi hanya memproses data lama Senin-Sabtu atau data baru
-- yang sudah berbentuk Minggu-Sabtu. Hentikan migrasi bila ada rentang tak dikenal.
do $$
begin
  if exists (
    select 1
    from public.bku_payroll_weeks
    where not (
      (
        extract(isodow from week_start) = 1
        and week_end = week_start + 5
        and pay_date = week_end
      )
      or
      (
        extract(isodow from week_start) = 7
        and week_end = week_start + 6
        and pay_date = week_end
      )
    )
  ) then
    raise exception 'Ada periode penggajian dengan rentang/tanggal bayar yang tidak dikenal. Periksa bku_payroll_weeks sebelum melanjutkan.';
  end if;
end;
$$;

alter table public.bku_payroll_weeks
  drop constraint if exists bku_payroll_monday_check,
  drop constraint if exists bku_payroll_sunday_check,
  drop constraint if exists bku_payroll_range_check,
  drop constraint if exists bku_payroll_pay_date_check;

-- Migrasikan kunci periode lama dari Senin ke hari Minggu sebelumnya.
-- week_end dan pay_date tetap pada Sabtu yang sama; nilai total tidak diubah.
-- Kondisi ini juga membuat file aman dijalankan ulang (baris Minggu tidak digeser lagi).
update public.bku_payroll_weeks
set week_start = week_start - 1
where extract(isodow from week_start) = 1
  and week_end = week_start + 5
  and pay_date = week_end;

alter table public.bku_payroll_weeks
  add constraint bku_payroll_sunday_check
    check (extract(isodow from week_start) = 7),
  add constraint bku_payroll_range_check
    check (week_end = week_start + 6),
  add constraint bku_payroll_pay_date_check
    check (pay_date = week_end);

-- RPC atomik: menyimpan tujuh hari absensi Minggu-Sabtu dan satu
-- transaksi kas keluar kategori upah yang tanggal transaksinya selalu Sabtu.
create or replace function public.bku_save_weekly_payroll(
  p_book_id uuid,
  p_week_start date,
  p_pay_date date,
  p_account text,
  p_attendance jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
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

  if not found then
    raise exception 'Buku kas tidak ditemukan atau akses ditolak';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 7 then
    raise exception 'Tanggal awal periode absensi harus hari Minggu';
  end if;

  v_week_end := p_week_start + 6;

  if p_pay_date is null or p_pay_date <> v_week_end then
    raise exception 'Pembayaran gaji mingguan wajib dicatat pada hari Sabtu di akhir periode';
  end if;

  if p_account is null or p_account not in ('CASH','BANK') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Format absensi tidak valid';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_book_id::text || p_week_start::text));

  -- Hanya hapus dan buat ulang absensi dalam tujuh hari periode yang disimpan.
  delete from public.bku_worker_attendance
  where book_id = p_book_id
    and work_date between p_week_start and v_week_end;

  for v_item in
    select value from jsonb_array_elements(p_attendance)
  loop
    v_worker_id := (v_item->>'worker_id')::uuid;

    if v_worker_id is null then
      raise exception 'Identitas pekerja wajib diisi';
    end if;

    if v_worker_id = any(v_seen_workers) then
      raise exception 'Pekerja yang sama dikirim lebih dari satu kali dalam satu minggu';
    end if;
    v_seen_workers := array_append(v_seen_workers, v_worker_id);

    if jsonb_typeof(v_item->'days') is distinct from 'array' then
      raise exception 'Data absensi harus memuat matriks tujuh hari';
    end if;
    if jsonb_array_length(v_item->'days') <> 7 then
      raise exception 'Matriks absensi harus berisi Minggu sampai Sabtu (7 hari)';
    end if;

    select name, worker_type, daily_rate, joined_on
      into v_master_worker_name, v_master_worker_type, v_rate, v_joined_on
    from public.bku_workers
    where id = v_worker_id
      and book_id = p_book_id
      and created_by = auth.uid();

    if not found then
      raise exception 'Pekerja % tidak ditemukan atau bukan milik buku kas ini', v_worker_id;
    end if;

    -- Snapshot menjaga histori meskipun nama/jenis/tarif master berubah kemudian.
    v_worker_name := coalesce(nullif(v_item->>'worker_name_snapshot', ''), v_master_worker_name);
    v_worker_type := coalesce(nullif(v_item->>'worker_type_snapshot', ''), v_master_worker_type);

    if v_worker_type not in ('TUKANG','PEKERJA') then
      raise exception 'Jenis pekerja tidak valid';
    end if;

    if nullif(v_item->>'daily_rate', '') is not null then
      v_rate := (v_item->>'daily_rate')::numeric;
    end if;

    if v_rate is null or v_rate < 0 then
      raise exception 'Tarif harian pekerja tidak boleh negatif atau kosong';
    end if;

    v_worker_hok := 0;
    v_worker_total := 0;

    -- Indeks 0 sampai 6 mewakili Minggu, Senin, Selasa, Rabu, Kamis, Jumat, Sabtu.
    for v_day in 0..6 loop
      v_hok := coalesce(nullif(v_item->'days'->>v_day, '')::numeric, 0);

      if v_hok < 0 or v_hok > 1 then
        raise exception 'HOK harian harus berada antara 0 sampai 1';
      end if;
      if mod(v_hok * 4, 1) <> 0 then
        raise exception 'HOK harus menggunakan kelipatan 0,25';
      end if;

      if v_hok > 0 then
        v_work_date := p_week_start + v_day;

        if v_work_date < v_joined_on then
          raise exception 'Absensi % tidak boleh sebelum tanggal mulai bergabung %', v_worker_name, v_joined_on;
        end if;

        insert into public.bku_worker_attendance(
          book_id, worker_id, work_date, hok, daily_rate_snapshot, amount,
          worker_name_snapshot, worker_type_snapshot, created_by
        ) values (
          p_book_id, v_worker_id, v_work_date, v_hok, v_rate,
          round(v_rate * v_hok, 2), v_worker_name, v_worker_type, auth.uid()
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

  if v_total_amount <= 0 then
    raise exception 'Belum ada HOK yang diisi. Total gaji minggu ini masih nol.';
  end if;

  select * into v_existing
  from public.bku_payroll_weeks
  where book_id = p_book_id and week_start = p_week_start
  for update;

  v_description := 'Pembayaran upah pekerja minggu '
    || to_char(p_week_start, 'DD Mon YYYY')
    || ' – '
    || to_char(v_week_end, 'DD Mon YYYY');
  v_receipt := 'UPH-' || to_char(p_week_start, 'YYYYMMDD');

  if v_existing.id is not null and v_existing.transaction_id is not null then
    select entry_no into v_entry_no
    from public.bku_transactions
    where id = v_existing.transaction_id and book_id = p_book_id;

    if not found then
      v_entry_no := null;
    end if;
  else
    v_entry_no := null;
  end if;

  if v_entry_no is null then
    select coalesce(max(entry_no), 0) + 1 into v_entry_no
    from public.bku_transactions
    where book_id = p_book_id and transaction_date = p_pay_date;
  elsif exists (
    select 1
    from public.bku_transactions
    where id = v_existing.transaction_id and transaction_date <> p_pay_date
  ) then
    select coalesce(max(entry_no), 0) + 1 into v_entry_no
    from public.bku_transactions
    where book_id = p_book_id and transaction_date = p_pay_date;
  end if;

  if v_existing.id is not null
     and v_existing.transaction_id is not null
     and exists (
       select 1 from public.bku_transactions
       where id = v_existing.transaction_id and book_id = p_book_id
     ) then
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
    )
    returning id into v_transaction_id;
  end if;

  insert into public.bku_payroll_weeks(
    book_id, week_start, week_end, pay_date, total_hok, total_amount,
    transaction_id, account, created_by, updated_at
  ) values (
    p_book_id, p_week_start, v_week_end, p_pay_date, v_total_hok,
    v_total_amount, v_transaction_id, p_account, auth.uid(), now()
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
$function$;

-- RPC hanya tersedia bagi sesi yang sudah terautentikasi.
revoke all on function public.bku_save_weekly_payroll(uuid,date,date,text,jsonb) from public, anon;
grant execute on function public.bku_save_weekly_payroll(uuid,date,date,text,jsonb) to authenticated;

commit;
