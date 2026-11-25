-- Company-wide HR, attendance, payroll and project-reporting announcements.

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


CREATE OR REPLACE FUNCTION dahlia_private.notify_project_reporting_event()
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
  v_actor_id uuid;
  v_actor_name text;
  v_submitter_id uuid;
  v_entity_name text;
  v_item_name text;
  v_status text;
  v_old_status text;
  v_event_type text;
  v_title text;
  v_message text;
  v_voice text;
  v_target text;
  v_next_team text;
  v_permissions text[] := ARRAY[]::text[];
BEGIN
  v_id := NULLIF(v_row ->> 'id','')::uuid;
  v_status := v_row ->> 'status';

  IF TG_TABLE_NAME='project_daily_reports' THEN
    IF v_status NOT IN ('submitted','approved','rejected') THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
      v_old := to_jsonb(OLD);
      v_old_status := v_old ->> 'status';
      IF v_status IS NOT DISTINCT FROM v_old_status THEN RETURN NEW; END IF;
    END IF;

    v_project_id := NULLIF(v_row ->> 'project_id','')::uuid;
    SELECT p.title INTO v_project_name FROM public.projects p WHERE p.id=v_project_id;
    v_submitter_id := NULLIF(v_row ->> 'foreman_user_id','')::uuid;
    v_actor_id := CASE WHEN v_status='submitted'
      THEN COALESCE(NULLIF(v_row ->> 'created_by','')::uuid,v_submitter_id,auth.uid())
      ELSE COALESCE(NULLIF(v_row ->> 'reviewed_by','')::uuid,auth.uid()) END;
    v_event_type := 'project_daily_report_' || v_status;
    v_title := CASE v_status
      WHEN 'submitted' THEN 'Laporan harian proyek diterima'
      WHEN 'approved' THEN 'Laporan harian proyek disetujui'
      ELSE 'Laporan harian proyek perlu diperbaiki'
    END;
    v_next_team := CASE WHEN v_status='submitted'
      THEN 'Manajer Proyek / Pengawas untuk pemeriksaan laporan'
      WHEN v_status='approved' THEN 'Tim Proyek untuk menjalankan tindak lanjut lapangan'
      ELSE 'Mandor / Pelapor untuk perbaikan laporan'
    END;
    v_target := '/proyek/' || v_project_id::text || '/laporan';
    IF v_status='submitted' THEN
      v_permissions := ARRAY['execution.progress.review','project.manage']::text[];
    ELSE
      v_submitter_id := COALESCE(v_submitter_id,NULLIF(v_row ->> 'created_by','')::uuid);
    END IF;
    v_message := format('Laporan harian %s untuk proyek %s tanggal %s telah %s. Pelapor: %s. Ringkasan pekerjaan: %s. Pemeriksa / tindak lanjut berikutnya: %s.',
      COALESCE(v_row ->> 'report_number','-'), COALESCE(v_project_name,'terkait'),
      COALESCE(v_row ->> 'report_date','-'),
      CASE v_status WHEN 'submitted' THEN 'dikirim' WHEN 'approved' THEN 'disetujui' ELSE 'dikembalikan untuk perbaikan' END,
      COALESCE((SELECT up.full_name FROM public.user_profiles up WHERE up.id=v_submitter_id),'Tim Lapangan'),
      COALESCE(NULLIF(v_row ->> 'work_summary',''),'Ringkasan tidak dicantumkan'),
      v_next_team);

  ELSIF TG_TABLE_NAME='execution_progress_entries' THEN
    IF v_status NOT IN ('submitted','approved','rejected') THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
      v_old := to_jsonb(OLD);
      v_old_status := v_old ->> 'status';
      IF v_status IS NOT DISTINCT FROM v_old_status THEN RETURN NEW; END IF;
    END IF;

    SELECT wp.project_id, p.title, es.segment_title, pwi.item_name
      INTO v_project_id, v_project_name, v_entity_name, v_item_name
    FROM public.execution_segment_items esi
    JOIN public.execution_segments es ON es.id=esi.segment_id
    JOIN public.project_work_packages wp ON wp.id=es.package_id
    JOIN public.projects p ON p.id=wp.project_id
    JOIN public.project_work_package_items pwi ON pwi.id=esi.package_item_id
    WHERE esi.id=NULLIF(v_row ->> 'segment_item_id','')::uuid;

    v_actor_id := CASE WHEN v_status='submitted'
      THEN COALESCE(NULLIF(v_row ->> 'submitted_by','')::uuid,auth.uid())
      ELSE COALESCE(NULLIF(v_row ->> 'reviewed_by','')::uuid,auth.uid()) END;
    v_submitter_id := NULLIF(v_row ->> 'submitted_by','')::uuid;
    v_event_type := 'execution_progress_' || v_status;
    v_title := CASE v_status
      WHEN 'submitted' THEN 'Progres pekerjaan diajukan'
      WHEN 'approved' THEN 'Progres pekerjaan disetujui'
      ELSE 'Progres pekerjaan perlu diperbaiki'
    END;
    v_target := CASE WHEN v_project_id IS NOT NULL
      THEN '/proyek/' || v_project_id::text || '/pelaksanaan/progres'
      ELSE '/proyek/daftar' END;
    v_next_team := CASE v_status
      WHEN 'submitted' THEN 'Manajer Proyek / Pengawas untuk verifikasi volume'
      WHEN 'approved' THEN 'Tim Lapangan untuk melanjutkan pekerjaan sesuai progres disetujui'
      ELSE 'Pelaksana untuk memperbaiki volume dan catatan progres' END;
    IF v_status='submitted' THEN
      v_permissions := ARRAY['execution.progress.review','project.manage']::text[];
    END IF;
    v_message := format('Progres item %s pada paket %s untuk proyek %s tanggal %s telah %s. Volume diajukan %s %s. Tindak lanjut: %s.',
      COALESCE(v_item_name,'item pekerjaan'), COALESCE(v_entity_name,'paket pekerjaan'),
      COALESCE(v_project_name,'terkait'), COALESCE(v_row ->> 'report_date','-'),
      CASE v_status WHEN 'submitted' THEN 'diajukan' WHEN 'approved' THEN 'disetujui' ELSE 'ditolak / perlu diperbaiki' END,
      COALESCE(v_row ->> 'quantity_submitted','0'),
      COALESCE((SELECT pwi.unit FROM public.execution_segment_items esi
        JOIN public.project_work_package_items pwi ON pwi.id=esi.package_item_id
        WHERE esi.id=NULLIF(v_row ->> 'segment_item_id','')::uuid),'unit'),
      CASE WHEN v_status='submitted'
        THEN 'Manajer Proyek / Pengawas'
        WHEN v_status='approved' THEN 'Tim Pelaksana Lapangan'
        ELSE 'Pelaksana yang mengajukan progres' END
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(up.full_name,'Pengguna Dahlia') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id=v_actor_id;

  v_voice := 'Informasi Pelaksanaan Proyek. ' || v_message;

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type,
    TG_TABLE_NAME, v_id, v_event_type, v_actor_id,
    COALESCE(v_actor_name,'Pengguna Dahlia'), v_project_id,
    COALESCE(v_project_name,'Proyek terkait'), v_title, v_message, v_target,
    jsonb_build_object(
      'status',v_status,
      'next_responsible_team',v_next_team,
      'voice_text',v_voice
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  IF cardinality(v_permissions)>0 THEN
    PERFORM dahlia_private.ops_notify_permission_recipients(
      v_permissions, v_project_id, v_actor_id,
      TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type || ':review',
      v_title, v_message, 'project_reporting', v_target, 'high',
      jsonb_build_object('source_table',TG_TABLE_NAME,'source_id',v_id,'project_name',v_project_name,'status',v_status),
      v_voice, true
    );
  END IF;

  IF v_status IN ('approved','rejected') AND v_submitter_id IS NOT NULL THEN
    PERFORM dahlia_private.ops_notify_one_user(
      v_submitter_id, v_actor_id,
      TG_TABLE_NAME || ':' || v_id::text || ':' || v_event_type || ':submitter',
      v_title, v_message, 'project_reporting', v_target, v_project_id,
      TG_TABLE_NAME, v_id,
      CASE WHEN v_status='rejected' THEN 'high' ELSE 'normal' END,
      jsonb_build_object('status',v_status,'project_name',v_project_name),
      v_voice
    );
  END IF;

  RETURN NEW;
END;
$function$


DROP TRIGGER IF EXISTS trg_personnel_attendance_events ON public.attendance_records;

CREATE TRIGGER trg_personnel_attendance_events AFTER INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_personnel_event();

DROP TRIGGER IF EXISTS trg_personnel_assignment_events ON public.employee_daily_assignments;

CREATE TRIGGER trg_personnel_assignment_events AFTER INSERT OR UPDATE ON public.employee_daily_assignments FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_personnel_event();

DROP TRIGGER IF EXISTS trg_personnel_agreement_events ON public.employee_work_agreements;

CREATE TRIGGER trg_personnel_agreement_events AFTER INSERT OR UPDATE ON public.employee_work_agreements FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_personnel_event();

DROP TRIGGER IF EXISTS trg_personnel_employee_events ON public.employees;

CREATE TRIGGER trg_personnel_employee_events AFTER INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_personnel_event();

DROP TRIGGER IF EXISTS trg_execution_progress_events ON public.execution_progress_entries;

CREATE TRIGGER trg_execution_progress_events AFTER INSERT OR UPDATE ON public.execution_progress_entries FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_project_reporting_event();

DROP TRIGGER IF EXISTS trg_personnel_payroll_run_events ON public.payroll_runs;

CREATE TRIGGER trg_personnel_payroll_run_events AFTER INSERT OR UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_personnel_event();

DROP TRIGGER IF EXISTS trg_project_daily_report_events ON public.project_daily_reports;

CREATE TRIGGER trg_project_daily_report_events AFTER INSERT OR UPDATE ON public.project_daily_reports FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_project_reporting_event();

REVOKE ALL ON FUNCTION dahlia_private.notify_personnel_event() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION dahlia_private.notify_project_reporting_event() FROM PUBLIC, anon, authenticated;