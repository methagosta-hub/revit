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
  v_source_types varchar[];
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
