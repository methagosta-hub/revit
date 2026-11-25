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
