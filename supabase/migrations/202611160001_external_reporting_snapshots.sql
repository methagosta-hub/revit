-- Dahlia Management System - External Reporting & SPJ
-- Snapshot laporan internal yang berdiri sendiri, buku kas eksternal, dan alokasi upah transparan.
-- Prasyarat: Company Access 001, Finance Recap 006, Payroll 013, Payment Integration 015.
-- Tidak mengubah transaksi internal; snapshot eksternal merupakan salinan terpisah.

begin;

do $preflight$
begin
  if to_regclass('public.user_profiles') is null
     or to_regclass('public.app_roles') is null
     or to_regclass('public.app_permissions') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.user_role_assignments') is null
     or to_regclass('public.finance_recap_documents') is null
     or to_regclass('public.company_cash_transactions') is null
     or to_regclass('public.payroll_cost_allocations') is null
     or to_regclass('public.payroll_lines') is null
     or to_regclass('public.payroll_items') is null
     or to_regclass('public.payroll_runs') is null
     or to_regclass('public.payroll_periods') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.rab_divisions') is null
     or to_regclass('public.project_work_packages') is null then
    raise exception 'Prasyarat Laporan Eksternal belum lengkap. Pastikan Migration 001, 006, 007, 010, 013, dan 015 sudah berhasil.';
  end if;
  if to_regprocedure('public.has_company_role(text[])') is null then
    raise exception 'Fungsi has_company_role(text[]) tidak ditemukan. Pastikan Migration 001 sudah berhasil.';
  end if;
  if to_regclass('public.external_report_books') is not null
     or to_regclass('public.external_report_ledger_entries') is not null
     or to_regclass('public.external_report_wage_snapshots') is not null then
    raise exception 'Objek Laporan Eksternal sudah ditemukan. Migration dihentikan untuk melindungi data yang ada.';
  end if;
end;
$preflight$;

-- 1. Role dan permission baru. Penyusun laporan hanya menyiapkan draft dan penyesuaian terpisah.
insert into public.app_roles (code, name, scope, description)
values (
  'external_report_writer',
  'Penyusun Laporan Eksternal',
  'company',
  'Menyusun snapshot laporan dinas, pajak, SPJ, dan klien tanpa mengubah sumber keuangan internal.'
)
on conflict (code) do update
set name = excluded.name, scope = excluded.scope, description = excluded.description;

insert into public.app_permissions (code, name, module, description) values
  ('external.report.read', 'Lihat laporan eksternal', 'external_reporting', 'Melihat draft, snapshot, buku kas eksternal, dan arsip laporan.'),
  ('external.report.create', 'Buat snapshot laporan eksternal', 'external_reporting', 'Membuat laporan eksternal dari snapshot rekap internal yang sudah ada.'),
  ('external.report.adjust', 'Buat penyesuaian pelaporan terpisah', 'external_reporting', 'Mencatat alokasi/penyesuaian non-kas yang terpisah dari upah dan pembayaran aktual.'),
  ('external.report.export', 'Ekspor laporan eksternal', 'external_reporting', 'Mencetak atau mengekspor laporan eksternal.'),
  ('external.report.freeze', 'Kunci laporan eksternal', 'external_reporting', 'Mengunci draft laporan sebelum diterbitkan.'),
  ('external.report.issue', 'Terbitkan laporan eksternal', 'external_reporting', 'Menerbitkan laporan eksternal yang sudah dikunci.'),
  ('external.report.void', 'Batalkan laporan eksternal', 'external_reporting', 'Membatalkan laporan eksternal dengan alasan dan jejak audit.')
on conflict (code) do update
set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.app_permissions p
where r.code in ('director', 'admin')
  and p.code like 'external.report.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.app_permissions p on p.code in (
  'external.report.read',
  'external.report.create',
  'external.report.adjust',
  'external.report.export'
)
where r.code = 'external_report_writer'
on conflict do nothing;

-- 2. Pemeriksaan permission yang bisa dipanggil RLS dan RPC.
create or replace function public.dahlia_can_external_reporting(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.has_company_role(array['director','admin']::text[])
    or exists (
      select 1
      from public.user_role_assignments ura
      join public.app_roles ar on ar.id = ura.role_id
      join public.role_permissions rp on rp.role_id = ar.id
      join public.app_permissions ap on ap.id = rp.permission_id
      join public.user_profiles up on up.id = ura.user_id
      where ura.user_id = auth.uid()
        and ura.project_id is null
        and up.is_active = true
        and ap.code = p_permission
    )
  );
$$;
revoke all on function public.dahlia_can_external_reporting(text) from public, anon;
grant execute on function public.dahlia_can_external_reporting(text) to authenticated;

create sequence public.external_report_number_seq start with 1 increment by 1;

-- 3. Header laporan eksternal. source_snapshot dan hash adalah salinan beku dari sumber internal.
create table public.external_report_books (
  id uuid primary key default gen_random_uuid(),
  report_number varchar(40) not null unique
    default ('EXT-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('public.external_report_number_seq')::text,6,'0')),
  report_type varchar(24) not null
    check (report_type in ('spj_dinas','tax_support','client_report','other')),
  scope_type varchar(20) not null
    check (scope_type in ('company','consolidated','project','division')),
  project_id uuid references public.projects(id) on delete restrict,
  rab_division_id uuid references public.rab_divisions(id) on delete restrict,
  source_finance_recap_id uuid not null references public.finance_recap_documents(id) on delete restrict,
  source_recap_number varchar(40) not null,
  period_start date not null,
  period_end date not null,
  report_title varchar(180) not null,
  recipient_name varchar(180) not null,
  recipient_reference varchar(120),
  source_snapshot jsonb not null,
  source_snapshot_hash varchar(32) not null,
  status varchar(16) not null default 'draft'
    check (status in ('draft','frozen','issued','void')),
  created_by uuid references public.user_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  frozen_by uuid references public.user_profiles(id) on delete set null,
  frozen_at timestamptz,
  issued_by uuid references public.user_profiles(id) on delete set null,
  issued_at timestamptz,
  voided_by uuid references public.user_profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  constraint external_report_period_check check (period_end >= period_start),
  constraint external_report_scope_check check (
    (scope_type in ('company','consolidated') and project_id is null and rab_division_id is null)
    or (scope_type='project' and project_id is not null and rab_division_id is null)
    or (scope_type='division' and project_id is not null and rab_division_id is not null)
  ),
  constraint external_report_status_fields check (
    (status in ('frozen','issued') and frozen_at is not null and frozen_by is not null)
    or status in ('draft','void')
  ),
  constraint external_report_issued_fields check (
    (status='issued' and issued_at is not null and issued_by is not null)
    or status <> 'issued'
  ),
  constraint external_report_void_fields check (
    (status='void' and voided_at is not null and voided_by is not null and nullif(trim(void_reason),'') is not null)
    or status <> 'void'
  )
);
create index external_report_books_created_idx on public.external_report_books(created_at desc);
create index external_report_books_period_idx on public.external_report_books(period_start, period_end, status);
create index external_report_books_project_idx on public.external_report_books(project_id, created_at desc);

-- 4. Buku kas eksternal. Satu baris untuk setiap transaksi kas pada snapshot internal.
-- Pembayaran supplier tidak dimasukkan lagi sebagai baris kas terpisah karena sudah menjadi
-- metadata dari company_cash_transactions; hal ini mencegah penghitungan ganda.
create table public.external_report_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.external_report_books(id) on delete restrict,
  entry_number integer not null,
  source_type varchar(32) not null default 'internal_cash_snapshot'
    check (source_type = 'internal_cash_snapshot'),
  source_record_id text not null,
  transaction_number varchar(80),
  transaction_date date not null,
  direction varchar(8) not null check (direction in ('in','out')),
  category varchar(100) not null,
  description text not null,
  amount numeric(18,2) not null check (amount > 0),
  payment_method varchar(30),
  reference_number varchar(120),
  project_name_snapshot text,
  division_name_snapshot text,
  status varchar(16) not null check (status in ('confirmed','void')),
  source_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint external_report_ledger_entry_number_unique unique (report_id, entry_number),
  constraint external_report_ledger_source_unique unique (report_id, source_type, source_record_id)
);
create index external_report_ledger_report_date_idx
  on public.external_report_ledger_entries(report_id, transaction_date, entry_number);

-- 5. Snapshot alokasi biaya upah internal. Ini adalah alokasi biaya payroll ke proyek/paket,
-- bukan bukti bahwa kas sudah dibayarkan. Data sumber disalin agar tidak berubah setelahnya.
create table public.external_report_wage_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.external_report_books(id) on delete restrict,
  source_allocation_id text not null,
  source_payroll_line_id text,
  employee_number_snapshot varchar(40),
  employee_name_snapshot varchar(180) not null,
  payroll_period_code varchar(20) not null,
  payroll_period_start date not null,
  payroll_period_end date not null,
  line_label_snapshot varchar(180) not null,
  base_amount numeric(18,2) not null check (base_amount >= 0),
  project_name_snapshot text,
  package_name_snapshot text,
  source_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint external_report_wage_source_unique unique (report_id, source_allocation_id)
);
create index external_report_wage_report_idx on public.external_report_wage_snapshots(report_id, employee_name_snapshot);

-- 6. Penyesuaian biaya tenaga kerja untuk laporan klien ditampilkan terpisah sebagai alokasi
-- non-kas. Nilai ini TIDAK mengubah upah aktual, payroll internal, buku kas, atau biaya yang dibayar.
-- Penyesuaian dilarang untuk SPJ dinas dan dukungan pajak agar tidak disajikan sebagai upah riil.
create table public.external_report_adjustments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.external_report_books(id) on delete restrict,
  wage_snapshot_id uuid not null references public.external_report_wage_snapshots(id) on delete restrict,
  adjustment_kind varchar(32) not null default 'wage_cost_allocation'
    check (adjustment_kind = 'wage_cost_allocation'),
  presentation_label varchar(180) not null,
  classification varchar(32) not null default 'non_cash_disclosure'
    check (classification = 'non_cash_disclosure'),
  base_amount_snapshot numeric(18,2) not null check (base_amount_snapshot >= 0),
  rate_percent numeric(7,3) not null check (rate_percent > 0 and rate_percent <= 100),
  adjustment_amount numeric(18,2) not null check (adjustment_amount > 0),
  reason text not null,
  supporting_reference varchar(180) not null,
  status varchar(12) not null default 'active' check (status in ('active','void')),
  created_by uuid references public.user_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_by uuid references public.user_profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  constraint external_report_adjustment_void_fields check (
    (status='void' and voided_by is not null and voided_at is not null and nullif(trim(void_reason),'') is not null)
    or status='active'
  )
);
create unique index external_report_one_active_wage_adjustment
  on public.external_report_adjustments(report_id, wage_snapshot_id)
  where status='active';
create index external_report_adjustments_report_idx
  on public.external_report_adjustments(report_id, created_at desc);

create table public.external_report_audit_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.external_report_books(id) on delete restrict,
  action varchar(40) not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid references public.user_profiles(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);
create index external_report_audit_report_idx
  on public.external_report_audit_logs(report_id, changed_at desc);

-- 7. Proteksi agar snapshot sumber dan rincian yang sudah disalin tidak dapat diedit langsung.
create or replace function public.dahlia_guard_external_report_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_finance_recap_id is distinct from old.source_finance_recap_id
     or new.source_recap_number is distinct from old.source_recap_number
     or new.source_snapshot is distinct from old.source_snapshot
     or new.source_snapshot_hash is distinct from old.source_snapshot_hash
     or new.scope_type is distinct from old.scope_type
     or new.project_id is distinct from old.project_id
     or new.rab_division_id is distinct from old.rab_division_id
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end then
    raise exception 'Snapshot dan metadata sumber laporan bersifat tetap. Buat snapshot/versi laporan baru jika sumber perlu diperbarui.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger external_report_snapshot_immutable
before update on public.external_report_books
for each row execute function public.dahlia_guard_external_report_snapshot();

create or replace function public.dahlia_reject_external_report_detail_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Rincian snapshot laporan eksternal tidak dapat diedit atau dihapus. Batalkan laporan dan buat snapshot baru bila diperlukan.' using errcode='23514';
end;
$$;
create trigger external_report_ledger_immutable
before update or delete on public.external_report_ledger_entries
for each row execute function public.dahlia_reject_external_report_detail_mutation();
create trigger external_report_wage_snapshot_immutable
before update or delete on public.external_report_wage_snapshots
for each row execute function public.dahlia_reject_external_report_detail_mutation();

create or replace function public.dahlia_guard_external_report_adjustment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Penyesuaian tidak boleh dihapus. Gunakan pembatalan dengan alasan.' using errcode='23514';
  end if;
  if new.report_id is distinct from old.report_id
     or new.wage_snapshot_id is distinct from old.wage_snapshot_id
     or new.adjustment_kind is distinct from old.adjustment_kind
     or new.presentation_label is distinct from old.presentation_label
     or new.classification is distinct from old.classification
     or new.base_amount_snapshot is distinct from old.base_amount_snapshot
     or new.rate_percent is distinct from old.rate_percent
     or new.adjustment_amount is distinct from old.adjustment_amount
     or new.reason is distinct from old.reason
     or new.supporting_reference is distinct from old.supporting_reference
     or old.status = 'void'
     or new.status <> 'void'
     or new.voided_by is null
     or new.voided_at is null
     or nullif(trim(new.void_reason),'') is null then
    raise exception 'Isi penyesuaian bersifat tetap. Perubahan hanya boleh berupa pembatalan dengan alasan.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger external_report_adjustment_immutable
before update or delete on public.external_report_adjustments
for each row execute function public.dahlia_guard_external_report_adjustment();

-- 8. RPC: daftar rekap internal yang boleh dijadikan sumber. Hanya metadata yang dikembalikan.
create or replace function public.dahlia_list_external_report_sources()
returns table (
  id uuid,
  recap_number varchar,
  scope_type varchar,
  project_id uuid,
  project_title text,
  rab_division_id uuid,
  period_start date,
  period_end date,
  report_title varchar,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.dahlia_can_external_reporting('external.report.create') then
    raise exception 'Tidak memiliki izin memilih sumber laporan internal.' using errcode='42501';
  end if;
  return query
  select r.id, r.recap_number, r.scope_type, r.project_id,
         coalesce(p.title, case when r.scope_type='company' then 'Perusahaan' else 'Konsolidasi seluruh perusahaan' end)::text,
         r.rab_division_id, r.period_start, r.period_end, r.report_title, r.created_at
  from public.finance_recap_documents r
  left join public.projects p on p.id=r.project_id
  where r.status='active'
  order by r.created_at desc
  limit 100;
end;
$$;

-- 9. RPC: salin snapshot internal, buku kas, serta alokasi upah yang sudah disetujui.
create or replace function public.dahlia_create_external_report_snapshot(
  p_source_recap_id uuid,
  p_report_type text,
  p_recipient_name text,
  p_recipient_reference text default null,
  p_report_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_recap public.finance_recap_documents%rowtype;
  v_report_id uuid;
  v_report_number text;
  v_source_snapshot jsonb;
  v_wage_rows jsonb := '[]'::jsonb;
  v_cash jsonb;
  v_wage jsonb;
  v_line_no integer := 0;
  v_cash_count integer := 0;
  v_wage_count integer := 0;
begin
  if v_actor is null then raise exception 'Sesi login tidak ditemukan.' using errcode='28000'; end if;
  if not public.dahlia_can_external_reporting('external.report.create') then
    raise exception 'Tidak memiliki izin membuat laporan eksternal.' using errcode='42501';
  end if;
  if p_report_type not in ('spj_dinas','tax_support','client_report','other') then
    raise exception 'Jenis laporan tidak dikenal.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_recipient_name,'')),'') is null then
    raise exception 'Nama penerima laporan wajib diisi.' using errcode='22023';
  end if;
  select * into v_recap
  from public.finance_recap_documents
  where id=p_source_recap_id and status='active';
  if v_recap.id is null then
    raise exception 'Rekap internal tidak ditemukan atau sudah tidak aktif.' using errcode='P0002';
  end if;

  -- Hanya alokasi payroll dari periode yang sepenuhnya berada dalam rentang laporan.
  -- Payroll yang periodenya melintasi tanggal batas tidak diprorata otomatis.
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_allocation_id', pca.id,
    'source_payroll_line_id', pl.id,
    'employee_number', e.employee_number,
    'employee_name', e.full_name,
    'payroll_period_code', pp.period_code,
    'payroll_period_start', pp.period_start,
    'payroll_period_end', pp.period_end,
    'line_label', pl.line_label,
    'base_amount', pca.amount,
    'project_id', pca.project_id,
    'project_name', pr.title,
    'package_id', pca.package_id,
    'package_name', wp.package_name
  ) order by pp.period_start, e.full_name, pl.line_label), '[]'::jsonb)
  into v_wage_rows
  from public.payroll_cost_allocations pca
  join public.payroll_lines pl on pl.id=pca.payroll_line_id and pl.line_kind='earning'
  join public.payroll_items pi on pi.id=pl.payroll_item_id
  join public.payroll_runs run on run.id=pi.payroll_run_id and run.status in ('approved','partially_paid','paid')
  join public.payroll_periods pp on pp.id=run.period_id
  join public.employees e on e.id=pi.employee_id
  left join public.projects pr on pr.id=pca.project_id
  left join public.project_work_packages wp on wp.id=pca.package_id
  where pca.status='active'
    and pp.period_start >= v_recap.period_start
    and pp.period_end <= v_recap.period_end
    and (
      v_recap.scope_type='consolidated'
      or (v_recap.scope_type='company' and pca.project_id is null)
      or (v_recap.scope_type='project' and pca.project_id=v_recap.project_id)
      or (v_recap.scope_type='division' and pca.project_id=v_recap.project_id and wp.division_id=v_recap.rab_division_id)
    );

  v_source_snapshot := jsonb_build_object(
    'snapshot_version', 1,
    'captured_at', now(),
    'source_recap_id', v_recap.id,
    'source_recap_number', v_recap.recap_number,
    'source_recap_created_at', v_recap.created_at,
    'source_snapshot_hash', md5(v_recap.snapshot::text),
    'internal_recap', v_recap.snapshot,
    'wage_allocations', v_wage_rows,
    'wage_allocation_note', 'Alokasi biaya payroll yang disetujui. Bukan bukti kas keluar atau bukti pembayaran kepada karyawan.',
    'cash_ledger_note', 'Buku kas berbasis transaksi kas internal. Pembayaran supplier yang sudah terhubung tidak dihitung dua kali.'
  );

  insert into public.external_report_books(
    report_type, scope_type, project_id, rab_division_id, source_finance_recap_id,
    source_recap_number, period_start, period_end, report_title, recipient_name,
    recipient_reference, source_snapshot, source_snapshot_hash, status, created_by
  ) values (
    p_report_type, v_recap.scope_type, v_recap.project_id, v_recap.rab_division_id,
    v_recap.id, v_recap.recap_number, v_recap.period_start, v_recap.period_end,
    coalesce(nullif(trim(coalesce(p_report_title,'')),''), v_recap.report_title),
    trim(p_recipient_name), nullif(trim(coalesce(p_recipient_reference,'')),''),
    v_source_snapshot, md5(v_source_snapshot::text), 'draft', v_actor
  ) returning id, report_number into v_report_id, v_report_number;

  for v_cash in
    select value from jsonb_array_elements(coalesce(v_recap.snapshot->'cash_transactions','[]'::jsonb))
  loop
    v_line_no := v_line_no + 1;
    if coalesce(v_cash->>'direction','') not in ('in','out') then
      raise exception 'Sumber snapshot memiliki arah transaksi kas yang tidak valid.' using errcode='22023';
    end if;
    if coalesce((v_cash->>'amount')::numeric,0) <= 0 then
      raise exception 'Sumber snapshot memiliki nominal transaksi kas yang tidak valid.' using errcode='22023';
    end if;
    insert into public.external_report_ledger_entries(
      report_id, entry_number, source_record_id, transaction_number, transaction_date,
      direction, category, description, amount, payment_method, reference_number,
      project_name_snapshot, division_name_snapshot, status, source_data
    ) values (
      v_report_id, v_line_no,
      coalesce(v_cash->>'id', v_cash->>'transaction_number', 'ROW-'||v_line_no::text),
      nullif(v_cash->>'transaction_number',''),
      coalesce(nullif(v_cash->>'transaction_date','')::date, v_recap.period_start),
      v_cash->>'direction',
      coalesce(nullif(v_cash->>'category',''), 'Transaksi kas'),
      coalesce(nullif(v_cash->>'description',''), 'Tanpa uraian'),
      (v_cash->>'amount')::numeric,
      nullif(v_cash->>'payment_method',''),
      nullif(v_cash->>'reference_number',''),
      nullif(v_cash->>'project_title',''),
      nullif(v_cash->>'division_name',''),
      case when v_cash->>'status'='void' then 'void' else 'confirmed' end,
      v_cash
    );
    v_cash_count := v_cash_count + 1;
  end loop;

  for v_wage in select value from jsonb_array_elements(v_wage_rows)
  loop
    insert into public.external_report_wage_snapshots(
      report_id, source_allocation_id, source_payroll_line_id, employee_number_snapshot,
      employee_name_snapshot, payroll_period_code, payroll_period_start, payroll_period_end,
      line_label_snapshot, base_amount, project_name_snapshot, package_name_snapshot, source_data
    ) values (
      v_report_id,
      v_wage->>'source_allocation_id',
      v_wage->>'source_payroll_line_id',
      nullif(v_wage->>'employee_number',''),
      coalesce(nullif(v_wage->>'employee_name',''), 'Karyawan'),
      coalesce(nullif(v_wage->>'payroll_period_code',''), '—'),
      (v_wage->>'payroll_period_start')::date,
      (v_wage->>'payroll_period_end')::date,
      coalesce(nullif(v_wage->>'line_label',''), 'Penghasilan'),
      coalesce((v_wage->>'base_amount')::numeric,0),
      nullif(v_wage->>'project_name',''),
      nullif(v_wage->>'package_name',''),
      v_wage
    );
    v_wage_count := v_wage_count + 1;
  end loop;

  insert into public.external_report_audit_logs(report_id, action, new_data, changed_by)
  values (v_report_id, 'snapshot_created', jsonb_build_object(
    'source_recap_number', v_recap.recap_number,
    'source_snapshot_hash', md5(v_recap.snapshot::text),
    'cash_entry_count', v_cash_count,
    'wage_allocation_count', v_wage_count
  ), v_actor);

  return jsonb_build_object(
    'id', v_report_id,
    'report_number', v_report_number,
    'status', 'draft',
    'cash_entry_count', v_cash_count,
    'wage_allocation_count', v_wage_count,
    'source_snapshot_hash', md5(v_source_snapshot::text)
  );
end;
$$;

-- 10. Tambahan persentase hanya untuk laporan klien dan selalu ditampilkan sebagai alokasi non-kas.
-- Tidak mengubah nilai upah aktual, payroll, kewajiban, kas, atau laporan internal.
create or replace function public.dahlia_add_external_wage_allocation(
  p_report_id uuid,
  p_wage_snapshot_id uuid,
  p_rate_percent numeric,
  p_presentation_label text,
  p_reason text,
  p_supporting_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.external_report_books%rowtype;
  v_wage public.external_report_wage_snapshots%rowtype;
  v_amount numeric(18,2);
  v_row public.external_report_adjustments%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesi login tidak ditemukan.' using errcode='28000'; end if;
  if not public.dahlia_can_external_reporting('external.report.adjust') then
    raise exception 'Tidak memiliki izin membuat penyesuaian laporan.' using errcode='42501';
  end if;
  select * into v_report from public.external_report_books where id=p_report_id for update;
  if v_report.id is null or v_report.status <> 'draft' then
    raise exception 'Penyesuaian hanya dapat ditambahkan pada laporan berstatus draft.' using errcode='23514';
  end if;
  if v_report.report_type <> 'client_report' then
    raise exception 'Alokasi tambahan hanya tersedia pada laporan klien. SPJ dinas dan dukungan pajak harus mempertahankan nilai aktual dan tidak boleh menambahkan markup ke upah.' using errcode='42501';
  end if;
  if p_rate_percent is null or p_rate_percent <= 0 or p_rate_percent > 100 then
    raise exception 'Persentase alokasi harus lebih dari 0 dan maksimal 100 persen.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_presentation_label,'')),'') is null
     or nullif(trim(coalesce(p_reason,'')),'') is null
     or nullif(trim(coalesce(p_supporting_reference,'')),'') is null then
    raise exception 'Label, alasan, dan referensi pendukung wajib diisi.' using errcode='22023';
  end if;
  select * into v_wage
  from public.external_report_wage_snapshots
  where id=p_wage_snapshot_id and report_id=p_report_id;
  if v_wage.id is null then raise exception 'Snapshot alokasi upah tidak ditemukan pada laporan ini.' using errcode='P0002'; end if;
  v_amount := round(v_wage.base_amount * p_rate_percent / 100, 2);
  if v_amount <= 0 then raise exception 'Nilai alokasi menghasilkan nominal nol.' using errcode='22023'; end if;

  insert into public.external_report_adjustments(
    report_id, wage_snapshot_id, presentation_label, base_amount_snapshot,
    rate_percent, adjustment_amount, reason, supporting_reference, created_by
  ) values (
    p_report_id, p_wage_snapshot_id, trim(p_presentation_label), v_wage.base_amount,
    p_rate_percent, v_amount, trim(p_reason), trim(p_supporting_reference), auth.uid()
  ) returning * into v_row;

  insert into public.external_report_audit_logs(report_id, action, new_data, reason, changed_by)
  values (p_report_id, 'wage_allocation_added', to_jsonb(v_row), trim(p_reason), auth.uid());

  return jsonb_build_object(
    'id', v_row.id,
    'base_amount_snapshot', v_row.base_amount_snapshot,
    'rate_percent', v_row.rate_percent,
    'adjustment_amount', v_row.adjustment_amount,
    'classification', v_row.classification,
    'status', v_row.status
  );
end;
$$;

create or replace function public.dahlia_void_external_wage_allocation(p_adjustment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment public.external_report_adjustments%rowtype;
  v_report public.external_report_books%rowtype;
begin
  if not public.dahlia_can_external_reporting('external.report.adjust') then
    raise exception 'Tidak memiliki izin membatalkan penyesuaian.' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Alasan pembatalan wajib diisi.' using errcode='22023';
  end if;
  select * into v_adjustment from public.external_report_adjustments where id=p_adjustment_id for update;
  if v_adjustment.id is null or v_adjustment.status <> 'active' then
    raise exception 'Penyesuaian tidak ditemukan atau sudah dibatalkan.' using errcode='P0002';
  end if;
  select * into v_report from public.external_report_books where id=v_adjustment.report_id for update;
  if v_report.status <> 'draft' then
    raise exception 'Penyesuaian hanya dapat dibatalkan selama laporan masih draft.' using errcode='23514';
  end if;
  update public.external_report_adjustments
  set status='void', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason)
  where id=p_adjustment_id;
  insert into public.external_report_audit_logs(report_id, action, old_data, reason, changed_by)
  values (v_report.id, 'wage_allocation_voided', to_jsonb(v_adjustment), trim(p_reason), auth.uid());
  return p_adjustment_id;
end;
$$;

-- 11. Kunci/terbitkan/batalkan laporan hanya oleh Direktur atau Administrator.
create or replace function public.dahlia_freeze_external_report(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.external_report_books%rowtype;
begin
  if not public.has_company_role(array['director','admin']::text[]) then
    raise exception 'Hanya Direktur atau Administrator yang dapat mengunci laporan eksternal.' using errcode='42501';
  end if;
  select * into v_row from public.external_report_books where id=p_report_id for update;
  if v_row.id is null or v_row.status <> 'draft' then raise exception 'Hanya draft yang dapat dikunci.' using errcode='23514'; end if;
  update public.external_report_books set status='frozen', frozen_by=auth.uid(), frozen_at=now() where id=p_report_id;
  insert into public.external_report_audit_logs(report_id, action, old_data, new_data, changed_by)
  values (p_report_id, 'report_frozen', jsonb_build_object('status','draft'), jsonb_build_object('status','frozen'), auth.uid());
  return p_report_id;
end;
$$;

create or replace function public.dahlia_issue_external_report(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.external_report_books%rowtype;
begin
  if not public.has_company_role(array['director','admin']::text[]) then
    raise exception 'Hanya Direktur atau Administrator yang dapat menerbitkan laporan eksternal.' using errcode='42501';
  end if;
  select * into v_row from public.external_report_books where id=p_report_id for update;
  if v_row.id is null or v_row.status <> 'frozen' then raise exception 'Laporan harus dikunci sebelum diterbitkan.' using errcode='23514'; end if;
  update public.external_report_books set status='issued', issued_by=auth.uid(), issued_at=now() where id=p_report_id;
  insert into public.external_report_audit_logs(report_id, action, old_data, new_data, changed_by)
  values (p_report_id, 'report_issued', jsonb_build_object('status','frozen'), jsonb_build_object('status','issued'), auth.uid());
  return p_report_id;
end;
$$;

create or replace function public.dahlia_void_external_report(p_report_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.external_report_books%rowtype;
begin
  if not public.has_company_role(array['director','admin']::text[]) then
    raise exception 'Hanya Direktur atau Administrator yang dapat membatalkan laporan eksternal.' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Alasan pembatalan wajib diisi.' using errcode='22023'; end if;
  select * into v_row from public.external_report_books where id=p_report_id for update;
  if v_row.id is null or v_row.status='void' then raise exception 'Laporan tidak ditemukan atau sudah dibatalkan.' using errcode='P0002'; end if;
  update public.external_report_books
  set status='void', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason)
  where id=p_report_id;
  insert into public.external_report_audit_logs(report_id, action, old_data, new_data, reason, changed_by)
  values (p_report_id, 'report_voided', jsonb_build_object('status',v_row.status), jsonb_build_object('status','void'), trim(p_reason), auth.uid());
  return p_report_id;
end;
$$;

-- 12. RLS: pembaca hanya melihat laporan eksternal; mutasi hanya melalui RPC terkontrol.
alter table public.external_report_books enable row level security;
alter table public.external_report_ledger_entries enable row level security;
alter table public.external_report_wage_snapshots enable row level security;
alter table public.external_report_adjustments enable row level security;
alter table public.external_report_audit_logs enable row level security;

create policy external_report_books_read
on public.external_report_books for select to authenticated
using (public.dahlia_can_external_reporting('external.report.read'));
create policy external_report_ledger_read
on public.external_report_ledger_entries for select to authenticated
using (exists (select 1 from public.external_report_books b where b.id=report_id and public.dahlia_can_external_reporting('external.report.read')));
create policy external_report_wage_snapshot_read
on public.external_report_wage_snapshots for select to authenticated
using (exists (select 1 from public.external_report_books b where b.id=report_id and public.dahlia_can_external_reporting('external.report.read')));
create policy external_report_adjustments_read
on public.external_report_adjustments for select to authenticated
using (exists (select 1 from public.external_report_books b where b.id=report_id and public.dahlia_can_external_reporting('external.report.read')));
create policy external_report_audit_read
on public.external_report_audit_logs for select to authenticated
using (public.has_company_role(array['director','admin']::text[]) or public.dahlia_can_external_reporting('external.report.read'));

revoke all on table public.external_report_books, public.external_report_ledger_entries,
  public.external_report_wage_snapshots, public.external_report_adjustments,
  public.external_report_audit_logs from public, anon, authenticated;
grant select on public.external_report_books, public.external_report_ledger_entries,
  public.external_report_wage_snapshots, public.external_report_adjustments,
  public.external_report_audit_logs to authenticated;
revoke all on sequence public.external_report_number_seq from public, anon, authenticated;

revoke all on function public.dahlia_list_external_report_sources() from public, anon;
revoke all on function public.dahlia_create_external_report_snapshot(uuid,text,text,text,text) from public, anon;
revoke all on function public.dahlia_add_external_wage_allocation(uuid,uuid,numeric,text,text,text) from public, anon;
revoke all on function public.dahlia_void_external_wage_allocation(uuid,text) from public, anon;
revoke all on function public.dahlia_freeze_external_report(uuid) from public, anon;
revoke all on function public.dahlia_issue_external_report(uuid) from public, anon;
revoke all on function public.dahlia_void_external_report(uuid,text) from public, anon;
grant execute on function public.dahlia_list_external_report_sources() to authenticated;
grant execute on function public.dahlia_create_external_report_snapshot(uuid,text,text,text,text) to authenticated;
grant execute on function public.dahlia_add_external_wage_allocation(uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.dahlia_void_external_wage_allocation(uuid,text) to authenticated;
grant execute on function public.dahlia_freeze_external_report(uuid) to authenticated;
grant execute on function public.dahlia_issue_external_report(uuid) to authenticated;
grant execute on function public.dahlia_void_external_report(uuid,text) to authenticated;

comment on table public.external_report_books is 'Laporan eksternal dengan snapshot terpisah dari rekap internal. Snapshot sumber tidak berubah setelah dibuat.';
comment on table public.external_report_ledger_entries is 'Salinan baris transaksi kas internal pada saat snapshot dibuat; bukan live view.';
comment on table public.external_report_wage_snapshots is 'Salinan alokasi biaya upah payroll yang disetujui; alokasi biaya bukan bukti kas dibayar.';
comment on table public.external_report_adjustments is 'Komponen alokasi non-kas untuk laporan klien, terpisah dari upah aktual dan dilarang pada SPJ dinas/dukungan pajak.';

notify pgrst, 'reload schema';
commit;
