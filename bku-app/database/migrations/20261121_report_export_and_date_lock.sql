-- Dahlia BKU - export laporan terpisah dan pengamanan tanggal laporan
-- Dijalankan pada proyek Supabase BKU saja.

begin;

create table if not exists public.bku_book_locks (
  book_id uuid primary key references public.bku_books(id) on delete cascade,
  locked_through_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.bku_book_locks enable row level security;

drop policy if exists "BKU owners read report locks" on public.bku_book_locks;
create policy "BKU owners read report locks" on public.bku_book_locks
  for select to authenticated
  using (exists (
    select 1 from public.bku_books b
    where b.id = book_id and b.created_by = (select auth.uid())
  ));

drop policy if exists "BKU owners insert report locks" on public.bku_book_locks;
create policy "BKU owners insert report locks" on public.bku_book_locks
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.bku_books b
      where b.id = book_id and b.created_by = (select auth.uid())
    )
  );

drop policy if exists "BKU owners update report locks" on public.bku_book_locks;
create policy "BKU owners update report locks" on public.bku_book_locks
  for update to authenticated
  using (exists (
    select 1 from public.bku_books b
    where b.id = book_id and b.created_by = (select auth.uid())
  ))
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.bku_books b
      where b.id = book_id and b.created_by = (select auth.uid())
    )
  );

grant select, insert, update on public.bku_book_locks to authenticated;

-- Trigger ini menjaga semua jalur tulis: formulir, salin nota, pindah tanggal,
-- penghapusan, penyimpanan absensi, dan RPC lain yang memodifikasi tanggal.
create or replace function public.bku_enforce_report_date_lock()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_row jsonb;
  v_book_id uuid;
  v_work_date date;
  v_locked_through date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_row := to_jsonb(old);
    v_book_id := (v_row->>'book_id')::uuid;
    if tg_table_name = 'bku_transactions' then
      v_work_date := (v_row->>'transaction_date')::date;
    elsif tg_table_name = 'bku_worker_attendance' then
      v_work_date := (v_row->>'work_date')::date;
    elsif tg_table_name = 'bku_payroll_weeks' then
      v_work_date := (v_row->>'week_start')::date;
    end if;

    select locked_through_date into v_locked_through
    from public.bku_book_locks where book_id = v_book_id;

    if v_locked_through is not null and v_work_date is not null and v_work_date <= v_locked_through then
      raise exception 'Tanggal % termasuk periode yang terkunci sampai %. Buka kunci laporan terlebih dahulu untuk mengubah data.',
        to_char(v_work_date, 'DD Mon YYYY'), to_char(v_locked_through, 'DD Mon YYYY')
        using errcode = '55000';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_row := to_jsonb(new);
    v_book_id := (v_row->>'book_id')::uuid;
    if tg_table_name = 'bku_transactions' then
      v_work_date := (v_row->>'transaction_date')::date;
    elsif tg_table_name = 'bku_worker_attendance' then
      v_work_date := (v_row->>'work_date')::date;
    elsif tg_table_name = 'bku_payroll_weeks' then
      v_work_date := (v_row->>'week_start')::date;
    end if;

    select locked_through_date into v_locked_through
    from public.bku_book_locks where book_id = v_book_id;

    if v_locked_through is not null and v_work_date is not null and v_work_date <= v_locked_through then
      raise exception 'Tanggal % termasuk periode yang terkunci sampai %. Buka kunci laporan terlebih dahulu untuk mengubah data.',
        to_char(v_work_date, 'DD Mon YYYY'), to_char(v_locked_through, 'DD Mon YYYY')
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists bku_transactions_report_date_lock on public.bku_transactions;
create trigger bku_transactions_report_date_lock
before insert or update or delete on public.bku_transactions
for each row execute function public.bku_enforce_report_date_lock();

drop trigger if exists bku_worker_attendance_report_date_lock on public.bku_worker_attendance;
create trigger bku_worker_attendance_report_date_lock
before insert or update or delete on public.bku_worker_attendance
for each row execute function public.bku_enforce_report_date_lock();

drop trigger if exists bku_payroll_weeks_report_date_lock on public.bku_payroll_weeks;
create trigger bku_payroll_weeks_report_date_lock
before insert or update or delete on public.bku_payroll_weeks
for each row execute function public.bku_enforce_report_date_lock();

commit;
