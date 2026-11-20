begin;

-- Salin satu nota ke buku kas proyek lain milik pengguna yang sama.
-- Operasi dilakukan di database agar penomoran tujuan dibuat secara konsisten.
create or replace function public.bku_export_transaction_to_book(
  p_transaction_id uuid,
  p_target_book_id uuid,
  p_target_date date
)
returns table (
  new_transaction_id uuid,
  new_entry_no integer,
  target_book_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.bku_transactions;
  v_target public.bku_books;
  v_entry_no integer;
  v_new_id uuid;
  v_details jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi pengguna tidak tersedia.';
  end if;

  if p_target_date is null then
    raise exception 'Tanggal pencatatan di proyek tujuan wajib dipilih.';
  end if;

  select source_tx.*
    into v_source
  from public.bku_transactions source_tx
  join public.bku_books source_book on source_book.id = source_tx.book_id
  where source_tx.id = p_transaction_id
    and source_book.created_by = auth.uid()
  for share of source_tx;

  if not found then
    raise exception 'Nota sumber tidak ditemukan atau akses ditolak.';
  end if;

  -- Kunci baris proyek tujuan agar dua ekspor bersamaan mendapat nomor urut berbeda.
  select destination.*
    into v_target
  from public.bku_books destination
  where destination.id = p_target_book_id
    and destination.created_by = auth.uid()
  for update;

  if not found then
    raise exception 'Proyek tujuan tidak ditemukan atau akses ditolak.';
  end if;

  if v_source.book_id = v_target.id then
    raise exception 'Proyek tujuan harus berbeda dari proyek asal.';
  end if;

  if p_target_date < v_target.start_date then
    raise exception 'Tanggal tujuan tidak boleh lebih awal dari tanggal mulai proyek tujuan.';
  end if;

  select coalesce(max(t.entry_no), 0) + 1
    into v_entry_no
  from public.bku_transactions t
  where t.book_id = v_target.id
    and t.transaction_date = p_target_date;

  -- material_id berasal dari master proyek asal; pertahankan data rinci tetapi lepaskan ID-nya.
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(detail.value) = 'object' then detail.value - 'material_id'
        else detail.value
      end
      order by detail.ordinality
    ),
    '[]'::jsonb
  )
    into v_details
  from jsonb_array_elements(coalesce(v_source.details, '[]'::jsonb))
    with ordinality as detail(value, ordinality);

  insert into public.bku_transactions (
    book_id,
    transaction_date,
    entry_no,
    transaction_type,
    category,
    description,
    amount,
    account,
    from_account,
    to_account,
    receipt_number,
    evidence_path,
    details,
    created_by,
    store_id,
    store_name,
    split_group_id,
    split_group_label,
    split_group_total
  )
  values (
    v_target.id,
    p_target_date,
    v_entry_no,
    v_source.transaction_type,
    v_source.category,
    v_source.description,
    v_source.amount,
    v_source.account,
    v_source.from_account,
    v_source.to_account,
    v_source.receipt_number,
    v_source.evidence_path,
    v_details,
    auth.uid(),
    null,
    coalesce(v_source.store_name, ''),
    null,
    null,
    null
  )
  returning id into v_new_id;

  return query select v_new_id, v_entry_no, v_target.name;
end;
$$;

revoke all on function public.bku_export_transaction_to_book(uuid, uuid, date) from public;
grant execute on function public.bku_export_transaction_to_book(uuid, uuid, date) to authenticated;

commit;
