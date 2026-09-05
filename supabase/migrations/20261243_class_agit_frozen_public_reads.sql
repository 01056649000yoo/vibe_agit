-- Frozen exhibitions: publish once; permissions revoke at mutation time; reads never load source writing.
-- 30 days means 30 * 24 hours. External links cannot renew beyond the original start + 30 days.
BEGIN;
CREATE OR REPLACE FUNCTION public.class_agit_valid_share_period_v1(p_start TIMESTAMPTZ,p_end TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(isfinite(p_start) AND isfinite(p_end) AND p_end>p_start
        AND p_end-p_start<=INTERVAL '720 hours',FALSE);
$$;
REVOKE ALL ON FUNCTION public.class_agit_valid_share_period_v1(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
-- Preserve existing frozen editions/tokens and their end time. Old rolling renewals had no recorded start.
UPDATE public.class_agit_external_shares SET starts_at=GREATEST(created_at,expires_at-INTERVAL '720 hours') WHERE starts_at IS NULL;
ALTER TABLE public.class_agit_external_shares ALTER COLUMN starts_at SET NOT NULL;
ALTER TABLE public.class_agit_external_shares DROP CONSTRAINT IF EXISTS class_agit_external_share_period_check;
ALTER TABLE public.class_agit_external_shares ADD CONSTRAINT class_agit_external_share_period_check
    CHECK(public.class_agit_valid_share_period_v1(starts_at,expires_at));
ALTER TABLE public.class_agit_external_items ADD COLUMN IF NOT EXISTS summary JSONB;
UPDATE public.class_agit_external_items SET summary=snapshot-'blocks' WHERE summary IS NULL;
ALTER TABLE public.class_agit_external_items ALTER COLUMN summary SET NOT NULL;
ALTER TABLE public.class_agit_external_items DROP CONSTRAINT IF EXISTS class_agit_external_summary_check;
ALTER TABLE public.class_agit_external_items ADD CONSTRAINT class_agit_external_summary_check
    CHECK(jsonb_typeof(summary)='object' AND NOT summary ? 'blocks' AND octet_length(summary::TEXT)<=2500);

CREATE TABLE IF NOT EXISTS public.class_agit_published_items (
    class_id UUID NOT NULL, exhibition_id UUID NOT NULL, publication_no INTEGER NOT NULL CHECK(publication_no>0),
    work_no INTEGER NOT NULL CHECK(work_no BETWEEN 1 AND public.class_agit_max_works_v1()),
    item_id UUID NOT NULL, consent_id UUID NOT NULL,
    summary JSONB NOT NULL CHECK(jsonb_typeof(summary)='object' AND NOT summary ? 'blocks' AND octet_length(summary::TEXT)<=2500),
    blocks JSONB NOT NULL CHECK(jsonb_typeof(blocks)='array' AND octet_length(blocks::TEXT)<=85000),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY(class_id,exhibition_id,work_no),
    FOREIGN KEY(class_id,exhibition_id) REFERENCES public.class_agit_exhibitions(class_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS class_agit_published_consent_idx ON public.class_agit_published_items(class_id,item_id,consent_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.class_agit_publication_catalog (
    class_id UUID NOT NULL, exhibition_id UUID NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('class','external')),
    publication_no INTEGER NOT NULL CHECK(publication_no>0), title TEXT NOT NULL, introduction TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0 CHECK(total_count BETWEEN 0 AND public.class_agit_max_works_v1()),
    original_count INTEGER NOT NULL DEFAULT 0 CHECK(original_count BETWEEN 0 AND public.class_agit_max_works_v1()),
    rooms JSONB NOT NULL DEFAULT '[]', visibility_revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(class_id,exhibition_id,scope),
    FOREIGN KEY(class_id,exhibition_id) REFERENCES public.class_agit_exhibitions(class_id,id) ON DELETE CASCADE
);
-- Separate small slots avoid touching another work's body/withdrawal row during a concurrent reflow.
CREATE TABLE IF NOT EXISTS public.class_agit_publication_slots (
    class_id UUID NOT NULL, exhibition_id UUID NOT NULL, scope TEXT NOT NULL,
    work_no INTEGER NOT NULL CHECK(work_no BETWEEN 1 AND public.class_agit_max_works_v1()),
    display_position INTEGER NOT NULL CHECK(display_position BETWEEN 1 AND public.class_agit_max_works_v1()),
    room_no INTEGER NOT NULL CHECK(room_no BETWEEN 1 AND (public.class_agit_max_works_v1()+11)/12),
    summary JSONB NOT NULL,
    PRIMARY KEY(class_id,exhibition_id,scope,work_no),
    FOREIGN KEY(class_id,exhibition_id,scope) REFERENCES public.class_agit_publication_catalog(class_id,exhibition_id,scope) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS class_agit_slots_room_idx ON public.class_agit_publication_slots(class_id,exhibition_id,scope,room_no,display_position);
ALTER TABLE public.class_agit_published_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_publication_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_publication_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_agit_published_items,public.class_agit_publication_catalog,public.class_agit_publication_slots FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.class_agit_refresh_catalog_v1(p_class_id UUID,p_exhibition_id UUID,p_scope TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF p_scope='external' THEN
        INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction)
        SELECT s.class_id,s.exhibition_id,'external',s.publication_no,s.title,s.introduction FROM public.class_agit_external_shares s
        WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id
        ON CONFLICT(class_id,exhibition_id,scope) DO NOTHING;
    END IF;
    -- Serialize only tiny layout writes, independently of source/exhibition/share locks.
    PERFORM 1 FROM public.class_agit_publication_catalog WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    DELETE FROM public.class_agit_publication_slots WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope;
    INSERT INTO public.class_agit_publication_slots(class_id,exhibition_id,scope,work_no,display_position,room_no,summary)
    SELECT p_class_id,p_exhibition_id,p_scope,work_no,n,((n-1)/12+1),summary||jsonb_build_object('id','published-'||work_no)
    FROM (
        SELECT work_no,summary,(row_number() OVER(ORDER BY work_no))::INTEGER AS n FROM (
            SELECT i.work_no,i.summary FROM public.class_agit_published_items i
                WHERE p_scope='class' AND i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.revoked_at IS NULL
            UNION ALL
            SELECT i.position,i.summary FROM public.class_agit_external_items i
                WHERE p_scope='external' AND i.class_id=p_class_id AND i.share_id=p_exhibition_id AND i.revoked_at IS NULL
        ) source ORDER BY work_no LIMIT public.class_agit_max_works_v1()
    ) numbered;
    UPDATE public.class_agit_publication_catalog c SET
        total_count=(SELECT count(*) FROM public.class_agit_publication_slots s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope),
        rooms=COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.number) FROM (
            SELECT s.room_no AS number,count(*)::INTEGER AS count FROM public.class_agit_publication_slots s
            WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope GROUP BY s.room_no) r),'[]'),
        original_count=CASE WHEN p_scope='class' THEN (SELECT count(*) FROM public.class_agit_published_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
            ELSE (SELECT count(*) FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id) END,
        visibility_revision=visibility_revision+1
    WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope=p_scope;
    IF p_scope='external' THEN
        UPDATE public.class_agit_publication_catalog c SET publication_no=s.publication_no,title=s.title,introduction=s.introduction
        FROM public.class_agit_external_shares s WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='external'
            AND s.class_id=c.class_id AND s.exhibition_id=c.exhibition_id;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_refresh_catalog_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.class_agit_capture_publication_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF NEW.published_snapshot IS NULL OR NEW.publication_no<1 THEN RETURN NEW; END IF;
    INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction)
    VALUES(NEW.class_id,NEW.id,'class',NEW.publication_no,NEW.published_snapshot->>'title',NEW.published_snapshot->>'introduction')
    ON CONFLICT(class_id,exhibition_id,scope) DO UPDATE SET publication_no=EXCLUDED.publication_no,title=EXCLUDED.title,introduction=EXCLUDED.introduction;
    DELETE FROM public.class_agit_published_items WHERE class_id=NEW.class_id AND exhibition_id=NEW.id;
    INSERT INTO public.class_agit_published_items(class_id,exhibition_id,publication_no,work_no,item_id,consent_id,summary,blocks,revoked_at)
    SELECT NEW.class_id,NEW.id,NEW.publication_no,w.ordinality,(w.value->>'itemId')::UUID,(w.value->>'consentId')::UUID,
        jsonb_build_object('title',w.value->>'title','author',w.value->>'authorName','format',w.value->>'format',
            'kindLabel',w.value->>'kindLabel','excerpt',w.value->>'excerpt'),w.value->'blocks',
        CASE WHEN i.id IS NULL OR i.revoked_at IS NOT NULL OR i.consent_id IS DISTINCT FROM (w.value->>'consentId')::UUID THEN now() END
    FROM jsonb_array_elements(NEW.published_snapshot->'works') WITH ORDINALITY w
    LEFT JOIN public.class_agit_items i ON i.class_id=NEW.class_id AND i.exhibition_id=NEW.id AND i.id=(w.value->>'itemId')::UUID;
    PERFORM public.class_agit_refresh_catalog_v1(NEW.class_id,NEW.id,'class');
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_capture_publication_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_capture_publication ON public.class_agit_exhibitions;
CREATE TRIGGER class_agit_capture_publication AFTER UPDATE OF published_snapshot,publication_no ON public.class_agit_exhibitions
FOR EACH ROW EXECUTE FUNCTION public.class_agit_capture_publication_v1();

CREATE OR REPLACE FUNCTION public.class_agit_capture_external_summary_v1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.summary:=NEW.snapshot-'blocks'; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.class_agit_capture_external_summary_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_capture_external_summary ON public.class_agit_external_items;
CREATE TRIGGER class_agit_capture_external_summary BEFORE INSERT OR UPDATE OF snapshot ON public.class_agit_external_items
FOR EACH ROW EXECUTE FUNCTION public.class_agit_capture_external_summary_v1();

-- Draft removal alone does not alter an edition. Withdrawal or changed consent generation does.
CREATE OR REPLACE FUNCTION public.class_agit_sync_published_consent_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    UPDATE public.class_agit_published_items p SET revoked_at=clock_timestamp()
    FROM new_items n JOIN old_items o ON n.id=o.id AND n.class_id=o.class_id
    WHERE p.class_id=n.class_id AND p.item_id=n.id AND p.revoked_at IS NULL
      AND (n.revoked_at IS NOT NULL OR n.consent_id IS DISTINCT FROM p.consent_id)
      AND (n.revoked_at IS DISTINCT FROM o.revoked_at OR n.consent_id IS DISTINCT FROM o.consent_id);
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_sync_published_consent_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_sync_published_consent ON public.class_agit_items;
CREATE TRIGGER class_agit_sync_published_consent AFTER UPDATE ON public.class_agit_items
REFERENCING OLD TABLE AS old_items NEW TABLE AS new_items FOR EACH STATEMENT EXECUTE FUNCTION public.class_agit_sync_published_consent_v1();
CREATE OR REPLACE FUNCTION public.class_agit_reflow_revocations_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v RECORD;
BEGIN
    IF TG_TABLE_NAME='class_agit_external_items' THEN
        FOR v IN SELECT DISTINCT n.class_id,n.share_id AS exhibition_id FROM new_items n JOIN old_items o ON n.id=o.id
            WHERE n.revoked_at IS DISTINCT FROM o.revoked_at ORDER BY 1,2 LOOP
            PERFORM public.class_agit_refresh_catalog_v1(v.class_id,v.exhibition_id,'external'); END LOOP;
    ELSE
        FOR v IN SELECT DISTINCT n.class_id,n.exhibition_id FROM new_items n JOIN old_items o
            ON n.class_id=o.class_id AND n.exhibition_id=o.exhibition_id AND n.work_no=o.work_no
            WHERE n.revoked_at IS DISTINCT FROM o.revoked_at ORDER BY 1,2 LOOP
            PERFORM public.class_agit_refresh_catalog_v1(v.class_id,v.exhibition_id,'class'); END LOOP;
    END IF;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_reflow_revocations_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_reflow_external ON public.class_agit_external_items;
CREATE TRIGGER class_agit_reflow_external AFTER UPDATE ON public.class_agit_external_items
REFERENCING OLD TABLE AS old_items NEW TABLE AS new_items FOR EACH STATEMENT EXECUTE FUNCTION public.class_agit_reflow_revocations_v1();
DROP TRIGGER IF EXISTS class_agit_reflow_internal ON public.class_agit_published_items;
CREATE TRIGGER class_agit_reflow_internal AFTER UPDATE ON public.class_agit_published_items
REFERENCING OLD TABLE AS old_items NEW TABLE AS new_items FOR EACH STATEMENT EXECUTE FUNCTION public.class_agit_reflow_revocations_v1();

-- Copy only frozen JSON. On upgrade, check permission/provenance, never the edited body/genre.
CREATE TEMP TABLE class_agit_backfill_unavailable ON COMMIT DROP AS
SELECT source.class_id,source.post_id FROM (
    SELECT i.class_id,i.post_id FROM public.class_agit_items i WHERE i.revoked_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.class_agit_publication_catalog c WHERE c.class_id=i.class_id AND c.exhibition_id=i.exhibition_id AND c.scope='class')
    UNION
    SELECT i.class_id,i.post_id FROM public.class_agit_external_items i WHERE i.revoked_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.class_agit_publication_catalog c WHERE c.class_id=i.class_id AND c.exhibition_id=i.share_id AND c.scope='external')
) source WHERE NOT EXISTS(
    SELECT 1 FROM public.student_posts p JOIN public.students s ON s.class_id=p.class_id AND s.id=p.student_id
    JOIN public.writing_missions m ON m.class_id=p.class_id AND m.id=p.mission_id
    WHERE p.class_id=source.class_id AND p.id=source.post_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
        AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE AND p.is_returned IS NOT TRUE AND p.recalled_at IS NULL
        AND p.writing_context='assignment' AND p.visibility='class'
);
UPDATE public.class_agit_items i SET revoked_at=now() FROM class_agit_backfill_unavailable u
    WHERE i.class_id=u.class_id AND i.post_id IS NOT DISTINCT FROM u.post_id AND i.revoked_at IS NULL;
UPDATE public.class_agit_external_items i SET revoked_at=now() FROM class_agit_backfill_unavailable u
    WHERE i.class_id=u.class_id AND i.post_id IS NOT DISTINCT FROM u.post_id AND i.revoked_at IS NULL;
UPDATE public.class_agit_exhibitions SET published_snapshot=published_snapshot WHERE published_snapshot IS NOT NULL AND publication_no>0
    AND NOT EXISTS(SELECT 1 FROM public.class_agit_publication_catalog c WHERE c.class_id=class_agit_exhibitions.class_id AND c.exhibition_id=class_agit_exhibitions.id AND c.scope='class');
DO $$ DECLARE v RECORD; BEGIN
    FOR v IN SELECT class_id,exhibition_id FROM public.class_agit_external_shares ORDER BY class_id,exhibition_id LOOP
        PERFORM public.class_agit_refresh_catalog_v1(v.class_id,v.exhibition_id,'external'); END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_old_enabled BOOLEAN; v_class_confirmed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT) > public.class_agit_max_works_v1()*500 THEN
        RAISE EXCEPTION '전시 요청 크기 또는 형식이 올바르지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- Conflicting publication/source edits fail with PT409 instead of holding a lock cycle.
    -- 학급당 프로젝트 상한과 모듈 변경·발행을 같은 잠금 순서로 직렬화한다.
    SELECT COALESCE('class-agit'=ANY(enabled_modules),FALSE),enabled_modules,vocab_tower_enabled
    INTO v_old_enabled,v_modules,v_legacy_enabled FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;
    IF p_action = 'set_enabled' THEN
        IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean'
           OR (p_payload->>'expected_enabled')::BOOLEAN IS DISTINCT FROM v_old_enabled THEN
            RAISE EXCEPTION '학급 공개 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
        -- 미설정 학급은 화면이 공용 registry로 계산한 기존 메뉴를 함께 초기화한다.
        -- 이미 설정된 목록은 잠금 안에서 읽은 서버 값을 유지해 다른 메뉴 변경을 덮지 않는다.
        IF (p_payload->>'enabled')::BOOLEAN AND COALESCE(cardinality(v_modules),0)=0 THEN
            IF jsonb_typeof(p_payload->'initial_modules') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION '기존 학급 메뉴를 확인하려면 작업공간을 다시 열어 주세요.' USING ERRCODE='22023'; END IF;
            IF jsonb_array_length(p_payload->'initial_modules')>100
               OR NOT (p_payload->'initial_modules' ? '__configured__')
               OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'initial_modules') x
                   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>80)
               THEN RAISE EXCEPTION '기존 학급 메뉴 설정을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF (p_payload->>'initial_vocab_tower_enabled')::BOOLEAN IS DISTINCT FROM v_legacy_enabled THEN
                RAISE EXCEPTION '학급 메뉴 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
            SELECT array_agg(DISTINCT value) INTO v_modules FROM jsonb_array_elements_text(p_payload->'initial_modules');
        END IF;
        UPDATE public.classes SET enabled_modules = CASE WHEN (p_payload->>'enabled')::BOOLEAN
            THEN array_append(array_remove(v_modules,'class-agit'),'class-agit')
            ELSE array_remove(v_modules,'class-agit') END WHERE id=p_class_id;
        RETURN public.get_class_agit_workspace_v1(p_class_id,(p_payload->>'exhibition_id')::UUID);
    END IF;
    v_id := (p_payload->>'exhibition_id')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION '전시 식별자가 필요합니다.' USING ERRCODE='22023'; END IF;

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=v_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id FOR UPDATE NOWAIT;
    IF p_action = 'create' THEN
        IF FOUND THEN RETURN public.get_class_agit_workspace_v1(p_class_id,v_id); END IF;
        IF (SELECT count(*) FROM public.class_agit_exhibitions WHERE class_id=p_class_id) >= 20 THEN
            RAISE EXCEPTION '한 학급은 전시를 20개까지 보관할 수 있습니다.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_exhibitions(id,class_id,title) VALUES(v_id,p_class_id,'우리의 작은 발견');
        RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
    END IF;
    IF v_ex.id IS NULL THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN
        RAISE EXCEPTION '다른 화면에서 전시가 변경되었습니다. 현재 편집은 남겨 두고 최신 전시를 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action = 'save' THEN
        IF char_length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 OR char_length(COALESCE(p_payload->>'introduction',''))>240
           OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '전시 제목·소개·작품 목록을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'items') > public.class_agit_max_works_v1() OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'items') a GROUP BY a->>'sourceId' HAVING count(*)>1
        ) THEN RAISE EXCEPTION '전시는 중복 없이 %편까지 담을 수 있습니다.', public.class_agit_max_works_v1() USING ERRCODE='23514'; END IF;
        -- source를 먼저 잠근다. source 회수 트리거는 전시 행을 잠그지 않으므로 잠금 순환이 없다.
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id
            AND p.id IN (SELECT (a->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') a) ORDER BY p.id FOR SHARE NOWAIT;
        UPDATE public.class_agit_items SET removed_at=NOW() WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
            v_position := v_position + 1; v_post_id := (v_item->>'sourceId')::UUID;
            v_data := public.class_agit_current_source_v1(p_class_id,v_post_id);
            IF v_data IS NULL THEN RAISE EXCEPTION '담은 글 중 제출·확인·공개 조건이 바뀐 글이 있습니다. 해당 작품을 빼거나 다시 확인해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision' THEN
                RAISE EXCEPTION '원글 내용이 바뀌었습니다. 전문을 다시 읽고 담아 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'classAcknowledged' IS DISTINCT FROM 'true'::JSONB THEN
                RAISE EXCEPTION '작품별 학급 전시 수록 의사를 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF char_length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            SELECT * INTO v_existing FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND post_id=v_post_id;
            v_class_confirmed := v_existing.id IS NULL OR v_existing.revoked_at IS NOT NULL OR v_existing.source_revision<>v_data->>'source_revision';
            v_snapshot := jsonb_build_object('title',v_data->>'title','authorName',v_data->>'student_name','groupTitle',v_data->>'group_title','format',v_data->>'format',
                'kindLabel',v_data->>'kindLabel','blocks',v_data->'blocks','excerpt',v_data->>'excerpt');
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_class_confirmed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_class_confirmed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_class_confirmed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'confirmed',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_exhibitions SET title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p NOWAIT;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND public.class_agit_max_works_v1() THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'works',v_items)
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'withdraw' THEN
        v_item_id := (p_payload->>'item_id')::UUID;
        UPDATE public.class_agit_items SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE class_id=p_class_id AND exhibition_id=v_id AND id=v_item_id;
        IF NOT FOUND THEN RAISE EXCEPTION '작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'withdrawn',v_actor);
        UPDATE public.class_agit_exhibitions SET revision=revision+1,updated_at=NOW() WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action IN ('unpublish','archive','restore') THEN
        UPDATE public.class_agit_exhibitions SET state=CASE WHEN p_action='archive' THEN 'archived' ELSE 'draft' END,revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 전시 동작입니다.' USING ERRCODE='22023'; END IF;
    RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;

REVOKE ALL ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'starts_at',s.starts_at,'scheduled',s.starts_at>now(),'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_revision',v_ex.revision,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;

REVOKE ALL ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_external_item UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>public.class_agit_max_works_v1()*500 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE NOWAIT;
    IF p_action IN('publish','rotate') THEN
        IF v_token IS NULL OR v_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '새 공유 주소를 준비해 주세요.' USING ERRCODE='22023'; END IF;
        v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
        -- 같은 토큰으로 잃어버린 응답을 재시도해도 중복 발행/판 증가가 없다.
        IF v_share.token_hash=v_hash AND v_share.revoked_at IS NULL THEN RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id); END IF;
    END IF;
    IF COALESCE((p_payload->>'expected_revision')::INTEGER,0) IS DISTINCT FROM COALESCE(v_share.revision,0)
        THEN RAISE EXCEPTION '공유 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action IN('publish','rotate','extend') THEN
        IF NOT (SELECT external_enabled FROM public.class_agit_rollout WHERE singleton) THEN RAISE EXCEPTION '관리자가 외부 공유를 허용한 뒤 발행할 수 있습니다.' USING ERRCODE='42501'; END IF;
        IF p_action='publish' THEN
            v_start:=(p_payload->>'starts_at')::TIMESTAMPTZ;
            v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
            IF v_start IS NULL OR v_start < now()-INTERVAL '5 minutes' THEN
                RAISE EXCEPTION '전시 시작 시간을 현재 이후로 정해 주세요.' USING ERRCODE='22023'; END IF;
        ELSIF p_action='extend' THEN
            v_start:=v_share.starts_at; v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
        ELSE v_start:=v_share.starts_at; v_end:=v_share.expires_at;
        END IF;
        IF NOT public.class_agit_valid_share_period_v1(v_start,v_end) OR v_end<=now() THEN
            RAISE EXCEPTION '종료는 시작 이후, 시작부터 최대 30일 이내로 정해 주세요.' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_action='publish' THEN
        IF v_ex.state='archived' OR p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '외부 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND public.class_agit_max_works_v1()
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~%편의 작품을 확인해 주세요.', public.class_agit_max_works_v1() USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p NOWAIT;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,v_start,v_end)
        ON CONFLICT(exhibition_id) DO UPDATE SET title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'externalConfirmed' IS DISTINCT FROM 'true'::JSONB OR length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '작품별 외부 공개 의사와 가림 이름을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,
                jsonb_build_object('title',v_source->>'title','author',btrim(v_item->>'publicAlias'),'format',v_source->>'format',
                    'kindLabel',v_source->>'kindLabel','excerpt',v_source->>'excerpt','blocks',v_source->'blocks')) RETURNING id INTO v_external_item;
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_external_item,'external','confirmed',v_actor);
        END LOOP;
        PERFORM public.class_agit_refresh_catalog_v1(p_class_id,p_exhibition_id,'external');
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id)
            VALUES(p_class_id,p_exhibition_id,'external','confirmed',v_actor),(p_class_id,p_exhibition_id,'external','published',v_actor);
    ELSIF p_action IN('rotate','extend') THEN
        IF v_share.id IS NULL OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=now() THEN RAISE EXCEPTION '외부 공개본을 먼저 발행해 주세요.' USING ERRCODE='22023'; END IF;
        UPDATE public.class_agit_external_shares SET token_hash=CASE WHEN p_action='rotate' THEN v_hash ELSE token_hash END,
            expires_at=v_end,revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','renewed',v_actor);
    ELSIF p_action='revoke' THEN
        UPDATE public.class_agit_external_shares SET revoked_at=COALESCE(revoked_at,now()),revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        IF NOT FOUND THEN RAISE EXCEPTION '공개본을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','revoked',v_actor);
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_external_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND share_id=v_share.id AND id=(p_payload->>'item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION '공개 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_external_shares SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'external','withdrawn',v_actor);
    ELSE RAISE EXCEPTION '지원하지 않는 공유 동작입니다.' USING ERRCODE='22023'; END IF;
    RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id);
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;

REVOKE ALL ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_class_agit_source_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
           AND NEW.recalled_at IS NULL AND NEW.writing_context='assignment' AND NEW.visibility='class' AND NEW.class_id=OLD.class_id
            AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id AND NEW.mission_id IS NOT DISTINCT FROM OLD.mission_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_items SET revoked_at=clock_timestamp()
            WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING class_id,id LOOP
            INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v_item.class_id,v_item.id,'source_unavailable');
        END LOOP;
    ELSE
        IF TG_OP='UPDATE' AND NEW.is_active IS DISTINCT FROM FALSE AND NEW.deleted_at IS NULL AND NEW.class_id=OLD.class_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_items SET revoked_at=clock_timestamp()
            WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING class_id,id LOOP
            INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v_item.class_id,v_item.id,'source_unavailable');
        END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.revoke_class_agit_source_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.revoke_class_agit_releases_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
            AND NEW.recalled_at IS NULL AND NEW.writing_context='assignment' AND NEW.visibility='class' AND NEW.class_id=OLD.class_id
            AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id AND NEW.mission_id IS NOT DISTINCT FROM OLD.mission_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_book_items SET revoked_at=now() WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'anthology','source_unavailable'); END LOOP;
        FOR v_item IN UPDATE public.class_agit_external_items SET revoked_at=now() WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'external','source_unavailable'); END LOOP;
    ELSE
        IF TG_OP='UPDATE' AND NEW.is_active IS DISTINCT FROM FALSE AND NEW.deleted_at IS NULL AND NEW.class_id=OLD.class_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_book_items SET revoked_at=now() WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'anthology','source_unavailable'); END LOOP;
        FOR v_item IN UPDATE public.class_agit_external_items SET revoked_at=now() WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'external','source_unavailable'); END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.revoke_class_agit_releases_v1() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS class_agit_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_post_revoke BEFORE DELETE OR UPDATE OF is_submitted,is_confirmed,is_returned,recalled_at,visibility,writing_context,class_id,student_id,mission_id
ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_source_v1();

DROP TRIGGER IF EXISTS class_agit_release_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_release_post_revoke BEFORE DELETE OR UPDATE OF is_submitted,is_confirmed,is_returned,recalled_at,visibility,writing_context,class_id,student_id,mission_id
ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_releases_v1();

-- Mission deletion or a different class breaks provenance. Ordinary title/template/body edits
-- do not rewrite or hide a frozen edition; explicit withdrawal/privacy changes still revoke it.
CREATE OR REPLACE FUNCTION public.class_agit_revoke_mission_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF TG_OP='UPDATE' AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN RETURN NEW; END IF;
    UPDATE public.class_agit_items i SET revoked_at=clock_timestamp() FROM public.student_posts p
        WHERE i.class_id=OLD.class_id AND p.class_id=i.class_id AND p.id=i.post_id AND p.mission_id=OLD.id AND i.revoked_at IS NULL;
    UPDATE public.class_agit_external_items i SET revoked_at=clock_timestamp() FROM public.student_posts p
        WHERE i.class_id=OLD.class_id AND p.class_id=i.class_id AND p.id=i.post_id AND p.mission_id=OLD.id AND i.revoked_at IS NULL;
    UPDATE public.class_agit_book_items i SET revoked_at=clock_timestamp() FROM public.student_posts p
        WHERE i.class_id=OLD.class_id AND p.class_id=i.class_id AND p.id=i.post_id AND p.mission_id=OLD.id AND i.revoked_at IS NULL;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_revoke_mission_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_mission_revoke ON public.writing_missions;
CREATE TRIGGER class_agit_mission_revoke BEFORE DELETE OR UPDATE OF class_id ON public.writing_missions
FOR EACH ROW EXECUTE FUNCTION public.class_agit_revoke_mission_v1();

-- STABLE readers use one MVCC snapshot for gate, catalog, slots and body; no content locks/writes.
-- https://www.postgresql.org/docs/17/xfunc-volatility.html
CREATE OR REPLACE FUNCTION public.get_my_class_agit_exhibitions_v1()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_items JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.published_at DESC,q.id DESC),'[]') INTO v_items FROM (
        SELECT e.id,c.title,c.introduction,e.publication_no,e.published_at FROM public.class_agit_exhibitions e
        JOIN public.class_agit_publication_catalog c ON c.class_id=e.class_id AND c.exhibition_id=e.id AND c.scope='class' AND c.publication_no=e.publication_no
        WHERE e.class_id=v_class AND e.state='published' ORDER BY e.published_at DESC,e.id DESC LIMIT 20
    ) q;
    RETURN jsonb_build_object('version',1,'exhibitions',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_exhibitions_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_exhibitions_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=v_class AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.display_position),'[]') INTO v_items FROM (
        SELECT s.summary,s.display_position FROM public.class_agit_publication_slots s
        WHERE s.class_id=v_class AND s.exhibition_id=p_exhibition_id AND s.scope='class' AND s.room_no=p_room
        ORDER BY s.display_position LIMIT 12) q;
    RETURN jsonb_build_object('version',1,'exhibition_id',p_exhibition_id,'publication_no',v_catalog.publication_no,
        'title',v_catalog.title,'introduction',v_catalog.introduction,'room',p_room,'rooms',v_catalog.rooms,
        'total_count',v_catalog.total_count,'visibility_revision',v_catalog.visibility_revision,'items',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_work_v1(p_exhibition_id UUID,p_publication_no INTEGER,p_work_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_work JSONB; v_previous TEXT; v_next TEXT; v_no INTEGER;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_work_id IS NULL OR NOT public.class_agit_valid_work_id_v1(p_work_id) THEN RAISE EXCEPTION '작품 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    v_no:=substring(p_work_id FROM 11)::INTEGER;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=v_class AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_publication_no IS DISTINCT FROM v_catalog.publication_no THEN RAISE EXCEPTION '전시가 새로 바뀌었어요. 전시실에서 작품을 다시 골라 주세요.' USING ERRCODE='PT409'; END IF;
    SELECT i.summary||jsonb_build_object('id',p_work_id,'blocks',i.blocks) INTO v_work
        FROM public.class_agit_published_items i WHERE i.class_id=v_class AND i.exhibition_id=p_exhibition_id
        AND i.publication_no=p_publication_no AND i.work_no=v_no AND i.revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    SELECT 'published-'||max(s.work_no) FILTER(WHERE s.work_no<v_no),'published-'||min(s.work_no) FILTER(WHERE s.work_no>v_no)
        INTO v_previous,v_next FROM public.class_agit_publication_slots s
        WHERE s.class_id=v_class AND s.exhibition_id=p_exhibition_id AND s.scope='class';
    RETURN jsonb_build_object('version',1,'publication_no',v_catalog.publication_no,'visibility_revision',v_catalog.visibility_revision,
        'previous_id',v_previous,'next_id',v_next,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND public.class_agit_class_is_open_v1(c.id)
        AND (c.teacher_id=auth.uid() OR EXISTS(SELECT 1 FROM public.students s WHERE s.class_id=c.id AND s.auth_id=auth.uid()
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE))) THEN RAISE EXCEPTION '이 학급 전시를 볼 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_room IS NULL OR p_room NOT BETWEEN 1 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '공개 중인 전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(q.work ORDER BY q.display_position),'[]') INTO v_items FROM (
        SELECT s.summary||jsonb_build_object('blocks',i.blocks) AS work,s.display_position FROM public.class_agit_publication_slots s
        JOIN public.class_agit_published_items i ON i.class_id=s.class_id AND i.exhibition_id=s.exhibition_id AND i.work_no=s.work_no
        WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope='class' AND s.room_no=p_room
        ORDER BY s.display_position LIMIT 12) q;
    RETURN jsonb_build_object('version',1,'publication_no',v_catalog.publication_no,'room',p_room,'room_count',GREATEST(1,jsonb_array_length(v_catalog.rooms)),
        'total_count',v_catalog.total_count,'blocked_count',v_catalog.original_count-v_catalog.total_count,
        'exhibition',jsonb_build_object('title',v_catalog.title,'introduction',v_catalog.introduction,'audience','class','works',v_items));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) TO authenticated;

-- Removed after checking repository, four external deployed apps, DB consumers and RLS (2026-09-05).
-- The two DB consumers above now read independent frozen rows. No browser role ever had access.
DROP FUNCTION IF EXISTS public.class_agit_visible_works_v1(UUID,UUID);

-- First, very short budget transaction. The Edge gateway is the only exposed caller.
CREATE OR REPLACE FUNCTION public.take_class_agit_public_read_budget_v1(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='1s' SET lock_timeout='500ms' AS $$
DECLARE v_id UUID;
BEGIN
    IF NOT public.class_agit_take_public_budget_v1('global',3000) THEN RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT s.id INTO v_id FROM public.class_agit_external_shares s WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
        AND s.revoked_at IS NULL AND s.starts_at<=statement_timestamp() AND s.expires_at>statement_timestamp();
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF NOT public.class_agit_take_public_budget_v1('share:'||v_id,600) THEN RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    RETURN jsonb_build_object('version',1,'allowed',TRUE);
END; $$;
REVOKE ALL ON FUNCTION public.take_class_agit_public_read_budget_v1(TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.take_class_agit_public_read_budget_v1(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER DEFAULT 0,p_work_id TEXT DEFAULT NULL,p_publication_no INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET statement_timeout='3s' SET lock_timeout='1s' AS $$
DECLARE v_share RECORD; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB:='[]'; v_work JSONB;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12)
        OR (p_work_id IS NOT NULL AND NOT public.class_agit_valid_work_id_v1(p_work_id)) THEN
        RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT s.id,s.class_id,s.publication_no,s.starts_at,s.expires_at INTO v_share FROM public.class_agit_external_shares s
        WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND s.revoked_at IS NULL
        AND s.starts_at<=statement_timestamp() AND s.expires_at>statement_timestamp() AND public.class_agit_class_is_allowed_v1(s.class_id)
        AND EXISTS(SELECT 1 FROM public.class_agit_rollout WHERE singleton AND external_enabled);
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c WHERE c.class_id=v_share.class_id AND c.exhibition_id=v_share.id
        AND c.scope='external' AND c.publication_no=v_share.publication_no;
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF p_work_id IS NOT NULL AND p_publication_no IS DISTINCT FROM v_share.publication_no THEN RETURN jsonb_build_object('version',1,'error','changed'); END IF;
    IF p_work_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.display_position),'[]') INTO v_items FROM (
            SELECT s.summary,s.display_position FROM public.class_agit_publication_slots s
            WHERE s.class_id=v_share.class_id AND s.exhibition_id=v_share.id AND s.scope='external' AND s.room_no=p_room
            ORDER BY s.display_position LIMIT 12) q;
    ELSE
        SELECT i.snapshot||jsonb_build_object('id',p_work_id) INTO v_work FROM public.class_agit_external_items i
            WHERE i.class_id=v_share.class_id AND i.share_id=v_share.id AND i.position=substring(p_work_id FROM 11)::INTEGER AND i.revoked_at IS NULL;
        IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    END IF;
    RETURN jsonb_build_object('version',1,'title',v_catalog.title,'introduction',v_catalog.introduction,'publication_no',v_share.publication_no,
        'room',p_room,'total_count',v_catalog.total_count,'rooms',v_catalog.rooms,'visibility_revision',v_catalog.visibility_revision,
        'starts_at',v_share.starts_at,'expires_at',v_share.expires_at,'server_now',statement_timestamp(),'items',v_items,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) TO service_role;
-- A multi-post UPDATE revokes all affected entries and rebuilds each catalog once.
-- BEFORE DELETE stays in place because the FK later nulls source IDs.
DROP TRIGGER IF EXISTS class_agit_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_post_revoke BEFORE DELETE ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_source_v1();
DROP TRIGGER IF EXISTS class_agit_release_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_release_post_revoke BEFORE DELETE ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_releases_v1();
CREATE OR REPLACE FUNCTION public.class_agit_revoke_changed_posts_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v RECORD;
BEGIN
    FOR v IN UPDATE public.class_agit_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE OR n.recalled_at IS NOT NULL
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v.class_id,v.id,'source_unavailable');
    END LOOP;
    FOR v IN UPDATE public.class_agit_external_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE OR n.recalled_at IS NOT NULL
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(v.class_id,v.id,'external','source_unavailable');
    END LOOP;
    FOR v IN UPDATE public.class_agit_book_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE OR n.recalled_at IS NOT NULL
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(v.class_id,v.id,'anthology','source_unavailable');
    END LOOP;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_revoke_changed_posts_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_post_change_revoke ON public.student_posts;
CREATE TRIGGER class_agit_post_change_revoke AFTER UPDATE ON public.student_posts
REFERENCING OLD TABLE AS old_posts NEW TABLE AS new_posts FOR EACH STATEMENT EXECUTE FUNCTION public.class_agit_revoke_changed_posts_v1();

NOTIFY pgrst,'reload schema';
COMMIT;
