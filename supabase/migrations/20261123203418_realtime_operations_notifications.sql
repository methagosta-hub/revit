
-- Dahlia Management: live activity feed, permission-scoped notifications and low-stock rules.
-- Additive migration; preserves existing records and notification ownership policies.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_priority_check
  CHECK (priority IN ('normal', 'high', 'critical'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_key_uidx
  ON public.notifications(user_id, event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL DEFAULT 'Pengguna',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  project_name text NOT NULL DEFAULT 'Perusahaan',
  title text NOT NULL,
  summary text NOT NULL,
  target_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_feed_created_at_idx ON public.activity_feed(created_at DESC);
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_feed_read_authenticated ON public.activity_feed;
CREATE POLICY activity_feed_read_authenticated ON public.activity_feed
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
GRANT SELECT ON public.activity_feed TO authenticated;

CREATE TABLE IF NOT EXISTS public.warehouse_stock_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.master_materials(id) ON DELETE CASCADE,
  material_name_pattern text NOT NULL DEFAULT '%',
  unit text,
  minimum_quantity numeric(15,3) NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_stock_alert_rules_minimum_check CHECK (minimum_quantity >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_stock_alert_rules_material_uidx
  ON public.warehouse_stock_alert_rules(material_id) WHERE material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_stock_alert_rules_pattern_unit_uidx
  ON public.warehouse_stock_alert_rules(lower(material_name_pattern), lower(coalesce(unit, '')))
  WHERE material_id IS NULL;
ALTER TABLE public.warehouse_stock_alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_stock_alert_rules_read ON public.warehouse_stock_alert_rules;
CREATE POLICY warehouse_stock_alert_rules_read ON public.warehouse_stock_alert_rules
  FOR SELECT TO authenticated
  USING (public.has_company_role(ARRAY['director','admin','warehouse','purchasing']::text[]));
DROP POLICY IF EXISTS warehouse_stock_alert_rules_write ON public.warehouse_stock_alert_rules;
CREATE POLICY warehouse_stock_alert_rules_write ON public.warehouse_stock_alert_rules
  FOR ALL TO authenticated
  USING (public.has_company_role(ARRAY['director','admin','warehouse']::text[]))
  WITH CHECK (public.has_company_role(ARRAY['director','admin','warehouse']::text[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_stock_alert_rules TO authenticated;

INSERT INTO public.warehouse_stock_alert_rules (material_name_pattern, unit, minimum_quantity, is_active)
VALUES ('%semen%50 kg%', 'sak', 10, true)
ON CONFLICT DO NOTHING;


CREATE OR REPLACE FUNCTION dahlia_private.ops_notify_permission_recipients(p_permission_codes text[], p_project_id uuid, p_actor_id uuid, p_event_key text, p_title text, p_message text, p_category text, p_target_url text, p_priority text, p_metadata jsonb, p_voice_text text, p_exclude_actor boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, category, target_url, event_key,
    project_id, source_table, source_id, priority, metadata
  )
  SELECT DISTINCT
    ura.user_id,
    p_title,
    p_message,
    p_category,
    p_target_url,
    p_event_key,
    p_project_id,
    NULLIF(p_metadata ->> 'source_table', ''),
    NULLIF(p_metadata ->> 'source_id', '')::uuid,
    COALESCE(p_priority, 'normal'),
    COALESCE(p_metadata, '{}'::jsonb) ||
      jsonb_build_object('voice_text', p_voice_text)
  FROM public.user_role_assignments ura
  JOIN public.user_profiles up
    ON up.id = ura.user_id AND up.is_active = true
  JOIN public.role_permissions rp
    ON rp.role_id = ura.role_id
  JOIN public.app_permissions ap
    ON ap.id = rp.permission_id
  WHERE ap.code = ANY(COALESCE(p_permission_codes, ARRAY[]::text[]))
    AND ura.revoked_at IS NULL
    AND ura.valid_from <= (now() AT TIME ZONE 'Asia/Jakarta')::date
    AND (ura.valid_until IS NULL OR ura.valid_until >= (now() AT TIME ZONE 'Asia/Jakarta')::date)
    AND (
      ura.project_id IS NULL
      OR (p_project_id IS NOT NULL AND ura.project_id = p_project_id)
    )
    AND (NOT COALESCE(p_exclude_actor, true) OR ura.user_id <> p_actor_id)
  ON CONFLICT (user_id, event_key)
    WHERE event_key IS NOT NULL
  DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION dahlia_private.ops_notify_one_user(p_user_id uuid, p_actor_id uuid, p_event_key text, p_title text, p_message text, p_category text, p_target_url text, p_project_id uuid, p_source_table text, p_source_id uuid, p_priority text, p_metadata jsonb, p_voice_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    user_id, title, message, category, target_url, event_key,
    project_id, source_table, source_id, priority, metadata
  )
  SELECT
    p_user_id, p_title, p_message, p_category, p_target_url, p_event_key,
    p_project_id, p_source_table, p_source_id, COALESCE(p_priority, 'normal'),
    COALESCE(p_metadata, '{}'::jsonb) ||
      jsonb_build_object('voice_text', p_voice_text)
  WHERE EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = p_user_id AND up.is_active = true
  )
  ON CONFLICT (user_id, event_key)
    WHERE event_key IS NOT NULL
  DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION dahlia_private.notify_field_material_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_name text;
  v_actor_name text;
  v_items text;
  v_count integer;
  v_priority text;
  v_item_json jsonb;
  v_voice text;
  v_message text;
BEGIN
  IF NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT p.title INTO v_project_name
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT COALESCE(up.full_name, 'Tim Lapangan') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = NEW.created_by;

  SELECT
    count(*)::integer,
    string_agg(
      format('%s sebanyak %s %s',
        i.item_name,
        trim(to_char(i.quantity, 'FM999999990.###')),
        i.unit
      ),
      '; ' ORDER BY i.sort_order
    ),
    jsonb_agg(jsonb_build_object(
      'name', i.item_name, 'quantity', i.quantity, 'unit', i.unit
    ) ORDER BY i.sort_order)
  INTO v_count, v_items, v_item_json
  FROM public.field_material_request_items i
  WHERE i.request_id = NEW.id;

  v_items := COALESCE(v_items, 'Rincian material belum tersedia');
  v_count := COALESCE(v_count, 0);

  v_message := format(
    'Permintaan material %s dari %s untuk proyek %s telah diterima dan menunggu pemeriksaan tim Pengadaan. Rincian: %s.',
    NEW.request_number, v_actor_name, COALESCE(v_project_name, 'proyek terkait'), v_items
  );

  v_voice := format(
    'Perhatian kepada tim Pengadaan dan pihak yang berwenang. Permintaan material baru nomor %s telah diajukan oleh %s untuk proyek %s. Barang yang diminta: %s. Mohon lakukan pemeriksaan kebutuhan, ketersediaan, dan proses pengadaan sesuai kewenangan serta prosedur perusahaan.',
    NEW.request_number, v_actor_name, COALESCE(v_project_name, 'proyek terkait'), v_items
  );

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'field-material-request:' || NEW.id::text || ':submitted',
    'field_material_requests', NEW.id, 'material_request',
    NEW.created_by, v_actor_name, NEW.project_id,
    COALESCE(v_project_name, 'Proyek terkait'),
    'Permintaan material baru',
    format('%s mengajukan %s jenis material untuk proyek %s. Menunggu pemeriksaan tim Pengadaan.',
      v_actor_name, v_count, COALESCE(v_project_name, 'terkait')),
    '/pengadaan/permintaan',
    jsonb_build_object('request_number', NEW.request_number, 'priority', NEW.priority, 'item_count', v_count)
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['procurement.request.review']::text[],
    NEW.project_id,
    NEW.created_by,
    'field-material-request:' || NEW.id::text || ':submitted',
    'Permintaan material baru · ' || NEW.request_number,
    v_message,
    'material_request',
    '/pengadaan/permintaan',
    CASE WHEN NEW.priority = 'urgent' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'source_table', 'field_material_requests',
      'source_id', NEW.id,
      'request_number', NEW.request_number,
      'project_name', v_project_name,
      'actor_name', v_actor_name,
      'items', COALESCE(v_item_json, '[]'::jsonb),
      'item_count', v_count
    ),
    v_voice,
    true
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION dahlia_private.notify_field_material_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_name text;
  v_actor_name text;
  v_title text;
  v_message text;
  v_voice text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('under_review', 'approved', 'rejected', 'converted', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT p.title INTO v_project_name
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT COALESCE(up.full_name, 'Tim Pengadaan') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = NEW.reviewed_by;

  v_title := CASE NEW.status
    WHEN 'under_review' THEN 'Permintaan material sedang ditinjau'
    WHEN 'approved' THEN 'Permintaan material disetujui'
    WHEN 'rejected' THEN 'Permintaan material belum disetujui'
    WHEN 'converted' THEN 'Permintaan material diproses menjadi PO'
    ELSE 'Permintaan material dibatalkan'
  END;

  v_message := CASE NEW.status
    WHEN 'under_review' THEN format('Permintaan %s untuk proyek %s sedang ditinjau oleh tim Pengadaan.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'))
    WHEN 'approved' THEN format('Permintaan %s untuk proyek %s telah disetujui. Tim Purchasing akan menyiapkan Purchase Order secara terpisah.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'))
    WHEN 'rejected' THEN format('Permintaan %s untuk proyek %s belum dapat disetujui. Alasan: %s.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'), COALESCE(NEW.rejection_reason, 'Silakan hubungi tim Pengadaan.'))
    WHEN 'converted' THEN format('Permintaan %s untuk proyek %s telah diproses menjadi Purchase Order.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'))
    ELSE format('Permintaan %s untuk proyek %s telah dibatalkan.',
      NEW.request_number, COALESCE(v_project_name, 'terkait'))
  END;

  v_voice := v_message || ' Terima kasih atas koordinasi dan tindak lanjut tim lapangan.';

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'field-material-request:' || NEW.id::text || ':' || NEW.status,
    'field_material_requests', NEW.id, 'material_request_' || NEW.status,
    NEW.reviewed_by, v_actor_name, NEW.project_id,
    COALESCE(v_project_name, 'Proyek terkait'),
    v_title, v_message, '/pengadaan/permintaan',
    jsonb_build_object('request_number', NEW.request_number, 'status', NEW.status)
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_one_user(
    NEW.created_by, NEW.reviewed_by,
    'field-material-request:' || NEW.id::text || ':' || NEW.status,
    v_title, v_message, 'material_request', '/pengadaan/permintaan',
    NEW.project_id, 'field_material_requests', NEW.id, 'normal',
    jsonb_build_object('request_number', NEW.request_number, 'status', NEW.status, 'project_name', v_project_name),
    v_voice
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION dahlia_private.notify_warehouse_issue_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_name text;
  v_actor_name text;
  v_items text;
  v_stock_text text;
  v_issue_summary text;
  v_voice text;
  v_item_count integer;
  v_item jsonb;
  v_stock numeric(15,3);
  v_previous_stock numeric(15,3);
  v_threshold numeric(15,3);
  v_rule_id uuid;
  v_group record;
  v_low_voice text;
  v_low_message text;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT p.title INTO v_project_name
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT COALESCE(up.full_name, 'Petugas Gudang') INTO v_actor_name
  FROM public.user_profiles up WHERE up.id = NEW.issued_by;

  SELECT
    count(*)::integer,
    string_agg(
      format('%s sebanyak %s %s',
        i.material_name,
        trim(to_char(i.quantity_issued, 'FM999999990.###')),
        i.unit
      ),
      '; ' ORDER BY i.created_at, i.id
    ),
    jsonb_agg(jsonb_build_object(
      'material_id', i.material_id,
      'material_code', i.material_code,
      'name', i.material_name,
      'quantity_issued', i.quantity_issued,
      'unit', i.unit
    ) ORDER BY i.created_at, i.id)
  INTO v_item_count, v_items, v_item
  FROM public.project_material_issue_items i
  WHERE i.issue_id = NEW.id;

  v_item_count := COALESCE(v_item_count, 0);
  v_items := COALESCE(v_items, 'Rincian material belum tersedia');

  SELECT string_agg(
    format('%s tersisa %s %s',
      q.material_name,
      trim(to_char(q.quantity_on_hand, 'FM999999990.###')),
      q.unit
    ),
    '; ' ORDER BY q.material_name
  )
  INTO v_stock_text
  FROM (
    SELECT DISTINCT
      i.material_name,
      i.unit,
      COALESCE(s.quantity_on_hand, 0)::numeric(15,3) AS quantity_on_hand
    FROM public.project_material_issue_items i
    LEFT JOIN public.v_project_material_stock s
      ON s.project_id = NEW.project_id
     AND s.material_id IS NOT DISTINCT FROM i.material_id
     AND COALESCE(s.material_code, '') = COALESCE(i.material_code, '')
     AND lower(trim(s.material_name)) = lower(trim(i.material_name))
     AND lower(trim(s.unit)) = lower(trim(i.unit))
    WHERE i.issue_id = NEW.id
  ) q;

  v_stock_text := COALESCE(v_stock_text, 'Saldo persediaan dapat diperiksa pada modul Gudang');

  v_issue_summary := format(
    'Pengeluaran %s jenis material dicatat oleh %s untuk proyek %s.',
    v_item_count, v_actor_name, COALESCE(v_project_name, 'proyek terkait')
  );

  v_voice := format(
    'Informasi Gudang. Pengeluaran material nomor %s telah dicatat oleh %s untuk proyek %s. Barang yang dikeluarkan: %s. Posisi persediaan setelah pengeluaran: %s. Mohon pastikan seluruh pencatatan dan pemenuhan kebutuhan proyek berjalan tertib sesuai prosedur.',
    NEW.issue_number, v_actor_name, COALESCE(v_project_name, 'proyek terkait'), v_items, v_stock_text
  );

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'warehouse-issue:' || NEW.id::text,
    'project_material_issues', NEW.id, 'warehouse_issue',
    NEW.issued_by, v_actor_name, NEW.project_id,
    COALESCE(v_project_name, 'Proyek terkait'),
    'Pengeluaran material gudang',
    v_issue_summary,
    '/gudang/pengeluaran',
    jsonb_build_object('issue_number', NEW.issue_number, 'item_count', v_item_count)
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['warehouse.manage']::text[],
    NEW.project_id,
    NEW.issued_by,
    'warehouse-issue:' || NEW.id::text,
    'Pengeluaran material · ' || NEW.issue_number,
    v_issue_summary || ' Rincian: ' || v_items || '. Sisa stok: ' || v_stock_text || '.',
    'warehouse_issue',
    '/gudang/pengeluaran',
    'normal',
    jsonb_build_object(
      'source_table', 'project_material_issues',
      'source_id', NEW.id,
      'issue_number', NEW.issue_number,
      'project_name', v_project_name,
      'actor_name', v_actor_name,
      'items', COALESCE(v_item, '[]'::jsonb),
      'stock_summary', v_stock_text
    ),
    v_voice,
    true
  );

  -- Alert only on a threshold crossing (previous stock >= minimum, current stock < minimum).
  FOR v_group IN
    SELECT
      i.material_id,
      i.material_code,
      i.material_name,
      i.unit,
      sum(i.quantity_issued)::numeric(15,3) AS issued_quantity
    FROM public.project_material_issue_items i
    WHERE i.issue_id = NEW.id
    GROUP BY i.material_id, i.material_code, i.material_name, i.unit
  LOOP
    SELECT COALESCE(s.quantity_on_hand, 0)::numeric(15,3)
      INTO v_stock
    FROM public.v_project_material_stock s
    WHERE s.project_id = NEW.project_id
      AND s.material_id IS NOT DISTINCT FROM v_group.material_id
      AND COALESCE(s.material_code, '') = COALESCE(v_group.material_code, '')
      AND lower(trim(s.material_name)) = lower(trim(v_group.material_name))
      AND lower(trim(s.unit)) = lower(trim(v_group.unit))
    LIMIT 1;

    v_stock := COALESCE(v_stock, 0);
    v_previous_stock := v_stock + v_group.issued_quantity;
    v_threshold := NULL;

    SELECT r.minimum_quantity, r.id
      INTO v_threshold, v_rule_id
    FROM public.warehouse_stock_alert_rules r
    WHERE r.is_active = true
      AND (
        (r.material_id IS NOT NULL AND r.material_id = v_group.material_id)
        OR
        (r.material_id IS NULL
          AND lower(v_group.material_name) LIKE lower(r.material_name_pattern)
          AND (r.unit IS NULL OR lower(r.unit) = lower(v_group.unit)))
      )
    ORDER BY CASE WHEN r.material_id IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_threshold IS NOT NULL
       AND v_stock < v_threshold
       AND v_previous_stock >= v_threshold THEN
      v_low_message := format(
        'Stok %s pada proyek %s tersisa %s %s, di bawah batas minimum %s %s. Mohon Gudang dan Purchasing meninjau kebutuhan pengisian kembali.',
        v_group.material_name,
        COALESCE(v_project_name, 'proyek terkait'),
        trim(to_char(v_stock, 'FM999999990.###')),
        v_group.unit,
        trim(to_char(v_threshold, 'FM999999990.###')),
        v_group.unit
      );
      v_low_voice := format(
        'Perhatian kepada tim Gudang dan Purchasing. Persediaan %s di proyek %s saat ini tersisa %s %s, lebih rendah dari batas minimum %s %s. Mohon lakukan pemeriksaan kebutuhan dan tindak lanjut pengadaan agar pekerjaan proyek tetap berjalan lancar.',
        v_group.material_name,
        COALESCE(v_project_name, 'proyek terkait'),
        trim(to_char(v_stock, 'FM999999990.###')),
        v_group.unit,
        trim(to_char(v_threshold, 'FM999999990.###')),
        v_group.unit
      );

      INSERT INTO public.activity_feed (
        source_key, source_table, source_id, event_type, actor_id, actor_name,
        project_id, project_name, title, summary, target_url, metadata
      )
      VALUES (
        'stock-low:' || NEW.project_id::text || ':' ||
          COALESCE(v_group.material_id::text, COALESCE(v_group.material_code, v_group.material_name)) ||
          ':' || NEW.id::text,
        'project_material_issues', NEW.id, 'stock_low',
        NEW.issued_by, v_actor_name, NEW.project_id,
        COALESCE(v_project_name, 'Proyek terkait'),
        'Persediaan material mendekati batas minimum',
        v_low_message,
        '/gudang/persediaan',
        jsonb_build_object(
          'material_name', v_group.material_name,
          'quantity_on_hand', v_stock,
          'minimum_quantity', v_threshold,
          'unit', v_group.unit
        )
      )
      ON CONFLICT (source_key) DO NOTHING;

      PERFORM dahlia_private.ops_notify_permission_recipients(
        ARRAY['warehouse.manage', 'procurement.purchase.create']::text[],
        NEW.project_id,
        NEW.issued_by,
        'stock-low:' || NEW.project_id::text || ':' ||
          COALESCE(v_group.material_id::text, COALESCE(v_group.material_code, v_group.material_name)) ||
          ':' || NEW.id::text,
        'Peringatan stok minimum · ' || v_group.material_name,
        v_low_message,
        'stock_low',
        '/gudang/persediaan',
        'high',
        jsonb_build_object(
          'source_table', 'project_material_issues',
          'source_id', NEW.id,
          'project_name', v_project_name,
          'material_name', v_group.material_name,
          'quantity_on_hand', v_stock,
          'minimum_quantity', v_threshold,
          'unit', v_group.unit
        ),
        v_low_voice,
        true
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION dahlia_private.notify_subcontract_payment_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dahlia_private', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_project_id uuid;
  v_project_name text;
  v_package_name text;
  v_subcontractor_name text;
  v_actor_name text;
  v_term_name text;
  v_message text;
  v_voice text;
  v_actor_id uuid;
BEGIN
  IF NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT p.project_id, pr.title, p.package_name, s.legal_name
    INTO v_project_id, v_project_name, v_package_name, v_subcontractor_name
  FROM public.execution_segments es
  JOIN public.project_work_packages p ON p.id = es.package_id
  JOIN public.projects pr ON pr.id = p.project_id
  LEFT JOIN public.subcontractors s ON s.id = es.subcontractor_id
  WHERE es.id = NEW.segment_id;

  SELECT COALESCE(up.full_name, 'Mitra Subkontraktor')
    INTO v_actor_name
  FROM public.user_profiles up
  WHERE up.id = COALESCE(NEW.submitted_by, NEW.created_by);

  v_actor_id := COALESCE(NEW.submitted_by, NEW.created_by);

  IF NEW.term_id IS NOT NULL THEN
    SELECT t.term_name INTO v_term_name
    FROM public.subcontract_payment_terms t
    WHERE t.id = NEW.term_id;
  END IF;

  v_message := format(
    'Pengajuan termin %s dari %s untuk proyek %s telah diterima. Nilai bruto %s dan nilai bersih yang diajukan %s. Mohon dilakukan verifikasi kontrak, progres, retensi, dan kelengkapan dokumen sebelum keputusan.',
    NEW.request_number,
    COALESCE(v_subcontractor_name, v_actor_name, 'mitra terkait'),
    COALESCE(v_project_name, 'proyek terkait'),
    'Rp ' || trim(to_char(NEW.gross_amount, 'FM999G999G999G990')),
    'Rp ' || trim(to_char(COALESCE(NEW.net_amount, NEW.gross_amount - NEW.retention_amount - NEW.deduction_amount), 'FM999G999G999G990'))
  );

  v_voice := format(
    'Perhatian kepada pejabat pemeriksa kontrak dan pihak yang berwenang. Pengajuan termin nomor %s dari mitra %s, untuk proyek %s, pada paket pekerjaan %s, telah diterima. Nilai bruto %s dan nilai bersih %s. Mohon lakukan verifikasi dokumen kontrak, progres pekerjaan, retensi, potongan, dan kesesuaian nilai sebelum memberikan persetujuan sesuai kewenangan perusahaan.',
    NEW.request_number,
    COALESCE(v_subcontractor_name, v_actor_name, 'mitra terkait'),
    COALESCE(v_project_name, 'proyek terkait'),
    COALESCE(v_package_name, 'paket pekerjaan'),
    'rupiah ' || trim(to_char(NEW.gross_amount, 'FM999G999G999G990')),
    'rupiah ' || trim(to_char(COALESCE(NEW.net_amount, NEW.gross_amount - NEW.retention_amount - NEW.deduction_amount), 'FM999G999G999G990'))
  );

  INSERT INTO public.activity_feed (
    source_key, source_table, source_id, event_type, actor_id, actor_name,
    project_id, project_name, title, summary, target_url, metadata
  )
  VALUES (
    'subcontract-payment-request:' || NEW.id::text || ':submitted',
    'subcontract_payment_requests', NEW.id, 'subcontract_payment_request',
    v_actor_id, COALESCE(v_actor_name, 'Mitra Subkontraktor'),
    v_project_id, COALESCE(v_project_name, 'Proyek terkait'),
    'Pengajuan termin subkontraktor diterima',
    format('%s mengajukan termin pekerjaan pada proyek %s. Menunggu pemeriksaan pejabat berwenang.',
      COALESCE(v_subcontractor_name, v_actor_name, 'Mitra subkontraktor'),
      COALESCE(v_project_name, 'terkait')),
    CASE WHEN v_project_id IS NOT NULL THEN '/proyek/' || v_project_id::text ELSE '/keuangan' END,
    jsonb_build_object(
      'request_number', NEW.request_number,
      'status', NEW.status,
      'package_name', v_package_name
    )
  )
  ON CONFLICT (source_key) DO NOTHING;

  PERFORM dahlia_private.ops_notify_permission_recipients(
    ARRAY['execution.payment.manage', 'payroll.manage']::text[],
    v_project_id,
    v_actor_id,
    'subcontract-payment-request:' || NEW.id::text || ':submitted',
    'Pengajuan termin · ' || NEW.request_number,
    v_message,
    'subcontract_payment_request',
    CASE WHEN v_project_id IS NOT NULL THEN '/proyek/' || v_project_id::text ELSE '/keuangan' END,
    'high',
    jsonb_build_object(
      'source_table', 'subcontract_payment_requests',
      'source_id', NEW.id,
      'request_number', NEW.request_number,
      'project_name', v_project_name,
      'subcontractor_name', v_subcontractor_name,
      'package_name', v_package_name,
      'term_name', v_term_name,
      'gross_amount', NEW.gross_amount,
      'net_amount', COALESCE(NEW.net_amount, NEW.gross_amount - NEW.retention_amount - NEW.deduction_amount)
    ),
    v_voice,
    true
  );

  RETURN NEW;
END;
$function$;

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
    jsonb_build_object('request_number', NEW.request_number, 'status', NEW.status, 'project_name', v_project_name),
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
$function$;

DROP TRIGGER IF EXISTS trg_field_material_request_created_ops ON public.field_material_requests;
CREATE CONSTRAINT TRIGGER trg_field_material_request_created_ops AFTER INSERT ON public.field_material_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_field_material_request_created();

DROP TRIGGER IF EXISTS trg_field_material_request_status_ops ON public.field_material_requests;
CREATE CONSTRAINT TRIGGER trg_field_material_request_status_ops AFTER UPDATE ON public.field_material_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION dahlia_private.notify_field_material_request_status();

DROP TRIGGER IF EXISTS trg_subcontract_payment_request_created_ops ON public.subcontract_payment_requests;
CREATE CONSTRAINT TRIGGER trg_subcontract_payment_request_created_ops AFTER INSERT ON public.subcontract_payment_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_subcontract_payment_request_created();

DROP TRIGGER IF EXISTS trg_subcontract_payment_request_status_ops ON public.subcontract_payment_requests;
CREATE CONSTRAINT TRIGGER trg_subcontract_payment_request_status_ops AFTER UPDATE ON public.subcontract_payment_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (old.status::text IS DISTINCT FROM new.status::text) EXECUTE FUNCTION dahlia_private.notify_subcontract_payment_request_status();

DROP TRIGGER IF EXISTS trg_warehouse_issue_created_ops ON public.project_material_issues;
CREATE CONSTRAINT TRIGGER trg_warehouse_issue_created_ops AFTER INSERT ON public.project_material_issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dahlia_private.notify_warehouse_issue_created();

REVOKE ALL ON FUNCTION dahlia_private.ops_notify_permission_recipients(text[], uuid, uuid, text, text, text, text, text, text, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.ops_notify_one_user(uuid, uuid, text, text, text, text, text, uuid, text, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.notify_field_material_request_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.notify_field_material_request_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.notify_warehouse_issue_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.notify_subcontract_payment_request_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dahlia_private.notify_subcontract_payment_request_status() FROM PUBLIC, anon, authenticated;


DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='activity_feed') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END;
$block$;
