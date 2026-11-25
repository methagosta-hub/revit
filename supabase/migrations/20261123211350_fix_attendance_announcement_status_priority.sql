CREATE OR REPLACE FUNCTION dahlia_private.notify_personnel_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_old jsonb;
  v_id uuid;
  v_project_id uuid;
  v_project_name text;
  v_entity_name text;
  v_actor_id uuid;
  v_actor_name text;
  v_status text;
  v_previous_status text;
  v_event_type text;
  v_title text;
  v_message text;
  v_voice text;
  v_target text;
  v_next_team text;
  v_permissions text[] := ARRAY[]::text[];
  v_notify_user uuid;
  v_category text := 'personnel_activity';
  v_extra jsonb := '{}'::jsonb;
BEGIN
  v_id := NULLIF(v_row ->> 'id','')::uuid;
  v_status := v_row ->> 'status';
  v_project_id := NULLIF(v_row ->> 'project_id','')::uuid;
  v_actor_id := COALESCE(
    NULLIF(v_row ->> 'updated_by','')::uuid,
    NULLIF(v_row ->> 'created_by','')::uuid,
    auth.uid()
  );

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_previous_status := v_old ->> 'status';
  END IF;

  SELECT COALESCE(up.full_name,'Pengguna Dahlia') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  IF TG_TABLE_NAME = 'employees' THEN
    IF TG_OP = 'UPDATE' AND v_status IS NOT DISTINCT FROM v_previous_status THEN
      RETURN NEW;
    END IF;
    v_entity_name := COALESCE(v_row ->> 'full_name','Karyawan');
    v_event_type := CASE WHEN TG_OP='INSERT' THEN 'employee_created' ELSE 'employee_status_changed' END;
    v_title := CASE WHEN TG_OP='INSERT' THEN 'Data karyawan baru tercatat' ELSE 'Status karyawan diperbarui' END;
    v_message := format('Data karyawan %s %s oleh %s. Status saat ini: %s. HR diminta memastikan data dan penempatan administrasi tetap mutakhir.',
      v_entity_name, CASE WHEN TG_OP='INSERT' THEN 'telah ditambahkan' ELSE 'mengalami perubahan status' END,
      COALESCE(v_actor_name,'HR'), COALESCE(v_status,'belum ditentukan'));
    v_voice := 'Informasi Personalia. ' || v_message;
    v_target := '/personalia/karyawan';
    v_next_team := 'HR / Personalia';
    v_permissions := ARRAY['payroll.manage']::text[];
    v_extra := jsonb_build_object('employee_number',v_row ->> 'employee_number','status',v_status);

  ELSIF TG_TABLE_NAME = 'employee_work_agreements' THEN
    IF TG_OP = 'UPDATE' AND v_status IS NOT DISTINCT FROM v_previous_status THEN
      RETURN NEW;
    END IF;
    SELECT e.full_name INTO v_entity_name
    FROM public.employees e
    WHERE e.id = NULLIF(v_row ->> 'employee_id','')::uuid;
    v_entity_name := COALESCE(v_entity_name,'Karyawan terkait');
    v_event_type := CASE WHEN TG_OP='INSERT' THEN 'employee_agreement_created' ELSE 'employee_agreement_status_changed' END;
    v_title := CASE WHEN TG_OP='INSERT' THEN 'Dokumen perjanjian kerja tercatat' ELSE 'Status perjanjian kerja diperbarui' END;
    v_message := format('Perjanjian kerja %s nomor %s untuk %s %s oleh %s. Status: %s. HR diminta memantau kelengkapan dokumen dan tanggal berlaku.',
      COALESCE(v_row ->> 'agreement_title',''), COALESCE(v_row ->> 'agreement_number','-'),
      v_entity_name, CASE WHEN TG_OP='INSERT' THEN 'telah dibuat' ELSE 'mengalami perubahan status' END,
      COALESCE(v_actor_name,'HR'), COALESCE(v_status,'belum ditentukan'));
    v_voice := 'Informasi Personalia. ' || v_message;
    v_target := '/personalia/kontrak-upah';
    v_next_team := 'HR / Personalia';
    v_permissions := ARRAY['payroll.manage']::text[];
    v_extra := jsonb_build_object('agreement_number',v_row ->> 'agreement_number','status',v_status);

  ELSIF TG_TABLE_NAME = 'employee_daily_assignments' THEN
    IF TG_OP = 'UPDATE' AND v_status IS NOT DISTINCT FROM v_previous_status THEN
      RETURN NEW;
    END IF;
    SELECT e.full_name INTO v_entity_name
    FROM public.employees e
    WHERE e.id = NULLIF(v_row ->> 'employee_id','')::uuid;
    v_entity_name := COALESCE(v_entity_name,'Karyawan terkait');
    SELECT p.title INTO v_project_name
    FROM public.projects p WHERE p.id = v_project_id;
    v_event_type := CASE WHEN TG_OP='INSERT' THEN 'personnel_assignment_created' ELSE 'personnel_assignment_status_changed' END;
    v_title := CASE WHEN TG_OP='INSERT' THEN 'Penugasan personel baru' ELSE 'Status penugasan personel diperbarui' END;
    v_message := format('Penugasan %s untuk %s pada %s tanggal %s %s oleh %s. Status: %s. Mohon atasan terkait memastikan pelaksanaan dan kehadiran sesuai jadwal.',
      COALESCE(v_row ->> 'assignment_number','-'), v_entity_name,
      COALESCE(v_project_name,v_row ->> 'location_name','lokasi kerja'),
      COALESCE(v_row ->> 'assignment_date','-'),
      CASE WHEN TG_OP='INSERT' THEN 'telah dibuat' ELSE 'diperbarui' END,
      COALESCE(v_actor_name,'HR / Pengawas'), COALESCE(v_status,'belum ditentukan'));
    v_voice := 'Informasi Penugasan Personalia. ' || v_message;
    v_target := '/personalia/penugasan-harian';
    v_next_team := 'HR dan atasan proyek terkait';
    v_permissions := ARRAY['attendance.schedule.manage','project.manage']::text[];
    v_extra := jsonb_build_object('assignment_number',v_row ->> 'assignment_number','employee_name',v_entity_name,'status',v_status);

  ELSIF TG_TABLE_NAME = 'attendance_records' THEN
    v_status := v_row ->> 'approval_status';
    IF v_row ->> 'approval_status' NOT IN ('submitted','verified','rejected') THEN
      RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' AND v_row ->> 'approval_status' IS NOT DISTINCT FROM v_old ->> 'approval_status' THEN
      RETURN NEW;
    END IF;
    v_project_id := NULLIF(v_row ->> 'record_origin_project_id','')::uuid;
    SELECT e.full_name INTO v_entity_name
    FROM public.employees e
    WHERE e.id = NULLIF(v_row ->> 'employee_id','')::uuid;
    v_entity_name := COALESCE(v_entity_name,'Karyawan terkait');
    SELECT p.title INTO v_project_name
    FROM public.projects p WHERE p.id = v_project_id;

    IF v_row ->> 'approval_status'='submitted' THEN
      v_actor_id := COALESCE(NULLIF(v_row ->> 'created_by','')::uuid,auth.uid());
      v_next_team := 'HR / Personalia dan atasan yang berwenang memverifikasi';
      v_permissions := ARRAY['attendance.manage','attendance.read']::text[];
      v_title := 'Laporan kehadiran menunggu verifikasi';
    ELSIF v_row ->> 'approval_status'='verified' THEN
      v_actor_id := COALESCE(NULLIF(v_row ->> 'verified_by','')::uuid,auth.uid());
      v_next_team := 'HR untuk rekapitulasi kehadiran';
      v_title := 'Laporan kehadiran telah diverifikasi';
      v_notify_user := NULLIF(v_row ->> 'created_by','')::uuid;
    ELSE
      v_actor_id := COALESCE(NULLIF(v_row ->> 'verified_by','')::uuid,auth.uid());
      v_next_team := 'Petugas pencatat untuk perbaikan data';
      v_title := 'Laporan kehadiran perlu diperbaiki';
      v_notify_user := NULLIF(v_row ->> 'created_by','')::uuid;
    END IF;
    SELECT COALESCE(up.full_name,'Petugas Personalia') INTO v_actor_name
    FROM public.user_profiles up WHERE up.id = v_actor_id;
    v_event_type := 'attendance_' || (v_row ->> 'approval_status');
    v_message := format('Data kehadiran nomor %s untuk %s tanggal %s telah %s oleh %s. Status kehadiran: %s. Tindak lanjut: %s.',
      COALESCE(v_row ->> 'attendance_number','-'), v_entity_name,
      COALESCE(v_row ->> 'attendance_date','-'),
      CASE v_row ->> 'approval_status' WHEN 'submitted' THEN 'diajukan'
        WHEN 'verified' THEN 'diverifikasi' ELSE 'ditolak dan perlu diperbaiki' END,
      COALESCE(v_actor_name,'Personalia'),
      COALESCE(v_row ->> 'attendance_status','-'), v_next_team);
    v_voice := 'Informasi Kehadiran. ' || v_message;
    v_target := '/personalia/absensi';
    v_extra := jsonb_build_object(
      'attendance_number',v_row ->> 'attendance_number',
      'employee_name',v_entity_name,
      'approval_status',v_row ->> 'approval_status',
      'attendance_status',v_row ->> 'attendance_status',
      'next_responsible_team',v_next_team
    );

  ELSIF TG_TABLE_NAME = 'payroll_runs' THEN
    IF v_status NOT IN ('submitted','approved','cancelled') THEN
      RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' AND v_status IS NOT DISTINCT FROM v_previous_status THEN
      RETURN NEW;
    END IF;
    IF v_status='submitted' THEN
      v_actor_id := COALESCE(NULLIF(v_row ->> 'submitted_by','')::uuid,v_actor_id);
      v_next_team := 'HR / pejabat yang berwenang menyetujui payroll';
      v_permissions := ARRAY['payroll.manage']::text[];
      v_title := 'Rekap payroll menunggu persetujuan';
    ELSIF v_status='approved' THEN
      v_actor_id := COALESCE(NULLIF(v_row ->> 'approved_by','')::uuid,v_actor_id);
      v_next_team := 'Tim Keuangan untuk memproses pembayaran';
      v_permissions := ARRAY['finance.payment.manage']::text[];
      v_title := 'Rekap payroll telah disetujui';
      v_notify_user := NULLIF(v_row ->> 'submitted_by','')::uuid;
    ELSE
      v_actor_id := COALESCE(NULLIF(v_row ->> 'cancelled_by','')::uuid,v_actor_id);
      v_next_team := 'HR untuk meninjau alasan pembatalan';
      v_title := 'Rekap payroll dibatalkan';
      v_notify_user := NULLIF(v_row ->> 'submitted_by','')::uuid;
    END IF;
    SELECT COALESCE(up.full_name,'Petugas Personalia') INTO v_actor_name
    FROM public.user_profiles up WHERE up.id = v_actor_id;
    SELECT pp.period_code INTO v_project_name
    FROM public.payroll_periods pp
    WHERE pp.id = NULLIF(v_row ->> 'period_id','')::uuid;
    v_event_type := 'payroll_' || v_status;
    v_message := format('Rekap payroll %s untuk periode %s, mencakup %s karyawan, telah %s oleh %s. Rincian nominal individual tetap tersedia pada modul Payroll sesuai hak akses. Tindak lanjut: %s.',
      COALESCE(v_row ->> 'run_number','-'), COALESCE(v_project_name,'periode terkait'),
      COALESCE(v_row ->> 'total_employees','0'),
      CASE v_status WHEN 'submitted' THEN 'diajukan' WHEN 'approved' THEN 'disetujui' ELSE 'dibatalkan' END,
      COALESCE(v_actor_name,'Personalia'), v_next_team);
    v_voice := 'Informasi Payroll. ' || v_message;
    v_target := '/personalia/penggajian';
    v_category := 'payroll';
    v_extra := jsonb_build_object(
      'run_number',v_row ->> 'run_number',
      'period_code',v_project_name,
      'total_employees',v_row ->> 'total_employees',
      'status',v_status,
      'next_responsible_team',v_next_team
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(up.full_name,'Pengguna Dahlia') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = v_actor_id;

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type,
    TG_TABLE_NAME, v_id, v_event_type, v_actor_id,
    COALESCE(v_actor_name,'Pengguna Dahlia'),
    v_project_id, COALESCE(v_project_name,'Perusahaan'),
    v_title, v_message, v_target,
    v_extra || jsonb_build_object('voice_text',v_voice,'next_responsible_team',v_next_team)
  )
  ON CONFLICT (source_key) DO NOTHING;

  IF cardinality(v_permissions)>0 THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      v_permissions, v_project_id, v_actor_id,
      TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type || ':follow-up',
      v_title, v_message, v_category, v_target,
      CASE WHEN v_status IN ('rejected','cancelled') THEN 'high' ELSE 'normal' END,
      v_extra || jsonb_build_object('source_table',TG_TABLE_NAME,'source_id',v_id,'project_name',v_project_name),
      v_voice, true
    );
  END IF;

  IF v_notify_user IS NOT NULL THEN
    PERFORM dahlia_private.ops_notify_one_user(
      v_notify_user, v_actor_id,
      TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type || ':submitter',
      v_title, v_message, v_category, v_target, v_project_id,
      TG_TABLE_NAME, v_id,
      CASE WHEN v_status IN ('rejected','cancelled') THEN 'high' ELSE 'normal' END,
      v_extra || jsonb_build_object('project_name',v_project_name),
      v_voice
    );
  END IF;

  RETURN NEW;
END;
$function$
