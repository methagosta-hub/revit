-- Company-wide activity broadcasts and authorized follow-up notifications.

-- Source file mirrors migration 20261123210941.

CREATE OR REPLACE FUNCTION dahlia_private.notify_direct_material_purchase_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_name text;
  v_actor_id uuid;
  v_actor_name text;
  v_items text;
  v_item_count integer;
  v_title text;
  v_message text;
  v_voice text;
  v_event_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
    v_event_status := 'confirmed';
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'void' THEN RETURN NEW; END IF;
    v_event_status := 'void';
  END IF;

  SELECT p.title INTO v_project_name FROM public.projects p WHERE p.id = NEW.project_id;
  SELECT COALESCE(up.full_name,'Petugas Pembelian') INTO v_actor_name
  FROM public.user_profiles up
  WHERE up.id = CASE WHEN v_event_status = 'void' THEN COALESCE(NEW.voided_by,auth.uid()) ELSE NEW.created_by END;
  v_actor_id := CASE WHEN v_event_status = 'void' THEN COALESCE(NEW.voided_by,auth.uid()) ELSE NEW.created_by END;

  SELECT count(*)::integer,
         string_agg(format('%s sebanyak %s %s', i.material_name,
           trim(to_char(i.quantity_received,'FM999999990.###')), i.unit),
           '; ' ORDER BY i.created_at,i.id)
    INTO v_item_count, v_items
  FROM public.project_direct_material_purchase_items i
  WHERE i.purchase_id = NEW.id;

  v_item_count := COALESCE(v_item_count,0);
  v_items := COALESCE(v_items,'Rincian barang belum tersedia');

  v_title := CASE WHEN v_event_status='void'
    THEN 'Pembelian material langsung dibatalkan'
    ELSE 'Pembelian material langsung tercatat'
  END;
  v_message := CASE WHEN v_event_status='void' THEN format(
    'Pembelian langsung %s dari supplier %s untuk proyek %s dibatalkan oleh %s. Alasan: %s.',
    NEW.purchase_number, NEW.supplier_name, COALESCE(v_project_name,'terkait'),
    COALESCE(v_actor_name,'pengguna berwenang'), COALESCE(NEW.void_reason,'Tidak ada catatan alasan.'))
  ELSE format(
    'Pembelian material langsung %s telah dicatat oleh %s untuk proyek %s dari supplier %s. Total nilai Rp %s, %s jenis material. Rincian: %s. Gudang diminta memastikan penerimaan dan pencatatan stok sesuai bukti transaksi.',
    NEW.purchase_number, COALESCE(v_actor_name,'Petugas Pembelian'),
    COALESCE(v_project_name,'terkait'), NEW.supplier_name,
    trim(to_char(NEW.total_amount,'FM999G999G999G990D00')), v_item_count, v_items)
  END;

  v_voice := 'Informasi Pengadaan. ' || v_message;

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'direct-material-purchase:' || NEW.id::text || ':' || v_event_status,
    'project_direct_material_purchases', NEW.id,
    CASE WHEN v_event_status='void' THEN 'direct_material_purchase_voided' ELSE 'direct_material_purchase_confirmed' END,
    v_actor_id, COALESCE(v_actor_name,'Petugas Pembelian'), NEW.project_id,
    COALESCE(v_project_name,'Proyek terkait'), v_title, v_message,
    '/pengadaan/purchasing',
    jsonb_build_object(
      'purchase_number', NEW.purchase_number, 'supplier_name', NEW.supplier_name,
      'total_amount', NEW.total_amount, 'item_count', v_item_count,
      'status', v_event_status, 'voice_text', v_voice,
      'next_responsible_team', 'Tim Gudang dan Keuangan'
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['finance.direct_purchase.manage','warehouse.receive']::text[],
    NEW.project_id, v_actor_id,
    'direct-material-purchase:' || NEW.id::text || ':' || v_event_status || ':follow-up',
    v_title, v_message, 'direct_material_purchase',
    '/pengadaan/purchasing', CASE WHEN v_event_status='void' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'source_table', 'project_direct_material_purchases', 'source_id', NEW.id,
      'purchase_number', NEW.purchase_number, 'supplier_name', NEW.supplier_name,
      'total_amount', NEW.total_amount, 'project_name', v_project_name,
      'status', v_event_status
    ),
    v_voice, true
  );

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION dahlia_private.notify_field_material_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_name text;
  v_actor_name text;
  v_actor_id uuid;
  v_title text;
  v_message text;
  v_voice text;
  v_next_team text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('under_review', 'approved', 'rejected', 'converted', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_actor_id := COALESCE(NEW.reviewed_by, auth.uid());
  SELECT p.title INTO v_project_name
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT COALESCE(up.full_name, 'Petugas Pengadaan') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  v_title := CASE NEW.status
    WHEN 'under_review' THEN 'Permintaan material sedang ditinjau'
    WHEN 'approved' THEN 'Permintaan material disetujui'
    WHEN 'rejected' THEN 'Permintaan material belum disetujui'
    WHEN 'converted' THEN 'Permintaan material diproses menjadi PO'
    ELSE 'Permintaan material dibatalkan'
  END;

  v_next_team := CASE
    WHEN NEW.status = 'approved' THEN 'Tim Purchasing'
    WHEN NEW.status = 'rejected' THEN 'Tim Lapangan untuk perbaikan pengajuan'
    WHEN NEW.status = 'converted' THEN 'Tim Pengadaan untuk pemantauan Purchase Order'
    WHEN NEW.status = 'under_review' THEN 'Pejabat pemeriksa Pengadaan'
    ELSE 'Pemohon dan Tim Pengadaan'
  END;

  v_message := CASE NEW.status
    WHEN 'under_review' THEN format(
      'Permintaan material %s untuk proyek %s sedang ditinjau oleh %s. Tim Pengadaan diminta memeriksa kebutuhan dan ketersediaan material.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'Tim Pengadaan'))
    WHEN 'approved' THEN format(
      'Permintaan material %s untuk proyek %s telah DISETUJUI oleh %s. Tindak lanjut berikutnya menjadi tanggung jawab Tim Purchasing untuk menyiapkan Purchase Order dan meneruskan proses pembelian.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pejabat berwenang'))
    WHEN 'rejected' THEN format(
      'Permintaan material %s untuk proyek %s belum dapat disetujui oleh %s. Alasan: %s. Tim Lapangan diminta memperbaiki pengajuan sesuai catatan pemeriksa.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pejabat pemeriksa'),
      COALESCE(NEW.rejection_reason, 'Silakan koordinasikan dengan Tim Pengadaan.'))
    WHEN 'converted' THEN format(
      'Permintaan material %s untuk proyek %s telah diproses menjadi Purchase Order. Tim Pengadaan melanjutkan pemantauan pemesanan.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'))
    ELSE format(
      'Permintaan material %s untuk proyek %s telah dibatalkan oleh %s.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pengguna berwenang'))
  END;

  v_voice := 'Informasi operasional. ' || v_message ||
    ' Pihak yang perlu menindaklanjuti: ' || v_next_team || '.';

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'field-material-request:' || NEW.id::text || ':' || NEW.status,
    'field_material_requests', NEW.id, 'material_request_' || NEW.status,
    v_actor_id, COALESCE(v_actor_name, 'Petugas Pengadaan'), NEW.project_id,
    COALESCE(v_project_name, 'Proyek terkait'),
    v_title,
    format('%s. Pihak tindak lanjut: %s.', v_message, v_next_team),
    '/pengadaan/permintaan',
    jsonb_build_object(
      'request_number', NEW.request_number,
      'status', NEW.status,
      'approved_by_name', v_actor_name,
      'next_responsible_team', v_next_team,
      'voice_text', v_voice
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_one_user(
    NEW.created_by, v_actor_id,
    'field-material-request:' || NEW.id::text || ':' || NEW.status,
    v_title, v_message, 'material_request', '/pengadaan/permintaan',
    NEW.project_id, 'field_material_requests', NEW.id,
    CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'request_number', NEW.request_number,
      'status', NEW.status,
      'project_name', v_project_name,
      'source_table', 'field_material_requests',
      'source_id', NEW.id
    ),
    v_voice
  );

  IF NEW.status = 'approved' THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['procurement.purchase.create']::text[],
      NEW.project_id,
      v_actor_id,
      'field-material-request:' || NEW.id::text || ':purchasing-follow-up',
      'Tindak lanjut Purchasing · ' || NEW.request_number,
      format(
        'Permintaan material %s untuk proyek %s telah disetujui oleh %s. Tim Purchasing diminta menyiapkan Purchase Order dan memproses pembelian sesuai daftar kebutuhan.',
        NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pejabat berwenang')),
      'procurement_follow_up',
      '/pengadaan/purchasing',
      'high',
      jsonb_build_object(
        'source_table', 'field_material_requests',
        'source_id', NEW.id,
        'request_number', NEW.request_number,
        'status', NEW.status,
        'project_name', v_project_name,
        'approved_by_name', v_actor_name,
        'next_responsible_team', 'Tim Purchasing'
      ),
      v_voice,
      true
    );
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION dahlia_private.notify_payment_transaction_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid;
  v_actor_name text;
  v_project_name text;
  v_project_id uuid;
  v_obligation_count integer;
  v_source_count integer;
  v_source_types text[];
  v_total numeric(18,2);
  v_subcontractors text;
  v_title text;
  v_message text;
  v_voice text;
  v_event_status text;
  v_request record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
    v_event_status := 'confirmed';
    v_actor_id := NEW.created_by;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'void' THEN RETURN NEW; END IF;
    v_event_status := 'void';
    v_actor_id := COALESCE(NEW.voided_by,auth.uid());
  END IF;

  SELECT count(DISTINCT a.obligation_id)::integer,
         COALESCE(sum(a.allocated_amount),0)::numeric(18,2),
         array_agg(DISTINCT o.source_type),
         count(DISTINCT o.source_type)::integer,
         CASE WHEN count(DISTINCT o.project_id)=1 THEN (array_agg(DISTINCT o.project_id))[1] ELSE NULL END,
         CASE WHEN count(DISTINCT o.project_id)=1 THEN (array_agg(DISTINCT p.title))[1] ELSE 'Lintas proyek / perusahaan' END,
         string_agg(DISTINCT s.legal_name, ', ') FILTER (WHERE o.payee_type='subcontractor')
    INTO v_obligation_count, v_total, v_source_types, v_source_count,
         v_project_id, v_project_name, v_subcontractors
  FROM public.payment_transaction_allocations a
  JOIN public.payment_obligations o ON o.id = a.obligation_id
  LEFT JOIN public.projects p ON p.id = o.project_id
  LEFT JOIN public.subcontractors s ON s.id = o.subcontractor_id
  WHERE a.payment_transaction_id = NEW.id;

  v_obligation_count := COALESCE(v_obligation_count,0);
  v_total := COALESCE(v_total,NEW.amount);
  IF v_obligation_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(up.full_name,'Petugas Keuangan') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  v_title := CASE WHEN v_event_status='void'
    THEN 'Transaksi pembayaran dibatalkan'
    ELSE 'Pembayaran berhasil dibukukan'
  END;

  v_message := CASE WHEN v_event_status='void' THEN format(
    'Transaksi pembayaran %s senilai Rp %s dibatalkan oleh %s. Alasan: %s. Mohon Keuangan melakukan rekonsiliasi register kas dan kewajiban.',
    NEW.payment_number, trim(to_char(v_total,'FM999G999G999G990D00')),
    COALESCE(v_actor_name,'Keuangan'), COALESCE(NEW.void_reason,'Tidak ada catatan alasan.'))
  ELSE format(
    'Transaksi pembayaran %s telah dibukukan oleh %s pada %s sebesar Rp %s untuk %s kewajiban. %s %s',
    NEW.payment_number, COALESCE(v_actor_name,'Petugas Keuangan'),
    to_char(NEW.payment_date,'DD Mon YYYY'),
    trim(to_char(v_total,'FM999G999G999G990D00')),
    v_obligation_count,
    CASE WHEN 'subcontract_request'=ANY(COALESCE(v_source_types,ARRAY[]::varchar[]))
      THEN 'Penerima subkontraktor: ' || COALESCE(v_subcontractors,'mitra terkait') || '.'
      ELSE 'Pencatatan mencakup kewajiban perusahaan sesuai register pembayaran.' END,
    'Status transaksi: TERKONFIRMASI.'
  ) END;

  v_voice := 'Informasi Keuangan. ' || v_message;

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'payment-transaction:' || NEW.id::text || ':' || v_event_status,
    'payment_transactions', NEW.id,
    CASE WHEN v_event_status='void' THEN 'payment_transaction_voided' ELSE 'payment_transaction_confirmed' END,
    v_actor_id, COALESCE(v_actor_name,'Petugas Keuangan'), v_project_id,
    COALESCE(v_project_name,'Perusahaan'), v_title, v_message, '/keuangan',
    jsonb_build_object(
      'payment_number', NEW.payment_number, 'amount', v_total,
      'obligation_count', v_obligation_count, 'source_types', v_source_types,
      'subcontractors', v_subcontractors, 'status', v_event_status,
      'voice_text', v_voice
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['finance.payment.manage','payroll.manage','project.manage']::text[],
    v_project_id, v_actor_id,
    'payment-transaction:' || NEW.id::text || ':' || v_event_status || ':follow-up',
    v_title, v_message, 'payment_transaction',
    '/keuangan', CASE WHEN v_event_status='void' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'source_table', 'payment_transactions', 'source_id', NEW.id,
      'payment_number', NEW.payment_number, 'amount', v_total,
      'obligation_count', v_obligation_count, 'project_name', v_project_name,
      'status', v_event_status
    ),
    v_voice, true
  );

  -- Keep each subcontractor request submitter informed when the approved obligation is actually paid.
  IF v_event_status='confirmed' THEN
    FOR v_request IN
      SELECT DISTINCT
        COALESCE(r.submitted_by,r.created_by) AS user_id,
        r.request_number
      FROM public.payment_transaction_allocations a
      JOIN public.payment_obligations o ON o.id=a.obligation_id
      JOIN public.subcontract_payment_requests r ON r.id=o.subcontract_payment_request_id
      WHERE a.payment_transaction_id=NEW.id
        AND o.source_type='subcontract_request'
        AND COALESCE(r.submitted_by,r.created_by) IS NOT NULL
    LOOP
      PERFORM dahlia_private.ops_notify_one_user(
        v_request.user_id, v_actor_id,
        'payment-transaction:' || NEW.id::text || ':requester:' || v_request.request_number,
        'Pembayaran termin telah diproses · ' || v_request.request_number,
        format('Pembayaran untuk pengajuan termin %s telah dibukukan oleh %s pada tanggal %s. Nilai transaksi Rp %s. Informasi ini menjadi konfirmasi bahwa pembayaran telah diproses oleh Keuangan.',
          v_request.request_number, COALESCE(v_actor_name,'Keuangan'),
          to_char(NEW.payment_date,'DD Mon YYYY'),
          trim(to_char(v_total,'FM999G999G999G990D00'))),
        'payment_confirmation', '/keuangan', v_project_id,
        'payment_transactions', NEW.id, 'normal',
        jsonb_build_object(
          'payment_number', NEW.payment_number,
          'request_number', v_request.request_number,
          'project_name', v_project_name
        ),
        v_voice
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION dahlia_private.notify_project_material_receipt_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_id uuid;
  v_project_name text;
  v_po_number text;
  v_supplier_name text;
  v_actor_id uuid;
  v_actor_name text;
  v_items text;
  v_item_count integer;
  v_title text;
  v_message text;
  v_voice text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'void' THEN RETURN NEW; END IF;
  END IF;

  SELECT po.project_id, p.title, po.po_number, s.name
    INTO v_project_id, v_project_name, v_po_number, v_supplier_name
  FROM public.project_purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  WHERE po.id = NEW.purchase_order_id;

  v_actor_id := CASE WHEN NEW.status='void' THEN COALESCE(auth.uid(),NEW.received_by) ELSE NEW.received_by END;
  SELECT COALESCE(up.full_name,'Petugas Gudang') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  SELECT count(*)::integer,
         string_agg(format('%s diterima %s unit', poi.material_name,
           trim(to_char(ri.quantity_accepted,'FM999999990.###'))),
           '; ' ORDER BY poi.sort_order)
    INTO v_item_count, v_items
  FROM public.project_material_receipt_items ri
  JOIN public.project_purchase_order_items poi ON poi.id = ri.purchase_order_item_id
  WHERE ri.receipt_id = NEW.id;

  v_item_count := COALESCE(v_item_count,0);
  v_items := COALESCE(v_items,'Rincian barang belum tersedia');
  v_title := CASE WHEN NEW.status='void' THEN 'Penerimaan material dibatalkan' ELSE 'Material pesanan telah diterima' END;
  v_message := CASE WHEN NEW.status='void' THEN format(
    'Penerimaan %s untuk PO %s pada proyek %s dibatalkan. Gudang dan Purchasing diminta memeriksa kembali saldo serta dokumen penerimaan.',
    NEW.receipt_number, COALESCE(v_po_number,'-'), COALESCE(v_project_name,'terkait'))
  ELSE format(
    'Penerimaan material %s telah dicatat oleh %s untuk PO %s dari supplier %s pada proyek %s. Rincian: %s. Gudang diminta memastikan kuantitas diterima, barang rusak, dan saldo stok sudah sesuai.',
    NEW.receipt_number, COALESCE(v_actor_name,'Petugas Gudang'),
    COALESCE(v_po_number,'-'), COALESCE(v_supplier_name,'supplier terkait'),
    COALESCE(v_project_name,'terkait'), v_items)
  END;
  v_voice := 'Informasi Gudang. ' || v_message;

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'material-receipt:' || NEW.id::text || ':' || NEW.status,
    'project_material_receipts', NEW.id,
    CASE WHEN NEW.status='void' THEN 'material_receipt_voided' ELSE 'material_receipt_confirmed' END,
    v_actor_id, COALESCE(v_actor_name,'Petugas Gudang'), v_project_id,
    COALESCE(v_project_name,'Proyek terkait'), v_title, v_message,
    '/gudang/penerimaan',
    jsonb_build_object(
      'receipt_number', NEW.receipt_number, 'po_number', v_po_number,
      'supplier_name', v_supplier_name, 'item_count', v_item_count,
      'status', NEW.status, 'voice_text', v_voice,
      'next_responsible_team', 'Tim Gudang dan Purchasing'
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['warehouse.receive','procurement.purchase.create','project.manage']::text[],
    v_project_id, v_actor_id,
    'material-receipt:' || NEW.id::text || ':' || NEW.status || ':follow-up',
    v_title, v_message, 'material_receipt',
    '/gudang/penerimaan', CASE WHEN NEW.status='void' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'source_table', 'project_material_receipts', 'source_id', NEW.id,
      'receipt_number', NEW.receipt_number, 'po_number', v_po_number,
      'project_name', v_project_name, 'supplier_name', v_supplier_name,
      'status', NEW.status
    ),
    v_voice, true
  );

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION dahlia_private.notify_project_purchase_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_project_name text;
  v_supplier_name text;
  v_actor_id uuid;
  v_actor_name text;
  v_items text;
  v_item_count integer;
  v_title text;
  v_message text;
  v_voice text;
  v_next_team text;
  v_event_key text;
BEGIN
  v_status := NEW.status;
  IF TG_OP = 'INSERT' THEN
    IF v_status <> 'pending_approval' THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Receiving is announced from the receipt record so the responsible warehouse user is identified.
  IF v_status NOT IN ('pending_approval', 'approved', 'ordered', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT p.title INTO v_project_name
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT s.name INTO v_supplier_name
  FROM public.suppliers s WHERE s.id = NEW.supplier_id;

  SELECT count(*)::integer,
         string_agg(
           format('%s sebanyak %s %s', i.material_name,
             trim(to_char(i.quantity_ordered, 'FM999999990.###')), i.unit),
           '; ' ORDER BY i.sort_order
         )
    INTO v_item_count, v_items
  FROM public.project_purchase_order_items i
  WHERE i.purchase_order_id = NEW.id;

  v_item_count := COALESCE(v_item_count, 0);
  v_items := COALESCE(v_items, 'Rincian material tidak tersedia');

  v_actor_id := CASE
    WHEN v_status = 'pending_approval' THEN NEW.created_by
    WHEN v_status = 'approved' THEN COALESCE(NEW.approved_by, auth.uid())
    ELSE COALESCE(auth.uid(), NEW.created_by)
  END;

  SELECT COALESCE(up.full_name, 'Pengguna Dahlia') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  v_event_key := 'purchase-order:' || NEW.id::text || ':' || v_status;

  v_title := CASE v_status
    WHEN 'pending_approval' THEN 'Purchase Order menunggu persetujuan'
    WHEN 'approved' THEN 'Purchase Order telah disetujui'
    WHEN 'ordered' THEN 'Purchase Order telah dipesan'
    ELSE 'Purchase Order dibatalkan'
  END;

  v_next_team := CASE v_status
    WHEN 'pending_approval' THEN 'Direktur / Administrator yang memiliki kewenangan persetujuan'
    WHEN 'approved' THEN 'Tim Purchasing untuk menerbitkan pesanan kepada supplier'
    WHEN 'ordered' THEN 'Tim Gudang untuk menyiapkan penerimaan barang'
    ELSE 'Tim Purchasing untuk menutup proses pemesanan'
  END;

  v_message := CASE v_status
    WHEN 'pending_approval' THEN format(
      'Purchase Order %s untuk proyek %s diajukan oleh %s kepada supplier %s dengan %s jenis material. Rincian: %s. Nilai pesanan Rp %s. Menunggu persetujuan pejabat yang berwenang.',
      NEW.po_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'Purchasing'),
      COALESCE(v_supplier_name, 'supplier terkait'), v_item_count, v_items,
      trim(to_char(NEW.subtotal, 'FM999G999G999G990D00')))
    WHEN 'approved' THEN format(
      'Purchase Order %s untuk proyek %s telah DISETUJUI oleh %s. Supplier: %s. Nilai pesanan Rp %s. Tindak lanjut berikutnya: Tim Purchasing menerbitkan pesanan dan menginformasikan jadwal pengiriman kepada Gudang.',
      NEW.po_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pejabat berwenang'),
      COALESCE(v_supplier_name, 'supplier terkait'), trim(to_char(NEW.subtotal, 'FM999G999G999G990D00')))
    WHEN 'ordered' THEN format(
      'Purchase Order %s untuk proyek %s telah dipesan kepada supplier %s oleh %s. Gudang diminta memantau jadwal kedatangan dan menyiapkan proses penerimaan barang.',
      NEW.po_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_supplier_name, 'supplier terkait'),
      COALESCE(v_actor_name, 'Tim Purchasing'))
    ELSE format(
      'Purchase Order %s untuk proyek %s dibatalkan oleh %s. Tim Purchasing diminta menghentikan tindak lanjut pemesanan dan menginformasikan pihak terkait.',
      NEW.po_number, COALESCE(v_project_name, 'terkait'), COALESCE(v_actor_name, 'pengguna berwenang'))
  END;

  v_voice := 'Informasi Pengadaan. ' || v_message ||
    ' Pihak yang perlu menindaklanjuti: ' || v_next_team || '.';

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    v_event_key, 'project_purchase_orders', NEW.id,
    'purchase_order_' || v_status, v_actor_id, COALESCE(v_actor_name, 'Pengguna Dahlia'),
    NEW.project_id, COALESCE(v_project_name, 'Proyek terkait'),
    v_title, v_message, '/pengadaan/purchase-order',
    jsonb_build_object(
      'po_number', NEW.po_number,
      'status', v_status,
      'supplier_name', v_supplier_name,
      'item_count', v_item_count,
      'subtotal', NEW.subtotal,
      'next_responsible_team', v_next_team,
      'voice_text', v_voice
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  IF NEW.created_by IS NOT NULL THEN
    PERFORM dahlia_private.ops_notify_one_user(
      NEW.created_by, v_actor_id,
      v_event_key || ':creator',
      v_title, v_message, 'purchase_order', '/pengadaan/purchase-order',
      NEW.project_id, 'project_purchase_orders', NEW.id,
      CASE WHEN v_status = 'cancelled' THEN 'high' ELSE 'normal' END,
      jsonb_build_object(
        'po_number', NEW.po_number, 'status', v_status,
        'project_name', v_project_name, 'supplier_name', v_supplier_name,
        'source_table', 'project_purchase_orders', 'source_id', NEW.id,
        'next_responsible_team', v_next_team
      ),
      v_voice
    );
  END IF;

  IF v_status = 'pending_approval' THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['procurement.purchase.approve']::text[],
      NEW.project_id, v_actor_id, v_event_key || ':approval',
      'Persetujuan diperlukan · ' || NEW.po_number,
      v_message || ' Mohon lakukan pemeriksaan dan persetujuan sesuai kewenangan.',
      'purchase_order_approval', '/pengadaan/purchase-order', 'high',
      jsonb_build_object(
        'source_table', 'project_purchase_orders', 'source_id', NEW.id,
        'po_number', NEW.po_number, 'project_name', v_project_name,
        'supplier_name', v_supplier_name, 'next_responsible_team', v_next_team
      ),
      v_voice, true
    );
  ELSIF v_status = 'approved' THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['procurement.purchase.create']::text[],
      NEW.project_id, v_actor_id, v_event_key || ':purchasing',
      'PO siap diproses Purchasing · ' || NEW.po_number,
      v_message || ' Tim Purchasing diminta menerbitkan pesanan kepada supplier.',
      'purchase_order_follow_up', '/pengadaan/purchase-order', 'high',
      jsonb_build_object(
        'source_table', 'project_purchase_orders', 'source_id', NEW.id,
        'po_number', NEW.po_number, 'project_name', v_project_name,
        'supplier_name', v_supplier_name, 'next_responsible_team', v_next_team
      ),
      v_voice, true
    );
  ELSIF v_status = 'ordered' THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['warehouse.receive']::text[],
      NEW.project_id, v_actor_id, v_event_key || ':warehouse',
      'Persiapan penerimaan barang · ' || NEW.po_number,
      v_message || ' Mohon Gudang memantau jadwal tiba dan menyiapkan penerimaan material.',
      'warehouse_receipt_preparation', '/gudang/penerimaan', 'normal',
      jsonb_build_object(
        'source_table', 'project_purchase_orders', 'source_id', NEW.id,
        'po_number', NEW.po_number, 'project_name', v_project_name,
        'supplier_name', v_supplier_name, 'next_responsible_team', 'Gudang'
      ),
      v_voice, true
    );
  ELSE
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['procurement.purchase.create','procurement.purchase.approve']::text[],
      NEW.project_id, v_actor_id, v_event_key || ':cancelled',
      'Tindak lanjut pembatalan PO · ' || NEW.po_number,
      v_message, 'purchase_order_cancelled', '/pengadaan/purchase-order', 'high',
      jsonb_build_object(
        'source_table', 'project_purchase_orders', 'source_id', NEW.id,
        'po_number', NEW.po_number, 'project_name', v_project_name,
        'next_responsible_team', 'Tim Purchasing'
      ),
      v_voice, true
    );
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION dahlia_private.notify_project_supplier_payment_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_event_status text;
  v_project_name text;
  v_supplier_name text;
  v_po_number text;
  v_po_subtotal numeric(15,2);
  v_total_paid numeric(15,2);
  v_remaining numeric(15,2);
  v_actor_id uuid;
  v_actor_name text;
  v_title text;
  v_message text;
  v_voice text;
  v_next_team text;
  v_event_key text;
  v_po_creator uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
    v_event_status := 'paid';
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'void' THEN
      RETURN NEW;
    END IF;
    v_event_status := 'void';
  END IF;

  SELECT p.title, po.po_number, po.subtotal, po.created_by
    INTO v_project_name, v_po_number, v_po_subtotal, v_po_creator
  FROM public.project_purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.id = NEW.purchase_order_id;

  SELECT s.name INTO v_supplier_name
  FROM public.suppliers s WHERE s.id = NEW.supplier_id;

  SELECT COALESCE(sum(sp.amount),0)::numeric(15,2) INTO v_total_paid
  FROM public.project_supplier_payments sp
  WHERE sp.purchase_order_id = NEW.purchase_order_id
    AND sp.status = 'paid';

  v_remaining := greatest(COALESCE(v_po_subtotal,0) - COALESCE(v_total_paid,0),0);
  v_actor_id := CASE WHEN v_event_status = 'void' THEN COALESCE(NEW.voided_by,auth.uid()) ELSE NEW.created_by END;

  SELECT COALESCE(up.full_name, 'Petugas Keuangan') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  v_event_key := 'supplier-payment:' || NEW.id::text || ':' || v_event_status;
  v_next_team := CASE
    WHEN v_event_status = 'void' THEN 'Tim Keuangan dan Purchasing untuk rekonsiliasi'
    WHEN v_remaining <= 0.000001 THEN 'Tim Keuangan dan Purchasing untuk menutup administrasi PO'
    ELSE 'Tim Keuangan untuk memantau sisa pembayaran PO'
  END;

  v_title := CASE
    WHEN v_event_status = 'void' THEN 'Pembayaran supplier dibatalkan'
    WHEN v_remaining <= 0.000001 THEN 'Purchase Order telah lunas dibayar'
    ELSE 'Pembayaran supplier berhasil dicatat'
  END;

  v_message := CASE
    WHEN v_event_status = 'void' THEN format(
      'Pembayaran %s untuk PO %s kepada supplier %s pada proyek %s dibatalkan oleh %s. Alasan: %s. Mohon lakukan rekonsiliasi catatan pembayaran.',
      NEW.payment_number, COALESCE(v_po_number,'-'), COALESCE(v_supplier_name,'supplier terkait'),
      COALESCE(v_project_name,'terkait'), COALESCE(v_actor_name,'Keuangan'),
      COALESCE(NEW.void_reason,'Tidak ada catatan alasan.'))
    ELSE format(
      'Pembayaran supplier %s kepada %s untuk PO %s pada proyek %s telah DICATAT oleh %s sebesar Rp %s. Total pembayaran yang sudah dibukukan untuk PO ini Rp %s dari nilai pesanan Rp %s. %s',
      NEW.payment_number, COALESCE(v_supplier_name,'supplier terkait'),
      COALESCE(v_po_number,'-'), COALESCE(v_project_name,'terkait'),
      COALESCE(v_actor_name,'Petugas Keuangan'),
      trim(to_char(NEW.amount,'FM999G999G999G990D00')),
      trim(to_char(v_total_paid,'FM999G999G999G990D00')),
      trim(to_char(COALESCE(v_po_subtotal,0),'FM999G999G999G990D00')),
      CASE WHEN v_remaining <= 0.000001 THEN
        'Status pembayaran Purchase Order: LUNAS.'
      ELSE
        'Sisa kewajiban pembayaran Purchase Order: Rp ' || trim(to_char(v_remaining,'FM999G999G999G990D00')) || '.'
      END
    )
  END;

  v_voice := 'Informasi Keuangan. ' || v_message ||
    ' Pihak yang perlu menindaklanjuti: ' || v_next_team || '.';

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    v_event_key, 'project_supplier_payments', NEW.id,
    CASE WHEN v_event_status = 'void' THEN 'supplier_payment_voided' ELSE 'supplier_payment_paid' END,
    v_actor_id, COALESCE(v_actor_name,'Petugas Keuangan'), NEW.project_id,
    COALESCE(v_project_name,'Proyek terkait'), v_title, v_message,
    '/keuangan',
    jsonb_build_object(
      'payment_number', NEW.payment_number, 'po_number', v_po_number,
      'supplier_name', v_supplier_name, 'amount', NEW.amount,
      'total_paid', v_total_paid, 'po_subtotal', v_po_subtotal,
      'remaining_amount', v_remaining, 'status', v_event_status,
      'next_responsible_team', v_next_team, 'voice_text', v_voice
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  IF v_po_creator IS NOT NULL THEN
    PERFORM dahlia_private.ops_notify_one_user(
      v_po_creator, v_actor_id, v_event_key || ':po-creator',
      v_title, v_message, 'supplier_payment', '/pengadaan/purchase-order',
      NEW.project_id, 'project_supplier_payments', NEW.id,
      CASE WHEN v_event_status = 'void' THEN 'high' ELSE 'normal' END,
      jsonb_build_object(
        'source_table', 'project_supplier_payments', 'source_id', NEW.id,
        'payment_number', NEW.payment_number, 'po_number', v_po_number,
        'supplier_name', v_supplier_name, 'amount', NEW.amount,
        'project_name', v_project_name, 'status', v_event_status
      ),
      v_voice
    );
  END IF;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['finance.payment.manage','procurement.purchase.create']::text[],
    NEW.project_id, v_actor_id, v_event_key || ':office-follow-up',
    v_title, v_message, 'supplier_payment',
    '/keuangan', CASE WHEN v_event_status = 'void' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'source_table', 'project_supplier_payments', 'source_id', NEW.id,
      'payment_number', NEW.payment_number, 'po_number', v_po_number,
      'supplier_name', v_supplier_name, 'amount', NEW.amount,
      'project_name', v_project_name, 'status', v_event_status,
      'next_responsible_team', v_next_team
    ),
    v_voice, true
  );

  RETURN NEW;
END;
$function$


DROP TRIGGER IF EXISTS trg_payment_transaction_created_ops ON public.payment_transactions;

CREATE CONSTRAINT TRIGGER trg_payment_transaction_created_ops AFTER INSERT ON public.payment_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_payment_transaction_event();

DROP TRIGGER IF EXISTS trg_payment_transaction_status_ops ON public.payment_transactions;

CREATE CONSTRAINT TRIGGER trg_payment_transaction_status_ops AFTER UPDATE ON public.payment_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status)::text IS DISTINCT FROM (new.status)::text)) EXECUTE FUNCTION dahlia_private.notify_payment_transaction_event();

DROP TRIGGER IF EXISTS trg_direct_material_purchase_created_ops ON public.project_direct_material_purchases;

CREATE CONSTRAINT TRIGGER trg_direct_material_purchase_created_ops AFTER INSERT ON public.project_direct_material_purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_direct_material_purchase_event();

DROP TRIGGER IF EXISTS trg_direct_material_purchase_status_ops ON public.project_direct_material_purchases;

CREATE CONSTRAINT TRIGGER trg_direct_material_purchase_status_ops AFTER UPDATE ON public.project_direct_material_purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status)::text IS DISTINCT FROM (new.status)::text)) EXECUTE FUNCTION dahlia_private.notify_direct_material_purchase_event();

DROP TRIGGER IF EXISTS trg_material_receipt_created_ops ON public.project_material_receipts;

CREATE CONSTRAINT TRIGGER trg_material_receipt_created_ops AFTER INSERT ON public.project_material_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_project_material_receipt_event();

DROP TRIGGER IF EXISTS trg_material_receipt_status_ops ON public.project_material_receipts;

CREATE CONSTRAINT TRIGGER trg_material_receipt_status_ops AFTER UPDATE ON public.project_material_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status)::text IS DISTINCT FROM (new.status)::text)) EXECUTE FUNCTION dahlia_private.notify_project_material_receipt_event();

DROP TRIGGER IF EXISTS trg_purchase_order_created_ops ON public.project_purchase_orders;

CREATE CONSTRAINT TRIGGER trg_purchase_order_created_ops AFTER INSERT ON public.project_purchase_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_project_purchase_order_event();

DROP TRIGGER IF EXISTS trg_purchase_order_status_ops ON public.project_purchase_orders;

CREATE CONSTRAINT TRIGGER trg_purchase_order_status_ops AFTER UPDATE ON public.project_purchase_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status)::text IS DISTINCT FROM (new.status)::text)) EXECUTE FUNCTION dahlia_private.notify_project_purchase_order_event();

DROP TRIGGER IF EXISTS trg_project_supplier_payment_created_ops ON public.project_supplier_payments;

CREATE CONSTRAINT TRIGGER trg_project_supplier_payment_created_ops AFTER INSERT ON public.project_supplier_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_project_supplier_payment_event();

DROP TRIGGER IF EXISTS trg_project_supplier_payment_status_ops ON public.project_supplier_payments;

CREATE CONSTRAINT TRIGGER trg_project_supplier_payment_status_ops AFTER UPDATE ON public.project_supplier_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status)::text IS DISTINCT FROM (new.status)::text)) EXECUTE FUNCTION dahlia_private.notify_project_supplier_payment_event();

REVOKE ALL ON FUNCTION dahlia_private.notify_project_purchase_order_event() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION dahlia_private.notify_project_supplier_payment_event() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION dahlia_private.notify_direct_material_purchase_event() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION dahlia_private.notify_project_material_receipt_event() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION dahlia_private.notify_payment_transaction_event() FROM PUBLIC, anon, authenticated;