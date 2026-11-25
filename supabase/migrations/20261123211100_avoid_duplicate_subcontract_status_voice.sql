CREATE OR REPLACE FUNCTION dahlia_private.notify_subcontract_payment_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_id uuid;
  v_project_name text;
  v_subcontractor_name text;
  v_message text;
  v_voice text;
  v_actor_id uuid;
  v_title text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT p.project_id, pr.title, s.legal_name
    INTO v_project_id, v_project_name, v_subcontractor_name
  FROM public.execution_segments es
  JOIN public.project_work_packages p ON p.id = es.package_id
  JOIN public.projects pr ON pr.id = p.project_id
  LEFT JOIN public.subcontractors s ON s.id = es.subcontractor_id
  WHERE es.id = NEW.segment_id;

  v_actor_id := COALESCE(NEW.reviewed_by, auth.uid());
  v_title := CASE WHEN NEW.status = 'approved'
    THEN 'Pengajuan termin disetujui'
    ELSE 'Pengajuan termin belum disetujui'
  END;

  v_message := CASE WHEN NEW.status = 'approved'
    THEN format('Pengajuan termin %s dari %s untuk proyek %s telah disetujui. Kewajiban pembayaran telah diteruskan ke register Keuangan untuk diproses sesuai jadwal.',
      NEW.request_number, COALESCE(v_subcontractor_name, 'mitra terkait'), COALESCE(v_project_name, 'terkait'))
    ELSE format('Pengajuan termin %s dari %s untuk proyek %s belum dapat disetujui. Alasan: %s.',
      NEW.request_number, COALESCE(v_subcontractor_name, 'mitra terkait'), COALESCE(v_project_name, 'terkait'),
      COALESCE(NEW.rejection_reason, 'Silakan hubungi pejabat pemeriksa.'))
  END;

  v_voice := v_message || ' Terima kasih atas koordinasi seluruh pihak.';

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'subcontract-payment-request:' || NEW.id::text || ':' || NEW.status,
    'subcontract_payment_requests', NEW.id, 'subcontract_payment_' || NEW.status,
    v_actor_id, COALESCE((SELECT up.full_name FROM public.user_profiles up WHERE up.id = v_actor_id), 'Pejabat Pemeriksa'),
    v_project_id, COALESCE(v_project_name, 'Proyek terkait'),
    v_title,
    format('%s untuk proyek %s %s.',
      NEW.request_number,
      COALESCE(v_project_name, 'terkait'),
      CASE WHEN NEW.status = 'approved' THEN 'telah disetujui' ELSE 'belum dapat disetujui' END),
    CASE WHEN v_project_id IS NOT NULL THEN '/proyek/' || v_project_id::text ELSE '/keuangan' END,
    jsonb_build_object('request_number', NEW.request_number, 'status', NEW.status)
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_one_user(
    COALESCE(NEW.submitted_by, NEW.created_by),
    v_actor_id,
    'subcontract-payment-request:' || NEW.id::text || ':' || NEW.status,
    v_title,
    v_message,
    'subcontract_payment_request',
    CASE WHEN v_project_id IS NOT NULL THEN '/proyek/' || v_project_id::text ELSE '/keuangan' END,
    v_project_id,
    'subcontract_payment_requests',
    NEW.id,
    CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'normal' END,
    jsonb_build_object('request_number', NEW.request_number, 'status', NEW.status, 'project_name', v_project_name, 'source_table', 'subcontract_payment_requests', 'source_id', NEW.id),
    v_voice
  );

  IF NEW.status = 'approved' THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      ARRAY['finance.payment.manage']::text[],
      v_project_id,
      v_actor_id,
      'subcontract-payment-request:' || NEW.id::text || ':finance',
      'Tagihan termin siap diproses · ' || NEW.request_number,
      format('Pengajuan termin %s untuk proyek %s telah disetujui dan tercatat sebagai kewajiban pembayaran. Mohon staf Keuangan meninjau jadwal serta memproses pembayaran sesuai otorisasi.',
        NEW.request_number, COALESCE(v_project_name, 'terkait')),
      'payment_approval',
      '/keuangan',
      'high',
      jsonb_build_object(
        'source_table', 'subcontract_payment_requests',
        'source_id', NEW.id,
        'request_number', NEW.request_number,
        'project_name', v_project_name,
        'subcontractor_name', v_subcontractor_name,
        'net_amount', COALESCE(NEW.net_amount, NEW.gross_amount - NEW.retention_amount - NEW.deduction_amount)
      ),
      format('Informasi Keuangan. Pengajuan termin %s untuk proyek %s telah disetujui dan diteruskan ke register kewajiban pembayaran. Mohon staf Keuangan melakukan penjadwalan dan pemrosesan sesuai otorisasi.',
        NEW.request_number, COALESCE(v_project_name, 'terkait')),
      true
    );
  END IF;

  RETURN NEW;
END;
$function$
